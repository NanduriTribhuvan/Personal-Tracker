import { describe, expect, it } from 'vitest';
import { makeBet } from '../test/factories';
import { byOddsRange, bySport, computeStreaks, computeSummary, pnlSeries } from './stats';

describe('computeSummary', () => {
  const bets = [
    makeBet({ status: 'won', stake: 100, odds: 2 }), // +100
    makeBet({ status: 'lost', stake: 50 }), // -50
    makeBet({ status: 'void', stake: 200 }), // 0
    makeBet({ status: 'pending', stake: 300, odds: 3 }),
    makeBet({ status: 'half_won', stake: 100, odds: 3 }), // +100
  ];
  const s = computeSummary(bets);

  it('excludes pending from P/L and ROI', () => {
    expect(s.netProfit).toBe(150);
    expect(s.settledStake).toBe(450);
    expect(s.roi).toBeCloseTo((150 / 450) * 100);
  });
  it('win rate excludes voids and pending', () => {
    expect(s.wins).toBe(2);
    expect(s.losses).toBe(1);
    expect(s.pushes).toBe(1);
    expect(s.winRate).toBeCloseTo((2 / 3) * 100);
  });
  it('counts pending stake and totals', () => {
    expect(s.pendingCount).toBe(1);
    expect(s.pendingStake).toBe(300);
    expect(s.totalStaked).toBe(750);
    expect(s.totalBets).toBe(5);
    expect(s.averageOdds).toBeCloseTo(2.2);
  });
  it('best bet is the highest-profit winner', () => {
    expect(s.bestBet?.result.netProfit).toBe(100);
  });
  it('returns nulls with no data', () => {
    const e = computeSummary([]);
    expect(e.winRate).toBeNull();
    expect(e.roi).toBeNull();
    expect(e.bestBet).toBeNull();
  });
  it('only pending → no ROI or win rate', () => {
    const p = computeSummary([makeBet({ status: 'pending' })]);
    expect(p.roi).toBeNull();
    expect(p.winRate).toBeNull();
    expect(p.netProfit).toBe(0);
  });
});

describe('streaks', () => {
  it('pushes do not break streaks', () => {
    const s = computeStreaks([
      makeBet({ status: 'won' }),
      makeBet({ status: 'void' }),
      makeBet({ status: 'won' }),
      makeBet({ status: 'lost' }),
      makeBet({ status: 'lost' }),
      makeBet({ status: 'lost' }),
      makeBet({ status: 'won' }),
    ]);
    expect(s.longestWin).toBe(2);
    expect(s.longestLoss).toBe(3);
    expect(s.current).toEqual({ type: 'win', length: 1 });
  });
});

describe('breakdowns & series', () => {
  it('groups by sport and odds range', () => {
    const bets = [
      makeBet({ status: 'won', sport: 'Tennis', odds: 1.8 }),
      makeBet({ status: 'lost', sport: 'Cricket', odds: 4 }),
    ];
    expect(bySport(bets).map((r) => [r.key, r.netProfit])).toEqual([
      ['Tennis', 80],
      ['Cricket', -100],
    ]);
    expect(byOddsRange(bets).map((r) => r.key)).toEqual(['1.50–1.99', '3.00–4.99']);
  });
  it('cumulative series ignores pending', () => {
    const series = pnlSeries(
      [makeBet({ status: 'won' }), makeBet({ status: 'pending' }), makeBet({ status: 'lost', stake: 30 })],
      'all',
    );
    expect(series.map((p) => p.cumulative)).toEqual([100, 70]);
  });
});
