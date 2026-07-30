'use client';

import React, { useState, useEffect } from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { getAccounts, type Account, type Transaction } from '@/lib/storage';
import { type DateRange, DATE_RANGES } from './AnalyticsFilters';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

export function filterTransactions(
  txns: Transaction[],
  range: DateRange,
  selectedAccountId: string,
  selectedMonth: number,
  selectedYear: number,
  useMonthFilter: boolean,
  categories: string[] = []
): Transaction[] {
  let filtered = txns;

  // 1. Filter by Account
  if (selectedAccountId) {
    filtered = filtered.filter((t) => t && t.account === selectedAccountId);
  }

  // 2. Filter by Date / Month
  if (useMonthFilter) {
    const monthStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
    filtered = filtered.filter(
      (t) => t && typeof t.date === 'string' && t.date.startsWith(monthStr)
    );
  } else {
    const now = new Date();
    filtered = filtered.filter((t) => {
      if (!t || typeof t.date !== 'string') return false;
      const txnDate = new Date(t.date);
      if (isNaN(txnDate.getTime())) return false;

      switch (range) {
        case 'This Month': {
          return (
            txnDate.getFullYear() === now.getFullYear() && txnDate.getMonth() === now.getMonth()
          );
        }
        case 'Last 3 Months': {
          const limitDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
          return txnDate >= limitDate;
        }
        case 'Last 6 Months': {
          const limitDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
          return txnDate >= limitDate;
        }
        case 'This Year': {
          return txnDate.getFullYear() === now.getFullYear();
        }
        case 'Last Year': {
          return txnDate.getFullYear() === now.getFullYear() - 1;
        }
        case 'All Time':
        default:
          return true;
      }
    });
  }

  // 3. Filter by Categories
  if (categories.length > 0) {
    filtered = filtered.filter((t) => t && categories.includes(t.category));
  }

  return filtered;
}

interface ChartFilterBarProps {
  selectedRange: DateRange;
  setSelectedRange: (range: DateRange) => void;
  selectedAccountId: string;
  setSelectedAccountId: (id: string) => void;
  useMonthFilter: boolean;
  setUseMonthFilter: (use: boolean) => void;
  selectedMonth: number;
  setSelectedMonth: (month: number) => void;
  selectedYear: number;
  setSelectedYear: (year: number) => void;
}

export default function ChartFilterBar({
  selectedRange,
  setSelectedRange,
  selectedAccountId,
  setSelectedAccountId,
  useMonthFilter,
  setUseMonthFilter,
  selectedMonth,
  setSelectedMonth,
  selectedYear,
  setSelectedYear,
}: ChartFilterBarProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  useEffect(() => {
    setAccounts(getAccounts());
  }, []);

  const shiftMonth = (delta: number) => {
    let m = selectedMonth + delta;
    let y = selectedYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
    if (m > 11) {
      m = 0;
      y += 1;
    }
    setSelectedMonth(m);
    setSelectedYear(y);
  };

  return (
    <div 
      className="flex items-center gap-2 py-1 text-xs font-semibold flex-nowrap overflow-x-auto"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      <div className="flex items-center gap-1.5 text-muted-foreground mr-1 text-xs flex-shrink-0">
        <SlidersHorizontal size={12} className="stroke-[2px]" />
        <span>Filter:</span>
      </div>

      {/* Date Range Selection Dropdown */}
      <div className="relative flex-shrink-0">
        <select
          value={useMonthFilter ? 'Specific Month' : selectedRange}
          onChange={(e) => {
            const val = e.target.value;
            if (val === 'Specific Month') {
              setUseMonthFilter(true);
              setIsDatePickerOpen(true);
            } else {
              setUseMonthFilter(false);
              setSelectedRange(val as DateRange);
            }
          }}
          className="h-8 text-xs bg-[#0b0f1a] border border-border/60 rounded-md px-3 py-1 text-slate-300 appearance-none cursor-pointer pr-8 hover:border-primary/40 focus:border-primary focus:outline-none transition-all font-semibold"
        >
          {DATE_RANGES.map((range) => (
            <option key={range} value={range} className="bg-[#0b0f1a] text-slate-300">
              {range}
            </option>
          ))}
          <option value="Specific Month" className="bg-[#0b0f1a] text-slate-300">
            {useMonthFilter ? `${MONTH_NAMES[selectedMonth]} ${selectedYear}` : 'Specific Month'}
          </option>
        </select>
        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      </div>

      {/* Account Selector */}
      <div className="relative flex-shrink-0">
        <select
          value={selectedAccountId}
          onChange={(e) => setSelectedAccountId(e.target.value)}
          className="h-8 w-28 text-xs bg-[#0b0f1a] border border-border/60 rounded-md pl-2 pr-6 text-slate-300 appearance-none cursor-pointer hover:border-primary/40 focus:border-primary focus:outline-none transition-all font-semibold truncate"
        >
          <option value="" className="bg-[#0b0f1a] text-slate-300">
            All Accounts
          </option>
          {accounts.map((acc) => (
            <option key={acc.id} value={acc.id} className="bg-[#0b0f1a] text-slate-300">
              {acc.name}
            </option>
          ))}
        </select>
        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      </div>
    </div>
  );
}
