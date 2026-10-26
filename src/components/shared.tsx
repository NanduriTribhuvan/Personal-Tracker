import * as React from 'react';
import { AlertTriangle, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { useData } from '@/context/DataContext';
import { STATUS_LABELS } from '@/lib/constants';
import { formatMoney, pnlClass } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { BetStatus } from '@/types';
import { Badge } from './ui/misc';
import { Button } from './ui/button';
import { Card } from './ui/card';

export function Money({
  value,
  signed,
  colored,
  compact,
  className,
}: {
  value: number;
  signed?: boolean;
  colored?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const { settings } = useData();
  return (
    <span className={cn('tabular', colored && pnlClass(value), className)}>
      {formatMoney(value, settings.currency, { signed, compact })}
    </span>
  );
}

const STATUS_TONES: Record<BetStatus, React.ComponentProps<typeof Badge>['tone']> = {
  pending: 'warning',
  won: 'profit',
  lost: 'loss',
  void: 'neutral',
  half_won: 'profit',
  half_lost: 'loss',
  cashed_out: 'info',
};

export function StatusBadge({ status, className }: { status: BetStatus; className?: string }) {
  return (
    <Badge tone={STATUS_TONES[status]} className={className}>
      <span
        aria-hidden
        className={cn(
          'size-1.5 rounded-full bg-current',
          status === 'pending' && 'animate-pulse',
        )}
      />
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export function TrendIcon({ value, className }: { value: number | null; className?: string }) {
  if (value === null || Math.abs(value) < 0.005) return <Minus className={cn('size-3.5', className)} aria-hidden />;
  return value > 0 ? (
    <TrendingUp className={cn('size-3.5', className)} aria-hidden />
  ) : (
    <TrendingDown className={cn('size-3.5', className)} aria-hidden />
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function ErrorPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card className="flex flex-col items-center gap-3 border-loss/30 p-8 text-center">
      <AlertTriangle className="size-6 text-loss" aria-hidden />
      <div>
        <p className="font-medium">Couldn't load your data</p>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Card>
  );
}

/** Small-sample caveat shown under analytics. */
export function SampleNote({ settled }: { settled: number }) {
  if (settled >= 30) return null;
  return (
    <p className="text-xs text-subtle-foreground">
      Based on {settled} settled bet{settled === 1 ? '' : 's'}. Small samples are noisy — treat trends as indicative, not
      statistically significant.
    </p>
  );
}
