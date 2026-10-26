import type { Bet } from '../types';
import { BET_TYPE_LABELS, STATUS_LABELS } from './constants';
import { safeSettle } from './settlement';

/**
 * Escape a CSV cell. Also neutralises spreadsheet formula injection: cells
 * beginning with = + - @ tab or CR are prefixed with a single quote, unless
 * they are plain numbers (so "-500.00" stays numeric).
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

export const BET_CSV_HEADERS = [
  'Bet date (UTC)',
  'Bet name',
  'Sport',
  'League',
  'Event',
  'Bet type',
  'Stake',
  'Decimal odds',
  'Status',
  'Cash-out amount',
  'Payout',
  'Potential payout',
  'Net profit/loss',
  'Sportsbook',
  'Reference ID',
  'Tags',
  'Notes',
  'Created at (UTC)',
  'Updated at (UTC)',
  'ID',
];

export function betsToCsv(bets: Bet[]): string {
  const rows = bets.map((b) => {
    const r = safeSettle(b);
    return [
      b.betDate,
      b.betName,
      b.sport,
      b.league,
      b.event,
      BET_TYPE_LABELS[b.betType],
      b.stake.toFixed(2),
      b.odds.toFixed(4).replace(/0{1,2}$/, ''),
      STATUS_LABELS[b.status],
      b.cashoutAmount === null ? '' : b.cashoutAmount.toFixed(2),
      r.payout === null ? '' : r.payout.toFixed(2),
      r.potentialPayout.toFixed(2),
      r.netProfit === null ? '' : r.netProfit.toFixed(2),
      b.bookmaker,
      b.referenceId,
      b.tags.join('; '),
      b.notes,
      b.createdAt,
      b.updatedAt,
      b.id,
    ];
  });
  // BOM so Excel opens UTF-8 (₹) correctly.
  return '\uFEFF' + toCsv([BET_CSV_HEADERS, ...rows]);
}
