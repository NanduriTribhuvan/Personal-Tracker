import { describe, expect, it } from 'vitest';
import type { BankrollTransaction } from '../types';
import { computeBankroll, exceedsStakeWarning, stakeExposure } from './bankroll';
import { makeBet } from '../test/factories';

const tx = (type: BankrollTransaction['type'], amount: number, day: number): BankrollTransaction => ({
  id: `tx-${type}-${day}`,
  userId: 'u1',
  type,
  amount,
  occurredAt: new Date(Date.UTC(2025, 11, day)).toISOString(),
  description: null,
  createdAt: new Date().toISOString(),
});

describe('computeBankroll', () => {
  const txs = [tx('initial', 10000, 1), tx('deposit', 2000, 2), tx('withdrawal', 500, 3)];
  const bets = [makeBet({ status: 'won', stake: 1000, odds: 1.5 }), makeBet({ status: 'pending', stake: 400 })];
  const s = computeBankroll(txs, bets);

  it('deposits and withdrawals are not betting profit', () => {
    expect(s.bettingProfit).toBe(500);
    expect(s.netCapital).toBe(11500);
  });
  it('current = initial + deposits − withdrawals + realised P/L', () => {
    expect(s.current).toBe(12000);
  });
  it('pending stake is shown as at-risk, not deducted', () => {
    expect(s.atRisk).toBe(400);
    expect(s.available).toBe(11600);
  });
  it('growth is P/L over capital put in', () => {
    expect(s.growthPercent).toBeCloseTo((500 / 12000) * 100);
  });
});

describe('stake warnings and exposure', () => {
  it('only warns when enabled and above threshold', () => {
    expect(exceedsStakeWarning(600, 10000, { stakeWarningEnabled: true, stakeWarningPercent: 5 })).toBe(true);
    expect(exceedsStakeWarning(400, 10000, { stakeWarningEnabled: true, stakeWarningPercent: 5 })).toBe(false);
    expect(exceedsStakeWarning(600, 10000, { stakeWarningEnabled: false, stakeWarningPercent: 5 })).toBe(false);
  });
  it('uses the balance at the time the bet was placed', () => {
    const exp = stakeExposure([tx('initial', 1000, 1)], [makeBet({ status: 'won', stake: 100, odds: 2 }), makeBet({ status: 'pending', stake: 110 })]);
    expect(exp[0].percent).toBe(10);
    expect(exp[1].percent).toBe(10); // balance grew to 1100
  });
});
