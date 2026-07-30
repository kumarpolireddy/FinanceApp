'use client';

import React, { useState, useEffect, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import MetricCard from '@/components/ui/MetricCard';
import {
  Calendar,
  Percent,
  Coins,
  Calculator,
  Info,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';

// Helper: Format Date as YYYY-MM-DD
const formatDateToString = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Helper: Calculate days between two dates
const getDaysBetweenDates = (d1: Date, d2: Date): number => {
  const date1 = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate());
  const date2 = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate());
  const diffTime = date2.getTime() - date1.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
};

// Helper: Leap year check
const isLeapYear = (year: number): boolean => {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
};

// Helper: 30/360 ISDA Days
const get30_360Days = (d1: Date, d2: Date): number => {
  let y1 = d1.getFullYear();
  let m1 = d1.getMonth() + 1;
  let day1 = d1.getDate();

  let y2 = d2.getFullYear();
  let m2 = d2.getMonth() + 1;
  let day2 = d2.getDate();

  if (day1 === 31) day1 = 30;
  if (day2 === 31 && day1 >= 30) day2 = 30;

  return 360 * (y2 - y1) + 30 * (m2 - m1) + (day2 - day1);
};

// Helper: Actual/Actual ISMA Year Fraction
const getActualActualFraction = (d1: Date, d2: Date): number => {
  const y1 = d1.getFullYear();
  const y2 = d2.getFullYear();

  if (y1 === y2) {
    const daysInYear = isLeapYear(y1) ? 366 : 365;
    const days = getDaysBetweenDates(d1, d2);
    return days / daysInYear;
  }

  // Spans across multiple calendar years
  const dec31_y1 = new Date(y1, 11, 31);
  const daysInYear1 = isLeapYear(y1) ? 366 : 365;
  const daysFirstYear = getDaysBetweenDates(d1, dec31_y1) + 1;
  let fraction = daysFirstYear / daysInYear1;

  for (let y = y1 + 1; y < y2; y++) {
    fraction += 1.0;
  }

  const jan1_y2 = new Date(y2, 0, 1);
  const daysInYear2 = isLeapYear(y2) ? 366 : 365;
  const daysLastYear = getDaysBetweenDates(jan1_y2, d2);
  fraction += daysLastYear / daysInYear2;

  return fraction;
};

type Convention = 'ACT_365' | 'ACT_360' | '30_360' | 'ACT_ACT';

interface ConventionOption {
  value: Convention;
  label: string;
  description: string;
}

const CONVENTIONS: ConventionOption[] = [
  {
    value: 'ACT_365',
    label: 'Actual / 365 (F)',
    description: 'Actual days divided by standard 365-day year. Common in India and UK.',
  },
  {
    value: 'ACT_360',
    label: 'Actual / 360',
    description: 'Actual days divided by 360-day year. Standard in commercial paper and money markets.',
  },
  {
    value: '30_360',
    label: '30 / 360 (ISDA)',
    description: 'Assumes 30 days per month and 360 days per year. Smoothes out calendar months.',
  },
  {
    value: 'ACT_ACT',
    label: 'Actual / Actual (Bond)',
    description: 'Accounts for leap years precisely by calculating days relative to the actual year they fall in.',
  },
];

interface CurrencyOption {
  value: string;
  label: string;
  symbol: string;
}

const CURRENCIES: CurrencyOption[] = [
  { value: 'INR', label: 'INR (Indian Rupee)', symbol: '₹' },
  { value: 'USD', label: 'USD (US Dollar)', symbol: '$' },
  { value: 'EUR', label: 'EUR (Euro)', symbol: '€' },
  { value: 'GBP', label: 'GBP (British Pound)', symbol: '£' },
];

export default function FinancialToolsPage() {
  const [isMounted, setIsMounted] = useState(false);

  // States: keep them empty by default as requested
  const [principal, setPrincipal] = useState<number | ''>('');
  const [rate, setRate] = useState<number | ''>('');
  const [startDateStr, setStartDateStr] = useState<string>('');
  const [endDateStr, setEndDateStr] = useState<string>('');
  const [convention, setConvention] = useState<Convention>('ACT_365');
  const [currency, setCurrency] = useState<string>('INR');
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Parse current inputs
  const startDate = useMemo(() => startDateStr ? new Date(startDateStr) : null, [startDateStr]);
  const endDate = useMemo(() => endDateStr ? new Date(endDateStr) : null, [endDateStr]);
  const curSymbol = useMemo(() => CURRENCIES.find((c) => c.value === currency)?.symbol || '₹', [currency]);

  // Formatter function
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency,
      maximumFractionDigits: 2,
    }).format(val);
  };

  // Check if any inputs are empty
  const hasEmptyInputs = useMemo(() => {
    return principal === '' || rate === '' || !startDateStr || !endDateStr;
  }, [principal, rate, startDateStr, endDateStr]);

  // Basic validation check
  const isDateRangeValid = useMemo(() => {
    if (hasEmptyInputs || !startDate || !endDate) return false;
    return startDate.getTime() < endDate.getTime();
  }, [hasEmptyInputs, startDate, endDate]);

  // Calculations
  const calculations = useMemo(() => {
    if (hasEmptyInputs || !isDateRangeValid || !startDate || !endDate || principal === '' || rate === '') {
      return {
        totalDays: 0,
        actualDays: 0,
        yearFraction: 0,
        interest: 0,
        totalAmount: 0,
        dailyRate: 0,
        dailyInterest: 0,
        monthlyInterest: 0,
        yearlyInterest: 0,
        yearlyBreakdown: [],
      };
    }

    const pNum = Number(principal);
    const rNum = Number(rate);

    const actualDays = getDaysBetweenDates(startDate, endDate);
    let yearFraction = 0;
    let daysForCalculation = actualDays;

    if (convention === 'ACT_365') {
      yearFraction = actualDays / 365;
    } else if (convention === 'ACT_360') {
      yearFraction = actualDays / 360;
    } else if (convention === '30_360') {
      const days30 = get30_360Days(startDate, endDate);
      daysForCalculation = days30;
      yearFraction = days30 / 360;
    } else if (convention === 'ACT_ACT') {
      yearFraction = getActualActualFraction(startDate, endDate);
    }

    const interest = pNum * (rNum / 100) * yearFraction;
    const totalAmount = pNum + interest;

    const dailyRate = rNum / 100 / (convention === 'ACT_360' || convention === '30_360' ? 360 : 365);
    const dailyInterest = pNum * dailyRate;
    const monthlyInterest = (pNum * (rNum / 100)) / 12;
    const yearlyInterest = pNum * (rNum / 100);

    const breakdown: { year: number; days: number; interest: number }[] = [];
    const startYear = startDate.getFullYear();
    const endYear = endDate.getFullYear();

    if (convention === '30_360') {
      for (let y = startYear; y <= endYear; y++) {
        let yearStart = new Date(y, 0, 1);
        let yearEnd = new Date(y, 11, 31);
        if (y === startYear) yearStart = startDate;
        if (y === endYear) yearEnd = endDate;

        const yDays = get30_360Days(yearStart, yearEnd);
        const yFraction = yDays / 360;
        const yInterest = pNum * (rNum / 100) * yFraction;

        if (yDays > 0) {
          breakdown.push({ year: y, days: yDays, interest: yInterest });
        }
      }
    } else {
      for (let y = startYear; y <= endYear; y++) {
        let yearStart = new Date(y, 0, 1);
        let yearEnd = new Date(y, 11, 31);
        if (y === startYear) yearStart = startDate;
        if (y === endYear) yearEnd = endDate;

        const yDays = getDaysBetweenDates(yearStart, yearEnd) + (y === endYear && y === startYear ? 0 : y === endYear ? 1 : 1);
        let yFraction = 0;
        if (convention === 'ACT_365') {
          yFraction = yDays / 365;
        } else if (convention === 'ACT_360') {
          yFraction = yDays / 360;
        } else if (convention === 'ACT_ACT') {
          const daysInYear = isLeapYear(y) ? 366 : 365;
          yFraction = yDays / daysInYear;
        }

        const yInterest = pNum * (rNum / 100) * yFraction;
        if (yDays > 0) {
          breakdown.push({ year: y, days: Math.min(yDays, actualDays), interest: yInterest });
        }
      }

      const totalBreakdownInterest = breakdown.reduce((sum, item) => sum + item.interest, 0);
      if (breakdown.length > 0 && Math.abs(totalBreakdownInterest - interest) > 0.01) {
        breakdown[breakdown.length - 1].interest += (interest - totalBreakdownInterest);
      }
    }

    return {
      totalDays: daysForCalculation,
      actualDays,
      yearFraction,
      interest,
      totalAmount,
      dailyRate,
      dailyInterest,
      monthlyInterest,
      yearlyInterest,
      yearlyBreakdown: breakdown,
    };
  }, [principal, rate, startDate, endDate, convention, currency, isDateRangeValid, hasEmptyInputs]);

  // Generate charts data
  const chartData = useMemo(() => {
    if (hasEmptyInputs || !isDateRangeValid || !startDate || !endDate || principal === '' || rate === '' || calculations.actualDays === 0) return [];

    const pNum = Number(principal);
    const rNum = Number(rate);

    const dataPoints: { dateLabel: string; interest: number; principal: number; total: number }[] = [];
    const pointsCount = Math.min(calculations.actualDays, 12);
    const startMs = startDate.getTime();
    const endMs = endDate.getTime();
    const stepMs = (endMs - startMs) / Math.max(pointsCount - 1, 1);

    for (let i = 0; i < pointsCount; i++) {
      const currTime = startMs + stepMs * i;
      const currDate = new Date(currTime);
      const daysElapsed = getDaysBetweenDates(startDate, currDate);

      let stepFraction = 0;
      if (convention === 'ACT_365') {
        stepFraction = daysElapsed / 365;
      } else if (convention === 'ACT_360') {
        stepFraction = daysElapsed / 360;
      } else if (convention === '30_360') {
        const stepDays30 = get30_360Days(startDate, currDate);
        stepFraction = stepDays30 / 360;
      } else if (convention === 'ACT_ACT') {
        stepFraction = getActualActualFraction(startDate, currDate);
      }

      const stepInterest = pNum * (rNum / 100) * stepFraction;

      const dateLabel = currDate.toLocaleDateString('en-IN', {
        month: 'short',
        day: 'numeric',
        year: '2-digit',
      });

      dataPoints.push({
        dateLabel,
        interest: Math.round(stepInterest * 100) / 100,
        principal: pNum,
        total: Math.round((pNum + stepInterest) * 100) / 100,
      });
    }

    if (dataPoints.length > 0) {
      const lastDateLabel = endDate.toLocaleDateString('en-IN', {
        month: 'short',
        day: 'numeric',
        year: '2-digit',
      });
      dataPoints[dataPoints.length - 1] = {
        dateLabel: lastDateLabel,
        interest: Math.round(calculations.interest * 100) / 100,
        principal: pNum,
        total: Math.round(calculations.totalAmount * 100) / 100,
      };
    }

    return dataPoints;
  }, [startDate, endDate, principal, rate, convention, calculations, isDateRangeValid, hasEmptyInputs]);

  const handleReset = () => {
    setPrincipal('');
    setRate('');
    setStartDateStr('');
    setEndDateStr('');
    setConvention('ACT_365');
    setCurrency('INR');
    toast.success('Calculator inputs cleared!');
  };

  const copyToClipboard = () => {
    if (hasEmptyInputs || !isDateRangeValid) {
      toast.error('Please enter valid input values first.');
      return;
    }
    const text = `
Simple Interest Calculation Report:
-------------------------------------
Principal Amount: ${formatCurrency(Number(principal))}
Annual Interest Rate: ${rate}%
Start Date: ${startDateStr}
End Date: ${endDateStr}
Day Count Convention: ${CONVENTIONS.find((c) => c.value === convention)?.label}
Total Days Calculated: ${calculations.totalDays} days
Accrued Simple Interest: ${formatCurrency(calculations.interest)}
Total Return Amount: ${formatCurrency(calculations.totalAmount)}
Generated by WealthIQ Financial Tools.
`;
    navigator.clipboard.writeText(text.trim());
    setCopied(true);
    toast.success('Calculation copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AppLayout>
      <div className="px-6 py-6 xl:px-10 2xl:px-16 max-w-screen-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border pb-5">
          <div>
            <div className="flex items-center gap-2">
              <Calculator className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                Financial Tools <span className="text-xs bg-primary/20 text-primary px-2.5 py-0.5 rounded-full font-medium">Utility</span>
              </h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Bloomberg-grade calculations for investments, deposits, and loan products.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm font-medium hover:text-foreground hover:bg-muted/50 transition-all duration-150"
            >
              <RotateCcw size={14} />
              Clear Inputs
            </button>
            <button
              onClick={copyToClipboard}
              disabled={hasEmptyInputs}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 shadow-sm ${
                hasEmptyInputs
                  ? 'bg-muted text-muted-foreground cursor-not-allowed border border-border'
                  : 'bg-primary text-primary-foreground hover:opacity-90'
              }`}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Share Results'}
            </button>
          </div>
        </div>

        {/* Layout Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Inputs Section */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-card border border-border rounded-xl p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <span className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                  <Coins className="text-primary h-4.5 w-4.5" /> Calculator Inputs
                </span>
                <span className="text-2xs text-muted-foreground">Parameters</span>
              </div>



              {/* Principal Input */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    Principal Amount
                  </label>
                  <span className="text-sm font-bold text-foreground tabular-nums">
                    {principal === '' ? '—' : curSymbol + principal.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="relative flex items-center">
                  <span className="absolute left-3 text-muted-foreground text-sm font-medium">{curSymbol}</span>
                  <input
                    type="number"
                    value={principal}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPrincipal(val === '' ? '' : Math.max(0, Number(val)));
                    }}
                    className="w-full bg-[#0b0f1a] border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-slate-200 focus:border-primary/50 focus:bg-[#0b0f1a] focus:outline-none focus:ring-1 focus:ring-primary/20 tabular-nums font-semibold"
                  />
                </div>
              </div>

              {/* Interest Rate Input */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase flex items-center gap-1">
                    Annual Interest Rate
                  </label>
                  <span className="text-sm font-bold text-primary tabular-nums">
                    {rate === '' ? '—' : `${rate}%`}
                  </span>
                </div>
                <div className="relative flex items-center">
                  <span className="absolute left-3 text-muted-foreground text-sm font-medium">%</span>
                  <input
                    type="number"
                    step="0.01"
                    value={rate}
                    onChange={(e) => {
                      const val = e.target.value;
                      setRate(val === '' ? '' : Math.max(0, Number(val)));
                    }}
                    className="w-full bg-[#0b0f1a] border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-slate-200 focus:border-primary/50 focus:bg-[#0b0f1a] focus:outline-none focus:ring-1 focus:ring-primary/20 tabular-nums font-semibold"
                  />
                </div>
              </div>

              {/* Date Pickers */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase flex items-center gap-1.5">
                    <Calendar size={12} /> Start Date
                  </label>
                  <input
                    type="date"
                    value={startDateStr}
                    onChange={(e) => setStartDateStr(e.target.value)}
                    className="w-full bg-[#0b0f1a] border border-border rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-primary/50 focus:bg-[#0b0f1a] focus:outline-none focus:ring-1 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase flex items-center gap-1.5">
                    <Calendar size={12} /> End Date
                  </label>
                  <input
                    type="date"
                    value={endDateStr}
                    onChange={(e) => setEndDateStr(e.target.value)}
                    className="w-full bg-[#0b0f1a] border border-border rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-primary/50 focus:bg-[#0b0f1a] focus:outline-none focus:ring-1 focus:ring-primary/20"
                  />
                </div>
              </div>

              {/* Day Count Convention */}
              <div className="space-y-2">
                <label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase flex items-center gap-1.5">
                  <Info size={12} /> Day Count Convention
                </label>
                <select
                  value={convention}
                  onChange={(e) => setConvention(e.target.value as Convention)}
                  className="w-full bg-[#0b0f1a] border border-border rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-primary/50 focus:bg-[#0b0f1a] focus:outline-none focus:ring-1 focus:ring-primary/20 font-semibold"
                >
                  {CONVENTIONS.map((option) => (
                    <option key={option.value} value={option.value} className="bg-[#0b0f1a] text-slate-200 font-medium">
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="text-3xs text-muted-foreground leading-relaxed mt-1">
                  {CONVENTIONS.find((c) => c.value === convention)?.description}
                </p>
              </div>
            </div>

            {/* Accrual Card */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <h3 className="text-xs font-bold tracking-wider text-muted-foreground uppercase flex items-center gap-1.5">
                <Sparkles className="text-primary h-3.5 w-3.5" /> Accrual Breakdown (Linear)
              </h3>
              <div className="space-y-3 divide-y divide-border">
                <div className="flex justify-between items-center text-sm pt-0">
                  <span className="text-muted-foreground">Daily Accrual</span>
                  <span className="font-semibold text-foreground tabular-nums">
                    {hasEmptyInputs ? '—' : formatCurrency(calculations.dailyInterest)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm pt-2.5">
                  <span className="text-muted-foreground">Monthly Accrual</span>
                  <span className="font-semibold text-foreground tabular-nums">
                    {hasEmptyInputs ? '—' : formatCurrency(calculations.monthlyInterest)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm pt-2.5">
                  <span className="text-muted-foreground">Annual Yield</span>
                  <span className="font-semibold text-foreground tabular-nums">
                    {hasEmptyInputs ? '—' : formatCurrency(calculations.yearlyInterest)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Results & Visuals Section */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* KPI Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-1">
                <MetricCard
                  label="Accrued Interest"
                  value={!hasEmptyInputs && isDateRangeValid ? formatCurrency(calculations.interest) : `—`}
                  subValue={
                    hasEmptyInputs ? (
                      <span className="text-muted-foreground">Awaiting inputs</span>
                    ) : !isDateRangeValid ? (
                      <span className="text-negative">Invalid dates</span>
                    ) : (
                      <span className="text-primary">
                        +{((calculations.interest / Number(principal)) * 100 || 0).toFixed(2)}% of Principal
                      </span>
                    )
                  }
                  variant={hasEmptyInputs || !isDateRangeValid ? 'default' : 'hero'}
                />
              </div>
              <div className="sm:col-span-1">
                <MetricCard
                  label="Total Return Value"
                  value={!hasEmptyInputs && isDateRangeValid ? formatCurrency(calculations.totalAmount) : `—`}
                  subValue={<span className="text-muted-foreground">Principal + Interest</span>}
                />
              </div>
              <div className="sm:col-span-1">
                <MetricCard
                  label="Calculation Days"
                  value={!hasEmptyInputs && isDateRangeValid ? `${calculations.totalDays} Days` : `—`}
                  subValue={
                    !hasEmptyInputs && isDateRangeValid ? (
                      <span className="text-muted-foreground">
                        {calculations.yearFraction.toFixed(4)} Years ({calculations.actualDays} Calendar Days)
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Awaiting parameters</span>
                    )
                  }
                />
              </div>
            </div>

            {/* Conditionally Render Empty State, Error or Results */}
            {hasEmptyInputs ? (
              <div className="bg-card border border-border border-dashed rounded-xl p-8 text-center space-y-4 flex flex-col items-center justify-center min-h-[350px]">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <Calculator size={24} />
                </div>
                <div className="max-w-md">
                  <h3 className="font-semibold text-foreground text-base">Awaiting Calculator Inputs</h3>
                  <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                    Enter the principal amount, interest rate, and select start/end dates in the sidebar input panel to compute linear interest accrual, chart visualizations, and calendar schedules.
                  </p>
                </div>
              </div>
            ) : !isDateRangeValid ? (
              <div className="p-4 bg-negative-subtle border border-negative-subtle text-negative rounded-lg flex items-center gap-2 text-sm">
                <Info size={16} />
                <span><strong>Invalid Date Configuration:</strong> Start Date must be earlier than the End Date.</span>
              </div>
            ) : (
              <>
                {/* Interest growth chart */}
                <div className="bg-card border border-border rounded-xl p-6">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-6">
                    <div>
                      <h3 className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                        Interest Accumulation Over Time
                      </h3>
                      <p className="text-2xs text-muted-foreground">Linear growth curve between selected dates</p>
                    </div>
                    <div className="text-2xs text-muted-foreground border border-border px-2.5 py-1 rounded bg-muted/20">
                      Growth Curve Chart
                    </div>
                  </div>

                  <div className="h-[280px] w-full">
                    {isMounted ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                          <defs>
                            <linearGradient id="interestGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.25} />
                              <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                          <XAxis
                            dataKey="dateLabel"
                            stroke="var(--muted-foreground)"
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis
                            stroke="var(--muted-foreground)"
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(v) => `${curSymbol}${v >= 100000 ? (v / 100000).toFixed(1) + 'L' : v >= 1000 ? (v / 1000).toFixed(1) + 'K' : v}`}
                          />
                          <Tooltip
                            contentStyle={{
                              background: 'var(--card)',
                              border: '1px solid var(--border)',
                              borderRadius: '8px',
                              color: 'var(--foreground)',
                            }}
                            formatter={(value: any) => [formatCurrency(value), 'Accrued Interest']}
                          />
                          <Area
                            type="monotone"
                            dataKey="interest"
                            stroke="var(--primary)"
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#interestGrad)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                        Loading chart...
                      </div>
                    )}
                  </div>
                </div>

                {/* Calendar Year Breakdown Table */}
                {calculations.yearlyBreakdown.length > 0 && (
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                      <h3 className="font-semibold text-foreground text-sm">
                        Calendar Year Allocation
                      </h3>
                      <span className="text-2xs text-muted-foreground">Accruals split by year</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm border-collapse">
                        <thead>
                          <tr className="bg-muted/30 border-b border-border text-2xs font-semibold tracking-wider text-muted-foreground uppercase">
                            <th className="px-6 py-3">Calendar Year</th>
                            <th className="px-6 py-3">Accrual Days</th>
                            <th className="px-6 py-3">Year Fraction</th>
                            <th className="px-6 py-3 text-right">Accrued Interest</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {calculations.yearlyBreakdown.map((item: any) => {
                            const yrFraction = item.days / (convention === '30_360' || convention === 'ACT_360' ? 360 : isLeapYear(item.year) ? 366 : 365);
                            return (
                              <tr key={item.year} className="hover:bg-muted/10 transition-colors">
                                <td className="px-6 py-3.5 font-medium text-foreground">{item.year}</td>
                                <td className="px-6 py-3.5 text-muted-foreground tabular-nums">{item.days} Days</td>
                                <td className="px-6 py-3.5 text-muted-foreground tabular-nums">{(yrFraction).toFixed(4)}</td>
                                <td className="px-6 py-3.5 text-right font-semibold text-foreground tabular-nums">
                                  {formatCurrency(item.interest)}
                                </td>
                              </tr>
                            );
                          })}
                          <tr className="bg-muted/20 font-bold border-t border-border">
                            <td className="px-6 py-3.5 text-foreground">Total</td>
                            <td className="px-6 py-3.5 text-foreground tabular-nums">{calculations.actualDays} Days</td>
                            <td className="px-6 py-3.5 text-foreground tabular-nums">{calculations.yearFraction.toFixed(4)}</td>
                            <td className="px-6 py-3.5 text-right text-primary tabular-nums">
                              {formatCurrency(calculations.interest)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Other Tools Placeholder Card */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="font-semibold text-foreground text-sm mb-4 flex items-center gap-1.5">
            More Financial Tools <span className="text-3xs bg-info/20 text-info px-2 py-0.5 rounded font-medium">Upcoming</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border border-border/60 bg-muted/10 rounded-lg p-4 opacity-75">
              <h4 className="text-xs font-bold text-foreground flex items-center gap-1">
                Compound Interest Calculator
              </h4>
              <p className="text-3xs text-muted-foreground mt-1.5">
                Calculate multi-compounding schedules (daily, monthly, quarterly) with monthly contribution plans.
              </p>
            </div>
            <div className="border border-border/60 bg-muted/10 rounded-lg p-4 opacity-75">
              <h4 className="text-xs font-bold text-foreground flex items-center gap-1">
                EMI & Loan Amortization
              </h4>
              <p className="text-3xs text-muted-foreground mt-1.5">
                Full schedule mapping of monthly principal vs interest components with prepayments analyzer.
              </p>
            </div>
            <div className="border border-border/60 bg-muted/10 rounded-lg p-4 opacity-75">
              <h4 className="text-xs font-bold text-foreground flex items-center gap-1">
                Inflation & Real Value Adjuster
              </h4>
              <p className="text-3xs text-muted-foreground mt-1.5">
                Adjust present sums or future savings goals for consumer price index (CPI) rate changes.
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
