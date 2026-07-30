'use client';

import React, { useEffect, useState } from 'react';
import { getBudgets, getTransactions, type Budget } from '@/lib/storage';

interface BudgetRow {
  id: string;
  name: string;
  allocated: number;
  consumed: number;
  pct: number;
}

function barColor(pct: number) {
  if (pct > 100) return 'bg-negative';
  if (pct >= 85) return 'bg-warning';
  return 'bg-primary';
}

function textColor(pct: number) {
  if (pct > 100) return 'text-negative';
  if (pct >= 85) return 'text-warning';
  return 'text-positive';
}

function fmt(n: number) {
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (Math.abs(n) >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toLocaleString('en-IN')}`;
}

function getDaysRemainingInMonth() {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return lastDay - now.getDate();
}

interface BudgetUtilizationProps {
  selectedMonth: number;
  selectedYear: number;
  selectedAccountId?: string;
}

export default function BudgetUtilization({
  selectedMonth,
  selectedYear,
  selectedAccountId,
}: BudgetUtilizationProps) {
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [monthLabel, setMonthLabel] = useState('');
  const [daysLeft, setDaysLeft] = useState(0);

  useEffect(() => {
    const month = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;

    const budgets: Budget[] = getBudgets().filter(
      (b) => typeof b.month === 'string' && b.month === month
    );
    let monthTxns = getTransactions().filter(
      (t) => t.type === 'expense' && typeof t.date === 'string' && t.date.startsWith(month)
    );
    if (selectedAccountId) {
      monthTxns = monthTxns.filter((t) => t.account === selectedAccountId);
    }

    const computed: BudgetRow[] = budgets.map((b) => {
      const consumed = monthTxns
        .filter((t) => t.category === b.category)
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      const pct = b.allocated > 0 ? Math.round((consumed / b.allocated) * 100) : 0;
      return { id: b.id, name: b.name, allocated: b.allocated, consumed, pct };
    });

    setRows(computed);
    setMonthLabel(
      new Date(selectedYear, selectedMonth, 1).toLocaleString('en-IN', {
        month: 'short',
        year: 'numeric',
      })
    );

    const now = new Date();
    if (now.getFullYear() === selectedYear && now.getMonth() === selectedMonth) {
      setDaysLeft(getDaysRemainingInMonth());
    } else {
      setDaysLeft(0);
    }
  }, [selectedMonth, selectedYear, selectedAccountId]);

  const overBudgetCount = rows.filter((b) => b.pct > 100).length;
  const totalBudget = rows.reduce((s, b) => s + b.allocated, 0);
  const totalSpent = rows.reduce((s, b) => s + b.consumed, 0);
  const remaining = totalBudget - totalSpent;

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">Budget Utilization</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {monthLabel} · {daysLeft} days remaining
          </p>
        </div>
        {overBudgetCount > 0 && (
          <span className="text-xs font-semibold px-2 py-1 rounded-lg bg-negative-subtle text-negative border border-negative-subtle">
            {overBudgetCount} over budget
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">No budgets set for this month</p>
        </div>
      ) : (
        <>
          <div className="space-y-3.5">
            {rows.map((budget) => (
              <div key={budget.id}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-medium text-foreground">{budget.name}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      ₹{budget.consumed.toLocaleString('en-IN')} / ₹
                      {budget.allocated.toLocaleString('en-IN')}
                    </span>
                    <span className={`text-xs font-bold tabular-nums ${textColor(budget.pct)}`}>
                      {budget.pct}%
                    </span>
                  </div>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full progress-bar-fill ${barColor(budget.pct)}`}
                    style={{ width: `${Math.min(budget.pct, 100)}%` }}
                  />
                </div>
                {budget.pct > 100 && (
                  <p className="text-2xs text-negative mt-0.5">
                    Over by ₹{(budget.consumed - budget.allocated).toLocaleString('en-IN')}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-border">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-sm font-bold tabular-nums text-foreground">{fmt(totalBudget)}</p>
                <p className="text-2xs text-muted-foreground">Total Budget</p>
              </div>
              <div>
                <p className="text-sm font-bold tabular-nums text-foreground">{fmt(totalSpent)}</p>
                <p className="text-2xs text-muted-foreground">Total Spent</p>
              </div>
              <div>
                <p
                  className={`text-sm font-bold tabular-nums ${remaining < 0 ? 'text-negative' : 'text-foreground'}`}
                >
                  {fmt(remaining)}
                </p>
                <p className="text-2xs text-muted-foreground">Remaining</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
