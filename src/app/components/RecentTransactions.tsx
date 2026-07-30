'use client';

import React, { useState, useEffect } from 'react';
import StatusBadge from '@/components/ui/StatusBadge';
import { ArrowRight } from 'lucide-react';
import { getTransactions, getCategories, type Transaction, type Category } from '@/lib/storage';
import { useMemo } from 'react';
import Link from 'next/link';

const CATEGORY_COLORS: Record<string, string> = {
  Salary: 'bg-positive/10 text-positive',
  'Food & Dining': 'bg-warning/10 text-warning',
  Fuel: 'bg-orange-500/10 text-orange-400',
  Groceries: 'bg-emerald-500/10 text-emerald-400',
  Transfer: 'bg-info/10 text-info',
  Investments: 'bg-purple-500/10 text-purple-400',
  Healthcare: 'bg-pink-500/10 text-pink-400',
  Shopping: 'bg-cyan-500/10 text-cyan-400',
};

function formatDate(iso: string) {
  if (!iso || typeof iso !== 'string' || !iso.includes('-')) return 'Unknown';
  const [y, m, d] = iso.split('-');
  const months = [
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
  const mIndex = parseInt(m) - 1;
  if (isNaN(mIndex) || mIndex < 0 || mIndex > 11) return 'Unknown';
  return `${d} ${months[mIndex]}`;
}

interface RecentTransactionsProps {
  selectedMonth: number;
  selectedYear: number;
  selectedAccountId?: string;
}

export default function RecentTransactions({
  selectedMonth,
  selectedYear,
  selectedAccountId,
}: RecentTransactionsProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showIcons, setShowIcons] = useState(true);

  useEffect(() => {
    setCategories(getCategories());
    const updateShowIcons = () => {
      const stored = localStorage.getItem('wealthiq_show_category_icons');
      setShowIcons(stored !== 'false');
    };
    updateShowIcons();
    window.addEventListener('storage', updateShowIcons);
    return () => window.removeEventListener('storage', updateShowIcons);
  }, []);

  const categoryLookup = useMemo(() => {
    return new Map(categories.map((c) => [c.name, c]));
  }, [categories]);

  useEffect(() => {
    const month = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
    let txns = getTransactions().filter(
      (t) => typeof t.date === 'string' && t.date.startsWith(month)
    );
    if (selectedAccountId) {
      txns = txns.filter(
        (t) => t.account === selectedAccountId || t.toAccount === selectedAccountId
      );
    }
    setTransactions(txns.slice(0, 8));
  }, [selectedMonth, selectedYear, selectedAccountId]);

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">Recent Transactions</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Last {transactions.length} transactions
          </p>
        </div>
        <Link
          href="/transactions"
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors duration-150"
        >
          View all
          <ArrowRight size={12} />
        </Link>
      </div>

      {transactions.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">No transactions yet</p>
          <Link
            href="/add-expense"
            className="text-xs text-primary hover:underline mt-1 inline-block"
          >
            Add your first expense →
          </Link>
        </div>
      ) : (
        <div className="space-y-1">
          {transactions.map((txn) => {
            const catMeta = categoryLookup.get(txn.category || '');
            const hasIcon = showIcons && catMeta?.icon;
            const fallbackColorClass =
              CATEGORY_COLORS[txn.category || ''] || 'bg-muted text-muted-foreground';
            return (
              <div
                key={txn.id}
                className="flex items-center gap-3 px-2 py-2 rounded-lg row-hover-highlight hover:bg-muted/20 cursor-pointer transition-colors duration-150"
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    hasIcon
                      ? 'text-base bg-background/50 border border-border'
                      : `text-xs font-bold ${fallbackColorClass}`
                  }`}
                  style={{
                    borderColor: hasIcon && catMeta?.color ? `${catMeta.color}40` : undefined,
                  }}
                >
                  {hasIcon ? catMeta.icon : (txn.category || 'Transfer').charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{txn.notes || txn.category || 'Transaction'}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-2xs text-muted-foreground">{formatDate(txn.date)}</span>
                    <span className="w-0.5 h-0.5 rounded-full bg-muted-foreground" />
                    <span className="text-2xs text-muted-foreground truncate">
                      {txn.type === 'transfer' ? 'Transfer' : txn.category || ''}
                    </span>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p
                    className={`text-sm font-semibold tabular-nums ${
                      txn.type === 'income'
                        ? 'text-positive'
                        : txn.type === 'expense'
                          ? 'text-negative'
                          : 'text-info'
                    }`}
                  >
                    {txn.type === 'income'
                      ? '+'
                      : txn.type === 'expense'
                        ? '-'
                        : ''}
                    ₹{(txn.amount || 0).toLocaleString('en-IN')}
                  </p>
                  <StatusBadge
                    variant={
                      txn.type === 'income'
                        ? 'income'
                        : txn.type === 'expense'
                          ? 'expense'
                          : 'transfer'
                    }
                    label={txn.type.charAt(0).toUpperCase() + txn.type.slice(1)}
                    size="sm"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
