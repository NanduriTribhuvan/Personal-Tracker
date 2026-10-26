import * as React from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, type Location } from 'react-router-dom';
import { Toaster } from 'sonner';
import { BetActionsProvider } from './components/bets/BetActionsProvider';
import { AppLayout } from './components/layout/AppLayout';
import { LogoMark } from './components/Logo';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { DateRangeProvider } from './context/DateRangeContext';
import type { AuthService } from './data';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { BankrollPage } from './pages/BankrollPage';
import { BetsPage } from './pages/BetsPage';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { SettingsPage } from './pages/SettingsPage';

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center" role="status" aria-label="Loading EdgeTrack">
      <LogoMark className="size-10 animate-pulse" />
    </div>
  );
}

/** Blocks every private route until the user is authenticated. */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Splash />;
  if (status !== 'signedIn') return <Navigate to="/login" replace state={{ from: location }} />;
  return (
    <DataProvider>
      <DateRangeProvider>
        <BetActionsProvider>
          <Outlet />
        </BetActionsProvider>
      </DateRangeProvider>
    </DataProvider>
  );
}

function PublicOnly() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Splash />;
  if (status === 'signedIn') {
    const from = (location.state as { from?: Location } | null)?.from?.pathname;
    return <Navigate to={from && from !== '/login' ? from : '/'} replace />;
  }
  return <LoginPage />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<OverviewPage />} />
          <Route path="bets" element={<BetsPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="bankroll" element={<BankrollPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App({ service }: { service?: AuthService }) {
  return (
    <React.StrictMode>
      <AuthProvider service={service}>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
        <Toaster
          theme="dark"
          position="top-center"
          offset={16}
          toastOptions={{
            classNames: {
              toast: '!bg-elevated !border-border-strong !text-foreground !rounded-xl',
              description: '!text-muted-foreground',
            },
          }}
        />
      </AuthProvider>
    </React.StrictMode>
  );
}
