import type { Bet, BetStatus } from '../types';

let n = 0;

/** Build a bet with sensible defaults; each call gets a later date. */
export function makeBet(p: Partial<Bet> & { status: BetStatus }): Bet {
  n++;
  const date = p.betDate ?? new Date(Date.UTC(2026, 0, 1) + n * 3_600_000).toISOString();
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    userId: 'u1',
    betName: `Bet ${n}`,
    sport: 'Cricket',
    league: null,
    event: null,
    betType: 'moneyline',
    stake: 100,
    odds: 2,
    cashoutAmount: null,
    bookmaker: null,
    referenceId: null,
    notes: null,
    tags: [],
    settledAt: null,
    createdAt: date,
    updatedAt: date,
    ...p,
    betDate: date,
  };
}
