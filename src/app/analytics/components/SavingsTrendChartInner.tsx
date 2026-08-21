'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import {
  getSavingsYoY,
  getSavingsMoM,
  getAccounts,
  getBalanceAtDate,
  getTransactions,
  type Account,
} from '@/lib/storage';
import { type DateRange } from './AnalyticsFilters';
import { ChevronDown } from 'lucide-react';
import ChartFilterBar from './ChartFilterBar';

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

interface SavingsPoint {
  month: string;
  savings: number;
  prevSavings: number;
  dateObj?: Date;
  isMonthlyPoint?: boolean;
  monthIndex?: number;
  isDailyPoint?: boolean;
  isTxn?: boolean;
  txnDetails?: any;
}

function CustomTooltip({
  active,
  payload,
  label,
  isSingleMonth,
  trendType,
  currentLabel,
  previousLabel,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
  isSingleMonth: boolean;
  trendType: 'savings' | 'income' | 'expense' | 'balance';
  currentLabel: string;
  previousLabel: string;
}) {
  if (!active || !payload?.length) return null;

  const firstPayload = payload[0];
  const isTxn = firstPayload?.payload?.isTxn;
  const txn = firstPayload?.payload?.txnDetails;

  if (isTxn && txn) {
    const isIncome = txn.type === 'income';
    return (
      <div className="chart-tooltip-card min-w-[200px]">
        <p className="text-xs font-bold text-foreground mb-1 truncate max-w-[240px]">
          {txn.description || txn.notes || 'Transaction'}
        </p>
        <p className="text-4xs text-muted-foreground uppercase tracking-wider mb-2">
          {new Date(txn.date).toLocaleString('en-IN', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
        <div className="space-y-1 text-3xs">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Type:</span>
            <span
              className={`font-semibold capitalize ${isIncome ? 'text-positive' : 'text-negative'}`}
            >
              {txn.type}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Category:</span>
            <span className="font-semibold text-slate-300">{txn.category}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Amount:</span>
            <span className={`font-extrabold ${isIncome ? 'text-positive' : 'text-negative'}`}>
              ₹{txn.amount.toLocaleString('en-IN')}
            </span>
          </div>
          {trendType === 'balance' && (
            <div className="flex justify-between gap-4 border-t border-border/30 pt-1 mt-1">
              <span className="text-muted-foreground">Post-Balance:</span>
              <span className="font-extrabold text-info">
                ₹{firstPayload.value.toLocaleString('en-IN')}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="chart-tooltip-card">
      <p className="text-xs font-semibold text-muted-foreground mb-2">
        {isSingleMonth ? `Day ${label}` : label}
      </p>
      {payload.map((entry) => (
        <div key={`stip-${entry.name}`} className="flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-xs text-muted-foreground capitalize text-left">
              {entry.name === 'savings'
                ? `${currentLabel} ${trendType === 'balance' ? '' : trendType}`
                : `${previousLabel} ${trendType === 'balance' ? '' : trendType}`}
            </span>
          </div>
          <span
            className={`text-xs font-semibold tabular-nums ${entry.value < 0 ? 'text-negative' : 'text-positive'}`}
          >
            {trendType === 'balance' ? (
              <>₹{entry.value.toLocaleString('en-IN')}</>
            ) : (
              <>
                {entry.value < 0 ? '-' : '+'}₹{Math.abs(entry.value).toLocaleString('en-IN')}
              </>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

interface SavingsTrendChartInnerProps {
  selectedCategories: string[];
  selectedRange: DateRange;
  selectedAccountId?: string;
  setSelectedAccountId?: (id: string) => void;
  selectedMonth: number;
  selectedYear: number;
  useMonthFilter: boolean;
}

export default function SavingsTrendChartInner() {
  const [selectedRange, setSelectedRange] = useState<DateRange>('This Month');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [useMonthFilter, setUseMonthFilter] = useState<boolean>(false);
  const [selectedCategories] = useState<string[]>([]);

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

  const [data, setData] = useState<SavingsPoint[]>([]);
  const [trendType, setTrendType] = useState<'savings' | 'income' | 'expense' | 'balance'>(
    'balance'
  );
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showCurrent, setShowCurrent] = useState(true);
  const [showPrevious, setShowPrevious] = useState(true);

  // Granularity & Drill-down states
  const [granularity, setGranularity] = useState<'monthly' | 'daily' | 'transaction'>('monthly');
  const [drillMonth, setDrillMonth] = useState<number | null>(null);
  const [drillDate, setDrillDate] = useState<Date | null>(null);

  const [zoomLevel, setZoomLevel] = useState(1);
  const [isPinching, setIsPinching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const initialDist = useRef<number | null>(null);
  const initialZoom = useRef<number>(1);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      initialDist.current = dist;
      initialZoom.current = zoomLevel;
      setIsPinching(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialDist.current !== null) {
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = dist / initialDist.current;
      const newZoom = Math.min(Math.max(initialZoom.current * factor, 1), 3);
      setZoomLevel(newZoom);
    }
  };

  const handleTouchEnd = () => {
    initialDist.current = null;
    setIsPinching(false);
  };

  useEffect(() => {
    setAccounts(getAccounts());
  }, []);

  const { currentLabel, previousLabel } = useMemo(() => {
    if (drillDate !== null) {
      return { currentLabel: `Day ${drillDate.getDate()}`, previousLabel: '' };
    }
    if (drillMonth !== null) {
      const targetYear = selectedRange === 'Last Year' ? selectedYear - 1 : selectedYear;
      const curDate = new Date(targetYear, drillMonth, 1);
      const prevDate = new Date(targetYear, drillMonth - 1, 1);
      const curStr = curDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
      const prevStr = prevDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
      return { currentLabel: curStr, previousLabel: prevStr };
    }
    if (useMonthFilter) {
      const curDate = new Date(selectedYear, selectedMonth, 1);
      const prevDate = new Date(selectedYear, selectedMonth - 1, 1);
      const curStr = curDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
      const prevStr = prevDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
      return { currentLabel: curStr, previousLabel: prevStr };
    }

    switch (selectedRange) {
      case 'This Month':
        return { currentLabel: 'This Month', previousLabel: 'Last Month' };
      case 'Last 3 Months':
        return { currentLabel: 'Last 3 Months', previousLabel: 'Prev 3 Months' };
      case 'Last 6 Months':
        return { currentLabel: 'Last 6 Months', previousLabel: 'Prev 6 Months' };
      case 'This Year':
        return { currentLabel: 'This Year', previousLabel: 'Last Year' };
      case 'Last Year':
        return { currentLabel: 'Last Year', previousLabel: 'Prev Year' };
      case 'All Time':
      default:
        return { currentLabel: 'All Time', previousLabel: '' };
    }
  }, [selectedRange, selectedMonth, selectedYear, useMonthFilter, drillMonth, drillDate]);

  const isSingleMonth = useMemo(() => {
    if (drillDate !== null) return true;
    if (drillMonth !== null) return true;
    if (useMonthFilter || selectedRange === 'This Month') return true;
    return false;
  }, [selectedRange, useMonthFilter, drillMonth, drillDate]);

  useEffect(() => {
    // 1. Determine date ranges
    const now = new Date();
    let start: Date;
    let end: Date;
    let prevStart: Date;
    let prevEnd: Date;
    let isAllTime = false;

    if (drillDate !== null) {
      start = new Date(
        drillDate.getFullYear(),
        drillDate.getMonth(),
        drillDate.getDate(),
        0,
        0,
        0,
        0
      );
      end = new Date(
        drillDate.getFullYear(),
        drillDate.getMonth(),
        drillDate.getDate(),
        23,
        59,
        59,
        999
      );
      prevStart = new Date(start);
      prevEnd = new Date(start);
    } else if (drillMonth !== null) {
      start = new Date(selectedYear, drillMonth, 1);
      end = new Date(selectedYear, drillMonth + 1, 0, 23, 59, 59, 999);

      prevStart = new Date(selectedYear, drillMonth - 1, 1);
      prevEnd = new Date(selectedYear, drillMonth, 0, 23, 59, 59, 999);
    } else {
      if (useMonthFilter) {
        start = new Date(selectedYear, selectedMonth, 1);
        end = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999);

        prevStart = new Date(selectedYear, selectedMonth - 1, 1);
        prevEnd = new Date(selectedYear, selectedMonth, 0, 23, 59, 59, 999);
      } else {
        switch (selectedRange) {
          case 'This Month': {
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

            prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
            break;
          }
          case 'Last 3 Months': {
            start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

            prevStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
            prevEnd = new Date(now.getFullYear(), now.getMonth() - 2, 0, 23, 59, 59, 999);
            break;
          }
          case 'Last 6 Months': {
            start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

            prevStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);
            prevEnd = new Date(now.getFullYear(), now.getMonth() - 5, 0, 23, 59, 59, 999);
            break;
          }
          case 'This Year': {
            start = new Date(now.getFullYear(), 0, 1);
            end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);

            prevStart = new Date(now.getFullYear() - 1, 0, 1);
            prevEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
            break;
          }
          case 'Last Year': {
            start = new Date(selectedYear - 1, 0, 1);
            end = new Date(selectedYear - 1, 11, 31, 23, 59, 59, 999);

            prevStart = new Date(selectedYear - 2, 0, 1);
            prevEnd = new Date(selectedYear - 2, 11, 31, 23, 59, 59, 999);
            break;
          }
          case 'All Time':
          default: {
            isAllTime = true;
            let earliest = new Date(now.getFullYear() - 1, now.getMonth(), 1);
            const allTxns = getTransactions().filter((t) => typeof t.date === 'string');
            if (allTxns.length > 0) {
              const sortedDates = allTxns
                .map((t) => new Date(t.date))
                .filter((d) => !isNaN(d.getTime()))
                .sort((a, b) => a.getTime() - b.getTime());
              if (sortedDates.length > 0) {
                earliest = sortedDates[0];
              }
            }
            start = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

            prevStart = new Date(start);
            prevEnd = new Date(start);
            break;
          }
        }
      }
    }

    // Filter transactions
    let txns = getTransactions();
    if (selectedAccountId) {
      txns = txns.filter((t) => t.account === selectedAccountId);
    }
    if (selectedCategories && selectedCategories.length > 0) {
      txns = txns.filter((t) => selectedCategories.includes(t.category));
    }

    if (drillDate !== null || granularity === 'transaction') {
      // 2a. Transaction-by-transaction mode
      const periodTxns = txns.filter((t) => {
        if (!t.date || typeof t.date !== 'string') return false;
        const d = new Date(t.date);
        return d >= start && d <= end;
      });

      periodTxns.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      let runningBal = 0;
      if (trendType === 'balance' && periodTxns.length > 0) {
        const firstTxnTime = new Date(periodTxns[0].date).getTime();
        const startOfDayStr = new Date(firstTxnTime - 1000).toISOString();
        runningBal = getBalanceAtDate(startOfDayStr, selectedAccountId);
      }

      const points = periodTxns.map((t, idx) => {
        let val = 0;
        const amt = Number(t.amount) || 0;
        if (trendType === 'income') {
          val = t.type === 'income' ? amt : 0;
        } else if (trendType === 'expense') {
          val = t.type === 'expense' ? amt : 0;
        } else if (trendType === 'savings') {
          val = t.type === 'income' ? amt : -amt;
        } else if (trendType === 'balance') {
          if (t.type === 'income') runningBal += amt;
          else if (t.type === 'expense') runningBal -= amt;
          val = runningBal;
        }

        const dateObj = new Date(t.date);
        const formattedDate = dateObj.toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        });
        const desc = t.description || t.category || t.notes || 'Transaction';

        return {
          month: `${formattedDate} - ${desc}`,
          savings: val,
          prevSavings: 0,
          dateObj,
          isTxn: true,
          txnDetails: t,
        };
      });

      setData(points);
    } else if (granularity === 'monthly' && drillMonth === null && !useMonthFilter) {
      // 2b. Monthly view respecting start and end bounds of selectedRange
      const startYear = start.getFullYear();
      const startMonth = start.getMonth();
      const endYear = end.getFullYear();
      const endMonth = end.getMonth();

      const totalMonths = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
      const points = [];
      const monthNames = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
      ];

      for (let i = 0; i < totalMonths; i++) {
        const curDate = new Date(startYear, startMonth + i, 1);
        const y = curDate.getFullYear();
        const m = curDate.getMonth();

        // Skip future months
        if (y > now.getFullYear() || (y === now.getFullYear() && m > now.getMonth())) {
          continue;
        }

        // Equivalent month in previous period offset
        const prevDate = new Date(y, m - totalMonths, 1);
        const pY = prevDate.getFullYear();
        const pM = prevDate.getMonth();

        let savings = 0;
        let prevSavings = 0;

        if (trendType === 'balance') {
          const lastDayIso = new Date(y, m + 1, 0, 23, 59, 59, 999).toISOString();
          const lastDayPrevIso = new Date(pY, pM + 1, 0, 23, 59, 59, 999).toISOString();
          savings = getBalanceAtDate(lastDayIso, selectedAccountId);
          prevSavings = getBalanceAtDate(lastDayPrevIso, selectedAccountId);
        } else {
          txns.forEach((t) => {
            if (!t.date || typeof t.date !== 'string') return;
            const d = new Date(t.date);
            if (isNaN(d.getTime())) return;

            const tY = d.getFullYear();
            const tM = d.getMonth();
            const amt = Number(t.amount) || 0;

            if (tY === y && tM === m) {
              if (trendType === 'income') {
                if (t.type === 'income') savings += amt;
              } else if (trendType === 'expense') {
                if (t.type === 'expense') savings += amt;
              } else if (trendType === 'savings') {
                if (t.type === 'income') savings += amt;
                if (t.type === 'expense') savings -= amt;
              }
            }

            if (tY === pY && tM === pM) {
              if (trendType === 'income') {
                if (t.type === 'income') prevSavings += amt;
              } else if (trendType === 'expense') {
                if (t.type === 'expense') prevSavings += amt;
              } else if (trendType === 'savings') {
                if (t.type === 'income') prevSavings += amt;
                if (t.type === 'expense') prevSavings -= amt;
              }
            }
          });
        }

        const label = totalMonths <= 12
          ? monthNames[m]
          : `${monthNames[m]} '${String(y).slice(-2)}`;

        points.push({
          month: label,
          savings,
          prevSavings,
          monthIndex: m,
          isMonthlyPoint: true,
        });
      }

      setData(points);
    } else {
      // 2c. Daily view (granularity === 'daily' || drillMonth !== null)
      const currentDays: Date[] = [];
      const curr = new Date(start);
      while (curr <= end) {
        if (curr > now) break;
        currentDays.push(new Date(curr));
        curr.setDate(curr.getDate() + 1);
      }

      const prevDays: Date[] = [];
      if (!isAllTime) {
        const pCurr = new Date(prevStart);
        while (pCurr <= prevEnd) {
          prevDays.push(new Date(pCurr));
          pCurr.setDate(pCurr.getDate() + 1);
        }
      }

      const dailySums: Record<string, number> = {};
      txns.forEach((t) => {
        if (!t.date || typeof t.date !== 'string') return;
        const dayKey = t.date.includes('T') ? t.date.split('T')[0] : t.date;
        const amt = Number(t.amount) || 0;

        if (!dailySums[dayKey]) dailySums[dayKey] = 0;

        if (trendType === 'income') {
          if (t.type === 'income') dailySums[dayKey] += amt;
        } else if (trendType === 'expense') {
          if (t.type === 'expense') dailySums[dayKey] += amt;
        } else if (trendType === 'savings') {
          if (t.type === 'income') dailySums[dayKey] += amt;
          if (t.type === 'expense') dailySums[dayKey] -= amt;
        }
      });

      const maxDays = Math.max(currentDays.length, prevDays.length);
      const points = [];
      const isSingleMonthView = currentDays.length <= 31;

      for (let i = 0; i < maxDays; i++) {
        const cDay = currentDays[i];
        const pDay = prevDays[i];

        let savings = 0;
        let prevSavings = 0;
        let label = '';

        if (cDay) {
          const dayKey = `${cDay.getFullYear()}-${String(cDay.getMonth() + 1).padStart(2, '0')}-${String(cDay.getDate()).padStart(2, '0')}`;
          if (trendType === 'balance') {
            const iso = new Date(
              cDay.getFullYear(),
              cDay.getMonth(),
              cDay.getDate(),
              23,
              59,
              59,
              999
            ).toISOString();
            savings = getBalanceAtDate(iso, selectedAccountId);
          } else {
            savings = dailySums[dayKey] || 0;
          }

          label = isSingleMonthView
            ? String(cDay.getDate())
            : cDay.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        }

        if (pDay) {
          const dayKey = `${pDay.getFullYear()}-${String(pDay.getMonth() + 1).padStart(2, '0')}-${String(pDay.getDate()).padStart(2, '0')}`;
          if (trendType === 'balance') {
            const iso = new Date(
              pDay.getFullYear(),
              pDay.getMonth(),
              pDay.getDate(),
              23,
              59,
              59,
              999
            ).toISOString();
            prevSavings = getBalanceAtDate(iso, selectedAccountId);
          } else {
            prevSavings = dailySums[dayKey] || 0;
          }
        }

        points.push({
          month: label || String(i + 1),
          savings,
          prevSavings,
          dateObj: cDay,
          isDailyPoint: true,
        });
      }

      setData(points);
    }
  }, [
    selectedRange,
    selectedCategories,
    selectedAccountId,
    selectedMonth,
    selectedYear,
    useMonthFilter,
    trendType,
    granularity,
    drillMonth,
    drillDate,
  ]);

  const totalSaved = data.reduce((s, d) => s + d.savings, 0);

  const bestPoint = useMemo(() => {
    if (data.length === 0) return null;
    return data.reduce((best, d) => (d.savings > best.savings ? d : best), data[0]);
  }, [data]);

  function fmt(n: number) {
    if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
    if (Math.abs(n) >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
    return `₹${n.toLocaleString('en-IN')}`;
  }

  const strokeColor =
    trendType === 'income'
      ? 'var(--positive)'
      : trendType === 'expense'
        ? 'var(--negative)'
        : trendType === 'balance'
          ? 'var(--info)'
          : 'var(--primary)';

  const cardTitle =
    trendType === 'income'
      ? 'Income Trend'
      : trendType === 'expense'
        ? 'Expense Trend'
        : trendType === 'balance'
          ? 'Account Balance Trend'
          : 'Savings Trend';

  return (
    <div className="px-1 py-2">
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <h3 className="text-base font-semibold text-foreground">{cardTitle}</h3>
        {(granularity !== 'monthly' || drillMonth !== null || drillDate !== null) && (
          <button
            onClick={() => {
              setGranularity('monthly');
              setDrillMonth(null);
              setDrillDate(null);
            }}
            className="px-3 py-1.5 rounded-lg border border-border bg-[#0b0f1a] text-xs font-bold text-muted-foreground hover:text-foreground hover:border-primary/25 transition shadow-sm"
          >
            Reset to Monthly View
          </button>
        )}
      </div>

      {/* Date & Subtitle Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 border-t border-border/20 pt-3">
        {/* Left: Active Month Display */}
        <div className="text-xs font-bold text-foreground select-none uppercase tracking-wider py-1.5">
          📅 {MONTH_SHORT[selectedMonth]} {selectedYear}
        </div>
        {/* Right: Description */}
        <p className="text-xs text-muted-foreground py-1.5">
          {granularity === 'transaction' || drillDate !== null
            ? 'Transaction timeline flow'
            : 'Daily trend — current vs previous period'}
        </p>
      </div>

      {/* Toggles Row */}
      <div className="flex flex-col gap-3.5 mb-5 border-b border-border/40 pb-4">
        {/* Trend Type Selector & Granularity Buttons Row */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex gap-1 bg-muted/30 border border-border/80 rounded-xl p-1 w-fit">
            {(['savings', 'income', 'expense', 'balance'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setTrendType(type)}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg capitalize transition-all ${
                  trendType === type
                    ? type === 'income'
                      ? 'bg-positive/20 text-positive shadow-sm'
                      : type === 'expense'
                        ? 'bg-negative/20 text-negative shadow-sm'
                        : type === 'balance'
                          ? 'bg-info/20 text-info shadow-sm'
                          : 'bg-primary/20 text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {type === 'balance' ? 'account balance' : type}
              </button>
            ))}
          </div>

          {/* Granularity selector */}
          <div className="flex gap-1 bg-muted/30 border border-border/80 rounded-xl p-1 w-fit select-none">
            <button
              onClick={() => {
                setGranularity('monthly');
                setDrillMonth(null);
                setDrillDate(null);
              }}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                granularity === 'monthly'
                  ? 'bg-primary/20 text-primary shadow-xs border border-primary/30'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => {
                setGranularity('daily');
                setDrillMonth(null);
                setDrillDate(null);
              }}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                granularity === 'daily'
                  ? 'bg-primary/20 text-primary shadow-xs border border-primary/30'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Daily
            </button>
          </div>
        </div>

        {/* Legend Row */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowCurrent(!showCurrent)}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-2xs font-semibold transition-all ${
                showCurrent
                  ? 'border-border bg-muted/20 text-foreground font-semibold'
                  : 'border-transparent text-muted-foreground line-through opacity-50'
              }`}
              title="Toggle current period visibility"
            >
              <div
                className="w-2.5 h-0.5 rounded"
                style={{ backgroundColor: showCurrent ? strokeColor : 'var(--muted-foreground)' }}
              />
              <span>{currentLabel}</span>
            </button>

            {previousLabel && granularity !== 'transaction' && drillDate === null && (
              <button
                type="button"
                onClick={() => setShowPrevious(!showPrevious)}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-2xs font-semibold transition-all ${
                  showPrevious
                    ? 'border-border bg-muted/20 text-foreground font-semibold'
                    : 'border-transparent text-muted-foreground line-through opacity-50'
                }`}
                title="Toggle previous period visibility"
              >
                <div
                  className="w-2.5 h-0.5 rounded"
                  style={{
                    borderStyle: 'dashed',
                    backgroundColor: showPrevious ? 'var(--muted-foreground)' : 'transparent',
                    borderWidth: showPrevious ? 1 : 0,
                  }}
                />
                <span>{previousLabel}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                const active = showCurrent || showPrevious;
                setShowCurrent(!active);
                setShowPrevious(!active);
              }}
              className="text-3xs font-bold px-1.5 py-0.5 rounded border border-border/65 bg-[#0b0f1a] text-muted-foreground hover:text-foreground transition-all"
            >
              {showCurrent || showPrevious ? 'Hide All' : 'Show All'}
            </button>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-1.5 bg-muted/20 border border-border/40 rounded-lg p-0.5 select-none">
            <button
              onClick={() => setZoomLevel((prev) => Math.max(prev - 0.25, 1))}
              disabled={zoomLevel <= 1}
              className="w-5 h-5 flex items-center justify-center text-3xs font-bold text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition bg-secondary/40 hover:bg-secondary rounded font-mono"
              title="Zoom Out"
            >
              -
            </button>
            <span className="text-[10px] font-mono font-bold text-primary px-1 select-none">
              {zoomLevel.toFixed(2)}x
            </span>
            <button
              onClick={() => setZoomLevel((prev) => Math.min(prev + 0.25, 3))}
              disabled={zoomLevel >= 3}
              className="w-5 h-5 flex items-center justify-center text-3xs font-bold text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition bg-secondary/40 hover:bg-secondary rounded font-mono"
              title="Zoom In"
            >
              +
            </button>
            {zoomLevel > 1 && (
              <button
                onClick={() => setZoomLevel(1)}
                className="px-1.5 py-0.5 text-[9px] font-bold bg-primary/20 hover:bg-primary/30 text-primary rounded transition"
              >
                Reset
              </button>
            )}
          </div>

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
      </div>

      {/* Drill-down Breadcrumb Bar */}
      {(drillMonth !== null || drillDate !== null) && (
        <div className="flex items-center gap-2 mb-4 bg-muted/20 border border-border/50 px-3 py-2 rounded-xl text-xs">
          <button
            onClick={() => {
              if (drillDate !== null) {
                setDrillDate(null);
              } else if (drillMonth !== null) {
                setDrillMonth(null);
              }
            }}
            className="text-primary font-bold hover:underline flex items-center gap-1 transition"
          >
            ← Back
          </button>
          <span className="text-muted-foreground/60">|</span>
          <span className="text-muted-foreground font-medium">
            Drilled View:{' '}
            <strong className="text-foreground">
              {drillDate
                ? `Transactions on ${drillDate.toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}`
                : `Daily entries for ${new Date(
                    selectedRange === 'Last Year' ? selectedYear - 1 : selectedYear,
                    drillMonth || 0
                  ).toLocaleString('default', {
                    month: 'long',
                  })}`}
            </strong>
          </span>
        </div>
      )}

      {data.length === 0 || data.every((d) => d.savings === 0 && d.prevSavings === 0) ? (
        <div className="flex items-center justify-center h-[220px]">
          <p className="text-sm text-muted-foreground">No data for this selection yet</p>
        </div>
      ) : (
        <div 
          ref={containerRef}
          className="w-full overflow-x-auto select-none select-scrollbar"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div style={{ width: `${zoomLevel * 100}%`, minWidth: '100%' }}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart
                data={data}
                margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                  interval={Math.ceil(data.length / 10)}
                />
                <YAxis
                  tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`}
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                />
                <Tooltip
                  content={
                    <CustomTooltip
                      isSingleMonth={isSingleMonth}
                      trendType={trendType}
                      currentLabel={currentLabel}
                      previousLabel={previousLabel}
                    />
                  }
                />
                <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />
                {showCurrent && (
                  <Line
                    type="monotone"
                    dataKey="savings"
                    stroke={strokeColor}
                    strokeWidth={2.5}
                    dot={{
                      fill: strokeColor,
                      r:
                        granularity === 'transaction' || drillDate !== null
                          ? 2
                          : isSingleMonth
                            ? 2
                            : 1.5,
                      strokeWidth: 0,
                      className: 'cursor-pointer hover:r-4 transition-all',
                    }}
                    activeDot={{ r: 5, strokeWidth: 1.5, stroke: 'var(--background)' }}
                  />
                )}
                {showPrevious &&
                  previousLabel &&
                  granularity !== 'transaction' &&
                  drillDate === null && (
                    <Line
                      type="monotone"
                      dataKey="prevSavings"
                      stroke="var(--muted-foreground)"
                      strokeWidth={1.5}
                      strokeDasharray="5 4"
                      dot={false}
                    />
                  )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border">
        <div className="text-center">
          <p className="text-sm font-bold tabular-nums text-positive">{fmt(totalSaved)}</p>
          <p className="text-2xs text-muted-foreground font-semibold">Total Volume</p>
        </div>
        <div className="text-center">
          <p className="text-sm font-bold tabular-nums text-primary">
            {data.length > 0 ? fmt(totalSaved / data.length) : '₹0'}
          </p>
          <p className="text-2xs text-muted-foreground font-semibold">Avg / Point</p>
        </div>
        <div className="text-center">
          <p className="text-sm font-bold tabular-nums text-foreground">
            {bestPoint
              ? `${isSingleMonth ? `Day ${bestPoint.month}` : bestPoint.month} — ${fmt(bestPoint.savings)}`
              : '—'}
          </p>
          <p className="text-2xs text-muted-foreground font-semibold">Best Point</p>
        </div>
      </div>
    </div>
  );
}
