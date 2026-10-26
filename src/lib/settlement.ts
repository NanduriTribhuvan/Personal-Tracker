/**
 * Central settlement module — the single source of truth for every payout and
 * profit figure shown anywhere in EdgeTrack.
 *
 * Definitions
 *   payout     = total money returned by the bookmaker, INCLUDING the stake.
 *   net profit = payout − stake  (what you actually won or lost).
 *
 * Rules (decimal odds):
 *   pending     → nothing realised yet (payout & profit are null)
 *   won         → payout = stake × odds,           profit = stake × (odds − 1)
 *   lost        → payout = 0,                      profit = −stake
 *   void/push   → payout = stake,                  profit = 0
 *   half won    → profit = stake × (odds − 1) ÷ 2, payout = stake + profit
 *   half lost   → profit = −stake ÷ 2,             payout = stake + profit
 *   cashed out  → payout = cash-out amount,        profit = cash-out − stake
 *
 * Parlays use the combined decimal odds the user supplies.
 */
import type { Bet, BetStatus } from '../types';
import { MAX_ODDS, MIN_ODDS } from './constants';
import { ODDS_SCALE, fromCents, roundDiv, toCents, toOddsUnits } from './money';

export type Outcome = 'win' | 'loss' | 'push' | 'pending';

export interface SettlementInput {
  stake: number;
  odds: number;
  status: BetStatus;
  cashoutAmount?: number | null;
}

export interface SettlementResult {
  /** True for every status except pending. */
  isSettled: boolean;
  /** Realised payout (stake included). null while pending. */
  payout: number | null;
  /** Realised net profit/loss. null while pending. */
  netProfit: number | null;
  /** What a full win would pay (stake included). */
  potentialPayout: number;
  /** What a full win would earn on top of the stake. */
  potentialProfit: number;
  /** Classification used for win rate and streaks. */
  outcome: Outcome;
}

export class SettlementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SettlementError';
  }
}

const ODDS_ONE = 10n ** BigInt(ODDS_SCALE);

export function isValidOdds(odds: number): boolean {
  return Number.isFinite(odds) && odds >= MIN_ODDS && odds <= MAX_ODDS;
}

export function isValidStake(stake: number): boolean {
  return Number.isFinite(stake) && stake > 0;
}

/** Potential payout / profit / return % for a stake at given decimal odds. */
export function calculatePotential(stake: number, odds: number) {
  const stakeCents = toCents(stake);
  const oddsUnits = toOddsUnits(odds);
  const payoutCents = roundDiv(stakeCents * oddsUnits, ODDS_ONE);
  const profitCents = payoutCents - stakeCents;
  return {
    potentialPayout: fromCents(payoutCents),
    potentialProfit: fromCents(profitCents),
    /** Net return on stake as a percentage, e.g. odds 1.90 → 90%. */
    returnPercent: fromCents(roundDiv((oddsUnits - ODDS_ONE) * 10000n, ODDS_ONE)),
  };
}

export function settleBet(input: SettlementInput): SettlementResult {
  const { stake, odds, status } = input;
  if (!isValidStake(stake)) throw new SettlementError('Stake must be greater than zero.');
  if (!isValidOdds(odds)) throw new SettlementError(`Odds must be between ${MIN_ODDS} and ${MAX_ODDS}.`);

  const stakeCents = toCents(stake);
  const oddsUnits = toOddsUnits(odds);
  const fullWinProfitCents = roundDiv(stakeCents * (oddsUnits - ODDS_ONE), ODDS_ONE);
  const potentialPayout = fromCents(stakeCents + fullWinProfitCents);
  const potentialProfit = fromCents(fullWinProfitCents);

  let profitCents: bigint;
  switch (status) {
    case 'pending':
      return { isSettled: false, payout: null, netProfit: null, potentialPayout, potentialProfit, outcome: 'pending' };
    case 'won':
      profitCents = fullWinProfitCents;
      break;
    case 'lost':
      profitCents = -stakeCents;
      break;
    case 'void':
      profitCents = 0n;
      break;
    case 'half_won':
      profitCents = roundDiv(stakeCents * (oddsUnits - ODDS_ONE), ODDS_ONE * 2n);
      break;
    case 'half_lost':
      profitCents = roundDiv(-stakeCents, 2n);
      break;
    case 'cashed_out': {
      const cashout = input.cashoutAmount;
      if (cashout === null || cashout === undefined || !Number.isFinite(cashout) || cashout < 0) {
        throw new SettlementError('A cashed-out bet requires a cash-out amount of zero or more.');
      }
      profitCents = toCents(cashout) - stakeCents;
      break;
    }
    default: {
      const exhaustive: never = status;
      throw new SettlementError(`Unknown status: ${String(exhaustive)}`);
    }
  }

  return {
    isSettled: true,
    payout: fromCents(stakeCents + profitCents),
    netProfit: fromCents(profitCents),
    potentialPayout,
    potentialProfit,
    outcome: profitCents > 0n ? 'win' : profitCents < 0n ? 'loss' : 'push',
  };
}

/**
 * Settle without throwing — used for rendering lists where one malformed
 * legacy record must never crash the whole screen.
 */
export function safeSettle(bet: Pick<Bet, 'stake' | 'odds' | 'status' | 'cashoutAmount'>): SettlementResult {
  try {
    return settleBet(bet);
  } catch {
    return {
      isSettled: false,
      payout: null,
      netProfit: null,
      potentialPayout: 0,
      potentialProfit: 0,
      outcome: 'pending',
    };
  }
}

/** Payout to show in tables: actual when settled, potential while pending. */
export function displayPayout(result: SettlementResult): { value: number; isPotential: boolean } {
  return result.isSettled && result.payout !== null
    ? { value: result.payout, isPotential: false }
    : { value: result.potentialPayout, isPotential: true };
}
