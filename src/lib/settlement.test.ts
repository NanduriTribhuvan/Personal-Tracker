import { describe, expect, it } from 'vitest';
import { calculatePotential, displayPayout, safeSettle, settleBet, SettlementError } from './settlement';
import { roundMoney, sumMoney, toCents } from './money';

describe('calculatePotential', () => {
  it('matches the spec example: ₹500 @ 1.90', () => {
    expect(calculatePotential(500, 1.9)).toEqual({ potentialPayout: 950, potentialProfit: 450, returnPercent: 90 });
  });
  it('payout always includes the stake', () => {
    const p = calculatePotential(100, 2.5);
    expect(p.potentialPayout - p.potentialProfit).toBe(100);
  });
  it('avoids floating point drift', () => {
    expect(calculatePotential(0.1, 3).potentialPayout).toBe(0.3);
    expect(calculatePotential(33.33, 1.07).potentialPayout).toBe(35.66);
  });
});

describe('settleBet', () => {
  const base = { stake: 500, odds: 1.9 };

  it('pending: nothing realised', () => {
    const r = settleBet({ ...base, status: 'pending' });
    expect(r).toMatchObject({ isSettled: false, payout: null, netProfit: null, outcome: 'pending', potentialPayout: 950 });
  });
  it('won: payout = stake × odds, profit = stake × (odds − 1)', () => {
    expect(settleBet({ ...base, status: 'won' })).toMatchObject({ payout: 950, netProfit: 450, outcome: 'win' });
  });
  it('lost: payout 0, profit −stake', () => {
    expect(settleBet({ ...base, status: 'lost' })).toMatchObject({ payout: 0, netProfit: -500, outcome: 'loss' });
  });
  it('void: stake returned, profit 0, counted as push', () => {
    expect(settleBet({ ...base, status: 'void' })).toMatchObject({ payout: 500, netProfit: 0, outcome: 'push' });
  });
  it('half won: half the winning profit', () => {
    expect(settleBet({ ...base, status: 'half_won' })).toMatchObject({ payout: 725, netProfit: 225, outcome: 'win' });
  });
  it('half lost: lose half the stake', () => {
    expect(settleBet({ ...base, status: 'half_lost' })).toMatchObject({ payout: 250, netProfit: -250, outcome: 'loss' });
  });
  it('half outcomes round half away from zero', () => {
    expect(settleBet({ stake: 0.01, odds: 2, status: 'half_lost' }).netProfit).toBe(-0.01);
    expect(settleBet({ stake: 0.01, odds: 2, status: 'half_won' }).netProfit).toBe(0.01);
  });
  it('cashed out: profit = cash-out − stake', () => {
    expect(settleBet({ ...base, status: 'cashed_out', cashoutAmount: 700 })).toMatchObject({ payout: 700, netProfit: 200, outcome: 'win' });
    expect(settleBet({ ...base, status: 'cashed_out', cashoutAmount: 300 })).toMatchObject({ payout: 300, netProfit: -200, outcome: 'loss' });
    expect(settleBet({ ...base, status: 'cashed_out', cashoutAmount: 500 })).toMatchObject({ netProfit: 0, outcome: 'push' });
  });
  it('cashed out requires an amount', () => {
    expect(() => settleBet({ ...base, status: 'cashed_out' })).toThrow(SettlementError);
    expect(() => settleBet({ ...base, status: 'cashed_out', cashoutAmount: -1 })).toThrow(SettlementError);
  });
  it('rejects invalid stake and odds', () => {
    expect(() => settleBet({ stake: 0, odds: 2, status: 'won' })).toThrow(SettlementError);
    expect(() => settleBet({ stake: 10, odds: 1, status: 'won' })).toThrow(SettlementError);
    expect(() => settleBet({ stake: 10, odds: Number.NaN, status: 'won' })).toThrow(SettlementError);
  });
  it('parlays use the supplied combined odds', () => {
    expect(settleBet({ stake: 100, odds: 6.25, status: 'won' })).toMatchObject({ payout: 625, netProfit: 525 });
  });
  it('safeSettle never throws', () => {
    expect(safeSettle({ stake: -1, odds: 2, status: 'won', cashoutAmount: null }).isSettled).toBe(false);
  });
  it('displayPayout shows potential while pending', () => {
    expect(displayPayout(settleBet({ ...base, status: 'pending' }))).toEqual({ value: 950, isPotential: true });
    expect(displayPayout(settleBet({ ...base, status: 'lost' }))).toEqual({ value: 0, isPotential: false });
  });
});

describe('money helpers', () => {
  it('sums exactly', () => {
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
    expect(toCents('12.345')).toBe(1235n);
    expect(roundMoney(-1.005)).toBe(-1.01);
  });
});
