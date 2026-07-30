'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  getMonthlyIncomeExpenseRange,
  getDailyIncomeExpense,
  getTransactions,
} from '@/lib/storage';

type RangeOption = '1M' | '3M' | '6M' | '1Y' | 'ALL';

interface ChartPoint {
  month: string;
  income: number;
  expense: number;
  savings: number;
}

const RANGE_OPTIONS: {
  value: RangeOption;
  label: string;
  months: number | null; // null = all data
}[] = [
  { value: '1M', label: 'This month', months: 1 },
  { value: '3M', label: 'Last 3 months', months: 3 },
  { value: '6M', label: 'Last 6 months', months: 6 },
  { value: '1Y', label: 'Last 1 year', months: 12 },
  { value: 'ALL', label: 'All data', months: null },
];

function formatNumber(value: number) {
  if (Math.abs(value) >= 100000) {
    return `₹${(value / 100000).toFixed(1)}L`;
  }
  if (Math.abs(value) >= 1000) {
    return `₹${(value / 1000).toFixed(1)}K`;
  }
  return `₹${Math.round(value)}`;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ color: string; name: string; value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="chart-tooltip-card min-w-[180px]">
      <p className="mb-2 text-xs font-semibold text-muted-foreground">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="mb-1 flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-xs capitalize text-muted-foreground">{entry.name}</span>
          </div>
          <span
            className={`text-xs font-semibold tabular-nums ${
              entry.name === 'income'
                ? 'text-positive'
                : entry.name === 'expense'
                  ? 'text-negative'
                  : 'text-foreground'
            }`}
          >
            {formatNumber(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

interface IncomeExpenseChartInnerProps {
  selectedMonth: number;
  selectedYear: number;
  selectedAccountId?: string;
}

export default function IncomeExpenseChartInner({
  selectedMonth,
  selectedYear,
  selectedAccountId,
}: IncomeExpenseChartInnerProps) {
  const [activeRange, setActiveRange] = useState<RangeOption>('1M');
  const [displayData, setDisplayData] = useState<ChartPoint[]>([]);

  const selectedRange = useMemo(
    () => RANGE_OPTIONS.find((option) => option.value === activeRange)!,
    [activeRange]
  );

  useEffect(() => {
    // Get all transactions
    let txns = getTransactions();
    if (selectedAccountId) {
      txns = txns.filter((t) => t.account === selectedAccountId);
    }

    const end = new Date(selectedYear, selectedMonth, 1);
    end.setMonth(end.getMonth() + 1);
    end.setDate(0); // last day of selected month

    const start = new Date(selectedYear, selectedMonth, 1);
    const monthsBack = selectedRange.months;
    if (monthsBack !== null) {
      start.setMonth(start.getMonth() - monthsBack + 1);
    } else {
      let earliestDate = new Date(selectedYear, selectedMonth - 5, 1);
      const allTxns = txns.filter((t) => typeof t.date === 'string');
      if (allTxns.length > 0) {
        const sortedDates = allTxns
          .map((t) => new Date(t.date))
          .filter((d) => !isNaN(d.getTime()))
          .sort((a, b) => a.getTime() - b.getTime());
        if (sortedDates.length > 0) {
          earliestDate = sortedDates[0];
        }
      }
      start.setFullYear(earliestDate.getFullYear(), earliestDate.getMonth(), 1);
    }

    // Map daily totals
    const dailyData: Record<string, { income: number; expense: number }> = {};
    txns.forEach((t) => {
      if (typeof t.date === 'string') {
        const dayKey = t.date.includes('T') ? t.date.split('T')[0] : t.date;
        if (!dailyData[dayKey]) dailyData[dayKey] = { income: 0, expense: 0 };
        if (t.type === 'income') dailyData[dayKey].income += Number(t.amount) || 0;
        if (t.type === 'expense') dailyData[dayKey].expense += Number(t.amount) || 0;
      }
    });

    const result = [];
    const curr = new Date(start);
    while (curr <= end) {
      const dateStr = `${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}-${String(curr.getDate()).padStart(2, '0')}`;
      const vals = dailyData[dateStr] || { income: 0, expense: 0 };

      const label =
        activeRange === '1M'
          ? String(curr.getDate())
          : curr.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

      result.push({
        month: label,
        income: vals.income,
        expense: vals.expense,
        savings: vals.income - vals.expense,
      });
      curr.setDate(curr.getDate() + 1);
    }
    setDisplayData(result);
  }, [activeRange, selectedRange, selectedMonth, selectedYear, selectedAccountId]);

  const avgIncome =
    displayData.length > 0
      ? displayData.reduce((sum, item) => sum + item.income, 0) / displayData.length
      : 0;

  const avgExpense =
    displayData.length > 0
      ? displayData.reduce((sum, item) => sum + item.expense, 0) / displayData.length
      : 0;

  const avgSavings = avgIncome - avgExpense;

  return (
    <div className="h-full rounded-2xl border border-border bg-card p-5">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">Income vs Expenses</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Daily cash flow — {selectedRange.label.toLowerCase()}
          </p>
        </div>

        <select
          value={activeRange}
          onChange={(e) => setActiveRange(e.target.value as RangeOption)}
          className="w-full rounded-lg border border-border bg-[#0b0f1a] px-3 py-2 text-sm text-slate-200 sm:w-44 focus:outline-none focus:border-primary transition-all"
        >
          {RANGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value} className="bg-[#0b0f1a] text-slate-200">
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {displayData.every((d) => d.income === 0 && d.expense === 0) ? (
        <div className="flex h-[280px] items-center justify-center">
          <p className="text-sm text-muted-foreground">No transaction data for this range</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={displayData}>
            <defs>
              <linearGradient id="gradIncome" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--positive)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="var(--positive)" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="gradExpense" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--negative)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="var(--negative)" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />

            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
              interval={Math.ceil(displayData.length / 10)}
            />

            <YAxis
              tickFormatter={formatNumber}
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
            />

            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />

            <Area
              type="monotone"
              dataKey="income"
              stroke="var(--positive)"
              fill="url(#gradIncome)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="expense"
              stroke="var(--negative)"
              fill="url(#gradExpense)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}

      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4">
        <div className="text-center">
          <p className="text-sm font-bold text-positive">{formatNumber(avgIncome)}</p>
          <p className="text-xs text-muted-foreground">Avg Daily Income</p>
        </div>
        <div className="text-center">
          <p className="text-sm font-bold text-negative">{formatNumber(avgExpense)}</p>
          <p className="text-xs text-muted-foreground">Avg Daily Expense</p>
        </div>
        <div className="text-center">
          <p className={`text-sm font-bold ${avgSavings >= 0 ? 'text-positive' : 'text-negative'}`}>
            {formatNumber(avgSavings)}
          </p>
          <p className="text-xs text-muted-foreground">Avg Daily Savings</p>
        </div>
      </div>
    </div>
  );
}
