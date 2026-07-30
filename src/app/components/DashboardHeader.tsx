'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Download, Bell, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { getTransactions, getBudgets, getAccounts, type Account, calculateCreditCardBalances } from '@/lib/storage';
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

interface DashboardHeaderProps {
  selectedMonth?: number;
  selectedYear?: number;
  updateDate?: (month: number, year: number) => void;
  selectedAccountId?: string;
  setSelectedAccountId?: (id: string) => void;
}

export default function DashboardHeader({
  selectedMonth: propMonth,
  selectedYear: propYear,
  updateDate: propUpdateDate,
  selectedAccountId,
  setSelectedAccountId,
}: DashboardHeaderProps) {
  const [localMonth, setLocalMonth] = useState(new Date().getMonth());
  const [localYear, setLocalYear] = useState(new Date().getFullYear());

  const selectedMonth = propMonth !== undefined ? propMonth : localMonth;
  const selectedYear = propYear !== undefined ? propYear : localYear;

  const updateDate = (month: number, year: number) => {
    if (propUpdateDate) {
      propUpdateDate(month, year);
    } else {
      setLocalMonth(month);
      setLocalYear(year);
    }
  };

  const [txnCount, setTxnCount] = useState(0);
  const [lastUpdated, setLastUpdated] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<string[]>([]);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const loadData = () => {
    const txns = getTransactions();
    setTxnCount(txns.length);
    setAccounts(getAccounts());

    const now = new Date();
    setLastUpdated(now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));

    // Compute notifications dynamically (budget alerts)
    const monthStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
    const budgets = getBudgets().filter((b) => b.month === monthStr);
    let monthTxns = txns.filter((t) => t.type === 'expense' && t.date.startsWith(monthStr));
    if (selectedAccountId) {
      monthTxns = monthTxns.filter((t) => t.account === selectedAccountId);
    }

    const spentByCategory: Record<string, number> = {};
    monthTxns.forEach((t) => {
      spentByCategory[t.category] = (spentByCategory[t.category] || 0) + (Number(t.amount) || 0);
    });

    const list: string[] = [];
    budgets.forEach((b) => {
      const spent = spentByCategory[b.category] || 0;
      if (spent > b.allocated) {
        list.push(
          `Exceeded budget for "${b.category}" by ₹${(spent - b.allocated).toLocaleString('en-IN')}!`
        );
      } else if (spent >= b.allocated * 0.85) {
        list.push(
          `Approaching budget limit for "${b.category}" (${Math.round((spent / b.allocated) * 100)}% used).`
        );
      }
    });

    // Loan alerts (due soon, due today, overdue)
    accounts.forEach((acc) => {
      if (acc.type === 'loan' && acc.loanStatus !== 'paid_off' && acc.loanStatus !== 'closed') {
        const dueVal = acc.dueDate; // next EMI date
        if (dueVal && /^\d{4}-\d{2}-\d{2}$/.test(dueVal)) {
          const due = new Date(dueVal);
          const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const dueOffsetDate = new Date(due.getFullYear(), due.getMonth(), due.getDate());

          const diffTime = dueOffsetDate.getTime() - todayDate.getTime();
          const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

          const emiAmt = acc.emiAmount || 0;
          if (diffDays === 0) {
            list.push(`Your "${acc.name}" EMI of ₹${emiAmt.toLocaleString('en-IN')} is due today!`);
          } else if (diffDays > 0 && diffDays <= 3) {
            list.push(
              `Your "${acc.name}" EMI of ₹${emiAmt.toLocaleString('en-IN')} is due in ${diffDays} day${diffDays > 1 ? 's' : ''}.`
            );
          } else if (diffDays < 0) {
            list.push(
              `Your "${acc.name}" EMI of ₹${emiAmt.toLocaleString('en-IN')} is OVERDUE by ${Math.abs(diffDays)} day${Math.abs(diffDays) > 1 ? 's' : ''}!`
            );
          }
        }
      } else if (acc.type === 'credit') {
        const cc = calculateCreditCardBalances(acc, txns);
        if (cc.payable > 0) {
          const dueDayStr = acc.dueDate;
          if (dueDayStr && !isNaN(parseInt(dueDayStr, 10))) {
            const dueDay = parseInt(dueDayStr, 10);
            const todayDay = now.getDate();
            
            let dueYear = now.getFullYear();
            let dueMonth = now.getMonth();
            if (todayDay > dueDay) {
              dueMonth += 1;
              if (dueMonth > 11) {
                dueMonth = 0;
                dueYear += 1;
              }
            }
            
            const dueDateObj = new Date(dueYear, dueMonth, dueDay);
            const todayDate = new Date(now.getFullYear(), now.getMonth(), todayDay);
            
            const diffTime = dueDateObj.getTime() - todayDate.getTime();
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
            
            const notifyBefore = acc.notificationDaysBefore !== undefined ? acc.notificationDaysBefore : 3;
            
            if (diffDays === 0) {
              list.push(`Your credit card "${acc.name}" payment of ₹${cc.payable.toLocaleString('en-IN')} is due today!`);
            } else if (diffDays > 0 && diffDays <= notifyBefore) {
              list.push(
                `Your credit card "${acc.name}" payment of ₹${cc.payable.toLocaleString('en-IN')} is due in ${diffDays} day${diffDays > 1 ? 's' : ''}.`
              );
            } else if (diffDays < 0 || (todayDay > dueDay && dueMonth === now.getMonth())) {
              const overdueDays = todayDay > dueDay ? todayDay - dueDay : Math.abs(diffDays);
              list.push(
                `Your credit card "${acc.name}" payment of ₹${cc.payable.toLocaleString('en-IN')} is OVERDUE by ${overdueDays} day${overdueDays > 1 ? 's' : ''}!`
              );
            }
          }
        }
      }
    });

    if (list.length === 0) {
      list.push('All budgets are healthy and on track.');
    }
    setNotifications(list);
  };

  useEffect(() => {
    loadData();
  }, [selectedMonth, selectedYear]);

  function handleRefresh() {
    loadData();
    toast.success('Dashboard data refreshed successfully');
  }

  async function handleExport() {
    const txns = getTransactions();
    if (txns.length === 0) {
      toast.error('No transactions available to export.');
      return;
    }

    const accounts = getAccounts();
    const XLSX = await import('xlsx');

    // Export in the exact template format expected by the spreadsheet importer
    const headers = [
      'Date',
      'Account',
      'Category',
      'Subcategory',
      'Note',
      'INR',
      'Income/Expense',
      'Description',
      'Amount',
      'Currency',
      'Account_1',
    ];

    const dataRows = txns.map((t) => {
      let tone = 'Expense';
      if (t.type === 'income') tone = 'Income';
      else if (t.type === 'transfer') tone = 'Transfer-Out';

      const accountName = accounts.find((a) => a.id === t.account)?.name || 'Cash';

      return {
        Date: t.date,
        Account: accountName,
        Category: t.category,
        Subcategory: t.subcategory || '',
        Note: t.notes || '',
        INR: t.amount,
        'Income/Expense': tone,
        Description: t.description,
        Amount: t.amount,
        Currency: 'INR',
        Account_1: t.amount,
      };
    });

    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(dataRows, { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transactions');

    // Download the Excel file
    XLSX.writeFile(
      wb,
      `wealthiq_transactions_export_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
    toast.success('Transactions report exported as Excel (.xlsx) in matched import format!');
  }

  const shiftMonth = (delta: number) => {
    let m = selectedMonth + delta;
    let y = selectedYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
    if (m > 11) {
      m = 0;
      y += 1;
    }
    updateDate(m, y);
  };

  const availableYears = useMemo(() => {
    const years = new Set<number>([new Date().getFullYear()]);
    getTransactions().forEach((t) => {
      const y = new Date(t.date).getFullYear();
      if (!isNaN(y)) years.add(y);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, []);

  const hasAlerts = notifications.some((n) => n.includes('Exceeded') || n.includes('Approaching'));

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <div className="flex items-center gap-6">
          <h1 className="text-2xl font-bold text-foreground">Financial Dashboard</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all duration-150"
              title="Refresh data"
            >
              <RefreshCw size={13} />
            </button>
            <button
              onClick={handleExport}
              className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all duration-150"
              title="Export report"
            >
              <Download size={13} />
            </button>
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all duration-150"
                title="Notifications"
              >
                <Bell size={13} />
                {hasAlerts && (
                  <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-negative" />
                )}
              </button>
              {showNotifications && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
                  <div className="absolute left-0 top-full mt-2 z-50 bg-[#0b0f1a] border border-border rounded-xl shadow-2xl p-4 w-72 text-xs space-y-2">
                    <p className="font-bold text-slate-400 mb-1 border-b border-border pb-1.5">
                      Notifications
                    </p>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto select-scrollbar text-left">
                      {notifications.map((n, i) => (
                        <div
                          key={`notif-${i}`}
                          className={`p-2 rounded-lg border leading-relaxed ${
                            n.includes('Exceeded')
                              ? 'bg-negative-subtle/20 border-negative/20 text-negative'
                              : n.includes('Approaching')
                                ? 'bg-warning-subtle/20 border-warning/20 text-warning'
                                : 'bg-muted/20 border-border text-muted-foreground'
                          }`}
                        >
                          {n}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <div className="w-2 h-2 rounded-full bg-positive animate-pulse" />
          <span className="text-xs text-muted-foreground">
            Live data — last updated {lastUpdated}
          </span>
          <span className="w-1 h-1 rounded-full bg-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {txnCount} transaction{txnCount !== 1 ? 's' : ''} loaded
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {/* Account selection dropdown */}
        <div className="relative">
          <select
            value={selectedAccountId || ''}
            onChange={(e) => setSelectedAccountId && setSelectedAccountId(e.target.value)}
            className="h-12 text-sm bg-[#0b0f1a] border border-border rounded-xl px-4 py-2.5 text-slate-200 appearance-none cursor-pointer pr-10 hover:border-primary/40 focus:border-primary focus:outline-none transition-all duration-150 font-semibold"
            aria-label="Select Account"
          >
            <option value="" className="bg-[#0b0f1a] text-slate-200 text-sm">
              All Accounts
            </option>
            {accounts.map((acc) => (
              <option
                key={acc.id}
                value={acc.id}
                className="bg-[#0b0f1a] text-slate-200 font-medium text-sm"
              >
                {acc.name} (₹{acc.balance.toLocaleString('en-IN')})
              </option>
            ))}
          </select>
          <ChevronDown
            size={14}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
        </div>

        {/* Unified Date Picker */}
        <div className="flex items-center gap-1.5 bg-[#0b0f1a] border border-border rounded-xl p-1 relative h-12">
          <button
            onClick={() => shiftMonth(-1)}
            className="h-10 w-10 flex items-center justify-center rounded-lg hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-all"
            aria-label="Previous month"
          >
            <ChevronLeft size={18} />
          </button>

          <button
            onClick={() => setIsPickerOpen(!isPickerOpen)}
            className="px-4 text-sm font-semibold text-foreground flex items-center gap-1.5 transition-all h-10 hover:bg-muted/80 rounded-lg"
          >
            {MONTH_NAMES[selectedMonth].slice(0, 3)} {selectedYear}
            <ChevronDown size={14} className="text-muted-foreground" />
          </button>

          <button
            onClick={() => shiftMonth(1)}
            className="h-10 w-10 flex items-center justify-center rounded-lg hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-all"
            aria-label="Next month"
          >
            <ChevronRight size={18} />
          </button>

          {isPickerOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsPickerOpen(false)} />
              <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50 bg-[#0b0f1a] border border-border rounded-xl shadow-2xl p-4 grid grid-cols-2 gap-4 w-72">
                {/* Month Selection */}
                <div className="space-y-1 max-h-56 overflow-y-auto pr-1 select-scrollbar">
                  <p className="text-2xs font-bold uppercase tracking-wider text-muted-foreground px-2 py-1 sticky top-0 bg-[#0b0f1a] z-10">
                    Month
                  </p>
                  {MONTH_NAMES.map((m, i) => (
                    <button
                      key={m}
                      onClick={() => {
                        updateDate(i, selectedYear);
                        setIsPickerOpen(false);
                      }}
                      className={`w-full text-left text-sm px-3 py-2.5 rounded-md transition ${
                        selectedMonth === i
                          ? 'bg-primary text-white font-semibold'
                          : 'text-slate-300 hover:bg-muted/50 hover:text-foreground'
                      }`}
                    >
                      {m.slice(0, 3)}
                    </button>
                  ))}
                </div>
                {/* Year Selection */}
                <div className="space-y-1 max-h-56 overflow-y-auto pl-1 select-scrollbar border-l border-border">
                  <p className="text-2xs font-bold uppercase tracking-wider text-muted-foreground px-2 py-1 sticky top-0 bg-[#0b0f1a] z-10">
                    Year
                  </p>
                  {availableYears.map((y) => (
                    <button
                      key={y}
                      onClick={() => {
                        updateDate(selectedMonth, y);
                        setIsPickerOpen(false);
                      }}
                      className={`w-full text-left text-sm px-3 py-2.5 rounded-md transition ${
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
      </div>
    </div>
  );
}
