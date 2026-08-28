'use client';

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// Backend integration point: fetch /api/analytics/category-comparison
import { type Transaction, getAccounts, type Account } from '@/lib/storage';
import { type DateRange } from './AnalyticsFilters';
import ChartFilterBar, { filterTransactions } from './ChartFilterBar';
import { ChevronDown, ChevronRight, X } from 'lucide-react';

const CATEGORY_COLORS = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EC4899',
  '#8B5CF6',
  '#06B6D4',
  '#F97316',
  '#6366F1',
  '#14B8A6',
  '#E11D48',
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
  txns: Transaction[],
  txnType: 'expense' | 'income' = 'expense'
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
    .filter((t) => t.type === txnType)
    .forEach((txn) => {
      const cat = txn.category || 'Other';
      const date = new Date(txn.date);

      if (!data[cat]) {
        data[cat] = { previous: 0, current: 0 };
      }

      if (matchesPeriod(date, previousYear, previousMonth)) {
        data[cat].previous += txn.amount;
      }

      if (matchesPeriod(date, currentYear, currentMonth)) {
        data[cat].current += txn.amount;
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
  const router = useRouter();
  const searchParams = useSearchParams();
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

  const [txnType, setTxnType] = useState<'expense' | 'income'>('expense');
  const [compare, setCompare] = useState(false);
  const [isMainCategoryChartExpanded, setIsMainCategoryChartExpanded] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedCategoryForList, setSelectedCategoryForList] = useState<string | null>(null);
  const [isCategoriesExpanded, setIsCategoriesExpanded] = useState(true);
  const [detailMonth, setDetailMonth] = useState(selectedMonth);
  const [detailYear, setDetailYear] = useState(selectedYear);
  const detailTouchStartX = useRef<number | null>(null);
  const [detailTransactions, setDetailTransactions] = useState(allTransactions);
  const restoredCategoryDetailRef = useRef(false);
  const [isCategoryHistoryExpanded, setIsCategoryHistoryExpanded] = useState(false);

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
    restoredCategoryDetailRef.current = true;
    setDetailMonth(selectedMonth);
    setDetailYear(selectedYear);
    setSelectedCategoryForList(category);
    const params = new URLSearchParams(searchParams.toString());
    params.set('categoryDetail', category);
    params.set('detailMonth', String(selectedMonth + 1));
    params.set('detailYear', String(selectedYear));
    params.set('detailType', txnType);
    router.push(`/analytics?${params.toString()}`, { scroll: false });
  };

  const closeCategoryDetails = () => {
    setSelectedCategoryForList(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('categoryDetail');
    params.delete('detailMonth');
    params.delete('detailYear');
    params.delete('detailType');
    const query = params.toString();
    router.replace(query ? `/analytics?${query}` : '/analytics', { scroll: false });
  };

  useEffect(() => {
    const category = searchParams.get('categoryDetail');
    if (!category) {
      setSelectedCategoryForList(null);
      restoredCategoryDetailRef.current = false;
      return;
    }
    if (restoredCategoryDetailRef.current) return;
    const month = Number(searchParams.get('detailMonth'));
    const year = Number(searchParams.get('detailYear'));
    const type = searchParams.get('detailType');
    setSelectedCategoryForList(category);
    if (month >= 1 && month <= 12) setDetailMonth(month - 1);
    if (Number.isFinite(year) && year > 0) setDetailYear(year);
    if (type === 'income' || type === 'expense') setTxnType(type);
    setDetailTransactions(allTransactions);
    restoredCategoryDetailRef.current = true;
  }, [allTransactions, searchParams]);

  useEffect(() => {
    if (!selectedCategoryForList || !restoredCategoryDetailRef.current) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('detailMonth', String(detailMonth + 1));
    params.set('detailYear', String(detailYear));
    const nextQuery = params.toString();
    if (nextQuery !== searchParams.toString()) {
      router.replace(`/analytics?${nextQuery}`, { scroll: false });
    }
  }, [detailMonth, detailYear, router, searchParams, selectedCategoryForList]);

  const categoryTransactions = useMemo(() => {
    if (!selectedCategoryForList) return [];
    return detailTransactions
      .filter((t) => {
        const date = new Date(t.date);
        return (
          t.category === selectedCategoryForList &&
          t.type === txnType &&
          date.getMonth() === detailMonth &&
          date.getFullYear() === detailYear &&
          (!selectedAccountId || t.account === selectedAccountId)
        );
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [detailTransactions, selectedCategoryForList, txnType, detailMonth, detailYear, selectedAccountId]);

  const categoryHistory = useMemo(() => {
    if (!selectedCategoryForList) return [];
    return Array.from({ length: 6 }, (_, index) => {
      const date = new Date(detailYear, detailMonth - (5 - index), 1);
      const month = date.getMonth();
      const year = date.getFullYear();
      const amount = detailTransactions
        .filter((t) => {
          const transactionDate = new Date(t.date);
          return (
            t.category === selectedCategoryForList &&
            t.type === txnType &&
            transactionDate.getMonth() === month &&
            transactionDate.getFullYear() === year &&
            (!selectedAccountId || t.account === selectedAccountId)
          );
        })
        .reduce((sum, transaction) => sum + transaction.amount, 0);

      return {
        label: date.toLocaleDateString('en-IN', { month: 'short' }),
        amount,
      };
    });
  }, [detailTransactions, selectedCategoryForList, txnType, detailMonth, detailYear, selectedAccountId]);

  const shiftDetailMonth = (delta: number) => {
    const date = new Date(detailYear, detailMonth + delta, 1);
    setDetailMonth(date.getMonth());
    setDetailYear(date.getFullYear());
  };

  const detailTotal = categoryTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);

  const openTransactionEditor = (transaction: Transaction) => {
    const date = new Date(transaction.date);
    const returnParams = new URLSearchParams(searchParams.toString());
    returnParams.set('categoryDetail', selectedCategoryForList || transaction.category || 'Other');
    returnParams.set('detailMonth', String(detailMonth + 1));
    returnParams.set('detailYear', String(detailYear));
    returnParams.set('detailType', txnType);
    const returnTo = `/analytics?${returnParams.toString()}`;
    const params = new URLSearchParams({
      edit: transaction.id,
      year: String(date.getFullYear()),
      month: String(date.getMonth() + 1).padStart(2, '0'),
      source: 'analytics',
      returnTo,
    });
    router.push(`/transactions?${params.toString()}`);
  };

  const subcategoryBreakdown = useMemo(() => {
    const totals: Record<string, number> = {};
    categoryTransactions.forEach((transaction) => {
      const subcategory = transaction.subcategory || 'Uncategorized';
      totals[subcategory] = (totals[subcategory] || 0) + transaction.amount;
    });
    return Object.entries(totals)
      .map(([subcategory, amount]) => ({ subcategory, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [categoryTransactions]);

  useEffect(() => {
    if (!selectedCategoryForList) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedCategoryForList]);

  const [compareMode, setCompareMode] = useState<CompareMode>('prev-month');

  const allCompareData = useMemo(
    () => getCategoryComparisonData(compareMode, selectedMonth, selectedYear, transactions, txnType),
    [compareMode, selectedMonth, selectedYear, transactions, txnType]
  );
  const data = allCompareData;
  const labels = useMemo(
    () => periodLabels(compareMode, selectedMonth, selectedYear),
    [compareMode, selectedMonth, selectedYear]
  );

  // Spending / Income for the selected date range when comparison is off
  const currentPeriodData = useMemo(() => {
    const totals: Record<string, number> = {};
    transactions
      .filter((t) => t.type === txnType)
      .forEach((t) => {
        const cat = t.category || 'Other';
        totals[cat] = (totals[cat] || 0) + t.amount;
      });
    return Object.entries(totals)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [transactions, txnType]);

  const totalSpend = useMemo(() => {
    return currentPeriodData.reduce((sum, item) => sum + item.amount, 0);
  }, [currentPeriodData]);

  const categoryTxnCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    transactions
      .filter((t) => t.type === txnType)
      .forEach((t) => {
        const cat = t.category || 'Other';
        counts[cat] = (counts[cat] || 0) + 1;
      });
    return counts;
  }, [transactions, txnType]);

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
      {/* Header with Type Selector */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <h3 className="text-base font-semibold text-foreground">
          {txnType === 'expense' ? 'Category Spending' : 'Category Income'}
        </h3>
        
        {/* Expenses / Income Tab Switcher */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setTxnType('expense');
              setSelectedCategoryForList(null);
            }}
            className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
              txnType === 'expense'
                ? 'bg-negative/20 text-negative border border-negative/30 shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Expenses
          </button>
          <button
            onClick={() => {
              setTxnType('income');
              setSelectedCategoryForList(null);
            }}
            className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
              txnType === 'income'
                ? 'bg-positive/20 text-positive border border-positive/30 shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Income
          </button>
        </div>
      </div>

      {/* Total & Compare Toggle Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 border-t border-border/20 pt-3">
        <div className="text-xs font-semibold text-muted-foreground">
          Total {txnType === 'expense' ? 'spending' : 'income'}:{' '}
          <span
            className={`font-bold tabular-nums ${
              txnType === 'income' ? 'text-positive' : 'text-negative'
            }`}
          >
            ₹{totalSpend.toLocaleString('en-IN')}
          </span>
        </div>

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
          isChartExpanded={isMainCategoryChartExpanded}
          onToggleChart={() => setIsMainCategoryChartExpanded((expanded) => !expanded)}
        />
      </div>

      {isMainCategoryChartExpanded && (compare ? (
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
                fill={txnType === 'income' ? 'var(--positive)' : 'var(--primary)'} 
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
              fill={txnType === 'income' ? 'var(--positive)' : 'var(--primary)'} 
              opacity={0.8} 
              radius={[4, 4, 0, 0]} 
            />
          </BarChart>
        </ResponsiveContainer>
      ))}

      {/* Footer Callouts */}
      {compare && (
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
      )}

      {/* Categories Breakdown Clean Minimalist List */}
      <div className="mt-5 pt-5 border-t border-border/50 space-y-3">
        <div 
          onClick={() => setIsCategoriesExpanded(!isCategoriesExpanded)}
          className="flex justify-between items-center cursor-pointer select-none hover:text-primary transition py-1"
        >
          <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
            {txnType === 'expense' ? 'Expenses' : 'Income'} Categories Breakdown
          </h4>
          <span className="text-muted-foreground/60">
            {isCategoriesExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        </div>

        {isCategoriesExpanded && (
          <div className="divide-y divide-border/20 pt-1 animate-slide-up">
            {currentPeriodData.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-5 font-normal">
                No categories recorded for this period.
              </p>
            ) : (
              currentPeriodData.map((item) => {
                const percentage = totalSpend > 0 ? (item.amount / totalSpend) * 100 : 0;
                const isSelected = selectedCategoryForList === item.category;

                return (
                  <div key={item.category} className="py-0.5">
                    {/* Category Row */}
                    <div 
                      onClick={() => handleBarClick(item.category)}
                      className={`group cursor-pointer py-2.5 px-2 rounded-lg transition-all flex items-center justify-between text-sm ${
                        isSelected
                          ? 'bg-primary/10 border-l-2 border-primary font-semibold'
                          : 'hover:bg-muted/20'
                      }`}
                      title={`View transactions for ${item.category}`}
                    >
                      <span className="font-medium text-foreground truncate pr-3 flex items-center gap-1.5">
                        {item.category}
                      </span>
                      <div className="flex items-center gap-2.5 shrink-0">
                        <span className={`font-mono font-semibold ${txnType === 'income' ? 'text-positive' : 'text-foreground'}`}>
                          {txnType === 'income' ? '+' : ''}₹{item.amount.toLocaleString('en-IN')}
                        </span>
                        <span className="text-xs text-muted-foreground/80 font-mono w-9 text-right shrink-0">
                          {percentage.toFixed(0)}%
                        </span>
                      </div>
                    </div>

                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {selectedCategoryForList && createPortal(
        <div
          className="fixed inset-0 z-[100] flex h-[100dvh] w-screen flex-col overflow-hidden bg-background text-foreground"
          onTouchStart={(event) => {
            event.stopPropagation();
            detailTouchStartX.current = event.touches[0].clientX;
          }}
          onTouchEnd={(event) => {
            event.stopPropagation();
            if (detailTouchStartX.current === null) return;
            const distance = detailTouchStartX.current - event.changedTouches[0].clientX;
            if (Math.abs(distance) > 50) shiftDetailMonth(distance > 0 ? 1 : -1);
            detailTouchStartX.current = null;
          }}
        >
          <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3 sm:px-6">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold">
                {selectedCategoryForList}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {new Date(detailYear, detailMonth, 1).toLocaleDateString('en-IN', {
                    month: 'long',
                    year: 'numeric',
                  })}
                </span>
              </h2>
              <p className="text-xs text-muted-foreground">
                {txnType === 'expense' ? 'Spending' : 'Income'} history
              </p>
            </div>
            <button
              onClick={closeCategoryDetails}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              aria-label="Close category details"
            >
              <X size={20} />
            </button>
          </header>

          <main className="flex-1 overflow-y-auto px-4 pb-8 pt-4 sm:px-6">
            <div className="mx-auto w-full max-w-4xl space-y-5">
              <section className="rounded-xl border border-border bg-muted/80 px-4 py-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="mt-0.5 text-sm font-semibold">
                      {txnType === 'expense' ? 'Subcategory spending' : 'Subcategory income'}
                    </h3>
                  </div>
                  <span className={`text-sm font-bold ${txnType === 'income' ? 'text-positive' : 'text-negative'}`}>
                    ₹{detailTotal.toLocaleString('en-IN')}
                  </span>
                </div>

                {subcategoryBreakdown.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    No subcategory activity for this month.
                  </p>
                ) : (
                  <div className="divide-y divide-border/30">
                    {subcategoryBreakdown.map((item) => {
                      return (
                        <div key={item.subcategory} className="py-3">
                          <div className="flex items-center justify-between gap-3 text-xs">
                            <span className="truncate font-medium">{item.subcategory}</span>
                            <span className="shrink-0 font-mono font-semibold">
                              ₹{item.amount.toLocaleString('en-IN')}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section>
                {categoryTransactions.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">No transactions recorded for this month.</p>
                ) : (
                  <div className="divide-y divide-border/30 px-3">
                    {categoryTransactions.map((txn) => (
                      <button
                        key={txn.id}
                        type="button"
                        onClick={() => openTransactionEditor(txn)}
                        className="flex w-full items-center justify-between gap-4 px-1 py-3 text-left hover:bg-secondary/20"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{txn.description || txn.category || 'Transaction'}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {new Date(txn.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} • {getAccountName(txn.account)}
                          </div>
                        </div>
                        <span className={`shrink-0 font-mono text-sm font-bold ${txn.type === 'income' ? 'text-positive' : 'text-negative'}`}>
                          {txn.type === 'income' ? '+' : '-'}₹{txn.amount.toLocaleString('en-IN')}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="px-1 py-2">
                <button
                  type="button"
                  onClick={() => setIsCategoryHistoryExpanded((expanded) => !expanded)}
                  className="flex w-full items-center justify-between border-b border-border/40 py-3 text-left text-sm font-semibold"
                  aria-expanded={isCategoryHistoryExpanded}
                >
                  <span>{txnType === 'expense' ? 'Spending graph' : 'Income graph'}</span>
                  {isCategoryHistoryExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                {isCategoryHistoryExpanded && (
                  <div className="pt-3">
                    <ResponsiveContainer width="100%" height={210}>
                      <BarChart data={categoryHistory} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                        <YAxis tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}K`} axisLine={false} tickLine={false} width={44} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                        <Tooltip content={<SimpleTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                        <Bar dataKey="amount" fill={txnType === 'income' ? 'var(--positive)' : 'var(--primary)'} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </section>

              <p className="text-center text-xs text-muted-foreground">Swipe left or right to change month</p>
            </div>
          </main>

        </div>,
        document.body
      )}
    </div>
  );
}
