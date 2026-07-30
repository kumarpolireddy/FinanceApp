'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle, Loader2, AlertCircle, Database, Cpu, Shield } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';

interface ImportStep {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  status: 'pending' | 'running' | 'done' | 'error';
  count?: number;
}

interface ImportProgressProps {
  isRunning: boolean;
  onComplete: () => void;
  totalRows: number;
}

const INITIAL_STEPS: ImportStep[] = [
  {
    id: 'step-parse',
    label: 'Parsing File',
    description: 'Reading Excel/CSV structure and encoding',
    icon: Cpu,
    status: 'pending',
  },
  {
    id: 'step-validate',
    label: 'Validating Data',
    description: 'Checking date formats, amounts, and required fields',
    icon: Shield,
    status: 'pending',
  },
  {
    id: 'step-dedupe',
    label: 'Detecting Duplicates',
    description: 'Comparing against existing transactions',
    icon: Database,
    status: 'pending',
  },
  {
    id: 'step-categorize',
    label: 'Auto-Categorizing',
    description: 'Matching merchants to categories using AI',
    icon: Cpu,
    status: 'pending',
  },
  {
    id: 'step-import',
    label: 'Importing Records',
    description: 'Writing transactions to WealthIQ database',
    icon: Database,
    status: 'pending',
  },
  {
    id: 'step-index',
    label: 'Building Indexes',
    description: 'Optimizing for analytics queries',
    icon: Cpu,
    status: 'pending',
  },
];

export default function ImportProgress({ isRunning, onComplete, totalRows }: ImportProgressProps) {
  const [steps, setSteps] = useState<ImportStep[]>(INITIAL_STEPS);
  const [currentStep, setCurrentStep] = useState(-1);
  const [totalProcessed, setTotalProcessed] = useState(0);

  useEffect(() => {
    if (!isRunning) return;

    const STEP_DURATIONS = [800, 1200, 1000, 1500, 2000, 600];

    const runStep = (idx: number) => {
      if (idx >= INITIAL_STEPS.length) {
        onComplete();
        return;
      }
      setCurrentStep(idx);
      setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, status: 'running' } : s)));

      const duration = STEP_DURATIONS[idx];
      setTimeout(() => {
        setSteps((prev) =>
          prev.map((s, i) =>
            i === idx ? { ...s, status: 'done', count: idx === 4 ? totalRows : undefined } : s
          )
        );
        if (idx === 4) setTotalProcessed(totalRows);
        runStep(idx + 1);
      }, duration);
    };

    runStep(0);
  }, [isRunning, onComplete, totalRows]);

  const overallProgress = (steps.filter((s) => s.status === 'done').length / steps.length) * 100;

  return (
    <div className="space-y-6">
      {/* Overall progress bar */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-foreground">Import Progress</span>
          <span className="text-sm font-semibold tabular-nums text-primary">
            {Math.round(overallProgress)}%
          </span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-info rounded-full progress-bar-fill"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
        {totalProcessed > 0 && (
          <p className="text-xs text-muted-foreground mt-1.5 tabular-nums">
            {totalProcessed.toLocaleString('en-IN')} of {totalRows.toLocaleString('en-IN')} records
            imported
          </p>
        )}
      </div>

      {/* Steps */}
      <div className="space-y-2">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <div
              key={step.id}
              className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all duration-300 ${
                step.status === 'running'
                  ? 'bg-primary/5 border-primary/20'
                  : step.status === 'done'
                    ? 'bg-positive-subtle border-positive-subtle opacity-75'
                    : step.status === 'error'
                      ? 'bg-negative-subtle border-negative-subtle'
                      : 'bg-muted/10 border-border opacity-50'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  step.status === 'running'
                    ? 'bg-primary/10 text-primary'
                    : step.status === 'done'
                      ? 'bg-positive-subtle text-positive'
                      : step.status === 'error'
                        ? 'bg-negative-subtle text-negative'
                        : 'bg-muted/30 text-muted-foreground'
                }`}
              >
                {step.status === 'running' ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : step.status === 'done' ? (
                  <CheckCircle size={14} />
                ) : step.status === 'error' ? (
                  <AlertCircle size={14} />
                ) : (
                  <Icon size={14} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{step.label}</p>
                <p className="text-xs text-muted-foreground">{step.description}</p>
              </div>
              {step.status === 'done' && step.count !== undefined && (
                <span className="text-xs font-semibold tabular-nums text-positive">
                  {step.count.toLocaleString('en-IN')} records
                </span>
              )}
              {step.status === 'running' && (
                <span className="text-xs text-primary animate-pulse">Processing…</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
