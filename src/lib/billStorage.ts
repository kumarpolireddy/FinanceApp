'use client';

import { saveTransaction, getAccounts, updateAccount, getCategories, getTransactions, calculateCreditCardBalances } from '@/lib/storage';

export type BillType =
  | 'Credit Card'
  | 'EMI / Loan'
  | 'Rent'
  | 'Electricity'
  | 'Water'
  | 'Internet'
  | 'Mobile'
  | 'Insurance'
  | 'Subscription'
  | 'SIP / Investment'
  | 'Other';

export type BillRecurrence = 'one_time' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export type BillStatus = 'upcoming' | 'due_soon' | 'due_today' | 'paid' | 'overdue' | 'skipped';

export interface BillPaymentReminder {
  id: string;
  name: string;
  type: BillType;
  amount: number;
  amountType: 'fixed' | 'variable';
  minimumDue?: number;
  dueDate: string; // YYYY-MM-DD
  dueTime: string; // HH:mm
  accountId?: string; // Account to pay from
  linkedAccountId?: string; // Optional credit card account ID
  linkedLoanId?: string; // Optional loan account ID
  categoryId?: string;
  recurrence: BillRecurrence;
  dayOfMonth?: number;
  monthOfYear?: number;
  customReminderTime?: string;
  snoozedUntil?: string;
  status: BillStatus;
  lastPaidDate?: string;
  linkedTransactionId?: string;
  reminderSchedule: {
    sevenDaysBefore: boolean;
    threeDaysBefore: boolean;
    oneDayBefore: boolean;
    onDueDate: boolean;
  };
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BillPaymentHistoryEntry {
  id: string;
  billId: string;
  billName: string;
  type: BillType;
  amount: number;
  dueDate?: string;
  paidDate: string;
  paidFromAccountId?: string;
  status: 'paid' | 'skipped';
  transactionId?: string;
  accountId?: string;
  notes?: string;
  createdAt?: string;
}

export interface BillSettings {
  defaultReminderTime: string;
  defaultReminders: {
    sevenDaysBefore: boolean;
    threeDaysBefore: boolean;
    oneDayBefore: boolean;
    onDueDate: boolean;
  };
  creditCardReminders: {
    enabled: boolean;
    daysBefore: number;
  };
  emiReminders: {
    enabled: boolean;
    daysBefore: number;
  };
  overdueNotificationsEnabled: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}

const BILLS_STORAGE_KEY = 'wealthiq_bills_data';
const BILL_HISTORY_STORAGE_KEY = 'wealthiq_bills_history';
const BILL_SETTINGS_STORAGE_KEY = 'wealthiq_bills_settings';

export const DEFAULT_BILL_SETTINGS: BillSettings = {
  defaultReminderTime: '09:00',
  defaultReminders: {
    sevenDaysBefore: true,
    threeDaysBefore: true,
    oneDayBefore: true,
    onDueDate: true,
  },
  creditCardReminders: {
    enabled: true,
    daysBefore: 5,
  },
  emiReminders: {
    enabled: true,
    daysBefore: 5,
  },
  overdueNotificationsEnabled: true,
  soundEnabled: true,
  vibrationEnabled: true,
};

export const INITIAL_DEFAULT_BILLS: BillPaymentReminder[] = [];

export function syncBillsFromUserAccounts(): void {
  if (typeof window === 'undefined') return;
  try {
    const accounts = getAccounts(true);
    const allTransactions = getTransactions(true);
    const raw = safeGetItem(BILLS_STORAGE_KEY);
    let existingBills: BillPaymentReminder[] = raw ? JSON.parse(raw) : [];
    let updated = false;

    accounts.forEach((acc) => {
      const isCredit =
        acc.type === 'credit' ||
        (acc.type as string) === 'cc' ||
        (acc.type as string) === 'credit_card' ||
        acc.name.toLowerCase().includes('credit card') ||
        acc.name.toLowerCase().includes('card');

      if (isCredit) {
        const cc = calculateCreditCardBalances(acc, allTransactions);
        const payableAmount = cc.payable > 0 ? cc.payable : Math.abs(acc.balance || 0);

        const todayYearMonth = new Date().toISOString().slice(0, 7);
        const billingDay = parseInt(String(acc.billingCycle || '4'), 10) || 4;

        let dueDayVal = 18;
        if (acc.dueDate) {
          if (acc.dueDate.includes('-')) {
            const parts = acc.dueDate.split('-');
            dueDayVal = parseInt(parts[2], 10) || 18;
          } else {
            dueDayVal = parseInt(String(acc.dueDate), 10) || 18;
          }
        }
        const dueDateStr = acc.dueDate && acc.dueDate.includes('-')
          ? acc.dueDate
          : `${todayYearMonth}-${String(dueDayVal).padStart(2, '0')}`;

        const existingIndex = existingBills.findIndex(
          (b) =>
            b.linkedAccountId === acc.id ||
            b.name.toLowerCase() === acc.name.toLowerCase() ||
            b.name.toLowerCase() === `${acc.name} payment`.toLowerCase()
        );

        if (payableAmount <= 0) {
          // If credit card has 0 spending / payable amount, remove auto-generated bill for it
          if (existingIndex !== -1 && existingBills[existingIndex].id.startsWith('bill_cc_')) {
            existingBills.splice(existingIndex, 1);
            updated = true;
          }
        } else if (existingIndex === -1) {
          const newBill: BillPaymentReminder = {
            id: `bill_cc_${acc.id}`,
            name: acc.name,
            type: 'Credit Card',
            amount: payableAmount,
            amountType: 'variable',
            minimumDue: acc.minPayment || Math.round(payableAmount * 0.1),
            dueDate: dueDateStr,
            dueTime: '09:00',
            accountId: acc.linkedPaymentAccountId || acc.id,
            linkedAccountId: acc.id,
            recurrence: 'monthly',
            dayOfMonth: billingDay,
            status: 'upcoming',
            reminderSchedule: {
              sevenDaysBefore: true,
              threeDaysBefore: true,
              oneDayBefore: true,
              onDueDate: true,
            },
            notes: '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          newBill.status = calculateBillStatus(newBill);
          existingBills.push(newBill);
          updated = true;
        } else {
          // Update live credit card statement payable values from Accounts
          const current = existingBills[existingIndex];
          const updatedBill: BillPaymentReminder = {
            ...current,
            name: acc.name,
            amount: payableAmount,
            minimumDue: acc.minPayment || Math.round(payableAmount * 0.1),
            dueDate: dueDateStr,
            dayOfMonth: billingDay,
            linkedAccountId: acc.id,
          };
          if (JSON.stringify(current) !== JSON.stringify(updatedBill)) {
            existingBills[existingIndex] = updatedBill;
            updated = true;
          }
        }
      } else if (acc.type === 'loan' && acc.loanStatus !== 'paid_off' && acc.loanStatus !== 'closed') {
        const alreadyHas = existingBills.some(
          (b) => b.linkedLoanId === acc.id || b.name.toLowerCase() === `${acc.name} emi`.toLowerCase()
        );
        if (!alreadyHas) {
          const dueDay = acc.emiDueDay || 5;
          const todayYearMonth = new Date().toISOString().slice(0, 7);
          const dayVal = String(dueDay).padStart(2, '0');
          const dueDate =
            acc.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(acc.dueDate) ? acc.dueDate : `${todayYearMonth}-${dayVal}`;

          const newBill: BillPaymentReminder = {
            id: `bill_loan_${acc.id}`,
            name: `${acc.name} EMI`,
            type: 'EMI / Loan',
            amount: acc.emiAmount || 0,
            amountType: 'fixed',
            dueDate,
            dueTime: '09:00',
            accountId: acc.linkedPaymentAccountId || 'acc-cash',
            linkedLoanId: acc.id,
            recurrence: 'monthly',
            dayOfMonth: dueDay,
            status: 'upcoming',
            reminderSchedule: {
              sevenDaysBefore: true,
              threeDaysBefore: true,
              oneDayBefore: true,
              onDueDate: true,
            },
            notes: '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          newBill.status = calculateBillStatus(newBill);
          existingBills.push(newBill);
          updated = true;
        }
      }
    });

    if (updated) {
      safeSetItem(BILLS_STORAGE_KEY, JSON.stringify(existingBills));
    }
  } catch (err) {
    console.error('Failed to sync bills from accounts', err);
  }
}

function safeGetItem(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.error('Failed to set localStorage item', key, e);
  }
}

export function checkIsBillPaidFromTransactions(bill: BillPaymentReminder): boolean {
  if (typeof window === 'undefined') return bill.status === 'paid';
  try {
    const rawTx = safeGetItem('wealthiq_transactions');
    if (!rawTx) return bill.status === 'paid';
    const txs: any[] = JSON.parse(rawTx);
    if (!Array.isArray(txs) || txs.length === 0) return bill.status === 'paid';

    const billMonth = bill.dueDate.slice(0, 7);
    const billNameLower = bill.name.toLowerCase().trim();

    // 1. Credit Card Bill
    if (bill.type === 'Credit Card') {
      const cardId = bill.linkedAccountId || bill.accountId;

      const hasPaymentTx = txs.some((tx) => {
        if (!tx.date || !tx.date.startsWith(billMonth)) return false;
        const descLower = (tx.description || '').toLowerCase();
        const notesLower = (tx.notes || '').toLowerCase();
        const catLower = (tx.category || '').toLowerCase();
        const isCardAcc = tx.accountId === cardId || tx.toAccountId === cardId;
        const isMatch =
          descLower.includes(billNameLower) ||
          notesLower.includes(billNameLower) ||
          catLower.includes('credit card');

        return (isCardAcc || isMatch) && (tx.type === 'expense' || tx.type === 'transfer');
      });

      if (hasPaymentTx) return true;
    }

    // 2. EMI / Loan Bill
    if (bill.type === 'EMI / Loan') {
      const loanId = bill.linkedLoanId || bill.accountId;

      const hasEmiTx = txs.some((tx) => {
        if (!tx.date || !tx.date.startsWith(billMonth)) return false;
        const descLower = (tx.description || '').toLowerCase();
        const notesLower = (tx.notes || '').toLowerCase();
        const catLower = (tx.category || '').toLowerCase();
        const isLoanAcc = tx.accountId === loanId || tx.toAccountId === loanId;
        const isEmiMatch =
          descLower.includes(billNameLower) ||
          notesLower.includes(billNameLower) ||
          catLower.includes('emi') ||
          catLower.includes('loan');

        return (isLoanAcc || isEmiMatch) && (tx.type === 'expense' || tx.type === 'transfer');
      });

      if (hasEmiTx) return true;
    }

    // 3. Other Bill Types
    const hasBillTx = txs.some((tx) => {
      if (!tx.date || !tx.date.startsWith(billMonth)) return false;
      const descLower = (tx.description || '').toLowerCase();
      const notesLower = (tx.notes || '').toLowerCase();
      const catLower = (tx.category || '').toLowerCase();

      const isNameMatch = descLower.includes(billNameLower) || notesLower.includes(billNameLower);
      const isTypeMatch = catLower.includes(bill.type.toLowerCase()) || bill.type.toLowerCase().includes(catLower);
      const amountMatch = Math.abs(Number(tx.amount || 0) - Number(bill.amount || 0)) <= Math.max(20, Number(bill.amount || 0) * 0.1);

      return (isNameMatch || (isTypeMatch && amountMatch)) && (tx.type === 'expense' || tx.type === 'transfer');
    });

    if (hasBillTx) return true;

    return bill.status === 'paid';
  } catch {
    return bill.status === 'paid';
  }
}

export function calculateBillStatus(bill: BillPaymentReminder): BillStatus {
  if (checkIsBillPaidFromTransactions(bill)) {
    return 'paid';
  }
  if (bill.status === 'skipped') {
    return 'skipped';
  }

  const todayStr = new Date().toISOString().split('T')[0];
  if (bill.dueDate < todayStr) {
    return 'overdue';
  }
  if (bill.dueDate === todayStr) {
    return 'due_today';
  }

  const dueDateObj = new Date(bill.dueDate + 'T00:00:00');
  const todayObj = new Date(todayStr + 'T00:00:00');
  const diffDays = Math.round((dueDateObj.getTime() - todayObj.getTime()) / (1000 * 3600 * 24));

  if (diffDays <= 3) {
    return 'due_soon';
  }
  return 'upcoming';
}

export function getStoredBills(): BillPaymentReminder[] {
  syncBillsFromUserAccounts();
  const data = safeGetItem(BILLS_STORAGE_KEY);
  let bills: BillPaymentReminder[] = [];
  if (data) {
    try {
      const parsed: BillPaymentReminder[] = JSON.parse(data);
      // Purge legacy sample bills, clear notes/suffixes, and exclude 0-spending credit card bills
      bills = parsed
        .filter(
          (b: BillPaymentReminder) =>
            !b.id.startsWith('bill_initial_') &&
            b.name !== 'SBI Credit Card' &&
            b.name !== 'Education Loan EMI' &&
            b.name !== 'Fiber Internet Bill' &&
            !(b.type === 'Credit Card' && Number(b.amount || 0) <= 0)
        )
        .map((b: BillPaymentReminder) => {
          let updatedName = b.name;
          if (b.type === 'Credit Card' && updatedName.toLowerCase().endsWith(' payment')) {
            updatedName = updatedName.replace(/\s+payment$/i, '');
          }
          let updatedNotes = b.notes || '';
          if (
            updatedNotes.startsWith('Monthly EMI installment for') ||
            updatedNotes.startsWith('Credit card bill payment for')
          ) {
            updatedNotes = '';
          }
          return { ...b, name: updatedName, notes: updatedNotes };
        });
      safeSetItem(BILLS_STORAGE_KEY, JSON.stringify(bills));
    } catch {
      bills = [];
    }
  }

  // Recalculate dynamic statuses for active bills
  return bills.map((b) => ({
    ...b,
    status: calculateBillStatus(b),
  }));
}

export function clearAllBills(): void {
  safeSetItem(BILLS_STORAGE_KEY, JSON.stringify([]));
  safeSetItem(BILL_HISTORY_STORAGE_KEY, JSON.stringify([]));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('wealthiq_bills_updated'));
  }
}

export function saveStoredBills(bills: BillPaymentReminder[]): void {
  safeSetItem(BILLS_STORAGE_KEY, JSON.stringify(bills));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('wealthiq_bills_updated'));
  }
}

export function addBill(billData: Omit<BillPaymentReminder, 'id' | 'createdAt' | 'updatedAt' | 'status'>): BillPaymentReminder {
  const bills = getStoredBills();
  const now = new Date().toISOString();
  const tempBill: BillPaymentReminder = {
    ...billData,
    id: 'bill_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    status: 'upcoming',
    createdAt: now,
    updatedAt: now,
  };
  tempBill.status = calculateBillStatus(tempBill);
  bills.push(tempBill);
  saveStoredBills(bills);
  return tempBill;
}

export function updateBill(id: string, updates: Partial<BillPaymentReminder>): BillPaymentReminder | null {
  const bills = getStoredBills();
  const index = bills.findIndex((b) => b.id === id);
  if (index === -1) return null;

  const updated: BillPaymentReminder = {
    ...bills[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  updated.status = calculateBillStatus(updated);
  bills[index] = updated;
  saveStoredBills(bills);
  return updated;
}

export function deleteBill(id: string): boolean {
  const bills = getStoredBills();
  const filtered = bills.filter((b) => b.id !== id);
  if (filtered.length === bills.length) return false;
  saveStoredBills(filtered);
  return true;
}

export function getBillSettings(): BillSettings {
  const data = safeGetItem(BILL_SETTINGS_STORAGE_KEY);
  if (!data) {
    saveBillSettings(DEFAULT_BILL_SETTINGS);
    return DEFAULT_BILL_SETTINGS;
  }
  try {
    const parsed = JSON.parse(data);
    return {
      ...DEFAULT_BILL_SETTINGS,
      ...parsed,
      creditCardReminders: {
        ...DEFAULT_BILL_SETTINGS.creditCardReminders,
        ...(parsed.creditCardReminders || {}),
      },
      emiReminders: {
        ...DEFAULT_BILL_SETTINGS.emiReminders,
        ...(parsed.emiReminders || {}),
      },
      defaultReminders: {
        ...DEFAULT_BILL_SETTINGS.defaultReminders,
        ...(parsed.defaultReminders || {}),
      },
    };
  } catch {
    return DEFAULT_BILL_SETTINGS;
  }
}

export function saveBillSettings(settings: BillSettings): void {
  safeSetItem(BILL_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function getBillHistory(): BillPaymentHistoryEntry[] {
  const manualData = safeGetItem(BILL_HISTORY_STORAGE_KEY);
  let manualEntries: BillPaymentHistoryEntry[] = [];
  if (manualData) {
    try {
      manualEntries = JSON.parse(manualData);
    } catch {
      manualEntries = [];
    }
  }

  // Auto-extract paid EMIs and Credit Card bill payments from Transactions
  const autoEntries: BillPaymentHistoryEntry[] = [];
  try {
    const rawTx = safeGetItem('wealthiq_transactions');
    if (rawTx) {
      const txs: any[] = JSON.parse(rawTx);
      if (Array.isArray(txs)) {
        txs.forEach((tx) => {
          if (tx.type !== 'expense' && tx.type !== 'transfer') return;

          const desc = (tx.description || '').trim();
          const cat = (tx.category || '').trim();
          const notes = (tx.notes || '').trim();
          const catLower = cat.toLowerCase();
          const descLower = desc.toLowerCase();
          const notesLower = notes.toLowerCase();

          const isCC =
            catLower.includes('credit card') ||
            descLower.includes('credit card') ||
            descLower.includes('card payment') ||
            notesLower.includes('credit card');

          const isEMI =
            catLower.includes('emi') ||
            catLower.includes('loan') ||
            descLower.includes('emi') ||
            descLower.includes('loan payment') ||
            notesLower.includes('emi');

          const isBill =
            catLower.includes('bill') ||
            catLower.includes('rent') ||
            catLower.includes('electricity') ||
            catLower.includes('utility') ||
            catLower.includes('insurance') ||
            catLower.includes('subscription');

          if (isCC || isEMI || isBill) {
            let billType: BillType = 'Other';
            if (isCC) billType = 'Credit Card';
            else if (isEMI) billType = 'EMI / Loan';
            else if (catLower.includes('rent')) billType = 'Rent';
            else if (catLower.includes('electricity')) billType = 'Electricity';
            else if (catLower.includes('insurance')) billType = 'Insurance';
            else if (catLower.includes('subscription')) billType = 'Subscription';

            const name = desc || (isCC ? 'Credit Card Payment' : isEMI ? 'Loan EMI Payment' : `${cat} Payment`);

            // Avoid duplicates if already in manual entries
            const exists = manualEntries.some(
              (m) => m.transactionId === tx.id || (m.billName === name && m.paidDate === tx.date)
            );

            if (!exists) {
              autoEntries.push({
                id: `auto_hist_${tx.id}`,
                billId: `bill_tx_${tx.id}`,
                billName: name,
                type: billType,
                amount: Number(tx.amount || 0),
                paidDate: tx.date || new Date().toISOString().split('T')[0],
                status: 'paid',
                transactionId: tx.id,
                notes: notes || `Verified from ${tx.type}`,
                createdAt: tx.createdAt || new Date().toISOString(),
              });
            }
          }
        });
      }
    }
  } catch (err) {
    console.error('Failed to parse transactions for bill history', err);
  }

  const combined = [...manualEntries, ...autoEntries].sort((a, b) =>
    (b.paidDate || '').localeCompare(a.paidDate || '')
  );

  return combined;
}

export function addBillHistoryEntry(entry: Omit<BillPaymentHistoryEntry, 'id' | 'createdAt'>): BillPaymentHistoryEntry {
  const history = getBillHistory();
  const newEntry: BillPaymentHistoryEntry = {
    ...entry,
    id: 'hist_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    createdAt: new Date().toISOString(),
  };
  const updated = [newEntry, ...history].slice(0, 200);
  safeSetItem(BILL_HISTORY_STORAGE_KEY, JSON.stringify(updated));
  return newEntry;
}

// Compute Next Occurrence Date for recurring bills
export function computeNextDueDate(currentDueDateStr: string, recurrence: BillRecurrence): string {
  const d = new Date(currentDueDateStr + 'T00:00:00');
  switch (recurrence) {
    case 'daily':
      d.setDate(d.getDate() + 1);
      break;
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      break;
    case 'quarterly':
      d.setMonth(d.getMonth() + 3);
      break;
    case 'yearly':
      d.setFullYear(d.getFullYear() + 1);
      break;
    default:
      return currentDueDateStr;
  }
  return d.toISOString().split('T')[0];
}

// Mark Bill as Paid
export function markBillAsPaid(params: {
  billId: string;
  amount: number;
  accountId?: string;
  paymentDate: string; // "YYYY-MM-DD"
  notes?: string;
}): { updatedBill: BillPaymentReminder; createdTransactionId?: string } {
  const bills = getStoredBills();
  const bill = bills.find((b) => b.id === params.billId);
  if (!bill) {
    throw new Error('Bill not found');
  }

  // Prevent duplicate payment processing if already paid
  if (bill.linkedTransactionId) {
    return { updatedBill: bill, createdTransactionId: bill.linkedTransactionId };
  }

  let createdTxnId: string | undefined = undefined;

  // Integrate with Loan repayment if this is a loan EMI bill
  if (bill.type === 'EMI / Loan' && bill.linkedLoanId) {
    const accounts = getAccounts();
    const loanAcc = accounts.find((a) => a.id === bill.linkedLoanId);
    if (loanAcc) {
      const pmtAmount = Number(params.amount) || bill.amount;
      const interestRate = loanAcc.interestRate || 10;
      const accrued = loanAcc.accruedInterest || 0;
      
      const interestComponent = Number(Math.min(pmtAmount, accrued).toFixed(2));
      const principalComponent = Number(Math.max(0, pmtAmount - interestComponent).toFixed(2));

      // Record transaction
      const txn = saveTransaction({
        amount: pmtAmount,
        type: 'expense',
        account: params.accountId || loanAcc.linkedPaymentAccountId || 'acc-cash',
        category: 'EMI / Rent',
        description: `EMI Payment - ${bill.name}`,
        date: params.paymentDate,
        notes: params.notes || `Principal: ₹${principalComponent}, Interest: ₹${interestComponent}`,
      });
      createdTxnId = txn.id;

      // Update Loan details
      const newPrincipalRepaid = Number(((loanAcc.totalPrincipalRepaid || 0) + principalComponent).toFixed(2));
      const newInterestPaid = Number(((loanAcc.totalInterestPaid || 0) + interestComponent).toFixed(2));
      const newAmountPaid = Number(((loanAcc.totalAmountPaid || 0) + pmtAmount).toFixed(2));

      updateAccount(loanAcc.id, {
        totalPrincipalRepaid: newPrincipalRepaid,
        totalInterestPaid: newInterestPaid,
        totalAmountPaid: newAmountPaid,
      } as any);
    }
  } else {
    // Standard Expense Transaction Creation
    const txn = saveTransaction({
      amount: Number(params.amount) || bill.amount,
      type: 'expense',
      account: params.accountId || 'acc-cash',
      category: bill.categoryId || (bill.type === 'Credit Card' ? 'Credit Card' : bill.type),
      description: bill.name,
      date: params.paymentDate,
      notes: params.notes || `Payment for ${bill.name}`,
    });
    createdTxnId = txn.id;
  }

  // Record History Entry
  addBillHistoryEntry({
    billId: bill.id,
    billName: bill.name,
    type: bill.type,
    amount: Number(params.amount) || bill.amount,
    paidFromAccountId: params.accountId,
    paidDate: params.paymentDate,
    status: 'paid',
    transactionId: createdTxnId,
    notes: params.notes,
  });

  // Mark current bill as Paid
  updateBill(bill.id, {
    status: 'paid',
    amount: Number(params.amount) || bill.amount,
    linkedTransactionId: createdTxnId,
  });

  // If recurring, automatically generate next occurrence!
  if (bill.recurrence !== 'one_time') {
    const nextDate = computeNextDueDate(bill.dueDate, bill.recurrence);
    addBill({
      name: bill.name,
      type: bill.type,
      amount: bill.amount,
      amountType: bill.amountType,
      minimumDue: bill.minimumDue,
      dueDate: nextDate,
      dueTime: bill.dueTime,
      accountId: bill.accountId,
      categoryId: bill.categoryId,
      notes: bill.notes,
      recurrence: bill.recurrence,
      dayOfMonth: bill.dayOfMonth,
      monthOfYear: bill.monthOfYear,
      reminderSchedule: bill.reminderSchedule,
      customReminderTime: bill.customReminderTime,
      linkedLoanId: bill.linkedLoanId,
      linkedAccountId: bill.linkedAccountId,
    });
  }

  const updatedBills = getStoredBills();
  const resultBill = updatedBills.find((b) => b.id === bill.id) || bill;
  return { updatedBill: resultBill, createdTransactionId: createdTxnId };
}

// Skip Bill Occurrence
export function skipBillOccurrence(billId: string): BillPaymentReminder {
  const bills = getStoredBills();
  const bill = bills.find((b) => b.id === billId);
  if (!bill) {
    throw new Error('Bill not found');
  }

  addBillHistoryEntry({
    billId: bill.id,
    billName: bill.name,
    type: bill.type,
    amount: bill.amount,
    paidDate: new Date().toISOString().split('T')[0],
    status: 'skipped',
    notes: 'Skipped occurrence',
  });

  updateBill(bill.id, { status: 'skipped' });

  // Generate next recurring occurrence
  if (bill.recurrence !== 'one_time') {
    const nextDate = computeNextDueDate(bill.dueDate, bill.recurrence);
    addBill({
      name: bill.name,
      type: bill.type,
      amount: bill.amount,
      amountType: bill.amountType,
      minimumDue: bill.minimumDue,
      dueDate: nextDate,
      dueTime: bill.dueTime,
      accountId: bill.accountId,
      categoryId: bill.categoryId,
      notes: bill.notes,
      recurrence: bill.recurrence,
      dayOfMonth: bill.dayOfMonth,
      monthOfYear: bill.monthOfYear,
      reminderSchedule: bill.reminderSchedule,
      customReminderTime: bill.customReminderTime,
      linkedLoanId: bill.linkedLoanId,
      linkedAccountId: bill.linkedAccountId,
    });
  }

  const updatedBills = getStoredBills();
  return updatedBills.find((b) => b.id === billId) || bill;
}

// Snooze Bill Reminder
export function snoozeBillReminder(billId: string, daysToSnooze: number): BillPaymentReminder {
  const targetDate = new Date(Date.now() + daysToSnooze * 86400000).toISOString();
  const updated = updateBill(billId, { snoozedUntil: targetDate });
  if (!updated) throw new Error('Bill not found');
  return updated;
}
