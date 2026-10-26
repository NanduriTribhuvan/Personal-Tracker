import * as React from 'react';
import { toast } from 'sonner';
import { Copy, Pencil, Trash2 } from 'lucide-react';
import { useData } from '@/context/DataContext';
import { BET_TYPE_LABELS, STATUS_LABELS } from '@/lib/constants';
import { formatDateTime, formatMoney, formatOdds, pnlClass } from '@/lib/format';
import { calculatePotential, safeSettle, settleBet } from '@/lib/settlement';
import { cn } from '@/lib/utils';
import { parseNumeric } from '@/lib/validation';
import type { Bet, BetStatus } from '@/types';
import { BET_STATUSES } from '@/types';
import { StatusBadge } from '../shared';
import { Button } from '../ui/button';
import {
  ConfirmDialog,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Field, Input, fieldAria } from '../ui/input';
import { BetForm } from './BetForm';

interface BetActions {
  openAdd: () => void;
  openEdit: (bet: Bet) => void;
  openDuplicate: (bet: Bet) => void;
  openSettle: (bet: Bet) => void;
  openDetails: (bet: Bet) => void;
  confirmDelete: (bet: Bet) => void;
}

const Ctx = React.createContext<BetActions | null>(null);

type Modal =
  | { kind: 'form'; bet?: Bet; duplicate?: boolean }
  | { kind: 'settle'; bet: Bet }
  | { kind: 'details'; bet: Bet }
  | { kind: 'delete'; bet: Bet }
  | null;

/** Hosts the add/edit/settle/details/delete dialogs so any screen can open them. */
export function BetActionsProvider({ children }: { children: React.ReactNode }) {
  const { createBet, updateBet, deleteBet, bets, settings } = useData();
  const [modal, setModal] = React.useState<Modal>(null);
  const close = () => setModal(null);

  const actions = React.useMemo<BetActions>(
    () => ({
      openAdd: () => setModal({ kind: 'form' }),
      openEdit: (bet) => setModal({ kind: 'form', bet }),
      openDuplicate: (bet) => setModal({ kind: 'form', bet, duplicate: true }),
      openSettle: (bet) => setModal({ kind: 'settle', bet }),
      openDetails: (bet) => setModal({ kind: 'details', bet }),
      confirmDelete: (bet) => setModal({ kind: 'delete', bet }),
    }),
    [],
  );

  // Keep dialogs showing the latest version of a bet after edits.
  const liveBet = modal && 'bet' in modal && modal.bet ? (bets.find((b) => b.id === modal.bet!.id) ?? modal.bet) : undefined;
  const isEdit = modal?.kind === 'form' && !!modal.bet && !modal.duplicate;

  const duplicateSeed = React.useMemo<Bet | undefined>(() => {
    if (modal?.kind !== 'form' || !modal.duplicate || !modal.bet) return undefined;
    return { ...modal.bet, status: 'pending', cashoutAmount: null, betDate: new Date().toISOString() };
  }, [modal]);

  return (
    <Ctx.Provider value={actions}>
      {children}

      <Dialog open={modal?.kind === 'form'} onOpenChange={(o) => !o && close()}>
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit bet' : modal?.kind === 'form' && modal.duplicate ? 'Duplicate bet' : 'Add a bet'}</DialogTitle>
          </DialogHeader>
          {modal?.kind === 'form' && (
            <BetForm
              key={modal.bet?.id ?? 'new'}
              initial={isEdit ? liveBet : duplicateSeed}
              onCancel={close}
              onSubmit={async (input) => {
                if (isEdit && modal.bet) {
                  await updateBet(modal.bet.id, input);
                  toast.success('Bet updated');
                } else {
                  await createBet(input);
                  const p = calculatePotential(input.stake, input.odds);
                  toast.success('Bet added', {
                    description: `${input.betName} · potential profit ${formatMoney(p.potentialProfit, settings.currency)}`,
                  });
                }
                close();
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={modal?.kind === 'settle'} onOpenChange={(o) => !o && close()}>
        <DialogContent size="sm">
          {modal?.kind === 'settle' && liveBet && (
            <SettleForm
              bet={liveBet}
              onCancel={close}
              onSave={async (status, cashoutAmount) => {
                await updateBet(liveBet.id, { ...liveBet, status, cashoutAmount });
                toast.success(`Settled as ${STATUS_LABELS[status]}`);
                close();
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={modal?.kind === 'details'} onOpenChange={(o) => !o && close()}>
        <DialogContent size="md">{modal?.kind === 'details' && liveBet && <BetDetails bet={liveBet} actions={actions} />}</DialogContent>
      </Dialog>

      <ConfirmDialog
        open={modal?.kind === 'delete'}
        onOpenChange={(o) => !o && close()}
        title="Delete this bet?"
        description={
          modal?.kind === 'delete' ? (
            <>
              <strong className="text-foreground">{modal.bet.betName}</strong> will be permanently removed from your history and
              statistics. Consider exporting a backup first.
            </>
          ) : null
        }
        confirmLabel="Delete bet"
        destructive
        onConfirm={async () => {
          if (modal?.kind !== 'delete') return;
          try {
            await deleteBet(modal.bet.id);
            toast.success('Bet deleted');
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not delete the bet');
            throw e;
          }
        }}
      />
    </Ctx.Provider>
  );
}

export function useBetActions() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error('useBetActions must be used within BetActionsProvider');
  return ctx;
}

function SettleForm({
  bet,
  onSave,
  onCancel,
}: {
  bet: Bet;
  onSave: (status: BetStatus, cashout: number | null) => Promise<void>;
  onCancel: () => void;
}) {
  const { settings } = useData();
  const [status, setStatus] = React.useState<BetStatus>(bet.status === 'pending' ? 'won' : bet.status);
  const [cashout, setCashout] = React.useState(bet.cashoutAmount !== null ? String(bet.cashoutAmount) : '');
  const [error, setError] = React.useState<string>();
  const [saving, setSaving] = React.useState(false);

  const cash = parseNumeric(cashout);
  const preview = status === 'cashed_out' && cash === null ? null : settleBet({ ...bet, status, cashoutAmount: cash });
  const fmt = (v: number, signed = false) => formatMoney(v, settings.currency, { signed });

  return (
    <form
      className="contents"
      onSubmit={async (e) => {
        e.preventDefault();
        if (status === 'cashed_out' && (cash === null || !/^\d+(\.\d{1,2})?$/.test(cashout.trim().replace(/,/g, '')))) {
          setError('Enter the cash-out amount you received (up to 2 decimals).');
          return;
        }
        setSaving(true);
        setError(undefined);
        try {
          await onSave(status, status === 'cashed_out' ? cash : null);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not settle the bet.');
        } finally {
          setSaving(false);
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>Settle bet</DialogTitle>
        <DialogDescription className="truncate">
          {bet.betName} · {fmt(bet.stake)} @ {formatOdds(bet.odds, settings.oddsPrecision)}
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-4">
        <div role="radiogroup" aria-label="Result" className="grid grid-cols-2 gap-2">
          {BET_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={status === s}
              onClick={() => setStatus(s)}
              className={cn(
                'h-11 rounded-lg border text-sm font-medium transition-colors',
                status === s ? 'border-primary bg-primary-soft text-foreground' : 'border-border bg-surface text-muted-foreground hover:text-foreground',
              )}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        {status === 'cashed_out' && (
          <Field id="settle-cashout" label="Cash-out amount received" required error={error}>
            <Input
              {...fieldAria('settle-cashout', error)}
              inputMode="decimal"
              autoFocus
              value={cashout}
              onChange={(e) => setCashout(e.target.value)}
              placeholder="0.00"
              className="tabular"
            />
          </Field>
        )}
        <div className="rounded-xl border border-border bg-surface p-3 text-sm">
          {preview?.isSettled ? (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Payout</span>
              <span className="tabular font-medium">{fmt(preview.payout!)}</span>
            </div>
          ) : (
            <p className="text-muted-foreground">{status === 'pending' ? 'Pending bets have no realised result.' : 'Enter the cash-out amount to preview.'}</p>
          )}
          {preview?.isSettled && (
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-muted-foreground">Net profit / loss</span>
              <span className={cn('tabular font-semibold', pnlClass(preview.netProfit))}>{fmt(preview.netProfit!, true)}</span>
            </div>
          )}
        </div>
        {error && status !== 'cashed_out' && (
          <p role="alert" className="text-sm text-loss">
            {error}
          </p>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          Save result
        </Button>
      </DialogFooter>
    </form>
  );
}

function BetDetails({ bet, actions }: { bet: Bet; actions: BetActions }) {
  const { settings } = useData();
  const r = safeSettle(bet);
  const fmt = (v: number, signed = false) => formatMoney(v, settings.currency, { signed });
  const rows: [string, React.ReactNode][] = [
    ['Sport', bet.sport],
    ['Bet type', BET_TYPE_LABELS[bet.betType]],
    ['League', bet.league],
    ['Event', bet.event],
    ['Sportsbook', bet.bookmaker],
    ['Placed', formatDateTime(bet.betDate, settings.dateFormat)],
    ['Settled', bet.settledAt ? formatDateTime(bet.settledAt, settings.dateFormat) : null],
    ['Reference ID', bet.referenceId],
    ['Last updated', formatDateTime(bet.updatedAt, settings.dateFormat)],
  ];

  return (
    <>
      <DialogHeader>
        <div className="mb-2">
          <StatusBadge status={bet.status} />
        </div>
        <DialogTitle className="break-words">{bet.betName}</DialogTitle>
        <DialogDescription>
          {[bet.event, bet.league].filter(Boolean).join(' · ') || bet.sport}
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Stake" value={fmt(bet.stake)} />
          <Stat label="Odds" value={formatOdds(bet.odds, settings.oddsPrecision)} />
          <Stat label={r.isSettled ? 'Payout' : 'Potential payout'} value={fmt(r.isSettled ? r.payout! : r.potentialPayout)} />
          <Stat
            label={r.isSettled ? 'Net P/L' : 'Potential profit'}
            value={fmt(r.isSettled ? r.netProfit! : r.potentialProfit, true)}
            className={r.isSettled ? pnlClass(r.netProfit) : 'text-muted-foreground'}
          />
        </div>
        {bet.status === 'cashed_out' && bet.cashoutAmount !== null && (
          <p className="text-sm text-muted-foreground">
            Cashed out for <span className="tabular text-foreground">{fmt(bet.cashoutAmount)}</span>.
          </p>
        )}
        <dl className="divide-y divide-border rounded-xl border border-border">
          {rows
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="flex items-start justify-between gap-4 px-3 py-2.5 text-sm">
                <dt className="shrink-0 text-muted-foreground">{k}</dt>
                <dd className="min-w-0 break-words text-right">{v}</dd>
              </div>
            ))}
        </dl>
        {bet.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {bet.tags.map((t) => (
              <span key={t} className="rounded-md bg-elevated px-2 py-0.5 text-xs text-muted-foreground">
                #{t}
              </span>
            ))}
          </div>
        )}
        {bet.notes && <p className="whitespace-pre-wrap rounded-xl bg-surface p-3 text-sm text-muted-foreground">{bet.notes}</p>}
      </DialogBody>
      <DialogFooter className="sm:justify-between">
        <Button variant="destructive-ghost" onClick={() => actions.confirmDelete(bet)}>
          <Trash2 /> Delete
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant="secondary" onClick={() => actions.openDuplicate(bet)}>
            <Copy /> Duplicate
          </Button>
          <Button variant="secondary" onClick={() => actions.openEdit(bet)}>
            <Pencil /> Edit
          </Button>
          <Button onClick={() => actions.openSettle(bet)}>{bet.status === 'pending' ? 'Settle' : 'Change result'}</Button>
        </div>
      </DialogFooter>
    </>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-surface px-3 py-2.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn('mt-0.5 truncate font-semibold tabular', className)}>{value}</div>
    </div>
  );
}
