import { CheckCircle2, Copy, Eye, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useData } from '@/context/DataContext';
import { BET_TYPE_SHORT_LABELS } from '@/lib/constants';
import { formatDate, formatDateTime, formatMoney, formatOdds, pnlClass } from '@/lib/format';
import { displayPayout, safeSettle } from '@/lib/settlement';
import { cn } from '@/lib/utils';
import type { Bet } from '@/types';
import { StatusBadge } from '../shared';
import { Button } from '../ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/dropdown';
import { useBetActions } from './BetActionsProvider';

function RowMenu({ bet }: { bet: Bet }) {
  const a = useBetActions();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${bet.betName}`} onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={() => a.openDetails(bet)}>
          <Eye /> View details
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => a.openSettle(bet)}>
          <CheckCircle2 /> {bet.status === 'pending' ? 'Settle' : 'Change result'}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => a.openEdit(bet)}>
          <Pencil /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => a.openDuplicate(bet)}>
          <Copy /> Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={() => a.confirmDelete(bet)}>
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function BetList({ bets, compact = false }: { bets: Bet[]; compact?: boolean }) {
  const { settings } = useData();
  const a = useBetActions();
  const money = (v: number, signed = false) => formatMoney(v, settings.currency, { signed });

  return (
    <>
      {/* Desktop / tablet table */}
      <div className={cn('hidden overflow-x-auto scrollbar-thin', compact ? 'xl:block' : 'md:block')}>
        <table className="w-full text-sm">
          <caption className="sr-only">Bets</caption>
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-subtle-foreground">
              <th scope="col" className="py-2.5 pl-4 pr-2 font-medium sm:pl-5">Date</th>
              <th scope="col" className="px-2 py-2.5 font-medium">Bet</th>
              {!compact && <th scope="col" className="px-2 py-2.5 font-medium">Sport</th>}
              {!compact && <th scope="col" className="px-2 py-2.5 font-medium">Type</th>}
              <th scope="col" className="px-2 py-2.5 text-right font-medium">Stake</th>
              <th scope="col" className="px-2 py-2.5 text-right font-medium">Odds</th>
              <th scope="col" className="px-2 py-2.5 text-right font-medium">Payout</th>
              <th scope="col" className="px-2 py-2.5 text-right font-medium">Net P/L</th>
              <th scope="col" className="px-2 py-2.5 font-medium">Status</th>
              <th scope="col" className="py-2.5 pl-2 pr-4 text-right font-medium sm:pr-5">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {bets.map((bet) => {
              const r = safeSettle(bet);
              const p = displayPayout(r);
              return (
                <tr
                  key={bet.id}
                  className="group cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-card-hover/60"
                  onClick={() => a.openDetails(bet)}
                >
                  <td className="whitespace-nowrap py-3 pl-4 pr-2 text-muted-foreground tabular sm:pl-5" title={formatDateTime(bet.betDate, settings.dateFormat)}>
                    {formatDate(bet.betDate, settings.dateFormat)}
                  </td>
                  <td className="max-w-[16rem] px-2 py-3">
                    <button
                      type="button"
                      className="block max-w-full truncate text-left font-medium hover:text-primary focus-visible:text-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        a.openDetails(bet);
                      }}
                    >
                      {bet.betName}
                    </button>
                    {(bet.event || bet.bookmaker) && (
                      <div className="truncate text-xs text-subtle-foreground">{[bet.event, bet.bookmaker].filter(Boolean).join(' · ')}</div>
                    )}
                    {compact && <div className="truncate text-xs text-subtle-foreground">{bet.sport}</div>}
                  </td>
                  {!compact && <td className="whitespace-nowrap px-2 py-3 text-muted-foreground">{bet.sport}</td>}
                  {!compact && <td className="whitespace-nowrap px-2 py-3 text-muted-foreground">{BET_TYPE_SHORT_LABELS[bet.betType]}</td>}
                  <td className="whitespace-nowrap px-2 py-3 text-right tabular">{money(bet.stake)}</td>
                  <td className="whitespace-nowrap px-2 py-3 text-right tabular">{formatOdds(bet.odds, settings.oddsPrecision)}</td>
                  <td className={cn('whitespace-nowrap px-2 py-3 text-right tabular', p.isPotential && 'text-subtle-foreground')}>
                    {money(p.value)}
                    {p.isPotential && <span className="sr-only"> (potential)</span>}
                  </td>
                  <td className={cn('whitespace-nowrap px-2 py-3 text-right font-medium tabular', pnlClass(r.netProfit))}>
                    {r.netProfit === null ? <span className="text-subtle-foreground">—</span> : money(r.netProfit, true)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-3">
                    <StatusBadge status={bet.status} />
                  </td>
                  <td className="whitespace-nowrap py-2 pl-2 pr-3 text-right sm:pr-4">
                    <div className="flex items-center justify-end gap-1">
                      {bet.status === 'pending' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            a.openSettle(bet);
                          }}
                        >
                          Settle
                        </Button>
                      )}
                      <RowMenu bet={bet} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className={cn('divide-y divide-border', compact ? 'xl:hidden' : 'md:hidden')} aria-label="Bets">
        {bets.map((bet) => {
          const r = safeSettle(bet);
          const p = displayPayout(r);
          return (
            <li key={bet.id} className="relative">
              <div className="flex items-start gap-3 px-4 py-3.5">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left after:absolute after:inset-0 after:content-['']"
                  onClick={() => a.openDetails(bet)}
                  aria-label={`${bet.betName}, view details`}
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{bet.betName}</span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-subtle-foreground">
                    {formatDate(bet.betDate, settings.dateFormat)} · {bet.sport} · {BET_TYPE_SHORT_LABELS[bet.betType]}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular text-muted-foreground">
                    <span>
                      <span className="text-subtle-foreground">Stake</span> {money(bet.stake)}
                    </span>
                    <span>
                      <span className="text-subtle-foreground">@</span> {formatOdds(bet.odds, settings.oddsPrecision)}
                    </span>
                    <span>
                      <span className="text-subtle-foreground">{p.isPotential ? 'To return' : 'Paid'}</span> {money(p.value)}
                    </span>
                  </div>
                </button>
                <div className="relative z-10 flex shrink-0 flex-col items-end gap-1.5">
                  <StatusBadge status={bet.status} />
                  <span className={cn('text-sm font-semibold tabular', pnlClass(r.netProfit))}>
                    {r.netProfit === null ? <span className="text-subtle-foreground">—</span> : money(r.netProfit, true)}
                  </span>
                  <div className="-mr-2 flex items-center">
                    {bet.status === 'pending' && (
                      <Button size="sm" variant="secondary" className="h-8 px-2.5 text-xs" onClick={() => a.openSettle(bet)}>
                        Settle
                      </Button>
                    )}
                    <RowMenu bet={bet} />
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
