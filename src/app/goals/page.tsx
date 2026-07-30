'use client';

import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import Modal from '@/components/ui/Modal';
import { getGoals, saveGoals, type Goal } from '@/lib/storage';
import {
  Plus,
  Trash2,
  Edit3,
  Target,
  Calendar,
  Award,
  PiggyBank,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';

const COLOR_PRESETS = [
  '#22c55e', // Green
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#f59e0b', // Yellow/Amber
  '#ef4444', // Red
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#10b981', // Emerald
];

const ICON_PRESETS = ['🛡️', '🚗', '✈️', '🏖️', '🏠', '🎓', '💻', '📈', '💍', '🎁', '👶', '🧸'];

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);

  // Modals state
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);

  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [depositGoal, setDepositGoal] = useState<Goal | null>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositType, setDepositType] = useState<'deposit' | 'withdraw'>('deposit');

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    targetAmount: '',
    currentAmount: '',
    targetDate: '',
    color: COLOR_PRESETS[0],
    icon: ICON_PRESETS[0],
  });

  useEffect(() => {
    setGoals(getGoals());
  }, []);

  // Compute KPI statistics
  const totalTargeted = goals.reduce((s, g) => s + g.targetAmount, 0);
  const totalSaved = goals.reduce((s, g) => s + g.currentAmount, 0);
  const remainingFunds = totalTargeted - totalSaved;
  const overallProgress = totalTargeted > 0 ? Math.round((totalSaved / totalTargeted) * 100) : 0;

  function monthsUntil(dateStr: string): number {
    const target = new Date(dateStr);
    const now = new Date();
    return Math.max(
      0,
      (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth())
    );
  }

  function handleOpenAdd() {
    setEditingGoal(null);
    setFormData({
      name: '',
      targetAmount: '',
      currentAmount: '0',
      targetDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1))
        .toISOString()
        .split('T')[0],
      color: COLOR_PRESETS[0],
      icon: ICON_PRESETS[0],
    });
    setIsGoalModalOpen(true);
  }

  function handleOpenEdit(goal: Goal) {
    setEditingGoal(goal);
    setFormData({
      name: goal.name,
      targetAmount: goal.targetAmount.toString(),
      currentAmount: goal.currentAmount.toString(),
      targetDate: goal.targetDate,
      color: goal.color,
      icon: goal.icon,
    });
    setIsGoalModalOpen(true);
  }

  function handleOpenDeposit(goal: Goal) {
    setDepositGoal(goal);
    setDepositAmount('');
    setDepositType('deposit');
    setIsDepositModalOpen(true);
  }

  function handleSaveGoal(e: React.FormEvent) {
    e.preventDefault();
    const targetAmt = Number(formData.targetAmount);
    const currentAmt = Number(formData.currentAmount);

    if (!formData.name.trim()) {
      toast.error('Please enter a goal name.');
      return;
    }
    if (isNaN(targetAmt) || targetAmt <= 0) {
      toast.error('Please enter a valid target amount.');
      return;
    }
    if (isNaN(currentAmt) || currentAmt < 0) {
      toast.error('Please enter a valid saved amount.');
      return;
    }
    if (!formData.targetDate) {
      toast.error('Please select a target date.');
      return;
    }

    let updatedList: Goal[] = [];

    if (editingGoal) {
      updatedList = goals.map((g) => {
        if (g.id === editingGoal.id) {
          return {
            ...g,
            name: formData.name.trim(),
            targetAmount: targetAmt,
            currentAmount: currentAmt,
            targetDate: formData.targetDate,
            color: formData.color,
            icon: formData.icon,
          };
        }
        return g;
      });
      toast.success('Savings goal updated successfully.');
    } else {
      const newGoal: Goal = {
        id: `goal-${Date.now()}`,
        name: formData.name.trim(),
        targetAmount: targetAmt,
        currentAmount: currentAmt,
        targetDate: formData.targetDate,
        color: formData.color,
        icon: formData.icon,
      };
      updatedList = [...goals, newGoal];
      toast.success('New savings goal created!');
    }

    setGoals(updatedList);
    saveGoals(updatedList);
    setIsGoalModalOpen(false);
  }

  function handleDepositSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!depositGoal) return;
    const amount = Number(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid contribution amount.');
      return;
    }

    const updatedList = goals.map((g) => {
      if (g.id === depositGoal.id) {
        let newAmount = g.currentAmount;
        if (depositType === 'deposit') {
          newAmount += amount;
          toast.success(`Contributed ₹${amount.toLocaleString('en-IN')} to ${g.name}.`);
        } else {
          newAmount = Math.max(0, newAmount - amount);
          toast.success(`Withdrew ₹${amount.toLocaleString('en-IN')} from ${g.name}.`);
        }
        return {
          ...g,
          currentAmount: newAmount,
        };
      }
      return g;
    });

    setGoals(updatedList);
    saveGoals(updatedList);
    setIsDepositModalOpen(false);
  }

  function handleDeleteGoal(id: string) {
    if (confirm('Are you sure you want to delete this savings goal?')) {
      const updatedList = goals.filter((g) => g.id !== id);
      setGoals(updatedList);
      saveGoals(updatedList);
      toast.success('Savings goal deleted.');
    }
  }

  function fmt(n: number) {
    return n.toLocaleString('en-IN');
  }

  return (
    <AppLayout>
      <div className="px-6 py-6 xl:px-10 2xl:px-16 max-w-screen-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Target className="text-primary" size={24} />
              Savings Goals
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Configure and track targets for long-term vehicle purchases, vacations, emergency
              funds, or retirement.
            </p>
          </div>
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/95 text-xs font-semibold text-primary-foreground rounded-xl transition shadow active:scale-95 self-start sm:self-auto"
          >
            <Plus size={14} />
            Create Goal
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">
          {/* Active Goals */}
          <div className="bg-[#0b0f1a] border border-border rounded-2xl p-5 md:p-6 flex flex-col justify-between min-h-[120px] shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-primary/5 rounded-full blur-lg" />
            <p className="text-2xs font-semibold tracking-wider text-slate-400 uppercase">
              Active Goals
            </p>
            <p className="text-2xl font-black mt-2 tabular-nums text-foreground">{goals.length}</p>
            <p className="text-3xs text-muted-foreground mt-1">Long-term savings targets active</p>
          </div>

          {/* Total Saved */}
          <div className="bg-[#0b0f1a] border border-border rounded-2xl p-5 md:p-6 flex flex-col justify-between min-h-[120px] shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-positive/5 rounded-full blur-lg" />
            <p className="text-2xs font-semibold tracking-wider text-slate-400 uppercase">
              Total Saved
            </p>
            <p className="text-2xl font-black mt-2 tabular-nums text-positive">
              ₹{fmt(totalSaved)}
            </p>
            <p className="text-3xs text-muted-foreground mt-1">Consolidated savings balances</p>
          </div>

          {/* Remaining Target */}
          <div className="bg-[#0b0f1a] border border-border rounded-2xl p-5 md:p-6 flex flex-col justify-between min-h-[120px] shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-warning/5 rounded-full blur-lg" />
            <p className="text-2xs font-semibold tracking-wider text-slate-400 uppercase">
              Remaining Funds
            </p>
            <p className="text-2xl font-black mt-2 tabular-nums text-slate-200">
              ₹{fmt(Math.max(0, remainingFunds))}
            </p>
            <p className="text-3xs text-muted-foreground mt-1">Required to achieve all targets</p>
          </div>

          {/* Overall Progress */}
          <div className="bg-[#0b0f1a] border border-border rounded-2xl p-5 md:p-6 flex flex-col justify-between min-h-[120px] shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-primary/5 rounded-full blur-lg" />
            <p className="text-2xs font-semibold tracking-wider text-slate-400 uppercase">
              Overall Progress
            </p>
            <div className="mt-2 flex items-center justify-between">
              <p className="text-2xl font-black tabular-nums text-primary">{overallProgress}%</p>
              <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-75"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
            </div>
            <p className="text-3xs text-muted-foreground mt-1">Average target completion rate</p>
          </div>
        </div>

        {/* Goals Grid */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-xl p-5">
          <h2 className="text-base font-semibold text-foreground mb-4">Savings Progress</h2>

          {goals.length === 0 ? (
            <div className="text-center py-16 flex flex-col items-center justify-center border border-dashed border-border rounded-xl bg-card">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-muted/30 text-muted-foreground">
                <PiggyBank size={24} />
              </div>
              <p className="text-sm font-semibold text-muted-foreground">No savings goals set.</p>
              <p className="text-2xs text-muted-foreground mt-1 max-w-xs">
                Creating goals helps you categorize your savings objectives and set target
                milestones.
              </p>
              <button
                onClick={handleOpenAdd}
                className="mt-4 px-4 py-2 bg-primary hover:bg-primary/90 text-xs font-semibold text-primary-foreground rounded-xl transition-all active:scale-95"
              >
                Set a Goal
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {goals.map((goal) => {
                const pct =
                  goal.targetAmount > 0
                    ? Math.round((goal.currentAmount / goal.targetAmount) * 100)
                    : 0;
                const limitRemaining = goal.targetAmount - goal.currentAmount;
                const months = monthsUntil(goal.targetDate);

                return (
                  <div
                    key={goal.id}
                    className="border border-border bg-[#0b0f1a]/40 rounded-xl p-5 flex flex-col justify-between gap-4 hover:border-primary/20 transition-all relative overflow-hidden group"
                  >
                    {/* Background Glow */}
                    <div
                      className="absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl opacity-5 pointer-events-none transition group-hover:opacity-10"
                      style={{ backgroundColor: goal.color }}
                    />

                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shadow-md"
                          style={{
                            backgroundColor: `${goal.color}15`,
                            color: goal.color,
                            border: `1px solid ${goal.color}30`,
                          }}
                        >
                          {goal.icon || '🎯'}
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-200">{goal.name}</h4>
                          <p className="text-3xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Calendar size={10} />
                            {months > 0
                              ? `${months} month${months === 1 ? '' : 's'} remaining`
                              : 'Target Date reached'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpenEdit(goal)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted text-slate-400 hover:text-primary transition-all"
                          title="Edit goal details"
                        >
                          <Edit3 size={12} />
                        </button>
                        <button
                          onClick={() => handleDeleteGoal(goal.id)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted text-slate-400 hover:text-negative transition-all"
                          title="Delete goal"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>

                    {/* Progress details */}
                    <div className="space-y-2">
                      <div className="flex items-end justify-between text-xs font-semibold">
                        <span className="text-slate-400 tabular-nums">
                          ₹{fmt(goal.currentAmount)} / ₹{fmt(goal.targetAmount)}
                        </span>
                        <span className="font-bold tabular-nums" style={{ color: goal.color }}>
                          {pct}%
                        </span>
                      </div>

                      {/* Progress Bar */}
                      <div className="h-2 bg-muted rounded-full overflow-hidden w-full relative">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: goal.color }}
                        />
                      </div>
                    </div>

                    {/* Quick Contribution Button */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-3xs border-t border-border/40 pt-3 mt-1">
                      <span className="text-slate-400">
                        {limitRemaining > 0
                          ? `₹${fmt(limitRemaining)} remaining`
                          : 'Goal achieved! 🎉'}
                      </span>
                      <button
                        onClick={() => handleOpenDeposit(goal)}
                        className="w-full sm:w-auto px-3 py-1 bg-muted hover:bg-muted/80 text-foreground font-semibold rounded-lg border border-border flex items-center justify-center gap-1 transition"
                      >
                        <TrendingUp size={10} />
                        Add/Remove Funds
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Goal Modal */}
      <Modal
        isOpen={isGoalModalOpen}
        onClose={() => setIsGoalModalOpen(false)}
        title={editingGoal ? 'Modify Savings Goal' : 'Configure New Savings Target'}
        description={
          editingGoal
            ? 'Update savings goal properties and milestones'
            : 'Set a savings goal to trace milestone progression'
        }
      >
        <form onSubmit={handleSaveGoal} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Goal Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Car Fund"
                required
                className="w-full rounded-lg border border-border bg-[#0b0f1a] p-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-primary transition-all font-semibold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Target Amount (₹)
              </label>
              <input
                type="number"
                value={formData.targetAmount}
                onChange={(e) => setFormData({ ...formData, targetAmount: e.target.value })}
                placeholder="e.g. 500000"
                required
                min="1"
                className="w-full rounded-lg border border-border bg-[#0b0f1a] p-2.5 text-sm text-slate-200 focus:outline-none focus:border-primary transition-all font-semibold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Initial Saved Amount (₹)
              </label>
              <input
                type="number"
                value={formData.currentAmount}
                onChange={(e) => setFormData({ ...formData, currentAmount: e.target.value })}
                placeholder="e.g. 10000"
                required
                min="0"
                className="w-full rounded-lg border border-border bg-[#0b0f1a] p-2.5 text-sm text-slate-200 focus:outline-none focus:border-primary transition-all font-semibold"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Target Milestone Date
              </label>
              <input
                type="date"
                value={formData.targetDate}
                onChange={(e) => setFormData({ ...formData, targetDate: e.target.value })}
                required
                className="w-full rounded-lg border border-border bg-[#0b0f1a] p-2.5 text-sm text-slate-200 focus:outline-none focus:border-primary transition-all font-medium"
              />
            </div>

            {/* Icon Presets */}
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Choose Icon
              </label>
              <div className="flex flex-wrap gap-2 p-2.5 border border-border/80 bg-[#0b0f1a]/40 rounded-xl">
                {ICON_PRESETS.map((ico) => (
                  <button
                    key={ico}
                    type="button"
                    onClick={() => setFormData({ ...formData, icon: ico })}
                    className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg hover:bg-muted/70 transition-all ${
                      formData.icon === ico
                        ? 'bg-primary/20 border border-primary text-white scale-105'
                        : 'border border-transparent'
                    }`}
                  >
                    {ico}
                  </button>
                ))}
              </div>
            </div>

            {/* Color Presets */}
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Choose Color Theme
              </label>
              <div className="flex flex-wrap gap-2 p-2.5 border border-border/80 bg-[#0b0f1a]/40 rounded-xl">
                {COLOR_PRESETS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setFormData({ ...formData, color })}
                    className="w-7 h-7 rounded-full flex items-center justify-center border border-black/40 shadow-inner relative hover:scale-105 transition-all"
                    style={{ backgroundColor: color }}
                  >
                    {formData.color === color && (
                      <span className="w-2.5 h-2.5 rounded-full bg-white shadow-sm" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsGoalModalOpen(false)}
              className="px-4 py-2 border border-border bg-[#0b0f1a] hover:bg-muted text-xs font-semibold text-foreground rounded-lg transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-primary hover:bg-primary/95 text-xs font-semibold text-primary-foreground rounded-lg transition-all shadow"
            >
              Save Goal
            </button>
          </div>
        </form>
      </Modal>

      {/* Add / Remove Funds Deposit Modal */}
      <Modal
        isOpen={isDepositModalOpen}
        onClose={() => setIsDepositModalOpen(false)}
        title={depositGoal ? `Contribute to ${depositGoal.name}` : 'Contribute to Goal'}
        description="Quickly deposit savings to or withdraw savings from this goal milestone."
      >
        <form onSubmit={handleDepositSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              Operation Type
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 border border-border bg-[#0b0f1a] rounded-lg">
              <button
                type="button"
                onClick={() => setDepositType('deposit')}
                className={`py-1.5 text-xs font-semibold rounded-md transition ${
                  depositType === 'deposit'
                    ? 'bg-primary text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Deposit / Add Funds
              </button>
              <button
                type="button"
                onClick={() => setDepositType('withdraw')}
                className={`py-1.5 text-xs font-semibold rounded-md transition ${
                  depositType === 'withdraw'
                    ? 'bg-negative text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Withdraw / Reduce
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Amount (₹)</label>
            <input
              type="number"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder="e.g. 5000"
              required
              min="1"
              className="w-full rounded-lg border border-border bg-[#0b0f1a] p-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-primary transition-all font-semibold"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsDepositModalOpen(false)}
              className="px-4 py-2 border border-border bg-[#0b0f1a] hover:bg-muted text-xs font-semibold text-foreground rounded-lg transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`px-4 py-2 text-xs font-semibold text-white rounded-lg transition-all shadow ${
                depositType === 'deposit'
                  ? 'bg-primary hover:bg-primary/95'
                  : 'bg-negative hover:bg-negative/95'
              }`}
            >
              Confirm
            </button>
          </div>
        </form>
      </Modal>
    </AppLayout>
  );
}
