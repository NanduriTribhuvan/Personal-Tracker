import { describe, expect, it } from 'vitest';
import { filterByRange, fromDateTimeLocalValue, getCustomRange, getPresetRange, getPreviousPeriod, isInRange } from './dateRange';

// Tests run with TZ=Asia/Kolkata (UTC+5:30), see vite.config.ts.
const now = new Date(2026, 9, 26, 14, 0); // 26 Oct 2026 14:00 local

describe('preset ranges', () => {
  it('today covers the whole local day', () => {
    const r = getPresetRange('today', now);
    expect(r.from!.toISOString()).toBe('2026-10-25T18:30:00.000Z');
    expect(r.to!.getTime() - r.from!.getTime()).toBe(86_400_000 - 1);
  });
  it('last 7 days includes today and 6 prior days', () => {
    const r = getPresetRange('last7', now);
    expect(r.from).toEqual(new Date(2026, 9, 20));
  });
  it('last month is the full previous calendar month', () => {
    const r = getPresetRange('lastMonth', now);
    expect(r.from).toEqual(new Date(2026, 8, 1));
    expect(r.to!.getDate()).toBe(30);
  });
  it('this month and ytd start at the right boundary', () => {
    expect(getPresetRange('thisMonth', now).from).toEqual(new Date(2026, 9, 1));
    expect(getPresetRange('ytd', now).from).toEqual(new Date(2026, 0, 1));
  });
  it('all time is unbounded', () => {
    expect(getPresetRange('all', now)).toEqual({ preset: 'all', from: null, to: null });
  });
});

describe('timezone handling', () => {
  it('a late-night local bet stays on its local day', () => {
    const iso = fromDateTimeLocalValue('2026-10-26T23:30')!; // 18:00Z same day
    expect(isInRange(iso, getPresetRange('today', now))).toBe(true);
    const early = fromDateTimeLocalValue('2026-10-26T01:00')!; // previous day in UTC
    expect(early.startsWith('2026-10-25')).toBe(true);
    expect(isInRange(early, getPresetRange('today', now))).toBe(true);
  });
});

describe('custom ranges', () => {
  it('is inclusive of both days and swaps reversed input', () => {
    const r = getCustomRange('2026-10-10', '2026-10-01');
    expect(r.from).toEqual(new Date(2026, 9, 1));
    expect(r.to!.getDate()).toBe(10);
    const items = [{ d: fromDateTimeLocalValue('2026-10-10T23:59')! }, { d: fromDateTimeLocalValue('2026-10-11T00:00')! }];
    expect(filterByRange(items, r, (i) => i.d)).toHaveLength(1);
  });
  it('previous period has the same length and ends before the range', () => {
    const r = getPresetRange('last7', now);
    const p = getPreviousPeriod(r)!;
    expect(p.to!.getTime()).toBe(r.from!.getTime() - 1);
    expect(p.to!.getTime() - p.from!.getTime()).toBe(r.to!.getTime() - r.from!.getTime());
    expect(getPreviousPeriod(getPresetRange('all'))).toBeNull();
  });
});
