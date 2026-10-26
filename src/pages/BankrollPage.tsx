import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Landmark,
  MoreHorizontal,
  Pencil,
  PiggyBank,
  Plus,
  Trash2,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { CumulativeChart } from '@/components/charts';
import { Money, PageHeader } from '@/components/shared';
import { StatCard } from '@/components/StatCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ConfirmDialog,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown';
import { Field, Input, Select, fieldAria } from '@/components/ui/input';
import { Badge, EmptyState, Skeleton, Switch } from '@/components/ui/misc';
import { useData } from '@/context/DataContext';
import { bankrollSeries, computeBankroll, stakeExposure } from '@/lib/bankroll';
import { CURRENCY_META, TRANSACTION_LABELS } from '@/lib/constants';
import { toDateTimeLocalValue } from '@/lib/dateRange';
import { formatDate, formatPercent, pnlClass } from '@/lib/format';
import { cn } from '@/lib/utils';
import { formValuesToTransaction, transactionFormSchema, type TransactionFormValues } from '@/lib/validation';
import { CURRENCIES, type BankrollTransaction, type CurrencyCode, type TransactionType } from '@/types';

type TxModal = { mode: 'create'; type: TransactionType } | { mode: 'edit'; tx: BankrollTransaction } | null;

export function BankrollPage() {
  const { loading, transactions, bets, settings, deleteTransaction } = useData();
  const [modal, setModal] = React.useState<TxModal>(null);
  const [toDelete, setToDelete] = React.useState<BankrollTransaction | null>(null);

  const summary = React.useMemo(() => computeBankroll(transactions, bets), [transactions, bets]);
  const series = React.useMemo(
    () =>
      bankrollSeries(transactions, bets).map((p) => ({
        label: format(new Date(p.time), 'd MMM yy'),
        value: p.balance,
      })),
    [transactions, bets],
  );
  const exposure = React.useMemo(() => {
    const list = stakeExposure(transactions, bets).filter((e) => e.percent !== null);
    if (!list.length) return null;
    const pcts = list.map((e) => e.percent!);
    const warnAt = settings.stakeWarningPercent;
    return {
      avg: pcts.reduce((a, b) => a + b, 0) / pcts.length,
      max: Math.max(...pcts),
      over: settings.stakeWarningEnabled ? pcts.filter((p) => p > warnAt).length : null,
      latest: list.slice(-8).reverse(),
      count: list.length,
    };
  }, [transactions, bets, settings.stakeWarningEnabled, settings.stakeWarningPercent]);

  const sortedTx = React.useMemo(
    () => [...transactions].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.createdAt.localeCompare(a.createdAt)),
    [transactions],
  );
  const betNames = React.useMemo(() => new Map(bets.map((b) => [b.id, b])), [bets]);
  const hasInitial = transactions.some((t) => t.type === 'initial');

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Bankroll"
        description="Capital movements are tracked separately from betting profit."
        actions={
          summary.hasBankroll && (
            <>
              <Button variant="secondary" size="sm" onClick={() => setModal({ mode: 'create', type: 'withdrawal' })}>
                <ArrowUpRight /> Withdraw
              </Button>
              <Button size="sm" onClick={() => setModal({ mode: 'create', type: 'deposit' })}>
                <ArrowDownLeft /> Deposit
              </Button>
            </>
          )
        }
      />

      {loading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : !summary.hasBankroll ? (
        <Card>
          <EmptyState
            icon={<PiggyBank />}
            title="Set your starting bankroll"
            description="Record the amount you started with. Deposits and withdrawals are logged separately so your betting P/L stays pure."
            action={
              <Button onClick={() => setModal({ mode: 'create', type: 'initial' })}>
                <Plus /> Set initial bankroll
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-4 sm:space-y-6">
          <section aria-label="Bankroll summary" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard
              className="col-span-2 lg:col-span-1"
              emphasis
              label="Current bankroll"
              icon={<Wallet />}
              tone={summary.current < 0 ? 'loss' : 'neutral'}
              value={<Money value={summary.current} />}
              sub={
                summary.atRisk > 0 ? (
                  <>
                    <Money value={summary.atRisk} /> in pending bets
                  </>
                ) : (
                  'No stakes at risk'
                )
              }
            />
            <StatCard
              label="Net betting P/L"
              icon={<TrendingUp />}
              tone={summary.bettingProfit > 0 ? 'profit' : summary.bettingProfit < 0 ? 'loss' : 'neutral'}
              value={<Money value={summary.bettingProfit} signed />}
              sub={<span className={pnlClass(summary.growthPercent)}>{formatPercent(summary.growthPercent, { signed: true })} on capital</span>}
            />
            <StatCard
              label="Total deposits"
              icon={<ArrowDownLeft />}
              value={<Money value={summary.deposits} />}
              sub={
                <>
                  + <Money value={summary.initial} /> initial
                </>
              }
            />
            <StatCard label="Total withdrawals" icon={<ArrowUpRight />} value={<Money value={summary.withdrawals} />} sub="Cash taken out" />
          </section>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Bankroll over time</CardTitle>
                <CardDescription>Initial + deposits − withdrawals + settled results</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-3">
              {series.length < 2 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">Growth appears after your next transaction or settled bet.</p>
              ) : (
                <CumulativeChart data={series} neutral valueLabel="Balance" showPeriod={false} height={240} />
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:gap-6 lg:grid-cols-5">
            <Card className="overflow-hidden lg:col-span-3">
              <CardHeader className="pb-3 sm:pb-3">
                <div>
                  <CardTitle>Transactions</CardTitle>
                  <CardDescription>Full audit trail of capital movements</CardDescription>
                </div>
                {!hasInitial && (
                  <Button variant="ghost" size="sm" onClick={() => setModal({ mode: 'create', type: 'initial' })}>
                    <Plus /> Initial
                  </Button>
                )}
              </CardHeader>
              <ul className="divide-y divide-border border-t border-border">
                {sortedTx.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                    <div
                      className={cn(
                        'grid size-9 shrink-0 place-items-center rounded-lg',
                        t.type === 'withdrawal' ? 'bg-loss-soft text-loss' : t.type === 'deposit' ? 'bg-profit-soft text-profit' : 'bg-info-soft text-info',
                      )}
                      aria-hidden
                    >
                      {t.type === 'withdrawal' ? <ArrowUpRight className="size-4" /> : t.type === 'deposit' ? <ArrowDownLeft className="size-4" /> : <Landmark className="size-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{t.description || TRANSACTION_LABELS[t.type]}</p>
                      <p className="text-xs text-subtle-foreground">
                        {TRANSACTION_LABELS[t.type]} · {formatDate(t.occurredAt, settings.dateFormat)}
                      </p>
                    </div>
                    <span className={cn('shrink-0 text-sm font-semibold tabular', t.type === 'withdrawal' ? 'text-loss' : 'text-foreground')}>
                      {t.type === 'withdrawal' ? '−' : '+'}
                      <Money value={t.amount} />
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${TRANSACTION_LABELS[t.type]} on ${formatDate(t.occurredAt, settings.dateFormat)}`}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onSelect={() => setModal({ mode: 'edit', tx: t })}>
                          <Pencil /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem destructive onSelect={() => setToDelete(t)}>
                          <Trash2 /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                ))}
              </ul>
            </Card>

            <div className="space-y-4 sm:space-y-6 lg:col-span-2">
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Stake sizing</CardTitle>
                    <CardDescription>Stake as % of bankroll when placed</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  {!exposure ? (
                    <p className="text-sm text-muted-foreground">Place a bet after setting your bankroll to see stake sizing.</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <MiniStat label="Average" value={formatPercent(exposure.avg)} />
                        <MiniStat label="Largest" value={formatPercent(exposure.max)} />
                        <MiniStat
                          label="Over limit"
                          value={exposure.over === null ? 'Off' : String(exposure.over)}
                          className={exposure.over ? 'text-warning' : undefined}
                        />
                      </div>
                      <ul className="mt-4 space-y-2">
                        {exposure.latest.map((e) => {
                          const bet = betNames.get(e.betId);
                          const over = settings.stakeWarningEnabled && e.percent! > settings.stakeWarningPercent;
                          return (
                            <li key={e.betId} className="text-sm">
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate text-muted-foreground">{bet?.betName}</span>
                                <span className={cn('shrink-0 tabular', over && 'text-warning')}>{formatPercent(e.percent)}</span>
                              </div>
                              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface" aria-hidden>
                                <div
                                  className={cn('h-full rounded-full', over ? 'bg-warning' : 'bg-primary/70')}
                                  style={{ width: `${Math.min(100, (e.percent! / Math.max(10, exposure.max)) * 100)}%` }}
                                />
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                </CardContent>
              </Card>
              <BankrollSettingsCard />
            </div>
          </div>
        </div>
      )}

      <Dialog open={!!modal} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent size="sm">
          {modal && <TransactionForm key={modal.mode === 'edit' ? modal.tx.id : modal.type} modal={modal} hasInitial={hasInitial} onDone={() => setModal(null)} />}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete transaction?"
        description="This removes it from your bankroll balance and history. Betting results are unaffected."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!toDelete) return;
          try {
            await deleteTransaction(toDelete.id);
            toast.success('Transaction deleted');
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not delete');
            throw e;
          }
        }}
      />
    </div>
  );
}

function MiniStat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-lg bg-surface px-2 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn('mt-0.5 font-semibold tabular', className)}>{value}</div>
    </div>
  );
}

function TransactionForm({ modal, hasInitial, onDone }: { modal: NonNullable<TxModal>; hasInitial: boolean; onDone: () => void }) {
  const { createTransaction, updateTransaction, settings } = useData();
  const editing = modal.mode === 'edit' ? modal.tx : null;
  const [error, setError] = React.useState<string>();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: editing
      ? { type: editing.type, amount: String(editing.amount), occurredAt: toDateTimeLocalValue(editing.occurredAt), description: editing.description ?? '' }
      : { type: modal.mode === 'create' ? modal.type : 'deposit', amount: '', occurredAt: toDateTimeLocalValue(new Date()), description: '' },
  });
  const type = watch('type');
  const allowInitial = !hasInitial || editing?.type === 'initial';

  const submit = handleSubmit(async (values) => {
    setError(undefined);
    try {
      const input = formValuesToTransaction(values);
      if (editing) {
        await updateTransaction(editing.id, input);
        toast.success('Transaction updated');
      } else {
        await createTransaction(input);
        toast.success(`${TRANSACTION_LABELS[input.type]} recorded`);
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    }
  });

  return (
    <form onSubmit={submit} noValidate className="contents">
      <DialogHeader>
        <DialogTitle>{editing ? 'Edit transaction' : type === 'initial' ? 'Initial bankroll' : `Record ${type}`}</DialogTitle>
        <DialogDescription>Capital movements never count as betting profit or loss.</DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-4">
        <Field id="tx-type" label="Type" required>
          <Select {...register('type')} id="tx-type">
            {allowInitial && <option value="initial">Initial bankroll</option>}
            <option value="deposit">Deposit</option>
            <option value="withdrawal">Withdrawal</option>
          </Select>
        </Field>
        <Field id="tx-amount" label={`Amount (${CURRENCY_META[settings.currency].symbol})`} required error={errors.amount?.message}>
          <Input {...register('amount')} {...fieldAria('tx-amount', errors.amount?.message)} inputMode="decimal" placeholder="10000" autoFocus className="tabular" autoComplete="off" />
        </Field>
        <Field id="tx-date" label="Date" required error={errors.occurredAt?.message}>
          <Input type="datetime-local" {...register('occurredAt')} {...fieldAria('tx-date', errors.occurredAt?.message)} />
        </Field>
        <Field id="tx-desc" label="Description" error={errors.description?.message}>
          <Input {...register('description')} {...fieldAria('tx-desc', errors.description?.message)} placeholder="e.g. UPI top-up" autoComplete="off" />
        </Field>
        {error && (
          <p role="alert" className="flex items-start gap-2 text-sm text-loss">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {error}
          </p>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onDone} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {editing ? 'Save changes' : 'Save'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function BankrollSettingsCard() {
  const { settings, updateSettings } = useData();
  const [pct, setPct] = React.useState(String(settings.stakeWarningPercent));
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => setPct(String(settings.stakeWarningPercent)), [settings.stakeWarningPercent]);

  const save = async (patch: Partial<typeof settings>) => {
    setSaving(true);
    try {
      await updateSettings({ ...settings, ...patch });
      toast.success('Bankroll preferences saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const pctNum = Number(pct);
  const pctValid = Number.isFinite(pctNum) && pctNum >= 0.1 && pctNum <= 100;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Preferences</CardTitle>
          <CardDescription>Currency and stake-size warnings</CardDescription>
        </div>
        {settings.stakeWarningEnabled && <Badge tone="warning">Warn &gt; {settings.stakeWarningPercent}%</Badge>}
      </CardHeader>
      <CardContent className="space-y-4">
        <Field id="br-currency" label="Default currency">
          <Select id="br-currency" value={settings.currency} disabled={saving} onChange={(e) => save({ currency: e.target.value as CurrencyCode })}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {CURRENCY_META[c].symbol} {c} — {CURRENCY_META[c].name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="br-warn" className="text-sm">
            Warn on large stakes
            <span className="block text-xs text-muted-foreground">Shown in the bet form</span>
          </label>
          <Switch id="br-warn" checked={settings.stakeWarningEnabled} disabled={saving} onCheckedChange={(v) => save({ stakeWarningEnabled: v })} />
        </div>
        {settings.stakeWarningEnabled && (
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (pctValid) void save({ stakeWarningPercent: Math.round(pctNum * 100) / 100 });
            }}
          >
            <Field id="br-pct" label="Threshold (% of bankroll)" className="flex-1" error={pctValid ? undefined : 'Enter 0.1 – 100'}>
              <Input id="br-pct" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} aria-invalid={!pctValid || undefined} className="tabular" />
            </Field>
            <Button type="submit" variant="secondary" disabled={!pctValid || saving || pctNum === settings.stakeWarningPercent}>
              Save
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
