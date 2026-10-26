import {
  DEFAULT_SETTINGS,
  type BankrollTransaction,
  type Bet,
  type BetInput,
  type Profile,
  type TransactionInput,
  type UserSettings,
} from '../types';
import type { BackupPayload } from '../lib/validation';
import { roundMoney } from '../lib/money';
import { settleBet } from '../lib/settlement';
import { uuid } from '../lib/utils';
import type { DataRepository } from './types';

export const STORAGE_PREFIX = 'edgetrack:v1';

interface LocalStore {
  username: string;
  createdAt: string;
  settings: UserSettings;
  bets: Bet[];
  transactions: BankrollTransaction[];
}

export function dataKey(userId: string) {
  return `${STORAGE_PREFIX}:data:${userId}`;
}

/** Mirrors the database CHECK constraints so local mode rejects the same data. */
export function assertValidBet(input: BetInput) {
  settleBet(input); // throws on invalid stake/odds/cash-out
  if (input.status !== 'cashed_out' && input.cashoutAmount !== null) {
    throw new Error('Only cashed-out bets can have a cash-out amount.');
  }
  if (!input.betName.trim() || !input.sport.trim()) throw new Error('Bet name and sport are required.');
  if (Number.isNaN(Date.parse(input.betDate))) throw new Error('Invalid bet date.');
}

function normaliseBet(input: BetInput): BetInput {
  return {
    ...input,
    stake: roundMoney(input.stake),
    odds: Math.round(input.odds * 10000) / 10000,
    cashoutAmount: input.cashoutAmount === null ? null : roundMoney(input.cashoutAmount),
    tags: [...input.tags],
  };
}

/**
 * Browser-only persistence used when Supabase isn't configured. Each user's
 * data lives under its own storage key, and every method only ever touches
 * the key for the user this repository was constructed for.
 */
export class LocalRepository implements DataRepository {
  constructor(
    readonly userId: string,
    private readonly username: string,
    private readonly storage: Storage = localStorage,
  ) {}

  private read(): LocalStore {
    const raw = this.storage.getItem(dataKey(this.userId));
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<LocalStore>;
        return {
          username: parsed.username ?? this.username,
          createdAt: parsed.createdAt ?? new Date().toISOString(),
          settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
          bets: Array.isArray(parsed.bets) ? parsed.bets : [],
          transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
        };
      } catch {
        throw new Error('Local data is corrupted. Restore from a backup in Settings.');
      }
    }
    return {
      username: this.username,
      createdAt: new Date().toISOString(),
      settings: { ...DEFAULT_SETTINGS },
      bets: [],
      transactions: [],
    };
  }

  private write(store: LocalStore) {
    try {
      this.storage.setItem(dataKey(this.userId), JSON.stringify(store));
    } catch {
      throw new Error('Browser storage is full. Export a backup and clear old data.');
    }
  }

  async getProfile(): Promise<Profile> {
    const s = this.read();
    return { id: this.userId, username: s.username, createdAt: s.createdAt, settings: s.settings };
  }

  async updateSettings(settings: UserSettings): Promise<UserSettings> {
    const s = this.read();
    s.settings = { ...settings };
    this.write(s);
    return s.settings;
  }

  async listBets(): Promise<Bet[]> {
    return this.read().bets.map((b) => ({ ...b, tags: [...b.tags] }));
  }

  async createBet(input: BetInput): Promise<Bet> {
    assertValidBet(input);
    const s = this.read();
    const now = new Date().toISOString();
    const bet: Bet = {
      ...normaliseBet(input),
      id: uuid(),
      userId: this.userId,
      settledAt: input.status === 'pending' ? null : now,
      createdAt: now,
      updatedAt: now,
    };
    s.bets.push(bet);
    this.write(s);
    return bet;
  }

  async updateBet(id: string, input: BetInput): Promise<Bet> {
    assertValidBet(input);
    const s = this.read();
    const idx = s.bets.findIndex((b) => b.id === id);
    if (idx === -1) throw new Error('Bet not found.');
    const prev = s.bets[idx];
    const now = new Date().toISOString();
    const settledAt =
      input.status === 'pending' ? null : prev.status === input.status && prev.settledAt ? prev.settledAt : now;
    const next: Bet = {
      ...normaliseBet(input),
      id: prev.id,
      userId: prev.userId,
      createdAt: prev.createdAt,
      settledAt,
      updatedAt: now,
    };
    s.bets[idx] = next;
    this.write(s);
    return next;
  }

  async deleteBet(id: string): Promise<void> {
    const s = this.read();
    const before = s.bets.length;
    s.bets = s.bets.filter((b) => b.id !== id);
    if (s.bets.length === before) throw new Error('Bet not found.');
    this.write(s);
  }

  async listTransactions(): Promise<BankrollTransaction[]> {
    return this.read().transactions.map((t) => ({ ...t }));
  }

  private assertTransaction(input: TransactionInput, s: LocalStore, ignoreId?: string) {
    if (!(input.amount > 0)) throw new Error('Amount must be greater than zero.');
    if (input.type === 'initial' && s.transactions.some((t) => t.type === 'initial' && t.id !== ignoreId)) {
      throw new Error('An initial bankroll already exists. Edit it instead.');
    }
  }

  async createTransaction(input: TransactionInput): Promise<BankrollTransaction> {
    const s = this.read();
    this.assertTransaction(input, s);
    const tx: BankrollTransaction = {
      ...input,
      amount: roundMoney(input.amount),
      id: uuid(),
      userId: this.userId,
      createdAt: new Date().toISOString(),
    };
    s.transactions.push(tx);
    this.write(s);
    return tx;
  }

  async updateTransaction(id: string, input: TransactionInput): Promise<BankrollTransaction> {
    const s = this.read();
    const idx = s.transactions.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error('Transaction not found.');
    this.assertTransaction(input, s, id);
    const prev = s.transactions[idx];
    const next: BankrollTransaction = { ...input, amount: roundMoney(input.amount), id, userId: prev.userId, createdAt: prev.createdAt };
    s.transactions[idx] = next;
    this.write(s);
    return next;
  }

  async deleteTransaction(id: string): Promise<void> {
    const s = this.read();
    const before = s.transactions.length;
    s.transactions = s.transactions.filter((t) => t.id !== id);
    if (s.transactions.length === before) throw new Error('Transaction not found.');
    this.write(s);
  }

  async importBackup(payload: BackupPayload, mode: 'merge' | 'replace') {
    const s = this.read();
    const now = new Date().toISOString();
    const bets = new Map((mode === 'replace' ? [] : s.bets).map((b) => [b.id, b]));
    for (const b of payload.bets) {
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
        betDate: new Date(b.betDate).toISOString(),
      };
      assertValidBet(input);
      const prev = bets.get(b.id);
      bets.set(b.id, {
        ...normaliseBet(input),
        id: b.id,
        userId: this.userId,
        settledAt: input.status === 'pending' ? null : (prev?.settledAt ?? now),
        createdAt: prev?.createdAt ?? b.createdAt ?? now,
        updatedAt: now,
      });
    }
    const txs = new Map((mode === 'replace' ? [] : s.transactions).map((t) => [t.id, t]));
    for (const t of payload.transactions) {
      txs.set(t.id, {
        id: t.id,
        userId: this.userId,
        type: t.type,
        amount: roundMoney(t.amount),
        occurredAt: new Date(t.occurredAt).toISOString(),
        description: t.description,
        createdAt: txs.get(t.id)?.createdAt ?? now,
      });
    }
    const initials = [...txs.values()].filter((t) => t.type === 'initial');
    if (initials.length > 1) throw new Error('Backup would create more than one initial bankroll entry.');
    s.bets = [...bets.values()];
    s.transactions = [...txs.values()];
    if (payload.settings) s.settings = { ...s.settings, ...payload.settings };
    this.write(s);
    return { bets: payload.bets.length, transactions: payload.transactions.length };
  }
}
