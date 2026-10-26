import type { BankrollTransaction, Bet, BetInput, Profile, TransactionInput, UserSettings } from '../types';
import type { BackupPayload } from '../lib/validation';

/**
 * Persistence boundary. Every implementation must scope all reads and writes
 * to the signed-in user — the Supabase implementation relies on RLS, the
 * local implementation on per-user storage namespaces.
 */
export interface DataRepository {
  readonly userId: string;
  getProfile(): Promise<Profile>;
  updateSettings(settings: UserSettings): Promise<UserSettings>;

  listBets(): Promise<Bet[]>;
  createBet(input: BetInput): Promise<Bet>;
  updateBet(id: string, input: BetInput): Promise<Bet>;
  deleteBet(id: string): Promise<void>;

  listTransactions(): Promise<BankrollTransaction[]>;
  createTransaction(input: TransactionInput): Promise<BankrollTransaction>;
  updateTransaction(id: string, input: TransactionInput): Promise<BankrollTransaction>;
  deleteTransaction(id: string): Promise<void>;

  /** Restore a backup. 'merge' upserts by id; 'replace' wipes existing data first. */
  importBackup(payload: BackupPayload, mode: 'merge' | 'replace'): Promise<{ bets: number; transactions: number }>;
}

export interface AuthUser {
  id: string;
  username: string;
}

export type AuthMode = 'supabase' | 'local';

export interface AuthService {
  readonly mode: AuthMode;
  /** Restore a persisted session, or null if signed out / expired. */
  getCurrentUser(): Promise<AuthUser | null>;
  signIn(username: string, password: string): Promise<AuthUser>;
  signOut(): Promise<void>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  /** Subscribe to external session changes (expiry, other tabs). Returns unsubscribe. */
  onChange(listener: (user: AuthUser | null) => void): () => void;
  /** Record activity for idle-timeout purposes. */
  touch(): void;
  /** Local mode only: whether an account must be created first. */
  needsSetup(): Promise<boolean>;
  /** Local mode only: create the first account. */
  setup(username: string, password: string): Promise<AuthUser>;
  createRepository(user: AuthUser): DataRepository;
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: 'invalid_credentials' | 'locked' | 'network' | 'config' | 'unknown' = 'unknown',
  ) {
    super(message);
    this.name = 'AuthError';
  }
}
