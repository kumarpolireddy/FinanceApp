'use client';

import React, { useState, useEffect, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { toast } from 'sonner';
import {
  CalendarDays,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  Landmark,
  Wifi,
  Zap,
  Droplet,
  Smartphone,
  Shield,
  RefreshCcw,
  TrendingUp,
  Receipt,
  RotateCcw,
  Trash2,
  Edit2,
  X,
  ChevronLeft,
  ChevronRight,
  Filter,
  DollarSign,
  Wallet,
  Bell,
  Settings,
  History,
  Check,
  Calendar as CalendarIcon,
} from 'lucide-react';
import {
  BillPaymentReminder,
  BillPaymentHistoryEntry,
  BillSettings,
  BillType,
  BillRecurrence,
  BillStatus,
  getStoredBills,
  saveStoredBills,
  addBill,
  updateBill,
  deleteBill,
  getBillHistory,
  getBillSettings,
  saveBillSettings,
  markBillAsPaid,
  skipBillOccurrence,
  snoozeBillReminder,
  clearAllBills,
} from '@/lib/billStorage';
import { scheduleBillNotifications, cancelBillNotifications, requestLocalNotificationPermissions } from '@/lib/billNotification';
import { getAccounts, getCategories, calculateCreditCardBalances } from '@/lib/storage';

export default function BillsPage() {
  const [bills, setBills] = useState<BillPaymentReminder[]>([]);
  const [history, setHistory] = useState<BillPaymentHistoryEntry[]>([]);
  const [settings, setSettings] = useState<BillSettings>(getBillSettings());
  const [accounts, setAccounts] = useState<any[]>([]);

  // Navigation Sub-Views
  const [activeTab, setActiveTab] = useState<'bills' | 'calendar' | 'history' | 'settings'>('bills');
  const [statusFilter, setStatusFilter] = useState<'all' | 'overdue' | 'due_today' | 'due_soon' | 'upcoming' | 'paid'>('all');
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'all' | 'Credit Card' | 'EMI / Loan' | 'other'>('all');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingBill, setEditingBill] = useState<BillPaymentReminder | null>(null);

  // Mark as Paid Modal State
  const [payingBill, setPayingBill] = useState<BillPaymentReminder | null>(null);
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [paidAccountId, setPaidAccountId] = useState<string>('');
  const [paidDate, setPaidDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paidNotes, setPaidNotes] = useState<string>('');

  // Snooze Modal State
  const [snoozingBill, setSnoozingBill] = useState<BillPaymentReminder | null>(null);

  // Edit Amount Modal State (For Credit Cards)
  const [editingAmountBill, setEditingAmountBill] = useState<BillPaymentReminder | null>(null);
  const [newAmountVal, setNewAmountVal] = useState<number>(0);

  // Calendar State
  const [currentCalendarMonth, setCurrentCalendarMonth] = useState<Date>(new Date());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState<{
    name: string;
    type: BillType;
    amount: number;
    amountType: 'fixed' | 'variable';
    minimumDue: number;
    dueDate: string;
    dueTime: string;
    accountId: string;
    categoryId: string;
    recurrence: BillRecurrence;
    notes: string;
    reminderSchedule: {
      sevenDaysBefore: boolean;
      threeDaysBefore: boolean;
      oneDayBefore: boolean;
      onDueDate: boolean;
    };
  }>({
    name: '',
    type: 'Credit Card',
    amount: 0,
    amountType: 'fixed',
    minimumDue: 0,
    dueDate: new Date().toISOString().split('T')[0],
    dueTime: '09:00',
    accountId: '',
    categoryId: '',
    recurrence: 'monthly',
    notes: '',
    reminderSchedule: {
      sevenDaysBefore: true,
      threeDaysBefore: true,
      oneDayBefore: true,
      onDueDate: true,
    },
  });

  const loadAllData = () => {
    const loadedBills = getStoredBills();
    setBills(loadedBills);
    setHistory(getBillHistory());
    setSettings(getBillSettings());
    const accs = getAccounts();
    setAccounts(accs);
  };

  useEffect(() => {
    loadAllData();
    const handleUpdate = () => loadAllData();
    window.addEventListener('wealthiq_bills_updated', handleUpdate);
    return () => window.removeEventListener('wealthiq_bills_updated', handleUpdate);
  }, []);

  // Summary Metrics
  const summaryMetrics = useMemo(() => {
    const activeUnpaid = bills.filter(
      (b) => b.status !== 'paid' && b.status !== 'skipped' && !(b.type === 'Credit Card' && Number(b.amount || 0) <= 0)
    );
    const todayStr = new Date().toISOString().split('T')[0];

    const d7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
    const d30 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

    const overdueTotal = activeUnpaid
      .filter((b) => b.status === 'overdue')
      .reduce((sum, b) => sum + (Number(b.amount) || 0), 0);

    const dueTodayTotal = activeUnpaid
      .filter((b) => b.dueDate === todayStr)
      .reduce((sum, b) => sum + (Number(b.amount) || 0), 0);

    const next7DaysTotal = activeUnpaid
      .filter((b) => b.dueDate >= todayStr && b.dueDate <= d7)
      .reduce((sum, b) => sum + (Number(b.amount) || 0), 0);

    const next30DaysTotal = activeUnpaid
      .filter((b) => b.dueDate >= todayStr && b.dueDate <= d30)
      .reduce((sum, b) => sum + (Number(b.amount) || 0), 0);

    return { overdueTotal, dueTodayTotal, next7DaysTotal, next30DaysTotal };
  }, [bills]);

  // Active Upcoming Bills for Main List (excludes paid & skipped)
  const filteredBills = useMemo(() => {
    return bills
      .filter(
        (b) => b.status !== 'paid' && b.status !== 'skipped' && !(b.type === 'Credit Card' && Number(b.amount || 0) <= 0)
      )
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [bills]);

  // Payment History Filtered List
  const filteredHistory = useMemo(() => {
    if (historyTypeFilter === 'all') return history;
    if (historyTypeFilter === 'other') {
      return history.filter((h) => h.type !== 'Credit Card' && h.type !== 'EMI / Loan');
    }
    return history.filter((h) => h.type === historyTypeFilter);
  }, [history, historyTypeFilter]);

  // Calendar calculations
  const calendarDays = useMemo(() => {
    const year = currentCalendarMonth.getFullYear();
    const month = currentCalendarMonth.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();

    const daysArr: { dateStr: string; dayNum: number; isCurrentMonth: boolean; bills: BillPaymentReminder[] }[] = [];

    for (let i = 0; i < firstDayIndex; i++) {
      daysArr.push({ dateStr: '', dayNum: 0, isCurrentMonth: false, bills: [] });
    }

    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayBills = bills.filter((b) => b.dueDate === dateStr);
      daysArr.push({ dateStr, dayNum: day, isCurrentMonth: true, bills: dayBills });
    }

    return daysArr;
  }, [currentCalendarMonth, bills]);

  const handleOpenAddModal = () => {
    setEditingBill(null);
    setFormData({
      name: '',
      type: 'Credit Card',
      amount: 0,
      amountType: 'fixed',
      minimumDue: 0,
      dueDate: new Date().toISOString().split('T')[0],
      dueTime: settings.defaultReminderTime || '09:00',
      accountId: accounts[0]?.id || '',
      categoryId: '',
      recurrence: 'monthly',
      notes: '',
      reminderSchedule: { ...settings.defaultReminders },
    });
    setShowAddModal(true);
  };

  const handleOpenEditModal = (bill: BillPaymentReminder) => {
    setEditingBill(bill);
    setFormData({
      name: bill.name,
      type: bill.type,
      amount: bill.amount,
      amountType: bill.amountType,
      minimumDue: bill.minimumDue || 0,
      dueDate: bill.dueDate,
      dueTime: bill.dueTime || '09:00',
      accountId: bill.accountId || '',
      categoryId: bill.categoryId || '',
      recurrence: bill.recurrence,
      notes: bill.notes || '',
      reminderSchedule: { ...bill.reminderSchedule },
    });
    setShowAddModal(true);
  };

  const handleSaveBill = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    if (editingBill) {
      const updated = updateBill(editingBill.id, {
        name: formData.name,
        type: formData.type,
        amount: Number(formData.amount),
        amountType: formData.amountType,
        minimumDue: Number(formData.minimumDue),
        dueDate: formData.dueDate,
        dueTime: formData.dueTime,
        accountId: formData.accountId,
        categoryId: formData.categoryId,
        recurrence: formData.recurrence,
        notes: formData.notes,
        reminderSchedule: formData.reminderSchedule,
      });
      if (updated) scheduleBillNotifications(updated);
    } else {
      const created = addBill({
        name: formData.name,
        type: formData.type,
        amount: Number(formData.amount),
        amountType: formData.amountType,
        minimumDue: Number(formData.minimumDue),
        dueDate: formData.dueDate,
        dueTime: formData.dueTime,
        accountId: formData.accountId,
        categoryId: formData.categoryId,
        recurrence: formData.recurrence,
        notes: formData.notes,
        reminderSchedule: formData.reminderSchedule,
      });
      scheduleBillNotifications(created);
    }

    setShowAddModal(false);
    loadAllData();
  };

  const handleDeleteBill = (id: string) => {
    if (confirm('Are you sure you want to delete this payment reminder?')) {
      cancelBillNotifications(id);
      deleteBill(id);
      loadAllData();
    }
  };

  const handleOpenMarkPaid = (bill: BillPaymentReminder) => {
    setPayingBill(bill);
    setPaidAmount(bill.amount);
    setPaidAccountId(bill.accountId || accounts[0]?.id || 'acc-cash');
    setPaidDate(new Date().toISOString().split('T')[0]);
    setPaidNotes('');
  };

  const handleConfirmMarkPaid = () => {
    if (!payingBill) return;
    try {
      markBillAsPaid({
        billId: payingBill.id,
        amount: paidAmount,
        accountId: paidAccountId,
        paymentDate: paidDate,
        notes: paidNotes,
      });
      cancelBillNotifications(payingBill.id);
      setPayingBill(null);
      loadAllData();
    } catch (err: any) {
      alert(err?.message || 'Error marking payment as paid');
    }
  };

  const handleSkipBill = (billId: string) => {
    if (confirm('Skip this occurrence? The next occurrence will automatically be scheduled.')) {
      skipBillOccurrence(billId);
      loadAllData();
    }
  };

  const handleSnoozeBill = (billId: string, days: number) => {
    snoozeBillReminder(billId, days);
    setSnoozingBill(null);
    loadAllData();
  };

  const handleSaveEditAmount = () => {
    if (editingAmountBill) {
      updateBill(editingAmountBill.id, { amount: newAmountVal });
      setEditingAmountBill(null);
      loadAllData();
    }
  };

  const getBillIcon = (type: BillType) => {
    switch (type) {
      case 'Credit Card':
        return <CreditCard className="w-5 h-5 text-amber-400" />;
      case 'EMI / Loan':
        return <Landmark className="w-5 h-5 text-blue-400" />;
      case 'Rent':
        return <Receipt className="w-5 h-5 text-emerald-400" />;
      case 'Electricity':
        return <Zap className="w-5 h-5 text-yellow-400" />;
      case 'Water':
        return <Droplet className="w-5 h-5 text-sky-400" />;
      case 'Internet':
        return <Wifi className="w-5 h-5 text-purple-400" />;
      case 'Mobile':
        return <Smartphone className="w-5 h-5 text-pink-400" />;
      case 'Insurance':
        return <Shield className="w-5 h-5 text-teal-400" />;
      case 'Subscription':
        return <RefreshCcw className="w-5 h-5 text-indigo-400" />;
      case 'SIP / Investment':
        return <TrendingUp className="w-5 h-5 text-emerald-300" />;
      default:
        return <CalendarDays className="w-5 h-5 text-slate-400" />;
    }
  };

  const getStatusBadge = (bill: BillPaymentReminder) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const today = new Date(todayStr + 'T00:00:00');
    const due = new Date((bill.dueDate || '') + 'T00:00:00');
    const diffDays = !isNaN(due.getTime())
      ? Math.round((due.getTime() - today.getTime()) / (1000 * 3600 * 24))
      : null;

    switch (bill.status) {
      case 'overdue':
        return (
          <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/25">
            {diffDays !== null ? `${Math.abs(diffDays)}d Overdue` : 'Overdue'}
          </span>
        );
      case 'due_today':
        return (
          <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/25 animate-pulse">
            Due Today
          </span>
        );
      case 'due_soon':
      case 'upcoming':
        return (
          <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
            {diffDays !== null && diffDays > 0 ? `${diffDays}d left` : 'Upcoming'}
          </span>
        );
      case 'paid':
        return <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">Paid</span>;
      case 'skipped':
        return <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">Skipped</span>;
      default:
        return null;
    }
  };

  const formatDueDateDisplay = (dateStr: string) => {
    if (!dateStr) return null;
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return <span className="font-medium text-slate-200">{dateStr}</span>;

    const formattedDate = d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    return (
      <span className="font-mono font-medium text-slate-200 text-xs">
        {formattedDate}
      </span>
    );
  };

  return (
    <AppLayout>
      <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Header Banner */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-950 p-6 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden">
          <div className="space-y-1 z-10">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-inner">
                <Receipt className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                  Bills & Payment Reminders
                </h1>
                <p className="text-xs sm:text-sm text-slate-400">
                  Track recurring bills, EMI installments, credit card dues & offline device notifications.
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={handleOpenAddModal}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all transform active:scale-95 z-10"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            Add Payment Reminder
          </button>
        </div>

        {/* 1. Summary Metrics - Single Row of 3 Cards */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <div className="p-3 sm:p-4 rounded-2xl bg-slate-900/60 border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-3">
            <div>
              <p className="text-3xs sm:text-2xs font-bold text-slate-400 uppercase tracking-wider truncate">Next 7 Days</p>
              <p className="text-base sm:text-xl font-mono font-bold text-white mt-0.5">
                ₹{summaryMetrics.next7DaysTotal.toLocaleString('en-IN')}
              </p>
            </div>
            <div className="hidden sm:block p-2 rounded-xl bg-sky-500/10 text-sky-400 shrink-0">
              <CalendarDays className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>

          <div className="p-3 sm:p-4 rounded-2xl bg-slate-900/60 border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-3">
            <div>
              <p className="text-3xs sm:text-2xs font-bold text-slate-400 uppercase tracking-wider truncate">Overdue</p>
              <p className="text-base sm:text-xl font-mono font-bold text-red-400 mt-0.5">
                ₹{summaryMetrics.overdueTotal.toLocaleString('en-IN')}
              </p>
            </div>
            <div className="hidden sm:block p-2 rounded-xl bg-red-500/10 text-red-400 shrink-0">
              <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>

          <div className="p-3 sm:p-4 rounded-2xl bg-slate-900/60 border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-3">
            <div>
              <p className="text-3xs sm:text-2xs font-bold text-slate-400 uppercase tracking-wider truncate">Due Today</p>
              <p className="text-base sm:text-xl font-mono font-bold text-amber-400 mt-0.5">
                ₹{summaryMetrics.dueTodayTotal.toLocaleString('en-IN')}
              </p>
            </div>
            <div className="hidden sm:block p-2 rounded-xl bg-amber-500/10 text-amber-400 shrink-0">
              <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-white/10 space-x-2 sm:space-x-6 overflow-x-auto pb-1">
          {[
            { id: 'bills', label: 'Upcoming Bills', icon: Receipt, count: bills.length },
            { id: 'calendar', label: 'Calendar View', icon: CalendarIcon },
            { id: 'history', label: 'Payment History', icon: History, count: history.length },
            { id: 'settings', label: 'Settings', icon: Settings },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 py-3 px-4 rounded-xl font-semibold text-sm transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-400 border-b-2 border-emerald-400 shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {tab.count !== undefined && (
                  <span className={`px-2 py-0.5 rounded-full text-2xs font-bold ${
                    isActive ? 'bg-emerald-500 text-slate-950' : 'bg-white/10 text-slate-300'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* TAB 1: UPCOMING BILLS */}
        {activeTab === 'bills' && (
          <div className="space-y-4">
            {filteredBills.length === 0 ? (
              <div className="p-12 text-center rounded-3xl bg-slate-900/40 border border-white/5 text-slate-400 text-sm">
                No upcoming bill payment reminders found.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredBills.map((bill) => (
                  <div
                    key={bill.id}
                    className="p-5 rounded-2xl bg-slate-900/60 hover:bg-slate-900 transition-all flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-3">
                      {/* Top Bar: Icon, Name & Status Badge */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 rounded-xl bg-slate-800 text-slate-300 border border-slate-700/60">
                            {getBillIcon(bill.type)}
                          </div>
                          <div>
                            <h3 className="text-base font-bold text-white leading-tight">{bill.name}</h3>
                            <span className="text-xs text-slate-400 capitalize">{bill.type}</span>
                          </div>
                        </div>
                        {getStatusBadge(bill)}
                      </div>

                      {/* 1. CREDIT CARD CARD - FLAT (NO INNER BOXES) */}
                      {bill.type === 'Credit Card' ? (
                        <div className="py-2 space-y-2">
                          <div className="flex items-baseline justify-between">
                            <span className="text-xs text-slate-400 font-medium">Due</span>
                            <span className="text-2xl font-mono font-bold text-white">
                              ₹{bill.amount.toLocaleString('en-IN')}
                            </span>
                          </div>

                          {(() => {
                            const linkedAcc = accounts.find((a) => a.id === bill.linkedAccountId || a.id === bill.accountId);
                            const payAcc = accounts.find((a) => a.id === bill.accountId);
                            const stmtDay = linkedAcc?.billingCycle || bill.dayOfMonth || '4';

                            return (
                              <div className="space-y-1.5 pt-2 border-t border-white/5 text-xs text-slate-300">
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Billing Date:</span>
                                  <span className="font-medium text-slate-200">{stmtDay}th of month</span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-slate-400">Due Date:</span>
                                  {formatDueDateDisplay(bill.dueDate)}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      ) : bill.type === 'EMI / Loan' ? (
                        /* 2. EMI / LOAN CARD - FLAT (NO INNER BOXES) */
                        <div className="py-2 space-y-2">
                          <div className="flex items-baseline justify-between">
                            <span className="text-xs text-slate-400 font-medium">EMI Installment</span>
                            <span className="text-2xl font-mono font-bold text-white">
                              ₹{bill.amount.toLocaleString('en-IN')}
                            </span>
                          </div>

                          {(() => {
                            const loanAcc = accounts.find((a) => a.id === bill.linkedLoanId || a.id === bill.accountId);
                            const outstanding = loanAcc ? Math.max(0, (loanAcc.originalAmount || 0) - (loanAcc.totalPrincipalRepaid || 0)) : undefined;

                            return (
                              <div className="space-y-1.5 pt-2 border-t border-white/5 text-xs text-slate-300">
                                <div className="flex justify-between items-center">
                                  <span className="text-slate-400">EMI Due Date:</span>
                                  {formatDueDateDisplay(bill.dueDate)}
                                </div>
                                {outstanding !== undefined && (
                                  <div className="flex justify-between">
                                    <span className="text-slate-400">Outstanding:</span>
                                    <span className="font-mono font-medium text-slate-200">₹{outstanding.toLocaleString('en-IN')}</span>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      ) : (
                        /* 3. STANDARD BILL CARD - FLAT (NO INNER BOXES) */
                        <div className="py-2 space-y-2">
                          <div className="flex items-baseline justify-between">
                            <span className="text-xs text-slate-400 font-medium">Amount</span>
                            <span className="text-2xl font-mono font-bold text-white">
                              ₹{bill.amount.toLocaleString('en-IN')}
                            </span>
                          </div>

                          <div className="space-y-1.5 pt-2 border-t border-white/5 text-xs text-slate-300">
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400">Due Date:</span>
                              {formatDueDateDisplay(bill.dueDate)}
                            </div>
                          </div>
                        </div>
                      )}

                      {bill.notes && bill.type !== 'EMI / Loan' && (
                        <p className="text-xs text-slate-400 line-clamp-2 italic">{bill.notes}</p>
                      )}
                    </div>

                    {/* Footer Actions - Clean Minimal Controls */}
                    <div className="pt-3 border-t border-white/5 flex items-center justify-between text-2xs text-slate-400">
                      <span className="capitalize text-slate-400">
                        {bill.status === 'paid' ? '✓ Paid' : `Status: ${bill.status}`}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleOpenEditModal(bill)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                          title="Edit Bill"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteBill(bill.id)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition"
                          title="Delete Bill"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: CALENDAR VIEW */}
        {activeTab === 'calendar' && (
          <div className="space-y-4">
            {/* Calendar Header Controls */}
            <div className="flex items-center justify-between bg-card p-3 sm:p-4 rounded-xl border border-border/60">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const d = new Date(currentCalendarMonth);
                    d.setMonth(d.getMonth() - 1);
                    setCurrentCalendarMonth(d);
                  }}
                  className="p-1.5 rounded-lg bg-secondary hover:bg-muted/60 text-muted-foreground hover:text-foreground transition"
                  title="Previous Month"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <h2 className="text-sm sm:text-base font-bold text-foreground">
                  {currentCalendarMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' })}
                </h2>
                <button
                  onClick={() => {
                    const d = new Date(currentCalendarMonth);
                    d.setMonth(d.getMonth() + 1);
                    setCurrentCalendarMonth(d);
                  }}
                  className="p-1.5 rounded-lg bg-secondary hover:bg-muted/60 text-muted-foreground hover:text-foreground transition"
                  title="Next Month"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <button
                onClick={() => {
                  setCurrentCalendarMonth(new Date());
                  setSelectedCalendarDate(new Date().toISOString().slice(0, 10));
                }}
                className="px-2.5 py-1 rounded-md text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 transition"
              >
                Today
              </button>
            </div>

            {/* Calendar Grid Container */}
            <div className="bg-card rounded-xl p-3 sm:p-4 border border-border/60 space-y-3">
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-muted-foreground uppercase pb-2 border-b border-border/40">
                <span>Sun</span>
                <span>Mon</span>
                <span>Tue</span>
                <span>Wed</span>
                <span>Thu</span>
                <span>Fri</span>
                <span>Sat</span>
              </div>

              <div className="grid grid-cols-7 gap-1.5">
                {calendarDays.map((cell, idx) => {
                  if (!cell.isCurrentMonth) {
                    return <div key={`empty-${idx}`} className="h-16 sm:h-20 rounded-lg bg-muted/10 border border-transparent" />;
                  }

                  const todayStr = new Date().toISOString().slice(0, 10);
                  const isToday = cell.dateStr === todayStr;
                  const isSelected = selectedCalendarDate === cell.dateStr;
                  const hasBills = cell.bills.length > 0;
                  const dayTotal = cell.bills.reduce((s, b) => s + (Number(b.amount) || 0), 0);

                  return (
                    <div
                      key={cell.dateStr}
                      onClick={() => hasBills && setSelectedCalendarDate(cell.dateStr)}
                      className={`h-16 sm:h-20 p-1.5 rounded-lg border flex flex-col justify-between transition-all cursor-pointer ${
                        isSelected
                          ? 'border-primary bg-primary/10 shadow-sm'
                          : isToday
                          ? 'border-primary/50 bg-secondary/80'
                          : hasBills
                          ? 'border-border/80 bg-secondary/40 hover:border-primary/40'
                          : 'border-border/30 bg-background/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-xs font-extrabold ${
                            isToday
                              ? 'w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[11px]'
                              : 'text-foreground'
                          }`}
                        >
                          {cell.dayNum}
                        </span>
                        {hasBills && (
                          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                        )}
                      </div>

                      {hasBills && (
                        <div className="space-y-0.5 min-w-0">
                          <span className="text-[10px] font-bold text-primary block truncate">
                            {cell.bills.length} Bill{cell.bills.length > 1 ? 's' : ''}
                          </span>
                          <span className="text-[10px] font-mono font-bold text-foreground block truncate">
                            ₹{dayTotal > 9999 ? `${(dayTotal / 1000).toFixed(0)}k` : dayTotal.toLocaleString('en-IN')}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Selected Date Bills Details */}
            {selectedCalendarDate && (
              <div className="p-4 rounded-xl bg-card border border-primary/30 space-y-3 animate-fade-in">
                <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                    <CalendarDays className="w-4 h-4 text-primary" />
                    Payments Due on {selectedCalendarDate}
                  </h3>
                  <button
                    onClick={() => setSelectedCalendarDate(null)}
                    className="text-xs font-bold text-muted-foreground hover:text-foreground transition"
                  >
                    Close
                  </button>
                </div>

                <div className="space-y-2">
                  {bills
                    .filter((b) => b.dueDate === selectedCalendarDate)
                    .map((b) => (
                      <div
                        key={b.id}
                        className="p-3 rounded-lg bg-secondary/60 border border-border/40 flex items-center justify-between text-xs"
                      >
                        <div className="space-y-0.5">
                          <h4 className="font-bold text-foreground text-sm">{b.name}</h4>
                          <p className="text-2xs text-muted-foreground font-medium">
                            {b.type} • Due {b.dueTime || '09:00'}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-mono font-bold text-foreground">
                            ₹{b.amount.toLocaleString('en-IN')}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}



        {/* TAB 4: PAYMENT HISTORY */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-4 rounded-2xl border border-white/5">
              <div>
                <h3 className="text-base font-bold text-white">Payment History Log</h3>
                <p className="text-2xs text-slate-400">All completed EMI payments, credit card statement dues, and bill payments</p>
              </div>

              {/* Filter pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'Credit Card', label: 'Credit Cards' },
                  { id: 'EMI / Loan', label: 'EMIs & Loans' },
                  { id: 'other', label: 'Other Bills' },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setHistoryTypeFilter(f.id as any)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                      historyTypeFilter === f.id
                        ? 'bg-emerald-500 text-slate-950 font-bold'
                        : 'bg-white/5 text-slate-400 hover:text-white'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredHistory.length === 0 ? (
              <div className="p-12 text-center rounded-3xl bg-slate-900/40 border border-white/5 text-slate-400 text-sm">
                No payment history entries found for the selected filter.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-900/60">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white/5 text-slate-400 font-semibold border-b border-white/10">
                    <tr>
                      <th className="p-3.5">Payment Name</th>
                      <th className="p-3.5">Type</th>
                      <th className="p-3.5">Amount</th>
                      <th className="p-3.5">Payment Date</th>
                      <th className="p-3.5">Verification</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-200">
                    {filteredHistory.map((h) => (
                      <tr key={h.id} className="hover:bg-white/5 transition-colors">
                        <td className="p-3.5 font-bold text-white flex items-center gap-2.5">
                          <div className="p-1.5 rounded-lg bg-white/5 text-emerald-400 shrink-0">
                            {getBillIcon(h.type)}
                          </div>
                          <div>
                            <span className="block font-bold text-white text-xs">{h.billName}</span>
                            {h.notes && <span className="block text-3xs text-slate-400 font-normal">{h.notes}</span>}
                          </div>
                        </td>
                        <td className="p-3.5">
                          <span className="px-2.5 py-0.5 rounded-md text-2xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                            {h.type}
                          </span>
                        </td>
                        <td className="p-3.5 font-mono font-bold text-white text-sm">₹{h.amount.toLocaleString('en-IN')}</td>
                        <td className="p-3.5 font-mono text-slate-300">{h.paidDate}</td>
                        <td className="p-3.5">
                          <span className="px-2.5 py-1 rounded-md text-2xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                            ✓ Paid
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 5: SETTINGS */}
        {activeTab === 'settings' && (
          <div className="max-w-2xl space-y-6 py-2">
            <div className="border-b border-border/40 pb-3">
              <h3 className="text-base font-bold text-foreground">
                Reminder Preferences
              </h3>
            </div>

            {/* Auto Reminders Section - Clean Flat Layout */}
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <span className="text-base">🔔</span>
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Auto Reminders
                </h4>
              </div>

              {/* Credit Card Dues */}
              <div className="py-3 border-b border-border/30 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5 min-w-0">
                    <span className="text-sm font-semibold text-foreground block">
                      Credit Card Statement Dues
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={settings.creditCardReminders?.enabled ?? true}
                      onChange={(e) => {
                        const updated = {
                          ...settings,
                          creditCardReminders: {
                            ...settings.creditCardReminders,
                            enabled: e.target.checked,
                          },
                        };
                        setSettings(updated);
                        saveBillSettings(updated);
                        toast.success(`Credit card auto-reminders ${e.target.checked ? 'enabled' : 'disabled'}`);
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>

                {(settings.creditCardReminders?.enabled ?? true) && (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <span className="text-xs text-muted-foreground font-medium">
                      Notify days in advance:
                    </span>
                    <div className="flex items-center gap-1.5">
                      {[1, 3, 5, 7, 10, 15].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => {
                            const updated = {
                              ...settings,
                              creditCardReminders: {
                                ...settings.creditCardReminders,
                                daysBefore: d,
                              },
                            };
                            setSettings(updated);
                            saveBillSettings(updated);
                            toast.success(`Credit Card reminder set to ${d} days before due date`);
                          }}
                          className={`px-2.5 py-1 text-xs font-bold rounded-md transition ${
                            (settings.creditCardReminders?.daysBefore ?? 5) === d
                              ? 'bg-primary text-primary-foreground shadow-sm'
                              : 'bg-secondary text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {d}d
                        </button>
                      ))}
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={settings.creditCardReminders?.daysBefore ?? 5}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10) || 1;
                          const updated = {
                            ...settings,
                            creditCardReminders: {
                              ...settings.creditCardReminders,
                              daysBefore: val,
                            },
                          };
                          setSettings(updated);
                          saveBillSettings(updated);
                        }}
                        className="w-14 px-2 py-1 text-xs font-mono font-bold bg-background border border-border rounded-md text-foreground text-center focus:outline-none focus:border-primary"
                        title="Custom days"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* EMI / Loan Dues */}
              <div className="py-3 border-b border-border/30 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5 min-w-0">
                    <span className="text-sm font-semibold text-foreground block">
                      EMI & Loan Installment Dues
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={settings.emiReminders?.enabled ?? true}
                      onChange={(e) => {
                        const updated = {
                          ...settings,
                          emiReminders: {
                            ...settings.emiReminders,
                            enabled: e.target.checked,
                          },
                        };
                        setSettings(updated);
                        saveBillSettings(updated);
                        toast.success(`EMI auto-reminders ${e.target.checked ? 'enabled' : 'disabled'}`);
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>

                {(settings.emiReminders?.enabled ?? true) && (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <span className="text-xs text-muted-foreground font-medium">
                      Notify days in advance:
                    </span>
                    <div className="flex items-center gap-1.5">
                      {[1, 3, 5, 7, 10, 15].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => {
                            const updated = {
                              ...settings,
                              emiReminders: {
                                ...settings.emiReminders,
                                daysBefore: d,
                              },
                            };
                            setSettings(updated);
                            saveBillSettings(updated);
                            toast.success(`EMI reminder set to ${d} days before due date`);
                          }}
                          className={`px-2.5 py-1 text-xs font-bold rounded-md transition ${
                            (settings.emiReminders?.daysBefore ?? 5) === d
                              ? 'bg-primary text-primary-foreground shadow-sm'
                              : 'bg-secondary text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {d}d
                        </button>
                      ))}
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={settings.emiReminders?.daysBefore ?? 5}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10) || 1;
                          const updated = {
                            ...settings,
                            emiReminders: {
                              ...settings.emiReminders,
                              daysBefore: val,
                            },
                          };
                          setSettings(updated);
                          saveBillSettings(updated);
                        }}
                        className="w-14 px-2 py-1 text-xs font-mono font-bold bg-background border border-border rounded-md text-foreground text-center focus:outline-none focus:border-primary"
                        title="Custom days"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Notification Time & System Options */}
            <div className="space-y-4 pt-2">
              <div className="flex flex-wrap items-center justify-between gap-3 py-2 border-b border-border/30">
                <div>
                  <span className="text-sm font-semibold text-foreground block">Notification Time</span>
                </div>
                <input
                  type="time"
                  value={settings.defaultReminderTime}
                  onChange={(e) => {
                    const updated = { ...settings, defaultReminderTime: e.target.value };
                    setSettings(updated);
                    saveBillSettings(updated);
                  }}
                  className="px-3 py-1.5 rounded-md bg-secondary border border-border text-foreground font-mono text-sm focus:outline-none focus:border-primary"
                />
              </div>

              <div className="pt-3 flex flex-wrap items-center justify-between gap-3">
                <button
                  onClick={async () => {
                    const granted = await requestLocalNotificationPermissions();
                    if (granted) toast.success('Device notification permission granted!');
                    else toast.error('Notification permission denied by system.');
                  }}
                  className="px-3.5 py-2 rounded-md bg-primary/10 hover:bg-primary/20 text-primary font-bold text-xs border border-primary/20 transition"
                >
                  Request Notification Permission
                </button>

                <button
                  onClick={() => {
                    if (confirm('Permanently clear all custom bills and reset data?')) {
                      clearAllBills();
                      loadAllData();
                    }
                  }}
                  className="px-3.5 py-2 rounded-md bg-negative/10 hover:bg-negative/20 text-negative font-bold text-xs border border-negative/20 transition"
                >
                  Reset Reminders
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: ADD / EDIT PAYMENT REMINDER */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl bg-slate-900 border border-white/15 p-6 sm:p-8 shadow-2xl space-y-6 text-white">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <h2 className="text-xl font-bold">
                  {editingBill ? 'Edit Payment Reminder' : 'Add Payment Reminder'}
                </h2>
                <button onClick={() => setShowAddModal(false)} className="p-1.5 rounded-full hover:bg-white/10 text-slate-400">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveBill} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Payment Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-white text-sm focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Amount (₹)</label>
                    <input
                      type="number"
                      value={formData.amount || ''}
                      onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })}
                      required
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-emerald-400 font-mono text-sm focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Payment Type</label>
                    <select
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value as BillType })}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-white text-xs focus:outline-none"
                    >
                      {[
                        'Credit Card',
                        'EMI / Loan',
                        'Rent',
                        'Electricity',
                        'Water',
                        'Internet',
                        'Mobile',
                        'Insurance',
                        'Subscription',
                        'SIP / Investment',
                        'Other',
                      ].map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {formData.type === 'Credit Card' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Minimum Due Amount (₹)</label>
                      <input
                        type="number"
                        value={formData.minimumDue || ''}
                        onChange={(e) => setFormData({ ...formData, minimumDue: Number(e.target.value) })}
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-amber-400 font-mono text-xs focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Amount Type</label>
                      <select
                        value={formData.amountType}
                        onChange={(e) => setFormData({ ...formData, amountType: e.target.value as 'fixed' | 'variable' })}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-white text-xs focus:outline-none"
                      >
                        <option value="variable">Variable Amount</option>
                        <option value="fixed">Fixed Amount</option>
                      </select>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Due Date</label>
                    <input
                      type="date"
                      value={formData.dueDate}
                      onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                      required
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-white text-xs focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Due Time</label>
                    <input
                      type="time"
                      value={formData.dueTime}
                      onChange={(e) => setFormData({ ...formData, dueTime: e.target.value })}
                      required
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-white text-xs focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Pay From Account</label>
                    <select
                      value={formData.accountId}
                      onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-white text-xs focus:outline-none"
                    >
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Recurrence</label>
                    <select
                      value={formData.recurrence}
                      onChange={(e) => setFormData({ ...formData, recurrence: e.target.value as BillRecurrence })}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-white text-xs focus:outline-none"
                    >
                      <option value="one_time">One-time</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                </div>

                {/* Reminder Options */}
                <div className="space-y-2 pt-2 border-t border-white/10">
                  <label className="block text-xs font-semibold text-slate-300">Schedule Notifications</label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {[
                      { key: 'sevenDaysBefore', label: '7 days before' },
                      { key: 'threeDaysBefore', label: '3 days before' },
                      { key: 'oneDayBefore', label: '1 day before' },
                      { key: 'onDueDate', label: 'On due date' },
                    ].map((opt) => (
                      <label key={opt.key} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(formData.reminderSchedule as any)[opt.key]}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              reminderSchedule: {
                                ...formData.reminderSchedule,
                                [opt.key]: e.target.checked,
                              },
                            })
                          }
                          className="w-4 h-4 rounded accent-emerald-500"
                        />
                        <span>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={2}
                    className="w-full px-4 py-2 rounded-xl bg-slate-950 border border-white/10 text-white text-xs focus:outline-none"
                  />
                </div>

                <div className="pt-4 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20"
                  >
                    {editingBill ? 'Save Changes' : 'Save Payment Reminder'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: MARK AS PAID CONFIRMATION */}
        {payingBill && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-white/15 p-6 shadow-2xl space-y-6 text-white">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="text-lg font-bold">Confirm Payment</h3>
                <button onClick={() => setPayingBill(null)} className="text-slate-400 hover:text-white">✕</button>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-1">
                  <p className="text-xs text-slate-400">Payment Name</p>
                  <p className="text-lg font-bold text-white">{payingBill.name}</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Paid Amount (₹)</label>
                  <input
                    type="number"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(Number(e.target.value))}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-emerald-400 font-mono text-lg font-bold focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Paid From Account</label>
                  <select
                    value={paidAccountId}
                    onChange={(e) => setPaidAccountId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-white text-xs focus:outline-none"
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name} (Bal: ₹{a.balance?.toLocaleString('en-IN')})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Payment Date</label>
                  <input
                    type="date"
                    value={paidDate}
                    onChange={(e) => setPaidDate(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-white text-xs focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  onClick={() => setPayingBill(null)}
                  className="px-4 py-2 rounded-xl bg-white/10 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmMarkPaid}
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md"
                >
                  Confirm & Create Transaction
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: SNOOZE OPTIONS */}
        {snoozingBill && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-white/15 p-6 shadow-2xl space-y-4 text-white">
              <h3 className="text-base font-bold">Snooze Reminder</h3>
              <p className="text-2xs text-slate-400">Snoozing delays notification without altering due date.</p>
              <div className="space-y-2">
                <button
                  onClick={() => handleSnoozeBill(snoozingBill.id, 1)}
                  className="w-full py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/15 text-xs font-semibold text-left"
                >
                  Snooze 1 Day
                </button>
                <button
                  onClick={() => handleSnoozeBill(snoozingBill.id, 3)}
                  className="w-full py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/15 text-xs font-semibold text-left"
                >
                  Snooze 3 Days
                </button>
              </div>
              <button onClick={() => setSnoozingBill(null)} className="w-full py-2 text-xs text-slate-400 hover:text-white">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* MODAL: EDIT VARIABLE AMOUNT (Credit Card) */}
        {editingAmountBill && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-white/15 p-6 shadow-2xl space-y-4 text-white">
              <h3 className="text-base font-bold">Update Bill Amount</h3>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">New Amount (₹)</label>
                <input
                  type="number"
                  value={newAmountVal}
                  onChange={(e) => setNewAmountVal(Number(e.target.value))}
                  className="w-full px-4 py-2 rounded-xl bg-slate-950 border border-white/10 text-emerald-400 font-mono text-lg font-bold"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button onClick={() => setEditingAmountBill(null)} className="px-3 py-1.5 rounded-xl bg-white/10 text-xs">
                  Cancel
                </button>
                <button onClick={handleSaveEditAmount} className="px-4 py-1.5 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs">
                  Save Amount
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
