'use client';

import React, { useState } from 'react';
import { ChevronDown, Wand2, CheckCircle, AlertCircle, Info } from 'lucide-react';

export interface ColumnMapping {
  sourceColumn: string;
  targetField: string;
  confidence: number;
  status: 'mapped' | 'unmapped' | 'ignored';
}

interface ColumnMapperProps {
  columns: string[];
  mappings: ColumnMapping[];
  onMappingChange: (columnIndex: number, targetField: string) => void;
  sampleRow?: Record<string, any>;
}

const TARGET_FIELDS = [
  {
    value: 'date',
    label: 'Transaction Date',
    required: true,
    description: 'The date of the transaction',
  },
  {
    value: 'amount',
    label: 'Amount',
    required: true,
    description: 'Transaction amount (positive or negative)',
  },
  {
    value: 'income',
    label: 'Income Amount',
    required: false,
    description: 'Income-specific amount column',
  },
  {
    value: 'expense',
    label: 'Expense Amount',
    required: false,
    description: 'Expense-specific amount column',
  },
  {
    value: 'category',
    label: 'Category',
    required: false,
    description: 'Spending or income category',
  },
  {
    value: 'subcategory',
    label: 'Subcategory',
    required: false,
    description: 'Sub-category or tag',
  },
  {
    value: 'account',
    label: 'Account',
    required: false,
    description: 'Bank or wallet account name',
  },
  {
    value: 'toAccount',
    label: 'Destination Account (for Transfers)',
    required: false,
    description: 'Bank/wallet account transferred TO',
  },
  {
    value: 'description',
    label: 'Description / Merchant',
    required: false,
    description: 'Transaction description or merchant name',
  },
  {
    value: 'notes',
    label: 'Notes / Memo',
    required: false,
    description: 'Additional notes or memo',
  },
  {
    value: 'type',
    label: 'Transaction Type',
    required: false,
    description: 'Income / Expense / Transfer',
  },
  {
    value: 'ignore',
    label: '— Ignore this column —',
    required: false,
    description: 'Skip this column during import',
  },
];

const SAMPLE_DATA = [
  '13/06/2026',
  '₹4,500.00',
  'Zomato',
  'Food & Dining',
  'HDFC Savings',
  'Netflix Sub',
  'Transfer',
  '₹85,000',
  'Salary - June',
  'Petrol',
];

const confidenceColor = (confidence: number) => {
  if (confidence >= 85) return 'text-positive';
  if (confidence >= 60) return 'text-warning';
  return 'text-negative';
};

const confidenceBg = (confidence: number) => {
  if (confidence >= 85) return 'bg-positive-subtle border-positive-subtle';
  if (confidence >= 60) return 'bg-warning-subtle border-warning-subtle';
  return 'bg-negative-subtle border-negative-subtle';
};

export default function ColumnMapper({
  columns,
  mappings,
  onMappingChange,
  sampleRow,
}: ColumnMapperProps) {
  const [showConfidenceInfo, setShowConfidenceInfo] = useState(false);

  const autoMappedCount = mappings.filter((m) => m.confidence >= 85).length;
  const unmappedRequired = TARGET_FIELDS.filter((f) => f.required).filter(
    (f) => !mappings.some((m) => m.targetField === f.value && m.status === 'mapped')
  );

  return (
    <div className="space-y-4">
      {/* Auto-detect banner */}
      <div className="flex items-center justify-between p-3.5 rounded-xl bg-primary/5 border border-primary/20">
        <div className="flex items-center gap-2.5">
          <Wand2 size={16} className="text-primary" />
          <span className="text-sm font-medium text-foreground">
            Smart detection found {autoMappedCount} of {columns.length} columns automatically
          </span>
        </div>
        <button
          onClick={() => setShowConfidenceInfo(!showConfidenceInfo)}
          className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors duration-150"
        >
          <Info size={12} />
          How it works
        </button>
      </div>

      {showConfidenceInfo && (
        <div className="p-4 rounded-xl bg-muted/30 border border-border text-sm text-muted-foreground">
          WealthIQ analyzes column headers and sample data to automatically detect Money Manager
          export columns. Confidence above 85% is auto-mapped. Review any column below 60% manually.
        </div>
      )}

      {unmappedRequired.length > 0 && (
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-warning-subtle border border-warning-subtle">
          <AlertCircle size={14} className="text-warning flex-shrink-0 mt-0.5" />
          <p className="text-sm text-warning">
            Required fields not yet mapped:{' '}
            <strong>{unmappedRequired.map((f) => f.label).join(', ')}</strong>. Please map these to
            continue.
          </p>
        </div>
      )}

      {/* Column mapping table */}
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-12 gap-0 px-4 py-2.5 bg-muted/30 border-b border-border">
          <div className="col-span-3 text-xs font-semibold tracking-wider uppercase text-muted-foreground">
            Source Column
          </div>
          <div className="col-span-3 text-xs font-semibold tracking-wider uppercase text-muted-foreground">
            Sample Data
          </div>
          <div className="col-span-3 text-xs font-semibold tracking-wider uppercase text-muted-foreground">
            Maps To
          </div>
          <div className="col-span-2 text-xs font-semibold tracking-wider uppercase text-muted-foreground">
            Confidence
          </div>
          <div className="col-span-1 text-xs font-semibold tracking-wider uppercase text-muted-foreground">
            Status
          </div>
        </div>

        {mappings.map((mapping, idx) => (
          <div
            key={`mapping-col-${idx}`}
            className="grid grid-cols-12 gap-0 px-4 py-3 border-b border-border last:border-0 row-hover-highlight hover:bg-muted/20 items-center"
          >
            {/* Source Column */}
            <div className="col-span-3 pr-3">
              <p className="text-sm font-medium text-foreground truncate">{mapping.sourceColumn}</p>
            </div>

            {/* Sample Data */}
            <div className="col-span-3 pr-3">
              <p className="text-xs text-muted-foreground font-mono truncate">
                {sampleRow && sampleRow[mapping.sourceColumn] !== undefined
                  ? String(sampleRow[mapping.sourceColumn])
                  : SAMPLE_DATA[idx % SAMPLE_DATA.length]}
              </p>
            </div>

            {/* Target Field Select */}
            <div className="col-span-3 pr-3">
              <div className="relative">
                <select
                  value={mapping.targetField}
                  onChange={(e) => onMappingChange(idx, e.target.value)}
                  className="w-full text-sm bg-[#0b0f1a] border border-border rounded-lg px-3 py-1.5 text-slate-200 appearance-none cursor-pointer hover:border-primary/40 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors duration-150"
                  aria-label={`Map ${mapping.sourceColumn} to field`}
                >
                  {TARGET_FIELDS.map((field) => (
                    <option
                      key={`field-${field.value}`}
                      value={field.value}
                      className="bg-[#0b0f1a] text-slate-200"
                    >
                      {field.label}
                      {field.required ? ' *' : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={12}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                />
              </div>
            </div>

            {/* Confidence */}
            <div className="col-span-2 pr-3">
              <div
                className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${confidenceBg(mapping.confidence)}`}
              >
                <span className={confidenceColor(mapping.confidence)}>{mapping.confidence}%</span>
              </div>
            </div>

            {/* Status */}
            <div className="col-span-1">
              {mapping.targetField === 'ignore' ? (
                <span className="text-muted-foreground" title="Ignored">
                  —
                </span>
              ) : mapping.confidence >= 60 ? (
                <CheckCircle size={14} className="text-positive" />
              ) : (
                <AlertCircle size={14} className="text-warning" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
