import * as React from 'react';
import { useForm, useWatch, type Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, ChevronDown, Info } from 'lucide-react';
import { useData } from '@/context/DataContext';
import { computeBankroll, exceedsStakeWarning, stakePercentOfBankroll } from '@/lib/bankroll';
import { BET_TYPE_LABELS, BOOKMAKER_SUGGESTIONS, SPORT_SUGGESTIONS, STATUS_LABELS } from '@/lib/constants';
import { toDateTimeLocalValue } from '@/lib/dateRange';
import { formatMoney, formatPercent, pnlClass } from '@/lib/format';
import { calculatePotential, isValidOdds, isValidStake, settleBet } from '@/lib/settlement';
import { cn, uniqueSorted } from '@/lib/utils';
import { betFormSchema, formValuesToBetInput, parseNumeric, type BetFormValues } from '@/lib/validation';
import { BET_STATUSES, BET_TYPES, type Bet, type BetInput, type BetStatus, type CurrencyCode } from '@/types';
import { Button } from '../ui/button';
import { DialogBody, DialogFooter } from '../ui/dialog';
import { Field, Input, Select, Textarea, fieldAria } from '../ui/input';

export function betToFormValues(bet: Bet): BetFormValues {
  return {
    betName: bet.betName,
    sport: bet.sport,
    betType: bet.betType,
    stake: String(bet.stake),
    odds: String(bet.odds),
    status: bet.status,
    cashoutAmount: bet.cashoutAmount === null ? '' : String(bet.cashoutAmount),
    betDate: toDateTimeLocalValue(bet.betDate),
    bookmaker: bet.bookmaker ?? '',
    league: bet.league ?? '',
    event: bet.event ?? '',
    notes: bet.notes ?? '',
    referenceId: bet.referenceId ?? '',
    tags: bet.tags.join(', '),
  };
}

export function emptyFormValues(defaults: { stake: number | null; status: BetStatus }): BetFormValues {
  return {
    betName: '',
    sport: '',
    betType: 'moneyline',
    stake: defaults.stake ? String(defaults.stake) : '',
    odds: '',
    status: defaults.status,
    cashoutAmount: '',
    betDate: toDateTimeLocalValue(new Date()),
    bookmaker: '',
    league: '',
    event: '',
    notes: '',
    referenceId: '',
    tags: '',
  };
}

interface BetFormProps {
  initial?: Bet;
  onSubmit: (input: BetInput) => Promise<void>;
  onCancel: () => void;
}

export function BetForm({ initial, onSubmit, onCancel }: BetFormProps) {
  const { settings, bets } = useData();
  const defaults = React.useMemo(
    () => (initial ? betToFormValues(initial) : emptyFormValues({ stake: settings.defaultStake, status: settings.defaultStatus })),
    [initial, settings.defaultStake, settings.defaultStatus],
  );
  const hasOptional = !!(defaults.bookmaker || defaults.league || defaults.event || defaults.notes || defaults.referenceId || defaults.tags);
  const [showMore, setShowMore] = React.useState(hasOptional);
  const [submitError, setSubmitError] = React.useState<string>();

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<BetFormValues>({ resolver: zodResolver(betFormSchema), defaultValues: defaults, mode: 'onTouched' });

  const status = useWatch({ control, name: 'status' });
  const sportOptions = React.useMemo(() => uniqueSorted([...bets.map((b) => b.sport), ...SPORT_SUGGESTIONS]), [bets]);
  const bookOptions = React.useMemo(() => uniqueSorted([...bets.map((b) => b.bookmaker), ...BOOKMAKER_SUGGESTIONS]), [bets]);

  const submit = handleSubmit(async (values) => {
    setSubmitError(undefined);
    try {
      await onSubmit(formValuesToBetInput(values));
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Could not save the bet.');
    }
  });

  const decimalInput = { inputMode: 'decimal' as const, autoComplete: 'off', spellCheck: false };

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <DialogBody className="space-y-4">
        <Field id="betName" label="Pick / bet name" required error={errors.betName?.message}>
          <Input
            {...register('betName')}
            {...fieldAria('betName', errors.betName?.message)}
            placeholder="e.g. India to win"
            autoComplete="off"
            autoFocus={!initial}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field id="stake" label={`Stake (${currencySymbolFor(settings.currency)})`} required error={errors.stake?.message}>
            <Input {...register('stake')} {...fieldAria('stake', errors.stake?.message)} {...decimalInput} placeholder="500" className="tabular" />
          </Field>
          <Field id="odds" label="Decimal odds" required error={errors.odds?.message}>
            <Input {...register('odds')} {...fieldAria('odds', errors.odds?.message)} {...decimalInput} placeholder="1.90" className="tabular" />
          </Field>
        </div>

        <LivePreview control={control} currency={settings.currency} />

        <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
          <Field id="sport" label="Sport / category" required error={errors.sport?.message}>
            <Input {...register('sport')} {...fieldAria('sport', errors.sport?.message)} list="sport-options" placeholder="Cricket" autoComplete="off" />
            <datalist id="sport-options">
              {sportOptions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
          <Field id="betType" label="Bet type" required error={errors.betType?.message}>
            <Select {...register('betType')} {...fieldAria('betType', errors.betType?.message)}>
              {BET_TYPES.map((t) => (
                <option key={t} value={t}>
                  {BET_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <fieldset className="space-y-1.5">
          <legend className="mb-1.5 text-[13px] font-medium text-muted-foreground">
            Status<span className="ml-0.5 text-loss" aria-hidden>*</span>
          </legend>
          <StatusChips value={status} onChange={(s) => setValue('status', s, { shouldValidate: true, shouldDirty: true })} />
        </fieldset>

        {status === 'cashed_out' && (
          <Field
            id="cashoutAmount"
            label={`Cash-out amount received (${currencySymbolFor(settings.currency)})`}
            required
            error={errors.cashoutAmount?.message}
            hint="The total the bookmaker paid you when you cashed out."
          >
            <Input
              {...register('cashoutAmount')}
              {...fieldAria('cashoutAmount', errors.cashoutAmount?.message, true)}
              {...decimalInput}
              placeholder="0.00"
              className="tabular"
            />
          </Field>
        )}

        <Field id="betDate" label="Placed at" required error={errors.betDate?.message} hint="Your local time.">
          <Input type="datetime-local" {...register('betDate')} {...fieldAria('betDate', errors.betDate?.message, true)} />
        </Field>

        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          aria-expanded={showMore}
          aria-controls="bet-optional-fields"
          className="flex w-full items-center justify-between rounded-lg border border-dashed border-border-strong px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <span>Sportsbook, event, tags & notes</span>
          <ChevronDown className={cn('size-4 transition-transform', showMore && 'rotate-180')} aria-hidden />
        </button>

        <div id="bet-optional-fields" hidden={!showMore} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
            <Field id="bookmaker" label="Sportsbook / platform" error={errors.bookmaker?.message}>
              <Input {...register('bookmaker')} {...fieldAria('bookmaker', errors.bookmaker?.message)} list="book-options" placeholder="Bet365" autoComplete="off" />
              <datalist id="book-options">
                {bookOptions.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>
            <Field id="league" label="League / competition" error={errors.league?.message}>
              <Input {...register('league')} {...fieldAria('league', errors.league?.message)} placeholder="IPL" autoComplete="off" />
            </Field>
          </div>
          <Field id="event" label="Event / matchup" error={errors.event?.message}>
            <Input {...register('event')} {...fieldAria('event', errors.event?.message)} placeholder="India vs Australia" autoComplete="off" />
          </Field>
          <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
            <Field id="referenceId" label="Bet reference ID" error={errors.referenceId?.message}>
              <Input {...register('referenceId')} {...fieldAria('referenceId', errors.referenceId?.message)} placeholder="Slip #" autoComplete="off" />
            </Field>
            <Field id="tags" label="Tags" error={errors.tags?.message} hint="Comma separated">
              <Input {...register('tags')} {...fieldAria('tags', errors.tags?.message, true)} placeholder="value, tipster" autoComplete="off" />
            </Field>
          </div>
          <Field id="notes" label="Notes" error={errors.notes?.message}>
            <Textarea {...register('notes')} {...fieldAria('notes', errors.notes?.message)} rows={3} placeholder="Reasoning, line movement…" />
          </Field>
        </div>

        {submitError && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-loss/30 bg-loss-soft px-3 py-2 text-sm text-loss">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {submitError}
          </p>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting} className="sm:min-w-32">
          {initial ? 'Save changes' : 'Add bet'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function currencySymbolFor(currency: CurrencyCode) {
  return formatMoney(0, currency).replace(/[\d.,\s]/g, '') || currency;
}

function StatusChips({ value, onChange }: { value: BetStatus; onChange: (s: BetStatus) => void }) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const tone: Record<BetStatus, string> = {
    pending: 'data-[on=true]:border-warning/60 data-[on=true]:bg-warning-soft data-[on=true]:text-warning',
    won: 'data-[on=true]:border-profit/60 data-[on=true]:bg-profit-soft data-[on=true]:text-profit',
    half_won: 'data-[on=true]:border-profit/60 data-[on=true]:bg-profit-soft data-[on=true]:text-profit',
    lost: 'data-[on=true]:border-loss/60 data-[on=true]:bg-loss-soft data-[on=true]:text-loss',
    half_lost: 'data-[on=true]:border-loss/60 data-[on=true]:bg-loss-soft data-[on=true]:text-loss',
    void: 'data-[on=true]:border-border-strong data-[on=true]:bg-elevated data-[on=true]:text-foreground',
    cashed_out: 'data-[on=true]:border-info/60 data-[on=true]:bg-info-soft data-[on=true]:text-info',
  };
  return (
    <div role="radiogroup" aria-label="Status" className="grid grid-cols-2 gap-1.5 min-[400px]:grid-cols-4">
      {BET_STATUSES.map((s, i) => (
        <button
          key={s}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={value === s}
          data-on={value === s}
          tabIndex={value === s ? 0 : -1}
          onClick={() => onChange(s)}
          onKeyDown={(e) => {
            const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
            if (!dir) return;
            e.preventDefault();
            const next = (i + dir + BET_STATUSES.length) % BET_STATUSES.length;
            onChange(BET_STATUSES[next]);
            refs.current[next]?.focus();
          }}
          className={cn(
            'h-10 rounded-lg border border-border bg-surface px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground sm:h-9',
            tone[s],
          )}
        >
          {STATUS_LABELS[s]}
        </button>
      ))}
    </div>
  );
}

/** Instant payout / profit preview — recalculates on every keystroke. */
function LivePreview({ control, currency }: { control: Control<BetFormValues>; currency: CurrencyCode }) {
  const { transactions, bets, settings } = useData();
  const [stakeRaw, oddsRaw, status, cashoutRaw] = useWatch({ control, name: ['stake', 'odds', 'status', 'cashoutAmount'] });
  const stake = parseNumeric(stakeRaw);
  const odds = parseNumeric(oddsRaw);
  const valid = stake !== null && odds !== null && isValidStake(stake) && isValidOdds(odds);
  const potential = valid ? calculatePotential(stake, odds) : null;

  let realised: { payout: number; netProfit: number } | null = null;
  if (valid && status !== 'pending') {
    const cash = parseNumeric(cashoutRaw);
    if (status !== 'cashed_out' || cash !== null) {
      const r = settleBet({ stake, odds, status, cashoutAmount: cash });
      realised = { payout: r.payout!, netProfit: r.netProfit! };
    }
  }

  const bankroll = React.useMemo(() => computeBankroll(transactions, bets), [transactions, bets]);
  const pctOfBankroll = stake !== null && bankroll.hasBankroll ? stakePercentOfBankroll(stake, bankroll.current) : null;
  const warn = stake !== null && bankroll.hasBankroll && exceedsStakeWarning(stake, bankroll.current, settings);
  const fmt = (v: number, signed = false) => formatMoney(v, currency, { signed });

  return (
    <section aria-label="Calculation preview" aria-live="polite" className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.07] to-transparent p-3.5">
      <div className="grid grid-cols-3 gap-2 text-center">
        <PreviewStat label="Potential payout" value={potential ? fmt(potential.potentialPayout) : '—'} />
        <PreviewStat label="Potential profit" value={potential ? fmt(potential.potentialProfit, true) : '—'} className={potential ? 'text-profit' : undefined} />
        <PreviewStat label="Return" value={potential ? formatPercent(potential.returnPercent, { signed: true }) : '—'} />
      </div>
      {realised && (
        <div className="mt-3 flex items-center justify-between rounded-lg bg-surface/70 px-3 py-2 text-[13px]">
          <span className="text-muted-foreground">As {STATUS_LABELS[status].toLowerCase()}:</span>
          <span className="tabular">
            payout <strong className="font-semibold">{fmt(realised.payout)}</strong> ·{' '}
            <strong className={cn('font-semibold', pnlClass(realised.netProfit))}>{fmt(realised.netProfit, true)}</strong>
          </span>
        </div>
      )}
      <p className="mt-2.5 flex items-start gap-1.5 text-[11.5px] leading-snug text-muted-foreground">
        <Info className="mt-px size-3.5 shrink-0" aria-hidden />
        <span>
          Payout = stake × odds and <em>includes your returned stake</em>. Profit = stake × (odds − 1).
          {pctOfBankroll !== null && (
            <>
              {' '}
              This stake is <span className="tabular font-medium text-foreground">{formatPercent(pctOfBankroll)}</span> of your bankroll.
            </>
          )}
        </span>
      </p>
      {warn && (
        <p role="status" className="mt-2 flex items-center gap-1.5 rounded-md bg-warning-soft px-2.5 py-1.5 text-xs text-warning">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
          Above your {settings.stakeWarningPercent}% stake warning threshold.
        </p>
      )}
    </section>
  );
}

function PreviewStat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn('mt-0.5 truncate text-[15px] font-semibold tabular sm:text-base', className)} data-testid={`preview-${label.toLowerCase().replace(/\s+/g, '-')}`}>
        {value}
      </div>
    </div>
  );
}
