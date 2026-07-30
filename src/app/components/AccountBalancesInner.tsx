'use client';

import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { getAccounts, type Account } from '@/lib/storage';

const ACCOUNT_COLORS: Record<string, string> = {
  accounts: 'var(--primary)',
  cash: 'var(--positive)',
  credit: 'var(--negative)',
  loan: '#a855f7',
};

function CustomTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="chart-tooltip-card">
      <p className="text-xs font-semibold text-foreground mb-1">{d.name}</p>
      <p className="text-sm font-bold tabular-nums text-primary">
        ₹{d.value.toLocaleString('en-IN')}
      </p>
    </div>
  );
}

interface AccountBalancesInnerProps {
  selectedMonth: number;
  selectedYear: number;
  selectedAccountId?: string;
  setSelectedAccountId?: (id: string) => void;
}

export default function AccountBalancesInner({
  selectedAccountId,
  setSelectedAccountId,
}: AccountBalancesInnerProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    setAccounts(getAccounts());
  }, []);

  const handleAccountClick = (id: string) => {
    if (setSelectedAccountId) {
      if (selectedAccountId === id) {
        setSelectedAccountId('');
      } else {
        setSelectedAccountId(id);
      }
    }
  };

  const pieData = accounts
    .filter((a) => a.balance > 0)
    .map((a) => ({
      id: a.id,
      name: a.name,
      value: a.balance,
      color: a.color || ACCOUNT_COLORS[a.type] || 'var(--primary)',
    }));

  const totalAssets = accounts
    .filter((a) => a.type === 'accounts' || a.type === 'cash')
    .reduce((s, a) => s + Math.max(0, a.balance), 0);
  const totalLiabilities = accounts
    .filter((a) => a.type === 'credit' || a.type === 'loan')
    .reduce((s, a) => s + Math.abs(a.balance), 0);

  function fmt(n: number) {
    if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
    if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
    return `₹${n.toLocaleString('en-IN')}`;
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">Account Balances</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Assets vs liabilities distribution</p>
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">No accounts found</p>
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={70}
                paddingAngle={3}
                dataKey="value"
              >
                {pieData.map((entry) => (
                  <Cell key={entry.id} fill={entry.color} opacity={0.85} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>

          <div className="space-y-2 mt-2">
            {accounts.map((acc) => {
              const isSelected = selectedAccountId === acc.id;
              const hasSelection = !!selectedAccountId;
              const icon =
                acc.icon ||
                (acc.type === 'cash'
                  ? '💵'
                  : acc.type === 'credit'
                    ? '💳'
                    : acc.type === 'loan'
                      ? '📉'
                      : '🏦');
              return (
                <div
                  key={acc.id}
                  onClick={() => handleAccountClick(acc.id)}
                  className={`flex items-center justify-between py-1.5 px-2 -mx-2 rounded-lg cursor-pointer transition-all duration-150 ${
                    isSelected
                      ? 'bg-primary/10 border border-primary/20'
                      : hasSelection
                        ? 'opacity-40 hover:opacity-80'
                        : 'hover:bg-muted/10'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm leading-none flex-shrink-0">{icon}</span>
                    <div>
                      <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                        {acc.name}
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{
                            backgroundColor:
                              acc.color || ACCOUNT_COLORS[acc.type] || 'var(--primary)',
                          }}
                        />
                      </p>
                      <p className="text-2xs text-muted-foreground capitalize">
                        {acc.type === 'accounts'
                          ? 'Main Account'
                          : acc.type === 'credit'
                            ? 'Credit Card'
                            : acc.type === 'loan'
                              ? 'Loan Account'
                              : acc.type}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-semibold tabular-nums ${acc.balance < 0 ? 'text-negative' : 'text-foreground'}`}
                  >
                    {acc.balance < 0 ? '-' : ''}₹{Math.abs(acc.balance).toLocaleString('en-IN')}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 gap-2">
            <div className="bg-positive-subtle border border-positive-subtle rounded-lg p-2 text-center">
              <p className="text-xs font-bold tabular-nums text-positive">{fmt(totalAssets)}</p>
              <p className="text-2xs text-muted-foreground">Total Assets</p>
            </div>
            <div className="bg-negative-subtle border border-negative-subtle rounded-lg p-2 text-center">
              <p className="text-xs font-bold tabular-nums text-negative">
                {fmt(totalLiabilities)}
              </p>
              <p className="text-2xs text-muted-foreground">Liabilities</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
