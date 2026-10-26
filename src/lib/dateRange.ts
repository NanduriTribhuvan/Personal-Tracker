/**
 * Date-range helpers.
 *
 * Timezone policy: bet dates are stored as UTC instants (timestamptz). All
 * range boundaries ("today", "this month", …) are computed in the viewer's
 * local timezone, then compared as absolute instants. That way a bet placed at
 * 23:30 local time always belongs to that local day on every screen.
 */
import {
  endOfDay,
  endOfMonth,
  isValid,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfYear,
  subDays,
  subMonths,
} from 'date-fns';
import type { DateRange, DateRangePreset } from '../types';

export function getPresetRange(
  preset: Exclude<DateRangePreset, 'custom'>,
  now: Date = new Date(),
): DateRange {
  switch (preset) {
    case 'today':
      return { preset, from: startOfDay(now), to: endOfDay(now) };
    case 'last7':
      return { preset, from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
    case 'last30':
      return { preset, from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
    case 'thisMonth':
      return { preset, from: startOfMonth(now), to: endOfDay(now) };
    case 'lastMonth': {
      const prev = subMonths(now, 1);
      return { preset, from: startOfMonth(prev), to: endOfMonth(prev) };
    }
    case 'ytd':
      return { preset, from: startOfYear(now), to: endOfDay(now) };
    case 'all':
      return { preset, from: null, to: null };
  }
}

/** Build a custom range from yyyy-MM-dd strings (inclusive, local days). */
export function getCustomRange(fromDay: string | null, toDay: string | null): DateRange {
  const from = fromDay ? parseLocalDay(fromDay) : null;
  const to = toDay ? parseLocalDay(toDay) : null;
  let start = from ? startOfDay(from) : null;
  let end = to ? endOfDay(to) : null;
  if (start && end && start > end) {
    // Swap rather than produce an empty, confusing range.
    const s = startOfDay(to!);
    const e = endOfDay(from!);
    start = s;
    end = e;
  }
  return { preset: 'custom', from: start, to: end };
}

/** Parse "yyyy-MM-dd" as a local calendar day (not UTC midnight). */
export function parseLocalDay(day: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isValid(d) ? d : null;
}

export function isInRange(isoDate: string, range: DateRange): boolean {
  const t = parseISO(isoDate).getTime();
  if (Number.isNaN(t)) return false;
  if (range.from && t < range.from.getTime()) return false;
  if (range.to && t > range.to.getTime()) return false;
  return true;
}

export function filterByRange<T>(items: T[], range: DateRange, getDate: (item: T) => string): T[] {
  if (!range.from && !range.to) return items;
  return items.filter((item) => isInRange(getDate(item), range));
}

/**
 * The equally long period immediately before `range`, used for "% change vs
 * previous period". Returns null for unbounded ranges.
 */
export function getPreviousPeriod(range: DateRange): DateRange | null {
  if (!range.from || !range.to) return null;
  const length = range.to.getTime() - range.from.getTime();
  const to = new Date(range.from.getTime() - 1);
  const from = new Date(to.getTime() - length);
  return { preset: 'custom', from, to };
}

/** Value for <input type="datetime-local"> in local time. */
export function toDateTimeLocalValue(iso: string | Date): string {
  const d = typeof iso === 'string' ? parseISO(iso) : iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parse a datetime-local value (local time) to a UTC ISO string. */
export function fromDateTimeLocalValue(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
  return isValid(d) ? d.toISOString() : null;
}

export function toDayValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
