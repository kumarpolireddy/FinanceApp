import { useState, useMemo, useEffect } from 'react';
import { type Transaction } from '@/lib/storage';
import { type DateRange } from './AnalyticsFilters';
import ChartFilterBar, { filterTransactions } from './ChartFilterBar';

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

interface MerchantData {
  id: string;
  name: string;
  category: string;
  totalSpent: number;
  transactions: number;
  avgPerTxn: number;
  trend: number;
}

function getTopMerchants(txns: Transaction[]): MerchantData[] {
  const expenseTxns = txns.filter((t) => t.type === 'expense');
  const now = new Date();

  // Define time ranges for MoM trend (last 30 days vs 30-60 days ago)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(now.getDate() - 30);
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(now.getDate() - 60);

  const merchants: Record<
    string,
    {
      category: string;
      totalSpent: number;
      transactions: number;
      spentRecent: number;
      spentPrior: number;
    }
  > = {};

  expenseTxns.forEach((t) => {
    const name = t.description.trim() || 'Other Merchant';
    if (!merchants[name]) {
      merchants[name] = {
        category: t.category,
        totalSpent: 0,
        transactions: 0,
        spentRecent: 0,
        spentPrior: 0,
      };
    }
    const m = merchants[name];
    m.totalSpent += t.amount;
    m.transactions += 1;

    const tDate = new Date(t.date);
    if (!isNaN(tDate.getTime())) {
      if (tDate >= thirtyDaysAgo) {
        m.spentRecent += t.amount;
      } else if (tDate >= sixtyDaysAgo) {
        m.spentPrior += t.amount;
      }
    }
  });

  return Object.entries(merchants)
    .map(([name, m]) => {
      let trend = 0;
      if (m.spentPrior > 0) {
        trend = Math.round(((m.spentRecent - m.spentPrior) / m.spentPrior) * 100) / 10;
      } else if (m.spentRecent > 0) {
        trend = 100;
      }

      return {
        id: `merch-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        name,
        category: m.category,
        totalSpent: m.totalSpent,
        transactions: m.transactions,
        avgPerTxn: Math.round(m.totalSpent / m.transactions),
        trend,
      };
    })
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, 10);
}

const CATEGORY_BADGE: Record<string, string> = {
  'Food & Dining': 'bg-warning/10 text-warning',
  Shopping: 'bg-cyan-500/10 text-cyan-400',
  Fuel: 'bg-orange-500/10 text-orange-400',
  Investments: 'bg-purple-500/10 text-purple-400',
  Utilities: 'bg-blue-500/10 text-blue-400',
  Entertainment: 'bg-pink-500/10 text-pink-400',
  Transportation: 'bg-emerald-500/10 text-emerald-400',
  Healthcare: 'bg-rose-500/10 text-rose-400',
  Groceries: 'bg-green-500/10 text-green-400',
};

import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function TopMerchantsTable({
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

  const topMerchants = useMemo(() => getTopMerchants(transactions), [transactions]);
  const totalSpend = useMemo(() => topMerchants.reduce((s, m) => s + m.totalSpent, 0), [topMerchants]);

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h3 className="text-base font-semibold text-foreground">Top Merchants</h3>
        <span className="text-xs text-muted-foreground">
          Total:{' '}
          <span className="font-semibold text-foreground tabular-nums">
            ₹{totalSpend.toLocaleString('en-IN')}
          </span>
        </span>
      </div>

      {/* Date & Subtitle Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 border-t border-border/20 pt-3">
        {/* Left: Active Month Display */}
        <div className="text-xs font-bold text-foreground select-none uppercase tracking-wider py-1.5">
          📅 {MONTH_SHORT[selectedMonth]} {selectedYear}
        </div>
        {/* Right: Description */}
        <p className="text-xs text-muted-foreground py-1.5">By total spend in filter period</p>
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

      <div className="overflow-x-auto">
        {topMerchants.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            No merchant transactions found for the selected filters.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 text-xs font-semibold tracking-wider uppercase text-muted-foreground">
                  #
                </th>
                <th className="text-left py-2 text-xs font-semibold tracking-wider uppercase text-muted-foreground">
                  Merchant
                </th>
                <th className="text-right py-2 text-xs font-semibold tracking-wider uppercase text-muted-foreground">
                  Spent
                </th>
                <th className="text-right py-2 text-xs font-semibold tracking-wider uppercase text-muted-foreground">
                  Txns
                </th>
                <th className="text-right py-2 text-xs font-semibold tracking-wider uppercase text-muted-foreground">
                  MoM
                </th>
              </tr>
            </thead>
            <tbody>
              {topMerchants.map((m, idx) => (
                <tr
                  key={m.id}
                  className="border-b border-border/50 last:border-0 row-hover-highlight hover:bg-muted/20 transition-colors duration-150"
                >
                  <td className="py-2.5 pr-2">
                    <span className="text-xs font-mono text-muted-foreground">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3">
                    <p className="text-sm font-medium text-foreground">{m.name}</p>
                    <span
                      className={`text-2xs font-medium px-1.5 py-0.5 rounded ${CATEGORY_BADGE[m.category] || 'bg-muted text-muted-foreground'}`}
                    >
                      {m.category}
                    </span>
                  </td>
                  <td className="py-2.5 text-right">
                    <p className="text-sm font-semibold tabular-nums text-foreground">
                      ₹{m.totalSpent.toLocaleString('en-IN')}
                    </p>
                    <p className="text-2xs text-muted-foreground tabular-nums">
                      avg ₹{m.avgPerTxn.toLocaleString('en-IN')}
                    </p>
                  </td>
                  <td className="py-2.5 text-right">
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {m.transactions}
                    </span>
                  </td>
                  <td className="py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {m.trend > 0 ? (
                        <TrendingUp size={11} className="text-negative" />
                      ) : m.trend < 0 ? (
                        <TrendingDown size={11} className="text-positive" />
                      ) : (
                        <Minus size={11} className="text-muted-foreground" />
                      )}
                      <span
                        className={`text-xs font-semibold tabular-nums ${
                          m.trend > 0
                            ? 'text-negative'
                            : m.trend < 0
                              ? 'text-positive'
                              : 'text-muted-foreground'
                        }`}
                      >
                        {m.trend !== 0 ? `${m.trend > 0 ? '+' : ''}${m.trend}%` : '—'}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
