import * as React from 'react';
import { format } from 'date-fns';
import { CalendarRange, Check, ChevronDown } from 'lucide-react';
import { useDateRange } from '@/context/DateRangeContext';
import { DATE_RANGE_LABELS } from '@/lib/constants';
import { toDayValue } from '@/lib/dateRange';
import { cn } from '@/lib/utils';
import { DATE_RANGE_PRESETS, type DateRangePreset } from '@/types';
import { Button } from './ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown';
import { Field, Input } from './ui/input';

export function rangeSummary(preset: DateRangePreset, from: Date | null, to: Date | null): string {
  if (preset !== 'custom') return DATE_RANGE_LABELS[preset];
  if (from && to) return `${format(from, 'd MMM yy')} – ${format(to, 'd MMM yy')}`;
  if (from) return `From ${format(from, 'd MMM yy')}`;
  if (to) return `Until ${format(to, 'd MMM yy')}`;
  return 'Custom range';
}

export function DateRangePicker({ className }: { className?: string }) {
  const { preset, range, setPreset, setCustom, customFrom, customTo } = useDateRange();
  const [customOpen, setCustomOpen] = React.useState(false);
  const [from, setFrom] = React.useState(customFrom);
  const [to, setTo] = React.useState(customTo);
  const [error, setError] = React.useState<string>();

  const openCustom = () => {
    setFrom(customFrom || (range.from ? toDayValue(range.from) : ''));
    setTo(customTo || (range.to ? toDayValue(range.to) : toDayValue(new Date())));
    setError(undefined);
    setCustomOpen(true);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="sm" className={cn('min-w-0', className)} aria-label={`Date range: ${rangeSummary(preset, range.from, range.to)}`}>
            <CalendarRange className="text-primary" />
            <span className="truncate">{rangeSummary(preset, range.from, range.to)}</span>
            <ChevronDown className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-52">
          {DATE_RANGE_PRESETS.filter((p) => p !== 'custom').map((p) => (
            <DropdownMenuItem key={p} onSelect={() => setPreset(p)}>
              <Check className={cn(p === preset ? 'opacity-100 !text-primary' : 'opacity-0')} />
              {DATE_RANGE_LABELS[p]}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={openCustom}>
            <Check className={cn(preset === 'custom' ? 'opacity-100 !text-primary' : 'opacity-0')} />
            Custom range…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent size="sm">
          <form
            className="contents"
            onSubmit={(e) => {
              e.preventDefault();
              if (!from && !to) {
                setError('Pick at least a start or an end date.');
                return;
              }
              setCustom(from, to);
              setCustomOpen(false);
            }}
          >
            <DialogHeader>
              <DialogTitle>Custom date range</DialogTitle>
              <DialogDescription>Dates are inclusive and use your local timezone.</DialogDescription>
            </DialogHeader>
            <DialogBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id="range-from" label="From">
                <Input id="range-from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field id="range-to" label="To" error={error}>
                <Input id="range-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setCustomOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Apply range</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
