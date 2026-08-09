'use client';

import React, { useMemo } from 'react';
import {
  Sparkles,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  CreditCard,
  Target,
  Zap,
} from 'lucide-react';

// Backend integration point: POST /api/ai/insights with transaction summary for LLM analysis
// (Until that's wired up, insights below are generated client-side from real transaction data.)
import { getAccounts, type Transaction } from '@/lib/storage';

type Severity = 'high' | 'medium' | 'positive' | 'info';

interface Insight {
  id: string;
  icon: React.ComponentType<{ size?: number }>;
  title: string;
  description: string;
  action: string;
  severity: Severity;
}

const SEVERITY_STYLES: Record<Severity, string> = {
  high: 'bg-negative-subtle border-negative-subtle',
  medium: 'bg-warning-subtle border-warning-subtle',
  positive: 'bg-positive-subtle border-positive-subtle',
  info: 'bg-info-subtle border-info-subtle',
};

const ICON_STYLES: Record<Severity, string> = {
  high: 'bg-negative/10 text-negative',
  medium: 'bg-warning/10 text-warning',
  positive: 'bg-positive/10 text-positive',
  info: 'bg-info/10 text-info',
};

const ACTION_STYLES: Record<Severity, string> = {
  high: 'text-negative hover:text-negative/80',
  medium: 'text-warning hover:text-warning/80',
  positive: 'text-positive hover:text-positive/80',
  info: 'text-info hover:text-info/80',
};

function inr(n: number): string {
  return `₹${Math.round(Math.abs(n)).toLocaleString('en-IN')}`;
}

// ── Insight generators ──────────────────────────────────────────────────────

// Category vs same-category-last-year, biggest % increase and biggest % decrease.
function categoryYoYInsights(txns: Transaction[]): Insight[] {
  const now = new Date();
  const currentYear = now.getFullYear();
  const previousYear = currentYear - 1;
  const totals: Record<string, { prev: number; curr: number }> = {};

  txns
    .filter((t) => t.type === 'expense')
    .forEach((t) => {
      const year = new Date(t.date).getFullYear();
      if (year !== currentYear && year !== previousYear) return;
      if (!totals[t.category]) totals[t.category] = { prev: 0, curr: 0 };
      if (year === previousYear) totals[t.category].prev += t.amount;
      if (year === currentYear) totals[t.category].curr += t.amount;
    });

  let worst: { category: string; pct: number; prev: number; curr: number } | null = null;
  let best: { category: string; pct: number; prev: number; curr: number } | null = null;

  for (const [category, { prev, curr }] of Object.entries(totals)) {
    if (prev <= 0) continue;
    const pct = ((curr - prev) / prev) * 100;
    if (pct > 0 && (!worst || pct > worst.pct)) worst = { category, pct, prev, curr };
    if (pct < 0 && (!best || pct < best.pct)) best = { category, pct, prev, curr };
  }

  const insights: Insight[] = [];

  if (worst) {
    insights.push({
      id: 'cat-increase',
      icon: AlertTriangle,
      title: `${worst.category} spend increased ${worst.pct.toFixed(0)}% vs last year`,
      description: `You've spent ${inr(worst.curr)} on ${worst.category} so far in ${currentYear}, up from ${inr(worst.prev)} in ${previousYear}. Worth a closer look if this trend continues.`,
      action: 'Review category spending',
      severity: worst.pct > 40 ? 'high' : 'medium',
    });
  }

  if (best) {
    insights.push({
      id: 'cat-decrease',
      icon: RefreshCw,
      title: `${best.category} spending dropped ${Math.abs(best.pct).toFixed(0)}% vs last year`,
      description: `Spend on ${best.category} fell from ${inr(best.prev)} (${previousYear}) to ${inr(best.curr)} so far in ${currentYear}. Nice trend to keep up.`,
      action: 'View category breakdown',
      severity: 'positive',
    });
  }

  return insights;
}

// Detects recurring charges: same description + same amount appearing in 3+ distinct months.
function subscriptionInsight(txns: Transaction[]): Insight | null {
  const groups: Record<string, { amount: number; months: Set<string> }> = {};

  txns
    .filter((t) => t.type === 'expense')
    .forEach((t) => {
      const key = `${t.description.trim().toLowerCase()}::${t.amount}`;
      if (!groups[key]) groups[key] = { amount: t.amount, months: new Set() };
      groups[key].months.add(t.date.slice(0, 7));
    });

  const recurring = Object.entries(groups)
    .filter(([, g]) => g.months.size >= 3)
    .map(([key, g]) => ({ name: key.split('::')[0], amount: g.amount, months: g.months.size }));

  if (recurring.length === 0) return null;

  const total = recurring.reduce((s, r) => s + r.amount, 0);
  const list = recurring
    .slice(0, 4)
    .map((r) => `${r.name} (${inr(r.amount)}/mo)`)
    .join(', ');

  return {
    id: 'subscriptions',
    icon: CreditCard,
    title: `${recurring.length} recurring charge${recurring.length > 1 ? 's' : ''} detected`,
    description: `${list} ${recurring.length > 1 ? 'total' : 'comes to'} ${inr(total)}/month, based on charges repeating for 3+ months.`,
    action: 'Review subscriptions',
    severity: 'medium',
  };
}

// Compares this calendar month's savings rate to last calendar month's.
function savingsRateInsight(txns: Transaction[]): Insight | null {
  const now = new Date();
  const thisMonth = now.toISOString().slice(0, 7);
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth = prevDate.toISOString().slice(0, 7);

  function rateFor(monthStr: string) {
    const monthTxns = txns.filter((t) => t.date.startsWith(monthStr));
    const income = monthTxns.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = monthTxns.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    if (income === 0) return null;
    return ((income - expense) / income) * 100;
  }

  const curr = rateFor(thisMonth);
  const prev = rateFor(prevMonth);
  if (curr === null || prev === null) return null;

  const diff = curr - prev;
  const improving = diff > 0;

  return {
    id: 'savings-rate',
    icon: improving ? TrendingUp : Zap,
    title: `Savings rate ${improving ? 'improved' : 'dropped'} ${Math.abs(diff).toFixed(1)} points this month`,
    description: `Your savings rate is ${curr.toFixed(1)}% this month, vs ${prev.toFixed(1)}% last month.`,
    action: improving ? 'Keep it up' : 'Review spending',
    severity: improving ? 'positive' : 'medium',
  };
}

// Compares average weekend daily spend to average weekday daily spend, last 60 days.
function weekendInsight(txns: Transaction[]): Insight | null {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 60);

  const weekend: number[] = [];
  const weekday: number[] = [];

  txns
    .filter((t) => t.type === 'expense' && new Date(t.date) >= cutoff)
    .forEach((t) => {
      const day = new Date(t.date).getDay();
      if (day === 0 || day === 6) weekend.push(t.amount);
      else weekday.push(t.amount);
    });

  if (weekend.length < 3 || weekday.length < 3) return null;

  // 60 days ≈ ~17 weekend days, ~43 weekday days
  const weekendAvg = weekend.reduce((s, v) => s + v, 0) / 17;
  const weekdayAvg = weekday.reduce((s, v) => s + v, 0) / 43;
  if (weekdayAvg <= 0) return null;

  const ratio = weekendAvg / weekdayAvg;
  if (ratio < 1.3) return null;

  return {
    id: 'weekend-spend',
    icon: Zap,
    title: `Weekend spending is ${ratio.toFixed(1)}× your weekday average`,
    description: `Over the last 60 days you've averaged ${inr(weekendAvg)}/day on weekends vs ${inr(weekdayAvg)}/day on weekdays.`,
    action: 'Set a weekend budget',
    severity: ratio > 2 ? 'medium' : 'info',
  };
}

// Net worth trend based on current account balances.
function netWorthInsight(): Insight | null {
  const accounts = getAccounts();
  if (accounts.length === 0) return null;
  const netWorth = accounts.reduce((s, a) => s + a.balance, 0);
  const liquid = accounts.filter((a) => a.type !== 'credit').reduce((s, a) => s + a.balance, 0);
  const debt = accounts.filter((a) => a.balance < 0).reduce((s, a) => s + a.balance, 0);

  if (debt >= 0) return null;

  return {
    id: 'net-worth',
    icon: Target,
    title: `Outstanding credit balance of ${inr(debt)}`,
    description: `Across your accounts, total assets are ${inr(liquid)} against ${inr(debt)} owed on credit. Paying this down first usually beats other savings goals, interest-rate-wise.`,
    action: 'View accounts',
    severity: 'info',
  };
}

function buildInsights(txns: Transaction[]): Insight[] {
  const insights: Insight[] = [
    ...categoryYoYInsights(txns),
    subscriptionInsight(txns),
    savingsRateInsight(txns),
    weekendInsight(txns),
    netWorthInsight(),
  ].filter((i): i is Insight => i !== null);

  return insights;
}

export default function AiInsightsPanel({ transactions }: { transactions: Transaction[] }) {
  const insights = useMemo(() => buildInsights(transactions), [transactions]);
  const txnCount = useMemo(() => transactions.length, [transactions]);

  return (
    <div className="px-1 py-2">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <Sparkles size={16} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">AI Financial Insights</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Generated from {txnCount.toLocaleString('en-IN')} transaction
              {txnCount === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
          {insights.length} insight{insights.length === 1 ? '' : 's'}
        </span>
      </div>

      {insights.length === 0 ? (
        <div className="h-[140px] flex items-center justify-center text-center text-xs text-muted-foreground px-8">
          Not enough transaction history yet to generate insights. Add a few months of transactions
          and check back.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {insights.map((insight) => {
            const InsightIcon = insight.icon;
            return (
              <div
                key={insight.id}
                className={`rounded-xl border p-4 flex flex-col gap-3 ${SEVERITY_STYLES[insight.severity]}`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${ICON_STYLES[insight.severity]}`}
                  >
                    <InsightIcon size={15} />
                  </div>
                  <p className="text-sm font-semibold text-foreground leading-snug">
                    {insight.title}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {insight.description}
                </p>
                <button
                  className={`text-xs font-semibold self-start transition-colors duration-150 ${ACTION_STYLES[insight.severity]}`}
                >
                  {insight.action} →
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* AI disclaimer */}
      <p className="text-2xs text-muted-foreground mt-4 pt-4 border-t border-border">
        Insights are generated by analyzing your imported transaction history. No data is sent to
        external servers. Recommendations are informational only — consult a certified financial
        advisor for investment decisions.
      </p>
    </div>
  );
}
