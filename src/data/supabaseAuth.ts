import type { SupabaseClient, User } from '@supabase/supabase-js';
import { SupabaseRepository } from './supabaseRepository';
import { AuthError, type AuthService, type AuthUser } from './types';

/**
 * Supabase-backed auth. Username sign-in goes through the `username-login`
 * Edge Function, which maps username → account on the server and returns a
 * normal Supabase session. Sessions persist in localStorage and access tokens
 * auto-refresh; the app additionally signs out after a period of inactivity.
 */
export class SupabaseAuthService implements AuthService {
  readonly mode = 'supabase' as const;
  private usernameCache = new Map<string, string>();

  constructor(
    private readonly client: SupabaseClient,
    private readonly functionsUrl: string,
    private readonly anonKey: string,
  ) {}

  private async toAuthUser(user: User): Promise<AuthUser> {
    const cached = this.usernameCache.get(user.id);
    if (cached) return { id: user.id, username: cached };
    const { data } = await this.client.from('profiles').select('username').eq('id', user.id).maybeSingle<{ username: string }>();
    const username: string = data?.username ?? (user.user_metadata?.username as string | undefined) ?? 'You';
    this.usernameCache.set(user.id, username);
    return { id: user.id, username };
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    const { data } = await this.client.auth.getSession();
    if (!data.session) return null;
    // Validate the session with the server rather than trusting local storage.
    const { data: userData, error } = await this.client.auth.getUser();
    if (error || !userData.user) {
      await this.client.auth.signOut({ scope: 'local' });
      return null;
    }
    return this.toAuthUser(userData.user);
  }

  async signIn(username: string, password: string): Promise<AuthUser> {
    let res: Response;
    try {
      res = await fetch(`${this.functionsUrl}/username-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: this.anonKey, Authorization: `Bearer ${this.anonKey}` },
        body: JSON.stringify({ username: username.trim(), password }),
      });
    } catch {
      throw new AuthError('Could not reach the server. Check your connection.', 'network');
    }
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; error?: string };
    if (res.status === 429) throw new AuthError(body.error ?? 'Too many attempts. Try again later.', 'locked');
    if (res.status === 404) {
      throw new AuthError('Login service is not deployed. See README → "Deploy the username-login function".', 'config');
    }
    if (!res.ok || !body.access_token || !body.refresh_token) {
      throw new AuthError(body.error ?? 'Invalid username or password.', 'invalid_credentials');
    }
    const { data, error } = await this.client.auth.setSession({ access_token: body.access_token, refresh_token: body.refresh_token });
    if (error || !data.user) throw new AuthError(error?.message ?? 'Sign-in failed.');
    return this.toAuthUser(data.user);
  }

  async signOut(): Promise<void> {
    this.usernameCache.clear();
    await this.client.auth.signOut();
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const { data } = await this.client.auth.getUser();
    const email = data.user?.email;
    if (!email) throw new AuthError('Your session has expired. Sign in again.');
    // Re-verify the current password before allowing a change.
    const verify = await this.client.auth.signInWithPassword({ email, password: currentPassword });
    if (verify.error) throw new AuthError('Current password is incorrect.', 'invalid_credentials');
    const { error } = await this.client.auth.updateUser({ password: newPassword });
    if (error) throw new AuthError(error.message);
  }

  onChange(listener: (user: AuthUser | null) => void): () => void {
    const { data } = this.client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) listener(null);
    });
    return () => data.subscription.unsubscribe();
  }

  touch(): void {
    /* Idle timeout is enforced by the AuthProvider timer. */
  }

  async needsSetup(): Promise<boolean> {
    return false;
  }

  async setup(): Promise<AuthUser> {
    throw new AuthError('Accounts are created server-side. See README → "Create your account".', 'config');
  }

  createRepository(user: AuthUser) {
    return new SupabaseRepository(this.client, user.id);
  }
}
