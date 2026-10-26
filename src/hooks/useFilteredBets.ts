import * as React from 'react';
import { useData } from '@/context/DataContext';
import { useDateRange } from '@/context/DateRangeContext';
import { filterByRange } from '@/lib/dateRange';

/** Bets within the globally selected date range. */
export function useFilteredBets() {
  const { bets } = useData();
  const { range } = useDateRange();
  return React.useMemo(() => filterByRange(bets, range, (b) => b.betDate), [bets, range]);
}
