'use client';

import dynamic from 'next/dynamic';

import { type Transaction } from '@/lib/storage';

import { type DateRange } from './AnalyticsFilters';

const CategoryYoYChartInner = dynamic(() => import('./CategoryYoYChartInner'), {
  ssr: false,
  loading: () => <div className="skeleton-pulse rounded-xl h-[340px] w-full" />,
});

export default function CategoryYoYChart({
  transactions,
}: {
  transactions: Transaction[];
}) {
  return <CategoryYoYChartInner allTransactions={transactions} />;
}
