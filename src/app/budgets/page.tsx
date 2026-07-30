'use client';

import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import Modal from '@/components/ui/Modal';
import {
  getBudgets,
  saveBudgets,
  getTransactions,
  getCategories,
  getBudgetTemplates,
  getBudgetGlobalSettings,
  type Budget,
  type Category,
  type BudgetTemplate,
} from '@/lib/storage';
import {
  Plus,
  Trash2,
  Edit3,
  PiggyBank,
  AlertTriangle,
  Calendar,
  ChevronDown,
  RefreshCw,
  Copy,
  LayoutTemplate,
  CheckCircle,
} from 'lucide-react';
import { toast } from 'sonner';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export default function BudgetsPage() {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [templates, setTemplates] = useState<BudgetTemplate[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);

  // State to track if user chose to "Start Empty"
  const [hasStartedEmpty, setHasStartedEmpty] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [formData, setFormData] = useState({
    category: '',
    allocated: '',
  });

  const activeMonthStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;

  useEffect(() => {
    setTemplates(getBudgetTemplates());
    setCategories(getCategories());
    setTransactions(getTransactions());
  }, []);

  useEffect(() => {
    loadBudgetsData();
    setHasStartedEmpty(false);
  }, [selectedMonth, selectedYear]);

  const loadBudgetsData = () => {
    const allBudgets = getBudgets();
    const defaultTemplates = getBudgetTemplates();
    const globalSettings = getBudgetGlobalSettings();
    const activeBudgets = allBudgets.filter((b) => b.month === activeMonthStr);

    if (activeBudgets.length === 0) {
      // Check if auto-create is active and it's a current or future month
      const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      if (globalSettings.autoCreate && activeMonthStr >= currentMonthStr) {
        const newBudgets: Budget[] = defaultTemplates
          .filter((t) => t.enabled)
          .map((t) => ({
            id: `bud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: t.category,
            category: t.category,
            allocated: t.defaultAmount,
            month: activeMonthStr,
            createdFromTemplate: true,
            isModified: false,
          }));
        if (newBudgets.length > 0) {
          const updated = [...allBudgets, ...newBudgets];
          saveBudgets(updated);
          setBudgets(updated);
          toast.success('Automatically initialized month from Default Template');
          return;
        }
      }
    }
    setBudgets(allBudgets);
  };

  // Filter budgets for the active month
  const activeBudgets = budgets.filter((b) => b.month === activeMonthStr);

  // Filter transactions (expenses) for the active month
  const activeExpenses = transactions.filter(
    (t) => t.type === 'expense' && typeof t.date === 'string' && t.date.startsWith(activeMonthStr)
  );

  // Calculate stats
  const totalBudget = activeBudgets.reduce((s, b) => s + b.allocated, 0);
  const totalSpent = activeBudgets.reduce((s, b) => {
    const spent = activeExpenses
      .filter((t) => t.category === b.category)
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    return s + spent;
  }, 0);
  const totalRemaining = totalBudget - totalSpent;
  const overBudgetsCount = activeBudgets.filter((b) => {
    const spent = activeExpenses
      .filter((t) => t.category === b.category)
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    return spent > b.allocated;
  }).length;

  // Filter expense categories that do not have a budget configured for the selected month
  const availableCategories = categories.filter(
    (c) =>
      c.type === 'expense' &&
      (!activeBudgets.some((b) => b.category === c.name) ||
        (editingBudget && editingBudget.category === c.name))
  );

  const availableYears = Array.from(
    new Set(
      [
        now.getFullYear(),
        now.getFullYear() - 1,
        now.getFullYear() - 2,
        ...transactions.map((t) => new Date(t.date).getFullYear()),
      ].filter(Boolean)
    )
  ).sort((a: any, b: any) => b - a);

  // Prompts Handlers
  const handleCreateFromTemplate = () => {
    const allBudgets = getBudgets();
    const newBudgets: Budget[] = templates
      .filter((t) => t.enabled)
      .map((t) => ({
        id: `bud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: t.category,
        category: t.category,
        allocated: t.defaultAmount,
        month: activeMonthStr,
        createdFromTemplate: true,
        isModified: false,
      }));
    if (newBudgets.length === 0) {
      toast.error('No default templates are configured. Create templates in Settings first.');
      return;
    }
    const updated = [...allBudgets, ...newBudgets];
    saveBudgets(updated);
    setBudgets(updated);
    toast.success('Initialized budgets from Default Template.');
  };

  const handleCopyPreviousMonth = () => {
    let prevMonth = selectedMonth - 1;
    let prevYear = selectedYear;
    if (prevMonth < 0) {
      prevMonth = 11;
      prevYear -= 1;
    }
    const prevMonthStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}`;
    const allBudgets = getBudgets();
    const prevBudgets = allBudgets.filter((b) => b.month === prevMonthStr);

    if (prevBudgets.length === 0) {
      toast.error('No budget records found in the previous month to copy.');
      return;
    }

    const newBudgets: Budget[] = prevBudgets.map((b) => ({
      id: `bud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: b.category,
      category: b.category,
      allocated: b.allocated,
      month: activeMonthStr,
      createdFromTemplate: b.createdFromTemplate,
      isModified: b.isModified,
    }));

    const updated = [...allBudgets, ...newBudgets];
    saveBudgets(updated);
    setBudgets(updated);
    toast.success(`Copied ${newBudgets.length} budgets from previous month.`);
  };

  // Merge/Force Copy Handlers
  const handleCopyDefaultTemplateForce = () => {
    if (
      confirm(
        'This will overwrite current category budget allocations with the default template. Proceed?'
      )
    ) {
      const allBudgets = getBudgets();
      const otherBudgets = allBudgets.filter((b) => b.month !== activeMonthStr);
      const newBudgets: Budget[] = templates
        .filter((t) => t.enabled)
        .map((t) => ({
          id: `bud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: t.category,
          category: t.category,
          allocated: t.defaultAmount,
          month: activeMonthStr,
          createdFromTemplate: true,
          isModified: false,
        }));
      const updated = [...otherBudgets, ...newBudgets];
      saveBudgets(updated);
      setBudgets(updated);
      toast.success('Applied default template to this month.');
    }
  };

  const handleCopyPreviousMonthForce = () => {
    if (
      confirm(
        "This will overwrite current category budget allocations with the previous month's limits. Proceed?"
      )
    ) {
      let prevMonth = selectedMonth - 1;
      let prevYear = selectedYear;
      if (prevMonth < 0) {
        prevMonth = 11;
        prevYear -= 1;
      }
      const prevMonthStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}`;
      const allBudgets = getBudgets();
      const prevBudgets = allBudgets.filter((b) => b.month === prevMonthStr);

      if (prevBudgets.length === 0) {
        toast.error('No budget records found in the previous month to copy.');
        return;
      }

      const otherBudgets = allBudgets.filter((b) => b.month !== activeMonthStr);
      const newBudgets: Budget[] = prevBudgets.map((b) => ({
        id: `bud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: b.category,
        category: b.category,
        allocated: b.allocated,
        month: activeMonthStr,
        createdFromTemplate: b.createdFromTemplate,
        isModified: b.isModified,
      }));

      const updated = [...otherBudgets, ...newBudgets];
      saveBudgets(updated);
      setBudgets(updated);
      toast.success(`Copied ${newBudgets.length} budgets from previous month.`);
    }
  };

  const handleResetToDefault = (budget: Budget) => {
    const template = templates.find((t) => t.category === budget.category);
    if (!template) {
      toast.error('No default template found for this category.');
      return;
    }
    const updatedList = budgets.map((b) => {
      if (b.id === budget.id) {
        return {
          ...b,
          allocated: template.defaultAmount,
          isModified: false,
        };
      }
      return b;
    });
    setBudgets(updatedList);
    saveBudgets(updatedList);
    toast.success(
      `Reset ${budget.category} budget to default (₹${template.defaultAmount.toLocaleString('en-IN')}).`
    );
  };

  // CRUD Actions
  function handleOpenAdd() {
    setEditingBudget(null);
    setFormData({
      category: availableCategories.length > 0 ? availableCategories[0].name : '',
      allocated: '',
    });
    setIsModalOpen(true);
  }

  function handleOpenEdit(budget: Budget) {
    setEditingBudget(budget);
    setFormData({
      category: budget.category,
      allocated: budget.allocated.toString(),
    });
    setIsModalOpen(true);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(formData.allocated);
    if (!formData.category) {
      toast.error('Please select a category.');
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid target amount.');
      return;
    }

    const template = templates.find((t) => t.category === formData.category);
    const isMod = !template || template.defaultAmount !== amount;

    let updatedList: Budget[] = [];

    if (editingBudget) {
      updatedList = budgets.map((b) => {
        if (b.id === editingBudget.id) {
          return {
            ...b,
            category: formData.category,
            name: formData.category,
            allocated: amount,
            isModified: isMod,
          };
        }
        return b;
      });
      toast.success('Budget limit updated.');
    } else {
      const newBudget: Budget = {
        id: `bud-${Date.now()}`,
        name: formData.category,
        category: formData.category,
        allocated: amount,
        month: activeMonthStr,
        createdFromTemplate: false,
        isModified: isMod,
      };
      updatedList = [...budgets, newBudget];
      toast.success('New monthly budget set.');
    }

    setBudgets(updatedList);
    saveBudgets(updatedList);
    setIsModalOpen(false);
  }

  function handleDelete(id: string) {
    if (confirm('Are you sure you want to delete this monthly budget target?')) {
      const updatedList = budgets.filter((b) => b.id !== id);
      setBudgets(updatedList);
      saveBudgets(updatedList);
      toast.success('Budget deleted successfully.');
    }
  }

  return (
    <AppLayout>
      <div className="px-6 py-6 xl:px-10 2xl:px-16 max-w-screen-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Monthly Budgets</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Configure and trace target limits to keep your monthly spending habits on track.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-auto">
            {/* Custom Month Picker */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
                className="flex items-center gap-2 px-3.5 py-2 border border-border bg-[#0b0f1a] hover:bg-muted text-xs font-semibold text-foreground rounded-xl transition-all animate-fade-in"
              >
                <Calendar size={13} className="text-primary" />
                <span>
                  {MONTH_NAMES[selectedMonth]} {selectedYear}
                </span>
                <ChevronDown size={12} className="opacity-70" />
              </button>

              {isDatePickerOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsDatePickerOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 z-50 bg-[#0b0f1a] border border-border rounded-xl shadow-2xl p-3 grid grid-cols-2 gap-3 w-56">
                    <div className="space-y-0.5 max-h-40 overflow-y-auto pr-1 select-scrollbar">
                      <p className="text-3xs font-bold uppercase tracking-wider text-muted-foreground px-2 py-1 sticky top-0 bg-[#0b0f1a] z-10">
                        Month
                      </p>
                      {MONTH_NAMES.map((m, i) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            setSelectedMonth(i);
                            setIsDatePickerOpen(false);
                          }}
                          className={`w-full text-left text-3xs px-2 py-1 rounded-md transition ${
                            selectedMonth === i
                              ? 'bg-primary text-white font-semibold'
                              : 'text-slate-300 hover:bg-muted/50 hover:text-foreground'
                          }`}
                        >
                          {m.slice(0, 3)}
                        </button>
                      ))}
                    </div>
                    <div className="space-y-0.5 max-h-40 overflow-y-auto pl-1 select-scrollbar border-l border-border">
                      <p className="text-3xs font-bold uppercase tracking-wider text-muted-foreground px-2 py-1 sticky top-0 bg-[#0b0f1a] z-10">
                        Year
                      </p>
                      {availableYears.map((y) => (
                        <button
                          key={y}
                          type="button"
                          onClick={() => {
                            setSelectedYear(y);
                            setIsDatePickerOpen(false);
                          }}
                          className={`w-full text-left text-3xs px-2 py-1 rounded-md transition ${
                            selectedYear === y
                              ? 'bg-primary text-white font-semibold'
                              : 'text-slate-300 hover:bg-muted/50 hover:text-foreground'
                          }`}
                        >
                          {y}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {activeBudgets.length > 0 && (
              <button
                onClick={handleOpenAdd}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/95 text-xs font-semibold text-primary-foreground rounded-xl transition-all active:scale-95 shadow-lg shadow-primary/10"
              >
                <Plus size={14} />
                Set Budget
              </button>
            )}
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#0b0f1a] border border-border rounded-2xl p-5 md:p-6 flex flex-col justify-between min-h-[120px] shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-primary/5 rounded-full blur-lg" />
            <p className="text-2xs font-semibold tracking-wider text-slate-400 uppercase">
              Total Budget
            </p>
            <p className="text-2xl font-black mt-2 tabular-nums text-foreground">
              {totalBudget.toLocaleString('en-IN')}
            </p>
            <p className="text-3xs text-muted-foreground mt-1">
              Limits set across {activeBudgets.length} categories
            </p>
          </div>

          <div className="bg-[#0b0f1a] border border-border rounded-2xl p-5 md:p-6 flex flex-col justify-between min-h-[120px] shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-negative/5 rounded-full blur-lg" />
            <p className="text-2xs font-semibold tracking-wider text-slate-400 uppercase">
              Total Spent
            </p>
            <p className="text-2xl font-black mt-2 tabular-nums text-negative">
              {totalSpent.toLocaleString('en-IN')}
            </p>
            <p className="text-3xs text-muted-foreground mt-1">Spent under configured categories</p>
          </div>

          <div className="bg-[#0b0f1a] border border-border rounded-2xl p-5 md:p-6 flex flex-col justify-between min-h-[120px] shadow-sm relative overflow-hidden">
            <div
              className={`absolute top-0 right-0 w-16 h-16 ${totalRemaining >= 0 ? 'bg-positive' : 'bg-negative'}/5 rounded-full blur-lg`}
            />
            <p className="text-2xs font-semibold tracking-wider text-slate-400 uppercase">
              Remaining Budget
            </p>
            <p
              className={`text-2xl font-black mt-2 tabular-nums ${totalRemaining >= 0 ? 'text-positive' : 'text-negative'}`}
            >
              {totalRemaining < 0 ? '-' : ''}
              {Math.abs(totalRemaining).toLocaleString('en-IN')}
            </p>
            <p className="text-3xs text-muted-foreground mt-1">
              {totalRemaining >= 0 ? 'Within monthly boundaries' : 'Limits exceeded'}
            </p>
          </div>

          <div
            className={`bg-[#0b0f1a] border rounded-2xl p-5 md:p-6 flex flex-col justify-between min-h-[120px] shadow-sm relative overflow-hidden transition-all ${
              overBudgetsCount > 0
                ? 'border-negative/20 bg-negative/5 shadow-md shadow-negative/5'
                : 'border-border'
            }`}
          >
            <p className="text-2xs font-semibold tracking-wider text-slate-400 uppercase">
              Budget Alerts
            </p>
            <div className="flex items-center justify-between mt-2">
              <p
                className={`text-2xl font-black tabular-nums ${overBudgetsCount > 0 ? 'text-negative animate-pulse' : 'text-positive'}`}
              >
                {overBudgetsCount}
              </p>
              {overBudgetsCount > 0 && <AlertTriangle size={18} className="text-negative" />}
            </div>
            <p className="text-3xs text-muted-foreground mt-1">
              {overBudgetsCount === 0
                ? 'All budgets are healthy'
                : `${overBudgetsCount} category spending limits breached`}
            </p>
          </div>
        </div>

        {/* Budgets List Grid or Setup Prompts */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-xl p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h2 className="text-base font-semibold text-foreground">Category Budgets</h2>

            {activeBudgets.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleCopyDefaultTemplateForce}
                  className="flex items-center gap-1 px-3 py-1.5 border border-border bg-[#0b0f1a] hover:bg-muted text-3xs font-semibold text-slate-300 rounded-lg transition"
                >
                  <LayoutTemplate size={10} />
                  Copy Default Template
                </button>
                <button
                  onClick={handleCopyPreviousMonthForce}
                  className="flex items-center gap-1 px-3 py-1.5 border border-border bg-[#0b0f1a] hover:bg-muted text-3xs font-semibold text-slate-300 rounded-lg transition"
                >
                  <Copy size={10} />
                  Copy Previous Month
                </button>
              </div>
            )}
          </div>

          {activeBudgets.length === 0 && !hasStartedEmpty ? (
            <div className="py-10 max-w-4xl mx-auto space-y-6">
              <div className="text-center space-y-1">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-[#0b0f1a] text-primary">
                  <LayoutTemplate size={20} />
                </div>
                <h3 className="text-sm font-bold text-foreground pt-2">Configure Month Plan</h3>
                <p className="text-3xs text-muted-foreground max-w-md mx-auto">
                  This month has no budget limits configured yet. Choose one of the initialization
                  setups below to get started.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                {/* Default Template */}
                <button
                  onClick={handleCreateFromTemplate}
                  className="flex flex-col items-center text-center p-5 border border-border bg-[#0b0f1a]/50 hover:bg-[#0b0f1a]/85 rounded-2xl hover:border-primary/30 transition group space-y-2 cursor-pointer"
                >
                  <CheckCircle
                    size={18}
                    className="text-primary group-hover:scale-110 transition"
                  />
                  <p className="text-xs font-bold text-slate-200">Default Template</p>
                  <p className="text-4xs text-muted-foreground leading-normal">
                    Import standard allocations and thresholds configured in Settings.
                  </p>
                </button>

                {/* Copy Previous Month */}
                <button
                  onClick={handleCopyPreviousMonth}
                  className="flex flex-col items-center text-center p-5 border border-border bg-[#0b0f1a]/50 hover:bg-[#0b0f1a]/85 rounded-2xl hover:border-primary/30 transition group space-y-2 cursor-pointer"
                >
                  <Copy size={18} className="text-warning group-hover:scale-110 transition" />
                  <p className="text-xs font-bold text-slate-200">Previous Month</p>
                  <p className="text-4xs text-muted-foreground leading-normal">
                    Duplicate categories and target spending sizes from last month.
                  </p>
                </button>

                {/* Start Empty */}
                <button
                  onClick={() => setHasStartedEmpty(true)}
                  className="flex flex-col items-center text-center p-5 border border-border bg-[#0b0f1a]/50 hover:bg-[#0b0f1a]/85 rounded-2xl hover:border-primary/30 transition group space-y-2 cursor-pointer"
                >
                  <Plus size={18} className="text-positive group-hover:scale-110 transition" />
                  <p className="text-xs font-bold text-slate-200">Start Empty</p>
                  <p className="text-4xs text-muted-foreground leading-normal">
                    Start fresh without defaults and add category targets manually.
                  </p>
                </button>
              </div>
            </div>
          ) : activeBudgets.length === 0 && hasStartedEmpty ? (
            <div className="text-center py-16 flex flex-col items-center justify-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-muted/30 text-muted-foreground">
                <PiggyBank size={24} />
              </div>
              <p className="text-sm font-semibold text-muted-foreground">
                No budget limits set for this month.
              </p>
              <p className="text-2xs text-muted-foreground mt-1 max-w-xs">
                Setting budgets allows you to monitor and stay within your targeted spending
                categories.
              </p>
              <button
                onClick={handleOpenAdd}
                className="mt-4 px-4 py-2 bg-primary hover:bg-primary/90 text-xs font-semibold text-primary-foreground rounded-xl transition-all active:scale-95"
              >
                Set a Target
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {activeBudgets.map((budget) => {
                const consumed = activeExpenses
                  .filter((t) => t.category === budget.category)
                  .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
                const pct =
                  budget.allocated > 0 ? Math.round((consumed / budget.allocated) * 100) : 0;
                const limitRemaining = budget.allocated - consumed;

                // Check template modified status
                const template = templates.find((t) => t.category === budget.category);
                const isModified =
                  budget.isModified || (template && template.defaultAmount !== budget.allocated);

                return (
                  <div
                    key={budget.id}
                    className="border border-border bg-[#0b0f1a]/40 rounded-xl p-4 flex flex-col justify-between gap-3 hover:border-primary/20 transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h4 className="text-sm font-bold text-slate-200">{budget.category}</h4>
                          {isModified && (
                            <span className="text-4xs px-1.5 py-0.5 rounded bg-warning/10 text-warning border border-warning/10 font-bold uppercase tracking-wider">
                              Modified
                            </span>
                          )}
                        </div>
                        <p className="text-3xs text-muted-foreground mt-0.5">
                          Configure limits to avoid overspending
                        </p>
                      </div>

                      <div className="flex items-center gap-1">
                        {template && isModified && (
                          <button
                            onClick={() => handleResetToDefault(budget)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted text-slate-400 hover:text-primary transition-all"
                            title="Reset to default template value"
                          >
                            <RefreshCw size={11} />
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenEdit(budget)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted text-slate-400 hover:text-primary transition-all"
                          title="Edit target limit"
                        >
                          <Edit3 size={12} />
                        </button>
                        <button
                          onClick={() => handleDelete(budget.id)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted text-slate-400 hover:text-negative transition-all"
                          title="Remove budget"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-end justify-between mb-1.5 text-xs font-semibold">
                        <span className="text-slate-400 tabular-nums">
                          ₹{consumed.toLocaleString('en-IN')} / ₹
                          {budget.allocated.toLocaleString('en-IN')}
                        </span>
                        <span
                          className={`font-bold tabular-nums ${
                            pct > 100
                              ? 'text-negative'
                              : pct >= 85
                                ? 'text-warning'
                                : 'text-positive'
                          }`}
                        >
                          {pct}%
                        </span>
                      </div>

                      {/* Progress Bar */}
                      <div className="h-2 bg-muted rounded-full overflow-hidden w-full relative">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${
                            pct > 100 ? 'bg-negative' : pct >= 85 ? 'bg-warning' : 'bg-primary'
                          }`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-3xs border-t border-border/40 pt-2 mt-1">
                      <span className="text-slate-400">
                        {limitRemaining >= 0 ? 'Remaining budget limit' : 'Over limit by'}
                      </span>
                      <span
                        className={`font-semibold tabular-nums ${limitRemaining >= 0 ? 'text-slate-200' : 'text-negative'}`}
                      >
                        ₹{Math.abs(limitRemaining).toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Budget Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingBudget ? 'Edit Target Budget' : 'Configure New Budget'}
        description={
          editingBudget
            ? 'Update target monthly spending limit'
            : 'Set a limit on a monthly expense category'
        }
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Category</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              required
              disabled={!!editingBudget}
              className="w-full rounded-lg border border-border bg-[#0b0f1a] p-2.5 text-sm text-slate-200 focus:outline-none focus:border-primary transition-all font-medium disabled:opacity-60"
            >
              {availableCategories.length === 0 && !editingBudget ? (
                <option value="">No categories available</option>
              ) : (
                availableCategories.map((cat) => (
                  <option key={cat.id} value={cat.name}>
                    {cat.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              Monthly Limit Amount (₹)
            </label>
            <input
              type="number"
              value={formData.allocated}
              onChange={(e) => setFormData({ ...formData, allocated: e.target.value })}
              placeholder="e.g. 10000"
              required
              min="1"
              className="w-full rounded-lg border border-border bg-[#0b0f1a] p-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-primary transition-all font-semibold"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 border border-border bg-[#0b0f1a] hover:bg-muted text-xs font-semibold text-foreground rounded-lg transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={availableCategories.length === 0 && !editingBudget}
              className="px-4 py-2 bg-primary hover:bg-primary/95 text-xs font-semibold text-primary-foreground rounded-lg transition-all disabled:opacity-50"
            >
              Save Target
            </button>
          </div>
        </form>
      </Modal>
    </AppLayout>
  );
}
