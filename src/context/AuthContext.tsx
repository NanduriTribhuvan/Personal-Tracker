import * as React from 'react';
import { toast } from 'sonner';
import { IDLE_TIMEOUT_MS, getAuthService, type AuthService, type AuthUser } from '@/data';

type Status = 'loading' | 'needsSetup' | 'signedOut' | 'signedIn';

interface AuthContextValue {
  status: Status;
  user: AuthUser | null;
  service: AuthService;
  signIn: (username: string, password: string) => Promise<void>;
  setup: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;

export function AuthProvider({
  children,
  service: injected,
  idleTimeoutMs = IDLE_TIMEOUT_MS,
}: {
  children: React.ReactNode;
  service?: AuthService;
  idleTimeoutMs?: number;
}) {
  const service = React.useMemo(() => injected ?? getAuthService(), [injected]);
  const [status, setStatus] = React.useState<Status>('loading');
  const [user, setUser] = React.useState<AuthUser | null>(null);

  const resolveSignedOut = React.useCallback(async () => {
    setUser(null);
    setStatus((await service.needsSetup()) ? 'needsSetup' : 'signedOut');
  }, [service]);

  // Restore session on load.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const current = await service.getCurrentUser();
        if (cancelled) return;
        if (current) {
          setUser(current);
          setStatus('signedIn');
        } else {
          await resolveSignedOut();
        }
      } catch {
        if (!cancelled) await resolveSignedOut();
      }
    })();
    const unsubscribe = service.onChange((u) => {
      if (!u) void resolveSignedOut();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [service, resolveSignedOut]);

  // Idle timeout — sign out after a period of inactivity.
  React.useEffect(() => {
    if (status !== 'signedIn') return;
    let last = Date.now();
    let lastPersist = 0;
    const onActivity = () => {
      last = Date.now();
      if (last - lastPersist > 30_000) {
        lastPersist = last;
        service.touch();
      }
    };
    for (const e of ACTIVITY_EVENTS) window.addEventListener(e, onActivity, { passive: true });
    const timer = window.setInterval(async () => {
      if (Date.now() - last > idleTimeoutMs) {
        await service.signOut();
        await resolveSignedOut();
        toast.info('Signed out after inactivity', { description: 'Sign in again to continue.' });
      }
    }, 15_000);
    return () => {
      for (const e of ACTIVITY_EVENTS) window.removeEventListener(e, onActivity);
      window.clearInterval(timer);
    };
  }, [status, service, idleTimeoutMs, resolveSignedOut]);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      service,
      signIn: async (username, password) => {
        const u = await service.signIn(username, password);
        setUser(u);
        setStatus('signedIn');
      },
      setup: async (username, password) => {
        const u = await service.setup(username, password);
        setUser(u);
        setStatus('signedIn');
      },
      signOut: async () => {
        await service.signOut();
        await resolveSignedOut();
      },
      changePassword: (current, next) => service.changePassword(current, next),
    }),
    [status, user, service, resolveSignedOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
