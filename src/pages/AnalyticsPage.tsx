import * as React from 'react';
import { BarChart3, Plus } from 'lucide-react';
import { useBetActions } from '@/components/bets/BetActionsProvider';
import { BreakdownBars, CumulativeChart, DONUT_COLORS, OutcomeDonut } from '@/components/charts';
import { DateRangePicker } from '@/components/DateRangePicker';
import { Money, PageHeader, SampleNote } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, Segmented, Skeleton } from '@/components/ui/misc';
import { useData } from '@/context/DataContext';
import { useFilteredBets } from '@/hooks/useFilteredBets';
import { formatOdds, formatPercent, pnlClass } from '@/lib/format';
import {
  bestBreakdown,
  byBetType,
  byBookmaker,
  byOddsRange,
  bySport,
  byStakeSize,
  computeOutcomeOdds,
  computeStreaks,
  computeSummary,
  pnlSeries,
  statusDistribution,
  worstBreakdown,
  type Breakdown,
  type Granularity,
} from '@/lib/stats';
import { cn } from '@/lib/utils';

export function AnalyticsPage() {
  const { loading, bets: allBets, settings } = useData();
  const bets = useFilteredBets();
  const { openAdd } = useBetActions();
  const [granularity, setGranularity] = React.useState<Granularity>('daily');

  const summary = React.useMemo(() => computeSummary(bets), [bets]);
  const streaks = React.useMemo(() => computeStreaks(bets), [bets]);
  const outcomeOdds = React.useMemo(() => computeOutcomeOdds(bets), [bets]);
  const sports = React.useMemo(() => bySport(bets), [bets]);
  const types = React.useMemo(() => byBetType(bets), [bets]);
  const books = React.useMemo(() => byBookmaker(bets), [bets]);
  const oddsRanges = React.useMemo(() => byOddsRange(bets), [bets]);
  const stakeSizes = React.useMemo(() => byStakeSize(bets), [bets]);
  const distribution = React.useMemo(() => statusDistribution(bets), [bets]);
  const series = React.useMemo(
    () => pnlSeries(bets, granularity).map((p) => ({ label: p.label, value: p.cumulative, period: p.period, bets: p.bets })),
    [bets, granularity],
  );

  const bestSport = bestBreakdown(sports);
  const worstType = worstBreakdown(types);
  const odds = (v: number | null) => (v === null ? '—' : formatOdds(v, settings.oddsPrecision));

  if (loading) {
    return (
      <div>
        <PageHeader title="Analytics" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-80 lg:col-span-2" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  if (allBets.length === 0) {
    return (
      <div className="animate-fade-in">
        <PageHeader title="Analytics" />
        <Card>
          <EmptyState
            icon={<BarChart3 />}
            title="No data to analyse yet"
            description="Analytics are calculated from your real bets. Add a few and settle them to see trends here."
            action={
              <Button onClick={openAdd}>
                <Plus /> Add a bet
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <PageHeader title="Analytics" description="Where your edge comes from — and where it leaks." actions={<DateRangePicker />} />

      {summary.settledCount === 0 ? (
        <Card>
          <EmptyState
            icon={<BarChart3 />}
            title="No settled bets in this range"
            description={`${summary.pendingCount} pending bet${summary.pendingCount === 1 ? '' : 's'}. Settle bets or widen the date range to see analytics.`}
          />
        </Card>
      ) : (
        <div className="space-y-4 sm:space-y-6">
          <div className="grid gap-4 sm:gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader className="flex-col sm:flex-row">
                <div>
                  <CardTitle>Profit & loss over time</CardTitle>
                  <CardDescription>
                    Cumulative realised P/L ·{' '}
                    <Money value={summary.netProfit} signed colored className="font-medium" />
                  </CardDescription>
                </div>
                <Segmented
                  label="Chart granularity"
                  size="sm"
                  value={granularity}
                  onChange={setGranularity}
                  options={[
                    { value: 'daily', label: 'Daily' },
                    { value: 'weekly', label: 'Weekly' },
                    { value: 'monthly', label: 'Monthly' },
                    { value: 'all', label: 'Per bet' },
                  ]}
                />
              </CardHeader>
              <CardContent className="pt-3">
                <CumulativeChart data={series} height={280} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Outcomes</CardTitle>
                  <CardDescription>Win rate excludes pushes & pending</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <OutcomeDonut
                  data={distribution}
                  center={
                    <div>
                      <div className="text-2xl font-semibold tabular">{formatPercent(summary.winRate)}</div>
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Win rate</div>
                    </div>
                  }
                />
                <ul className="mt-5 grid grid-cols-2 gap-2">
                  {distribution.map((d) => (
                    <li key={d.key} className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-sm">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <span aria-hidden className="size-2 rounded-full" style={{ background: DONUT_COLORS[d.key] }} />
                        {d.label}
                      </span>
                      <span className="font-semibold tabular">{d.value}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          <section aria-label="Key metrics">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Metric label="Avg winning odds" value={odds(outcomeOdds.averageWinningOdds)} />
              <Metric label="Avg losing odds" value={odds(outcomeOdds.averageLosingOdds)} />
              <Metric label="Average stake" value={summary.averageStake === null ? '—' : <Money value={summary.averageStake} />} />
              <Metric
                label="Avg profit / settled bet"
                value={summary.averageProfit === null ? '—' : <Money value={summary.averageProfit} signed colored />}
              />
              <Metric
                label="Largest win"
                value={summary.bestBet ? <Money value={summary.bestBet.result.netProfit!} signed colored /> : '—'}
                sub={summary.bestBet?.bet.betName}
              />
              <Metric
                label="Largest loss"
                value={summary.worstBet ? <Money value={summary.worstBet.result.netProfit!} signed colored /> : '—'}
                sub={summary.worstBet?.bet.betName}
              />
              <Metric label="Longest win streak" value={streaks.longestWin} />
              <Metric label="Longest losing streak" value={streaks.longestLoss} />
              <Metric
                label="Current streak"
                value={
                  streaks.current.type ? (
                    <span className={streaks.current.type === 'win' ? 'text-profit' : 'text-loss'}>
                      {streaks.current.length} {streaks.current.type === 'win' ? 'W' : 'L'}
                    </span>
                  ) : (
                    '—'
                  )
                }
              />
              <Metric
                label="Best sport"
                value={bestSport ? <span className="truncate">{bestSport.label}</span> : '—'}
                sub={bestSport ? <Money value={bestSport.netProfit} signed colored /> : undefined}
              />
              <Metric
                label="Worst bet type"
                value={worstType ? <span className="truncate">{worstType.label}</span> : '—'}
                sub={worstType ? <Money value={worstType.netProfit} signed colored /> : undefined}
              />
              <Metric label="ROI" value={<span className={pnlClass(summary.roi)}>{formatPercent(summary.roi, { signed: true })}</span>} />
            </dl>
            <div className="mt-3">
              <SampleNote settled={summary.settledCount} />
            </div>
          </section>

          <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
            <BreakdownCard title="Net P/L by sport" rows={sports} />
            <BreakdownCard title="Net P/L by bet type" rows={types} />
            <BreakdownCard title="ROI by sportsbook" rows={books} metric="roi" />
            <BreakdownCard title="Profit / loss by odds range" rows={oddsRanges} keepOrder />
            <BreakdownCard
              title="Performance by stake size"
              description="Buckets relative to your median stake"
              rows={stakeSizes}
              keepOrder
              className="lg:col-span-2"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card px-3.5 py-3">
      <dt className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate text-lg font-semibold tabular">{value}</dd>
      {sub && <dd className="truncate text-xs text-subtle-foreground">{sub}</dd>}
    </div>
  );
}

function BreakdownCard({
  title,
  description,
  rows,
  metric = 'netProfit',
  keepOrder,
  className,
}: {
  title: string;
  description?: string;
  rows: Breakdown[];
  metric?: 'netProfit' | 'roi';
  keepOrder?: boolean;
  className?: string;
}) {
  const settledRows = rows.filter((r) => r.settled > 0);
  const sorted = keepOrder ? settledRows : [...settledRows].sort((a, b) => (metric === 'roi' ? (b.roi ?? 0) - (a.roi ?? 0) : b.netProfit - a.netProfit));
  const chartRows = sorted.slice(0, 10);
  return (
    <Card className={cn('min-w-0', className)}>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
      </CardHeader>
      <CardContent className="pt-3">
        {sorted.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No settled bets in this range.</p>
        ) : (
          <>
            <BreakdownBars rows={chartRows} metric={metric} />
            <div className="mt-4 overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-subtle-foreground">
                    <th scope="col" className="py-2 pr-2 font-medium">Group</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">Bets</th>
                    <th scope="col" className="hidden px-2 py-2 text-right font-medium min-[420px]:table-cell">W–L</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">Net</th>
                    <th scope="col" className="py-2 pl-2 text-right font-medium">ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.key} className="border-b border-border/50 last:border-0">
                      <th scope="row" className="max-w-[10rem] truncate py-2 pr-2 text-left font-normal">
                        {r.label}
                      </th>
                      <td className="px-2 py-2 text-right tabular text-muted-foreground">{r.bets}</td>
                      <td className="hidden px-2 py-2 text-right tabular text-muted-foreground min-[420px]:table-cell">
                        {r.wins}–{r.losses}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right font-medium">
                        <Money value={r.netProfit} signed colored />
                      </td>
                      <td className={cn('whitespace-nowrap py-2 pl-2 text-right tabular', pnlClass(r.roi))}>{formatPercent(r.roi, { signed: true })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
