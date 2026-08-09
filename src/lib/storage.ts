'use client';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SplitMember {
  name: string;
  share: number;
  paid: number;
  pending: number;
}

export interface SplitDetails {
  id: string;
  transactionId: string;
  name?: string;
  totalAmount: number;
  myShare: number;
  toReceive: number;
  received: number;
  pending: number;
  splitMethod: 'equal' | 'custom';
  members: SplitMember[];
  status: 'pending' | 'partially_paid' | 'paid';
  createdAt: string;
  updatedAt: string;
}

export interface SplitPaymentRecord {
  id: string;
  splitId: string;
  transactionId: string;
  personName: string;
  amount: number;
  date: string;
  paymentAccountId?: string;
  notes?: string;
  createdAt: string;
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  category: string;
  subcategory?: string;
  account: string;
  toAccount?: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  notes?: string;
  tripId?: string;
  isSplit?: boolean;
  splitDetails?: SplitDetails;
  createdAt: string;
}

export interface Trip {
  id: string;
  name: string;
  startDate: string;
  endDate?: string;
  budget?: number;
  currency?: string;
  description?: string;
  status: 'active' | 'completed' | 'planned';
  color?: string;
  icon?: string;
  destination?: string;
  createdAt: string;
}

export interface AccountCategory {
  id: string;
  name: string;
  baseType: 'accounts' | 'cash' | 'credit' | 'loan';
  icon?: string;
}

export interface Account {
  id: string;
  name: string;
  type: 'accounts' | 'cash' | 'credit' | 'loan';
  category?: string;
  balance: number;
  color: string;
  visible?: boolean;
  openingBalance?: number;
  icon?: string;

  // Credit Card fields
  creditLimit?: number;
  dueDate?: string;
  minPayment?: number;
  billingCycle?: string;
  notificationDaysBefore?: number;

  // Loan fields
  originalAmount?: number;
  emiAmount?: number;
  interestRate?: number;
  lenderName?: string;
  startDate?: string;
  interestType?: 'reducing' | 'flat' | 'manual' | 'simple' | 'compound';
  tenureMonths?: number;
  remainingTenureMonths?: number;
  firstEmiDate?: string;
  emiDueDay?: number;
  nextEmiDate?: string;
  accruedInterest?: number;
  totalPrincipalRepaid?: number;
  totalInterestPaid?: number;
  totalAmountPaid?: number;
  lastInterestProcessedDate?: string;
  loanStatus?: 'active' | 'paid_off' | 'closed' | 'on_hold';
  loanAccountNumber?: string;
  processingFee?: number;
  prepaymentCharges?: number;
  latePaymentCharges?: number;
  linkedPaymentAccountId?: string;
  autoCreateEmi?: boolean;
  isInformal?: boolean;
  isInformalLoan?: boolean;
  interestStartDate?: string;
  interestAccrualMethod?: string;
  compoundingFrequency?: 'monthly' | 'quarterly' | 'half-yearly' | 'yearly';
  expectedRepaymentDate?: string;

  // Main Account fields
  bankName?: string;
  accountNumber?: string;
  archived?: boolean;
  notes?: string;
}

export interface Budget {
  id: string;
  name: string;
  category: string;
  allocated: number;
  month: string;
  isModified?: boolean;
  createdFromTemplate?: boolean;
}

export interface Category {
  id: string;
  name: string;
  type: 'expense' | 'income';
  color: string;
  icon: string;
  subcategories?: string[];
}

// ── Storage Keys ──────────────────────────────────────────────────────────────

const KEYS = {
  TRANSACTIONS: 'wealthiq_transactions',
  ACCOUNTS: 'wealthiq_accounts',
  BUDGETS: 'wealthiq_budgets',
  CATEGORIES: 'wealthiq_categories',
  TRIPS: 'wealthiq_trips',
  ACTIVE_TRIP_ID: 'wealthiq_active_trip_id',
  TRIP_BG_COLOR: 'wealthiq_trip_bg_color',
  RECYCLE_BIN: 'wealthiq_recycle_bin',
  SPLIT_EXPENSES: 'wealthiq_split_expenses',
  SPLIT_PAYMENTS: 'wealthiq_split_payments',
};

// ── Default Categories ────────────────────────────────────────────────────────

const LEGACY_DEFAULT_CATEGORY_IDS = [
  'cat-food',
  'cat-transport',
  'cat-shopping',
  'cat-entertainment',
  'cat-utilities',
  'cat-healthcare',
  'cat-groceries',
  'cat-fuel',
  'cat-emi',
  'cat-investments',
  'cat-education',
  'cat-other-exp',
  'cat-salary',
  'cat-freelance',
  'cat-business',
  'cat-investment-ret',
  'cat-rental',
  'cat-gift',
  'cat-other-inc',
];
const DEFAULT_CATEGORIES: Category[] = [];

// ── Category CRUD ─────────────────────────────────────────────────────────────

export function getCategories(): Category[] {
  if (typeof window === 'undefined') return DEFAULT_CATEGORIES;
  try {
    const raw = localStorage.getItem(KEYS.CATEGORIES);
    if (!raw) {
      localStorage.setItem(KEYS.CATEGORIES, JSON.stringify(DEFAULT_CATEGORIES));
      return DEFAULT_CATEGORIES;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_CATEGORIES;
    return parsed.filter(Boolean);
  } catch {
    return DEFAULT_CATEGORIES;
  }
}

export function saveCategories(categories: Category[]): void {
  localStorage.setItem(KEYS.CATEGORIES, JSON.stringify(categories));
}

export function addCategory(category: Omit<Category, 'id'>): Category {
  const all = getCategories();
  const newCat: Category = {
    ...category,
    id: `cat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  };
  all.push(newCat);
  saveCategories(all);
  return newCat;
}

export function deleteCategory(id: string): void {
  const all = getCategories().filter((c) => c.id !== id);
  saveCategories(all);
}

export function getExpenseCategories(): string[] {
  return getCategories()
    .filter((c) => c.type === 'expense')
    .map((c) => c.name)
    .sort();
}

export function getIncomeCategories(): string[] {
  return getCategories()
    .filter((c) => c.type === 'income')
    .map((c) => c.name)
    .sort();
}

// ── Split Expenses CRUD ───────────────────────────────────────────────────────

export function getSplitExpenses(): SplitDetails[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEYS.SPLIT_EXPENSES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveSplitExpenses(splits: SplitDetails[]): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(KEYS.SPLIT_EXPENSES, JSON.stringify(splits));
  }
}

export function saveSplitExpense(split: SplitDetails): void {
  const all = getSplitExpenses();
  const idx = all.findIndex((s) => s.id === split.id || s.transactionId === split.transactionId);
  if (idx >= 0) {
    all[idx] = split;
  } else {
    all.unshift(split);
  }
  saveSplitExpenses(all);
}

export function getSplitExpenseByTxnId(transactionId: string): SplitDetails | undefined {
  return getSplitExpenses().find((s) => s.transactionId === transactionId);
}

export function deleteSplitExpense(transactionId: string): void {
  const all = getSplitExpenses().filter((s) => s.transactionId !== transactionId);
  saveSplitExpenses(all);
}

export function getSplitPayments(): SplitPaymentRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEYS.SPLIT_PAYMENTS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveSplitPayments(payments: SplitPaymentRecord[]): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(KEYS.SPLIT_PAYMENTS, JSON.stringify(payments));
  }
}

export function recordSplitRepayment(params: {
  splitId?: string;
  transactionId?: string;
  personName: string;
  amount: number;
  paymentAccountId?: string;
  date?: string;
  notes?: string;
}): { updatedSplit: SplitDetails; paymentRecord: SplitPaymentRecord } {
  const splits = getSplitExpenses();
  const target = splits.find(
    (s) => (params.splitId && s.id === params.splitId) || (params.transactionId && s.transactionId === params.transactionId)
  );
  if (!target) {
    throw new Error('Split expense record not found');
  }

  const pmtAmount = Math.max(0, Number(params.amount) || 0);
  if (pmtAmount <= 0) {
    throw new Error('Invalid repayment amount');
  }

  const memberIdx = target.members.findIndex(
    (m) => m.name.trim().toLowerCase() === params.personName.trim().toLowerCase()
  );
  if (memberIdx < 0) {
    throw new Error(`Person "${params.personName}" not found in this split expense.`);
  }

  const member = target.members[memberIdx];
  const newMemberPaid = Math.min(member.share, Number((member.paid + pmtAmount).toFixed(2)));
  const newMemberPending = Math.max(0, Number((member.share - newMemberPaid).toFixed(2)));

  target.members[memberIdx] = {
    ...member,
    paid: newMemberPaid,
    pending: newMemberPending,
  };

  const totalReceived = Number(target.members.reduce((sum, m) => sum + m.paid, 0).toFixed(2));
  const totalPending = Math.max(0, Number((target.toReceive - totalReceived).toFixed(2)));
  let status: 'pending' | 'partially_paid' | 'paid' = 'pending';
  if (totalPending <= 0 && totalReceived >= target.toReceive) {
    status = 'paid';
  } else if (totalReceived > 0) {
    status = 'partially_paid';
  }

  target.received = totalReceived;
  target.pending = totalPending;
  target.status = status;
  target.updatedAt = new Date().toISOString();

  saveSplitExpense(target);

  // Update linked transaction in storage
  const allTxns = getTransactions(true);
  const txnIdx = allTxns.findIndex((t) => t.id === target.transactionId);
  if (txnIdx >= 0) {
    allTxns[txnIdx].isSplit = true;
    allTxns[txnIdx].splitDetails = target;
    localStorage.setItem(KEYS.TRANSACTIONS, JSON.stringify(allTxns));
  }

  const newRecord: SplitPaymentRecord = {
    id: `pmt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    splitId: target.id,
    transactionId: target.transactionId,
    personName: params.personName,
    amount: pmtAmount,
    date: params.date || new Date().toISOString(),
    paymentAccountId: params.paymentAccountId,
    notes: params.notes,
    createdAt: new Date().toISOString(),
  };

  const payments = getSplitPayments();
  payments.unshift(newRecord);
  saveSplitPayments(payments);

  return { updatedSplit: target, paymentRecord: newRecord };
}

// ── Transactions ──────────────────────────────────────────────────────────────

export function getTransactions(includeHidden = false): Transaction[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEYS.TRANSACTIONS);
    const txns: any[] = raw ? JSON.parse(raw) : [];
    const splits = getSplitExpenses();
    const splitMap = new Map(splits.map((s) => [s.transactionId, s]));

    let mapped = txns.filter(Boolean).map((t) => {
      let dateStr = '';
      if (t.date) {
        if (typeof t.date === 'string') {
          dateStr = t.date;
        } else if (t.date instanceof Date) {
          dateStr = t.date.toISOString().slice(0, 10);
        } else if (typeof t.date === 'object' && t.date.toISOString) {
          dateStr = t.date.toISOString().slice(0, 10);
        } else {
          dateStr = String(t.date);
        }
      } else {
        dateStr = new Date().toISOString().slice(0, 10);
      }

      const splitObj = t.splitDetails || splitMap.get(t.id);

      return {
        ...t,
        date: dateStr,
        isSplit: Boolean(t.isSplit || splitObj),
        splitDetails: splitObj,
        category:
          t.category === null || t.category === undefined
            ? t.type === 'transfer'
              ? 'Transfer'
              : 'Other'
            : t.category,
      };
    });

    if (!includeHidden) {
      // Directly check localStorage to avoid circular dependency with getAccounts()
      const rawAcc = localStorage.getItem(KEYS.ACCOUNTS);
      const accList: any[] = rawAcc ? JSON.parse(rawAcc) : [];
      const hiddenIds = new Set(accList.filter((a) => a && a.visible === false).map((a) => a.id));
      if (hiddenIds.size > 0) {
        mapped = mapped.filter(
          (t) => !hiddenIds.has(t.account) && (!t.toAccount || !hiddenIds.has(t.toAccount))
        );
      }
    }

    return mapped;
  } catch {
    return [];
  }
}

export function saveTransaction(txn: Omit<Transaction, 'id' | 'createdAt'>): Transaction {
  const all = getTransactions(true);
  let dateStr = '';
  if (txn.date) {
    const rawDate = txn.date as any;
    if (typeof rawDate === 'string') {
      dateStr = rawDate;
    } else if (rawDate instanceof Date) {
      dateStr = rawDate.toISOString();
    } else if (typeof rawDate === 'object' && rawDate.toISOString) {
      dateStr = rawDate.toISOString();
    } else {
      dateStr = String(rawDate);
    }
  } else {
    dateStr = new Date().toISOString();
  }

  if (dateStr.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const currentISO = new Date().toISOString();
    dateStr = `${dateStr}T${currentISO.slice(11)}`;
  }

  const activeTrip = getActiveTrip();
  const description = (txn.description || '').trim() || (txn.type === 'transfer' ? 'Transfer' : (txn.category || 'Expense'));
  const txnId = `txn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  
  let splitObj = txn.splitDetails;
  if (txn.isSplit && splitObj) {
    splitObj = {
      ...splitObj,
      id: splitObj.id || `split-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      transactionId: txnId,
      createdAt: splitObj.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveSplitExpense(splitObj);
  }

  const newTxn: Transaction = {
    ...txn,
    description,
    tripId: txn.tripId || activeTrip?.id,
    date: dateStr,
    id: txnId,
    isSplit: Boolean(txn.isSplit),
    splitDetails: splitObj,
    createdAt: new Date().toISOString(),
  };
  all.unshift(newTxn);
  localStorage.setItem(KEYS.TRANSACTIONS, JSON.stringify(all));

  return newTxn;
}

export interface RecycledTransaction extends Transaction {
  deletedAt: string;
}

export function getRecycledTransactions(): RecycledTransaction[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEYS.RECYCLE_BIN);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveRecycledTransactions(items: RecycledTransaction[]): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(KEYS.RECYCLE_BIN, JSON.stringify(items));
  }
}

export function restoreTransaction(id: string): void {
  const recycled = getRecycledTransactions();
  const target = recycled.find((t) => t.id === id);
  if (target) {
    const { deletedAt, ...restoredTxn } = target;
    const all = getTransactions(true);
    all.unshift(restoredTxn as Transaction);
    localStorage.setItem(KEYS.TRANSACTIONS, JSON.stringify(all));

    const remainingRecycled = recycled.filter((t) => t.id !== id);
    saveRecycledTransactions(remainingRecycled);
  }
}

export function permanentlyDeleteTransaction(id: string): void {
  const recycled = getRecycledTransactions();
  const remaining = recycled.filter((t) => t.id !== id);
  saveRecycledTransactions(remaining);
}

export function emptyRecycleBin(): void {
  saveRecycledTransactions([]);
}

export function deleteTransaction(id: string, option: 'reverse' | 'note' = 'reverse'): void {
  if (option === 'reverse') {
    const all = getTransactions(true);
    const target = all.find((t) => t.id === id);
    if (target) {
      const recycled = getRecycledTransactions();
      const newRecycledItem: RecycledTransaction = {
        ...target,
        deletedAt: new Date().toISOString(),
      };
      saveRecycledTransactions([newRecycledItem, ...recycled]);
    }
    const remaining = all.filter((t) => t.id !== id);
    localStorage.setItem(KEYS.TRANSACTIONS, JSON.stringify(remaining));
    deleteSplitExpense(id);
  } else {
    updateTransaction(id, { category: 'Deleted Category', subcategory: undefined });
  }
}

export function updateTransaction(id: string, updates: Partial<Transaction>): void {
  const all = getTransactions(true).map((t) => {
    if (t.id === id) {
      let dateStr = updates.date;
      if (dateStr) {
        if (dateStr.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          if (t.date && t.date.includes('T')) {
            const timePart = t.date.slice(t.date.indexOf('T'));
            dateStr = `${dateStr}${timePart}`;
          } else {
            const currentISO = new Date().toISOString();
            dateStr = `${dateStr}T${currentISO.slice(11)}`;
          }
        }
      }

      let splitObj = updates.splitDetails || t.splitDetails;
      if (updates.isSplit !== undefined && !updates.isSplit) {
        splitObj = undefined;
        deleteSplitExpense(id);
      } else if (updates.isSplit && splitObj) {
        saveSplitExpense(splitObj);
      }

      return {
        ...t,
        ...updates,
        ...(dateStr ? { date: dateStr } : {}),
        isSplit: updates.isSplit !== undefined ? updates.isSplit : t.isSplit,
        splitDetails: splitObj,
      };
    }
    return t;
  });
  localStorage.setItem(KEYS.TRANSACTIONS, JSON.stringify(all));
}

// ── Trips CRUD & Management ──────────────────────────────────────────────────

export function getTrips(): Trip[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEYS.TRIPS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveTrips(trips: Trip[]): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(KEYS.TRIPS, JSON.stringify(trips));
  }
}

export function getActiveTrip(): Trip | null {
  const trips = getTrips();
  if (typeof window !== 'undefined') {
    const activeId = localStorage.getItem(KEYS.ACTIVE_TRIP_ID);
    if (activeId) {
      const active = trips.find((t) => t.id === activeId && t.status === 'active');
      if (active) return active;
    }
  }
  return trips.find((t) => t.status === 'active') || null;
}

export function setActiveTrip(id: string | null): void {
  if (typeof window === 'undefined') return;
  if (!id) {
    localStorage.removeItem(KEYS.ACTIVE_TRIP_ID);
    return;
  }
  const trips = getTrips();
  const updated = trips.map((t) => ({
    ...t,
    status: t.id === id ? ('active' as const) : t.status === 'active' ? ('completed' as const) : t.status,
  }));
  saveTrips(updated);
  localStorage.setItem(KEYS.ACTIVE_TRIP_ID, id);
}

export function getTripBgColor(): string {
  if (typeof window === 'undefined') return '#FFFFFF';
  return localStorage.getItem(KEYS.TRIP_BG_COLOR) || '#FFFFFF';
}

export function setTripBgColor(color: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEYS.TRIP_BG_COLOR, color);
}

export function addTrip(trip: Omit<Trip, 'id' | 'createdAt'>): Trip {
  const trips = getTrips();
  const newTrip: Trip = {
    ...trip,
    id: `trip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  };
  if (newTrip.status === 'active') {
    trips.forEach((t) => {
      if (t.status === 'active') t.status = 'completed';
    });
  }
  trips.unshift(newTrip);
  saveTrips(trips);
  if (newTrip.status === 'active') {
    setActiveTrip(newTrip.id);
  }
  return newTrip;
}

export function updateTrip(id: string, updates: Partial<Trip>): Trip | null {
  const trips = getTrips();
  let updatedTrip: Trip | null = null;
  const newTrips = trips.map((t) => {
    if (t.id === id) {
      if (updates.status === 'active') {
        trips.forEach((ot) => {
          if (ot.id !== id && ot.status === 'active') ot.status = 'completed';
        });
      }
      updatedTrip = { ...t, ...updates };
      return updatedTrip;
    }
    return t;
  });
  saveTrips(newTrips);
  if (updates.status === 'active') {
    setActiveTrip(id);
  } else if (updates.status && (updates.status as string) !== 'active') {
    const active = getActiveTrip();
    if (active?.id === id) {
      setActiveTrip(null);
    }
  }
  return updatedTrip;
}

export function deleteTrip(id: string): void {
  const trips = getTrips().filter((t) => t.id !== id);
  saveTrips(trips);
  const active = getActiveTrip();
  if (active?.id === id) {
    setActiveTrip(null);
  }
}

export function getTripSummary(tripId: string) {
  const trips = getTrips();
  const trip = trips.find((t) => t.id === tripId);
  const transactions = getTransactions(true).filter((t) => t.tripId === tripId);

  let totalExpense = 0;
  let totalIncome = 0;
  const catMap: Record<string, number> = {};

  transactions.forEach((t) => {
    const amt = Number(t.amount) || 0;
    if (t.type === 'expense') {
      totalExpense += amt;
      catMap[t.category] = (catMap[t.category] || 0) + amt;
    } else if (t.type === 'income') {
      totalIncome += amt;
    }
  });

  const categories = getCategories();
  const categoryBreakdown = Object.entries(catMap)
    .map(([catName, amount]) => {
      const catObj = categories.find((c) => c.name === catName);
      return {
        category: catName,
        amount,
        color: catObj?.color || '#3b82f6',
        icon: catObj?.icon || '📌',
      };
    })
    .sort((a, b) => b.amount - a.amount);

  const budget = trip?.budget || 0;
  const remainingBudget = budget > 0 ? budget - totalExpense : 0;
  const budgetUtilization = budget > 0 ? Math.min(100, Math.round((totalExpense / budget) * 100)) : 0;

  return {
    trip,
    transactions,
    totalExpense,
    totalIncome,
    netSpent: totalExpense - totalIncome,
    budget,
    remainingBudget,
    budgetUtilization,
    categoryBreakdown,
  };
}

// ── Account Categories ────────────────────────────────────────────────────────

const DEFAULT_ACCOUNT_CATEGORIES: AccountCategory[] = [
  { id: 'accounts', name: 'Main Accounts', baseType: 'accounts', icon: '' },
  { id: 'cash', name: 'Cash Accounts', baseType: 'cash', icon: '' },
  { id: 'credit', name: 'Credit Cards', baseType: 'credit', icon: '' },
  { id: 'loan', name: 'Loan Accounts', baseType: 'loan', icon: '' },
];

export function getAccountCategories(): AccountCategory[] {
  if (typeof window === 'undefined') return DEFAULT_ACCOUNT_CATEGORIES;
  try {
    const raw = localStorage.getItem('wealthiq_account_categories');
    if (!raw) {
      localStorage.setItem('wealthiq_account_categories', JSON.stringify(DEFAULT_ACCOUNT_CATEGORIES));
      return DEFAULT_ACCOUNT_CATEGORIES;
    }
    return JSON.parse(raw);
  } catch (e) {
    return DEFAULT_ACCOUNT_CATEGORIES;
  }
}

export function saveAccountCategories(categories: AccountCategory[]) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('wealthiq_account_categories', JSON.stringify(categories));
  }
}

// ── Accounts ──────────────────────────────────────────────────────────────────

const LEGACY_DEFAULT_ACCOUNT_IDS = ['acc-cash', 'acc-sbi', 'acc-hdfc', 'acc-cc'];
const DEFAULT_ACCOUNTS: Account[] = [];

export function getAccounts(includeHidden = false): Account[] {
  if (typeof window === 'undefined') return DEFAULT_ACCOUNTS;
  try {
    const raw = localStorage.getItem(KEYS.ACCOUNTS);
    if (!raw) {
      localStorage.setItem(KEYS.ACCOUNTS, JSON.stringify(DEFAULT_ACCOUNTS));
      return DEFAULT_ACCOUNTS;
    }
    const accounts = JSON.parse(raw);
    if (!Array.isArray(accounts)) return DEFAULT_ACCOUNTS;

    const txns = getTransactions(true);

    let accountsUpdated = false;
    const validated = accounts.filter(Boolean).map((acc: Account) => {
      let mappedType = acc.type as string;
      if (mappedType === 'bank') mappedType = 'accounts';
      if (mappedType === 'investment') mappedType = 'loan';

      const opening = acc.openingBalance !== undefined ? acc.openingBalance : acc.balance || 0;
      let balance = opening;

      const splitPayments = getSplitPayments();

      txns.forEach((txn) => {
        if (!txn) return;
        const amount = Number(txn.amount) || 0;
        const type = txn.type;

        if (type === 'income') {
          if (txn.account === acc.id) balance += amount;
        } else if (type === 'expense') {
          if (txn.account === acc.id) {
            const splitObj = txn.splitDetails || (txn.isSplit ? getSplitExpenseByTxnId(txn.id) : undefined);
            if (txn.isSplit && splitObj?.totalAmount) {
              balance -= Number(splitObj.totalAmount);
            } else {
              balance -= amount;
            }
          }
        } else if (type === 'transfer') {
          if (txn.account === acc.id) balance -= amount;
          if (txn.toAccount === acc.id) balance += amount;
        }
      });

      splitPayments.forEach((pmt) => {
        if (pmt.paymentAccountId === acc.id) {
          balance += Number(pmt.amount) || 0;
        }
      });

      let accruedInterest = acc.accruedInterest !== undefined ? acc.accruedInterest : 0;
      let lastInterestProcessedDate = acc.lastInterestProcessedDate || '';

      if (mappedType === 'loan' && (acc.loanStatus || 'active') === 'active') {
        const annualRate = Number(acc.interestRate) || 0;
        const startDateStr = acc.startDate || acc.firstEmiDate;

        if (annualRate > 0 && startDateStr) {
          const tempAccount = {
            ...acc,
            balance: balance,
            accruedInterest: accruedInterest,
            lastInterestProcessedDate: lastInterestProcessedDate,
          };
          const todayStr = new Date().toISOString().slice(0, 10);
          const result = calculateInterestAccrual(tempAccount, todayStr);
          if (result.accrued > 0) {
            accruedInterest = Number((accruedInterest + result.accrued).toFixed(2));
            lastInterestProcessedDate = result.nextProcessedDate;
            acc.accruedInterest = accruedInterest;
            acc.lastInterestProcessedDate = lastInterestProcessedDate;
            accountsUpdated = true;
          }
        }
      }

      return {
        ...acc,
        type: mappedType as Account['type'],
        balance,
        openingBalance: opening,
        visible: acc.visible !== false,
        accruedInterest,
        lastInterestProcessedDate,
        icon:
          acc.icon ||
          (acc.type === 'cash'
            ? '💵'
            : acc.type === 'credit'
              ? '💳'
              : acc.type === 'loan'
                ? '📉'
                : '🏦'),
      };
    });

    if (accountsUpdated && typeof window !== 'undefined') {
      localStorage.setItem(
        KEYS.ACCOUNTS,
        JSON.stringify(
          accounts.map((a: Account) => {
            const opening = a.openingBalance !== undefined ? a.openingBalance : a.balance;
            return {
              ...a,
              balance: opening,
              openingBalance: opening,
            };
          })
        )
      );
    }

    if (includeHidden) return validated;
    return validated.filter((acc: Account) => acc.visible !== false);
  } catch {
    return DEFAULT_ACCOUNTS;
  }
}

export function saveAccounts(accounts: Account[]): void {
  const cleaned = accounts.map((acc) => {
    const opening = acc.openingBalance !== undefined ? acc.openingBalance : acc.balance;
    const { balance, ...rest } = acc;
    return {
      ...rest,
      balance: opening,
      openingBalance: opening,
    };
  });
  localStorage.setItem(KEYS.ACCOUNTS, JSON.stringify(cleaned));
}

export function addAccount(account: Omit<Account, 'id'>): Account {
  const all = getAccounts(true);
  const newAccount: Account = {
    ...account,
    id: `acc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    openingBalance: account.balance,
    visible: account.visible !== false,
  };
  all.push(newAccount);
  saveAccounts(all);
  return newAccount;
}

export function updateAccount(id: string, updates: Partial<Omit<Account, 'id'>>): void {
  const all = getAccounts(true).map((acc) => {
    if (acc.id === id) {
      const up = { ...acc, ...updates };
      if (updates.balance !== undefined) {
        up.openingBalance = updates.balance;
      }
      return up;
    }
    return acc;
  });
  saveAccounts(all);
}

export function deleteAccount(id: string): void {
  const all = getAccounts(true).filter((acc) => acc.id !== id);
  saveAccounts(all);
}

// ── Budgets ───────────────────────────────────────────────────────────────────

const DEFAULT_BUDGETS: Budget[] = [];

export function getBudgets(): Budget[] {
  if (typeof window === 'undefined') return DEFAULT_BUDGETS;
  try {
    const raw = localStorage.getItem(KEYS.BUDGETS);
    if (!raw) {
      localStorage.setItem(KEYS.BUDGETS, JSON.stringify(DEFAULT_BUDGETS));
      return DEFAULT_BUDGETS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : DEFAULT_BUDGETS;
  } catch {
    return DEFAULT_BUDGETS;
  }
}

export function saveBudgets(budgets: Budget[]): void {
  localStorage.setItem(KEYS.BUDGETS, JSON.stringify(budgets));
}

export interface BudgetTemplate {
  id: string;
  category: string;
  defaultAmount: number;
  notifications: number[]; // e.g. [50, 80, 100]
  carryForward: boolean;
  enabled: boolean;
}

export interface BudgetGlobalSettings {
  autoCreate: boolean;
  carryLimits: boolean;
  carryUnused: boolean;
  carryOverspending: boolean;
  scope: string; // 'all' or accountId
}

const DEFAULT_BUDGET_TEMPLATES: BudgetTemplate[] = [];

const DEFAULT_GLOBAL_SETTINGS: BudgetGlobalSettings = {
  autoCreate: true,
  carryLimits: true,
  carryUnused: false,
  carryOverspending: false,
  scope: 'all',
};

export function getBudgetTemplates(): BudgetTemplate[] {
  if (typeof window === 'undefined') return DEFAULT_BUDGET_TEMPLATES;
  try {
    const raw = localStorage.getItem('wealthiq_budget_templates');
    if (!raw) {
      localStorage.setItem('wealthiq_budget_templates', JSON.stringify(DEFAULT_BUDGET_TEMPLATES));
      return DEFAULT_BUDGET_TEMPLATES;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_BUDGET_TEMPLATES;
  } catch {
    return DEFAULT_BUDGET_TEMPLATES;
  }
}

export function saveBudgetTemplates(templates: BudgetTemplate[]): void {
  localStorage.setItem('wealthiq_budget_templates', JSON.stringify(templates));
}

export function getBudgetGlobalSettings(): BudgetGlobalSettings {
  if (typeof window === 'undefined') return DEFAULT_GLOBAL_SETTINGS;
  try {
    const raw = localStorage.getItem('wealthiq_budget_global_settings');
    if (!raw) {
      localStorage.setItem(
        'wealthiq_budget_global_settings',
        JSON.stringify(DEFAULT_GLOBAL_SETTINGS)
      );
      return DEFAULT_GLOBAL_SETTINGS;
    }
    return { ...DEFAULT_GLOBAL_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_GLOBAL_SETTINGS;
  }
}

export function saveBudgetGlobalSettings(settings: BudgetGlobalSettings): void {
  localStorage.setItem('wealthiq_budget_global_settings', JSON.stringify(settings));
}

// ── Computed Helpers ──────────────────────────────────────────────────────────

export function getMonthTransactions(month: string): Transaction[] {
  return getTransactions().filter((t) => t.date.startsWith(month));
}

export function computeKPIs(month: string) {
  const txns = getMonthTransactions(month);
  const income = txns.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expenses = txns.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const cashFlow = income - expenses;
  const savingsRate = income > 0 ? (cashFlow / income) * 100 : 0;
  const accounts = getAccounts();
  const netWorth = accounts.reduce((s, a) => s + a.balance, 0);
  return { income, expenses, cashFlow, savingsRate, netWorth };
}

export function getMonthlyIncomeExpense() {
  const transactions = getTransactions();
  const monthlyData: Record<string, { income: number; expense: number; savings: number }> = {};

  transactions.forEach((txn) => {
    if (!txn || typeof txn.date !== 'string') return;
    const month = txn.date.slice(0, 7);
    if (!monthlyData[month]) monthlyData[month] = { income: 0, expense: 0, savings: 0 };
    if (txn.type === 'income') monthlyData[month].income += txn.amount;
    if (txn.type === 'expense') monthlyData[month].expense += txn.amount;
    monthlyData[month].savings = monthlyData[month].income - monthlyData[month].expense;
  });

  return Object.entries(monthlyData)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, values]) => ({
      month: new Date(month + '-01').toLocaleString('en-IN', { month: 'short', year: '2-digit' }),
      income: values.income,
      expense: values.expense,
      savings: values.savings,
    }));
}

export function getBalanceAtDate(targetDateStr: string, selectedAccountId?: string): number {
  const accounts = getAccounts(true);
  const txns = getTransactions();

  let currentBalance = 0;
  if (selectedAccountId) {
    const acc = accounts.find((a) => a.id === selectedAccountId);
    currentBalance = acc ? acc.balance : 0;
  } else {
    currentBalance = accounts.reduce((s, a) => s + a.balance, 0);
  }

  txns.forEach((t) => {
    if (!t || !t.date || typeof t.date !== 'string') return;

    if (t.date > targetDateStr) {
      const amount = Number(t.amount) || 0;

      if (selectedAccountId) {
        if (t.type === 'income' && t.account === selectedAccountId) {
          currentBalance -= amount;
        } else if (t.type === 'expense' && t.account === selectedAccountId) {
          currentBalance += amount;
        } else if (t.type === 'transfer') {
          if (t.account === selectedAccountId) {
            currentBalance += amount;
          }
          if (t.toAccount === selectedAccountId) {
            currentBalance -= amount;
          }
        }
      } else {
        if (t.type === 'income') {
          currentBalance -= amount;
        } else if (t.type === 'expense') {
          currentBalance += amount;
        }
      }
    }
  });

  return currentBalance;
}

// Builds savings per month for a target year, with the SAME months from the
// previous year lined up alongside for comparison (Year-over-Year view).
export function getSavingsYoY(
  year: number,
  categoryFilter?: string[],
  selectedAccountId?: string,
  trendType: 'savings' | 'income' | 'expense' | 'balance' = 'savings'
) {
  if (trendType === 'balance') {
    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const now = new Date();
    const lastMonth = year === now.getFullYear() ? now.getMonth() : 11;
    const result = [];
    for (let m = 0; m <= lastMonth; m++) {
      const lastDay = new Date(year, m + 1, 0, 23, 59, 59, 999).toISOString();
      const lastDayPrev = new Date(year - 1, m + 1, 0, 23, 59, 59, 999).toISOString();
      result.push({
        month: monthNames[m],
        savings: getBalanceAtDate(lastDay, selectedAccountId),
        prevSavings: getBalanceAtDate(lastDayPrev, selectedAccountId),
      });
    }
    return result;
  }

  let transactions = getTransactions();
  if (selectedAccountId) {
    transactions = transactions.filter((t) => t.account === selectedAccountId);
  }
  if (categoryFilter && categoryFilter.length > 0) {
    transactions = transactions.filter((t) => categoryFilter.includes(t.category));
  }

  function savingsByMonth(y: number) {
    const data: Record<number, number> = {};
    for (let m = 0; m < 12; m++) data[m] = 0;
    transactions.forEach((t) => {
      if (!t.date || typeof t.date !== 'string') return;
      const d = new Date(t.date);
      if (isNaN(d.getTime())) return;
      if (d.getFullYear() !== y) return;
      const m = d.getMonth();

      if (trendType === 'income') {
        if (t.type === 'income') data[m] += t.amount;
      } else if (trendType === 'expense') {
        if (t.type === 'expense') data[m] += t.amount;
      } else {
        if (t.type === 'income') data[m] += t.amount;
        if (t.type === 'expense') data[m] -= t.amount;
      }
    });
    return data;
  }

  const current = savingsByMonth(year);
  const previous = savingsByMonth(year - 1);
  const monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  // Only show up to the current month if it's the current year
  const now = new Date();
  const lastMonth = year === now.getFullYear() ? now.getMonth() : 11;

  const result = [];
  for (let m = 0; m <= lastMonth; m++) {
    result.push({
      month: monthNames[m],
      savings: current[m],
      prevSavings: previous[m],
    });
  }
  return result;
}

// Builds savings per day for the CURRENT month, with the same days from the
// PREVIOUS month lined up alongside for comparison (Month-over-Month view).
export function getSavingsMoM(
  year: number,
  month0Indexed: number,
  categoryFilter?: string[],
  selectedAccountId?: string,
  trendType: 'savings' | 'income' | 'expense' | 'balance' = 'savings'
) {
  if (trendType === 'balance') {
    const daysInMonth = new Date(year, month0Indexed + 1, 0).getDate();
    const now = new Date();
    const isCurrentMonth = now.getFullYear() === year && now.getMonth() === month0Indexed;
    const lastDayNum = isCurrentMonth ? now.getDate() : daysInMonth;

    let prevYear = year;
    let prevMonth = month0Indexed - 1;
    if (prevMonth < 0) {
      prevMonth = 11;
      prevYear -= 1;
    }
    const daysInPrevMonth = new Date(prevYear, prevMonth + 1, 0).getDate();

    const result = [];
    for (let d = 1; d <= lastDayNum; d++) {
      const targetDate = new Date(year, month0Indexed, d, 23, 59, 59, 999).toISOString();
      const prevDay = Math.min(d, daysInPrevMonth);
      const targetDatePrev = new Date(prevYear, prevMonth, prevDay, 23, 59, 59, 999).toISOString();
      result.push({
        month: String(d),
        savings: getBalanceAtDate(targetDate, selectedAccountId),
        prevSavings: getBalanceAtDate(targetDatePrev, selectedAccountId),
      });
    }
    return result;
  }

  let transactions = getTransactions();
  if (selectedAccountId) {
    transactions = transactions.filter((t) => t.account === selectedAccountId);
  }
  if (categoryFilter && categoryFilter.length > 0) {
    transactions = transactions.filter((t) => categoryFilter.includes(t.category));
  }

  function savingsByDay(y: number, m: number) {
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const data: Record<number, number> = {};
    for (let d = 1; d <= daysInMonth; d++) data[d] = 0;
    const monthStr = `${y}-${String(m + 1).padStart(2, '0')}`;
    transactions
      .filter((t) => typeof t.date === 'string' && t.date.startsWith(monthStr))
      .forEach((t) => {
        const dayStr = t.date.slice(8, 10);
        const day = parseInt(dayStr);
        if (isNaN(day)) return;

        if (trendType === 'income') {
          if (t.type === 'income') data[day] += t.amount;
        } else if (trendType === 'expense') {
          if (t.type === 'expense') data[day] += t.amount;
        } else {
          if (t.type === 'income') data[day] += t.amount;
          if (t.type === 'expense') data[day] -= t.amount;
        }
      });
    return { data, daysInMonth };
  }

  const { data: current, daysInMonth: curDays } = savingsByDay(year, month0Indexed);

  let prevYear = year;
  let prevMonth = month0Indexed - 1;
  if (prevMonth < 0) {
    prevMonth = 11;
    prevYear -= 1;
  }
  const { data: previous } = savingsByDay(prevYear, prevMonth);

  const now = new Date();
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() === month0Indexed;
  const lastDay = isCurrentMonth ? now.getDate() : curDays;

  const result = [];
  for (let d = 1; d <= lastDay; d++) {
    result.push({
      month: String(d),
      savings: current[d] ?? 0,
      prevSavings: previous[d] ?? 0,
    });
  }
  return result;
}

// Day-by-day breakdown for a SINGLE calendar month (e.g. "This month" view).
// Returns one point per day of that month, filling ₹0 for days with no transactions.
export function getDailyIncomeExpense(year: number, month0Indexed: number) {
  const transactions = getTransactions();
  const monthStr = `${year}-${String(month0Indexed + 1).padStart(2, '0')}`;

  const dailyData: Record<string, { income: number; expense: number }> = {};
  transactions
    .filter((t) => typeof t.date === 'string' && t.date.startsWith(monthStr))
    .forEach((txn) => {
      if (!dailyData[txn.date]) dailyData[txn.date] = { income: 0, expense: 0 };
      if (txn.type === 'income') dailyData[txn.date].income += txn.amount;
      if (txn.type === 'expense') dailyData[txn.date].expense += txn.amount;
    });

  const daysInMonth = new Date(year, month0Indexed + 1, 0).getDate();
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month0Indexed;
  const lastDay = isCurrentMonth ? today.getDate() : daysInMonth;

  const result: { month: string; income: number; expense: number; savings: number }[] = [];
  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${year}-${String(month0Indexed + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const values = dailyData[dateStr] || { income: 0, expense: 0 };
    result.push({
      month: String(d), // x-axis label = day number
      income: values.income,
      expense: values.expense,
      savings: values.income - values.expense,
    });
  }

  return result;
}

// Returns a CONTINUOUS calendar range (fills in ₹0 for months with no transactions).
// monthsBack = null means "all data" — from the earliest transaction to now.
export function getMonthlyIncomeExpenseRange(monthsBack: number | null) {
  const transactions = getTransactions();
  const monthlyData: Record<string, { income: number; expense: number; savings: number }> = {};

  transactions.forEach((txn) => {
    const month = typeof txn.date === 'string' ? txn.date.slice(0, 7) : '';
    if (!month) return;
    if (!monthlyData[month]) monthlyData[month] = { income: 0, expense: 0, savings: 0 };
    if (txn.type === 'income') monthlyData[month].income += txn.amount;
    if (txn.type === 'expense') monthlyData[month].expense += txn.amount;
    monthlyData[month].savings = monthlyData[month].income - monthlyData[month].expense;
  });

  const now = new Date();
  let startDate: Date;

  if (monthsBack === null) {
    // All data: start from earliest transaction month, or this month if none exist
    const allMonths = Object.keys(monthlyData).sort();
    startDate =
      allMonths.length > 0
        ? new Date(allMonths[0] + '-01')
        : new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    startDate = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1);
  }

  const result: { month: string; income: number; expense: number; savings: number }[] = [];
  const cursor = new Date(startDate);

  while (cursor <= now) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    const values = monthlyData[key] || { income: 0, expense: 0, savings: 0 };
    result.push({
      month: cursor.toLocaleString('en-IN', { month: 'short', year: '2-digit' }),
      income: values.income,
      expense: values.expense,
      savings: values.savings,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return result;
}

// ── Goals ──────────────────────────────────────────────────────────────────────

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string; // YYYY-MM-DD
  color: string;
  icon: string;
}

const DEFAULT_GOALS: Goal[] = [];

export function getGoals(): Goal[] {
  if (typeof window === 'undefined') return DEFAULT_GOALS;
  try {
    const raw = localStorage.getItem('wealthiq_goals');
    if (!raw) {
      localStorage.setItem('wealthiq_goals', JSON.stringify(DEFAULT_GOALS));
      return DEFAULT_GOALS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_GOALS;
  } catch {
    return DEFAULT_GOALS;
  }
}

export function saveGoals(goals: Goal[]): void {
  localStorage.setItem('wealthiq_goals', JSON.stringify(goals));
}

export function calculateInterestAccrual(
  loan: Account,
  targetDateStr: string
): { accrued: number; nextProcessedDate: string } {
  const rate = Number(loan.interestRate) || 0;
  if (rate <= 0) {
    return { accrued: 0, nextProcessedDate: targetDateStr };
  }

  const startStr = loan.lastInterestProcessedDate || loan.interestStartDate || loan.startDate;
  if (!startStr) {
    return { accrued: 0, nextProcessedDate: targetDateStr };
  }

  const start = new Date(startStr);
  const end = new Date(targetDateStr);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  if (end <= start) {
    return { accrued: 0, nextProcessedDate: startStr };
  }

  const diffTime = end.getTime() - start.getTime();
  const elapsedDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (elapsedDays <= 0) {
    return { accrued: 0, nextProcessedDate: startStr };
  }

  const principal = Math.abs(loan.balance);

  if (loan.isInformal) {
    if (
      loan.interestType === 'simple' ||
      loan.interestType === 'flat' ||
      (loan.interestType as string) === 'Simple Interest'
    ) {
      // Interest = Principal * (Rate/100) * (Elapsed Days / 365)
      const accrued = principal * (rate / 100) * (elapsedDays / 365);
      return { accrued: Number(accrued.toFixed(2)), nextProcessedDate: targetDateStr };
    } else if (
      loan.interestType === 'compound' ||
      (loan.interestType as string) === 'Compound Interest'
    ) {
      // Compound Interest based on selected frequency
      const periodMonths =
        loan.compoundingFrequency === 'quarterly'
          ? 3
          : loan.compoundingFrequency === 'half-yearly'
            ? 6
            : loan.compoundingFrequency === 'yearly'
              ? 12
              : 1; // Default to monthly
      let months =
        (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
      if (end.getDate() < start.getDate()) {
        months -= 1;
      }
      const periods = Math.floor(months / periodMonths);
      if (periods <= 0) {
        return { accrued: 0, nextProcessedDate: startStr };
      }
      const periodRate = (rate * (periodMonths / 12)) / 100;
      const accrued = principal * (Math.pow(1 + periodRate, periods) - 1);
      const processedMonths = periods * periodMonths;
      const processedDate = new Date(
        start.getFullYear(),
        start.getMonth() + processedMonths,
        start.getDate()
      );
      return {
        accrued: Number(accrued.toFixed(2)),
        nextProcessedDate: processedDate.toISOString().slice(0, 10),
      };
    } else {
      // Reducing balance or others (reducing simple interest)
      const accrued = principal * (rate / 100) * (elapsedDays / 365);
      return { accrued: Number(accrued.toFixed(2)), nextProcessedDate: targetDateStr };
    }
  } else {
    // Standard structured loan
    const dueDay = loan.emiDueDay || 5;
    let nextAccrual = new Date(
      start.getFullYear(),
      start.getMonth() + (start.getDate() < dueDay ? 0 : 1),
      dueDay
    );
    nextAccrual.setHours(0, 0, 0, 0);

    let totalAccrued = 0;
    let lastAccrualDate = new Date(start);

    while (nextAccrual <= end) {
      let interestComponent = 0;
      if (loan.interestType === 'flat' || (loan.interestType as string) === 'Simple Interest') {
        const orig = loan.originalAmount || principal || 0;
        interestComponent = orig * (rate / 12 / 100);
      } else {
        // Reducing balance
        interestComponent = principal * (rate / 12 / 100);
      }
      totalAccrued += interestComponent;
      lastAccrualDate = new Date(nextAccrual);
      nextAccrual = new Date(nextAccrual.getFullYear(), nextAccrual.getMonth() + 1, dueDay);
      nextAccrual.setHours(0, 0, 0, 0);
    }

    if (totalAccrued > 0) {
      return {
        accrued: Number(totalAccrued.toFixed(2)),
        nextProcessedDate: lastAccrualDate.toISOString().slice(0, 10),
      };
    } else {
      return { accrued: 0, nextProcessedDate: startStr };
    }
  }
}

export interface Repayment {
  id: string;
  loanId: string;
  amount: number;
  date: string;
  paymentAccountId: string;
  notes?: string;
  interestPaid: number;
  principalPaid: number;
  interestTransactionId?: string;
  principalTransactionId?: string;
  createdAt: string;
  updatedAt: string;
}

export function getRepayments(): Repayment[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('wealthiq_repayments');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveRepayments(repayments: Repayment[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('wealthiq_repayments', JSON.stringify(repayments));
}

export function recalculateLoanTimeline(loanId: string): void {
  if (typeof window === 'undefined') return;

  // 1. Load accounts
  const rawAccounts = localStorage.getItem(KEYS.ACCOUNTS);
  if (!rawAccounts) return;
  const accounts: Account[] = JSON.parse(rawAccounts);
  const loanIndex = accounts.findIndex((a) => a.id === loanId);
  if (loanIndex === -1) return;
  const loan = accounts[loanIndex];

  // 2. Load all repayments for this loan
  const allRepayments = getRepayments();
  const loanRepayments = allRepayments.filter((r) => r.loanId === loanId);

  // Sort repayments chronologically
  loanRepayments.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // 3. Initialize timeline variables
  let currentPrincipal = loan.originalAmount || 0;
  let currentDateStr = loan.startDate || '';
  let unpaidInterest = 0;
  let totalPrincipalRepaid = 0;
  let totalInterestPaid = 0;
  let totalAmountPaid = 0;

  // 4. Process repayments chronologically
  loanRepayments.forEach((repayment) => {
    // Build temporary loan details up to this repayment date
    const tempAccount: Account = {
      ...loan,
      balance: -currentPrincipal,
      accruedInterest: unpaidInterest,
      lastInterestProcessedDate: currentDateStr,
    };

    const result = calculateInterestAccrual(tempAccount, repayment.date);
    const newAccruedInterest = result.accrued;
    unpaidInterest += newAccruedInterest;

    // Apply payment allocation: (1) accrued unpaid interest, (2) principal
    const interestPaid = Math.min(unpaidInterest, repayment.amount);
    const principalPaid = Math.max(0, repayment.amount - interestPaid);

    // Update repayment components
    repayment.interestPaid = Number(interestPaid.toFixed(2));
    repayment.principalPaid = Number(principalPaid.toFixed(2));
    repayment.updatedAt = new Date().toISOString();

    // Update running totals
    unpaidInterest = Number((unpaidInterest - interestPaid).toFixed(2));
    currentPrincipal = Math.max(0, Number((currentPrincipal - principalPaid).toFixed(2)));
    totalPrincipalRepaid = Number((totalPrincipalRepaid + principalPaid).toFixed(2));
    totalInterestPaid = Number((totalInterestPaid + interestPaid).toFixed(2));
    totalAmountPaid = Number((totalAmountPaid + repayment.amount).toFixed(2));

    // Update linked transactions
    // Interest portion transaction
    if (repayment.interestPaid > 0) {
      if (repayment.interestTransactionId) {
        updateTransaction(repayment.interestTransactionId, {
          amount: repayment.interestPaid,
          date: repayment.date,
          account: repayment.paymentAccountId,
          type: 'expense',
        });
      } else {
        const newTx = saveTransaction({
          date: repayment.date,
          amount: repayment.interestPaid,
          account: repayment.paymentAccountId,
          type: 'expense',
          category: 'Interest',
          description: `Interest Repayment - ${loan.name}`,
          notes: repayment.notes || `Interest paid on informal loan.`,
        });
        repayment.interestTransactionId = newTx.id;
      }
    } else {
      if (repayment.interestTransactionId) {
        deleteTransaction(repayment.interestTransactionId, 'reverse');
        repayment.interestTransactionId = undefined;
      }
    }

    // Principal portion transaction
    if (repayment.principalPaid > 0) {
      if (repayment.principalTransactionId) {
        updateTransaction(repayment.principalTransactionId, {
          amount: repayment.principalPaid,
          date: repayment.date,
          account: repayment.paymentAccountId,
          toAccount: loan.id,
        });
      } else {
        const newTx = saveTransaction({
          date: repayment.date,
          amount: repayment.principalPaid,
          account: repayment.paymentAccountId,
          toAccount: loan.id,
          type: 'transfer',
          category: 'EMI / Rent',
          description: `Principal Repayment - ${loan.name}`,
          notes: repayment.notes || `Principal repayment on informal loan.`,
        });
        repayment.principalTransactionId = newTx.id;
      }
    } else {
      if (repayment.principalTransactionId) {
        deleteTransaction(repayment.principalTransactionId, 'reverse');
        repayment.principalTransactionId = undefined;
      }
    }

    currentDateStr = repayment.date;
  });

  // 5. Final catch-up calculation from last processed date to today
  const todayStr = new Date().toISOString().slice(0, 10);
  const tempAccount: Account = {
    ...loan,
    balance: -currentPrincipal,
    accruedInterest: unpaidInterest,
    lastInterestProcessedDate: currentDateStr,
  };
  const finalResult = calculateInterestAccrual(tempAccount, todayStr);
  unpaidInterest = Number((unpaidInterest + finalResult.accrued).toFixed(2));

  // 6. Update Loan Account Metadata
  loan.accruedInterest = unpaidInterest;
  loan.lastInterestProcessedDate = finalResult.nextProcessedDate;
  loan.totalPrincipalRepaid = totalPrincipalRepaid;
  loan.totalInterestPaid = totalInterestPaid;
  loan.totalAmountPaid = totalAmountPaid;
  loan.balance = -currentPrincipal;

  // Save updated accounts
  localStorage.setItem(KEYS.ACCOUNTS, JSON.stringify(accounts));

  // Save updated repayments
  const updatedRepayments = allRepayments.map((r) => {
    const matching = loanRepayments.find((lr) => lr.id === r.id);
    return matching ? matching : r;
  });
  saveRepayments(updatedRepayments);
}

export function getTransactionImpact(t: Transaction, selectedAccountId?: string) {
  let cashIn = 0;
  let cashOut = 0;
  let income = 0;
  let expense = 0;
  const amt = Number(t.amount) || 0;

  if (!selectedAccountId) {
    // Global metrics (no account filter)
    if (t.type === 'income') {
      cashIn = amt;
      income = amt;
    } else if (t.type === 'expense') {
      cashOut = amt;
      expense = amt;
    } else if (t.type === 'transfer') {
      cashIn = amt;
      cashOut = amt;
    }
  } else {
    // Filtered by selectedAccountId
    if (t.type === 'income' && t.account === selectedAccountId) {
      cashIn = amt;
      income = amt;
    } else if (t.type === 'expense' && t.account === selectedAccountId) {
      cashOut = amt;
      expense = amt;
    } else if (t.type === 'transfer') {
      if (t.toAccount === selectedAccountId) {
        cashIn = amt;
      }
      if (t.account === selectedAccountId) {
        cashOut = amt;
      }
    }
  }

  return { cashIn, cashOut, income, expense };
}

interface CreditCardBalances {
  payable: number;
  outstanding: number;
}

export function calculateCreditCardBalances(
  acc: Account,
  allTransactions: Transaction[]
): CreditCardBalances {
  if (acc.type !== 'credit') return { payable: 0, outstanding: 0 };

  const cycleDay = parseInt(acc.billingCycle || '4', 10) || 4;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  let cycleStart: Date;
  if (now.getDate() >= cycleDay) {
    cycleStart = new Date(currentYear, currentMonth, cycleDay);
  } else {
    cycleStart = new Date(currentYear, currentMonth - 1, cycleDay);
  }

  const cardTxns = allTransactions.filter((t) => t.account === acc.id || t.toAccount === acc.id);

  let expensesBefore = 0;
  let paymentsBefore = 0;
  let expensesDuring = 0;
  let paymentsDuring = 0;

  cardTxns.forEach((t) => {
    const parts = t.date.split('-');
    const txnDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    
    let isPayment = false;
    let amount = t.amount;

    if (t.type === 'income') {
      isPayment = true;
    } else if (t.type === 'transfer') {
      if (t.toAccount === acc.id) {
        isPayment = true;
      }
    }

    if (txnDate >= cycleStart) {
      if (isPayment) {
        paymentsDuring += amount;
      } else {
        expensesDuring += amount;
      }
    } else {
      if (isPayment) {
        paymentsBefore += amount;
      } else {
        expensesBefore += amount;
      }
    }
  });

  // Calculate the statement balance from the closed billing cycle (before cycleStart)
  const initialPayable = Math.max(expensesBefore - paymentsBefore, 0);

  // Payments made during the current cycle reduce the older cycle's Balance Payable first
  let payable = initialPayable - paymentsDuring;
  let remainingPayment = 0;

  if (payable < 0) {
    remainingPayment = -payable;
    payable = 0;
  }

  // Any remaining payment amount goes to pay off the current cycle's Outstanding Balance
  const outstanding = Math.max(expensesDuring - remainingPayment, 0);

  return {
    payable,
    outstanding,
  };
}
