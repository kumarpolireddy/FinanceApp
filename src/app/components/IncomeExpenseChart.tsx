'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const IncomeExpenseChartInner = dynamic(() => import('./IncomeExpenseChartInner'), {
  ssr: false,
  loading: () => <div className="skeleton-pulse rounded-xl h-[320px] w-full" />,
});

interface IncomeExpenseChartProps {
  selectedMonth: number;
  selectedYear: number;
  selectedAccountId?: string;
}

export default function IncomeExpenseChart(props: IncomeExpenseChartProps) {
  return <IncomeExpenseChartInner {...props} />;
}
