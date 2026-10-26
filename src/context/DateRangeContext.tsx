import * as React from 'react';
import { getCustomRange, getPresetRange } from '@/lib/dateRange';
import type { DateRange, DateRangePreset } from '@/types';
import { useData } from './DataContext';

interface DateRangeContextValue {
  range: DateRange;
  preset: DateRangePreset;
  customFrom: string;
  customTo: string;
  setPreset: (preset: DateRangePreset) => void;
  setCustom: (from: string, to: string) => void;
}

const DateRangeContext = React.createContext<DateRangeContextValue | null>(null);

/**
 * One global date range shared by Overview, My Bets and Analytics so every
 * screen always reflects the same period.
 */
export function DateRangeProvider({ children }: { children: React.ReactNode }) {
  const { settings, loading } = useData();
  const [preset, setPresetState] = React.useState<DateRangePreset>(settings.dashboardRange);
  const [customFrom, setCustomFrom] = React.useState('');
  const [customTo, setCustomTo] = React.useState('');
  const initialised = React.useRef(false);
  // Recompute "today"-relative ranges at least once a minute so they roll over at midnight.
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    if (!loading && !initialised.current) {
      initialised.current = true;
      setPresetState(settings.dashboardRange);
    }
  }, [loading, settings.dashboardRange]);

  React.useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const range = React.useMemo(() => {
    void tick;
    return preset === 'custom' ? getCustomRange(customFrom || null, customTo || null) : getPresetRange(preset);
  }, [preset, customFrom, customTo, tick]);

  const value = React.useMemo<DateRangeContextValue>(
    () => ({
      range,
      preset,
      customFrom,
      customTo,
      setPreset: setPresetState,
      setCustom: (from, to) => {
        setCustomFrom(from);
        setCustomTo(to);
        setPresetState('custom');
      },
    }),
    [range, preset, customFrom, customTo],
  );

  return <DateRangeContext.Provider value={value}>{children}</DateRangeContext.Provider>;
}

export function useDateRange() {
  const ctx = React.useContext(DateRangeContext);
  if (!ctx) throw new Error('useDateRange must be used within DateRangeProvider');
  return ctx;
}
