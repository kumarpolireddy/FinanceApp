'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar as CalendarIcon, 
  List, 
  Wallet, 
  Menu, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Trash2, 
  Edit3, 
  Settings as SettingsIcon, 
  Globe, 
  Download, 
  Upload, 
  HelpCircle,
  X,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp
} from 'lucide-react';
import { toast } from 'sonner';
import { 
  getTransactions, 
  getAccounts, 
  getCategories, 
  saveTransaction, 
  updateTransaction, 
  deleteTransaction,
  type Transaction,
  type Account,
  type Category
} from '@/lib/storage';
import PCManagerComponent from './PCManager';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function MobileAppView() {
  const [activeTab, setActiveTab] = useState<'daily' | 'calendar' | 'accounts' | 'more'>('daily');
  const [dailySubTab, setDailySubTab] = useState<'daily' | 'monthly' | 'annually' | 'total'>('daily');
  
  // Date selection state
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const selectedYear = currentDate.getFullYear();
  const selectedMonth = currentDate.getMonth();

  // Database states
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  
  // Modals & Sub-views states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<number | null>(null);
  
  // More Sub-views
  const [moreSubView, setMoreSubView] = useState<'menu' | 'config' | 'pc' | 'help' | 'backup'>('menu');

  // Form states
  const [formType, setFormType] = useState<'expense' | 'income' | 'transfer'>('expense');
  const [formDate, setFormDate] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formAccount, setFormAccount] = useState('');
  const [formToAccount, setFormToAccount] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formSubcategory, setFormSubcategory] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // Configuration settings (saved to localStorage)
  const [config, setConfig] = useState({
    startScreen: 'daily',
    monthlyStartDate: 1,
    weeklyStartDay: 0, // Sunday
    mainCurrency: 'INR',
    subCurrency: 'USD',
    carryOver: 'off',
    autocomplete: true,
    showDescription: true
  });

  // Reload data helper
  const reloadData = () => {
    setTransactions(getTransactions(true));
    setAccounts(getAccounts(true));
    setCategories(getCategories());
  };

  // Initial load & storage event listener
  useEffect(() => {
    reloadData();
    
    // Load config from localStorage
    const savedConfig = localStorage.getItem('wealthiq_mobile_config');
    if (savedConfig) {
      try {
        const parsed = JSON.parse(savedConfig);
        setConfig(prev => ({ ...prev, ...parsed }));
        if (parsed.startScreen) {
          setActiveTab(parsed.startScreen);
        }
      } catch (e) {
        // ignore
      }
    }

    const handleStorageChange = () => {
      reloadData();
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Update configuration setting
  const updateConfig = (key: keyof typeof config, value: any) => {
    const updated = { ...config, [key]: value };
    setConfig(updated);
    localStorage.setItem('wealthiq_mobile_config', JSON.stringify(updated));
    toast.success('Configuration updated');
  };

  // Date Shift Helper
  const shiftMonth = (delta: number) => {
    setCurrentDate(prev => {
      const next = new Date(prev);
      next.setMonth(next.getMonth() + delta);
      return next;
    });
    setSelectedCalendarDay(null);
  };

  // Date formatted keys
  const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  const yearKey = `${selectedYear}`;

  // Filtered transactions for current selected month/year
  const monthTransactions = useMemo(() => {
    return transactions.filter(t => t.date && t.date.startsWith(monthKey));
  }, [transactions, monthKey]);

  // Income/Expense/Net Totals for the current month
  const monthSummary = useMemo(() => {
    let income = 0;
    let expense = 0;
    monthTransactions.forEach(t => {
      if (t.type === 'income') income += t.amount;
      else if (t.type === 'expense') expense += t.amount;
    });
    return {
      income,
      expense,
      balance: income - expense
    };
  }, [monthTransactions]);

  // Group transactions for daily list
  const groupedDailyTransactions = useMemo(() => {
    const groups: Record<string, Transaction[]> = {};
    monthTransactions.forEach(t => {
      const day = new Date(t.date).getDate();
      const dayStr = String(day).padStart(2, '0');
      if (!groups[dayStr]) groups[dayStr] = [];
      groups[dayStr].push(t);
    });
    // Sort keys descending
    return Object.entries(groups)
      .sort((a, b) => Number(b[0]) - Number(a[0]));
  }, [monthTransactions]);

  // Monthly breakdown for Annually sub-tab
  const annualMonthlySummary = useMemo(() => {
    const summary: Record<number, { income: number, expense: number }> = {};
    for (let m = 0; m < 12; m++) {
      summary[m] = { income: 0, expense: 0 };
    }
    transactions.forEach(t => {
      const d = new Date(t.date);
      if (d.getFullYear() === selectedYear) {
        const m = d.getMonth();
        if (t.type === 'income') summary[m].income += t.amount;
        else if (t.type === 'expense') summary[m].expense += t.amount;
      }
    });
    return Object.entries(summary).map(([mStr, data]) => ({
      monthIdx: Number(mStr),
      name: MONTH_NAMES[Number(mStr)].slice(0, 3),
      ...data,
      net: data.income - data.expense
    }));
  }, [transactions, selectedYear]);

  // Category summary for Monthly sub-tab
  const monthlyCategorySummary = useMemo(() => {
    const expenseCats: Record<string, number> = {};
    const incomeCats: Record<string, number> = {};
    let totalExpense = 0;
    let totalIncome = 0;

    monthTransactions.forEach(t => {
      if (t.type === 'expense') {
        expenseCats[t.category] = (expenseCats[t.category] || 0) + t.amount;
        totalExpense += t.amount;
      } else if (t.type === 'income') {
        incomeCats[t.category] = (incomeCats[t.category] || 0) + t.amount;
        totalIncome += t.amount;
      }
    });

    return {
      expense: Object.entries(expenseCats).sort((a, b) => b[1] - a[1]).map(([name, val]) => ({ name, value: val, percent: totalExpense > 0 ? (val / totalExpense * 100) : 0 })),
      income: Object.entries(incomeCats).sort((a, b) => b[1] - a[1]).map(([name, val]) => ({ name, value: val, percent: totalIncome > 0 ? (val / totalIncome * 100) : 0 })),
      totalExpense,
      totalIncome
    };
  }, [monthTransactions]);

  // Calendar Day Totals Calculation
  const calendarDays = useMemo(() => {
    const firstDay = new Date(selectedYear, selectedMonth, 1).getDay();
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    
    const dayTotals: Record<number, { income: number, expense: number }> = {};
    monthTransactions.forEach(t => {
      const day = new Date(t.date).getDate();
      if (!dayTotals[day]) dayTotals[day] = { income: 0, expense: 0 };
      if (t.type === 'income') dayTotals[day].income += t.amount;
      else if (t.type === 'expense') dayTotals[day].expense += t.amount;
    });

    const grid = [];
    // Padding empty cells for previous month
    for (let i = 0; i < firstDay; i++) {
      grid.push(null);
    }
    // Main days
    for (let d = 1; d <= daysInMonth; d++) {
      grid.push({
        day: d,
        income: dayTotals[d]?.income || 0,
        expense: dayTotals[d]?.expense || 0
      });
    }
    return grid;
  }, [monthTransactions, selectedYear, selectedMonth]);

  // Calendar day transactions
  const selectedDayTransactions = useMemo(() => {
    if (selectedCalendarDay === null) return [];
    return monthTransactions.filter(t => new Date(t.date).getDate() === selectedCalendarDay);
  }, [monthTransactions, selectedCalendarDay]);

  // Accounts Tab Grouping
  const groupedAccounts = useMemo(() => {
    const groups = {
      bank: { name: 'Bank Accounts', items: [] as Account[], total: 0 },
      cash: { name: 'Cash Accounts', items: [] as Account[], total: 0 },
      credit: { name: 'Credit Cards', items: [] as Account[], total: 0 },
      loan: { name: 'Loan Accounts', items: [] as Account[], total: 0 }
    };

    let totalAssets = 0;
    let totalLiabilities = 0;

    accounts.forEach(acc => {
      const type = acc.type || 'accounts';
      if (type === 'accounts') {
        groups.bank.items.push(acc);
        groups.bank.total += acc.balance;
        totalAssets += acc.balance;
      } else if (type === 'cash') {
        groups.cash.items.push(acc);
        groups.cash.total += acc.balance;
        totalAssets += acc.balance;
      } else if (type === 'credit') {
        groups.credit.items.push(acc);
        groups.credit.total += acc.balance;
        totalLiabilities += Math.abs(acc.balance);
      } else if (type === 'loan') {
        groups.loan.items.push(acc);
        groups.loan.total += acc.balance;
        totalLiabilities += Math.abs(acc.balance);
      }
    });

    return {
      groups,
      totalAssets,
      totalLiabilities,
      netWorth: totalAssets - totalLiabilities
    };
  }, [accounts]);

  // Add / Edit submission
  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(formAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    if (!formAccount) {
      toast.error('Source account is required');
      return;
    }
    if (formType === 'transfer' && formAccount === formToAccount) {
      toast.error('Source and destination accounts must be different');
      return;
    }

    const payload = {
      date: new Date(formDate).toISOString(),
      type: formType,
      amount: amt,
      description: formDescription.trim(),
      account: formAccount,
      toAccount: formType === 'transfer' ? formToAccount : undefined,
      category: formType === 'transfer' ? 'Transfer' : formCategory,
      subcategory: formType === 'transfer' ? undefined : (formSubcategory || undefined),
      notes: formNotes.trim() || undefined
    };

    try {
      if (editingTx) {
        updateTransaction(editingTx.id, payload);
        toast.success('Transaction updated!');
      } else {
        saveTransaction(payload);
        toast.success('Transaction saved!');
      }
      setIsAddModalOpen(false);
      setEditingTx(null);
      reloadData();
    } catch (err: any) {
      toast.error(err.message || 'Operation failed');
    }
  };

  // Open edit modal
  const openEdit = (tx: Transaction) => {
    setEditingTx(tx);
    setFormType(tx.type);
    
    // format datetime-local
    const d = new Date(tx.date);
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - (offset * 60 * 1000));
    setFormDate(local.toISOString().slice(0, 16));
    
    setFormAmount(tx.amount.toString());
    setFormDescription(tx.description);
    setFormAccount(tx.account);
    setFormToAccount(tx.toAccount || '');
    setFormCategory(tx.category);
    setFormSubcategory(tx.subcategory || '');
    setFormNotes(tx.notes || '');
    setIsAddModalOpen(true);
  };

  // Open create modal
  const openCreate = () => {
    setEditingTx(null);
    setFormType('expense');
    
    const d = new Date();
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - (offset * 60 * 1000));
    setFormDate(local.toISOString().slice(0, 16));
    
    setFormAmount('');
    setFormDescription('');
    if (accounts.length > 0) setFormAccount(accounts[0].id);
    else setFormAccount('');
    setFormToAccount('');
    
    const expCats = categories.filter(c => c.type === 'expense');
    if (expCats.length > 0) setFormCategory(expCats[0].name);
    else setFormCategory('');
    setFormSubcategory('');
    setFormNotes('');
    setIsAddModalOpen(true);
  };

  // Delete transaction
  const handleDelete = (tx: Transaction) => {
    if (window.confirm('Delete this transaction? The account balance changes will be reversed.')) {
      deleteTransaction(tx.id, 'reverse');
      toast.success('Transaction deleted');
      setIsAddModalOpen(false);
      setEditingTx(null);
      reloadData();
    }
  };

  // Category options based on type
  const activeCategories = useMemo(() => {
    return categories.filter(c => c.type === formType);
  }, [categories, formType]);

  // Subcategory options based on category
  const activeSubcategories = useMemo(() => {
    const cat = categories.find(c => c.name === formCategory);
    return cat?.subcategories || [];
  }, [categories, formCategory]);

  // Format Currency
  const formatVal = (val: number) => {
    return val.toLocaleString('en-IN', {
      style: 'currency',
      currency: config.mainCurrency,
      maximumFractionDigits: 0
    });
  };

  // Sync Categories when type changes in form
  useEffect(() => {
    if (activeCategories.length > 0) {
      setFormCategory(activeCategories[0].name);
    } else {
      setFormCategory('');
    }
  }, [formType, activeCategories]);

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-background text-foreground overflow-hidden font-sans border-x border-border relative select-none">
      
      {/* ================= HEADER ================= */}
      <header className="flex justify-between items-center px-4 py-3 bg-card border-b border-border select-none">
        {activeTab === 'more' && moreSubView !== 'menu' ? (
          <button 
            onClick={() => setMoreSubView('menu')}
            className="flex items-center gap-1 text-primary text-sm font-semibold hover:opacity-80 transition"
          >
            <ChevronLeft size={18} />
            <span>Back</span>
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xl">📊</span>
            <span className="font-extrabold tracking-tight text-foreground text-base">WealthIQ</span>
            <span className="text-3xs bg-primary/20 text-primary px-1.5 py-0.5 rounded font-bold uppercase">Mobile</span>
          </div>
        )}
        
        {/* Month Navigation for Daily/Calendar */}
        {(activeTab === 'daily' || activeTab === 'calendar') && (
          <div className="flex items-center gap-3">
            <button onClick={() => shiftMonth(-1)} className="p-1 rounded-lg hover:bg-muted/50 transition">
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-bold text-foreground">
              {MONTH_NAMES[selectedMonth]} {selectedYear}
            </span>
            <button onClick={() => shiftMonth(1)} className="p-1 rounded-lg hover:bg-muted/50 transition">
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </header>

      {/* ================= TAB CONTENTS ================= */}
      <main className="flex-1 overflow-y-auto pb-20 relative select-text">

        {/* 1. DAILY TRANSACTION LEDGER */}
        {activeTab === 'daily' && (
          <div className="space-y-4">
            
            {/* Top Sub-tabs */}
            <div className="flex p-1 bg-card border-b border-border sticky top-0 z-10">
              {(['daily', 'monthly', 'annually', 'total'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setDailySubTab(t)}
                  className={`flex-1 text-center py-1.5 text-3xs font-bold uppercase rounded-lg transition-all ${
                    dailySubTab === t 
                      ? 'bg-primary text-primary-foreground shadow-sm' 
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Income/Expense Monthly summary banner */}
            {dailySubTab !== 'annually' && (
              <div className="mx-4 bg-muted/20 border border-border rounded-xl p-3 grid grid-cols-3 text-center gap-2">
                <div>
                  <span className="text-3xs text-muted-foreground font-semibold uppercase tracking-wider block">Income</span>
                  <span className="text-xs font-bold text-positive">{formatVal(monthSummary.income)}</span>
                </div>
                <div>
                  <span className="text-3xs text-muted-foreground font-semibold uppercase tracking-wider block">Expense</span>
                  <span className="text-xs font-bold text-negative">{formatVal(monthSummary.expense)}</span>
                </div>
                <div>
                  <span className="text-3xs text-muted-foreground font-semibold uppercase tracking-wider block">Balance</span>
                  <span className={`text-xs font-bold ${monthSummary.balance >= 0 ? 'text-positive' : 'text-negative'}`}>
                    {formatVal(monthSummary.balance)}
                  </span>
                </div>
              </div>
            )}

            {/* Sub-tab: DAILY LIST */}
            {dailySubTab === 'daily' && (
              <div className="px-4 space-y-4">
                {groupedDailyTransactions.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-xs">
                    No transactions found for this period.
                  </div>
                ) : (
                  groupedDailyTransactions.map(([day, txs]) => {
                    const dateObj = new Date(txs[0].date);
                    const weekDay = dateObj.toLocaleDateString('en-IN', { weekday: 'short' });
                    
                    // Daily balance totals
                    let dayIncome = 0;
                    let dayExpense = 0;
                    txs.forEach(t => {
                      if (t.type === 'income') dayIncome += t.amount;
                      else if (t.type === 'expense') dayExpense += t.amount;
                    });

                    return (
                      <div key={day} className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                        {/* Day Header */}
                        <div className="flex justify-between items-center px-3 py-2 bg-muted/10 border-b border-border">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-foreground">{day}</span>
                            <span className="text-3xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-bold uppercase">{weekDay}</span>
                          </div>
                          <div className="flex gap-2 text-3xs font-bold">
                            {dayIncome > 0 && <span className="text-positive">+{formatVal(dayIncome)}</span>}
                            {dayExpense > 0 && <span className="text-negative">-{formatVal(dayExpense)}</span>}
                          </div>
                        </div>
                        {/* Day Transactions */}
                        <div className="divide-y divide-border/60">
                          {txs.map(tx => {
                            const isTransfer = tx.type === 'transfer';
                            const sourceName = accounts.find(a => a.id === tx.account)?.name || 'Unknown';
                            const destName = isTransfer ? (accounts.find(a => a.id === tx.toAccount)?.name || 'Unknown') : '';

                            return (
                              <div 
                                key={tx.id} 
                                onClick={() => openEdit(tx)}
                                className="flex justify-between items-center p-3 hover:bg-muted/10 transition cursor-pointer"
                              >
                                <div className="space-y-0.5 min-w-0 pr-2">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-semibold text-foreground truncate">{tx.description}</span>
                                    {!isTransfer && (
                                      <span className="text-4xs bg-card border border-border text-muted-foreground px-1.5 py-0.5 rounded-full font-medium">
                                        {tx.category}
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-3xs text-muted-foreground font-medium block truncate">
                                    {isTransfer ? `${sourceName} ➔ ${destName}` : sourceName}
                                    {tx.notes ? ` • ${tx.notes}` : ''}
                                  </span>
                                </div>
                                <span className={`text-xs font-bold tabular-nums flex-shrink-0 ${
                                  tx.type === 'income' ? 'text-positive' : tx.type === 'expense' ? 'text-negative' : 'text-muted-foreground'
                                }`}>
                                  {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : '⇄'}
                                  {formatVal(tx.amount)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Sub-tab: MONTHLY CATEGORY ACCRUALS */}
            {dailySubTab === 'monthly' && (
              <div className="px-4 space-y-6">
                {/* Expense Categories */}
                <div className="space-y-3">
                  <h3 className="text-3xs font-extrabold text-negative tracking-wider uppercase">Expense Categories</h3>
                  {monthlyCategorySummary.expense.length === 0 ? (
                    <p className="text-3xs text-muted-foreground">No expenses recorded.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {monthlyCategorySummary.expense.map(cat => (
                        <div key={cat.name} className="space-y-1">
                          <div className="flex justify-between text-xs font-normal">
                            <span className="text-foreground">{cat.name}</span>
                            <span className="text-negative font-normal tabular-nums">
                              {formatVal(cat.value)} ({cat.percent.toFixed(0)}%)
                            </span>
                          </div>
                          <div className="w-full bg-border/50 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-negative h-full rounded-full" style={{ width: `${cat.percent}%` }}></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Income Categories */}
                <div className="space-y-3 pt-2">
                  <h3 className="text-3xs font-extrabold text-positive tracking-wider uppercase">Income Categories</h3>
                  {monthlyCategorySummary.income.length === 0 ? (
                    <p className="text-3xs text-muted-foreground">No income recorded.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {monthlyCategorySummary.income.map(cat => (
                        <div key={cat.name} className="space-y-1">
                          <div className="flex justify-between text-xs font-normal">
                            <span className="text-foreground">{cat.name}</span>
                            <span className="text-positive font-normal tabular-nums">
                              {formatVal(cat.value)} ({cat.percent.toFixed(0)}%)
                            </span>
                          </div>
                          <div className="w-full bg-border/50 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-positive h-full rounded-full" style={{ width: `${cat.percent}%` }}></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sub-tab: ANNUALLY BREAKDOWN */}
            {dailySubTab === 'annually' && (
              <div className="px-4 space-y-3">
                <h3 className="text-3xs font-extrabold text-foreground tracking-wider uppercase mb-1">
                  Monthly summary for {selectedYear}
                </h3>
                <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm divide-y divide-border/60">
                  {annualMonthlySummary.map(m => {
                    const hasData = m.income > 0 || m.expense > 0;
                    return (
                      <div key={m.name} className="flex justify-between items-center p-3 text-xs font-semibold">
                        <div className="w-12">
                          <span className="text-foreground font-black uppercase">{m.name}</span>
                        </div>
                        {hasData ? (
                          <div className="flex gap-4 tabular-nums">
                            <span className="text-positive font-bold">+{formatVal(m.income)}</span>
                            <span className="text-negative font-bold">-{formatVal(m.expense)}</span>
                            <span className={`font-black w-20 text-right ${m.net >= 0 ? 'text-positive' : 'text-negative'}`}>
                              {formatVal(m.net)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-3xs text-muted-foreground">No data</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Sub-tab: TOTAL */}
            {dailySubTab === 'total' && (
              <div className="px-4 space-y-4">
                <h3 className="text-3xs font-extrabold text-foreground tracking-wider uppercase">Ledger Overview</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-card border border-border rounded-xl p-4 text-center">
                    <span className="text-3xs text-muted-foreground font-semibold uppercase">Total Transactions</span>
                    <p className="text-lg font-black text-foreground mt-1 tabular-nums">{monthTransactions.length}</p>
                  </div>
                  <div className="bg-card border border-border rounded-xl p-4 text-center">
                    <span className="text-3xs text-muted-foreground font-semibold uppercase">Net Savings Rate</span>
                    <p className="text-lg font-black text-primary mt-1 tabular-nums">
                      {monthSummary.income > 0 
                        ? `${(monthSummary.balance / monthSummary.income * 100).toFixed(0)}%` 
                        : '0%'}
                    </p>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

        {/* 2. CALENDAR VIEW */}
        {activeTab === 'calendar' && (
          <div className="space-y-4">
            {/* Calendar Grid Container */}
            <div className="mx-4 bg-card border border-border rounded-xl p-3 shadow-sm">
              {/* Weekday Headers */}
              <div className="grid grid-cols-7 text-center gap-1 mb-2 border-b border-border pb-2">
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((w, idx) => (
                  <span 
                    key={w} 
                    className={`text-4xs font-black uppercase ${idx === 0 ? 'text-negative' : idx === 6 ? 'text-primary' : 'text-muted-foreground'}`}
                  >
                    {w}
                  </span>
                ))}
              </div>
              {/* Calendar cells */}
              <div className="grid grid-cols-7 gap-y-2 gap-x-1 select-none">
                {calendarDays.map((cell, idx) => {
                  if (!cell) return <div key={`empty-${idx}`} className="h-10"></div>;
                  
                  const isSelected = selectedCalendarDay === cell.day;
                  const hasValues = cell.income > 0 || cell.expense > 0;

                  return (
                    <div
                      key={`day-${cell.day}`}
                      onClick={() => setSelectedCalendarDay(cell.day)}
                      className={`h-11 rounded-lg flex flex-col justify-between p-1 cursor-pointer transition ${
                        isSelected 
                          ? 'bg-primary/20 border border-primary' 
                          : 'hover:bg-muted/10 border border-transparent'
                      }`}
                    >
                      <span className={`text-3xs font-extrabold ${
                        (idx % 7 === 0) ? 'text-negative' : (idx % 7 === 6) ? 'text-primary' : 'text-foreground'
                      }`}>
                        {cell.day}
                      </span>
                      {hasValues && (
                        <div className="text-4xs font-bold leading-tight scale-[0.8] origin-bottom-left leading-none tracking-tighter">
                          {cell.income > 0 && <span className="text-positive block font-bold">+{cell.income}</span>}
                          {cell.expense > 0 && <span className="text-negative block font-bold">-{cell.expense}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Selected day transactions details */}
            {selectedCalendarDay !== null && (
              <div className="px-4 space-y-3">
                <div className="flex justify-between items-center border-b border-border pb-1">
                  <h4 className="text-xs font-bold text-foreground">
                    Transactions for {selectedCalendarDay} {MONTH_NAMES[selectedMonth]}
                  </h4>
                  <button 
                    onClick={() => setSelectedCalendarDay(null)}
                    className="text-muted-foreground hover:text-foreground text-3xs font-semibold"
                  >
                    Close
                  </button>
                </div>
                {selectedDayTransactions.length === 0 ? (
                  <p className="text-3xs text-muted-foreground py-4 text-center">No transactions recorded on this day.</p>
                ) : (
                  <div className="bg-card border border-border rounded-xl divide-y divide-border/60 overflow-hidden shadow-sm">
                    {selectedDayTransactions.map(tx => {
                      const isTransfer = tx.type === 'transfer';
                      const sourceName = accounts.find(a => a.id === tx.account)?.name || 'Unknown';
                      const destName = isTransfer ? (accounts.find(a => a.id === tx.toAccount)?.name || 'Unknown') : '';
                      return (
                        <div 
                          key={tx.id}
                          onClick={() => openEdit(tx)}
                          className="flex justify-between items-center p-3 hover:bg-muted/10 transition cursor-pointer"
                        >
                          <div className="min-w-0 pr-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-foreground truncate">{tx.description}</span>
                              <span className="text-4xs bg-card border border-border text-muted-foreground px-1.5 py-0.5 rounded-full font-medium">
                                {tx.category}
                              </span>
                            </div>
                            <span className="text-3xs text-muted-foreground font-medium block truncate mt-0.5">
                              {isTransfer ? `${sourceName} ➔ ${destName}` : sourceName}
                            </span>
                          </div>
                          <span className={`text-xs font-bold tabular-nums flex-shrink-0 ${
                            tx.type === 'income' ? 'text-positive' : tx.type === 'expense' ? 'text-negative' : 'text-muted-foreground'
                          }`}>
                            {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : '⇄'}
                            {formatVal(tx.amount)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

          </div>
        )}

        {/* 3. ACCOUNTS TAB */}
        {activeTab === 'accounts' && (
          <div className="px-4 space-y-5">
            {/* Asset Liability Totals */}
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-4">
              <div className="grid grid-cols-2 gap-4 divide-x divide-border">
                <div className="text-center">
                  <span className="text-3xs text-muted-foreground font-semibold uppercase tracking-wider block">Total Assets</span>
                  <span className="text-sm font-black text-positive mt-1 block">{formatVal(groupedAccounts.totalAssets)}</span>
                </div>
                <div className="text-center pl-4">
                  <span className="text-3xs text-muted-foreground font-semibold uppercase tracking-wider block">Liabilities</span>
                  <span className="text-sm font-black text-negative mt-1 block">{formatVal(groupedAccounts.totalLiabilities)}</span>
                </div>
              </div>
              <div className="border-t border-border pt-3 text-center">
                <span className="text-3xs text-muted-foreground font-semibold uppercase tracking-wider block">Net Worth</span>
                <span className={`text-base font-black mt-1 block ${groupedAccounts.netWorth >= 0 ? 'text-positive' : 'text-negative'}`}>
                  {formatVal(groupedAccounts.netWorth)}
                </span>
              </div>
            </div>

            {/* Account groups list */}
            {Object.entries(groupedAccounts.groups).map(([key, group]) => {
              if (group.items.length === 0) return null;
              const isLiability = key === 'credit' || key === 'loan';
              
              return (
                <div key={key} className="space-y-2">
                  <div className="flex justify-between items-center px-1">
                    <h3 className="text-3xs font-extrabold text-muted-foreground tracking-wider uppercase">
                      {group.name}
                    </h3>
                    <span className={`text-2xs font-bold ${isLiability ? 'text-negative' : 'text-positive'}`}>
                      {formatVal(group.total)}
                    </span>
                  </div>
                  <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm divide-y divide-border/60">
                    {group.items.map(acc => (
                      <div key={acc.id} className="flex justify-between items-center p-3">
                        <div className="flex items-center gap-3 min-w-0 pr-2">
                          <div 
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0" 
                            style={{ backgroundColor: acc.color || '#ccc' }}
                          ></div>
                          <div className="min-w-0">
                            <span className="text-xs font-semibold text-foreground truncate block">{acc.name}</span>
                            <span className="text-3xs text-muted-foreground font-medium truncate block">
                              {acc.bankName || acc.type.toUpperCase()}
                            </span>
                          </div>
                        </div>
                        <span className={`text-xs font-bold tabular-nums ${acc.balance < 0 ? 'text-negative' : 'text-foreground'}`}>
                          {formatVal(acc.balance)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 4. MORE / SETTINGS TAB */}
        {activeTab === 'more' && (
          <div className="px-4 space-y-4">
            
            {/* Sub-view: MENU LIST */}
            {moreSubView === 'menu' && (
              <div className="space-y-4 pt-2">
                <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm divide-y divide-border/60">
                  <button 
                    onClick={() => setMoreSubView('config')}
                    className="w-full flex justify-between items-center p-4 hover:bg-muted/10 transition text-left"
                  >
                    <div className="flex items-center gap-3">
                      <SettingsIcon size={18} className="text-primary" />
                      <span className="text-xs font-semibold text-foreground">Configuration Setting</span>
                    </div>
                    <ChevronRight size={16} className="text-muted-foreground" />
                  </button>
                  <button 
                    onClick={() => setMoreSubView('pc')}
                    className="w-full flex justify-between items-center p-4 hover:bg-muted/10 transition text-left"
                  >
                    <div className="flex items-center gap-3">
                      <Globe size={18} className="text-primary" />
                      <span className="text-xs font-semibold text-foreground">PC Manager Server</span>
                    </div>
                    <ChevronRight size={16} className="text-muted-foreground" />
                  </button>
                  <button 
                    onClick={() => setMoreSubView('backup')}
                    className="w-full flex justify-between items-center p-4 hover:bg-muted/10 transition text-left"
                  >
                    <div className="flex items-center gap-3">
                      <Download size={18} className="text-primary" />
                      <span className="text-xs font-semibold text-foreground">Backup & Restore</span>
                    </div>
                    <ChevronRight size={16} className="text-muted-foreground" />
                  </button>
                  <button 
                    onClick={() => setMoreSubView('help')}
                    className="w-full flex justify-between items-center p-4 hover:bg-muted/10 transition text-left"
                  >
                    <div className="flex items-center gap-3">
                      <HelpCircle size={18} className="text-primary" />
                      <span className="text-xs font-semibold text-foreground">Help Guide & Support</span>
                    </div>
                    <ChevronRight size={16} className="text-muted-foreground" />
                  </button>
                </div>

                <div className="bg-card border border-border rounded-xl p-4 text-center space-y-1.5 shadow-sm">
                  <span className="text-lg font-black tracking-tight text-foreground block">WealthIQ v0.1.0</span>
                  <p className="text-3xs text-muted-foreground">Mobile personal finance database client.</p>
                </div>
              </div>
            )}

            {/* Sub-view: CONFIGURATION */}
            {moreSubView === 'config' && (
              <div className="space-y-4 pt-2">
                <h3 className="text-3xs font-extrabold text-foreground tracking-wider uppercase px-1">Configuration Settings</h3>
                
                <div className="bg-card border border-border rounded-xl p-4 space-y-4 shadow-sm">
                  {/* Start Screen */}
                  <div className="space-y-1.5">
                    <label className="block text-3xs font-bold text-muted-foreground uppercase">Start Screen</label>
                    <select
                      value={config.startScreen}
                      onChange={(e) => updateConfig('startScreen', e.target.value)}
                      className="w-full text-xs bg-[#0b0f1a] border border-border rounded-lg px-3 py-2 text-foreground font-semibold outline-none"
                    >
                      <option value="daily">Daily Ledger</option>
                      <option value="calendar">Calendar View</option>
                      <option value="accounts">Accounts List</option>
                    </select>
                  </div>

                  {/* Main Currency */}
                  <div className="space-y-1.5">
                    <label className="block text-3xs font-bold text-muted-foreground uppercase">Main Currency</label>
                    <select
                      value={config.mainCurrency}
                      onChange={(e) => updateConfig('mainCurrency', e.target.value)}
                      className="w-full text-xs bg-[#0b0f1a] border border-border rounded-lg px-3 py-2 text-foreground font-semibold outline-none"
                    >
                      <option value="INR">INR (₹)</option>
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="GBP">GBP (£)</option>
                    </select>
                  </div>

                  {/* Monthly Start Date */}
                  <div className="space-y-1.5">
                    <label className="block text-3xs font-bold text-muted-foreground uppercase">Monthly Start Date</label>
                    <select
                      value={config.monthlyStartDate}
                      onChange={(e) => updateConfig('monthlyStartDate', parseInt(e.target.value, 10))}
                      className="w-full text-xs bg-[#0b0f1a] border border-border rounded-lg px-3 py-2 text-foreground font-semibold outline-none"
                    >
                      <option value={1}>1st of Month</option>
                      <option value={5}>5th of Month</option>
                      <option value={10}>10th of Month</option>
                      <option value={25}>25th of Month</option>
                    </select>
                  </div>

                  {/* Carry Over setting */}
                  <div className="space-y-1.5">
                    <label className="block text-3xs font-bold text-muted-foreground uppercase">Carry-over Setting</label>
                    <select
                      value={config.carryOver}
                      onChange={(e) => updateConfig('carryOver', e.target.value)}
                      className="w-full text-xs bg-[#0b0f1a] border border-border rounded-lg px-3 py-2 text-foreground font-semibold outline-none"
                    >
                      <option value="off">Off (Reset monthly)</option>
                      <option value="on">On (Carry balance forward)</option>
                    </select>
                  </div>

                </div>
              </div>
            )}

            {/* Sub-view: PC MANAGER */}
            {moreSubView === 'pc' && (
              <div className="space-y-4 pt-2">
                <PCManagerComponent />
              </div>
            )}

            {/* Sub-view: HELP GUIDE */}
            {moreSubView === 'help' && (
              <div className="space-y-4 pt-2 leading-relaxed">
                <h3 className="text-3xs font-extrabold text-foreground tracking-wider uppercase px-1">Help & Support</h3>
                <div className="bg-card border border-border rounded-xl p-4 space-y-4 shadow-sm text-xs text-muted-foreground">
                  <div className="space-y-1">
                    <p className="font-bold text-foreground">How do I add a transaction?</p>
                    <p>Tap the floating yellow "+" button in the bottom right corner of the screen on the Daily tab.</p>
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-foreground">How do I edit or delete records?</p>
                    <p>Go to the Daily or Calendar tab, click on any transaction item. It will open the editor sheet where you can save changes or delete.</p>
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-foreground">What is PC Manager?</p>
                    <p>PC Manager lets you connect a computer browser to your phone over local Wi-Fi to add, view, and back up transactions on a large screen.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Sub-view: BACKUP & RESTORE */}
            {moreSubView === 'backup' && (
              <div className="space-y-4 pt-2">
                <h3 className="text-3xs font-extrabold text-foreground tracking-wider uppercase px-1">Database Backup</h3>
                <div className="bg-card border border-border rounded-xl p-5 space-y-4 shadow-sm text-center">
                  <p className="text-3xs text-muted-foreground leading-relaxed">
                    Export a backup file of your local WealthIQ database containing all transaction history, accounts, and categories.
                  </p>
                  
                  <div className="space-y-2 pt-2">
                    {/* Export */}
                    <button
                      onClick={() => {
                        const backup: Record<string, string | null> = {};
                        for(let i=0; i<localStorage.length; i++){
                          const k = localStorage.key(i);
                          if(k && k.startsWith('wealthiq_')){
                            backup[k] = localStorage.getItem(k);
                          }
                        }
                        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `wealthiq-mobile-backup-${new Date().toISOString().slice(0, 10)}.json`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        toast.success('Backup file downloaded');
                      }}
                      className="w-full py-2 bg-primary text-primary-foreground font-semibold text-xs rounded-xl hover:opacity-90 transition flex items-center justify-center gap-1.5"
                    >
                      <Download size={14} />
                      Export Data (.json)
                    </button>
                    
                    {/* Import */}
                    <label className="w-full py-2 bg-card border border-border font-semibold text-xs rounded-xl hover:bg-muted/30 transition flex items-center justify-center gap-1.5 cursor-pointer">
                      <Upload size={14} />
                      Import Backup File
                      <input 
                        type="file" 
                        accept=".json" 
                        className="hidden" 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = (evt) => {
                            try {
                              const data = JSON.parse(evt.target?.result as string);
                              Object.entries(data).forEach(([k, v]) => {
                                if (k.startsWith('wealthiq_') && typeof v === 'string') {
                                  localStorage.setItem(k, v);
                                }
                              });
                              toast.success('Database restored successfully! Reloading...');
                              setTimeout(() => window.location.reload(), 1000);
                            } catch (err) {
                              toast.error('Invalid backup JSON file');
                            }
                          };
                          reader.readAsText(file);
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

      </main>

      {/* ================= FLOATING ACTION BUTTON ================= */}
      {activeTab === 'daily' && (
        <button
          onClick={openCreate}
          className="absolute bottom-24 right-4 w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition z-10"
        >
          <Plus size={24} />
        </button>
      )}

      {/* ================= BOTTOM TAB NAVIGATION ================= */}
      <nav className="absolute bottom-0 left-0 right-0 h-16 bg-card border-t border-border flex select-none z-10">
        <button 
          onClick={() => { setActiveTab('daily'); setSelectedCalendarDay(null); }}
          className={`flex-1 flex flex-col justify-center items-center gap-1 transition ${
            activeTab === 'daily' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <List size={18} />
          <span className="text-[10px] font-black uppercase">Daily</span>
        </button>
        <button 
          onClick={() => { setActiveTab('calendar'); setSelectedCalendarDay(null); }}
          className={`flex-1 flex flex-col justify-center items-center gap-1 transition ${
            activeTab === 'calendar' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <CalendarIcon size={18} />
          <span className="text-[10px] font-black uppercase">Calendar</span>
        </button>
        <button 
          onClick={() => { setActiveTab('accounts'); setSelectedCalendarDay(null); }}
          className={`flex-1 flex flex-col justify-center items-center gap-1 transition ${
            activeTab === 'accounts' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Wallet size={18} />
          <span className="text-[10px] font-black uppercase">Accounts</span>
        </button>
        <button 
          onClick={() => { setActiveTab('more'); setMoreSubView('menu'); }}
          className={`flex-1 flex flex-col justify-center items-center gap-1 transition ${
            activeTab === 'more' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Menu size={18} />
          <span className="text-[10px] font-black uppercase">More</span>
        </button>
      </nav>

      {/* ================= ADD/EDIT SLIDE-UP MODAL ================= */}
      {isAddModalOpen && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-end">
          <div className="w-full bg-card border-t border-border rounded-t-2xl max-h-[90%] overflow-y-auto flex flex-col animate-slide-up">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center px-4 py-3 border-b border-border">
              <h3 className="text-sm font-extrabold text-foreground">
                {editingTx ? 'Edit Transaction' : 'Add Transaction'}
              </h3>
              <div className="flex items-center gap-3">
                {editingTx && (
                  <button 
                    onClick={() => handleDelete(editingTx)}
                    className="p-1.5 text-negative hover:bg-muted/50 rounded-lg transition"
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
                <button 
                  onClick={() => setIsAddModalOpen(false)}
                  className="p-1 text-muted-foreground hover:text-foreground transition"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSave} className="p-4 space-y-4 text-xs font-semibold">
              
              {/* Type toggle */}
              <div className="space-y-1.5">
                <label className="block text-3xs font-bold text-muted-foreground uppercase">Type</label>
                <div className="flex bg-[#0b0f1a] border border-border p-0.5 rounded-xl">
                  {(['expense', 'income', 'transfer'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setFormType(t)}
                      className={`flex-1 py-1.5 text-center font-bold uppercase rounded-lg capitalize transition ${
                        formType === t 
                          ? 'bg-primary text-primary-foreground shadow-sm' 
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount & Date row */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-3xs font-bold text-muted-foreground uppercase">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    className="w-full bg-[#0b0f1a] border border-border rounded-lg px-3 py-2 text-foreground font-semibold outline-none"
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-3xs font-bold text-muted-foreground uppercase">Date & Time</label>
                  <input
                    type="datetime-local"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full bg-[#0b0f1a] border border-border rounded-lg px-3 py-2 text-foreground font-semibold outline-none"
                  />
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="block text-3xs font-bold text-muted-foreground uppercase">Description</label>
                <input
                  type="text"
                  required
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full bg-[#0b0f1a] border border-border rounded-lg px-3 py-2 text-foreground font-semibold outline-none"
                  placeholder="Swiggy, Salary, etc."
                />
              </div>

              {/* Source Account & Destination Account (if transfer) */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-3xs font-bold text-muted-foreground uppercase">
                    {formType === 'transfer' ? 'From Account' : 'Account'}
                  </label>
                  <select
                    value={formAccount}
                    onChange={(e) => setFormAccount(e.target.value)}
                    className="w-full bg-[#0b0f1a] border border-border rounded-lg px-3 py-2 text-foreground font-semibold outline-none"
                  >
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name}
                      </option>
                    ))}
                  </select>
                </div>
                {formType === 'transfer' && (
                  <div className="space-y-1.5">
                    <label className="block text-3xs font-bold text-muted-foreground uppercase">To Account</label>
                    <select
                      value={formToAccount}
                      onChange={(e) => setFormToAccount(e.target.value)}
                      required
                      className="w-full bg-[#0b0f1a] border border-border rounded-lg px-3 py-2 text-foreground font-semibold outline-none"
                    >
                      <option value="">Select Account</option>
                      {accounts.filter(a => a.id !== formAccount).map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Category & Subcategory (Only if not transfer) */}
              {formType !== 'transfer' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-3xs font-bold text-muted-foreground uppercase">Category</label>
                    <select
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value)}
                      className="w-full bg-[#0b0f1a] border border-border rounded-lg px-3 py-2 text-foreground font-semibold outline-none"
                    >
                      {activeCategories.map(cat => (
                        <option key={cat.id} value={cat.name}>
                          {cat.icon || '📦'} {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-3xs font-bold text-muted-foreground uppercase">Subcategory</label>
                    <select
                      value={formSubcategory}
                      onChange={(e) => setFormSubcategory(e.target.value)}
                      className="w-full bg-[#0b0f1a] border border-border rounded-lg px-3 py-2 text-foreground font-semibold outline-none"
                    >
                      <option value="">None</option>
                      {activeSubcategories.map(sub => (
                        <option key={sub} value={sub}>
                          {sub}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="block text-3xs font-bold text-muted-foreground uppercase">Notes (Optional)</label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-[#0b0f1a] border border-border rounded-lg px-3 py-2 text-foreground font-semibold outline-none resize-none"
                  placeholder="Add extra details..."
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 py-2.5 bg-card border border-border font-extrabold text-xs rounded-xl hover:bg-muted/20 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-primary text-primary-foreground font-extrabold text-xs rounded-xl hover:opacity-90 transition"
                >
                  {editingTx ? 'Save Changes' : 'Add Record'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
