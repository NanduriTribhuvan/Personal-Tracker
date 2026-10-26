import * as React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useData } from '@/context/DataContext';
import { formatMoney, formatPercent } from '@/lib/format';
import type { Breakdown } from '@/lib/stats';
import { cn } from '@/lib/utils';

const PROFIT = '#34d399';
const LOSS = '#f87171';
const MUTED = '#5b6878';

function useMoney() {
  const { settings } = useData();
  return React.useCallback(
    (v: number, opts?: { signed?: boolean; compact?: boolean }) => formatMoney(v, settings.currency, opts),
    [settings.currency],
  );
}

function TooltipBox({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-border-strong bg-elevated/95 px-3 py-2 text-xs shadow-xl backdrop-blur">{children}</div>;
}

export interface SeriesPoint {
  label: string;
  value: number;
  period?: number;
  bets?: number;
}

/**
 * Cumulative line/area chart with the fill split at zero: green above the
 * line, red below, so profit and loss are always visually distinct.
 */
export function CumulativeChart({
  data,
  height = 260,
  valueLabel = 'Cumulative P/L',
  showPeriod = true,
  neutral = false,
}: {
  data: SeriesPoint[];
  height?: number;
  valueLabel?: string;
  showPeriod?: boolean;
  /** Use a single green tone (e.g. bankroll balance) instead of the zero split. */
  neutral?: boolean;
}) {
  const money = useMoney();
  const id = React.useId().replace(/:/g, '');
  const values = data.map((d) => d.value);
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const offset = max - min === 0 ? 1 : max / (max - min);

  const series = data.length === 1 ? [{ label: 'Start', value: 0 }, ...data] : data;

  return (
    <div style={{ height }} className="w-full" role="img" aria-label={`${valueLabel} chart, ${data.length} points, latest ${money(values.at(-1) ?? 0, { signed: !neutral })}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor={PROFIT} stopOpacity={0.35} />
              <stop offset={neutral ? 1 : offset} stopColor={PROFIT} stopOpacity={neutral ? 0 : 0.04} />
              {!neutral && <stop offset={offset} stopColor={LOSS} stopOpacity={0.04} />}
              {!neutral && <stop offset={1} stopColor={LOSS} stopOpacity={0.35} />}
            </linearGradient>
            <linearGradient id={`stroke-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor={PROFIT} />
              <stop offset={neutral ? 1 : offset} stopColor={PROFIT} />
              {!neutral && <stop offset={offset} stopColor={LOSS} />}
              {!neutral && <stop offset={1} stopColor={LOSS} />}
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} tickMargin={8} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(v: number) => money(v, { compact: true })}
            domain={neutral ? ['auto', 'auto'] : [min, max]}
          />
          {!neutral && <ReferenceLine y={0} stroke={MUTED} strokeDasharray="4 4" />}
          <Tooltip
            cursor={{ stroke: MUTED, strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as SeriesPoint;
              return (
                <TooltipBox>
                  <div className="mb-1 text-muted-foreground">{p.label}</div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">{valueLabel}</span>
                    <span className={cn('font-semibold tabular', !neutral && (p.value >= 0 ? 'text-profit' : 'text-loss'))}>
                      {money(p.value, { signed: !neutral })}
                    </span>
                  </div>
                  {showPeriod && p.period !== undefined && (
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">This period</span>
                      <span className={cn('tabular', p.period >= 0 ? 'text-profit' : 'text-loss')}>{money(p.period, { signed: true })}</span>
                    </div>
                  )}
                  {p.bets !== undefined && <div className="mt-0.5 text-subtle-foreground">{p.bets} settled bet{p.bets === 1 ? '' : 's'}</div>}
                </TooltipBox>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={`url(#stroke-${id})`}
            strokeWidth={2}
            fill={`url(#fill-${id})`}
            isAnimationActive={data.length < 400}
            animationDuration={500}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0, fill: '#e6edf3' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal bar chart of net P/L per category. */
export function BreakdownBars({ rows, metric = 'netProfit' }: { rows: Breakdown[]; metric?: 'netProfit' | 'roi' }) {
  const money = useMoney();
  const data = rows.map((r) => ({ ...r, value: metric === 'roi' ? (r.roi ?? 0) : r.netProfit }));
  const height = Math.max(120, data.length * 38 + 24);
  return (
    <div style={{ height }} className="w-full" role="img" aria-label={`Bar chart of ${metric === 'roi' ? 'ROI' : 'net profit'} by category`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }} barCategoryGap={8}>
          <CartesianGrid horizontal={false} strokeDasharray="3 3" />
          <XAxis
            type="number"
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => (metric === 'roi' ? `${v.toFixed(0)}%` : money(v, { compact: true }))}
          />
          <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={96} tick={{ fontSize: 11 }} interval={0} />
          <ReferenceLine x={0} stroke={MUTED} />
          <Tooltip
            cursor={{ fill: 'rgb(255 255 255 / 0.03)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const r = payload[0].payload as Breakdown;
              return (
                <TooltipBox>
                  <div className="mb-1 font-medium">{r.label}</div>
                  <div className={cn('tabular', r.netProfit >= 0 ? 'text-profit' : 'text-loss')}>Net {money(r.netProfit, { signed: true })}</div>
                  <div className="tabular text-muted-foreground">ROI {formatPercent(r.roi, { signed: true })}</div>
                  <div className="text-subtle-foreground">
                    {r.bets} bets · {r.wins}W–{r.losses}L
                  </div>
                </TooltipBox>
              );
            }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive animationDuration={400}>
            {data.map((d) => (
              <Cell key={d.key} fill={d.value >= 0 ? PROFIT : LOSS} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const DONUT_COLORS: Record<string, string> = { wins: PROFIT, losses: LOSS, pushes: '#8593a3', pending: '#fbbf24' };

export function OutcomeDonut({ data, center }: { data: { key: string; label: string; value: number }[]; center: React.ReactNode }) {
  const nonZero = data.filter((d) => d.value > 0);
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[200px]" role="img" aria-label={data.map((d) => `${d.label}: ${d.value}`).join(', ')}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={nonZero.length ? nonZero : [{ key: 'none', label: 'None', value: 1 }]}
            dataKey="value"
            nameKey="label"
            innerRadius="72%"
            outerRadius="100%"
            paddingAngle={nonZero.length > 1 ? 2 : 0}
            stroke="none"
            isAnimationActive
            animationDuration={500}
          >
            {(nonZero.length ? nonZero : [{ key: 'none' }]).map((d) => (
              <Cell key={d.key} fill={DONUT_COLORS[d.key] ?? '#1c2733'} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">{center}</div>
    </div>
  );
}

export { DONUT_COLORS };
