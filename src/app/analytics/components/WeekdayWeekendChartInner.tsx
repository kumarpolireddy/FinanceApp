'use client';

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

import { useState, useMemo, useEffect } from 'react';
import { type Transaction } from '@/lib/storage';
import { type DateRange } from './AnalyticsFilters';
import ChartFilterBar, { filterTransactions } from './ChartFilterBar';

const WEEKEND_DAYS = ['Sat', 'Sun'];

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

function CustomTooltip({
  active,
  payload,
  label,
  ratio,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  ratio: string;
}) {
  if (!active || !payload?.length) return null;
  const isWeekend = WEEKEND_DAYS.includes(label || '');
  return (
    <div className="chart-tooltip-card">
      <p className="text-xs font-semibold text-foreground mb-1">{label}</p>
      <p className="text-xs text-muted-foreground">Avg daily spend</p>
      <p
        className={`text-sm font-bold tabular-nums mt-1 ${isWeekend ? 'text-warning' : 'text-primary'}`}
      >
        ₹{payload[0].value.toLocaleString('en-IN')}
      </p>
      {isWeekend && <p className="text-2xs text-warning mt-1">Weekend — {ratio}× weekday avg</p>}
    </div>
  );
}

export default function WeekdayWeekendChartInner({
  allTransactions,
}: {
  allTransactions: Transaction[];
}) {
  const [selectedRange, setSelectedRange] = useState<DateRange>('This Month');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [useMonthFilter, setUseMonthFilter] = useState<boolean>(false);

  useEffect(() => {
    const handleSwipe = (e: Event) => {
      const customEvent = e as CustomEvent<{ delta: number }>;
      const delta = customEvent.detail.delta;
      let newMonth = selectedMonth + delta;
      let newYear = selectedYear;
      if (newMonth < 0) {
        newMonth = 11;
        newYear -= 1;
      } else if (newMonth > 11) {
        newMonth = 0;
        newYear += 1;
      }
      setSelectedMonth(newMonth);
      setSelectedYear(newYear);
      setUseMonthFilter(true);
    };
    window.addEventListener('analytics-month-swipe', handleSwipe);
    return () => window.removeEventListener('analytics-month-swipe', handleSwipe);
  }, [selectedMonth, selectedYear]);

  const transactions = useMemo(() => {
    return filterTransactions(
      allTransactions,
      selectedRange,
      selectedAccountId,
      selectedMonth,
      selectedYear,
      useMonthFilter
    );
  }, [allTransactions, selectedRange, selectedAccountId, selectedMonth, selectedYear, useMonthFilter]);
  const dayData = useMemo(() => {
    const expenseTxns = transactions.filter((t) => t.type === 'expense');
    const sums = new Array(7).fill(0);
    const activeDates: Set<string>[] = Array.from({ length: 7 }, () => new Set<string>());

    expenseTxns.forEach((t) => {
      const d = new Date(t.date);
      if (!isNaN(d.getTime())) {
        const dayIdx = d.getDay();
        sums[dayIdx] += t.amount;
        activeDates[dayIdx].add(t.date.slice(0, 10));
      }
    });

    const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const calculated = weekdayNames.map((name, idx) => {
      const count = activeDates[idx].size || 1;
      return {
        day: name,
        avg: Math.round(sums[idx] / count),
      };
    });

    return [
      calculated[1], // Mon
      calculated[2], // Tue
      calculated[3], // Wed
      calculated[4], // Thu
      calculated[5], // Fri
      calculated[6], // Sat
      calculated[0], // Sun
    ];
  }, [transactions]);

  const weekdayAvg =
    dayData.filter((d) => !WEEKEND_DAYS.includes(d.day)).reduce((s, d) => s + d.avg, 0) / 5;
  const weekendAvg =
    dayData.filter((d) => WEEKEND_DAYS.includes(d.day)).reduce((s, d) => s + d.avg, 0) / 2;

  const ratio = weekdayAvg > 0 ? (weekendAvg / weekdayAvg).toFixed(1) : '0';

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <h3 className="text-base font-semibold text-foreground">Weekday vs Weekend Spending</h3>
      </div>

      {/* Month Selector Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 border-t border-border/20 pt-3">
        {/* Left: Active Month Display */}
        <div className="text-xs font-bold text-foreground select-none uppercase tracking-wider py-1.5">
          📅 {MONTH_SHORT[selectedMonth]} {selectedYear}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="mb-4 bg-[#0b0f1a]/10 p-2 border border-border/40 rounded-xl">
        <ChartFilterBar
          selectedRange={selectedRange}
          setSelectedRange={setSelectedRange}
          selectedAccountId={selectedAccountId}
          setSelectedAccountId={setSelectedAccountId}
          useMonthFilter={useMonthFilter}
          setUseMonthFilter={setUseMonthFilter}
          selectedMonth={selectedMonth}
          setSelectedMonth={setSelectedMonth}
          selectedYear={selectedYear}
          setSelectedYear={setSelectedYear}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-muted/20 border border-border rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground mb-1">Weekday Avg</p>
          <p className="text-lg font-bold tabular-nums text-primary">
            ₹{Math.round(weekdayAvg).toLocaleString('en-IN')}
          </p>
          <p className="text-2xs text-muted-foreground">per day</p>
        </div>
        <div className="bg-warning-subtle border border-warning-subtle rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground mb-1">Weekend Avg</p>
          <p className="text-lg font-bold tabular-nums text-warning">
            ₹{Math.round(weekendAvg).toLocaleString('en-IN')}
          </p>
          <p className="text-2xs text-muted-foreground">
            per day — {parseFloat(ratio) > 1 ? `${ratio}× more` : `${ratio}× weekday`}
          </p>
        </div>
      </div>

      {dayData.every((d) => d.avg === 0) ? (
        <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground">
          No expenditure transactions found for the selected filters.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={dayData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barSize={28}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`}
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <Tooltip
              content={<CustomTooltip ratio={ratio} />}
              cursor={{ fill: 'rgba(255,255,255,0.03)' }}
            />
            <Bar dataKey="avg" radius={[4, 4, 0, 0]} fill="var(--primary)">
              {dayData.map((entry) => (
                <rect
                  key={`bar-${entry.day}`}
                  fill={WEEKEND_DAYS.includes(entry.day) ? 'var(--warning)' : 'var(--primary)'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
