'use client';

import React from 'react';
import dynamic from 'next/dynamic';

import { type Transaction } from '@/lib/storage';

const WeekdayWeekendChartInner = dynamic(() => import('./WeekdayWeekendChartInner'), {
  ssr: false,
  loading: () => <div className="skeleton-pulse rounded-xl h-[340px] w-full" />,
});

export default function WeekdayWeekendChart({ transactions }: { transactions: Transaction[] }) {
  return <WeekdayWeekendChartInner allTransactions={transactions} />;
}
