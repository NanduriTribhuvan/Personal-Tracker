/**
 * Local-mode authentication (used only when Supabase isn't configured).
 *
 * - No credentials ship in the code: the first visit asks you to create an
 *   account, and only a salted PBKDF2-SHA256 hash is stored.
 * - Sessions expire after an absolute lifetime and after inactivity.
 * - Repeated failures lock sign-in temporarily.
 *
 * Local mode protects against casual access on a shared device but is NOT a
 * substitute for server-side auth: anyone with full access to this browser
 * profile can read localStorage. Use Supabase mode for real privacy.
 */
import { USERNAME_PATTERN } from '../lib/validation';
import { uuid } from '../lib/utils';
import { LocalRepository, STORAGE_PREFIX } from './localRepository';
import { DEFAULT_ITERATIONS, hashPassword, verifyPassword, type PasswordHash } from './password';
import { AuthError, type AuthService, type AuthUser } from './types';

interface LocalAccount {
  id: string;
  username: string;
  password: PasswordHash;
  createdAt: string;
}

interface LocalSession {
  userId: string;
  issuedAt: number;
  lastActive: number;
}

interface FailureState {
  count: number;
  lockedUntil: number;
}

export interface LocalAuthOptions {
  storage?: Storage;
  iterations?: number;
  idleTimeoutMs?: number;
  maxSessionMs?: number;
  maxFailures?: number;
  lockoutMs?: number;
  now?: () => number;
}

const ACCOUNTS_KEY = `${STORAGE_PREFIX}:accounts`;
const SESSION_KEY = `${STORAGE_PREFIX}:session`;
const FAILURES_KEY = `${STORAGE_PREFIX}:auth-failures`;

export class LocalAuthService implements AuthService {
  readonly mode = 'local' as const;
  private listeners = new Set<(u: AuthUser | null) => void>();
  private readonly storage: Storage;
  private readonly iterations: number;
  private readonly idleTimeoutMs: number;
  private readonly maxSessionMs: number;
  private readonly maxFailures: number;
  private readonly lockoutMs: number;
  private readonly now: () => number;

  constructor(opts: LocalAuthOptions = {}) {
    this.storage = opts.storage ?? localStorage;
    this.iterations = opts.iterations ?? DEFAULT_ITERATIONS;
    this.idleTimeoutMs = opts.idleTimeoutMs ?? 60 * 60_000;
    this.maxSessionMs = opts.maxSessionMs ?? 12 * 60 * 60_000;
    this.maxFailures = opts.maxFailures ?? 5;
    this.lockoutMs = opts.lockoutMs ?? 5 * 60_000;
    this.now = opts.now ?? Date.now;

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === SESSION_KEY) void this.getCurrentUser().then((u) => this.emit(u));
      });
    }
  }

  private accounts(): LocalAccount[] {
    try {
      return JSON.parse(this.storage.getItem(ACCOUNTS_KEY) ?? '[]') as LocalAccount[];
    } catch {
      return [];
    }
  }

  private saveAccounts(accounts: LocalAccount[]) {
    this.storage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  }

  private session(): LocalSession | null {
    try {
      const raw = this.storage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as LocalSession) : null;
    } catch {
      return null;
    }
  }

  private emit(user: AuthUser | null) {
    for (const l of this.listeners) l(user);
  }

  async needsSetup(): Promise<boolean> {
    return this.accounts().length === 0;
  }

  async setup(username: string, password: string): Promise<AuthUser> {
    if (!(await this.needsSetup())) throw new AuthError('An account already exists. Sign in instead.');
    const name = username.trim();
    if (!USERNAME_PATTERN.test(name)) throw new AuthError('Invalid username.');
    if (password.length < 6) throw new AuthError('Password must be at least 6 characters.');
    const account: LocalAccount = {
      id: uuid(),
      username: name,
      password: await hashPassword(password, this.iterations),
      createdAt: new Date(this.now()).toISOString(),
    };
    this.saveAccounts([account]);
    return this.startSession(account);
  }

  private startSession(account: LocalAccount): AuthUser {
    const t = this.now();
    this.storage.setItem(SESSION_KEY, JSON.stringify({ userId: account.id, issuedAt: t, lastActive: t } satisfies LocalSession));
    this.storage.removeItem(FAILURES_KEY);
    return { id: account.id, username: account.username };
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    const s = this.session();
    if (!s) return null;
    const t = this.now();
    if (t - s.issuedAt > this.maxSessionMs || t - s.lastActive > this.idleTimeoutMs) {
      this.storage.removeItem(SESSION_KEY);
      return null;
    }
    const account = this.accounts().find((a) => a.id === s.userId);
    if (!account) {
      this.storage.removeItem(SESSION_KEY);
      return null;
    }
    return { id: account.id, username: account.username };
  }

  async signIn(username: string, password: string): Promise<AuthUser> {
    const failures = this.failures();
    const t = this.now();
    if (failures.lockedUntil > t) {
      const mins = Math.ceil((failures.lockedUntil - t) / 60_000);
      throw new AuthError(`Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`, 'locked');
    }
    const account = this.accounts().find((a) => a.username.toLowerCase() === username.trim().toLowerCase());
    // Always run the KDF so unknown usernames take as long as wrong passwords.
    const ok = account
      ? await verifyPassword(password, account.password)
      : (await hashPassword(password, this.iterations), false);
    if (!account || !ok) {
      const count = failures.count + 1;
      this.storage.setItem(
        FAILURES_KEY,
        JSON.stringify({ count: count >= this.maxFailures ? 0 : count, lockedUntil: count >= this.maxFailures ? t + this.lockoutMs : 0 }),
      );
      throw new AuthError('Invalid username or password.', 'invalid_credentials');
    }
    return this.startSession(account);
  }

  private failures(): FailureState {
    try {
      return JSON.parse(this.storage.getItem(FAILURES_KEY) ?? '') as FailureState;
    } catch {
      return { count: 0, lockedUntil: 0 };
    }
  }

  async signOut(): Promise<void> {
    this.storage.removeItem(SESSION_KEY);
    this.emit(null);
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.getCurrentUser();
    if (!user) throw new AuthError('Your session has expired. Sign in again.');
    const accounts = this.accounts();
    const account = accounts.find((a) => a.id === user.id)!;
    if (!(await verifyPassword(currentPassword, account.password))) {
      throw new AuthError('Current password is incorrect.', 'invalid_credentials');
    }
    account.password = await hashPassword(newPassword, this.iterations);
    this.saveAccounts(accounts);
  }

  onChange(listener: (user: AuthUser | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  touch(): void {
    const s = this.session();
    if (!s) return;
    s.lastActive = this.now();
    this.storage.setItem(SESSION_KEY, JSON.stringify(s));
  }

  createRepository(user: AuthUser) {
    return new LocalRepository(user.id, user.username, this.storage);
  }
}
