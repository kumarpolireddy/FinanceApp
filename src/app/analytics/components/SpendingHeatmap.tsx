'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import './spending-heatmap.css';

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

function getHeatColor(value: number, spendingDays: number[]): string {
  if (value === 0) return 'bg-muted/20';
  // Use the midpoint rank for ties so equal amounts always share a color.
  // Ranking spending days prevents an extreme amount from flattening the scale.
  const first = spendingDays.indexOf(value);
  const last = spendingDays.lastIndexOf(value);
  const intensity = spendingDays.length > 0 ? (first + last + 1) / (2 * spendingDays.length) : 0;
  if (intensity > 0.8) return 'bg-negative/90';
  if (intensity > 0.6) return 'bg-warning/80';
  if (intensity > 0.4) return 'bg-warning/50';
  if (intensity > 0.2) return 'bg-primary/60';
  return 'bg-primary/40';
}

export default function SpendingHeatmap({ allTransactions }: { allTransactions: Transaction[] }) {
  const [tooltip, setTooltip] = useState<{ month: string; day: number; value: number; left: number; top: number } | null>(
    null
  );
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    setAccounts(getAccounts());
  }, []);

  useEffect(() => {
    const dismiss = () => setTooltip(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    document.addEventListener('pointerdown', dismiss);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  useEffect(() => setTooltip(null), [year, selectedAccountId]);

  const showTooltip = (element: HTMLElement, month: string, day: number, value: number) => {
    const rect = element.getBoundingClientRect();
    setTooltip({
      month, day, value,
      left: Math.max(8, Math.min(rect.left + rect.width / 2 - 90, window.innerWidth - 188)),
      top: rect.top >= 90 ? rect.top - 80 : rect.bottom + 8,
    });
  };

  const transactions = useMemo(() => {
    if (!selectedAccountId) return allTransactions;
    return allTransactions.filter((t) => t && t.account === selectedAccountId);
  }, [allTransactions, selectedAccountId]);

  const heatmapData = useMemo(() => getHeatmapData(year, transactions), [year, transactions]);
  const months = Object.keys(heatmapData);

  const allValues = Object.values(heatmapData).flat();
  const spendingDays = allValues.filter((value) => value > 0).sort((a, b) => a - b);
  const hasData = allValues.some((v) => v > 0);

  return (
    <div className="spending-heatmap py-3">
      <div className="space-y-5 mb-5">
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-foreground">Spending heatmap</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Spending intensity by day — {months[0]}–{months[months.length - 1]} {year}
          </p>
        </div>
        <div className="heatmap-filters">
          {/* Account Selector */}
          <label className="block min-w-0 space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Account</span>
            <div className="relative">
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="heatmap-account"
                aria-label="Select Account for Heatmap"
              >
                <option value="" className="bg-card text-slate-200">
                  All Accounts
                </option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id} className="bg-card text-slate-200">
                    {acc.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={10}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
            </div>
          </label>

          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-muted-foreground">Year</span>
            <div className="heatmap-year">
              <button
                type="button"
                onClick={() => setYear((y) => y - 1)}
                aria-label="Previous year"
                className="px-2 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="px-1 font-medium text-foreground tabular-nums">{year}</span>
              <button
                type="button"
                onClick={() => setYear((y) => y + 1)}
                aria-label="Next year"
                disabled={year >= new Date().getFullYear()}
                className="px-2 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <section className="heatmap-panel -mx-4 sm:-mx-6" aria-label="Daily spending heatmap">
        <div className="heatmap-panel-heading">
          <div>
            <h4 className="text-sm font-semibold text-foreground">Daily spending</h4>
            <p className="mt-1 text-xs text-muted-foreground">Colors rank days with spending from low to high</p>
          </div>
          <div
            className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground"
            aria-label="Spending intensity from no spending to high"
          >
            <span className="flex items-center gap-1.5 mr-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-muted/20 border border-border/40" />
              None
            </span>
            <span>Low</span>
            <div className="flex items-center gap-0.5">
              {[
                'bg-primary/40',
                'bg-primary/60',
                'bg-warning/50',
                'bg-warning/80',
                'bg-negative/90',
              ].map((cls, i) => (
                <div key={`heat-legend-${i}`} className={`w-2.5 h-2.5 rounded-sm ${cls}`} />
              ))}
            </div>
            <span>High</span>
          </div>
        </div>

        {!hasData ? (
          <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground">
            No transactions recorded for {year} yet.
          </div>
        ) : (
          <div className="heatmap-grid w-full">
            {/* Month headers (Columns) */}
            <div className="flex items-center mb-1.5">
              <div className="w-8 flex-shrink-0" />
              <div className="flex gap-0.5 flex-1">
                {months.map((month) => (
                  <div key={`hm-col-${month}`} className="flex-1 text-center">
                    <span className="heatmap-month text-[10px] font-medium text-muted-foreground block">
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
                      <span className="text-[10px] font-normal text-muted-foreground tabular-nums">
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
                        const colorClass = getHeatColor(value, spendingDays);
                        return (
                          <button
                            type="button"
                            key={`hm-cell-${month}-${day}`}
                            className={`min-w-0 border-0 p-0 flex-1 h-4 rounded-sm cursor-pointer transition-all duration-100 hover:ring-1 hover:ring-primary/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground ${colorClass}`}
                            aria-label={`${month} ${day}, ${year}: ₹${value.toLocaleString('en-IN')} spent`}
                            onClick={(event) => showTooltip(event.currentTarget, month, day, value)}
                            onMouseEnter={(event) => showTooltip(event.currentTarget, month, day, value)}
                            onMouseLeave={() => setTooltip(null)}
                            onFocus={(event) => showTooltip(event.currentTarget, month, day, value)}
                            onBlur={() => setTooltip(null)}
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

      </section>
      {tooltip && createPortal(
        <div
          role="tooltip"
          className="pointer-events-none fixed z-[110] w-[180px] rounded-lg border border-border bg-card px-3 py-2.5 text-xs text-foreground shadow-card-lg"
          style={{ left: tooltip.left, top: tooltip.top }}
        >
          <p className="font-medium">{tooltip.month} {tooltip.day}, {year}</p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Spending</span>
            <span className="font-semibold tabular-nums">₹{tooltip.value.toLocaleString('en-IN')}</span>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
