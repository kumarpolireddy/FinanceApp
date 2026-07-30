'use client';

import React, { useEffect, useMemo, useState, Suspense, useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ChevronDown, Edit3, ChevronLeft, ChevronRight, Filter, BarChart3, Plus, ArrowLeft, Trash2, Copy, Star, Camera, Plane } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import Modal from '@/components/ui/Modal';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { toast } from 'sonner';
import {
  getTransactions,
  getAccounts,
  getCategories,
  deleteTransaction,
  updateTransaction,
  updateAccount,
  getRepayments,
  saveRepayments,
  recalculateLoanTimeline,
  getTransactionImpact,
  getActiveTrip,
  setActiveTrip,
  addTrip,
  updateTrip,
  getTripSummary,
  type Transaction,
  type Account,
  type Category,
  type Repayment,
  type Trip,
} from '@/lib/storage';

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

const CustomBarTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#0b0f1a] border border-border/80 p-2.5 rounded shadow-2xl text-xs space-y-1">
        <p className="font-bold text-foreground">
          {typeof label === 'string' && label.match(/^\d+$/) ? `Day ${label}` : label}
        </p>
        {payload.map((p: any) => (
          <div key={p.name} className="flex justify-between items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-sm ${p.name === 'Income' ? 'bg-positive' : 'bg-negative'}`} />
              <span className="text-muted-foreground text-3xs">{p.name}:</span>
            </div>
            <span className={`font-mono font-bold ${p.name === 'Income' ? 'text-positive' : 'text-negative'}`}>
              ₹{p.value.toLocaleString('en-IN')}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

function TransactionsPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const now = useMemo(() => new Date(), []);

  // Parse state from URL search params
  const selectedYear = useMemo(() => {
    const y = searchParams.get('year');
    return y ? parseInt(y, 10) : now.getFullYear();
  }, [searchParams, now]);

  const selectedMonth = useMemo(() => {
    const m = searchParams.get('month');
    return m ? parseInt(m, 10) - 1 : now.getMonth();
  }, [searchParams, now]);

  const [isLoading, setIsLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense' | 'transfer' | 'cash-in' | 'cash-out'>(
    (searchParams?.get('type') as any) || 'all'
  );
  const [accountFilter, setAccountFilter] = useState<string>(
    searchParams?.get('account') || 'all'
  );
  const [categoryFilter, setCategoryFilter] = useState<string>(
    searchParams?.get('category') || 'all'
  );
  const [destinationAccountFilter, setDestinationAccountFilter] = useState<string>('all');
  const [quickFilter, setQuickFilter] = useState<
    'this-month' | 'last-month' | 'this-year' | 'custom' | 'all'
  >(searchParams?.get('year') || searchParams?.get('month') ? 'custom' : 'this-month');
  const [search, setSearch] = useState('');
  const [deletingTxn, setDeletingTxn] = useState<Transaction | null>(null);

  // Sorting state
  const [sortField, setSortField] = useState<'date' | 'amount' | 'category' | 'account'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Editing transaction state
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editForm, setEditForm] = useState<{
    type: Transaction['type'];
    date: string;
    account: string;
    toAccount?: string;
    category: string;
    subcategory: string;
    amount: string;
    description: string;
    notes: string;
  } | null>(null);

  // Trip Mode States & Handlers
  const [activeTrip, setActiveTripState] = useState<Trip | null>(null);
  const [isStartTripModalOpen, setIsStartTripModalOpen] = useState(false);
  const [isActiveTripModalOpen, setIsActiveTripModalOpen] = useState(false);
  const [newTripName, setNewTripName] = useState('');
  const [newTripDestination, setNewTripDestination] = useState('');
  const [newTripBudget, setNewTripBudget] = useState('');

  const refreshActiveTrip = useCallback(() => {
    setActiveTripState(getActiveTrip());
  }, []);

  useEffect(() => {
    refreshActiveTrip();
  }, [refreshActiveTrip]);

  const handleTripButtonClick = () => {
    const current = getActiveTrip();
    if (current) {
      updateTrip(current.id, { status: 'completed' });
      setActiveTrip(null);
      refreshActiveTrip();
      toast.success(`Trip "${current.name}" completed!`);
    } else {
      setNewTripName('');
      setNewTripDestination('');
      setNewTripBudget('');
      setIsStartTripModalOpen(true);
    }
  };

  const handleStartTripSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTripName.trim()) {
      toast.error('Trip Name is required');
      return;
    }
    const created = addTrip({
      name: newTripName.trim(),
      destination: newTripDestination.trim() || undefined,
      budget: parseFloat(newTripBudget) || undefined,
      startDate: new Date().toISOString().slice(0, 10),
      status: 'active',
      icon: '✈️',
    });
    refreshActiveTrip();
    setIsStartTripModalOpen(false);
    toast.success(`Trip "${created.name}" started`);
  };

  // Edit / Delete Repayment states
  const [editingRepayment, setEditingRepayment] = useState<Repayment | null>(null);
  const [repaymentForm, setRepaymentForm] = useState({
    amount: '',
    date: '',
    paymentAccountId: '',
    notes: '',
  });
  const [deletingRepayment, setDeletingRepayment] = useState<Repayment | null>(null);

  const [showBalances, setShowBalances] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('wealthiq_show_balances') !== 'false';
    }
    return true;
  });

  const [activeTab, setActiveTab] = useState<'daily' | 'calendar' | 'monthly' | 'total' | 'note'>('daily');
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<number | null>(null);
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [showAccountChart, setShowAccountChart] = useState(false);

  // General Notes State
  interface GeneralNote {
    id: string;
    title: string;
    content: string;
    updatedAt: string;
  }

  const [generalNotes, setGeneralNotes] = useState<GeneralNote[]>([]);
  const [noteSearch, setNoteSearch] = useState('');
  const [editingGeneralNote, setEditingGeneralNote] = useState<GeneralNote | null>(null);
  const [isGeneralNoteModalOpen, setIsGeneralNoteModalOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('wealthiq_general_notes');
      if (saved) {
        try {
          setGeneralNotes(JSON.parse(saved));
        } catch (e) {
          console.error('Failed to parse general notes', e);
        }
      }
    }
  }, []);

  const saveGeneralNotes = (notes: GeneralNote[]) => {
    setGeneralNotes(notes);
    localStorage.setItem('wealthiq_general_notes', JSON.stringify(notes));
  };

  const handleSaveGeneralNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteContent.trim()) {
      toast.error('Note content cannot be empty');
      return;
    }

    if (editingGeneralNote) {
      const updatedNotes = generalNotes.map(n => 
        n.id === editingGeneralNote.id 
          ? { ...n, title: noteTitle, content: noteContent, updatedAt: new Date().toISOString() }
          : n
      );
      saveGeneralNotes(updatedNotes);
      toast.success('Note updated');
    } else {
      const newNote: GeneralNote = {
        id: Math.random().toString(36).substring(2, 9),
        title: noteTitle || 'Untitled Note',
        content: noteContent,
        updatedAt: new Date().toISOString(),
      };
      saveGeneralNotes([newNote, ...generalNotes]);
      toast.success('Note added');
    }

    setIsGeneralNoteModalOpen(false);
    setNoteTitle('');
    setNoteContent('');
    setEditingGeneralNote(null);
  };

  useEffect(() => {
    if (accountFilter === 'all') {
      setShowAccountChart(false);
    }
  }, [accountFilter]);

  // Edit Account state and logic
  const [isEditAccountOpen, setIsEditAccountOpen] = useState(false);
  const [editAccName, setEditAccName] = useState('');
  const [editAccBalance, setEditAccBalance] = useState('0');
  const [editAccLimit, setEditAccLimit] = useState('100000');
  const [editAccDueDay, setEditAccDueDay] = useState('25');
  const [editAccMinPayment, setEditAccMinPayment] = useState('0');
  const [editAccBillingCycle, setEditAccBillingCycle] = useState('4');
  const [editAccNotifyDays, setEditAccNotifyDays] = useState('3');
  const [editAccNotes, setEditAccNotes] = useState('');
  const [editAccInterest, setEditAccInterest] = useState('8.5');

  const activeAccount = useMemo(() => {
    return accounts.find((a) => a.id === accountFilter) || null;
  }, [accounts, accountFilter]);

  const handleOpenEditAccount = () => {
    if (!activeAccount) return;
    setEditAccName(activeAccount.name);
    setEditAccBalance(String(activeAccount.balance));
    setEditAccLimit(String(activeAccount.creditLimit || '100000'));
    setEditAccDueDay(activeAccount.dueDate || '25');
    setEditAccMinPayment(String(activeAccount.minPayment || '0'));
    setEditAccBillingCycle(activeAccount.billingCycle || '4');
    setEditAccNotifyDays(String(activeAccount.notificationDaysBefore !== undefined ? activeAccount.notificationDaysBefore : '3'));
    setEditAccNotes(activeAccount.notes || '');
    setEditAccInterest(String(activeAccount.interestRate || '8.5'));
    setIsEditAccountOpen(true);
  };

  const handleSaveAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccount) return;

    const updates: Partial<Omit<Account, 'id'>> = {
      name: editAccName.trim(),
      balance: parseFloat(editAccBalance) || 0,
      notes: editAccNotes.trim(),
    };

    if (activeAccount.type === 'credit') {
      updates.creditLimit = parseFloat(editAccLimit) || 0;
      updates.dueDate = editAccDueDay.trim();
      updates.minPayment = parseFloat(editAccMinPayment) || 0;
      updates.billingCycle = editAccBillingCycle.trim();
      updates.notificationDaysBefore = parseInt(editAccNotifyDays, 10) || 0;
    } else if (activeAccount.type === 'loan') {
      updates.interestRate = parseFloat(editAccInterest) || 0;
    }

    updateAccount(activeAccount.id, updates);
    toast.success('Account updated successfully');
    
    // Refresh states
    setAccounts(getAccounts(true));
    setIsEditAccountOpen(false);
  };

  // Dynamically re-fetch transaction records whenever the month or year changes
  useEffect(() => {
    setIsLoading(true);
    const timer = setTimeout(() => {
      setTransactions(getTransactions(true));
      setAccounts(getAccounts(true));
      setCategories(getCategories());
      setIsLoading(false);
    }, 350);

    return () => clearTimeout(timer);
  }, [selectedMonth, selectedYear]);

  // Synchronize filter states with URL search params changes dynamically
  useEffect(() => {
    if (searchParams?.get('year') || searchParams?.get('month')) {
      setQuickFilter('custom');
    } else {
      setQuickFilter('this-month');
    }

    const typeParam = searchParams?.get('type');
    if (
      typeParam === 'income' ||
      typeParam === 'expense' ||
      typeParam === 'transfer' ||
      typeParam === 'cash-in' ||
      typeParam === 'cash-out' ||
      typeParam === 'all'
    ) {
      setTypeFilter(typeParam as any);
    } else {
      setTypeFilter('all');
    }

    const accountParam = searchParams?.get('account');
    if (accountParam) {
      setAccountFilter(accountParam);
    } else {
      setAccountFilter('all');
    }

    const categoryParam = searchParams?.get('category');
    if (categoryParam) {
      setCategoryFilter(categoryParam);
    } else {
      setCategoryFilter('all');
    }
  }, [searchParams]);

  // Update date params in URL
  const updateDate = (newMonth: number, newYear: number) => {
    setQuickFilter('custom');
    const params = new URLSearchParams(window.location.search);
    params.set('year', newYear.toString());
    params.set('month', String(newMonth + 1).padStart(2, '0'));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const goToToday = () => {
    updateDate(now.getMonth(), now.getFullYear());
    setQuickFilter('this-month');
  };

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

  // Swipe touch gestures
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const relativeX = touch.clientX - rect.left;
    if (relativeX < 80) {
      setTouchStart(null);
      return;
    }
    setTouchStart({ x: touch.clientX, y: touch.clientY });
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStart) return;
    if (editingTransaction || editingRepayment) return;
    
    const touch = e.changedTouches[0];
    const diffX = touch.clientX - touchStart.x;
    const diffY = touch.clientY - touchStart.y;
    
    // We only trigger if the swipe is horizontal and exceeds threshold
    const minSwipeDistance = 60;
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > minSwipeDistance) {
      if (activeTab === 'monthly') {
        if (diffX < 0) {
          // Swiped Left: show next year
          updateDate(selectedMonth, selectedYear + 1);
        } else {
          // Swiped Right: show previous year
          updateDate(selectedMonth, selectedYear - 1);
        }
      } else {
        if (diffX < 0) {
          // Swiped Left: show next month
          shiftMonth(1);
        } else {
          // Swiped Right: show before month (previous month)
          shiftMonth(-1);
        }
      }
    }
    setTouchStart(null);
  }, [touchStart, selectedMonth, selectedYear, activeTab, editingTransaction, editingRepayment]);

  // Years dropdown includes current year + any year that actually has data
  const availableYears = useMemo(() => {
    const years = new Set<number>([now.getFullYear()]);
    transactions.forEach((t) => {
      if (t && t.date) {
        years.add(new Date(t.date).getFullYear());
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [transactions, now]);

  const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;

  const getAccountName = useCallback(
    (accountId: string) => accounts.find((a) => a.id === accountId)?.name ?? 'Unknown',
    [accounts]
  );

  const uniqueCategories = useMemo(() => {
    const cats = categories.map((c) => c.name);
    // Add "Transfer" and "Deleted Category" to the filter if they are not already there
    if (!cats.includes('Transfer')) cats.push('Transfer');
    if (!cats.includes('Deleted Category')) cats.push('Deleted Category');
    return Array.from(new Set(cats)).sort();
  }, [categories]);

  const filterCategories = useMemo(() => {
    if (typeFilter === 'expense') {
      return categories
        .filter((c) => c.type === 'expense')
        .map((c) => c.name)
        .sort();
    }
    if (typeFilter === 'income') {
      return categories
        .filter((c) => c.type === 'income')
        .map((c) => c.name)
        .sort();
    }
    return uniqueCategories;
  }, [categories, uniqueCategories, typeFilter]);

  const handleTypeFilterChange = (
    newType: 'all' | 'income' | 'expense' | 'transfer' | 'cash-in' | 'cash-out'
  ) => {
    setTypeFilter(newType);
    setCategoryFilter('all');
    setDestinationAccountFilter('all');
  };

  const filtered = useMemo(() => {
    const today = new Date();
    return transactions
      .filter((t) => {
        if (!t || typeof t.date !== 'string') return false;

        if (quickFilter === 'all') {
          return true;
        }
        if (quickFilter === 'this-month') {
          const prefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
          return t.date.startsWith(prefix);
        }
        if (quickFilter === 'last-month') {
          let y = today.getFullYear();
          let m = today.getMonth() - 1;
          if (m < 0) {
            m = 11;
            y -= 1;
          }
          const prefix = `${y}-${String(m + 1).padStart(2, '0')}`;
          return t.date.startsWith(prefix);
        }
        if (quickFilter === 'this-year') {
          const prefix = `${today.getFullYear()}`;
          return t.date.startsWith(prefix);
        }
        // Custom quick filter or fallback to url month selection
        return t.date.startsWith(monthKey);
      })
      .filter((t) => {
        if (typeFilter === 'all') return true;
        if (typeFilter === 'cash-in') {
          return t.type === 'income' || t.type === 'transfer';
        }
        if (typeFilter === 'cash-out') {
          return t.type === 'expense' || t.type === 'transfer';
        }
        return t.type === typeFilter;
      })
      .filter((t) => {
        if (typeFilter === 'transfer') {
          const matchSource = accountFilter === 'all' || t.account === accountFilter;
          const matchDest =
            destinationAccountFilter === 'all' || t.toAccount === destinationAccountFilter;
          return matchSource && matchDest;
        }
        if (typeFilter === 'cash-in') {
          if (accountFilter === 'all') return true;
          if (t.type === 'transfer') {
            return t.toAccount === accountFilter;
          }
          return t.account === accountFilter;
        }
        if (typeFilter === 'cash-out') {
          if (accountFilter === 'all') return true;
          if (t.type === 'transfer') {
            return t.account === accountFilter;
          }
          return t.account === accountFilter;
        }
        return (
          accountFilter === 'all' || t.account === accountFilter || t.toAccount === accountFilter
        );
      })
      .filter((t) => {
        if (typeFilter === 'transfer') {
          return true;
        }
        return categoryFilter === 'all' || t.category === categoryFilter;
      })
      .filter((t) => {
        if (search.trim() === '') return true;
        const q = search.toLowerCase();
        const accName = getAccountName(t.account).toLowerCase();
        const toAccName = t.toAccount ? getAccountName(t.toAccount).toLowerCase() : '';
        const note = (t.notes || '').toLowerCase();
        return (
          t.description.toLowerCase().includes(q) ||
          (t.category || '').toLowerCase().includes(q) ||
          accName.includes(q) ||
          toAccName.includes(q) ||
          note.includes(q)
        );
      })
      .sort((a, b) => {
        let valA: any = '';
        let valB: any = '';

        if (sortField === 'date') {
          valA = a.date;
          valB = b.date;
        } else if (sortField === 'amount') {
          valA = a.amount;
          valB = b.amount;
        } else if (sortField === 'category') {
          valA = a.category || '';
          valB = b.category || '';
        } else if (sortField === 'account') {
          valA = getAccountName(a.account);
          valB = getAccountName(b.account);
        }

        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
  }, [
    transactions,
    monthKey,
    typeFilter,
    accountFilter,
    categoryFilter,
    destinationAccountFilter,
    search,
    quickFilter,
    sortField,
    sortOrder,
    accounts,
    getAccountName,
  ]);

  const accountChartData = useMemo(() => {
    if (accountFilter === 'all' || filtered.length === 0) return [];
    
    let minDate = new Date();
    let maxDate = new Date(0);
    
    filtered.forEach(t => {
      const d = new Date(t.date);
      if (d < minDate) minDate = d;
      if (d > maxDate) maxDate = d;
    });
    
    const diffMs = maxDate.getTime() - minDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    
    if (diffDays > 35) {
      // Group by Month
      const monthlyData: Record<string, { monthStr: string, income: number, expense: number, dateObj: Date }> = {};
      filtered.forEach(t => {
        const d = new Date(t.date);
        const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const mName = d.toLocaleString('default', { month: 'short' });
        
        if (!monthlyData[mKey]) {
          monthlyData[mKey] = {
            monthStr: `${mName} ${d.getFullYear()}`,
            income: 0,
            expense: 0,
            dateObj: d
          };
        }
        
        if (t.type === 'income') {
          monthlyData[mKey].income += t.amount;
        } else if (t.type === 'expense') {
          monthlyData[mKey].expense += t.amount;
        } else if (t.type === 'transfer') {
          if (t.account === accountFilter) {
            monthlyData[mKey].expense += t.amount;
          } else if (t.toAccount === accountFilter) {
            monthlyData[mKey].income += t.amount;
          }
        }
      });
      
      return Object.values(monthlyData)
        .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
    } else {
      // Group by Day
      const dailyData: Record<number, { day: number, dayStr: string, income: number, expense: number }> = {};
      
      let year = selectedYear;
      let month = selectedMonth;
      if (filtered.length > 0) {
        const first = new Date(filtered[0].date);
        year = first.getFullYear();
        month = first.getMonth();
      }
      
      const numDays = new Date(year, month + 1, 0).getDate();
      for (let i = 1; i <= numDays; i++) {
        dailyData[i] = {
          day: i,
          dayStr: String(i),
          income: 0,
          expense: 0
        };
      }
      
      filtered.forEach(t => {
        const d = new Date(t.date);
        const dayNum = d.getDate();
        if (dailyData[dayNum]) {
          if (t.type === 'income') {
            dailyData[dayNum].income += t.amount;
          } else if (t.type === 'expense') {
            dailyData[dayNum].expense += t.amount;
          } else if (t.type === 'transfer') {
            if (t.account === accountFilter) {
              dailyData[dayNum].expense += t.amount;
            } else if (t.toAccount === accountFilter) {
              dailyData[dayNum].income += t.amount;
            }
          }
        }
      });
      
      return Object.values(dailyData).sort((a, b) => a.day - b.day);
    }
  }, [filtered, accountFilter, selectedYear, selectedMonth]);

  const chartDataKey = useMemo(() => {
    if (accountChartData.length > 0 && 'dayStr' in accountChartData[0]) {
      return 'dayStr';
    }
    return 'monthStr';
  }, [accountChartData]);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;

    filtered.forEach((t) => {
      if (!t) return;
      const impact = getTransactionImpact(t);
      income += impact.income;
      expense += impact.expense;
    });

    return { income, expense, net: income - expense, count: filtered.length };
  }, [filtered]);

  const transactionBalances = useMemo(() => {
    const balances: Record<string, { accountBalance: number; toAccountBalance?: number }> = {};
    const runningBalances = new Map<string, number>();

    // Initialize with opening balances
    accounts.forEach((acc) => {
      const opening = acc.openingBalance !== undefined ? acc.openingBalance : acc.balance || 0;
      runningBalances.set(acc.id, opening);
    });

    // Sort chronologically (ascending) to compute the running balance after each transaction
    const sorted = [...transactions].sort((a, b) => {
      const dateCompare = (a.date || '').localeCompare(b.date || '');
      if (dateCompare !== 0) return dateCompare;
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    });

    sorted.forEach((txn) => {
      const amount = Number(txn.amount) || 0;
      const type = txn.type;

      if (type === 'income') {
        const prev = runningBalances.get(txn.account) || 0;
        const next = prev + amount;
        runningBalances.set(txn.account, next);
        balances[txn.id] = { accountBalance: next };
      } else if (type === 'expense') {
        const prev = runningBalances.get(txn.account) || 0;
        const next = prev - amount;
        runningBalances.set(txn.account, next);
        balances[txn.id] = { accountBalance: next };
      } else if (type === 'transfer') {
        const srcPrev = runningBalances.get(txn.account) || 0;
        const srcNext = srcPrev - amount;
        runningBalances.set(txn.account, srcNext);

        let dstNext: number | undefined = undefined;
        if (txn.toAccount) {
          const dstPrev = runningBalances.get(txn.toAccount) || 0;
          dstNext = dstPrev + amount;
          runningBalances.set(txn.toAccount, dstNext);
        }

        balances[txn.id] = {
          accountBalance: srcNext,
          toAccountBalance: dstNext,
        };
      }
    });

    return balances;
  }, [transactions, accounts, getAccountName]);

  const editCategories = useMemo(() => {
    if (!editForm) return [];
    if (editForm.type === 'transfer') return [];
    return categories.filter((c) => c.type === editForm.type);
  }, [categories, editForm]);

  const activeCategorySubcategories = useMemo(() => {
    if (!editForm || editForm.type === 'transfer' || !editForm.category) return [];
    const cat = categories.find((c) => c && c.name && c.name.toLowerCase() === editForm.category.toLowerCase());
    return cat?.subcategories || [];
  }, [categories, editForm]);

  const currentCategoryObj = useMemo(() => {
    if (!editForm || !categories || !editForm.category) return null;
    return categories.find((c) => c && c.name && c.name.toLowerCase() === editForm.category.toLowerCase()) || null;
  }, [editForm, categories]);

  const currencySymbol = useMemo(() => {
    if (typeof window !== 'undefined') {
      const cur = localStorage.getItem('wealthiq_currency') || 'INR';
      if (cur === 'USD') return '$';
      if (cur === 'EUR') return '€';
      if (cur === 'GBP') return '£';
      if (cur === 'JPY') return '¥';
    }
    return '₹';
  }, []);

  const handleDelete = (txn: Transaction) => {
    const repayments = getRepayments();
    const linkedRep = repayments.find(
      (r) => r.interestTransactionId === txn.id || r.principalTransactionId === txn.id
    );

    if (linkedRep) {
      setDeletingRepayment(linkedRep);
      return;
    }

    setDeletingTxn(txn);
  };

  const startEditing = (txn: Transaction) => {
    const repayments = getRepayments();
    const linkedRep = repayments.find(
      (r) => r.interestTransactionId === txn.id || r.principalTransactionId === txn.id
    );

    if (linkedRep) {
      setEditingRepayment(linkedRep);
      setRepaymentForm({
        amount: String(linkedRep.amount),
        date: linkedRep.date.slice(0, 10),
        paymentAccountId: linkedRep.paymentAccountId,
        notes: linkedRep.notes || '',
      });
      return;
    }

    setEditingTransaction(txn);
    setEditForm({
      type: txn.type,
      date: txn.date,
      account: txn.account,
      toAccount: txn.toAccount || '',
      category: txn.category || '',
      subcategory: txn.subcategory || '',
      amount: txn.amount.toString(),
      description: txn.description,
      notes: txn.notes || '',
    });
  };

  const handleTypeChange = (newType: 'income' | 'expense' | 'transfer') => {
    if (!editForm) return;
    let newCategory = editForm.category;
    let toAcc = editForm.toAccount;
    if (newType === 'transfer') {
      newCategory = 'Transfer';
      if (!toAcc) {
        const otherAcc = accounts.find((a) => a.id !== editForm.account);
        toAcc = otherAcc ? otherAcc.id : '';
      }
    } else {
      const filteredCats = categories.filter((c) => c.type === newType);
      if (filteredCats.length > 0) {
        newCategory = filteredCats[0].name;
      } else {
        newCategory = 'Other';
      }
    }
    setEditForm({
      ...editForm,
      type: newType,
      category: newCategory,
      subcategory: '',
      toAccount: toAcc,
    });
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTransaction || !editForm) return;

    const amount = Math.abs(Number(editForm.amount || 0));
    if (!amount || !editForm.description.trim() || !editForm.account) {
      toast.error('Please fill in all required fields.');
      return;
    }

    if (editForm.type === 'transfer') {
      if (!editForm.toAccount) {
        toast.error('Please select a destination account.');
        return;
      }
      if (editForm.account === editForm.toAccount) {
        toast.error('Source and destination accounts must be different.');
        return;
      }
    }

    updateTransaction(editingTransaction.id, {
      date: editForm.date,
      type: editForm.type,
      category: editForm.type === 'transfer' ? 'Transfer' : editForm.category,
      subcategory: editForm.type === 'transfer' ? undefined : editForm.subcategory || undefined,
      account: editForm.account,
      toAccount: editForm.type === 'transfer' ? editForm.toAccount : undefined,
      amount,
      description: editForm.description.trim(),
      notes: editForm.notes.trim(),
    });

    setEditingTransaction(null);
    setEditForm(null);
    setTransactions(getTransactions(true));
    toast.success('Transaction updated successfully');
  };

  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const ddd = days[d.getDay()];
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yy} (${ddd})   ${hh}:${min}`;
  };

  const handleSaveClick = (e: React.MouseEvent) => {
    e.preventDefault();
    handleSaveEdit({ preventDefault: () => {} } as React.FormEvent);
  };

  const handleCopyTransaction = () => {
    if (!editingTransaction || !editForm) return;
    const amount = Math.abs(Number(editForm.amount || 0));
    if (!amount || !editForm.description.trim() || !editForm.account) {
      toast.error('Please fill in all required fields to copy.');
      return;
    }
    const duplicated: Transaction = {
      id: 'txn_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      date: new Date().toISOString(),
      type: editForm.type,
      category: editForm.type === 'transfer' ? 'Transfer' : editForm.category,
      subcategory: editForm.type === 'transfer' ? undefined : editForm.subcategory || undefined,
      account: editForm.account,
      toAccount: editForm.type === 'transfer' ? editForm.toAccount : undefined,
      amount,
      description: editForm.description.trim(),
      notes: editForm.notes.trim(),
      createdAt: new Date().toISOString(),
    };
    const allTxns = getTransactions();
    allTxns.push(duplicated);
    localStorage.setItem('wealthiq_transactions', JSON.stringify(allTxns));
    setEditingTransaction(null);
    setEditForm(null);
    setTransactions(getTransactions(true));
    toast.success('Transaction copied successfully');
  };

  const handleBookmarkTransaction = () => {
    if (!editingTransaction || !editForm) return;
    const amount = Math.abs(Number(editForm.amount || 0));
    if (!amount || !editForm.description.trim() || !editForm.account) {
      toast.error('Please fill in all required fields to bookmark.');
      return;
    }
    const notePrefix = '[Bookmarked] ';
    const notesContent = editForm.notes.trim();
    const updatedNotes = notesContent.startsWith(notePrefix) ? notesContent : `${notePrefix}${notesContent}`;
    
    updateTransaction(editingTransaction.id, {
      date: editForm.date,
      type: editForm.type,
      category: editForm.type === 'transfer' ? 'Transfer' : editForm.category,
      subcategory: editForm.type === 'transfer' ? undefined : editForm.subcategory || undefined,
      account: editForm.account,
      toAccount: editForm.type === 'transfer' ? editForm.toAccount : undefined,
      amount,
      description: editForm.description.trim(),
      notes: updatedNotes,
    });

    setEditingTransaction(null);
    setEditForm(null);
    setTransactions(getTransactions(true));
    toast.success('Transaction bookmarked');
  };

  const handleSaveEditedRepayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRepayment) return;

    const amountVal = Number(repaymentForm.amount);
    if (isNaN(amountVal) || amountVal <= 0) {
      toast.error('Please enter a valid amount.');
      return;
    }
    if (!repaymentForm.date) {
      toast.error('Please enter a valid date.');
      return;
    }

    const accountsList = getAccounts(true);
    const loan = accountsList.find((a) => a.id === editingRepayment.loanId);
    if (loan && new Date(repaymentForm.date) < new Date(loan.startDate || '')) {
      toast.error('Repayment date cannot be before the loan start date.');
      return;
    }

    const allRepayments = getRepayments();
    const updated = allRepayments.map((r) => {
      if (r.id === editingRepayment.id) {
        return {
          ...r,
          amount: amountVal,
          date: repaymentForm.date,
          paymentAccountId: repaymentForm.paymentAccountId,
          notes: repaymentForm.notes,
          updatedAt: new Date().toISOString(),
        };
      }
      return r;
    });

    saveRepayments(updated);

    recalculateLoanTimeline(editingRepayment.loanId);

    toast.success('Repayment updated successfully!');
    setEditingRepayment(null);
    setTransactions(getTransactions(true));
  };

  const handleDeleteRepayment = () => {
    if (!deletingRepayment) return;

    const allRepayments = getRepayments();
    const filtered = allRepayments.filter((r) => r.id !== deletingRepayment.id);
    saveRepayments(filtered);

    if (deletingRepayment.interestTransactionId) {
      deleteTransaction(deletingRepayment.interestTransactionId, 'reverse');
    }
    if (deletingRepayment.principalTransactionId) {
      deleteTransaction(deletingRepayment.principalTransactionId, 'reverse');
    }

    recalculateLoanTimeline(deletingRepayment.loanId);

    toast.success('Repayment deleted and loan balance recalculated!');
    setDeletingRepayment(null);
    setTransactions(getTransactions(true));
  };

  const handleSort = (field: 'date' | 'amount' | 'category' | 'account') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };


  // Group transactions for Daily Tab
  const groupedDailyTransactions = useMemo(() => {
    const groups: Record<string, { date: Date; items: Transaction[]; incomeSum: number; expenseSum: number }> = {};
    filtered.forEach((txn) => {
      if (!txn || !txn.date) return;
      const dateStr = txn.date.split('T')[0];
      if (!groups[dateStr]) {
        groups[dateStr] = { date: new Date(dateStr), items: [], incomeSum: 0, expenseSum: 0 };
      }
      groups[dateStr].items.push(txn);
      
      const impact = getTransactionImpact(txn);
      groups[dateStr].incomeSum += impact.income;
      groups[dateStr].expenseSum += impact.expense;
    });
    return Object.values(groups).sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [filtered]);

  // Calendar calculations
  const calendarDays = useMemo(() => {
    const firstDay = new Date(selectedYear, selectedMonth, 1).getDay();
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    
    // Day-wise credit/debit aggregates
    const dayTotals: Record<number, { income: number; expense: number; items: Transaction[] }> = {};
    const rawTxns = filtered.filter(t => t.date && t.date.startsWith(monthKey));
    
    rawTxns.forEach(t => {
      const day = new Date(t.date).getDate();
      if (!dayTotals[day]) {
        dayTotals[day] = { income: 0, expense: 0, items: [] };
      }
      const impact = getTransactionImpact(t);
      dayTotals[day].income += impact.income;
      dayTotals[day].expense += impact.expense;
      dayTotals[day].items.push(t);
    });

    const grid = [];
    for (let i = 0; i < firstDay; i++) {
      grid.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      grid.push({
        day: d,
        income: dayTotals[d]?.income || 0,
        expense: dayTotals[d]?.expense || 0,
        items: dayTotals[d]?.items || []
      });
    }
    return grid;
  }, [selectedYear, selectedMonth, monthKey, filtered]);

  // Calendar selected day transactions
  const selectedDayTransactions = useMemo(() => {
    if (selectedCalendarDay === null) return [];
    const targetPrefix = `${monthKey}-${String(selectedCalendarDay).padStart(2, '0')}`;
    return filtered.filter(t => t.date && t.date.startsWith(targetPrefix));
  }, [filtered, monthKey, selectedCalendarDay]);

  // Monthly breakdown for current selected year
  const monthlySummaryList = useMemo(() => {
    const summary: Record<number, { income: number; expense: number; count: number }> = {};
    for (let m = 0; m < 12; m++) {
      summary[m] = { income: 0, expense: 0, count: 0 };
    }

    const matchFilters = (t: Transaction) => {
      if (typeFilter !== 'all') {
        if (typeFilter === 'cash-in') {
          if (t.type !== 'income' && t.type !== 'transfer') return false;
        } else if (typeFilter === 'cash-out') {
          if (t.type !== 'expense' && t.type !== 'transfer') return false;
        } else if (t.type !== typeFilter) {
          return false;
        }
      }

      if (typeFilter === 'transfer') {
        const matchSource = accountFilter === 'all' || t.account === accountFilter;
        const matchDest = destinationAccountFilter === 'all' || t.toAccount === destinationAccountFilter;
        if (!matchSource || !matchDest) return false;
      } else if (typeFilter === 'cash-in') {
        if (accountFilter !== 'all') {
          const matched = t.type === 'transfer' ? t.toAccount === accountFilter : t.account === accountFilter;
          if (!matched) return false;
        }
      } else if (typeFilter === 'cash-out') {
        if (accountFilter !== 'all') {
          const matched = t.type === 'transfer' ? t.account === accountFilter : t.account === accountFilter;
          if (!matched) return false;
        }
      } else {
        const matched = accountFilter === 'all' || t.account === accountFilter || t.toAccount === accountFilter;
        if (!matched) return false;
      }

      if (typeFilter !== 'transfer') {
        if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
      }

      if (search.trim() !== '') {
        const q = search.toLowerCase();
        const accName = getAccountName(t.account).toLowerCase();
        const toAccName = t.toAccount ? getAccountName(t.toAccount).toLowerCase() : '';
        const note = (t.notes || '').toLowerCase();
        const matchesSearch = 
          t.description.toLowerCase().includes(q) ||
          (t.category || '').toLowerCase().includes(q) ||
          accName.includes(q) ||
          toAccName.includes(q) ||
          note.includes(q);
        if (!matchesSearch) return false;
      }

      return true;
    };

    transactions.forEach((t) => {
      if (!t.date) return;
      const d = new Date(t.date);
      if (d.getFullYear() === selectedYear) {
        if (!matchFilters(t)) return;
        const m = d.getMonth();
        const impact = getTransactionImpact(t);
        summary[m].income += impact.income;
        summary[m].expense += impact.expense;
        summary[m].count += 1;
      }
    });

    return Object.entries(summary).map(([mStr, data]) => ({
      monthIdx: Number(mStr),
      name: MONTH_NAMES[Number(mStr)],
      ...data,
      net: data.income - data.expense,
    }));
  }, [
    transactions,
    selectedYear,
    typeFilter,
    accountFilter,
    categoryFilter,
    destinationAccountFilter,
    search,
    accounts,
    getAccountName
  ]);

  // Totals view aggregates by Category
  const categoryTotals = useMemo(() => {
    const expenses: Record<string, { amount: number; count: number }> = {};
    const incomes: Record<string, { amount: number; count: number }> = {};
    let totalExpenseSum = 0;
    let totalIncomeSum = 0;

    filtered.forEach((t) => {
      if (t.type === 'expense') {
        expenses[t.category] = expenses[t.category] || { amount: 0, count: 0 };
        expenses[t.category].amount += t.amount;
        expenses[t.category].count += 1;
        totalExpenseSum += t.amount;
      } else if (t.type === 'income') {
        incomes[t.category] = incomes[t.category] || { amount: 0, count: 0 };
        incomes[t.category].amount += t.amount;
        incomes[t.category].count += 1;
        totalIncomeSum += t.amount;
      }
    });

    const expenseList = Object.entries(expenses)
      .map(([name, data]) => ({ name, ...data, percentage: totalExpenseSum > 0 ? Math.round((data.amount / totalExpenseSum) * 100) : 0 }))
      .sort((a, b) => b.amount - a.amount);

    const incomeList = Object.entries(incomes)
      .map(([name, data]) => ({ name, ...data, percentage: totalIncomeSum > 0 ? Math.round((data.amount / totalIncomeSum) * 100) : 0 }))
      .sort((a, b) => b.amount - a.amount);

    return {
      expenseList,
      incomeList,
      totalExpenseSum,
      totalIncomeSum
    };
  }, [filtered]);

  const formatVal = (val: number) => {
    return val.toLocaleString('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    });
  };

  const getDayName = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { weekday: 'short' });
  };

  return (
    <div 
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="max-w-2xl mx-auto px-0 md:px-3.5 py-2 space-y-2.5 bg-background min-h-[90vh]"
    >
      
      {/* 0. Top Title Bar with Heading "Transactions" & Centered Trip Button */}
      <div className="px-3.5 md:px-0 pt-1 pb-2 border-b border-border/40 grid grid-cols-3 items-center">
        <div className="flex items-center justify-start">
          <h1 className="text-lg md:text-xl font-black text-foreground tracking-tight uppercase">Transactions</h1>
        </div>
        
        <div className="flex justify-center">
          <button
            onClick={handleTripButtonClick}
            className={`px-3.5 py-1 rounded-full text-xs font-bold transition-all duration-200 shadow-sm cursor-pointer text-center truncate max-w-[160px] ${
              activeTrip
                ? 'bg-amber-500 text-white border border-amber-400 shadow-amber-500/30 animate-pulse ring-2 ring-amber-400/40'
                : 'bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20'
            }`}
            title={activeTrip ? `Tap to stop ${activeTrip.name}` : 'Start Trip'}
          >
            {activeTrip ? activeTrip.name : 'Trip'}
          </button>
        </div>

        <div className="flex justify-end">
          <button
            onClick={() => router.push('/trips')}
            className="text-2xs font-bold text-muted-foreground hover:text-primary transition"
          >
            Trips &rarr;
          </button>
        </div>
      </div>

      {/* 1. Header Navigation: Month Selector, Search/Filter buttons */}
      <div className="px-3.5 md:px-0">
        <div className="flex items-center justify-between py-1 bg-transparent border-b border-border/40">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => shiftMonth(-1)}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/30 transition active:scale-95 flex items-center justify-center h-10 w-10 shrink-0"
              aria-label="Previous Month"
            >
              <ChevronLeft size={18} />
            </button>
            
            {/* Month select dropdown */}
            <div className="relative inline-block">
              <select
                value={selectedMonth}
                onChange={(e) => updateDate(parseInt(e.target.value, 10), selectedYear)}
                className="h-10 text-sm bg-secondary border border-border/80 rounded-xl pl-3 pr-7 font-bold uppercase appearance-none cursor-pointer hover:border-primary/40 focus:border-primary focus:outline-none transition-all duration-150"
                aria-label="Select Month"
              >
                {MONTH_NAMES.map((m, i) => (
                  <option key={m} value={i} className="bg-secondary text-foreground uppercase text-xs font-semibold">
                    {m.slice(0, 3)}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={12}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none opacity-80"
              />
            </div>

            {/* Year select dropdown */}
            <div className="relative inline-block border-l border-border/30 pl-2">
              <select
                value={selectedYear}
                onChange={(e) => updateDate(selectedMonth, parseInt(e.target.value, 10))}
                className="h-10 text-sm bg-secondary border border-border/80 rounded-xl pl-3 pr-7 font-bold appearance-none cursor-pointer hover:border-primary/40 focus:border-primary focus:outline-none transition-all duration-150"
                aria-label="Select Year"
              >
                {availableYears.map((y) => (
                  <option key={y} value={y} className="bg-secondary text-foreground text-xs font-semibold">
                    {y}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={12}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none opacity-80"
              />
            </div>

            <button 
              onClick={() => shiftMonth(1)}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/30 transition active:scale-95 flex items-center justify-center h-10 w-10 shrink-0"
              aria-label="Next Month"
            >
              <ChevronRight size={18} />
            </button>

            <button
              onClick={goToToday}
              disabled={selectedMonth === now.getMonth() && selectedYear === now.getFullYear()}
              className="h-8 px-2.5 bg-secondary/80 border border-border/60 text-foreground disabled:text-muted-foreground/50 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted/40 font-bold rounded-lg text-2xs transition duration-150 flex items-center gap-1 active:scale-95 shrink-0"
            >
              Today
            </button>
          </div>

          <div className="flex items-center gap-1">
            {accountFilter !== 'all' && (
              <>
                <button 
                  onClick={handleOpenEditAccount}
                  className="p-1.5 rounded-md transition border border-transparent text-primary hover:bg-primary/10 active:scale-95 flex items-center gap-1 text-[11px] font-bold"
                  title="Edit Account Details"
                >
                  <Edit3 size={14} />
                  <span>Edit</span>
                </button>
                <button 
                  onClick={() => setShowAccountChart(!showAccountChart)}
                  className={`p-1.5 rounded-md transition border ${
                    showAccountChart 
                      ? 'bg-primary/10 border-primary text-primary shadow-sm' 
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`}
                  title="Show Account Graph"
                >
                  <BarChart3 size={16} />
                </button>
              </>
            )}

            <button 
              onClick={() => setShowFiltersPanel(!showFiltersPanel)}
              className={`p-1.5 rounded-md transition border ${
                showFiltersPanel 
                  ? 'bg-primary/10 border-primary text-primary shadow-sm' 
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
              title="Toggle Filters"
            >
              <Filter size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Filters Collapsible Sheet */}
      {showFiltersPanel && (
        <div className="bg-secondary p-3 rounded-lg border border-border space-y-2.5 animate-slide-up">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Search description</label>
              <input
                type="text"
                placeholder="Type keywords..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-xs bg-background border border-border rounded px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Account</label>
              <select
                value={accountFilter}
                onChange={(e) => setAccountFilter(e.target.value)}
                className="w-full text-xs bg-background border border-border rounded px-2.5 py-1.5 text-foreground focus:outline-none focus:border-primary"
              >
                <option value="all">All Accounts</option>
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Category</label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full text-xs bg-background border border-border rounded px-2.5 py-1.5 text-foreground focus:outline-none focus:border-primary"
              >
                <option value="all">All Categories</option>
                {filterCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/60">
            <div className="flex gap-1">
              {(['all', 'income', 'expense', 'transfer'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => handleTypeFilterChange(t)}
                  className={`px-2 py-1 text-2xs font-bold uppercase rounded transition ${
                    typeFilter === t
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                setSearch('');
                setAccountFilter('all');
                setCategoryFilter('all');
                setTypeFilter('all');
                toast.success('Filters cleared');
              }}
              className="text-2xs font-bold text-primary uppercase tracking-wider px-2 py-1 bg-background hover:bg-muted/30 rounded border border-border"
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {/* Account Bar Graph Collapsible Panel */}
      {showAccountChart && accountFilter !== 'all' && (
        <div className="bg-secondary p-4 rounded-lg border border-border/80 space-y-3.5 animate-slide-up">
          <div className="flex items-center justify-between border-b border-border/40 pb-2">
            <div>
              <h3 className="text-xs font-black text-foreground uppercase tracking-wider">
                📊 {getAccountName(accountFilter)} Activity
              </h3>
              <p className="text-3xs text-muted-foreground mt-0.5 font-medium">
                Income vs Expense breakdown for the selected period
              </p>
            </div>
            <div className="flex items-center gap-3 text-3xs font-semibold">
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-sm bg-positive" />
                <span className="text-muted-foreground">Income</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-sm bg-negative" />
                <span className="text-muted-foreground">Expenses</span>
              </div>
            </div>
          </div>

          {accountChartData.length === 0 ? (
            <div className="h-44 flex items-center justify-center text-xs text-muted-foreground">
              No transactions to display on graph.
            </div>
          ) : (
            <div className="w-full select-none select-scrollbar overflow-x-auto">
              <div style={{ minWidth: '100%' }}>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart
                    data={accountChartData}
                    margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey={chartDataKey}
                      tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(v) => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                      tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }}
                      axisLine={false}
                      tickLine={false}
                      width={35}
                    />
                    <Tooltip
                      content={
                        <CustomBarTooltip />
                      }
                      cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                    />
                    <Bar
                      dataKey="income"
                      fill="var(--positive)"
                      opacity={0.8}
                      radius={[3, 3, 0, 0]}
                      name="Income"
                    />
                    <Bar
                      dataKey="expense"
                      fill="var(--negative)"
                      opacity={0.8}
                      radius={[3, 3, 0, 0]}
                      name="Expenses"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. Secondary View tabs: Daily, Calendar, Monthly, Total, Note */}
      <div className="flex border-b border-border/30">
        {(['daily', 'calendar', 'monthly', 'total', 'note'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              if (tab !== 'calendar') setSelectedCalendarDay(null);
            }}
            className={`flex-1 text-center py-2.5 text-xs font-bold uppercase tracking-wider transition border-b-2 ${
              activeTab === tab 
                ? 'border-primary text-primary font-black' 
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* 3. Transaction Summary Banner */}
      <div className="grid grid-cols-3 bg-secondary/35 py-2 rounded-md border border-border/30 text-center font-mono tabular-nums text-xs">
        <div>
          <span className="text-[11px] font-semibold text-muted-foreground uppercase block">Income</span>
          <span className="text-sm font-bold text-positive block mt-0.5">{formatVal(totals.income)}</span>
        </div>
        <div className="border-x border-border/30">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase block">Expenses</span>
          <span className="text-sm font-bold text-negative block mt-0.5">{formatVal(totals.expense)}</span>
        </div>
        <div>
          <span className="text-[11px] font-semibold text-muted-foreground uppercase block">Net</span>
          <span className={`text-sm font-bold block mt-0.5 ${totals.net >= 0 ? 'text-positive' : 'text-negative'}`}>
            {totals.net >= 0 ? '+' : ''}{formatVal(totals.net)}
          </span>
        </div>
      </div>

      {/* 4. Tab Views Contents */}
      <div className="space-y-3 min-h-[300px]">
        {isLoading ? (
          <div className="space-y-2.5 py-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={`loader-${i}`} className="animate-pulse bg-secondary/30 h-10 border border-border/40 rounded flex items-center justify-between px-3">
                <div className="h-3 w-16 bg-muted/65 rounded" />
                <div className="h-3 w-28 bg-muted/40 rounded" />
                <div className="h-3 w-14 bg-muted/50 rounded" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* DAILY TAB */}
            {activeTab === 'daily' && (
              <div className="space-y-4">
                {groupedDailyTransactions.length === 0 ? (
                  <p className="text-center text-xs text-muted-foreground py-10 font-medium">No records found for this period.</p>
                ) : (
                  groupedDailyTransactions.map((group) => {
                    const day = group.date.getDate();
                    const weekday = getDayName(group.date.toISOString().slice(0, 10));
                    
                    return (
                      <div key={group.date.toISOString()} className="bg-secondary rounded-lg border border-border/60 overflow-hidden">
                        {/* Day Group Header */}
                        <div className="flex items-center justify-between py-2 px-3.5 bg-secondary/50 border-b border-border/55">
                          <div className="flex items-baseline gap-2">
                            <span className="text-lg font-bold text-primary leading-none">{day}</span>
                            <span className="text-[10px] font-semibold uppercase text-primary/80">{weekday}</span>
                            <span className="text-xs text-muted-foreground font-normal">
                              {group.date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs font-semibold font-mono text-right">
                            {group.incomeSum > 0 && <span className="text-positive">{formatVal(group.incomeSum)}</span>}
                            {group.expenseSum > 0 && <span className="text-negative">{formatVal(group.expenseSum)}</span>}
                          </div>
                        </div>

                        {/* Transaction Rows */}
                        <div className="divide-y divide-border/30">
                          {group.items.map((txn) => {
                            const isIncome = txn.type === 'income';
                            const isTransfer = txn.type === 'transfer';
                            
                            const title = txn.description?.trim() || txn.category || 'Transaction';
                            
                            const accName = getAccountName(txn.account);
                            const toAccName = txn.toAccount ? getAccountName(txn.toAccount) : '';
                            
                            let metadata = '';
                            if (isTransfer) {
                              metadata = `${accName} → ${toAccName || 'Unknown'}`;
                            } else {
                              metadata = `${txn.category}  •  ${accName}`;
                            }
                            if (txn.notes) {
                              metadata += `  •  📝 ${txn.notes}`;
                            }
                            
                            const isTrip = Boolean(txn.tripId);

                            return (
                              <div 
                                key={txn.id}
                                onClick={() => startEditing(txn)}
                                className={`flex items-center justify-between py-2 pl-10 pr-3.5 transition cursor-pointer group relative border-b border-border/10 last:border-b-0 ${
                                  isTrip
                                    ? 'bg-amber-500/15 border-l-4 border-l-amber-500 hover:bg-amber-500/25'
                                    : 'hover:bg-secondary/45 active:bg-secondary/65'
                                }`}
                              >
                                <div className="flex-1 min-w-0 pr-3">
                                  <div className="text-sm font-semibold text-foreground truncate flex items-center gap-1.5">
                                    <span>{title}</span>
                                    {isTrip && (
                                      <span className="text-[10px] font-bold text-amber-500 bg-amber-500/20 px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0">
                                        ✈️ Trip
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] font-medium text-muted-foreground truncate mt-0.5">
                                    {metadata}
                                  </div>
                                </div>
                                <div className="text-right font-mono tabular-nums shrink-0 w-20">
                                  <span className={`text-sm font-bold block ${
                                    isTransfer 
                                      ? 'text-info' 
                                      : isIncome 
                                        ? 'text-positive' 
                                        : 'text-negative'
                                  }`}>
                                    {txn.amount.toLocaleString('en-IN')}
                                  </span>
                                  {/* Running Balance */}
                                  {showBalances && (
                                    <div className="text-[11px] text-muted-foreground/70 font-normal mt-0.5 animate-fade-in">
                                      {(() => {
                                        const bal = transactionBalances[txn.id];
                                        if (!bal) return '';
                                        return (bal.accountBalance || 0).toLocaleString('en-IN');
                                      })()}
                                    </div>
                                  )}
                                </div>
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

            {/* CALENDAR TAB */}
            {activeTab === 'calendar' && (
              <div className="space-y-4 animate-slide-up">
                {/* Calendar Grid */}
                <div className="bg-secondary p-2.5 rounded-lg border border-border/80 flex flex-col h-[calc(100vh-270px)] min-h-[380px] md:h-[480px]">
                  <div className="grid grid-cols-7 text-center border-b border-border/50 pb-1.5 mb-1.5 flex-shrink-0">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                      <span key={day} className="text-2xs font-bold text-muted-foreground uppercase">{day}</span>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1 flex-1">
                    {calendarDays.map((cell, idx) => {
                      if (!cell) return <div key={`empty-${idx}`} className="h-full opacity-0" />;
                      
                      const isSelected = selectedCalendarDay === cell.day;
                      const hasActivity = cell.income > 0 || cell.expense > 0;
                      
                      return (
                        <button
                          key={`day-${cell.day}`}
                          onClick={() => setSelectedCalendarDay(isSelected ? null : cell.day)}
                          className={`h-full rounded flex flex-col justify-between p-1.5 transition text-left border relative ${
                            isSelected 
                              ? 'bg-primary/20 border-primary' 
                              : 'bg-background hover:bg-muted/20 border-border/40'
                          }`}
                        >
                          <span className={`text-xs font-bold ${isSelected ? 'text-primary' : 'text-slate-300'}`}>
                            {cell.day}
                          </span>
                          {hasActivity && (
                            <div className="space-y-0.5 text-[9px] leading-tight font-mono text-right w-full mt-auto">
                              {cell.income > 0 && <span className="text-positive block font-bold">+{cell.income >= 1000 ? `${(cell.income / 1000).toFixed(0)}k` : cell.income}</span>}
                              {cell.expense > 0 && <span className="text-negative block font-bold">-{cell.expense >= 1000 ? `${(cell.expense / 1000).toFixed(0)}k` : cell.expense}</span>}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Day-specific transactions */}
                {selectedCalendarDay !== null && (
                  <div className="bg-secondary border border-border/60 rounded-lg overflow-hidden">
                    <div className="flex justify-between items-center bg-secondary/50 px-3.5 py-2 border-b border-border/55">
                      <span className="text-xs font-bold uppercase tracking-wider text-primary">Transactions on Day {selectedCalendarDay}</span>
                      <button onClick={() => setSelectedCalendarDay(null)} className="text-xs text-primary font-bold uppercase tracking-wider">Clear Selection</button>
                    </div>
                    
                    <div className="divide-y divide-border/30">
                      {selectedDayTransactions.length === 0 ? (
                        <p className="text-center text-xs text-muted-foreground py-4 font-semibold">No transactions recorded on this day.</p>
                      ) : (
                        selectedDayTransactions.map((txn) => {
                          const isIncome = txn.type === 'income';
                          const isTransfer = txn.type === 'transfer';
                          
                          const title = txn.description?.trim() || txn.category || 'Transaction';

                          const accName = getAccountName(txn.account);
                          const toAccName = txn.toAccount ? getAccountName(txn.toAccount) : '';
                          
                          let metadata = '';
                          if (isTransfer) {
                            metadata = `${accName} → ${toAccName || 'Unknown'}`;
                          } else {
                            metadata = `${txn.category}  •  ${accName}`;
                          }
                          if (txn.notes) {
                            metadata += `  •  📝 ${txn.notes}`;
                          }

                          const isTrip = Boolean(txn.tripId);

                          return (
                             <div 
                               key={txn.id}
                               onClick={() => startEditing(txn)}
                               className={`flex items-center justify-between py-2 pl-10 pr-3.5 transition cursor-pointer border-b border-border/20 last:border-b-0 ${
                                 isTrip
                                   ? 'bg-amber-500/15 border-l-4 border-l-amber-500 hover:bg-amber-500/25'
                                   : 'hover:bg-secondary/45 active:bg-secondary/65'
                               }`}
                             >
                               <div className="flex-1 min-w-0 pr-3">
                                 <div className="text-sm font-semibold text-foreground truncate flex items-center gap-1.5">
                                   <span>{title}</span>
                                   {isTrip && (
                                     <span className="text-[10px] font-bold text-amber-500 bg-amber-500/20 px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0">
                                       ✈️ Trip
                                     </span>
                                   )}
                                 </div>
                                 <div className="text-[11px] font-medium text-muted-foreground truncate mt-0.5">
                                   {metadata}
                                 </div>
                               </div>
                               <span className={`font-mono text-sm font-bold shrink-0 ${isTransfer ? 'text-info' : isIncome ? 'text-positive' : 'text-negative'}`}>
                                 {txn.amount.toLocaleString('en-IN')}
                               </span>
                             </div>
                           );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* MONTHLY TAB */}
            {activeTab === 'monthly' && (
              <div className="space-y-2 animate-slide-up font-mono text-xs font-bold">
                <div className="grid grid-cols-4 bg-secondary p-2 rounded-lg text-muted-foreground uppercase text-[10px] font-bold tracking-wider text-center border border-border/60">
                  <span className="text-left pl-2">Month</span>
                  <span>Income</span>
                  <span>Expense</span>
                  <span>Net</span>
                </div>
                
                <div className="space-y-1">
                  {monthlySummaryList.map((row) => (
                    <button
                      key={row.monthIdx}
                      onClick={() => {
                        updateDate(row.monthIdx, selectedYear);
                        setActiveTab('daily');
                        setSelectedCalendarDay(null);
                        toast.info(`Switched to ${row.name} ${selectedYear}`);
                      }}
                      className="w-full grid grid-cols-4 bg-secondary/35 border border-border/40 hover:bg-secondary/60 p-2.5 rounded hover:border-primary/40 transition text-center items-center cursor-pointer"
                    >
                      <span className="text-left text-foreground pl-2 text-xs">{row.name}</span>
                      <span className="text-positive text-xs">+{row.income.toLocaleString('en-IN')}</span>
                      <span className="text-negative text-xs">-{row.expense.toLocaleString('en-IN')}</span>
                      <span className={`text-xs ${row.net >= 0 ? 'text-positive' : 'text-negative'}`}>
                        {row.net >= 0 ? '+' : ''}{row.net.toLocaleString('en-IN')}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* TOTAL TAB */}
            {activeTab === 'total' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-slide-up text-xs">
                
                {/* Expenses Breakdown */}
                <div className="bg-secondary/40 p-3 rounded-lg border border-border/60 space-y-2.5">
                  <h3 className="text-xs font-bold text-negative uppercase tracking-wider pb-1.5 border-b border-border">Expenses Categories</h3>
                  {categoryTotals.expenseList.length === 0 ? (
                    <p className="text-center text-2xs text-muted-foreground py-6">No expenses in this period.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {categoryTotals.expenseList.map(cat => (
                        <div key={`exp-${cat.name}`} className="space-y-1">
                          <div className="flex justify-between items-center text-xs font-normal">
                            <span className="text-foreground">{cat.name} ({cat.count})</span>
                            <span className="font-mono font-normal text-negative">{formatVal(cat.amount)} ({cat.percentage}%)</span>
                          </div>
                          <div className="w-full bg-background h-1.5 rounded-full overflow-hidden border border-border/30">
                            <div className="bg-negative h-full rounded-full" style={{ width: `${cat.percentage}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Income Breakdown */}
                <div className="bg-secondary/40 p-3 rounded-lg border border-border/60 space-y-2.5">
                  <h3 className="text-xs font-bold text-positive uppercase tracking-wider pb-1.5 border-b border-border">Income Categories</h3>
                  {categoryTotals.incomeList.length === 0 ? (
                    <p className="text-center text-2xs text-muted-foreground py-6">No income in this period.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {categoryTotals.incomeList.map(cat => (
                        <div key={`inc-${cat.name}`} className="space-y-1">
                          <div className="flex justify-between items-center text-xs font-normal">
                            <span className="text-foreground">{cat.name} ({cat.count})</span>
                            <span className="font-mono font-normal text-positive">{formatVal(cat.amount)} ({cat.percentage}%)</span>
                          </div>
                          <div className="w-full bg-background h-1.5 rounded-full overflow-hidden border border-border/30">
                            <div className="bg-positive h-full rounded-full" style={{ width: `${cat.percentage}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* NOTE TAB */}
            {activeTab === 'note' && (
              <div className="space-y-3 animate-slide-up">
                {/* Add note button and Search */}
                <div className="flex gap-2 items-center">
                  <div className="flex-1 flex gap-2 bg-secondary p-2 rounded border border-border">
                    <input
                      type="text"
                      placeholder="Search notes..."
                      value={noteSearch}
                      onChange={(e) => setNoteSearch(e.target.value)}
                      className="w-full text-2xs bg-background border border-border rounded px-2.5 py-1.5 text-foreground focus:outline-none"
                    />
                    {noteSearch && (
                      <button 
                        onClick={() => setNoteSearch('')}
                        className="text-2xs font-bold text-primary px-2 uppercase"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setEditingGeneralNote(null);
                      setNoteTitle('');
                      setNoteContent('');
                      setIsGeneralNoteModalOpen(true);
                    }}
                    className="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/95 transition flex items-center gap-1.5 shrink-0"
                  >
                    <Plus size={14} /> Add Note
                  </button>
                </div>

                {/* General Notes List */}
                {(() => {
                  const query = noteSearch.toLowerCase().trim();
                  const filteredNotes = generalNotes.filter(
                    n => n.title.toLowerCase().includes(query) || n.content.toLowerCase().includes(query)
                  );
                  
                  if (filteredNotes.length === 0) {
                    return (
                      <div className="text-center py-12 bg-[#0b0f1a]/40 border border-border/40 rounded-xl space-y-1">
                        <p className="text-xs text-muted-foreground">No notes found.</p>
                        <p className="text-2xs text-muted-foreground/60">Create a general budget checklist, shopping list, or plan.</p>
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-1 gap-3">
                      {filteredNotes.map((note) => (
                        <div 
                          key={note.id}
                          className="bg-card border border-border rounded-xl p-4 flex flex-col justify-between hover:border-primary/40 transition group"
                        >
                          <div className="space-y-1.5">
                            <div className="flex items-start justify-between">
                              <h4 className="text-sm font-bold text-foreground">{note.title || 'Untitled Note'}</h4>
                              <span className="text-3xs text-muted-foreground shrink-0 font-mono">
                                {new Date(note.updatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">{note.content}</p>
                          </div>
                          <div className="flex justify-end items-center gap-3 mt-4 pt-3 border-t border-border/40">
                            <button
                              onClick={() => {
                                setEditingGeneralNote(note);
                                setNoteTitle(note.title);
                                setNoteContent(note.content);
                                setIsGeneralNoteModalOpen(true);
                              }}
                              className="text-2xs text-primary font-bold hover:underline"
                            >
                              Edit Note
                            </button>
                            <button
                              onClick={() => {
                                if (confirm('Are you sure you want to delete this note?')) {
                                  saveGeneralNotes(generalNotes.filter(n => n.id !== note.id));
                                  toast.success('Note deleted');
                                }
                              }}
                              className="text-2xs text-negative font-bold hover:underline"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}
          </>
        )}
      </div>

      {/* 5. Modals (Preserved existing functional modals, redesigned inside variables) */}
      
      {/* Edit Transaction Full Screen Page */}
      {editingTransaction && editForm && (
        <div className="fixed inset-0 z-50 bg-[#1F2027] flex flex-col text-[#F2F2F4] select-text animate-slide-up">
          {/* Header with Always Visible Save Button */}
          <div className="flex items-center justify-between h-14 px-5 bg-[#1F2027] shrink-0 border-b border-white/[0.08] sticky top-0 z-30">
            <div className="flex items-center">
              <button 
                type="button"
                onClick={() => {
                  setEditingTransaction(null);
                  setEditForm(null);
                }}
                className="text-[#F2F2F4] hover:bg-white/[0.08] transition flex items-center justify-center h-10 w-10 shrink-0 -ml-2 rounded-full"
                title="Cancel"
              >
                <ArrowLeft size={24} />
              </button>
              <h2 className="text-[20px] font-medium text-[#F2F2F4] ml-2 capitalize">
                {editForm.type}
              </h2>
            </div>

            <button
              type="button"
              onClick={handleSaveClick}
              className="px-4 py-2 bg-primary text-primary-foreground font-extrabold text-xs rounded-lg hover:opacity-90 active:scale-95 transition shadow-sm"
            >
              Save Transaction
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto w-full max-w-2xl mx-auto pb-8">
            <form onSubmit={handleSaveEdit} className="flex flex-col">
              
              {/* Transaction Type Selector */}
              <div className="grid grid-cols-3 gap-2.5 px-5 mt-2">
                {(['income', 'expense', 'transfer'] as const).map((t) => {
                  const isActive = editForm.type === t;
                  let activeStyle = '';
                  if (isActive) {
                    if (t === 'income') {
                      activeStyle = 'border border-[#22C55E] text-[#22C55E] bg-[#16171C]';
                    } else if (t === 'expense') {
                      activeStyle = 'border border-[#EF4444] text-[#EF4444] bg-[#16171C]';
                    } else {
                      activeStyle = 'border border-[#3B82F6] text-[#3B82F6] bg-[#16171C]';
                    }
                  } else {
                    activeStyle = 'border border-transparent text-[#A5A6AD] bg-[#16171C]';
                  }

                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => handleTypeChange(t)}
                      className={`h-10 rounded-lg text-[16px] font-medium capitalize transition duration-150 ${activeStyle}`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>

              {/* Vertical Form Fields (Gap of 20dp between selector and form) */}
              <div className="flex flex-col mt-5">
                
                {/* Date Row */}
                <div className="relative flex items-center h-[54px] border-b border-white/[0.08] px-5">
                  <span className="text-[15px] text-[#A5A6AD] w-[110px] shrink-0 font-normal">Date</span>
                  <div className="flex-1 flex justify-start text-[17px] text-[#F2F2F4] font-medium select-none pointer-events-none">
                    {formatDisplayDate(editForm.date)}
                  </div>
                  <input
                    type="datetime-local"
                    value={
                      editForm.date
                        ? (() => {
                            const d = new Date(editForm.date);
                            if (isNaN(d.getTime())) return '';
                            const yyyy = d.getFullYear();
                            const mm = String(d.getMonth() + 1).padStart(2, '0');
                            const dd = String(d.getDate()).padStart(2, '0');
                            const hh = String(d.getHours()).padStart(2, '0');
                            const min = String(d.getMinutes()).padStart(2, '0');
                            return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
                          })()
                        : ''
                    }
                    onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                    required
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                </div>

                {/* Amount Row */}
                <div className="relative flex items-center h-[54px] border-b border-white/[0.08] px-5">
                  <span className="text-[15px] text-[#A5A6AD] w-[110px] shrink-0 font-normal">Amount</span>
                  <div className="flex-1 flex items-center text-[17px] text-[#F2F2F4] font-medium">
                    <span className="mr-1">{currencySymbol}</span>
                    <input
                      type="number"
                      value={editForm.amount}
                      onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                      required
                      min="0.01"
                      step="any"
                      className="bg-transparent border-none text-left focus:outline-none text-[#F2F2F4] font-medium w-full p-0"
                    />
                  </div>
                </div>

                {/* Conditional Transfer Account Rows */}
                {editForm.type === 'transfer' ? (
                  <>
                    {/* From Account (Source Account) */}
                    <div className="relative flex items-center h-[54px] border-b border-white/[0.08] px-5">
                      <span className="text-[15px] text-[#A5A6AD] w-[110px] shrink-0 font-normal">Account</span>
                      <div className="flex-1 flex items-center text-[17px] text-[#F2F2F4] font-medium select-none pointer-events-none">
                        <span>{accounts.find(a => a.id === editForm.account)?.name || 'Select account'}</span>
                      </div>
                      <select
                        value={editForm.account}
                        onChange={(e) => setEditForm({ ...editForm, account: e.target.value })}
                        required
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      >
                        {accounts.map((acc) => (
                          <option key={acc.id} value={acc.id} className="bg-[#1F2027] text-[#F2F2F4]">
                            {acc.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* To Account (Destination Account) */}
                    <div className="relative flex items-center h-[54px] border-b border-white/[0.08] px-5">
                      <span className="text-[15px] text-[#A5A6AD] w-[110px] shrink-0 font-normal">To Account</span>
                      <div className="flex-1 flex items-center text-[17px] text-[#F2F2F4] font-medium select-none pointer-events-none">
                        <span>{accounts.find(a => a.id === editForm.toAccount)?.name || 'Select destination...'}</span>
                      </div>
                      <select
                        value={editForm.toAccount || ''}
                        onChange={(e) => setEditForm({ ...editForm, toAccount: e.target.value })}
                        required
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      >
                        <option value="" disabled className="text-muted-foreground">Select destination...</option>
                        {accounts.filter((acc) => acc.id !== editForm.account).map((acc) => (
                          <option key={acc.id} value={acc.id} className="bg-[#1F2027] text-[#F2F2F4]">
                            {acc.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Category Row */}
                    <div className="relative flex items-center h-[54px] border-b border-white/[0.08] px-5">
                      <span className="text-[15px] text-[#A5A6AD] w-[110px] shrink-0 font-normal">Category</span>
                      <div className="flex-1 flex items-center text-[17px] text-[#F2F2F4] font-medium select-none pointer-events-none">
                        <span className="mr-2 text-lg">
                          {currentCategoryObj?.icon || (editForm.category === 'Deleted Category' ? '🗑️' : '📁')}
                        </span>
                        <span>{editForm.category || 'Select category'}</span>
                      </div>
                      <select
                        value={editForm.category}
                        onChange={(e) => {
                          const newCat = e.target.value;
                          const targetCat = categories.find(c => c.name.toLowerCase() === newCat.toLowerCase());
                          const sub = targetCat?.subcategories && targetCat.subcategories.length > 0 ? targetCat.subcategories[0] : '';
                          setEditForm({ ...editForm, category: newCat, subcategory: sub });
                        }}
                        required
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      >
                        {editForm.category === 'Deleted Category' && <option value="Deleted Category">Deleted Category</option>}
                        {editCategories.map((cat) => (
                          <option key={cat.id} value={cat.name} className="bg-[#1F2027] text-[#F2F2F4]">
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Account Row */}
                    <div className="relative flex items-center h-[54px] border-b border-white/[0.08] px-5">
                      <span className="text-[15px] text-[#A5A6AD] w-[110px] shrink-0 font-normal">Account</span>
                      <div className="flex-1 flex items-center text-[17px] text-[#F2F2F4] font-medium select-none pointer-events-none">
                        <span>{accounts.find(a => a.id === editForm.account)?.name || 'Select account'}</span>
                      </div>
                      <select
                        value={editForm.account}
                        onChange={(e) => setEditForm({ ...editForm, account: e.target.value })}
                        required
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      >
                        {accounts.map((acc) => (
                          <option key={acc.id} value={acc.id} className="bg-[#1F2027] text-[#F2F2F4]">
                            {acc.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                {/* Note Row */}
                <div className="relative flex items-start py-4 border-b border-white/[0.08] px-5 min-h-[54px]">
                  <span className="text-[15px] text-[#A5A6AD] w-[110px] shrink-0 font-normal mt-0.5">Note</span>
                  <textarea
                    value={editForm.notes}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    rows={1}
                    className="bg-transparent border-none text-left text-[17px] text-[#F2F2F4] font-medium focus:outline-none w-full p-0 resize-none h-auto min-h-[26px]"
                    placeholder="Optional"
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = 'auto';
                      target.style.height = `${target.scrollHeight}px`;
                    }}
                  />
                </div>

              </div>

              {/* Description & Camera Section (Gap of 20dp between form and description) */}
              <div className="flex flex-col mt-5">
                <div className="relative flex items-center h-[54px] border-b border-white/[0.08] px-5">
                  <input
                    type="text"
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    required
                    placeholder="Description / Vendor"
                    className="bg-transparent border-none text-left text-[17px] text-[#F2F2F4] font-medium focus:outline-none w-full p-0 pr-8"
                  />
                  <Camera size={20} className="text-[#A5A6AD] hover:text-[#F2F2F4] cursor-pointer shrink-0 absolute right-5" />
                </div>
              </div>

              {/* Bottom Actions Grid (Gap of 20dp between description/camera and buttons) */}
              <div className="grid grid-cols-3 gap-3 px-5 mt-5">
                <button
                  type="button"
                  onClick={() => {
                    setDeletingTxn(editingTransaction);
                    setEditingTransaction(null);
                    setEditForm(null);
                  }}
                  className="h-12 rounded-[10px] border border-white/[0.15] bg-[#16171C] flex items-center justify-center gap-2 text-[15px] font-medium text-[#F2F2F4] hover:bg-white/[0.04] active:scale-95 transition-all"
                >
                  <Trash2 size={16} />
                  <span>Delete</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyTransaction}
                  className="h-12 rounded-[10px] border border-white/[0.15] bg-[#16171C] flex items-center justify-center gap-2 text-[15px] font-medium text-[#F2F2F4] hover:bg-white/[0.04] active:scale-95 transition-all"
                >
                  <Copy size={16} />
                  <span>Copy</span>
                </button>
                <button
                  type="button"
                  onClick={handleBookmarkTransaction}
                  className="h-12 rounded-[10px] border border-white/[0.15] bg-[#16171C] flex items-center justify-center gap-2 text-[15px] font-medium text-[#F2F2F4] hover:bg-white/[0.04] active:scale-95 transition-all"
                >
                  <Star size={16} />
                  <span>Bookmark</span>
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingTxn && (
        <Modal
          isOpen={!!deletingTxn}
          onClose={() => setDeletingTxn(null)}
          title="Delete Transaction"
          size="sm"
        >
          <div className="space-y-4 text-2xs leading-relaxed">
            <p className="text-muted-foreground">
              Are you sure you want to delete <span className="font-bold text-foreground">{deletingTxn.description}</span> for <span className="font-bold text-foreground">₹{deletingTxn.amount.toLocaleString('en-IN')}</span>?
            </p>
            
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  deleteTransaction(deletingTxn.id, 'reverse');
                  setDeletingTxn(null);
                  setTransactions(getTransactions(true));
                  toast.success('Transaction deleted and balances updated');
                }}
                className="w-full text-left p-3.5 bg-background border border-border hover:border-negative rounded-lg transition-all group flex flex-col gap-1"
              >
                <span className="font-bold text-foreground group-hover:text-negative transition-colors">1. Reverse effect on balance</span>
                <span className="text-[10px] text-muted-foreground">Permanently delete transaction and restore the account balance.</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  deleteTransaction(deletingTxn.id, 'note');
                  setDeletingTxn(null);
                  setTransactions(getTransactions(true));
                  toast.success('Transaction marked as Deleted Category');
                }}
                className="w-full text-left p-3.5 bg-background border border-border hover:border-primary rounded-lg transition-all group flex flex-col gap-1"
              >
                <span className="font-bold text-foreground group-hover:text-primary transition-colors">2. Retain balance, delete category</span>
                <span className="text-[10px] text-muted-foreground">Keep the transaction in the ledger, but label its category as deleted.</span>
              </button>
            </div>
            
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setDeletingTxn(null)}
                className="px-3.5 py-1.5 bg-secondary border border-border rounded text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Repayment Modal */}
      {editingRepayment && (
        <Modal
          isOpen={!!editingRepayment}
          onClose={() => setEditingRepayment(null)}
          title="Edit Repayment"
        >
          <form onSubmit={handleSaveEditedRepayment} className="space-y-3.5 text-2xs">
            <div>
              <label className="block text-[9px] font-bold text-muted-foreground uppercase mb-1">Source Account *</label>
              <select
                value={repaymentForm.paymentAccountId}
                onChange={(e) => setRepaymentForm({ ...repaymentForm, paymentAccountId: e.target.value })}
                required
                className="w-full rounded border border-border bg-background p-2 text-2xs font-bold focus:outline-none"
              >
                <option value="">Select payment source...</option>
                {accounts.filter((a) => a.type === 'accounts').map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} (₹{acc.balance.toLocaleString('en-IN')})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[9px] font-bold text-muted-foreground uppercase mb-1">Amount *</label>
                <input
                  type="number"
                  value={repaymentForm.amount}
                  onChange={(e) => setRepaymentForm({ ...repaymentForm, amount: e.target.value })}
                  required
                  className="w-full rounded border border-border bg-background p-2 text-2xs font-mono font-bold focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[9px] font-bold text-muted-foreground uppercase mb-1">Date *</label>
                <input
                  type="date"
                  value={repaymentForm.date}
                  onChange={(e) => setRepaymentForm({ ...repaymentForm, date: e.target.value })}
                  required
                  className="w-full rounded border border-border bg-background p-2 text-2xs font-bold focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[9px] font-bold text-muted-foreground uppercase mb-1">Notes</label>
              <textarea
                value={repaymentForm.notes}
                onChange={(e) => setRepaymentForm({ ...repaymentForm, notes: e.target.value })}
                className="w-full rounded border border-border bg-background p-2 text-2xs font-semibold focus:outline-none h-16 resize-none"
              />
            </div>

            <div className="flex gap-2.5 pt-1">
              <button
                type="submit"
                className="flex-1 py-2 bg-primary text-primary-foreground font-bold rounded hover:opacity-95 transition"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditingRepayment(null)}
                className="flex-1 py-2 bg-secondary border border-border rounded text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Repayment Modal */}
      {deletingRepayment && (
        <Modal
          isOpen={!!deletingRepayment}
          onClose={() => setDeletingRepayment(null)}
          title="Delete Repayment?"
          size="sm"
        >
          <div className="space-y-4 text-2xs leading-relaxed">
            <p className="text-muted-foreground">
              Are you sure you want to delete this repayment of <span className="font-bold text-foreground">₹{deletingRepayment.amount.toLocaleString('en-IN')}</span> on {new Date(deletingRepayment.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}?
            </p>
            <p className="bg-negative-subtle border border-negative-subtle p-2.5 rounded text-negative text-[10px] leading-normal font-semibold">
              ⚠️ Warning: This will delete principal/interest splits, restore the loan balances, and trigger chronological recalculation of repayments.
            </p>
            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleDeleteRepayment}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded transition"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setDeletingRepayment(null)}
                className="flex-1 py-2 bg-secondary border border-border rounded text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Account Modal */}
      {isEditAccountOpen && activeAccount && (
        <Modal
          isOpen={isEditAccountOpen}
          onClose={() => setIsEditAccountOpen(false)}
          title={`Edit Account: ${activeAccount.name}`}
          description={`Update details for your ${activeAccount.type} account`}
        >
          <form onSubmit={handleSaveAccount} className="space-y-4 text-xs font-semibold">
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                Account Name *
              </label>
              <input
                type="text"
                required
                value={editAccName}
                onChange={(e) => setEditAccName(e.target.value)}
                className="w-full text-sm bg-[#0b0f1a] border border-border rounded-lg px-3.5 py-2.5 text-slate-200 focus:outline-none focus:border-primary transition font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                Balance (₹) *
              </label>
              <input
                type="number"
                step="any"
                required
                value={editAccBalance}
                onChange={(e) => setEditAccBalance(e.target.value)}
                className="w-full text-sm bg-[#0b0f1a] border border-border rounded-lg px-3.5 py-2.5 text-slate-200 focus:outline-none focus:border-primary transition font-mono font-bold"
              />
            </div>

            {activeAccount.type === 'credit' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Credit Limit (₹)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={editAccLimit}
                    onChange={(e) => setEditAccLimit(e.target.value)}
                    className="w-full text-sm bg-[#0b0f1a] border border-border rounded-lg px-3.5 py-2.5 text-slate-200 focus:outline-none focus:border-primary transition font-mono font-bold"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 leading-none">
                      Cycle Start
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={editAccBillingCycle}
                      onChange={(e) => setEditAccBillingCycle(e.target.value)}
                      className="w-full text-sm bg-[#0b0f1a] border border-border rounded-lg px-2.5 py-2.5 text-slate-200 focus:outline-none focus:border-primary transition font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 leading-none">
                      Due Day (1-31)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={editAccDueDay}
                      onChange={(e) => setEditAccDueDay(e.target.value)}
                      className="w-full text-sm bg-[#0b0f1a] border border-border rounded-lg px-2.5 py-2.5 text-slate-200 focus:outline-none focus:border-primary transition font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 leading-none">
                      Min Payment
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={editAccMinPayment}
                      onChange={(e) => setEditAccMinPayment(e.target.value)}
                      className="w-full text-sm bg-[#0b0f1a] border border-border rounded-lg px-2.5 py-2.5 text-slate-200 focus:outline-none focus:border-primary transition font-mono font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Notify Me X Days Before Due Date
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="30"
                    value={editAccNotifyDays}
                    onChange={(e) => setEditAccNotifyDays(e.target.value)}
                    className="w-full text-sm bg-[#0b0f1a] border border-border rounded-lg px-3.5 py-2.5 text-slate-200 focus:outline-none focus:border-primary transition font-mono font-bold"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1 font-medium">
                    Set how many days in advance to show billing alerts on the dashboard (e.g. 3 or 5 days).
                  </p>
                </div>
              </div>
            )}

            {activeAccount.type === 'loan' && (
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Interest Rate (% p.a.)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={editAccInterest}
                  onChange={(e) => setEditAccInterest(e.target.value)}
                  className="w-full text-sm bg-[#0b0f1a] border border-border rounded-lg px-3.5 py-2.5 text-slate-200 focus:outline-none focus:border-primary transition font-mono font-bold"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                Notes / Description
              </label>
              <textarea
                value={editAccNotes}
                onChange={(e) => setEditAccNotes(e.target.value)}
                className="w-full text-sm bg-[#0b0f1a] border border-border rounded-lg px-3.5 py-2.5 text-slate-200 focus:outline-none focus:border-primary transition h-20 resize-none font-medium"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                className="flex-1 py-3 bg-primary text-primary-foreground font-extrabold rounded-lg hover:opacity-90 active:scale-95 transition"
              >
                Save Changes
              </button>
              <button
                type="button"
                onClick={() => setIsEditAccountOpen(false)}
                className="flex-1 py-3 bg-secondary text-muted-foreground hover:text-foreground font-extrabold rounded-lg border border-border transition"
              >
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* General Note Create/Edit Modal */}
      {isGeneralNoteModalOpen && (
        <Modal
          isOpen={isGeneralNoteModalOpen}
          onClose={() => {
            setIsGeneralNoteModalOpen(false);
            setEditingGeneralNote(null);
            setNoteTitle('');
            setNoteContent('');
          }}
          title={editingGeneralNote ? "Edit General Note" : "Add General Note"}
        >
          <form onSubmit={handleSaveGeneralNote} className="space-y-4 text-xs font-semibold">
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                Title (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Budget Plan, Grocery List"
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                className="w-full text-sm bg-[#0b0f1a] border border-border rounded-lg px-3.5 py-2.5 text-slate-200 focus:outline-none focus:border-primary transition font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                Note Content
              </label>
              <textarea
                placeholder="Write your note details here..."
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                rows={6}
                className="w-full text-sm bg-[#0b0f1a] border border-border rounded-lg px-3.5 py-2.5 text-slate-200 focus:outline-none focus:border-primary transition h-32 resize-none font-medium leading-relaxed"
                required
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                className="flex-1 py-3 bg-primary text-primary-foreground font-extrabold rounded-lg hover:opacity-90 active:scale-95 transition"
              >
                Save Note
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsGeneralNoteModalOpen(false);
                  setEditingGeneralNote(null);
                  setNoteTitle('');
                  setNoteContent('');
                }}
                className="flex-1 py-3 bg-secondary text-muted-foreground hover:text-foreground font-extrabold rounded-lg border border-border transition"
              >
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Start Trip Mode Modal */}
      {isStartTripModalOpen && (
        <Modal
          isOpen={isStartTripModalOpen}
          onClose={() => setIsStartTripModalOpen(false)}
          title="New Trip"
        >
          <form onSubmit={handleStartTripSubmit} className="space-y-4 text-xs font-semibold">
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                Trip Name *
              </label>
              <input
                type="text"
                placeholder="Trip Name"
                value={newTripName}
                onChange={(e) => setNewTripName(e.target.value)}
                className="w-full text-sm bg-secondary border border-border rounded-lg px-3.5 py-2.5 text-foreground focus:outline-none focus:border-primary transition font-bold"
                required
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Destination
                </label>
                <input
                  type="text"
                  placeholder="Destination"
                  value={newTripDestination}
                  onChange={(e) => setNewTripDestination(e.target.value)}
                  className="w-full text-sm bg-secondary border border-border rounded-lg px-3.5 py-2.5 text-foreground focus:outline-none focus:border-primary transition font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Budget (₹)
                </label>
                <input
                  type="number"
                  placeholder="Budget"
                  value={newTripBudget}
                  onChange={(e) => setNewTripBudget(e.target.value)}
                  className="w-full text-sm bg-secondary border border-border rounded-lg px-3.5 py-2.5 text-foreground focus:outline-none focus:border-primary transition font-bold"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                className="flex-1 py-3 bg-primary text-primary-foreground font-extrabold rounded-lg hover:opacity-90 active:scale-95 transition shadow-sm"
              >
                Start Trip
              </button>
              <button
                type="button"
                onClick={() => setIsStartTripModalOpen(false)}
                className="flex-1 py-3 bg-secondary text-muted-foreground hover:text-foreground font-extrabold rounded-lg border border-border transition"
              >
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

    </div>
  );
}

export default function TransactionsPage() {
  return (
    <AppLayout>
      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-medium text-muted-foreground">Loading transactions...</p>
            </div>
          </div>
        }
      >
        <Suspense>
          <TransactionsPageContent />
        </Suspense>
      </Suspense>
    </AppLayout>
  );
}
