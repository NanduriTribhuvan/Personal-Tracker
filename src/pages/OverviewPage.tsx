import * as React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Award,
  CircleDollarSign,
  Clock,
  Hash,
  Percent,
  Plus,
  Sigma,
  Target,
  TrendingUp,
} from 'lucide-react';
import { useBetActions } from '@/components/bets/BetActionsProvider';
import { BetList } from '@/components/bets/BetList';
import { CumulativeChart } from '@/components/charts';
import { DateRangePicker } from '@/components/DateRangePicker';
import { Money, PageHeader, TrendIcon } from '@/components/shared';
import { StatCard } from '@/components/StatCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { useData } from '@/context/DataContext';
import { useDateRange } from '@/context/DateRangeContext';
import { useFilteredBets } from '@/hooks/useFilteredBets';
import { filterByRange, getPreviousPeriod } from '@/lib/dateRange';
import { formatOdds, formatPercent, pnlClass } from '@/lib/format';
import { computeSummary, percentChange, pnlSeries } from '@/lib/stats';
import { cn } from '@/lib/utils';

export function OverviewPage() {
  const { bets: allBets, loading, settings, profile } = useData();
  const { range } = useDateRange();
  const bets = useFilteredBets();
  const { openAdd } = useBetActions();

  const s = React.useMemo(() => computeSummary(bets), [bets]);

  // Comparison vs. the previous equally long period (only for bounded ranges with data).
  const change = React.useMemo(() => {
    const prev = getPreviousPeriod(range);
    if (!prev) return null;
    const prevSummary = computeSummary(filterByRange(allBets, prev, (b) => b.betDate));
    if (prevSummary.settledCount === 0) return null;
    return { pct: percentChange(s.netProfit, prevSummary.netProfit), prev: prevSummary.netProfit };
  }, [allBets, range, s.netProfit]);

  const series = React.useMemo(
    () => pnlSeries(bets, bets.length > 60 ? 'daily' : 'all').map((p) => ({ label: p.label, value: p.cumulative, period: p.period, bets: p.bets })),
    [bets],
  );
  const pending = React.useMemo(() => bets.filter((b) => b.status === 'pending').slice(0, 5), [bets]);
  const recent = React.useMemo(() => bets.slice(0, 6), [bets]);

  const odds = (v: number | null) => (v === null ? '—' : formatOdds(v, settings.oddsPrecision));
  const tone = (v: number) => (v > 0.004 ? 'profit' : v < -0.004 ? 'loss' : 'neutral') as const;

  const greeting = React.useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }, []);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={profile ? `${greeting}, ${profile.username}` : 'Overview'}
        description="Your realised performance at a glance."
        actions={<DateRangePicker />}
      />

      {!loading && allBets.length === 0 ? (
        <Card>
          <EmptyState
            icon={<TrendingUp />}
            title="Welcome to EdgeTrack"
            description="Add your first bet and every number on this dashboard will be calculated from your real records."
            action={
              <Button onClick={openAdd} size="lg">
                <Plus /> Add your first bet
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <section aria-label="Summary statistics" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard
              className="col-span-2 lg:col-span-1"
              emphasis
              label="Net profit / loss"
              loading={loading}
              tone={tone(s.netProfit)}
              icon={<CircleDollarSign />}
              value={<Money value={s.netProfit} signed />}
              sub={
                change && change.pct !== null ? (
                  <span className={cn('inline-flex items-center gap-1', pnlClass(change.pct))}>
                    <TrendIcon value={change.pct} />
                    {formatPercent(change.pct, { signed: true })}
                    <span className="text-muted-foreground">vs previous period</span>
                  </span>
                ) : (
                  `${s.settledCount} settled bet${s.settledCount === 1 ? '' : 's'}`
                )
              }
            />
            <StatCard
              label="ROI"
              loading={loading}
              tone={s.roi === null ? 'neutral' : tone(s.roi)}
              icon={<Percent />}
              value={formatPercent(s.roi, { signed: true })}
              sub={s.settledStake > 0 ? <>on <Money value={s.settledStake} /> settled</> : 'No settled bets'}
            />
            <StatCard
              label="Win rate"
              loading={loading}
              icon={<Target />}
              value={formatPercent(s.winRate)}
              sub={`${s.wins}W · ${s.losses}L${s.pushes ? ` · ${s.pushes} push` : ''}`}
            />
            <StatCard label="Total staked" loading={loading} icon={<Sigma />} value={<Money value={s.totalStaked} />} sub={`Across ${s.totalBets} bets`} />
            <StatCard label="Total bets" loading={loading} icon={<Hash />} value={s.totalBets} sub={`${s.settledCount} settled`} />
            <StatCard
              label="Pending"
              loading={loading}
              icon={<Clock />}
              value={s.pendingCount}
              sub={<><Money value={s.pendingStake} /> at stake</>}
            />
            <StatCard label="Average odds" loading={loading} icon={<Sigma />} value={odds(s.averageOdds)} sub="Decimal, all selected bets" />
            <StatCard
              label="Best bet"
              loading={loading}
              tone={s.bestBet ? 'profit' : 'neutral'}
              icon={<Award />}
              value={s.bestBet ? <Money value={s.bestBet.result.netProfit!} signed /> : '—'}
              sub={s.bestBet ? s.bestBet.bet.betName : 'No winning bets yet'}
            />
          </section>

          <div className="mt-4 grid gap-4 sm:mt-6 sm:gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <div>
                  <CardTitle>Cumulative profit / loss</CardTitle>
                  <CardDescription>Settled bets only, in bet-date order</CardDescription>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/analytics">
                    Analytics <ArrowRight />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="pt-3">
                {loading ? (
                  <Skeleton className="h-[240px] w-full" />
                ) : series.length === 0 ? (
                  <EmptyState className="py-14" icon={<TrendingUp />} title="Nothing settled yet" description="Your P/L curve appears once a bet in this range is settled." />
                ) : (
                  <CumulativeChart data={series} height={240} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Awaiting result</CardTitle>
                  <CardDescription>{s.pendingCount} pending in range</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="px-0 pb-2 pt-2 sm:px-0">
                {loading ? (
                  <div className="space-y-2 px-4">
                    <Skeleton className="h-12" />
                    <Skeleton className="h-12" />
                  </div>
                ) : pending.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm text-muted-foreground">No pending bets. You're all settled up.</p>
                ) : (
                  <PendingList bets={pending} />
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="mt-4 overflow-hidden sm:mt-6">
            <CardHeader className="pb-3 sm:pb-3">
              <div>
                <CardTitle>Recent bets</CardTitle>
                <CardDescription>Latest in the selected range</CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link to="/bets">
                  View all <ArrowRight />
                </Link>
              </Button>
            </CardHeader>
            {loading ? (
              <div className="space-y-2 p-4">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : recent.length === 0 ? (
              <p className="px-5 pb-8 pt-4 text-center text-sm text-muted-foreground">No bets in this date range.</p>
            ) : (
              <div className="border-t border-border">
                <BetList bets={recent} compact />
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function PendingList({ bets }: { bets: ReturnType<typeof useFilteredBets> }) {
  const { openSettle, openDetails } = useBetActions();
  const { settings } = useData();
  return (
    <ul className="divide-y divide-border">
      {bets.map((b) => (
        <li key={b.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openDetails(b)}>
            <p className="truncate text-sm font-medium">{b.betName}</p>
            <p className="truncate text-xs text-subtle-foreground tabular">
              <Money value={b.stake} /> @ {formatOdds(b.odds, settings.oddsPrecision)} · {b.sport}
            </p>
          </button>
          <Button size="sm" variant="secondary" className="h-8 shrink-0" onClick={() => openSettle(b)}>
            Settle
          </Button>
        </li>
      ))}
    </ul>
  );
}
