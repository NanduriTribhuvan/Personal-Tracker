/**
 * Exact decimal helpers.
 *
 * Money is handled internally as integer minor units (cents/paise) and odds as
 * integer ten-thousandths, multiplied with BigInt. This avoids binary floating
 * point drift such as 0.1 + 0.2 = 0.30000000000000004 in every calculation.
 */

export const MONEY_SCALE = 2;
export const ODDS_SCALE = 4;

const TEN = 10n;

function pow10(n: number): bigint {
  return TEN ** BigInt(n);
}

/**
 * Round a/b to the nearest integer, half away from zero (matches PostgreSQL's
 * numeric `round()` behaviour so client and database agree).
 */
export function roundDiv(a: bigint, b: bigint): bigint {
  if (b === 0n) throw new RangeError('Division by zero');
  const negative = a < 0n !== b < 0n;
  const absA = a < 0n ? -a : a;
  const absB = b < 0n ? -b : b;
  const q = absA / absB;
  const r = absA % absB;
  const rounded = r * 2n >= absB ? q + 1n : q;
  return negative ? -rounded : rounded;
}

/**
 * Convert a decimal number or numeric string to a scaled integer, rounding
 * half away from zero at the requested scale.
 */
export function toScaled(value: number | string, scale: number): bigint {
  let str: string;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new RangeError(`Invalid number: ${value}`);
    // toFixed with extra guard digits gives an exact decimal string for the
    // shortest representation of the double (e.g. 1.005 -> "1.00500000").
    str = value.toFixed(Math.min(scale + 6, 100));
  } else {
    str = value.trim();
  }
  const match = /^([+-])?(\d*)(?:\.(\d*))?$/.exec(str);
  if (!match || (match[2] === '' && (match[3] ?? '') === '')) {
    throw new RangeError(`Invalid decimal: ${value}`);
  }
  const sign = match[1] === '-' ? -1n : 1n;
  const intPart = match[2] || '0';
  const fracPart = match[3] ?? '';
  const keep = fracPart.slice(0, scale).padEnd(scale, '0');
  const rest = fracPart.slice(scale);
  let scaled = BigInt(intPart) * pow10(scale) + BigInt(keep || '0');
  if (rest.length > 0 && rest.charCodeAt(0) >= 53 /* '5' */) {
    scaled += 1n;
  }
  return sign * scaled;
}

export function fromScaled(value: bigint, scale: number): number {
  return Number(value) / Number(pow10(scale));
}

export const toCents = (value: number | string): bigint => toScaled(value, MONEY_SCALE);
export const fromCents = (cents: bigint): number => fromScaled(cents, MONEY_SCALE);
export const toOddsUnits = (odds: number | string): bigint => toScaled(odds, ODDS_SCALE);

/** Round any number to 2 decimal places, half away from zero. */
export function roundMoney(value: number): number {
  return fromCents(toCents(value));
}

/** Sum monetary values exactly. */
export function sumMoney(values: Iterable<number>): number {
  let total = 0n;
  for (const v of values) total += toCents(v);
  return fromCents(total);
}

/** stake × multiplier, where multiplier is expressed in odds units (1/10000). */
export function multiplyMoneyByOdds(amount: number, oddsUnits: bigint): number {
  return fromCents(roundDiv(toCents(amount) * oddsUnits, pow10(ODDS_SCALE)));
}

/** Safe percentage (a / b × 100). Returns null when b is zero. */
export function percent(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return (numerator / denominator) * 100;
}
