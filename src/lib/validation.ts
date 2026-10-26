import { z } from 'zod';
import {
  BET_STATUSES,
  BET_TYPES,
  CURRENCIES,
  DATE_FORMATS,
  DATE_RANGE_PRESETS,
  TRANSACTION_TYPES,
  type BetInput,
  type TransactionInput,
} from '../types';
import { MAX_ODDS, MAX_STAKE, MIN_ODDS } from './constants';
import { fromDateTimeLocalValue } from './dateRange';

const decimalString = (maxDp: number) => new RegExp(`^\\d+(\\.\\d{0,${maxDp}})?$`);
const cleanNumber = (v: string) => v.replace(/,/g, '').trim();

const moneyField = (label: string, { allowZero = false } = {}) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .refine((v) => decimalString(2).test(cleanNumber(v)), `${label} must be a number with up to 2 decimal places`)
    .refine((v) => {
      const n = Number(cleanNumber(v));
      return allowZero ? n >= 0 : n > 0;
    }, allowZero ? `${label} cannot be negative` : `${label} must be greater than zero`)
    .refine((v) => Number(cleanNumber(v)) <= MAX_STAKE, `${label} is too large`);

export const betFormSchema = z
  .object({
    betName: z.string().trim().min(1, 'Enter the pick or bet name').max(200, 'Keep it under 200 characters'),
    sport: z.string().trim().min(1, 'Enter a sport or category').max(60, 'Keep it under 60 characters'),
    betType: z.enum(BET_TYPES, { message: 'Choose a bet type' }),
    stake: moneyField('Stake'),
    odds: z
      .string()
      .trim()
      .min(1, 'Odds are required')
      .refine((v) => decimalString(4).test(cleanNumber(v)), 'Use decimal odds, e.g. 1.90 (up to 4 decimal places)')
      .refine((v) => {
        const n = Number(cleanNumber(v));
        return n >= MIN_ODDS && n <= MAX_ODDS;
      }, `Decimal odds must be between ${MIN_ODDS} and ${MAX_ODDS}`),
    status: z.enum(BET_STATUSES, { message: 'Choose a status' }),
    cashoutAmount: z.string().trim(),
    betDate: z
      .string()
      .min(1, 'Enter when the bet was placed')
      .refine((v) => fromDateTimeLocalValue(v) !== null, 'Enter a valid date and time'),
    bookmaker: z.string().trim().max(60, 'Keep it under 60 characters'),
    league: z.string().trim().max(100, 'Keep it under 100 characters'),
    event: z.string().trim().max(200, 'Keep it under 200 characters'),
    notes: z.string().trim().max(2000, 'Notes are limited to 2000 characters'),
    referenceId: z.string().trim().max(100, 'Keep it under 100 characters'),
    tags: z
      .string()
      .trim()
      .refine((v) => parseTags(v).length <= 20, 'Up to 20 tags')
      .refine((v) => parseTags(v).every((t) => t.length <= 30), 'Each tag must be 30 characters or less'),
  })
  .superRefine((data, ctx) => {
    if (data.status === 'cashed_out') {
      const v = cleanNumber(data.cashoutAmount);
      if (!v) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cashoutAmount'], message: 'Enter the amount you cashed out for' });
      } else if (!decimalString(2).test(v)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cashoutAmount'], message: 'Cash-out must be a number with up to 2 decimal places' });
      } else if (Number(v) > MAX_STAKE) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cashoutAmount'], message: 'Cash-out amount is too large' });
      }
    }
  });

export type BetFormValues = z.infer<typeof betFormSchema>;

export function parseTags(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[,#\n]/)
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ];
}

const nullIfEmpty = (v: string) => (v.trim() === '' ? null : v.trim());

/** Convert validated form values into a persistable bet. */
export function formValuesToBetInput(v: BetFormValues): BetInput {
  return {
    betName: v.betName.trim(),
    sport: v.sport.trim(),
    betType: v.betType,
    stake: Number(cleanNumber(v.stake)),
    odds: Number(cleanNumber(v.odds)),
    status: v.status,
    cashoutAmount: v.status === 'cashed_out' ? Number(cleanNumber(v.cashoutAmount)) : null,
    betDate: fromDateTimeLocalValue(v.betDate)!,
    bookmaker: nullIfEmpty(v.bookmaker),
    league: nullIfEmpty(v.league),
    event: nullIfEmpty(v.event),
    notes: nullIfEmpty(v.notes),
    referenceId: nullIfEmpty(v.referenceId),
    tags: parseTags(v.tags),
  };
}

/** Parse a numeric form string; returns null if not a valid finite number. */
export function parseNumeric(v: string | undefined | null): number | null {
  if (v === undefined || v === null) return null;
  const s = cleanNumber(v);
  if (!s || !/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export const settleFormSchema = z
  .object({
    status: z.enum(BET_STATUSES),
    cashoutAmount: z.string().trim(),
  })
  .superRefine((data, ctx) => {
    if (data.status === 'cashed_out') {
      const v = cleanNumber(data.cashoutAmount);
      if (!v || !decimalString(2).test(v)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cashoutAmount'], message: 'Enter a valid cash-out amount' });
      }
    }
  });

export const transactionFormSchema = z.object({
  type: z.enum(TRANSACTION_TYPES),
  amount: moneyField('Amount'),
  occurredAt: z
    .string()
    .min(1, 'Enter a date')
    .refine((v) => fromDateTimeLocalValue(v) !== null, 'Enter a valid date and time'),
  description: z.string().trim().max(200, 'Keep it under 200 characters'),
});
export type TransactionFormValues = z.infer<typeof transactionFormSchema>;

export function formValuesToTransaction(v: TransactionFormValues): TransactionInput {
  return {
    type: v.type,
    amount: Number(cleanNumber(v.amount)),
    occurredAt: fromDateTimeLocalValue(v.occurredAt)!,
    description: nullIfEmpty(v.description),
  };
}

export const loginSchema = z.object({
  username: z.string().trim().min(3, 'Enter your username').max(64, 'Username is too long'),
  password: z.string().min(1, 'Enter your password').max(128, 'Password is too long'),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const USERNAME_PATTERN = /^[A-Za-z0-9._@-]{3,32}$/;

export const setupSchema = z
  .object({
    username: z
      .string()
      .trim()
      .regex(USERNAME_PATTERN, '3–32 characters: letters, numbers, and . _ @ -'),
    password: z.string().min(6, 'At least 6 characters').max(128, 'Password is too long'),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { path: ['confirm'], message: 'Passwords do not match' });
export type SetupValues = z.infer<typeof setupSchema>;

export const passwordChangeSchema = z
  .object({
    current: z.string().min(1, 'Enter your current password'),
    next: z.string().min(8, 'Use at least 8 characters').max(128, 'Password is too long'),
    confirm: z.string(),
  })
  .refine((d) => d.next === d.confirm, { path: ['confirm'], message: 'Passwords do not match' })
  .refine((d) => d.next !== d.current, { path: ['next'], message: 'New password must be different' });
export type PasswordChangeValues = z.infer<typeof passwordChangeSchema>;

export const settingsSchema = z.object({
  currency: z.enum(CURRENCIES),
  dateFormat: z.enum(DATE_FORMATS),
  oddsPrecision: z.union([z.literal(2), z.literal(3)]),
  defaultStake: z.number().positive().max(MAX_STAKE).nullable(),
  defaultStatus: z.enum(BET_STATUSES),
  dashboardRange: z.enum(DATE_RANGE_PRESETS).exclude(['custom']),
  stakeWarningEnabled: z.boolean(),
  stakeWarningPercent: z.number().min(0.1).max(100),
});

/** Validates an imported backup file before anything is written. */
export const backupSchema = z.object({
  app: z.literal('edgetrack'),
  version: z.literal(1),
  exportedAt: z.string(),
  settings: settingsSchema.partial().optional(),
  bets: z
    .array(
      z.object({
        id: z.string().uuid(),
        betName: z.string().min(1).max(200),
        sport: z.string().min(1).max(60),
        league: z.string().max(100).nullable(),
        event: z.string().max(200).nullable(),
        betType: z.enum(BET_TYPES),
        stake: z.number().positive().max(MAX_STAKE),
        odds: z.number().min(MIN_ODDS).max(MAX_ODDS),
        status: z.enum(BET_STATUSES),
        cashoutAmount: z.number().min(0).max(MAX_STAKE).nullable(),
        bookmaker: z.string().max(60).nullable(),
        referenceId: z.string().max(100).nullable().optional().default(null),
        notes: z.string().max(2000).nullable(),
        tags: z.array(z.string().max(30)).max(20),
        betDate: z.string().datetime({ offset: true }),
        createdAt: z.string().optional(),
      }).refine((b) => b.status !== 'cashed_out' || b.cashoutAmount !== null, 'Cashed-out bet without amount'),
    )
    .max(100_000),
  transactions: z
    .array(
      z.object({
        id: z.string().uuid(),
        type: z.enum(TRANSACTION_TYPES),
        amount: z.number().positive().max(MAX_STAKE),
        occurredAt: z.string().datetime({ offset: true }),
        description: z.string().max(200).nullable(),
      }),
    )
    .max(100_000),
});
export type BackupPayload = z.infer<typeof backupSchema>;
