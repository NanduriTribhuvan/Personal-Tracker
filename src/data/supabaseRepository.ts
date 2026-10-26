import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_SETTINGS,
  type BankrollTransaction,
  type Bet,
  type BetInput,
  type BetStatus,
  type BetType,
  type CurrencyCode,
  type DateFormat,
  type Profile,
  type TransactionInput,
  type TransactionType,
  type UserSettings,
} from '../types';
import type { BackupPayload } from '../lib/validation';
import { assertValidBet } from './localRepository';
import type { DataRepository } from './types';

/** Row shapes as returned by PostgREST (numeric columns arrive as numbers or strings). */
interface BetRow {
  id: string;
  user_id: string;
  bet_name: string;
  sport: string;
  league: string | null;
  event: string | null;
  bet_type: string;
  stake: number | string;
  odds: number | string;
  status: string;
  cashout_amount: number | string | null;
  bookmaker: string | null;
  reference_id: string | null;
  notes: string | null;
  tags: string[] | null;
  bet_date: string;
  settled_at: string | null;
  created_at: string;
  updated_at: string;
}

interface TransactionRow {
  id: string;
  user_id: string;
  type: string;
  amount: number | string;
  occurred_at: string;
  description: string | null;
  created_at: string;
}

interface ProfileRow {
  id: string;
  username: string;
  currency: string;
  date_format: string;
  odds_precision: number;
  default_stake: number | string | null;
  default_status: string;
  dashboard_range: string;
  stake_warning_enabled: boolean;
  stake_warning_percent: number | string;
  created_at: string;
}

const BET_COLUMNS =
  'id,user_id,bet_name,sport,league,event,bet_type,stake,odds,status,cashout_amount,bookmaker,reference_id,notes,tags,bet_date,settled_at,created_at,updated_at';
const TX_COLUMNS = 'id,user_id,type,amount,occurred_at,description,created_at';
const PAGE = 1000;

const num = (v: number | string) => Number(v);
const numOrNull = (v: number | string | null) => (v === null ? null : Number(v));

export function rowToBet(r: BetRow): Bet {
  return {
    id: r.id,
    userId: r.user_id,
    betName: r.bet_name,
    sport: r.sport,
    league: r.league,
    event: r.event,
    betType: r.bet_type as BetType,
    stake: num(r.stake),
    odds: num(r.odds),
    status: r.status as BetStatus,
    cashoutAmount: numOrNull(r.cashout_amount),
    bookmaker: r.bookmaker,
    referenceId: r.reference_id,
    notes: r.notes,
    tags: r.tags ?? [],
    betDate: new Date(r.bet_date).toISOString(),
    settledAt: r.settled_at ? new Date(r.settled_at).toISOString() : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function betToRow(b: BetInput) {
  return {
    bet_name: b.betName,
    sport: b.sport,
    league: b.league,
    event: b.event,
    bet_type: b.betType,
    stake: b.stake,
    odds: b.odds,
    status: b.status,
    cashout_amount: b.status === 'cashed_out' ? b.cashoutAmount : null,
    bookmaker: b.bookmaker,
    reference_id: b.referenceId,
    notes: b.notes,
    tags: b.tags,
    bet_date: b.betDate,
  };
}

function rowToTx(r: TransactionRow): BankrollTransaction {
  return {
    id: r.id,
    userId: r.user_id,
    type: r.type as TransactionType,
    amount: num(r.amount),
    occurredAt: new Date(r.occurred_at).toISOString(),
    description: r.description,
    createdAt: r.created_at,
  };
}

function rowToSettings(r: ProfileRow): UserSettings {
  return {
    currency: r.currency as CurrencyCode,
    dateFormat: r.date_format as DateFormat,
    oddsPrecision: r.odds_precision === 3 ? 3 : 2,
    defaultStake: numOrNull(r.default_stake),
    defaultStatus: r.default_status as BetStatus,
    dashboardRange: (r.dashboard_range as UserSettings['dashboardRange']) ?? DEFAULT_SETTINGS.dashboardRange,
    stakeWarningEnabled: r.stake_warning_enabled,
    stakeWarningPercent: num(r.stake_warning_percent),
  };
}

function settingsToRow(s: UserSettings) {
  return {
    currency: s.currency,
    date_format: s.dateFormat,
    odds_precision: s.oddsPrecision,
    default_stake: s.defaultStake,
    default_status: s.defaultStatus,
    dashboard_range: s.dashboardRange,
    stake_warning_enabled: s.stakeWarningEnabled,
    stake_warning_percent: s.stakeWarningPercent,
  };
}

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(friendlyDbError(res.error.message));
  if (res.data === null) throw new Error('Record not found.');
  return res.data;
}

function friendlyDbError(message: string): string {
  if (/bankroll_transactions_one_initial_idx/.test(message)) return 'An initial bankroll already exists. Edit it instead.';
  if (/bets_cashout_consistency/.test(message)) return 'A cashed-out bet needs a cash-out amount.';
  if (/violates check constraint/.test(message)) return 'Some values are invalid. Check the form and try again.';
  if (/JWT|jwt|not authenticated/i.test(message)) return 'Your session has expired. Please sign in again.';
  if (/Failed to fetch|NetworkError/i.test(message)) return 'Network error — check your connection and try again.';
  return message;
}

/**
 * Supabase-backed repository. Row-level security on every table guarantees
 * the queries below can only ever return or modify the caller's own rows;
 * the explicit user_id filters are defence in depth and help the planner use
 * the (user_id, …) indexes.
 */
export class SupabaseRepository implements DataRepository {
  constructor(
    private readonly client: SupabaseClient,
    readonly userId: string,
  ) {}

  async getProfile(): Promise<Profile> {
    const row = check(
      await this.client
        .from('profiles')
        .select('id,username,currency,date_format,odds_precision,default_stake,default_status,dashboard_range,stake_warning_enabled,stake_warning_percent,created_at')
        .eq('id', this.userId)
        .single<ProfileRow>(),
    );
    return { id: row.id, username: row.username, createdAt: row.created_at, settings: rowToSettings(row) };
  }

  async updateSettings(settings: UserSettings): Promise<UserSettings> {
    const row = check(
      await this.client
        .from('profiles')
        .update(settingsToRow(settings))
        .eq('id', this.userId)
        .select('id,username,currency,date_format,odds_precision,default_stake,default_status,dashboard_range,stake_warning_enabled,stake_warning_percent,created_at')
        .single<ProfileRow>(),
    );
    return rowToSettings(row);
  }

  async listBets(): Promise<Bet[]> {
    const out: Bet[] = [];
    for (let from = 0; ; from += PAGE) {
      const rows = check(
        await this.client
          .from('bets')
          .select(BET_COLUMNS)
          .eq('user_id', this.userId)
          .order('bet_date', { ascending: false })
          .order('id')
          .range(from, from + PAGE - 1)
          .returns<BetRow[]>(),
      );
      out.push(...rows.map(rowToBet));
      if (rows.length < PAGE) break;
    }
    return out;
  }

  async createBet(input: BetInput): Promise<Bet> {
    assertValidBet(input);
    const row = check(
      await this.client.from('bets').insert({ ...betToRow(input), user_id: this.userId }).select(BET_COLUMNS).single<BetRow>(),
    );
    return rowToBet(row);
  }

  async updateBet(id: string, input: BetInput): Promise<Bet> {
    assertValidBet(input);
    const row = check(
      await this.client.from('bets').update(betToRow(input)).eq('id', id).eq('user_id', this.userId).select(BET_COLUMNS).single<BetRow>(),
    );
    return rowToBet(row);
  }

  async deleteBet(id: string): Promise<void> {
    const res = await this.client.from('bets').delete().eq('id', id).eq('user_id', this.userId).select('id');
    if (res.error) throw new Error(friendlyDbError(res.error.message));
    if (!res.data?.length) throw new Error('Bet not found.');
  }

  async listTransactions(): Promise<BankrollTransaction[]> {
    const out: BankrollTransaction[] = [];
    for (let from = 0; ; from += PAGE) {
      const rows = check(
        await this.client
          .from('bankroll_transactions')
          .select(TX_COLUMNS)
          .eq('user_id', this.userId)
          .order('occurred_at')
          .order('id')
          .range(from, from + PAGE - 1)
          .returns<TransactionRow[]>(),
      );
      out.push(...rows.map(rowToTx));
      if (rows.length < PAGE) break;
    }
    return out;
  }

  async createTransaction(input: TransactionInput): Promise<BankrollTransaction> {
    const row = check(
      await this.client
        .from('bankroll_transactions')
        .insert({ type: input.type, amount: input.amount, occurred_at: input.occurredAt, description: input.description, user_id: this.userId })
        .select(TX_COLUMNS)
        .single<TransactionRow>(),
    );
    return rowToTx(row);
  }

  async updateTransaction(id: string, input: TransactionInput): Promise<BankrollTransaction> {
    const row = check(
      await this.client
        .from('bankroll_transactions')
        .update({ type: input.type, amount: input.amount, occurred_at: input.occurredAt, description: input.description })
        .eq('id', id)
        .eq('user_id', this.userId)
        .select(TX_COLUMNS)
        .single<TransactionRow>(),
    );
    return rowToTx(row);
  }

  async deleteTransaction(id: string): Promise<void> {
    const res = await this.client.from('bankroll_transactions').delete().eq('id', id).eq('user_id', this.userId).select('id');
    if (res.error) throw new Error(friendlyDbError(res.error.message));
    if (!res.data?.length) throw new Error('Transaction not found.');
  }

  async importBackup(payload: BackupPayload, mode: 'merge' | 'replace') {
    // Validate everything before touching the database.
    const betRows = payload.bets.map((b) => {
      const input: BetInput = {
        betName: b.betName,
        sport: b.sport,
        league: b.league,
        event: b.event,
        betType: b.betType,
        stake: b.stake,
        odds: b.odds,
        status: b.status,
        cashoutAmount: b.status === 'cashed_out' ? b.cashoutAmount : null,
        bookmaker: b.bookmaker,
        referenceId: b.referenceId ?? null,
        notes: b.notes,
        tags: b.tags,
        betDate: b.betDate,
      };
      assertValidBet(input);
      return { id: b.id, user_id: this.userId, ...betToRow(input) };
    });
    const txRows = payload.transactions.map((t) => ({
      id: t.id,
      user_id: this.userId,
      type: t.type,
      amount: t.amount,
      occurred_at: t.occurredAt,
      description: t.description,
    }));

    if (mode === 'replace') {
      const d1 = await this.client.from('bets').delete().eq('user_id', this.userId);
      if (d1.error) throw new Error(friendlyDbError(d1.error.message));
      const d2 = await this.client.from('bankroll_transactions').delete().eq('user_id', this.userId);
      if (d2.error) throw new Error(friendlyDbError(d2.error.message));
    }
    for (let i = 0; i < betRows.length; i += 500) {
      const r = await this.client.from('bets').upsert(betRows.slice(i, i + 500), { onConflict: 'id' });
      if (r.error) throw new Error(friendlyDbError(r.error.message));
    }
    for (let i = 0; i < txRows.length; i += 500) {
      const r = await this.client.from('bankroll_transactions').upsert(txRows.slice(i, i + 500), { onConflict: 'id' });
      if (r.error) throw new Error(friendlyDbError(r.error.message));
    }
    if (payload.settings) {
      const current = await this.getProfile();
      await this.updateSettings({ ...current.settings, ...payload.settings });
    }
    return { bets: betRows.length, transactions: txRows.length };
  }
}
