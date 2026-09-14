'use client';

import { useState, useEffect } from 'react';
import MetricCard from '@/components/ui/MetricCard';
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
    const accounts = getAccounts(true).filter((account) => {
      const isBankAccount =
        account.type === 'accounts' || account.category?.toLowerCase().includes('bank');
      return account.visible !== false || isBankAccount;
    });
    const filteredAccounts = selectedAccountId
      ? accounts.filter((a) => a.id === selectedAccountId)
      : accounts;

    let assets = 0;
    let liabilities = 0;
    filteredAccounts.forEach((acc) => {
      const bal = acc.balance || 0;
      if (acc.type === 'credit' || acc.type === 'loan') {
        liabilities += Math.abs(bal);
      } else if (
        acc.type === 'accounts' ||
        acc.type === 'cash' ||
        acc.category?.toLowerCase().includes('bank')
      ) {
        assets += bal;
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
    <div className="grid grid-cols-6 gap-2">
      {/* Net Worth */}
      <div className="col-span-6">
        <div
          onClick={() => router.push('/settings')}
          className="relative grid min-h-[68px] h-full grid-cols-3 divide-x divide-border overflow-hidden rounded-lg border border-border bg-card p-2.5 text-center cursor-pointer transition-colors duration-150 hover:border-primary/50"
        >
          <div className="flex min-w-0 flex-col items-center justify-center pr-2">
            <span className="text-2xs font-semibold tracking-wider text-primary uppercase">
              Net Worth
            </span>
            <h3
              className={`text-base font-black mt-0.5 leading-none tabular-nums ${kpis.netWorth >= 0 ? 'text-primary' : 'text-negative'}`}
            >
              {kpis.netWorth < 0 ? '-' : ''}
              {fmt(kpis.netWorth)}
            </h3>
          </div>
          <div className="flex min-w-0 flex-col items-center justify-center px-2">
            <p className="text-2xs text-muted-foreground font-semibold uppercase tracking-wider">
              Assets
            </p>
            <p className="mt-0.5 truncate text-base font-bold text-foreground tabular-nums">
              {fmt(kpis.assets)}
            </p>
          </div>
          <div className="flex min-w-0 flex-col items-center justify-center pl-2">
            <p className="text-2xs text-muted-foreground font-semibold uppercase tracking-wider">
              Liabilities
            </p>
            <p className="mt-0.5 truncate text-base font-bold text-foreground tabular-nums">
              {fmt(kpis.liabilities)}
            </p>
          </div>
        </div>
      </div>

      <div className="col-span-2 grid gap-2">
        {/* Pure Monthly Income */}
        <MetricCard
        label="Income"
        value={fmt(kpis.pureIncome)}
        largeValue
        compact
        variant="default"
        valueClassName="text-foreground"
        className="w-full"
        onClick={() => router.push(`/transactions?type=income&year=${selectedYear}&month=${selectedMonth + 1}${selectedAccountId ? `&account=${selectedAccountId}` : ''}`)}
        />

        {/* Pure Monthly Expenses */}
        <MetricCard
        label="Expenses"
        value={fmt(kpis.pureExpenses)}
        largeValue
        compact
        variant="default"
        valueClassName="text-foreground"
        className="w-full"
        onClick={() => router.push(`/transactions?type=expense&year=${selectedYear}&month=${selectedMonth + 1}${selectedAccountId ? `&account=${selectedAccountId}` : ''}`)}
        />
      </div>

      <div className="col-span-2 grid gap-2">
        {/* Monthly Income / Cash In Flow */}
        <MetricCard
        label="Cash In"
        value={fmt(kpis.income)}
        largeValue
        compact
        variant="default"
        valueClassName="text-foreground"
        className="w-full"
        onClick={() => router.push(`/transactions?type=cash-in&year=${selectedYear}&month=${selectedMonth + 1}${selectedAccountId ? `&account=${selectedAccountId}` : ''}`)}
        />

        {/* Monthly Expenses / Cash Out Flow */}
        <MetricCard
        label="Cash Out"
        value={fmt(kpis.expenses)}
        largeValue
        compact
        variant="default"
        valueClassName="text-foreground"
        className="w-full"
        onClick={() => router.push(`/transactions?type=cash-out&year=${selectedYear}&month=${selectedMonth + 1}${selectedAccountId ? `&account=${selectedAccountId}` : ''}`)}
        />
      </div>

      <div className="col-span-2 grid gap-2">
        {/* Cash Flow */}
        <MetricCard
        label="Net Flow"
        value={`${kpis.cashFlow < 0 ? '-' : ''}${fmt(kpis.cashFlow)}`}
        largeValue
        compact
        subValue={kpis.cashFlow >= 0 ? (
          <span
            className={`font-semibold ${
              kpis.cashFlow > 0 ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            {kpis.cashFlow > 0 ? 'Positive' : 'Neutral'}
          </span>
        ) : undefined}
        variant="default"
        valueClassName={kpis.cashFlow >= 0 ? 'text-foreground' : 'text-negative'}
        className="w-full"
        onClick={() => router.push(`/transactions?year=${selectedYear}&month=${selectedMonth + 1}${selectedAccountId ? `&account=${selectedAccountId}` : ''}`)}
        />

        {/* Savings Rate */}
        <MetricCard
        label="Savings Rate"
        value={`${kpis.savingsRate.toFixed(1)}%`}
        subValue="Target: 30%"
        compact
        variant="default"
        className="w-full"
        onClick={() => router.push(`/transactions?year=${selectedYear}&month=${selectedMonth + 1}${selectedAccountId ? `&account=${selectedAccountId}` : ''}`)}
        />
      </div>

      {/* Budget Utilization Card */}
      <div
        onClick={() => router.push('/budgets')}
        className="relative col-span-3 flex min-h-[72px] h-full flex-col items-center justify-center rounded-lg border border-border bg-card p-2.5 text-center cursor-pointer transition-colors duration-150 hover:border-primary/50"
      >
        <div className="flex items-center justify-center">
          <p className="text-2xs font-semibold tracking-wider text-muted-foreground uppercase">
            Budget Used
          </p>
        </div>
        <div className="mt-1 flex flex-col items-center justify-center gap-1">
          <p
            className={`text-lg font-bold tabular-nums leading-none ${
              budgetSummary.utilizationPct > 100
                ? 'text-negative'
                : 'text-primary'
            }`}
          >
            {budgetSummary.utilizationPct}%
          </p>
          <p className="text-xs text-muted-foreground">
            {fmt(budgetSummary.totalSpent)} of {fmt(budgetSummary.totalAllocated)}
          </p>
          {/* Mini progress bar */}
          <div className="h-1 bg-muted rounded-full overflow-hidden w-full">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                budgetSummary.utilizationPct > 100
                  ? 'bg-negative'
                  : 'bg-primary'
              }`}
              style={{ width: `${Math.min(budgetSummary.utilizationPct, 100)}%` }}
            />
          </div>
          <p
            className={`text-2xs font-medium ${
              budgetRemaining >= 0 ? 'text-muted-foreground' : 'text-negative'
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
        className={`relative col-span-3 flex min-h-[72px] h-full flex-col items-center justify-center rounded-lg border border-border bg-card p-2.5 text-center ${
          budgetSummary.overBudgetCount > 0
            ? 'border-negative/40'
            : ''
        }`}
      >
        <div className="flex items-center justify-center">
          <p className="text-2xs font-semibold tracking-wider text-muted-foreground uppercase">
            Budget Alerts
          </p>
        </div>
        <div className="mt-1 flex flex-col items-center justify-center gap-1">
          <p
            className={`text-lg font-bold tabular-nums leading-none ${
              budgetSummary.overBudgetCount > 0 ? 'text-negative' : 'text-foreground'
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
                budgetSummary.overBudgetCount > 0 ? 'bg-negative animate-pulse' : 'bg-primary'
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
