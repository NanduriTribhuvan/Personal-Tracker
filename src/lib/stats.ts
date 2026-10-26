/**
 * Aggregate statistics. Every figure is derived from real bet records via the
 * settlement module — nothing here is ever hardcoded.
 */
import {
  format,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import type { Bet, BetType } from '../types';
import { BET_TYPE_LABELS } from './constants';
import { fromCents, toCents } from './money';
import { safeSettle, type SettlementResult } from './settlement';

export interface SettledBet {
  bet: Bet;
  result: SettlementResult;
}

export function withSettlement(bets: Bet[]): SettledBet[] {
  return bets.map((bet) => ({ bet, result: safeSettle(bet) }));
}

export interface SummaryStats {
  totalBets: number;
  settledCount: number;
  pendingCount: number;
  pendingStake: number;
  wins: number;
  losses: number;
  pushes: number;
  /** Stake across every bet in the selection (settled + pending). */
  totalStaked: number;
  /** Stake across settled bets only — the ROI denominator. */
  settledStake: number;
  /** Realised profit/loss across settled bets. Pending bets never count. */
  netProfit: number;
  /** wins / (wins + losses) × 100. Pushes & pending excluded. null when no decided bets. */
  winRate: number | null;
  /** netProfit / settledStake × 100. null when nothing settled. */
  roi: number | null;
  /** Mean decimal odds across all bets in the selection. */
  averageOdds: number | null;
  averageStake: number | null;
  /** Mean realised profit per settled bet. */
  averageProfit: number | null;
  /** Highest-profit winning bet. */
  bestBet: SettledBet | null;
  worstBet: SettledBet | null;
}

export function computeSummary(bets: Bet[]): SummaryStats {
  let pendingCount = 0;
  let wins = 0;
  let losses = 0;
  let pushes = 0;
  let totalStakedC = 0n;
  let settledStakeC = 0n;
  let pendingStakeC = 0n;
  let netProfitC = 0n;
  let oddsSum = 0;
  let bestBet: SettledBet | null = null;
  let worstBet: SettledBet | null = null;

  for (const bet of bets) {
    const result = safeSettle(bet);
    const stakeC = toCents(bet.stake);
    totalStakedC += stakeC;
    oddsSum += bet.odds;

    if (!result.isSettled || result.netProfit === null) {
      pendingCount++;
      pendingStakeC += stakeC;
      continue;
    }
    settledStakeC += stakeC;
    netProfitC += toCents(result.netProfit);
    if (result.outcome === 'win') wins++;
    else if (result.outcome === 'loss') losses++;
    else pushes++;

    if (result.outcome === 'win' && (!bestBet || result.netProfit > (bestBet.result.netProfit ?? -Infinity))) {
      bestBet = { bet, result };
    }
    if (result.outcome === 'loss' && (!worstBet || result.netProfit < (worstBet.result.netProfit ?? Infinity))) {
      worstBet = { bet, result };
    }
  }

  const settledCount = wins + losses + pushes;
  const decided = wins + losses;
  const settledStake = fromCents(settledStakeC);
  const netProfit = fromCents(netProfitC);

  return {
    totalBets: bets.length,
    settledCount,
    pendingCount,
    pendingStake: fromCents(pendingStakeC),
    wins,
    losses,
    pushes,
    totalStaked: fromCents(totalStakedC),
    settledStake,
    netProfit,
    winRate: decided > 0 ? (wins / decided) * 100 : null,
    roi: settledStakeC > 0n ? (Number(netProfitC) / Number(settledStakeC)) * 100 : null,
    averageOdds: bets.length > 0 ? oddsSum / bets.length : null,
    averageStake: bets.length > 0 ? Number(totalStakedC) / 100 / bets.length : null,
    averageProfit: settledCount > 0 ? Number(netProfitC) / 100 / settledCount : null,
    bestBet,
    worstBet,
  };
}

/** Sort by bet date ascending, tie-broken by creation time for determinism. */
export function chronological(bets: Bet[]): Bet[] {
  return [...bets].sort(
    (a, b) => a.betDate.localeCompare(b.betDate) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}

export interface StreakStats {
  longestWin: number;
  longestLoss: number;
  current: { type: 'win' | 'loss' | null; length: number };
}

/**
 * Streaks over settled bets in chronological order. Pushes (void, or a
 * cash-out exactly at stake) neither extend nor break a streak.
 */
export function computeStreaks(bets: Bet[]): StreakStats {
  let longestWin = 0;
  let longestLoss = 0;
  let curType: 'win' | 'loss' | null = null;
  let curLen = 0;

  for (const bet of chronological(bets)) {
    const { outcome } = safeSettle(bet);
    if (outcome !== 'win' && outcome !== 'loss') continue;
    if (outcome === curType) curLen++;
    else {
      curType = outcome;
      curLen = 1;
    }
    if (curType === 'win') longestWin = Math.max(longestWin, curLen);
    else longestLoss = Math.max(longestLoss, curLen);
  }
  return { longestWin, longestLoss, current: { type: curType, length: curLen } };
}

export interface OutcomeOddsStats {
  averageWinningOdds: number | null;
  averageLosingOdds: number | null;
}

export function computeOutcomeOdds(bets: Bet[]): OutcomeOddsStats {
  let winSum = 0;
  let winN = 0;
  let lossSum = 0;
  let lossN = 0;
  for (const bet of bets) {
    const { outcome } = safeSettle(bet);
    if (outcome === 'win') {
      winSum += bet.odds;
      winN++;
    } else if (outcome === 'loss') {
      lossSum += bet.odds;
      lossN++;
    }
  }
  return {
    averageWinningOdds: winN ? winSum / winN : null,
    averageLosingOdds: lossN ? lossSum / lossN : null,
  };
}

export interface Breakdown {
  key: string;
  label: string;
  bets: number;
  settled: number;
  wins: number;
  losses: number;
  staked: number;
  settledStake: number;
  netProfit: number;
  roi: number | null;
  winRate: number | null;
}

export function breakdownBy(bets: Bet[], keyOf: (bet: Bet) => string, labelOf: (key: string) => string = (k) => k): Breakdown[] {
  const groups = new Map<string, Bet[]>();
  for (const bet of bets) {
    const key = keyOf(bet);
    const list = groups.get(key);
    if (list) list.push(bet);
    else groups.set(key, [bet]);
  }
  return [...groups.entries()]
    .map(([key, list]) => {
      const s = computeSummary(list);
      return {
        key,
        label: labelOf(key),
        bets: s.totalBets,
        settled: s.settledCount,
        wins: s.wins,
        losses: s.losses,
        staked: s.totalStaked,
        settledStake: s.settledStake,
        netProfit: s.netProfit,
        roi: s.roi,
        winRate: s.winRate,
      };
    })
    .sort((a, b) => b.netProfit - a.netProfit || b.bets - a.bets);
}

export const bySport = (bets: Bet[]) => breakdownBy(bets, (b) => b.sport.trim() || 'Uncategorised');
export const byBetType = (bets: Bet[]) =>
  breakdownBy(bets, (b) => b.betType, (k) => BET_TYPE_LABELS[k as BetType] ?? k);
export const byBookmaker = (bets: Bet[]) => breakdownBy(bets, (b) => b.bookmaker?.trim() || 'Not specified');

export const ODDS_BUCKETS = [
  { key: '1.01–1.49', min: 1.01, max: 1.5 },
  { key: '1.50–1.99', min: 1.5, max: 2 },
  { key: '2.00–2.99', min: 2, max: 3 },
  { key: '3.00–4.99', min: 3, max: 5 },
  { key: '5.00+', min: 5, max: Infinity },
] as const;

export function oddsBucket(odds: number): string {
  return (ODDS_BUCKETS.find((b) => odds >= b.min && odds < b.max) ?? ODDS_BUCKETS[0]).key;
}

export function byOddsRange(bets: Bet[]): Breakdown[] {
  const order = ODDS_BUCKETS.map((b) => b.key as string);
  return breakdownBy(bets, (b) => oddsBucket(b.odds)).sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}

/**
 * Stake-size buckets relative to the user's own median stake, so the
 * breakdown is meaningful whatever their unit size is.
 */
export function byStakeSize(bets: Bet[]): Breakdown[] {
  if (bets.length === 0) return [];
  const stakes = bets.map((b) => b.stake).sort((a, b) => a - b);
  const mid = Math.floor(stakes.length / 2);
  const median = stakes.length % 2 ? stakes[mid] : (stakes[mid - 1] + stakes[mid]) / 2;
  const key = (stake: number) => {
    if (stake < median * 0.75) return 'Small';
    if (stake <= median * 1.25) return 'Standard';
    if (stake <= median * 2) return 'Large';
    return 'Max';
  };
  const labels: Record<string, string> = {
    Small: `Small (< 0.75× median)`,
    Standard: `Standard (≈ median)`,
    Large: `Large (1.25–2× median)`,
    Max: `Max (> 2× median)`,
  };
  const order = ['Small', 'Standard', 'Large', 'Max'];
  return breakdownBy(bets, (b) => key(b.stake), (k) => labels[k]).sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}

export type Granularity = 'daily' | 'weekly' | 'monthly' | 'all';

export interface PnlPoint {
  key: string;
  label: string;
  /** Profit/loss realised in this period. */
  period: number;
  /** Running total up to and including this period. */
  cumulative: number;
  bets: number;
}

function periodStart(date: Date, granularity: Granularity): Date {
  switch (granularity) {
    case 'daily':
    case 'all':
      return startOfDay(date);
    case 'weekly':
      return startOfWeek(date, { weekStartsOn: 1 });
    case 'monthly':
      return startOfMonth(date);
  }
}

/**
 * Cumulative P/L series over settled bets, bucketed by bet date.
 * 'all' produces one point per settled bet for maximum detail.
 */
export function pnlSeries(bets: Bet[], granularity: Granularity): PnlPoint[] {
  const settled = chronological(bets)
    .map((bet) => ({ bet, result: safeSettle(bet) }))
    .filter((s) => s.result.isSettled && s.result.netProfit !== null);

  let running = 0n;
  if (granularity === 'all') {
    return settled.map(({ bet, result }, i) => {
      running += toCents(result.netProfit!);
      return {
        key: `${bet.id}`,
        label: format(parseISO(bet.betDate), 'd MMM yy'),
        period: result.netProfit!,
        cumulative: fromCents(running),
        bets: i + 1,
      };
    });
  }

  const buckets = new Map<number, { cents: bigint; bets: number }>();
  for (const { bet, result } of settled) {
    const start = periodStart(parseISO(bet.betDate), granularity).getTime();
    const b = buckets.get(start) ?? { cents: 0n, bets: 0 };
    b.cents += toCents(result.netProfit!);
    b.bets++;
    buckets.set(start, b);
  }
  const labelFmt = granularity === 'monthly' ? 'MMM yyyy' : 'd MMM';
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([start, b]) => {
      running += b.cents;
      return {
        key: String(start),
        label: (granularity === 'weekly' ? 'Wk ' : '') + format(new Date(start), labelFmt),
        period: fromCents(b.cents),
        cumulative: fromCents(running),
        bets: b.bets,
      };
    });
}

/** Status counts for the performance donut. */
export function statusDistribution(bets: Bet[]) {
  const s = computeSummary(bets);
  return [
    { key: 'wins', label: 'Wins', value: s.wins },
    { key: 'losses', label: 'Losses', value: s.losses },
    { key: 'pushes', label: 'Pushes', value: s.pushes },
    { key: 'pending', label: 'Pending', value: s.pendingCount },
  ];
}

/** Minimum settled bets before a breakdown is called "best"/"worst". */
export const MIN_SAMPLE = 3;

export function bestBreakdown(rows: Breakdown[]): Breakdown | null {
  const eligible = rows.filter((r) => r.settled >= 1);
  if (!eligible.length) return null;
  return eligible.reduce((best, r) => (r.netProfit > best.netProfit ? r : best));
}

export function worstBreakdown(rows: Breakdown[]): Breakdown | null {
  const eligible = rows.filter((r) => r.settled >= 1);
  if (!eligible.length) return null;
  return eligible.reduce((worst, r) => (r.netProfit < worst.netProfit ? r : worst));
}

/** % change helper that refuses to produce a number from a zero baseline. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
