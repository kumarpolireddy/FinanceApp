'use client';

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// Backend integration point: fetch /api/analytics/category-comparison
import { type Transaction, getAccounts, type Account } from '@/lib/storage';
import { type DateRange } from './AnalyticsFilters';
import ChartFilterBar, { filterTransactions } from './ChartFilterBar';
import { ChevronDown, ChevronRight } from 'lucide-react';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

type CompareMode = 'prev-month' | 'prev-year-month' | 'prev-year';

interface CategoryComparisonRow {
  category: string;
  previous: number;
  current: number;
}

function getCategoryComparisonData(
  compareMode: CompareMode,
  baseMonth: number,
  baseYear: number,
  txns: Transaction[]
): CategoryComparisonRow[] {
  let currentYear = baseYear;
  let currentMonth: number | null = baseMonth;
  let previousYear = baseYear;
  let previousMonth: number | null = baseMonth;

  if (compareMode === 'prev-month') {
    currentMonth = baseMonth;
    currentYear = baseYear;
    previousMonth = baseMonth - 1;
    previousYear = baseYear;
    if (previousMonth < 0) {
      previousMonth = 11;
      previousYear = baseYear - 1;
    }
  } else if (compareMode === 'prev-year-month') {
    currentMonth = baseMonth;
    currentYear = baseYear;
    previousMonth = baseMonth;
    previousYear = baseYear - 1;
  } else if (compareMode === 'prev-year') {
    currentMonth = null;
    currentYear = baseYear;
    previousMonth = null;
    previousYear = baseYear - 1;
  }

  function matchesPeriod(date: Date, year: number, month: number | null) {
    if (date.getFullYear() !== year) return false;
    if (month !== null && date.getMonth() !== month) return false;
    return true;
  }

  const data: Record<string, { previous: number; current: number }> = {};

  txns
    .filter((t) => t.type === 'expense')
    .forEach((txn) => {
      const date = new Date(txn.date);

      if (!data[txn.category]) {
        data[txn.category] = { previous: 0, current: 0 };
      }

      if (matchesPeriod(date, previousYear, previousMonth)) {
        data[txn.category].previous += txn.amount;
      }

      if (matchesPeriod(date, currentYear, currentMonth)) {
        data[txn.category].current += txn.amount;
      }
    });

  return Object.entries(data)
    .map(([category, values]) => ({
      category,
      previous: values.previous,
      current: values.current,
    }))
    .filter((row) => row.previous > 0 || row.current > 0)
    .sort((a, b) => b.current - a.current);
}

function periodLabels(compareMode: CompareMode, baseMonth: number, baseYear: number) {
  const MONTH_SHORT = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];
  
  if (compareMode === 'prev-month') {
    let prevM = baseMonth - 1;
    let prevY = baseYear;
    if (prevM < 0) {
      prevM = 11;
      prevY = baseYear - 1;
    }
    const prevLabel = `${MONTH_SHORT[prevM]} ${String(prevY).slice(2)}`;
    const currLabel = `${MONTH_SHORT[baseMonth]} ${String(baseYear).slice(2)}`;
    return {
      previous: prevLabel,
      current: currLabel,
    };
  } else if (compareMode === 'prev-year-month') {
    const prevLabel = `${MONTH_SHORT[baseMonth]} ${String(baseYear - 1).slice(2)}`;
    const currLabel = `${MONTH_SHORT[baseMonth]} ${String(baseYear).slice(2)}`;
    return {
      previous: prevLabel,
      current: currLabel,
    };
  } else {
    return {
      previous: String(baseYear - 1),
      current: String(baseYear),
    };
  }
}

function CustomTooltip({
  active,
  payload,
  label,
  previousLabel,
  currentLabel,
  changeLabel,
}: {
  active?: boolean;
  payload?: Array<{ color: string; name: string; value: number }>;
  label?: string;
  previousLabel: string;
  currentLabel: string;
  changeLabel: string;
}) {
  if (!active || !payload?.length) return null;
  const prev = payload.find((p) => p.name === 'previous')?.value || 0;
  const curr = payload.find((p) => p.name === 'current')?.value || 0;
  const change = prev > 0 ? (((curr - prev) / prev) * 100).toFixed(1) : '—';
  return (
    <div className="chart-tooltip-card">
      <p className="text-xs font-semibold text-foreground mb-2">{label}</p>
      {payload.map((entry) => (
        <div key={`comptip-${entry.name}`} className="flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: entry.color }} />
            <span className="text-xs text-muted-foreground">
              {entry.name === 'previous' ? previousLabel : currentLabel}
            </span>
          </div>
          <span className="text-xs font-semibold tabular-nums text-foreground">
            ₹{entry.value.toLocaleString('en-IN')}
          </span>
        </div>
      ))}
      <div className="border-t border-border mt-1 pt-1">
        <div className="flex justify-between">
          <span className="text-xs text-muted-foreground">{changeLabel}</span>
          <span
            className={`text-xs font-bold ${Number(change) > 0 ? 'text-negative' : 'text-positive'}`}
          >
            {change === '—' ? change : `${Number(change) > 0 ? '+' : ''}${change}%`}
          </span>
        </div>
      </div>
    </div>
  );
}

function SimpleTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ color: string; value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  return (
    <div className="chart-tooltip-card">
      <p className="text-xs font-semibold text-foreground mb-1">{label}</p>
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs text-muted-foreground">Spending</span>
        <span className="text-xs font-semibold tabular-nums text-foreground">
          ₹{val.toLocaleString('en-IN')}
        </span>
      </div>
    </div>
  );
}

export default function CategoryYoYChartInner({
  allTransactions,
}: {
  allTransactions: Transaction[];
}) {
  const [selectedRange, setSelectedRange] = useState<DateRange>('This Month');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [useMonthFilter, setUseMonthFilter] = useState<boolean>(true);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  const shiftMonth = (delta: number) => {
    setSelectedMonth((prevMonth) => {
      let m = prevMonth + delta;
      if (m < 0) {
        m = 11;
        setSelectedYear((y) => y - 1);
      } else if (m > 11) {
        m = 0;
        setSelectedYear((y) => y + 1);
      }
      return m;
    });
  };

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

  const [compare, setCompare] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedCategoryForList, setSelectedCategoryForList] = useState<string | null>(null);
  const [isCategoriesExpanded, setIsCategoriesExpanded] = useState(true);

  useEffect(() => {
    setAccounts(getAccounts());
  }, []);

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

  const getAccountName = (id: string) => {
    const acc = accounts.find((a) => a.id === id);
    return acc ? acc.name : id;
  };

  const handleBarClick = (category: string) => {
    if (!category) return;
    setSelectedCategoryForList(category);
  };

  const categoryTransactions = useMemo(() => {
    if (!selectedCategoryForList) return [];
    return transactions.filter(t => t.category === selectedCategoryForList && t.type === 'expense');
  }, [transactions, selectedCategoryForList]);

  const [compareMode, setCompareMode] = useState<CompareMode>('prev-month');

  const allCompareData = useMemo(
    () => getCategoryComparisonData(compareMode, selectedMonth, selectedYear, transactions),
    [compareMode, selectedMonth, selectedYear, transactions]
  );
  const data = allCompareData;
  const labels = useMemo(
    () => periodLabels(compareMode, selectedMonth, selectedYear),
    [compareMode, selectedMonth, selectedYear]
  );

  // Spending for the selected date range when comparison is off
  const currentPeriodData = useMemo(() => {
    const totals: Record<string, number> = {};
    transactions
      .filter((t) => t.type === 'expense')
      .forEach((t) => {
        totals[t.category] = (totals[t.category] || 0) + t.amount;
      });
    return Object.entries(totals)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [transactions]);

  const totalSpend = useMemo(() => {
    return currentPeriodData.reduce((sum, item) => sum + item.amount, 0);
  }, [currentPeriodData]);

  // Compute biggest increase / best reduction dynamically instead of hardcoding
  let highestIncrease: { category: string; pct: number } | null = null;
  let bestReduction: { category: string; pct: number } | null = null;

  for (const { category, previous, current } of allCompareData) {
    if (previous <= 0) continue;
    const pct = ((current - previous) / previous) * 100;
    if (pct > 0 && (!highestIncrease || pct > highestIncrease.pct)) {
      highestIncrease = { category, pct };
    }
    if (pct < 0 && (!bestReduction || pct < bestReduction.pct)) {
      bestReduction = { category, pct };
    }
  }

  return (
    <div className="px-1 py-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <h3 className="text-base font-semibold text-foreground">Category Spending</h3>
      </div>

      {/* Month Selector & Compare Toggle Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 border-t border-border/20 pt-3">
        {/* Left: Active Month Display */}
        <div className="text-xs font-bold text-foreground select-none uppercase tracking-wider py-1.5">
          📅 {MONTH_NAMES[selectedMonth].slice(0, 3)} {selectedYear}
        </div>

        {/* Right: Compare Toggle & Dropdown */}
        <div className="flex flex-wrap items-center gap-3.5 flex-shrink-0">
          <label className="flex items-center gap-2 cursor-pointer hover:text-foreground transition select-none text-xs text-muted-foreground font-semibold">
            <input
              type="checkbox"
              checked={compare}
              onChange={(e) => setCompare(e.target.checked)}
              className="rounded border-border text-primary bg-[#0b0f1a] h-4 w-4 focus:ring-offset-background focus:ring-1 focus:ring-primary"
            />
            Compare Periods
          </label>

          {compare && (
            <>
              <div className="relative">
                <select
                  value={compareMode}
                  onChange={(e) => setCompareMode(e.target.value as any)}
                  className="h-7 text-xs bg-[#0b0f1a] border border-border/60 rounded-md pl-2 pr-6 py-0.5 text-slate-300 appearance-none cursor-pointer hover:border-primary/40 focus:border-primary focus:outline-none transition-all font-semibold"
                >
                  <option value="prev-month">Previous Month</option>
                  <option value="prev-year-month">Same Month Last Year</option>
                  <option value="prev-year">Previous Year (Full)</option>
                </select>
                <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>

              <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-2.5 rounded-sm bg-muted-foreground/40" />
                  <span className="text-muted-foreground">{labels.previous}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-2.5 rounded-sm bg-primary/70" />
                  <span className="text-muted-foreground">{labels.current}</span>
                </div>
              </div>
            </>
          )}
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

      {compare ? (
        data.length === 0 ? (
          <div className="h-[240px] flex items-center justify-center text-xs text-muted-foreground">
            Not enough transaction data for this comparison yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={data}
              margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
              barGap={2}
              barCategoryGap="30%"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="category"
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`}
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                content={
                  <CustomTooltip
                    previousLabel={labels.previous}
                    currentLabel={labels.current}
                    changeLabel={compareMode === 'prev-month' ? 'MoM Change' : 'YoY Change'}
                  />
                }
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
              />
              <Bar
                dataKey="previous"
                fill="var(--muted-foreground)"
                opacity={0.35}
                radius={[3, 3, 0, 0]}
              />
              <Bar 
                dataKey="current" 
                fill="var(--primary)" 
                opacity={0.75} 
                radius={[3, 3, 0, 0]} 
              />
            </BarChart>
          </ResponsiveContainer>
        )
      ) : currentPeriodData.length === 0 ? (
        <div className="h-[240px] flex items-center justify-center text-xs text-muted-foreground">
          No transaction data for this date range yet.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart
            data={currentPeriodData}
            margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
            barCategoryGap="35%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="category"
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`}
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip content={<SimpleTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <Bar 
              dataKey="amount" 
              fill="var(--primary)" 
              opacity={0.8} 
              radius={[4, 4, 0, 0]} 
            />
          </BarChart>
        </ResponsiveContainer>
      )}

      {/* Footer Callouts */}
      {compare ? (
        <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-negative" />
            <span className="text-xs text-muted-foreground font-medium">Highest increase:</span>
            <span className="text-xs font-semibold text-negative">
              {highestIncrease
                ? `${highestIncrease.category} +${highestIncrease.pct.toFixed(1)}%`
                : '—'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-positive" />
            <span className="text-xs text-muted-foreground font-medium">Best reduction:</span>
            <span className="text-xs font-semibold text-positive">
              {bestReduction ? `${bestReduction.category} ${bestReduction.pct.toFixed(1)}%` : '—'}
            </span>
          </div>
        </div>
      ) : (
        <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary" />
            <span className="text-xs text-muted-foreground font-medium">
              Total category spending:
            </span>
            <span className="text-xs font-bold text-negative">
              ₹{totalSpend.toLocaleString('en-IN')}
            </span>
          </div>
          <div className="text-xs text-muted-foreground font-medium">
            {currentPeriodData.length} active categories
          </div>
        </div>
      )}

      {/* Categories Breakdown List */}
      <div className="mt-5 pt-5 border-t border-border/60 space-y-3.5">
        <div 
          onClick={() => setIsCategoriesExpanded(!isCategoriesExpanded)}
          className="flex justify-between items-center cursor-pointer select-none hover:text-primary transition"
        >
          <h4 className="text-xs font-normal text-foreground uppercase tracking-wider">
            📋 Categories Breakdown
          </h4>
          <span className="text-muted-foreground/60">
            {isCategoriesExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        </div>

        {isCategoriesExpanded && (
          <div className="space-y-3 pt-1.5 animate-slide-up">
            {currentPeriodData.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-5 font-normal">
                No categories recorded for this period.
              </p>
            ) : (
              currentPeriodData.map((item) => {
                const percentage = totalSpend > 0 ? (item.amount / totalSpend) * 100 : 0;
                return (
                  <div 
                    key={item.category} 
                    onClick={() => handleBarClick(item.category)}
                    className="space-y-2 py-1 cursor-pointer hover:bg-secondary/40 px-2 -mx-2 rounded-lg transition-all"
                    title={`View transactions for ${item.category}`}
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-normal text-foreground">{item.category}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-normal text-negative">
                          ₹{item.amount.toLocaleString('en-IN')}
                        </span>
                        <span className="text-xs text-muted-foreground font-normal w-8 text-right shrink-0">
                          {percentage.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full bg-secondary/60 h-2 rounded-full overflow-hidden border border-border/30">
                      <div 
                        className="bg-primary h-full rounded-full transition-all duration-300"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Category-specific transactions drill-down drawer/panel */}
      {selectedCategoryForList && (
        <div className="mt-5 pt-5 border-t border-border/60 space-y-3 animate-slide-up">
          <div className="flex justify-between items-center bg-secondary/30 px-3.5 py-2 border border-border/40 rounded-lg">
            <span className="text-xs font-bold uppercase tracking-wider text-foreground">
              💬 Transactions in {selectedCategoryForList}
            </span>
            <button 
              onClick={() => setSelectedCategoryForList(null)} 
              className="text-xs text-primary font-bold uppercase tracking-wider hover:text-primary-light"
            >
              Close List
            </button>
          </div>

          <div className="divide-y divide-border/20 max-h-60 overflow-y-auto pr-1 select-scrollbar border border-border/30 rounded-lg bg-[#0b0f1a]/20">
            {categoryTransactions.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-6 font-semibold">
                No transactions recorded for this category.
              </p>
            ) : (
              categoryTransactions.map((txn) => {
                const isIncome = txn.type === 'income';
                const isTransfer = txn.type === 'transfer';
                
                return (
                  <div 
                    key={txn.id}
                    className="flex items-center justify-between py-2 px-3 hover:bg-secondary/20 transition"
                  >
                    <div className="min-w-0 pr-3">
                      <div className="text-xs font-semibold text-foreground truncate">
                        {txn.description || txn.category || 'Transaction'}
                      </div>
                      <div className="text-[10px] text-muted-foreground/80 mt-0.5">
                        {new Date(txn.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} • {getAccountName(txn.account)}
                      </div>
                    </div>
                    <span className={`font-mono text-xs font-bold shrink-0 ${isTransfer ? 'text-info' : isIncome ? 'text-positive' : 'text-negative'}`}>
                      {isTransfer ? '' : isIncome ? '+' : '-'}{txn.amount.toLocaleString('en-IN')}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
