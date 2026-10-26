import { describe, expect, it } from 'vitest';
import { betFormSchema, formValuesToBetInput, passwordChangeSchema, transactionFormSchema, type BetFormValues } from './validation';
import { csvCell } from './csv';

const valid: BetFormValues = {
  betName: 'India to win',
  sport: 'Cricket',
  betType: 'moneyline',
  stake: '500',
  odds: '1.90',
  status: 'pending',
  cashoutAmount: '',
  betDate: '2026-10-26T19:30',
  bookmaker: '',
  league: '',
  event: '',
  notes: '',
  referenceId: '',
  tags: 'value, ipl, value',
};

const errorsFor = (v: Partial<BetFormValues>) => {
  const r = betFormSchema.safeParse({ ...valid, ...v });
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path[0], i.message]));
};

describe('bet form validation', () => {
  it('accepts a valid bet and normalises it', () => {
    const r = betFormSchema.parse(valid);
    const input = formValuesToBetInput(r);
    expect(input).toMatchObject({ stake: 500, odds: 1.9, cashoutAmount: null, bookmaker: null, tags: ['value', 'ipl'] });
  });
  it('requires name and sport', () => {
    expect(errorsFor({ betName: ' ', sport: '' })).toHaveProperty('betName');
    expect(errorsFor({ sport: '' })).toHaveProperty('sport');
  });
  it('stake must be greater than zero', () => {
    expect(errorsFor({ stake: '0' }).stake).toMatch(/greater than zero/);
    expect(errorsFor({ stake: '-5' }).stake).toBeDefined();
    expect(errorsFor({ stake: 'abc' }).stake).toBeDefined();
    expect(errorsFor({ stake: '1.234' }).stake).toBeDefined();
  });
  it('odds must be valid decimal odds', () => {
    expect(errorsFor({ odds: '1' }).odds).toMatch(/between/);
    expect(errorsFor({ odds: '+150' }).odds).toBeDefined();
    expect(errorsFor({ odds: '' }).odds).toBeDefined();
    expect(errorsFor({ odds: '2.125' })).toEqual({});
  });
  it('cashed out requires a cash-out amount', () => {
    expect(errorsFor({ status: 'cashed_out' }).cashoutAmount).toBeDefined();
    expect(errorsFor({ status: 'cashed_out', cashoutAmount: '0' })).toEqual({});
  });
  it('drops cash-out amount for other statuses', () => {
    expect(formValuesToBetInput(betFormSchema.parse({ ...valid, status: 'won', cashoutAmount: '99' })).cashoutAmount).toBeNull();
  });
  it('rejects invalid dates', () => {
    expect(errorsFor({ betDate: 'yesterday' }).betDate).toBeDefined();
  });
});

describe('other schemas', () => {
  it('transactions need a positive amount', () => {
    expect(transactionFormSchema.safeParse({ type: 'deposit', amount: '0', occurredAt: '2026-01-01T10:00', description: '' }).success).toBe(false);
  });
  it('password change requires matching, different passwords', () => {
    expect(passwordChangeSchema.safeParse({ current: 'a', next: 'longenough1', confirm: 'different' }).success).toBe(false);
    expect(passwordChangeSchema.safeParse({ current: 'longenough1', next: 'longenough1', confirm: 'longenough1' }).success).toBe(false);
    expect(passwordChangeSchema.safeParse({ current: 'old', next: 'longenough1', confirm: 'longenough1' }).success).toBe(true);
  });
  it('CSV cells neutralise formula injection but keep numbers', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('-500.00')).toBe('-500.00');
    expect(csvCell('a,b')).toBe('"a,b"');
  });
});
