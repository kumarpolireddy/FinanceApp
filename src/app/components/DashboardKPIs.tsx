'use client';

import React, { useState, useEffect } from 'react';
import MetricCard from '@/components/ui/MetricCard';
import { PieChart, AlertTriangle } from 'lucide-react';
import { getBudgets, getTransactions, getAccounts, getTransactionImpact } from '@/lib/storage';

import { useRouter } from 'next/navigation';

interface BudgetSummary {
  totalAllocated: number;
  totalSpent: number;
  overBudgetCount: number;
  utilizationPct: number;
}

interface DashboardKPIsProps {
  selectedMonth: number;
  selectedYear: number;
  selectedAccountId?: string;
}

export default function DashboardKPIs({
  selectedMonth,
  selectedYear,
  selectedAccountId,
}: DashboardKPIsProps) {
  const router = useRouter();
  const [kpis, setKpis] = useState({
    income: 0,
    expenses: 0,
    cashFlow: 0,
    savingsRate: 0,
    netWorth: 0,
    assets: 0,
    liabilities: 0,
    pureIncome: 0,
    pureExpenses: 0,
  });

  const [budgetSummary, setBudgetSummary] = useState<BudgetSummary>({
    totalAllocated: 0,
    totalSpent: 0,
    overBudgetCount: 0,
    utilizationPct: 0,
  });

  useEffect(() => {
    const monthStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;

    // Get all transactions
    const txns = getTransactions().filter(
      (t) => typeof t.date === 'string' && t.date.startsWith(monthStr)
    );

    // Filter by account if specified
    const filteredTxns = selectedAccountId
      ? txns.filter((t) => t.account === selectedAccountId || (t.type === 'transfer' && t.toAccount === selectedAccountId))
      : txns;

    let income = 0; // Cash In
    let expenses = 0; // Cash Out
    let pureIncome = 0; // Income
    let pureExpenses = 0; // Expenses

    const targetTxns = selectedAccountId ? filteredTxns : txns;

    targetTxns.forEach((t) => {
      if (!t) return;
      const impact = getTransactionImpact(t, selectedAccountId);
      income += impact.cashIn;
      expenses += impact.cashOut;
      pureIncome += impact.income;
      pureExpenses += impact.expense;
    });

    const cashFlow = income - expenses;
    const savingsRate = income > 0 ? (cashFlow / income) * 100 : 0;

    // Calculate assets & liabilities from accounts list
    const accounts = getAccounts();
    const filteredAccounts = selectedAccountId
      ? accounts.filter((a) => a.id === selectedAccountId)
      : accounts;

    let assets = 0;
    let liabilities = 0;
    filteredAccounts.forEach((acc) => {
      const bal = acc.balance || 0;
      if (
        acc.type === 'accounts' ||
        acc.type === 'cash'
      ) {
        assets += bal;
      } else if (acc.type === 'credit' || acc.type === 'loan') {
        liabilities += Math.abs(bal);
      }
    });

    const netWorth = assets - liabilities;

    setKpis({
      income,
      expenses,
      cashFlow,
      savingsRate,
      netWorth,
      assets,
      liabilities,
      pureIncome,
      pureExpenses,
    });

    // Compute budget utilization
    const budgets = getBudgets().filter((b) => b.month === monthStr);
    const budgetAllocatedTxns = filteredTxns.filter((t) => t.type === 'expense');

    const totalAllocated = budgets.reduce((s, b) => s + b.allocated, 0);

    // Sum expenses per category
    const spentByCategory: Record<string, number> = {};
    budgetAllocatedTxns.forEach((t) => {
      spentByCategory[t.category] = (spentByCategory[t.category] || 0) + (Number(t.amount) || 0);
    });

    const totalSpent = budgets.reduce((s, b) => s + (spentByCategory[b.category] || 0), 0);
    const overBudgetCount = budgets.filter(
      (b) => (spentByCategory[b.category] || 0) > b.allocated
    ).length;
    const utilizationPct = totalAllocated > 0 ? Math.round((totalSpent / totalAllocated) * 100) : 0;

    setBudgetSummary({ totalAllocated, totalSpent, overBudgetCount, utilizationPct });
  }, [selectedMonth, selectedYear, selectedAccountId]);

  function fmt(n: number) {
    return Math.abs(n).toLocaleString('en-IN');
  }

  const budgetRemaining = budgetSummary.totalAllocated - budgetSummary.totalSpent;

  return (
    <div className="grid grid-cols-2 md:grid-cols-6 xl:grid-cols-12 gap-4">
      {/* Hero — Net Worth spans 2 cols */}
      <div className="col-span-2 md:col-span-2 xl:col-span-2">
        <div
          onClick={() => router.push('/settings')}
          className="bg-[#0b0f1a] border border-primary/20 rounded-2xl p-5 md:p-6 flex flex-col justify-between h-full relative overflow-hidden shadow-xl shadow-primary/5 min-h-[140px] cursor-pointer hover:bg-muted/5 transition-colors"
        >
          <div className="absolute top-0 right-0 w-20 h-20 bg-primary/5 rounded-full blur-xl pointer-events-none" />
          <div>
            <span className="text-2xs font-semibold tracking-wider text-primary uppercase">
              Net Worth
            </span>
            <h3
              className={`text-xl font-black mt-1 leading-none tabular-nums ${kpis.netWorth >= 0 ? 'text-positive' : 'text-negative'}`}
            >
              {kpis.netWorth < 0 ? '-' : ''}
              {fmt(kpis.netWorth)}
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-border/40">
            <div>
              <p className="text-3xs text-muted-foreground font-semibold uppercase tracking-wider">
                Assets
              </p>
              <p className="text-xs font-bold text-positive mt-0.5 tabular-nums">
                {fmt(kpis.assets)}
              </p>
            </div>
            <div>
              <p className="text-3xs text-muted-foreground font-semibold uppercase tracking-wider">
                Liabilities
              </p>
              <p className="text-xs font-bold text-negative mt-0.5 tabular-nums">
                {fmt(kpis.liabilities)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Pure Monthly Income */}
      <MetricCard
        label="Income"
        value={fmt(kpis.pureIncome)}
        largeValue
        variant="positive"
        valueClassName="text-positive"
        className="col-span-1 md:col-span-2 xl:col-span-2"
        onClick={() => router.push(`/transactions?type=income&year=${selectedYear}&month=${selectedMonth + 1}${selectedAccountId ? `&account=${selectedAccountId}` : ''}`)}
      />

      {/* Pure Monthly Expenses */}
      <MetricCard
        label="Expenses"
        value={fmt(kpis.pureExpenses)}
        largeValue
        variant="negative"
        valueClassName="text-negative"
        className="col-span-1 md:col-span-2 xl:col-span-2"
        onClick={() => router.push(`/transactions?type=expense&year=${selectedYear}&month=${selectedMonth + 1}${selectedAccountId ? `&account=${selectedAccountId}` : ''}`)}
      />

      {/* Monthly Income / Cash In Flow */}
      <MetricCard
        label="Cash In"
        value={fmt(kpis.income)}
        largeValue
        variant="positive"
        valueClassName="text-positive"
        className="col-span-1 md:col-span-2 xl:col-span-2"
        onClick={() => router.push(`/transactions?type=cash-in&year=${selectedYear}&month=${selectedMonth + 1}${selectedAccountId ? `&account=${selectedAccountId}` : ''}`)}
      />

      {/* Monthly Expenses / Cash Out Flow */}
      <MetricCard
        label="Cash Out"
        value={fmt(kpis.expenses)}
        largeValue
        variant="negative"
        valueClassName="text-negative"
        className="col-span-1 md:col-span-2 xl:col-span-2"
        onClick={() => router.push(`/transactions?type=cash-out&year=${selectedYear}&month=${selectedMonth + 1}${selectedAccountId ? `&account=${selectedAccountId}` : ''}`)}
      />

      {/* Cash Flow */}
      <MetricCard
        label="Net Flow"
        value={`${kpis.cashFlow < 0 ? '-' : ''}${fmt(kpis.cashFlow)}`}
        largeValue
        subValue={
          <span
            className={`font-semibold ${
              kpis.cashFlow > 0
                ? 'text-positive'
                : kpis.cashFlow < 0
                  ? 'text-negative'
                  : 'text-slate-400'
            }`}
          >
            {kpis.cashFlow > 0 ? 'Positive' : kpis.cashFlow < 0 ? 'Negative' : 'Neutral'}
          </span>
        }
        variant={kpis.cashFlow >= 0 ? 'positive' : 'negative'}
        valueClassName={kpis.cashFlow >= 0 ? 'text-positive' : 'text-negative'}
        className="col-span-1 md:col-span-2 xl:col-span-2"
        onClick={() => router.push(`/transactions?year=${selectedYear}&month=${selectedMonth + 1}${selectedAccountId ? `&account=${selectedAccountId}` : ''}`)}
      />

      {/* Savings Rate */}
      <MetricCard
        label="Savings Rate"
        value={`${kpis.savingsRate.toFixed(1)}%`}
        subValue="Target: 30%"
        variant="default"
        className="col-span-1 md:col-span-2 xl:col-span-2"
        onClick={() => router.push(`/transactions?year=${selectedYear}&month=${selectedMonth + 1}${selectedAccountId ? `&account=${selectedAccountId}` : ''}`)}
      />

      {/* Budget Utilization Card */}
      <div
        onClick={() => router.push('/budgets')}
        className="relative rounded-xl border p-5 md:p-6 flex flex-col justify-between bg-card border-border h-full min-h-[140px] col-span-1 md:col-span-2 xl:col-span-2 cursor-pointer hover:bg-muted/5 transition-colors"
      >
        <div className="flex items-start justify-between">
          <p className="text-2xs font-semibold tracking-wider text-muted-foreground uppercase">
            Budget Used
          </p>
          <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center text-muted-foreground">
            <PieChart size={16} />
          </div>
        </div>
        <div className="mt-2 flex-1 flex flex-col justify-end gap-1.5">
          <p
            className={`text-2xl font-bold tabular-nums leading-none ${
              budgetSummary.utilizationPct > 100
                ? 'text-negative'
                : budgetSummary.utilizationPct >= 85
                  ? 'text-warning'
                  : 'text-positive'
            }`}
          >
            {budgetSummary.utilizationPct}%
          </p>
          <p className="text-xs text-muted-foreground">
            {fmt(budgetSummary.totalSpent)} of {fmt(budgetSummary.totalAllocated)}
          </p>
          {/* Mini progress bar */}
          <div className="h-1.5 bg-muted rounded-full overflow-hidden w-full">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                budgetSummary.utilizationPct > 100
                  ? 'bg-negative'
                  : budgetSummary.utilizationPct >= 85
                    ? 'bg-warning'
                    : 'bg-primary'
              }`}
              style={{ width: `${Math.min(budgetSummary.utilizationPct, 100)}%` }}
            />
          </div>
          <p
            className={`text-2xs font-medium ${
              budgetRemaining >= 0 ? 'text-positive' : 'text-negative'
            }`}
          >
            {budgetRemaining >= 0
              ? `${fmt(budgetRemaining)} remaining`
              : `${fmt(budgetRemaining)} over budget`}
          </p>
        </div>
      </div>

      {/* Over-Budget Alert Card */}
      <div
        className={`relative rounded-xl border p-5 md:p-6 flex flex-col justify-between bg-card border-border h-full min-h-[140px] col-span-1 md:col-span-2 xl:col-span-2 ${
          budgetSummary.overBudgetCount > 0
            ? 'bg-negative-subtle/10 border-negative-subtle/50 card-glow-negative'
            : ''
        }`}
      >
        <div className="flex items-start justify-between">
          <p className="text-2xs font-semibold tracking-wider text-muted-foreground uppercase">
            Budget Alerts
          </p>
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              budgetSummary.overBudgetCount > 0
                ? 'bg-negative-subtle text-negative'
                : 'bg-muted/50 text-muted-foreground'
            }`}
          >
            <AlertTriangle size={16} />
          </div>
        </div>
        <div className="mt-2 flex-1 flex flex-col justify-end gap-1.5">
          <p
            className={`text-2xl font-bold tabular-nums leading-none ${
              budgetSummary.overBudgetCount > 0 ? 'text-negative' : 'text-positive'
            }`}
          >
            {budgetSummary.overBudgetCount}
          </p>
          <p className="text-xs text-muted-foreground">
            {budgetSummary.overBudgetCount === 0
              ? 'All budgets on track'
              : `${budgetSummary.overBudgetCount} categor${budgetSummary.overBudgetCount === 1 ? 'y' : 'ies'} exceeded`}
          </p>
          <div className="flex items-center gap-1.5 mt-1">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                budgetSummary.overBudgetCount > 0 ? 'bg-negative animate-pulse' : 'bg-positive'
              }`}
            />
            <span className="text-2xs text-muted-foreground">
              {budgetSummary.overBudgetCount > 0 ? 'Action needed' : 'Healthy'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
