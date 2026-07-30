'use client';

import React from 'react';
import dynamic from 'next/dynamic';

import { type DateRange } from './AnalyticsFilters';

const SavingsTrendChartInner = dynamic(() => import('./SavingsTrendChartInner'), {
  ssr: false,
  loading: () => <div className="skeleton-pulse rounded-xl h-[340px] w-full" />,
});

export default function SavingsTrendChart() {
  return (
    <SavingsTrendChartInner />
  );
}
