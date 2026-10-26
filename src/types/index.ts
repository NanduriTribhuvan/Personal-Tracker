export const BET_STATUSES = [
  'pending',
  'won',
  'lost',
  'void',
  'half_won',
  'half_lost',
  'cashed_out',
] as const;
export type BetStatus = (typeof BET_STATUSES)[number];

export const BET_TYPES = [
  'moneyline',
  'spread',
  'over_under',
  'player_props',
  'parlay',
  'live',
  'futures',
  'other',
] as const;
export type BetType = (typeof BET_TYPES)[number];

export const TRANSACTION_TYPES = ['initial', 'deposit', 'withdrawal'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'NZD', 'ZAR', 'NGN', 'KES', 'BRL', 'JPY'] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

export const DATE_FORMATS = ['dd MMM yyyy', 'dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd'] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

export const DATE_RANGE_PRESETS = [
  'today',
  'last7',
  'last30',
  'thisMonth',
  'lastMonth',
  'ytd',
  'all',
  'custom',
] as const;
export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number];

/** A bet exactly as persisted. Monetary values are in major units (e.g. rupees) with 2 dp. */
export interface Bet {
  id: string;
  userId: string;
  betName: string;
  sport: string;
  league: string | null;
  event: string | null;
  betType: BetType;
  stake: number;
  odds: number;
  status: BetStatus;
  cashoutAmount: number | null;
  bookmaker: string | null;
  referenceId: string | null;
  notes: string | null;
  tags: string[];
  /** ISO-8601 UTC timestamp of when the bet was placed. */
  betDate: string;
  /** ISO-8601 UTC timestamp of when the bet was last settled (null while pending). */
  settledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Fields the user controls when creating or editing a bet. */
export type BetInput = Omit<Bet, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'settledAt'>;

export interface BankrollTransaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  occurredAt: string;
  description: string | null;
  createdAt: string;
}

export type TransactionInput = Omit<BankrollTransaction, 'id' | 'userId' | 'createdAt'>;

export interface UserSettings {
  currency: CurrencyCode;
  dateFormat: DateFormat;
  oddsPrecision: 2 | 3;
  defaultStake: number | null;
  defaultStatus: BetStatus;
  dashboardRange: Exclude<DateRangePreset, 'custom'>;
  stakeWarningEnabled: boolean;
  stakeWarningPercent: number;
}

export interface Profile {
  id: string;
  username: string;
  createdAt: string;
  settings: UserSettings;
}

export const DEFAULT_SETTINGS: UserSettings = {
  currency: 'INR',
  dateFormat: 'dd MMM yyyy',
  oddsPrecision: 2,
  defaultStake: null,
  defaultStatus: 'pending',
  dashboardRange: 'all',
  stakeWarningEnabled: false,
  stakeWarningPercent: 5,
};

export interface DateRange {
  preset: DateRangePreset;
  /** Inclusive start (local time). null = unbounded. */
  from: Date | null;
  /** Inclusive end (local time). null = unbounded. */
  to: Date | null;
}

export interface BackupFile {
  app: 'edgetrack';
  version: 1;
  exportedAt: string;
  settings: UserSettings;
  bets: Bet[];
  transactions: BankrollTransaction[];
}
