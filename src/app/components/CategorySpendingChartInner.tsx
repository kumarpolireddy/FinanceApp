'use client';

import React, { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { getBudgets, getTransactions } from '@/lib/storage';

interface CategoryData {
  id: string;
  category: string;
  amount: number;
  budget: number;
  pct: number;
}

function barColor(pct: number) {
  if (pct > 100) return 'var(--negative)';
  if (pct >= 85) return 'var(--warning)';
  return 'var(--primary)';
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload: CategoryData }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const amt = d.amount || 0;
  const bud = d.budget || 0;
  return (
    <div className="chart-tooltip-card">
      <p className="text-xs font-semibold text-foreground mb-2">{label}</p>
      <div className="space-y-1">
        <div className="flex justify-between gap-6">
          <span className="text-xs text-muted-foreground">Spent</span>
          <span className="text-xs font-semibold tabular-nums text-foreground">
            ₹{amt.toLocaleString('en-IN')}
          </span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-xs text-muted-foreground">Budget</span>
          <span className="text-xs font-semibold tabular-nums text-muted-foreground">
            ₹{bud.toLocaleString('en-IN')}
          </span>
        </div>
        <div className="flex justify-between gap-6 border-t border-border pt-1 mt-1">
          <span className="text-xs text-muted-foreground">Utilization</span>
          <span
            className={`text-xs font-bold tabular-nums ${d.pct > 100 ? 'text-negative' : d.pct >= 85 ? 'text-warning' : 'text-positive'}`}
          >
            {d.pct}%
          </span>
        </div>
      </div>
    </div>
  );
}

interface CategorySpendingChartInnerProps {
  selectedMonth: number;
  selectedYear: number;
  selectedAccountId?: string;
}

export default function CategorySpendingChartInner({
  selectedMonth,
  selectedYear,
  selectedAccountId,
}: CategorySpendingChartInnerProps) {
  const [categoryData, setCategoryData] = useState<CategoryData[]>([]);
  const [currentMonth, setCurrentMonth] = useState('');

  useEffect(() => {
    const month = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
    setCurrentMonth(
      new Date(selectedYear, selectedMonth, 1).toLocaleString('en-IN', {
        month: 'short',
        year: 'numeric',
      })
    );

    const budgets = getBudgets().filter((b) => typeof b.month === 'string' && b.month === month);

    // Get expense transactions for this month
    let txns = getTransactions().filter(
      (t) => t.type === 'expense' && typeof t.date === 'string' && t.date.startsWith(month)
    );
    if (selectedAccountId) {
      txns = txns.filter((t) => t.account === selectedAccountId);
    }

    // Sum spending per category
    const spentByCategory: Record<string, number> = {};
    txns.forEach((t) => {
      spentByCategory[t.category] = (spentByCategory[t.category] || 0) + (Number(t.amount) || 0);
    });

    // Build chart data from budgets
    const data: CategoryData[] = budgets.map((b) => {
      const amount = spentByCategory[b.category] || 0;
      const pct = b.allocated > 0 ? Math.round((amount / b.allocated) * 100) : 0;
      return {
        id: b.id,
        category: b.category,
        amount,
        budget: b.allocated,
        pct,
      };
    });

    // Also show categories with spending but no budget
    Object.entries(spentByCategory).forEach(([cat, amount]) => {
      const alreadyIn = data.find((d) => d.category === cat);
      if (!alreadyIn) {
        data.push({
          id: `cat-${cat}`,
          category: cat,
          amount,
          budget: 0,
          pct: 100,
        });
      }
    });

    // Sort by amount descending
    data.sort((a, b) => b.amount - a.amount);

    setCategoryData(data);
  }, [selectedMonth, selectedYear, selectedAccountId]);

  return (
    <div className="bg-card border border-border rounded-2xl p-5 h-full">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-base font-semibold text-foreground">Category Spending</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{currentMonth} · vs budget</p>
        </div>
        <div className="flex items-center gap-3 text-2xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-primary inline-block" />
            On track
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-warning inline-block" />
            At risk
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-negative inline-block" />
            Over
          </span>
        </div>
      </div>

      {categoryData.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-muted-foreground">No spending data for this month</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add expenses to see category breakdown
          </p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={categoryData}
            layout="vertical"
            margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
            barSize={10}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={(v) => `₹${Number(v).toLocaleString('en-IN')}`}
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              dataKey="category"
              type="category"
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
              width={80}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
              {categoryData.map((entry) => (
                <Cell key={entry.id} fill={barColor(entry.pct)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
