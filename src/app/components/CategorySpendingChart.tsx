'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const CategorySpendingChartInner = dynamic(() => import('./CategorySpendingChartInner'), {
  ssr: false,
  loading: () => <div className="skeleton-pulse rounded-xl h-[400px] w-full" />,
});

interface CategorySpendingChartProps {
  selectedMonth: number;
  selectedYear: number;
  selectedAccountId?: string;
}

export default function CategorySpendingChart(props: CategorySpendingChartProps) {
  return <CategorySpendingChartInner {...props} />;
}
