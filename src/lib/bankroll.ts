/**
 * Bankroll accounting.
 *
 *   current bankroll = initial + deposits − withdrawals + realised betting P/L
 *
 * Deposits and withdrawals are capital movements and are NEVER treated as
 * betting profit. Pending stakes are shown separately as "at risk" but do not
 * reduce the balance until the bet settles (losses are realised then).
 */
import { parseISO } from 'date-fns';
import type { BankrollTransaction, Bet } from '../types';
import { fromCents, toCents } from './money';
import { safeSettle } from './settlement';

export interface BankrollSummary {
  initial: number;
  deposits: number;
  withdrawals: number;
  /** Net capital put in: initial + deposits − withdrawals. */
  netCapital: number;
  /** Realised betting profit/loss (settled bets only). */
  bettingProfit: number;
  current: number;
  /** Stake currently tied up in pending bets. */
  atRisk: number;
  /** Current bankroll minus pending stakes. */
  available: number;
  /** Betting P/L as % of capital put in. null when no capital recorded. */
  growthPercent: number | null;
  hasBankroll: boolean;
}

export function computeBankroll(transactions: BankrollTransaction[], bets: Bet[]): BankrollSummary {
  let initialC = 0n;
  let depositsC = 0n;
  let withdrawalsC = 0n;
  for (const t of transactions) {
    const c = toCents(t.amount);
    if (t.type === 'initial') initialC += c;
    else if (t.type === 'deposit') depositsC += c;
    else withdrawalsC += c;
  }
  let profitC = 0n;
  let atRiskC = 0n;
  for (const bet of bets) {
    const r = safeSettle(bet);
    if (r.isSettled && r.netProfit !== null) profitC += toCents(r.netProfit);
    else atRiskC += toCents(bet.stake);
  }
  const netCapitalC = initialC + depositsC - withdrawalsC;
  const currentC = netCapitalC + profitC;
  const capitalInC = initialC + depositsC;
  return {
    initial: fromCents(initialC),
    deposits: fromCents(depositsC),
    withdrawals: fromCents(withdrawalsC),
    netCapital: fromCents(netCapitalC),
    bettingProfit: fromCents(profitC),
    current: fromCents(currentC),
    atRisk: fromCents(atRiskC),
    available: fromCents(currentC - atRiskC),
    growthPercent: capitalInC > 0n ? (Number(profitC) / Number(capitalInC)) * 100 : null,
    hasBankroll: transactions.length > 0,
  };
}

export interface BankrollPoint {
  time: number;
  label: string;
  balance: number;
  kind: 'transaction' | 'bet';
}

/**
 * Running balance over time. Transactions apply at their date; settled bets
 * apply at their bet date (the date the result belongs to).
 */
export function bankrollSeries(transactions: BankrollTransaction[], bets: Bet[]): BankrollPoint[] {
  type Event = { time: number; cents: bigint; kind: 'transaction' | 'bet'; order: number };
  const events: Event[] = [];
  for (const t of transactions) {
    const sign = t.type === 'withdrawal' ? -1n : 1n;
    events.push({ time: parseISO(t.occurredAt).getTime(), cents: sign * toCents(t.amount), kind: 'transaction', order: 0 });
  }
  for (const bet of bets) {
    const r = safeSettle(bet);
    if (r.isSettled && r.netProfit !== null) {
      events.push({ time: parseISO(bet.betDate).getTime(), cents: toCents(r.netProfit), kind: 'bet', order: 1 });
    }
  }
  events.sort((a, b) => a.time - b.time || a.order - b.order);
  let running = 0n;
  return events.map((e) => {
    running += e.cents;
    return { time: e.time, label: new Date(e.time).toISOString(), balance: fromCents(running), kind: e.kind };
  });
}

/** Stake as % of the bankroll. null when the bankroll is zero or negative. */
export function stakePercentOfBankroll(stake: number, bankroll: number): number | null {
  if (!(bankroll > 0)) return null;
  return (stake / bankroll) * 100;
}

export function exceedsStakeWarning(
  stake: number,
  bankroll: number,
  settings: { stakeWarningEnabled: boolean; stakeWarningPercent: number },
): boolean {
  if (!settings.stakeWarningEnabled) return false;
  const pct = stakePercentOfBankroll(stake, bankroll);
  return pct !== null && pct > settings.stakeWarningPercent;
}

export interface StakeExposure {
  betId: string;
  /** Bankroll balance just before the bet was placed. */
  balanceBefore: number;
  /** Stake as % of that balance (null if the balance was ≤ 0). */
  percent: number | null;
}

/**
 * Stake as a percentage of the bankroll at the moment each bet was placed:
 * the running balance includes every transaction and every settled result
 * dated before the bet.
 */
export function stakeExposure(transactions: BankrollTransaction[], bets: Bet[]): StakeExposure[] {
  type Ev = { time: number; cents: bigint; order: number };
  const events: Ev[] = [];
  for (const t of transactions) {
    const sign = t.type === 'withdrawal' ? -1n : 1n;
    events.push({ time: parseISO(t.occurredAt).getTime(), cents: sign * toCents(t.amount), order: 0 });
  }
  for (const b of bets) {
    const r = safeSettle(b);
    if (r.isSettled && r.netProfit !== null) events.push({ time: parseISO(b.betDate).getTime(), cents: toCents(r.netProfit), order: 1 });
  }
  events.sort((a, b) => a.time - b.time || a.order - b.order);

  const sortedBets = [...bets].sort((a, b) => a.betDate.localeCompare(b.betDate) || a.createdAt.localeCompare(b.createdAt));
  const out: StakeExposure[] = [];
  let i = 0;
  let running = 0n;
  for (const bet of sortedBets) {
    const t = parseISO(bet.betDate).getTime();
    // Apply everything strictly before this bet's time.
    while (i < events.length && events[i].time < t) running += events[i++].cents;
    const balance = fromCents(running);
    out.push({ betId: bet.id, balanceBefore: balance, percent: stakePercentOfBankroll(bet.stake, balance) });
  }
  return out;
}
