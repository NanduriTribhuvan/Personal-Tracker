import * as React from 'react';
import { ChevronLeft, ChevronRight, Download, ListChecks, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { toast } from 'sonner';
import { useBetActions } from '@/components/bets/BetActionsProvider';
import { BetList } from '@/components/bets/BetList';
import { DateRangePicker } from '@/components/DateRangePicker';
import { Money, PageHeader } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { useData } from '@/context/DataContext';
import { useDateRange } from '@/context/DateRangeContext';
import { useFilteredBets } from '@/hooks/useFilteredBets';
import { EMPTY_FILTERS, SORT_OPTIONS, activeFilterCount, applyFilters, sortBets, type BetFilters, type SortKey } from '@/lib/betFilters';
import { BET_TYPE_LABELS, STATUS_LABELS } from '@/lib/constants';
import { betsToCsv } from '@/lib/csv';
import { formatPercent } from '@/lib/format';
import { computeSummary } from '@/lib/stats';
import { cn, downloadFile, uniqueSorted } from '@/lib/utils';
import { BET_STATUSES, BET_TYPES } from '@/types';

const PAGE_SIZE = 20;

export function BetsPage() {
  const { bets: allBets, loading } = useData();
  const { preset, setPreset } = useDateRange();
  const inRange = useFilteredBets();
  const { openAdd } = useBetActions();
  const [filters, setFilters] = React.useState<BetFilters>(EMPTY_FILTERS);
  const [sort, setSort] = React.useState<SortKey>('newest');
  const [page, setPage] = React.useState(1);
  const [showFilters, setShowFilters] = React.useState(false);

  const sports = React.useMemo(() => uniqueSorted(allBets.map((b) => b.sport)), [allBets]);
  const books = React.useMemo(() => uniqueSorted(allBets.map((b) => b.bookmaker)), [allBets]);

  const filtered = React.useMemo(() => sortBets(applyFilters(inRange, filters), sort), [inRange, filters, sort]);
  const summary = React.useMemo(() => computeSummary(filtered), [filtered]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const pageItems = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const nFilters = activeFilterCount(filters);
  const anyFilter = nFilters > 0 || filters.search.trim() !== '' || preset !== 'all';

  React.useEffect(() => setPage(1), [filters, sort, inRange]);

  const update = <K extends keyof BetFilters>(k: K, v: BetFilters[K]) => setFilters((f) => ({ ...f, [k]: v }));

  const exportCsv = () => {
    if (!filtered.length) return;
    downloadFile(`edgetrack-bets-${new Date().toISOString().slice(0, 10)}.csv`, betsToCsv(filtered), 'text/csv;charset=utf-8');
    toast.success(`Exported ${filtered.length} bet${filtered.length === 1 ? '' : 's'} to CSV`);
  };

  const clearAll = () => {
    setFilters(EMPTY_FILTERS);
    setPreset('all');
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="My Bets"
        description="Search, filter, settle and manage every bet you've recorded."
        actions={
          <>
            <DateRangePicker />
            <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!filtered.length}>
              <Download /> Export CSV
            </Button>
            <Button size="sm" onClick={openAdd} className="hidden sm:inline-flex">
              <Plus /> Add bet
            </Button>
          </>
        }
      />

      <Card className="overflow-hidden">
        <div className="space-y-3 border-b border-border p-3 sm:p-4">
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" aria-hidden />
              <Input
                type="search"
                aria-label="Search bets"
                placeholder="Search bet, sport, event, sportsbook…"
                className="pl-9"
                value={filters.search}
                onChange={(e) => update('search', e.target.value)}
              />
            </div>
            <Button
              variant={showFilters || nFilters ? 'secondary' : 'outline'}
              className="h-11 shrink-0 sm:h-10"
              onClick={() => setShowFilters((s) => !s)}
              aria-expanded={showFilters}
              aria-controls="bet-filters"
            >
              <SlidersHorizontal />
              <span className="hidden sm:inline">Filters</span>
              {nFilters > 0 && <span className="grid size-5 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">{nFilters}</span>}
            </Button>
          </div>

          <div id="bet-filters" hidden={!showFilters} className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
            <FilterSelect id="f-status" label="Status" value={filters.status} onChange={(v) => update('status', v as BetFilters['status'])}>
              <option value="all">All statuses</option>
              <option value="settled">All settled</option>
              {BET_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect id="f-sport" label="Sport" value={filters.sport} onChange={(v) => update('sport', v)}>
              <option value="all">All sports</option>
              {sports.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect id="f-type" label="Bet type" value={filters.betType} onChange={(v) => update('betType', v as BetFilters['betType'])}>
              <option value="all">All types</option>
              {BET_TYPES.map((t) => (
                <option key={t} value={t}>
                  {BET_TYPE_LABELS[t]}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect id="f-book" label="Sportsbook" value={filters.bookmaker} onChange={(v) => update('bookmaker', v)}>
              <option value="all">All sportsbooks</option>
              {books.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect id="f-sort" label="Sort by" value={sort} onChange={(v) => setSort(v as SortKey)}>
              {Object.entries(SORT_OPTIONS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </FilterSelect>
          </div>

          {!loading && filtered.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-live="polite">
              <span>
                <strong className="font-semibold text-foreground">{filtered.length}</strong> bet{filtered.length === 1 ? '' : 's'}
              </span>
              <span>
                Staked <Money value={summary.totalStaked} className="text-foreground" />
              </span>
              <span>
                Net <Money value={summary.netProfit} signed colored className="font-semibold" />
              </span>
              <span>
                ROI <span className="text-foreground tabular">{formatPercent(summary.roi, { signed: true })}</span>
              </span>
              {anyFilter && (
                <button type="button" onClick={clearAll} className="ml-auto inline-flex items-center gap-1 text-primary hover:underline">
                  <X className="size-3" aria-hidden /> Clear filters
                </button>
              )}
            </div>
          )}
        </div>

        {loading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : allBets.length === 0 ? (
          <EmptyState
            icon={<ListChecks />}
            title="No bets yet"
            description="Record your first bet to start tracking payouts, profit and performance."
            action={
              <Button onClick={openAdd}>
                <Plus /> Add your first bet
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Search />}
            title="No bets match"
            description="Try a different search, or widen the date range and filters."
            action={
              <Button variant="secondary" onClick={clearAll}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <>
            <BetList bets={pageItems} />
            {pages > 1 && (
              <nav aria-label="Pagination" className="flex items-center justify-between gap-2 border-t border-border px-4 py-3 text-sm">
                <span className="text-muted-foreground tabular">
                  {(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, filtered.length)} of {filtered.length}
                </span>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label="Previous page" disabled={current === 1} onClick={() => setPage(current - 1)}>
                    <ChevronLeft />
                  </Button>
                  <span className="px-2 tabular text-muted-foreground" aria-current="page">
                    {current} / {pages}
                  </span>
                  <Button variant="ghost" size="icon-sm" aria-label="Next page" disabled={current === pages} onClick={() => setPage(current + 1)}>
                    <ChevronRight />
                  </Button>
                </div>
              </nav>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', id === 'f-sort' && 'col-span-2 md:col-span-1')}>
      <Label htmlFor={id} className="text-[11px] uppercase tracking-wide text-subtle-foreground">
        {label}
      </Label>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </Select>
    </div>
  );
}
