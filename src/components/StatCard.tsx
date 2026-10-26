import * as React from 'react';
import { cn } from '@/lib/utils';
import { Card } from './ui/card';
import { Skeleton } from './ui/misc';

export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = 'neutral',
  loading,
  emphasis,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: 'neutral' | 'profit' | 'loss';
  loading?: boolean;
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        'relative min-w-0 overflow-hidden p-4 transition-colors hover:border-border-strong sm:p-5',
        emphasis && tone === 'profit' && 'border-profit/25',
        emphasis && tone === 'loss' && 'border-loss/25',
        className,
      )}
    >
      {emphasis && (
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute -right-10 -top-10 size-32 rounded-full blur-3xl',
            tone === 'profit' ? 'bg-profit/15' : tone === 'loss' ? 'bg-loss/15' : 'bg-primary/10',
          )}
        />
      )}
      <div className="relative flex items-center justify-between gap-2">
        <p className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:text-xs">{label}</p>
        {icon && <span className="text-subtle-foreground [&_svg]:size-4">{icon}</span>}
      </div>
      {loading ? (
        <>
          <Skeleton className="mt-3 h-7 w-24" />
          <Skeleton className="mt-2 h-3.5 w-16" />
        </>
      ) : (
        <>
          <div
            className={cn(
              'relative mt-2 truncate font-semibold tracking-tight tabular',
              emphasis ? 'text-2xl sm:text-[28px]' : 'text-xl sm:text-2xl',
              tone === 'profit' && 'text-profit',
              tone === 'loss' && 'text-loss',
            )}
          >
            {value}
          </div>
          {sub && <div className="relative mt-1 truncate text-xs text-muted-foreground">{sub}</div>}
        </>
      )}
    </Card>
  );
}
