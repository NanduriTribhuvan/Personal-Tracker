import * as React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { BarChart3, HardDrive, LayoutDashboard, ListChecks, LogOut, Plus, Settings, Wallet } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { APP_TAGLINE } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { useBetActions } from '../bets/BetActionsProvider';
import { Logo, LogoMark } from '../Logo';
import { Button } from '../ui/button';
import { ConfirmDialog } from '../ui/dialog';

export const NAV_ITEMS = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/bets', label: 'My Bets', icon: ListChecks },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/bankroll', label: 'Bankroll', icon: Wallet },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const;

export function AppLayout() {
  const { user, signOut, service } = useAuth();
  const { openAdd } = useBetActions();
  const { pathname } = useLocation();
  const [confirmOut, setConfirmOut] = React.useState(false);
  const mainRef = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  // Keyboard shortcut: "n" opens the add-bet form (ignored while typing).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== 'n' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (t.closest('input, textarea, select, [contenteditable], [role="dialog"]')) return;
      e.preventDefault();
      openAdd();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openAdd]);

  return (
    <div className="min-h-dvh lg:pl-64">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-surface/80 backdrop-blur lg:flex">
        <div className="px-5 pb-2 pt-6">
          <Logo />
          <p className="mt-2 text-xs text-subtle-foreground">{APP_TAGLINE}</p>
        </div>
        <div className="px-4 py-4">
          <Button className="w-full" onClick={openAdd} aria-keyshortcuts="n">
            <Plus /> Add bet
            <kbd className="ml-auto rounded border border-primary-foreground/20 px-1.5 text-[10px] font-semibold opacity-70">N</kbd>
          </Button>
        </div>
        <nav aria-label="Main" className="flex-1 space-y-0.5 px-3">
          {NAV_ITEMS.map(({ to, label, icon: Icon, ...rest }) => (
            <NavLink
              key={to}
              to={to}
              end={'end' in rest}
              className={({ isActive }) =>
                cn(
                  'group flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                  isActive ? 'bg-primary-soft text-foreground' : 'text-muted-foreground hover:bg-elevated hover:text-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={cn('size-[18px]', isActive ? 'text-primary' : 'text-subtle-foreground group-hover:text-muted-foreground')} aria-hidden />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-border p-3">
          {service.mode === 'local' && <LocalModeNote />}
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="grid size-8 shrink-0 place-items-center rounded-full bg-elevated text-xs font-semibold uppercase text-primary">
              {user?.username.slice(0, 2)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user?.username}</p>
              <p className="text-[11px] text-subtle-foreground">{service.mode === 'supabase' ? 'Cloud sync' : 'Local mode'}</p>
            </div>
            <Button variant="ghost" size="icon-sm" aria-label="Sign out" onClick={() => setConfirmOut(true)}>
              <LogOut />
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/85 px-4 backdrop-blur-md lg:hidden">
        <div className="flex items-center gap-2">
          <LogoMark className="size-7" />
          <span className="font-semibold tracking-tight">
            Edge<span className="text-primary">Track</span>
          </span>
        </div>
        <div className="flex items-center gap-1">
          <NavLink
            to="/settings"
            aria-label="Settings"
            className={({ isActive }) =>
              cn(
                'grid size-10 place-items-center rounded-lg transition-colors hover:bg-elevated',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )
            }
          >
            <Settings className="size-[18px]" aria-hidden />
          </NavLink>
          <Button variant="ghost" size="icon" aria-label="Sign out" onClick={() => setConfirmOut(true)}>
            <LogOut />
          </Button>
        </div>
      </header>

      <main id="main" ref={mainRef} tabIndex={-1} className="mx-auto w-full max-w-7xl px-4 pb-28 pt-5 outline-none sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
        <MainContent />
      </main>

      {/* Mobile bottom nav with central add button */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur-md safe-bottom lg:hidden"
      >
        <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center px-1">
          {NAV_ITEMS.slice(0, 2).map((item) => (
            <MobileNavItem key={item.to} {...item} />
          ))}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={openAdd}
              aria-label="Add bet"
              className="-mt-6 grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-glow transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Plus className="size-6" strokeWidth={2.5} aria-hidden />
            </button>
          </div>
          {NAV_ITEMS.slice(2, 4).map((item) => (
            <MobileNavItem key={item.to} {...item} />
          ))}
        </div>
      </nav>

      <ConfirmDialog
        open={confirmOut}
        onOpenChange={setConfirmOut}
        title="Sign out?"
        description="You'll need your username and password to sign back in."
        confirmLabel="Sign out"
        onConfirm={signOut}
      />
    </div>
  );
}

function MainContent() {
  const { error, reload } = useData();
  if (error) {
    return (
      <div className="mx-auto max-w-md pt-10">
        <div className="rounded-xl border border-loss/30 bg-card p-6 text-center">
          <p className="font-medium">Couldn't load your data</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <Button className="mt-4" variant="secondary" onClick={reload}>
            Try again
          </Button>
        </div>
      </div>
    );
  }
  return <Outlet />;
}

function MobileNavItem({ to, label, icon: Icon, ...rest }: (typeof NAV_ITEMS)[number]) {
  return (
    <NavLink
      to={to}
      end={'end' in rest}
      className={({ isActive }) =>
        cn(
          'flex h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10.5px] font-medium transition-colors',
          isActive ? 'text-primary' : 'text-muted-foreground active:text-foreground',
        )
      }
    >
      <Icon className="size-5" aria-hidden />
      {label}
    </NavLink>
  );
}

function LocalModeNote() {
  return (
    <div className="mb-2 flex items-start gap-2 rounded-lg border border-warning/20 bg-warning-soft px-2.5 py-2 text-[11px] leading-snug text-warning">
      <HardDrive className="mt-px size-3.5 shrink-0" aria-hidden />
      Data is stored in this browser only. Back up from Settings or connect Supabase.
    </div>
  );
}
