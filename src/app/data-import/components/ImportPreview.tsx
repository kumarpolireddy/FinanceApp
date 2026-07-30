'use client';

import React, { useState } from 'react';
import { AlertTriangle, CheckCircle, Copy, Filter } from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';

export interface PreviewRow {
  id: string;
  date: string;
  description: string;
  category: string | null;
  subcategory?: string;
  account: string;
  toAccount?: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  notes: string;
  status: 'valid' | 'duplicate' | 'error';
  errorMessage?: string;
}

interface ImportPreviewProps {
  rows: PreviewRow[];
  totalRows: number;
}

const FILTER_OPTIONS = ['all', 'valid', 'duplicate', 'error'] as const;
type FilterOption = (typeof FILTER_OPTIONS)[number];

export default function ImportPreview({ rows, totalRows }: ImportPreviewProps) {
  const [filter, setFilter] = useState<FilterOption>('all');

  const filteredRows = filter === 'all' ? rows : rows.filter((r) => r.status === filter);

  const counts = {
    valid: rows.filter((r) => r.status === 'valid').length,
    duplicate: rows.filter((r) => r.status === 'duplicate').length,
    error: rows.filter((r) => r.status === 'error').length,
  };

  const filterLabelClass = (f: FilterOption) =>
    filter === f
      ? 'bg-primary/10 text-primary border-primary/30'
      : 'bg-muted/30 text-muted-foreground border-border hover:text-foreground hover:border-primary/20';

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          {
            key: 'total',
            label: 'Total Rows',
            value: totalRows,
            icon: <Copy size={14} />,
            color: 'text-foreground',
          },
          {
            key: 'valid',
            label: 'Valid',
            value: counts.valid,
            icon: <CheckCircle size={14} />,
            color: 'text-positive',
          },
          {
            key: 'duplicate',
            label: 'Duplicates',
            value: counts.duplicate,
            icon: <Copy size={14} />,
            color: 'text-warning',
          },
          {
            key: 'error',
            label: 'Errors',
            value: counts.error,
            icon: <AlertTriangle size={14} />,
            color: 'text-negative',
          },
        ].map((stat) => (
          <div
            key={`preview-stat-${stat.key}`}
            className="bg-muted/20 border border-border rounded-xl p-3 text-center"
          >
            <div className={`flex items-center justify-center gap-1.5 mb-1 ${stat.color}`}>
              {stat.icon}
              <span className="text-xs font-medium">{stat.label}</span>
            </div>
            <p className={`text-xl font-bold tabular-nums ${stat.color}`}>
              {stat.value.toLocaleString('en-IN')}
            </p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2">
        <Filter size={14} className="text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Show:</span>
        {FILTER_OPTIONS.map((f) => (
          <button
            key={`preview-filter-${f}`}
            onClick={() => setFilter(f)}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-all duration-150 capitalize ${filterLabelClass(f)}`}
          >
            {f} {f !== 'all' && `(${counts[f as keyof typeof counts]})`}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          Showing {filteredRows.length} of {totalRows.toLocaleString('en-IN')} rows (preview)
        </span>
      </div>

      {/* Preview table */}
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 text-xs font-semibold tracking-wider uppercase text-muted-foreground whitespace-nowrap">
                  Date
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold tracking-wider uppercase text-muted-foreground whitespace-nowrap">
                  Description
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold tracking-wider uppercase text-muted-foreground whitespace-nowrap">
                  Category
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold tracking-wider uppercase text-muted-foreground whitespace-nowrap">
                  Account
                </th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold tracking-wider uppercase text-muted-foreground whitespace-nowrap">
                  Amount
                </th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold tracking-wider uppercase text-muted-foreground whitespace-nowrap">
                  Type
                </th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold tracking-wider uppercase text-muted-foreground whitespace-nowrap">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr
                  key={row.id}
                  className={`border-b border-border last:border-0 row-hover-highlight hover:bg-muted/20 ${
                    row.status === 'duplicate'
                      ? 'opacity-60'
                      : row.status === 'error'
                        ? 'bg-negative-subtle/20'
                        : ''
                  }`}
                >
                  <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground whitespace-nowrap">
                    {row.date}
                  </td>
                  <td className="px-4 py-2.5 max-w-[200px]">
                    <p className="text-sm text-foreground truncate">{row.description}</p>
                    {row.notes && (
                      <p className="text-xs text-muted-foreground truncate">{row.notes}</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {row.type === 'transfer' ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                        {row.category || 'Other'}
                        {row.subcategory ? ` > ${row.subcategory}` : ''}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {row.type === 'transfer' ? (
                      <span className="flex items-center gap-1">
                        {row.account}
                        <span className="text-primary font-bold">→</span>
                        {row.toAccount || 'Unknown'}
                      </span>
                    ) : (
                      row.account
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span
                      className={`text-sm font-semibold tabular-nums ${row.type === 'income' ? 'text-positive' : row.type === 'expense' ? 'text-negative' : 'text-info'}`}
                    >
                      {row.type === 'income' ? '+' : row.type === 'expense' ? '-' : ''}₹
                      {Math.abs(row.amount).toLocaleString('en-IN')}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <StatusBadge
                      variant={
                        row.type === 'income'
                          ? 'income'
                          : row.type === 'expense'
                            ? 'expense'
                            : 'transfer'
                      }
                      label={row.type.charAt(0).toUpperCase() + row.type.slice(1)}
                    />
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {row.status === 'valid' && (
                      <CheckCircle size={14} className="text-positive mx-auto" />
                    )}
                    {row.status === 'duplicate' && (
                      <span className="text-xs text-warning font-medium">Duplicate</span>
                    )}
                    {row.status === 'error' && (
                      <span className="text-xs text-negative font-medium" title={row.errorMessage}>
                        Error
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
