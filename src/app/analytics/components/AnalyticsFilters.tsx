'use client';

import React, { useState, useEffect } from 'react';
import { ChevronDown, X, SlidersHorizontal, ChevronLeft, ChevronRight } from 'lucide-react';
import { getAccounts, type Account } from '@/lib/storage';

export const DATE_RANGES = [
  'This Month',
  'Last 3 Months',
  'Last 6 Months',
  'This Year',
  'Last Year',
  'All Time',
] as const;
export type DateRange = (typeof DATE_RANGES)[number];

const CATEGORIES = [
  'Food & Dining',
  'Groceries',
  'Transportation',
  'Fuel',
  'EMI / Rent',
  'Entertainment',
  'Shopping',
  'Healthcare',
  'Investments',
  'Utilities',
];

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

interface AnalyticsFiltersProps {
  selectedRange: DateRange;
  setSelectedRange: (range: DateRange) => void;
  selectedCategories: string[];
  setSelectedCategories: React.Dispatch<React.SetStateAction<string[]>>;
  selectedAccountId: string;
  setSelectedAccountId: (id: string) => void;
  selectedMonth: number;
  setSelectedMonth: (month: number) => void;
  selectedYear: number;
  setSelectedYear: (year: number) => void;
  useMonthFilter: boolean;
  setUseMonthFilter: (use: boolean) => void;
}

export default function AnalyticsFilters({
  selectedRange,
  setSelectedRange,
  selectedCategories,
  setSelectedCategories,
  selectedAccountId,
  setSelectedAccountId,
  selectedMonth,
  setSelectedMonth,
  selectedYear,
  setSelectedYear,
  useMonthFilter,
  setUseMonthFilter,
}: AnalyticsFiltersProps) {
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    setAccounts(getAccounts());
  }, []);

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const clearFilters = () => {
    setSelectedCategories([]);
    setSelectedRange('This Year');
    setSelectedAccountId('');
    setUseMonthFilter(false);
  };

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

  const hasFilters =
    selectedCategories.length > 0 ||
    selectedRange !== 'This Year' ||
    selectedAccountId !== '' ||
    useMonthFilter;

  return (
    <div className="bg-card border border-border rounded-xl px-4 py-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <SlidersHorizontal size={13} />
          <span className="font-medium">Filters</span>
        </div>

        {/* Date range selection */}
        {!useMonthFilter && (
          <div className="relative">
            <select
              value={selectedRange}
              onChange={(e) => setSelectedRange(e.target.value as DateRange)}
              className="h-12 text-sm bg-[#0b0f1a] border border-border rounded-xl px-4 py-2.5 text-slate-200 appearance-none cursor-pointer pr-10 hover:border-primary/40 focus:border-primary focus:outline-none transition-all duration-150 font-semibold"
              aria-label="Select Date Range"
            >
              {DATE_RANGES.map((range) => (
                <option key={`range-${range}`} value={range} className="bg-[#0b0f1a] text-slate-200 text-sm">
                  {range}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
          </div>
        )}

        {/* Specific Month Toggle */}
        <button
          onClick={() => {
            const nextVal = !useMonthFilter;
            setUseMonthFilter(nextVal);
            if (nextVal) {
              setIsDatePickerOpen(true);
            }
          }}
          className={`h-12 text-sm font-semibold px-4 py-2.5 rounded-xl border transition-all duration-150 whitespace-nowrap flex items-center ${
            useMonthFilter
              ? 'bg-primary/20 text-primary border-primary/30'
              : 'border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          📅 Specific Month
        </button>

        {/* Specific Month Selector */}
        {useMonthFilter && (
          <div className="flex items-center gap-1.5 bg-[#0b0f1a] border border-border rounded-xl p-1 relative h-12">
            <button
              onClick={() => shiftMonth(-1)}
              className="h-10 w-10 flex items-center justify-center rounded-lg hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-all"
              aria-label="Previous month"
            >
              <ChevronLeft size={18} />
            </button>

            <button
              onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
              className="px-4 rounded-lg hover:bg-muted/80 text-sm font-semibold text-foreground flex items-center gap-1.5 transition-all h-10"
            >
              {MONTH_NAMES[selectedMonth].slice(0, 3)} {selectedYear}
              <ChevronDown size={14} className="text-muted-foreground" />
            </button>

            <button
              onClick={() => shiftMonth(1)}
              className="h-10 w-10 flex items-center justify-center rounded-lg hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-all"
              aria-label="Next month"
            >
              <ChevronRight size={18} />
            </button>

            {isDatePickerOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsDatePickerOpen(false)} />
                <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50 bg-[#0b0f1a] border border-border rounded-xl shadow-2xl p-4 grid grid-cols-2 gap-4 w-72">
                  {/* Month Selection */}
                  <div className="space-y-1 max-h-56 overflow-y-auto pr-1 select-scrollbar">
                    <p className="text-2xs font-bold uppercase tracking-wider text-muted-foreground px-2 py-1 sticky top-0 bg-[#0b0f1a] z-10">
                      Month
                    </p>
                    {MONTH_NAMES.map((m, i) => (
                      <button
                        key={m}
                        onClick={() => {
                          setSelectedMonth(i);
                          setIsDatePickerOpen(false);
                        }}
                        className={`w-full text-left text-sm px-3 py-2.5 rounded-md transition ${
                          selectedMonth === i
                            ? 'bg-primary text-white font-semibold'
                            : 'text-slate-300 hover:bg-muted/50 hover:text-foreground'
                        }`}
                      >
                        {m.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                  {/* Year Selection */}
                  <div className="space-y-1 max-h-56 overflow-y-auto pl-1 select-scrollbar border-l border-border">
                    <p className="text-2xs font-bold uppercase tracking-wider text-muted-foreground px-2 py-1 sticky top-0 bg-[#0b0f1a] z-10">
                      Year
                    </p>
                    {[2024, 2025, 2026, 2027].map((y) => (
                      <button
                        key={y}
                        onClick={() => {
                          setSelectedYear(y);
                          setIsDatePickerOpen(false);
                        }}
                        className={`w-full text-left text-sm px-3 py-2.5 rounded-md transition ${
                          selectedYear === y
                            ? 'bg-primary text-white font-semibold'
                            : 'text-slate-300 hover:bg-muted/50 hover:text-foreground'
                        }`}
                      >
                        {y}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Account select dropdown */}
        <div className="relative">
          <select
            value={selectedAccountId || ''}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className="h-12 text-sm bg-[#0b0f1a] border border-border rounded-xl px-4 py-2.5 text-slate-200 appearance-none cursor-pointer pr-10 hover:border-primary/40 focus:border-primary focus:outline-none transition-all duration-150 font-semibold"
            aria-label="Select Account"
          >
            <option value="" className="bg-[#0b0f1a] text-slate-200 text-sm">
              All Accounts
            </option>
            {accounts.map((acc) => (
              <option
                key={acc.id}
                value={acc.id}
                className="bg-[#0b0f1a] text-slate-200 font-medium text-sm"
              >
                {acc.name}
              </option>
            ))}
          </select>
          <ChevronDown
            size={14}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
        </div>

        {/* Category filter */}
        <div className="relative">
          <button
            onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
            className="flex items-center gap-1.5 text-sm font-medium px-4 py-2.5 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all duration-150 h-12"
          >
            Categories
            {selectedCategories.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-primary/20 text-primary text-2xs flex items-center justify-center font-bold">
                {selectedCategories.length}
              </span>
            )}
            <ChevronDown size={14} />
          </button>

          {showCategoryDropdown && (
            <div className="absolute top-full left-0 mt-1 z-20 w-52 bg-card border border-border rounded-xl shadow-card-lg overflow-hidden">
              <div className="p-2 space-y-0.5 max-h-56 overflow-y-auto">
                {CATEGORIES.map((cat) => (
                  <button
                    key={`cat-filter-${cat}`}
                    onClick={() => toggleCategory(cat)}
                    className={`w-full text-left text-xs px-3 py-2 rounded-lg transition-all duration-150 flex items-center justify-between ${
                      selectedCategories.includes(cat)
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground'
                    }`}
                  >
                    {cat}
                    {selectedCategories.includes(cat) && (
                      <span className="w-3.5 h-3.5 rounded-full bg-primary/20 text-primary text-2xs flex items-center justify-center">
                        ✓
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Active category chips */}
        {selectedCategories.map((cat) => (
          <span
            key={`chip-${cat}`}
            className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20"
          >
            {cat}
            <button
              onClick={() => toggleCategory(cat)}
              className="hover:text-negative transition-colors duration-150"
            >
              <X size={10} />
            </button>
          </span>
        ))}

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="ml-auto text-xs text-muted-foreground hover:text-negative transition-colors duration-150 flex items-center gap-1"
          >
            <X size={11} />
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
