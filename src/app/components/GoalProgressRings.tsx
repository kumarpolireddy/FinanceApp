'use client';

import React, { useState, useEffect } from 'react';
import { Flag, Plus } from 'lucide-react';
import Link from 'next/link';

import { getGoals, type Goal } from '@/lib/storage';

function fmt(n: number) {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(0)}K`;
  return `₹${n.toLocaleString('en-IN')}`;
}

function monthsUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  return Math.max(
    0,
    (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth())
  );
}

interface RingProps {
  pct: number;
  color: string;
  size?: number;
  strokeWidth?: number;
  children?: React.ReactNode;
}

function ProgressRing({ pct, color, size = 72, strokeWidth = 6, children }: RingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(pct, 100) / 100) * circumference;

  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      {/* Track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={strokeWidth}
      />
      {/* Progress */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 0.8s ease' }}
      />
      {/* Center content rendered via foreignObject trick — use absolute overlay instead */}
      {children}
    </svg>
  );
}

interface GoalCardProps {
  goal: Goal;
}

function GoalCard({ goal }: GoalCardProps) {
  const pct =
    goal.targetAmount > 0 ? Math.round((goal.currentAmount / goal.targetAmount) * 100) : 0;
  const months = monthsUntil(goal.targetDate);
  const remaining = goal.targetAmount - goal.currentAmount;
  const monthlyNeeded = months > 0 ? Math.ceil(remaining / months) : remaining;

  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3 hover:border-primary/30 transition-colors">
      {/* Ring + info row */}
      <div className="flex items-center gap-3">
        {/* Ring with centered emoji */}
        <div className="relative flex-shrink-0" style={{ width: 72, height: 72 }}>
          <ProgressRing pct={pct} color={goal.color} size={72} strokeWidth={6} />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xl leading-none">{goal.icon}</span>
          </div>
        </div>

        {/* Name + pct */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{goal.name}</p>
          <p className="text-xl font-bold tabular-nums leading-tight" style={{ color: goal.color }}>
            {pct}%
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {fmt(goal.currentAmount)} / {fmt(goal.targetAmount)}
          </p>
        </div>
      </div>

      {/* Velocity row */}
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <div>
          <p className="text-2xs text-muted-foreground uppercase tracking-wider">Monthly needed</p>
          <p className="text-xs font-semibold tabular-nums text-foreground">{fmt(monthlyNeeded)}</p>
        </div>
        <div className="text-right">
          <p className="text-2xs text-muted-foreground uppercase tracking-wider">
            {months > 0 ? `${months} mo left` : 'Due soon'}
          </p>
          <p className="text-xs font-semibold tabular-nums text-foreground">
            {fmt(remaining)} to go
          </p>
        </div>
      </div>
    </div>
  );
}

export default function GoalProgressRings() {
  const [goals, setGoals] = useState<Goal[]>([]);

  useEffect(() => {
    setGoals(getGoals());
  }, []);

  const totalGoals = goals.length;
  const completedGoals = goals.filter((g) => g.currentAmount >= g.targetAmount).length;
  const avgPct =
    totalGoals > 0
      ? Math.round(
          goals.reduce((s, g) => s + Math.min((g.currentAmount / g.targetAmount) * 100, 100), 0) /
            totalGoals
        )
      : 0;

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Flag size={16} className="text-primary" />
            Goal Progress
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {completedGoals}/{totalGoals} goals completed · avg {avgPct}% velocity
          </p>
        </div>
        <Link
          href="/add-expense"
          className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
        >
          <Plus size={13} />
          Add Goal
        </Link>
      </div>

      {/* Goal cards grid */}
      {goals.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No goals yet. Add your first financial goal!
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} />
          ))}
        </div>
      )}

      {/* Summary footer */}
      {goals.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-sm font-bold tabular-nums text-foreground">{totalGoals}</p>
            <p className="text-2xs text-muted-foreground">Total Goals</p>
          </div>
          <div>
            <p className="text-sm font-bold tabular-nums text-positive">{completedGoals}</p>
            <p className="text-2xs text-muted-foreground">Completed</p>
          </div>
          <div>
            <p className="text-sm font-bold tabular-nums text-primary">{avgPct}%</p>
            <p className="text-2xs text-muted-foreground">Avg Progress</p>
          </div>
        </div>
      )}
    </div>
  );
}
