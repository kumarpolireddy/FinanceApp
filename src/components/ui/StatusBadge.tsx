import React from 'react';

type BadgeVariant =
  'income' | 'expense' | 'transfer' | 'success' | 'warning' | 'error' | 'info' | 'neutral';

interface StatusBadgeProps {
  variant: BadgeVariant;
  label: string;
  size?: 'sm' | 'md';
}

const variantClasses: Record<BadgeVariant, string> = {
  income: 'badge-income',
  expense: 'badge-expense',
  transfer: 'badge-transfer',
  success: 'bg-positive-subtle text-positive border border-positive-subtle',
  warning: 'bg-warning-subtle text-warning border border-warning-subtle',
  error: 'bg-negative-subtle text-negative border border-negative-subtle',
  info: 'bg-info-subtle text-info border border-info-subtle',
  neutral: 'bg-muted text-muted-foreground border border-border',
};

export default function StatusBadge({ variant, label, size = 'sm' }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium tabular-nums ${
        size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-2.5 py-1'
      } ${variantClasses[variant]}`}
    >
      {label}
    </span>
  );
}
