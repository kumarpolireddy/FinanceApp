'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

// Backend integration point: fetch /api/analytics/spending-heatmap?year=YYYY
import { type Transaction, getAccounts, type Account } from '@/lib/storage';

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

// Builds a { "Jan": [day1, day2, ...], ... } map of daily expense totals
// for the given year, from real transactions, up to the current month/day
// if it's the current year.
function getHeatmapData(year: number, txns: Transaction[]) {
  const now = new Date();
  const isCurrentYear = year === now.getFullYear();
  const lastMonthIndex = isCurrentYear ? now.getMonth() : 11;

  const data: Record<string, number[]> = {};
  for (let m = 0; m <= lastMonthIndex; m++) {
    const daysInMonth = new Date(year, m + 1, 0).getDate();
    data[MONTH_NAMES[m]] = new Array(daysInMonth).fill(0);
  }

  txns
    .filter((t) => t.type === 'expense')
    .forEach((txn) => {
      const date = new Date(txn.date);
      if (date.getFullYear() !== year) return;
      const monthIdx = date.getMonth();
      if (monthIdx > lastMonthIndex) return;
      const day = date.getDate();
      const monthKey = MONTH_NAMES[monthIdx];
      if (!data[monthKey]) return;
      data[monthKey][day - 1] = (data[monthKey][day - 1] || 0) + txn.amount;
    });

  return data;
}

function getHeatColor(value: number, max: number): string {
  if (value === 0) return 'bg-muted/20';
  const intensity = max > 0 ? value / max : 0;
  if (intensity > 0.8) return 'bg-negative opacity-90';
  if (intensity > 0.6) return 'bg-warning opacity-80';
  if (intensity > 0.4) return 'bg-warning opacity-50';
  if (intensity > 0.2) return 'bg-primary opacity-50';
  return 'bg-primary opacity-25';
}

export default function SpendingHeatmap({ allTransactions }: { allTransactions: Transaction[] }) {
  const [tooltip, setTooltip] = useState<{ month: string; day: number; value: number } | null>(
    null
  );
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    setAccounts(getAccounts());
  }, []);

  const transactions = useMemo(() => {
    if (!selectedAccountId) return allTransactions;
    return allTransactions.filter((t) => t && t.account === selectedAccountId);
  }, [allTransactions, selectedAccountId]);

  const heatmapData = useMemo(() => getHeatmapData(year, transactions), [year, transactions]);
  const months = Object.keys(heatmapData);

  const allValues = Object.values(heatmapData).flat();
  const maxValue = allValues.length > 0 ? Math.max(...allValues, 0) : 0;
  const hasData = allValues.some((v) => v > 0);

  return (
    <div className="px-1 py-2">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-base font-semibold text-foreground">Daily Spending Heatmap</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Spending intensity by day — {months[0]}–{months[months.length - 1]} {year}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
          {/* Account Selector */}
          <div className="relative">
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="h-7 text-2xs bg-[#0b0f1a] border border-[#27272a] rounded-lg px-2.5 py-0.5 text-slate-200 appearance-none cursor-pointer pr-7 hover:border-primary/40 focus:border-primary focus:outline-none transition-all duration-150 font-semibold"
              aria-label="Select Account for Heatmap"
            >
              <option value="" className="bg-[#0b0f1a] text-slate-200">
                All Accounts
              </option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id} className="bg-[#0b0f1a] text-slate-200">
                  {acc.name}
                </option>
              ))}
            </select>
            <ChevronDown
              size={10}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
          </div>

          <div className="flex items-center gap-1 text-xs">
            <button
              type="button"
              onClick={() => setYear((y) => y - 1)}
              className="px-2 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground"
            >
              ←
            </button>
            <span className="px-1 font-medium text-foreground tabular-nums">{year}</span>
            <button
              type="button"
              onClick={() => setYear((y) => y + 1)}
              disabled={year >= new Date().getFullYear()}
              className="px-2 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
            >
              →
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Low</span>
            <div className="flex items-center gap-0.5">
              {[
                'bg-primary/25',
                'bg-primary/50',
                'bg-warning/50',
                'bg-warning/80',
                'bg-negative/90',
              ].map((cls, i) => (
                <div key={`heat-legend-${i}`} className={`w-4 h-4 rounded-sm ${cls}`} />
              ))}
            </div>
            <span>High</span>
          </div>
        </div>
      </div>

      {!hasData ? (
        <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground">
          No transactions recorded for {year} yet.
        </div>
      ) : (
        <div className="w-full overflow-hidden">
          {/* Month headers (Columns) */}
          <div className="flex items-center mb-1.5">
            <div className="w-8 flex-shrink-0" />
            <div className="flex gap-0.5 flex-1">
              {months.map((month) => (
                <div key={`hm-col-${month}`} className="flex-1 text-center">
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-tighter block truncate">
                    {month}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Daily Rows (Rows 1 to 31) */}
          <div className="space-y-0.5">
            {DAYS.map((day) => {
              return (
                <div key={`hm-row-${day}`} className="flex items-center">
                  {/* Day Label */}
                  <div className="w-8 flex-shrink-0 text-right pr-2 select-none">
                    <span className="text-[9px] font-bold text-muted-foreground/80 font-mono">
                      {day}
                    </span>
                  </div>

                  {/* Monthly Cell Grid */}
                  <div className="flex gap-0.5 flex-1">
                    {months.map((month) => {
                      const daysInThisMonth = heatmapData[month].length;
                      if (day > daysInThisMonth) {
                        return (
                          <div 
                            key={`hm-cell-${month}-${day}`} 
                            className="flex-1 h-4 bg-transparent" 
                          />
                        );
                      }
                      const value = heatmapData[month][day - 1] || 0;
                      const colorClass = getHeatColor(value, maxValue);
                      return (
                        <div
                          key={`hm-cell-${month}-${day}`}
                          className={`flex-1 h-4 rounded-sm cursor-pointer transition-all duration-100 hover:ring-1 hover:ring-primary/50 ${colorClass}`}
                          onMouseEnter={() => value > 0 && setTooltip({ month, day, value })}
                          onMouseLeave={() => setTooltip(null)}
                          title={
                            value > 0 ? `${month} ${day}: ₹${value.toLocaleString('en-IN')}` : ''
                          }
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Active tooltip */}
      {tooltip && (
        <div className="mt-3 p-3 rounded-lg bg-muted/30 border border-border flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-primary" />
          <span className="text-sm text-foreground font-medium">
            {tooltip.month} {tooltip.day}, {year}
          </span>
          <span className="text-sm font-bold tabular-nums text-warning">
            ₹{tooltip.value.toLocaleString('en-IN')}
          </span>
          <span className="text-xs text-muted-foreground ml-auto">
            {tooltip.value > maxValue * 0.7
              ? '🔴 High spend day'
              : tooltip.value > maxValue * 0.4
                ? '🟡 Above average'
                : '🟢 Normal'}
          </span>
        </div>
      )}
    </div>
  );
}
