import { format as fnsFormat, parseISO } from 'date-fns';
import type { CurrencyCode, DateFormat } from '../types';
import { CURRENCY_META } from './constants';

const formatterCache = new Map<string, Intl.NumberFormat>();

function currencyFormatter(currency: CurrencyCode, compact: boolean, signDisplay: 'auto' | 'exceptZero'): Intl.NumberFormat {
  const key = `${currency}|${compact}|${signDisplay}`;
  let f = formatterCache.get(key);
  if (!f) {
    const meta = CURRENCY_META[currency];
    f = new Intl.NumberFormat(meta.locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      notation: compact ? 'compact' : 'standard',
      minimumFractionDigits: compact ? 0 : currency === 'JPY' ? 0 : 2,
      maximumFractionDigits: compact ? 1 : currency === 'JPY' ? 0 : 2,
      signDisplay,
    });
    formatterCache.set(key, f);
  }
  return f;
}

export function formatMoney(
  value: number,
  currency: CurrencyCode,
  opts: { signed?: boolean; compact?: boolean } = {},
): string {
  // Normalise -0 so we never render "-₹0.00".
  const v = Object.is(value, -0) || Math.abs(value) < 0.005 ? 0 : value;
  return currencyFormatter(currency, !!opts.compact, opts.signed ? 'exceptZero' : 'auto').format(v);
}

export function formatOdds(odds: number, precision: number): string {
  return odds.toFixed(precision);
}

export function formatPercent(value: number | null, opts: { signed?: boolean; digits?: number } = {}): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const digits = opts.digits ?? 1;
  const sign = opts.signed && value > 0 ? '+' : '';
  const v = Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value;
  return `${sign}${v.toFixed(digits)}%`;
}

export function formatDate(iso: string, dateFormat: DateFormat): string {
  return fnsFormat(parseISO(iso), dateFormat);
}

export function formatDateTime(iso: string, dateFormat: DateFormat): string {
  return fnsFormat(parseISO(iso), `${dateFormat}, HH:mm`);
}

export function currencySymbol(currency: CurrencyCode): string {
  return CURRENCY_META[currency].symbol;
}

/** Tailwind text color class for a P/L value. */
export function pnlClass(value: number | null | undefined): string {
  if (value === null || value === undefined || Math.abs(value) < 0.005) return 'text-muted-foreground';
  return value > 0 ? 'text-profit' : 'text-loss';
}
