import * as React from 'react';
import type { DataRepository } from '@/data';
import type { BackupPayload } from '@/lib/validation';
import {
  DEFAULT_SETTINGS,
  type BankrollTransaction,
  type Bet,
  type BetInput,
  type Profile,
  type TransactionInput,
  type UserSettings,
} from '@/types';
import { useAuth } from './AuthContext';

interface DataContextValue {
  loading: boolean;
  error: string | null;
  profile: Profile | null;
  settings: UserSettings;
  bets: Bet[];
  transactions: BankrollTransaction[];
  reload: () => Promise<void>;
  createBet: (input: BetInput) => Promise<Bet>;
  updateBet: (id: string, input: BetInput) => Promise<Bet>;
  deleteBet: (id: string) => Promise<void>;
  createTransaction: (input: TransactionInput) => Promise<BankrollTransaction>;
  updateTransaction: (id: string, input: TransactionInput) => Promise<BankrollTransaction>;
  deleteTransaction: (id: string) => Promise<void>;
  updateSettings: (settings: UserSettings) => Promise<void>;
  importBackup: (payload: BackupPayload, mode: 'merge' | 'replace') => Promise<{ bets: number; transactions: number }>;
}

const DataContext = React.createContext<DataContextValue | null>(null);

const byDateDesc = (a: Bet, b: Bet) => b.betDate.localeCompare(a.betDate) || b.createdAt.localeCompare(a.createdAt);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { user, service } = useAuth();
  const repo = React.useMemo<DataRepository | null>(() => (user ? service.createRepository(user) : null), [user, service]);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [bets, setBets] = React.useState<Bet[]>([]);
  const [transactions, setTransactions] = React.useState<BankrollTransaction[]>([]);

  const reload = React.useCallback(async () => {
    if (!repo) return;
    setLoading(true);
    setError(null);
    try {
      const [p, b, t] = await Promise.all([repo.getProfile(), repo.listBets(), repo.listTransactions()]);
      setProfile(p);
      setBets([...b].sort(byDateDesc));
      setTransactions(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your data.');
    } finally {
      setLoading(false);
    }
  }, [repo]);

  React.useEffect(() => {
    setProfile(null);
    setBets([]);
    setTransactions([]);
    void reload();
  }, [reload]);

  const need = React.useCallback(() => {
    if (!repo) throw new Error('Not signed in.');
    return repo;
  }, [repo]);

  const value = React.useMemo<DataContextValue>(
    () => ({
      loading,
      error,
      profile,
      settings: profile?.settings ?? DEFAULT_SETTINGS,
      bets,
      transactions,
      reload,
      createBet: async (input) => {
        const bet = await need().createBet(input);
        setBets((prev) => [bet, ...prev].sort(byDateDesc));
        return bet;
      },
      updateBet: async (id, input) => {
        const bet = await need().updateBet(id, input);
        setBets((prev) => prev.map((b) => (b.id === id ? bet : b)).sort(byDateDesc));
        return bet;
      },
      deleteBet: async (id) => {
        await need().deleteBet(id);
        setBets((prev) => prev.filter((b) => b.id !== id));
      },
      createTransaction: async (input) => {
        const tx = await need().createTransaction(input);
        setTransactions((prev) => [...prev, tx]);
        return tx;
      },
      updateTransaction: async (id, input) => {
        const tx = await need().updateTransaction(id, input);
        setTransactions((prev) => prev.map((t) => (t.id === id ? tx : t)));
        return tx;
      },
      deleteTransaction: async (id) => {
        await need().deleteTransaction(id);
        setTransactions((prev) => prev.filter((t) => t.id !== id));
      },
      updateSettings: async (settings) => {
        const saved = await need().updateSettings(settings);
        setProfile((p) => (p ? { ...p, settings: saved } : p));
      },
      importBackup: async (payload, mode) => {
        const result = await need().importBackup(payload, mode);
        await reload();
        return result;
      },
    }),
    [loading, error, profile, bets, transactions, reload, need],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = React.useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
