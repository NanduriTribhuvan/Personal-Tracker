import type { Bet, BetStatus, BetType } from '../types';
import { safeSettle } from './settlement';

export const SORT_OPTIONS = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  stake: 'Highest stake',
  odds: 'Highest odds',
  profit: 'Largest profit',
  loss: 'Largest loss',
} as const;
export type SortKey = keyof typeof SORT_OPTIONS;

export interface BetFilters {
  search: string;
  status: BetStatus | 'all' | 'settled';
  sport: string;
  betType: BetType | 'all';
  bookmaker: string;
}

export const EMPTY_FILTERS: BetFilters = { search: '', status: 'all', sport: 'all', betType: 'all', bookmaker: 'all' };

export function applyFilters(bets: Bet[], f: BetFilters): Bet[] {
  const q = f.search.trim().toLowerCase();
  return bets.filter((b) => {
    if (f.status === 'settled' ? b.status === 'pending' : f.status !== 'all' && b.status !== f.status) return false;
    if (f.sport !== 'all' && b.sport !== f.sport) return false;
    if (f.betType !== 'all' && b.betType !== f.betType) return false;
    if (f.bookmaker !== 'all' && (b.bookmaker ?? '') !== f.bookmaker) return false;
    if (q) {
      const hay = [b.betName, b.sport, b.event, b.bookmaker, b.league, b.referenceId, ...b.tags]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function sortBets(bets: Bet[], key: SortKey): Bet[] {
  const list = [...bets];
  const byDate = (a: Bet, b: Bet) => b.betDate.localeCompare(a.betDate) || b.createdAt.localeCompare(a.createdAt);
  const pl = (b: Bet) => safeSettle(b).netProfit;
  switch (key) {
    case 'newest':
      return list.sort(byDate);
    case 'oldest':
      return list.sort((a, b) => -byDate(a, b));
    case 'stake':
      return list.sort((a, b) => b.stake - a.stake || byDate(a, b));
    case 'odds':
      return list.sort((a, b) => b.odds - a.odds || byDate(a, b));
    case 'profit':
      // Settled bets by realised P/L descending; pending at the end.
      return list.sort((a, b) => (pl(b) ?? -Infinity) - (pl(a) ?? -Infinity) || byDate(a, b));
    case 'loss':
      return list.sort((a, b) => (pl(a) ?? Infinity) - (pl(b) ?? Infinity) || byDate(a, b));
  }
}

export function activeFilterCount(f: BetFilters): number {
  return (
    (f.status !== 'all' ? 1 : 0) + (f.sport !== 'all' ? 1 : 0) + (f.betType !== 'all' ? 1 : 0) + (f.bookmaker !== 'all' ? 1 : 0)
  );
}
