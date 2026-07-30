'use client';

import React, { useEffect, useState, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import Modal from '@/components/ui/Modal';
import {
  getAccounts,
  addAccount,
  updateAccount,
  deleteAccount,
  saveTransaction,
  deleteTransaction,
  getTransactions,
  calculateInterestAccrual,
  getRepayments,
  saveRepayments,
  recalculateLoanTimeline,
  type Account,
  type Repayment,
} from '@/lib/storage';
import { toast } from 'sonner';
import {
  Edit2,
  Trash2,
  Archive,
  Eye,
  EyeOff,
  Plus,
  Landmark,
  TrendingUp,
  TrendingDown,
  Calendar,
  Info,
} from 'lucide-react';

const EMPTY_FORM = {
  name: '',
  type: 'loan' as Account['type'],
  balance: '',
  color: '#ef4444',
  visible: true,
  icon: '📉',
  notes: '',
  originalAmount: '',
  emiAmount: '',
  interestRate: '',
  dueDate: '',

  // Extended Loan fields
  lenderName: '',
  startDate: '',
  interestType: 'reducing',
  tenureMonths: '',
  tenureYears: '',
  tenureType: 'months',
  firstEmiDate: '',
  emiDueDay: '',
  loanAccountNumber: '',
  processingFee: '',
  prepaymentCharges: '',
  latePaymentCharges: '',
  linkedPaymentAccountId: '',
  autoCreateEmi: false,
  isInformal: false,
  loanStatus: 'active',
  interestStartDate: '',
  expectedRepaymentDate: '',
  compoundingFrequency: 'monthly',
};

function calculateRemainingTenure(outstanding: number, annualRate: number, emi: number): number {
  if (outstanding <= 0) return 0;
  if (annualRate <= 0 || emi <= 0) return Math.ceil(outstanding / (emi || 1));
  const r = annualRate / 12 / 100;
  const pv = outstanding;
  const pmt = emi;
  if (pmt <= pv * r) {
    return 120; // fallback if EMI is not enough to cover interest
  }
  const n = -Math.log(1 - (pv * r) / pmt) / Math.log(1 + r);
  return Math.ceil(n);
}

function calculateNewEMI(outstanding: number, annualRate: number, remainingMonths: number): number {
  if (outstanding <= 0 || remainingMonths <= 0) return 0;
  if (annualRate <= 0) return Math.ceil(outstanding / remainingMonths);
  const r = annualRate / 12 / 100;
  const n = remainingMonths;
  const emi = (outstanding * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  return Math.ceil(emi);
}

const getNextEmiDateStr = (currentDueStr: string, dueDay: number) => {
  if (!currentDueStr || !/^\d{4}-\d{2}-\d{2}$/.test(currentDueStr)) return '';
  const parts = currentDueStr.split('-');
  const y = parseInt(parts[0]);
  const m = parseInt(parts[1]) - 1; // 0-indexed month
  const d = new Date(y, m + 1, dueDay || 5);
  return d.toISOString().slice(0, 10);
};

interface LedgerRow {
  period: string;
  startDateStr: string;
  endDateStr: string;
  openingPrincipal: number;
  interestAccrued: number;
  paymentsMade: number;
  closingPrincipal: number;
}

function generateMonthlyLedger(loan: Account, transactions: any[]): LedgerRow[] {
  const ledger: LedgerRow[] = [];
  const startStr = (loan as any).startDate || (loan as any).firstEmiDate;
  if (!startStr) return [];

  const parts = startStr.split('-');
  const startY = parseInt(parts[0]) || new Date().getFullYear();
  const startM = parseInt(parts[1]) - 1 || 0;
  const startD = parseInt(parts[2]) || 1;

  const rate = Number(loan.interestRate) || 0;
  const monthlyRate = rate / 12 / 100;

  let currentOutstanding = loan.originalAmount || Math.abs(loan.balance) || 0;
  const today = new Date();

  // Filter all transactions for this loan
  const loanTxns = transactions.filter((t) => {
    const isPrincipal = t.toAccount === loan.id;
    const isInterest =
      t.category === 'Interest' &&
      (t.description.includes(loan.name) || (t.notes && t.notes.includes(loan.name)));
    return isPrincipal || isInterest;
  });

  let cycleStart = new Date(startY, startM, startD);
  let cycleIndex = 0;

  while (cycleStart <= today && currentOutstanding > 0) {
    const nextMonthDate = new Date(cycleStart.getFullYear(), cycleStart.getMonth() + 1, startD);
    const cycleStartStr = cycleStart.toISOString().slice(0, 10);

    // Get day before next month date
    const prevDay = new Date(nextMonthDate.getTime() - 86400000);
    const cycleEndStr = prevDay.toISOString().slice(0, 10);

    // Sum transactions in this period
    const periodTxns = loanTxns.filter((t) => t.date >= cycleStartStr && t.date <= cycleEndStr);
    const principalRepaid = periodTxns
      .filter((t) => t.toAccount === loan.id)
      .reduce((sum, t) => sum + t.amount, 0);
    const interestRepaid = periodTxns
      .filter((t) => t.category === 'Interest')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalPayments = principalRepaid + interestRepaid;

    // Accrued interest on opening principal of this month
    const interestAccrued = currentOutstanding * monthlyRate;

    // Closing principal is reduced by principal portion of repayments
    const closingPrincipal = Math.max(0, currentOutstanding - principalRepaid);

    const monthName = cycleStart.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

    ledger.push({
      period: monthName,
      startDateStr: cycleStartStr,
      endDateStr: cycleEndStr,
      openingPrincipal: Number(currentOutstanding.toFixed(2)),
      interestAccrued: Number(interestAccrued.toFixed(2)),
      paymentsMade: Number(totalPayments.toFixed(2)),
      closingPrincipal: Number(closingPrincipal.toFixed(2)),
    });

    currentOutstanding = closingPrincipal;
    cycleStart = nextMonthDate;
    cycleIndex++;

    if (cycleIndex > 240) break; // safety breakout
  }

  return ledger;
}

export default function LoansPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loanSearch, setLoanSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  // Modals and form state
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState(EMPTY_FORM);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [activeLoanDetails, setActiveLoanDetails] = useState<Account | null>(null);
  const [payingLoan, setPayingLoan] = useState<Account | null>(null);
  const [prepayingLoan, setPrepayingLoan] = useState<Account | null>(null);

  // Pay EMI states
  const [payEmiAmount, setPayEmiAmount] = useState('');
  const [payEmiDate, setPayEmiDate] = useState('');
  const [payEmiAccountId, setPayEmiAccountId] = useState('');

  // Prepayment states
  const [prepayAmount, setPrepayAmount] = useState('');
  const [prepayDate, setPrepayDate] = useState('');
  const [prepayAccountId, setPrepayAccountId] = useState('');
  const [prepayStrategy, setPrepayStrategy] = useState<'tenure' | 'emi'>('tenure');
  const [prepayNotes, setPrepayNotes] = useState('');

  // Friend Repayment states
  const [friendRepayingLoan, setFriendRepayingLoan] = useState<Account | null>(null);
  const [repayAmount, setRepayAmount] = useState('');
  const [repayDate, setRepayDate] = useState('');
  const [repayAccountId, setRepayAccountId] = useState('');
  const [repayNotes, setRepayNotes] = useState('');

  // Edit / Delete Repayment states
  const [editingRepayment, setEditingRepayment] = useState<Repayment | null>(null);
  const [repaymentForm, setRepaymentForm] = useState({
    amount: '',
    date: '',
    paymentAccountId: '',
    notes: '',
  });
  const [deletingRepayment, setDeletingRepayment] = useState<Repayment | null>(null);

  const [deleteAccountTarget, setDeleteAccountTarget] = useState<Account | null>(null);
  const [allTransactions, setAllTransactions] = useState<any[]>([]);

  useEffect(() => {
    refreshAccounts();
  }, []);

  const refreshAccounts = () => {
    setAccounts(getAccounts(true));
    // Import getTransactions dynamically or call it directly
    const txns = getTransactions(true);
    setAllTransactions(txns);
  };

  const activeLoanLedger = useMemo(() => {
    if (!activeLoanDetails) return [];
    return generateMonthlyLedger(activeLoanDetails, allTransactions);
  }, [activeLoanDetails, allTransactions]);

  const loansList = useMemo(() => {
    let list = accounts.filter((a) => a.type === 'loan');
    if (!showArchived) {
      list = list.filter((a) => !a.archived);
    }
    if (loanSearch.trim()) {
      const q = loanSearch.toLowerCase();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.lenderName || '').toLowerCase().includes(q) ||
          (a.loanAccountNumber || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [accounts, loanSearch, showArchived]);

  // Aggregate stats
  const stats = useMemo(() => {
    const activeLoans = accounts.filter(
      (a) =>
        a.type === 'loan' &&
        !a.archived &&
        a.loanStatus !== 'paid_off'
    );
    const outstandingPrincipal = activeLoans.reduce((s, a) => s + Math.abs(a.balance), 0);
    const accruedInterest = activeLoans.reduce((s, a) => s + (a.accruedInterest || 0), 0);
    const totalLiability = outstandingPrincipal + accruedInterest;

    const totalRepaidPrincipal = accounts
      .filter((a) => a.type === 'loan')
      .reduce((s, a) => s + (a.totalPrincipalRepaid || 0), 0);
    const totalRepaidInterest = accounts
      .filter((a) => a.type === 'loan')
      .reduce((s, a) => s + (a.totalInterestPaid || 0), 0);
    const totalRepaid = totalRepaidPrincipal + totalRepaidInterest;

    return {
      count: activeLoans.length,
      outstandingPrincipal,
      accruedInterest,
      totalLiability,
      totalRepaid,
    };
  }, [accounts]);

  const emiPreview = useMemo(() => {
    if (accountForm.type !== 'loan') return null;
    const p = parseFloat(accountForm.originalAmount) || 0;
    const r = parseFloat(accountForm.interestRate) || 0;
    const tenureMonthsVal =
      accountForm.tenureType === 'years'
        ? parseFloat(accountForm.tenureYears) * 12
        : parseFloat(accountForm.tenureMonths);
    const n = tenureMonthsVal || 0;

    if (p <= 0 || r <= 0 || n <= 0) return null;

    const monthlyRate = r / 12 / 100;
    let calculatedEmi = 0;
    if (accountForm.interestType === 'flat') {
      calculatedEmi = (p + p * (r / 100) * (n / 12)) / n;
    } else {
      calculatedEmi =
        (p * monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1);
    }

    const totalPayment = calculatedEmi * n;
    const totalInterest = totalPayment - p;

    const startStr = accountForm.startDate || new Date().toISOString().slice(0, 10);
    const start = new Date(startStr);
    const end = new Date(start.getFullYear(), start.getMonth() + n, start.getDate());

    return {
      emi: Math.ceil(calculatedEmi),
      totalPayment: Math.ceil(totalPayment),
      totalInterest: Math.ceil(totalInterest),
      endDate: end.toLocaleDateString('en-IN', { year: 'numeric', month: 'short' }),
    };
  }, [
    accountForm.originalAmount,
    accountForm.interestRate,
    accountForm.tenureMonths,
    accountForm.tenureYears,
    accountForm.tenureType,
    accountForm.interestType,
    accountForm.startDate,
    accountForm.type,
  ]);

  const activeLoanSchedule = useMemo(() => {
    if (!activeLoanDetails) return [];
    const rows = [];
    const original = activeLoanDetails.originalAmount || 0;
    const rate = Number(activeLoanDetails.interestRate) || 0;
    const emi = Number(activeLoanDetails.emiAmount) || 0;
    const tenure = Number(activeLoanDetails.tenureMonths) || 60;
    const dueDay = Number(activeLoanDetails.emiDueDay) || 5;
    const startStr =
      activeLoanDetails.firstEmiDate ||
      activeLoanDetails.startDate ||
      new Date().toISOString().slice(0, 10);

    let opening = original;
    let tempPaid = activeLoanDetails.totalAmountPaid || 0;
    const today = new Date();

    for (let i = 1; i <= tenure; i++) {
      if (opening <= 0) break;
      let interest = 0;
      if (activeLoanDetails.interestType === 'flat') {
        interest = original * (rate / 12 / 100);
      } else {
        interest = opening * (rate / 12 / 100);
      }

      let principal = emi - interest;
      if (principal <= 0) {
        principal = Math.max(0, emi - interest);
      }
      if (opening - principal < 0) {
        principal = opening;
      }
      const closing = Math.max(0, opening - principal);

      const parts = startStr.split('-');
      const y = parseInt(parts[0]) || new Date().getFullYear();
      const m = parseInt(parts[1]) - 1 || new Date().getMonth();
      const dueDate = new Date(y, m + (i - 1), dueDay);
      const dueDateStr = dueDate.toISOString().slice(0, 10);

      let status: 'Paid' | 'Partially Paid' | 'Due' | 'Overdue' | 'Upcoming' = 'Upcoming';
      const totalEmiCost = principal + interest;

      if (tempPaid >= totalEmiCost) {
        status = 'Paid';
        tempPaid -= totalEmiCost;
      } else if (tempPaid > 0) {
        status = 'Partially Paid';
        tempPaid = 0;
      } else {
        if (dueDate < today) {
          status = 'Overdue';
        } else {
          status = 'Due';
        }
      }

      rows.push({
        num: i,
        dueDateStr,
        opening: Number(opening.toFixed(2)),
        emi: Number(totalEmiCost.toFixed(2)),
        principal: Number(principal.toFixed(2)),
        interest: Number(interest.toFixed(2)),
        closing: Number(closing.toFixed(2)),
        status,
      });

      opening = closing;
    }
    return rows;
  }, [activeLoanDetails]);

  const handleOpenAdd = () => {
    setEditingId(null);
    setAccountForm(EMPTY_FORM);
    setShowAccountForm(true);
  };

  const handleOpenEdit = (account: Account) => {
    setEditingId(account.id);
    let tenureMonths = '';
    let tenureYears = '';
    let tenureType = 'months';
    if (account.tenureMonths) {
      if (account.tenureMonths % 12 === 0) {
        tenureYears = String(account.tenureMonths / 12);
        tenureType = 'years';
      } else {
        tenureMonths = String(account.tenureMonths);
        tenureType = 'months';
      }
    }

    setAccountForm({
      name: account.name,
      type: account.type,
      balance: String(
        Math.abs(account.openingBalance !== undefined ? account.openingBalance : account.balance)
      ),
      color: account.color,
      visible: account.visible !== false,
      icon: account.icon || '📉',
      notes: account.notes || '',
      originalAmount: account.originalAmount ? String(account.originalAmount) : '',
      emiAmount: account.emiAmount ? String(account.emiAmount) : '',
      interestRate: account.interestRate ? String(account.interestRate) : '',
      dueDate: account.dueDate || '',

      lenderName: (account as any).lenderName || '',
      startDate: (account as any).startDate || '',
      interestType: (account as any).interestType || 'reducing',
      tenureMonths,
      tenureYears,
      tenureType,
      firstEmiDate: (account as any).firstEmiDate || '',
      emiDueDay: (account as any).emiDueDay ? String((account as any).emiDueDay) : '',
      loanAccountNumber: (account as any).loanAccountNumber || '',
      processingFee: (account as any).processingFee ? String((account as any).processingFee) : '',
      prepaymentCharges: (account as any).prepaymentCharges
        ? String((account as any).prepaymentCharges)
        : '',
      latePaymentCharges: (account as any).latePaymentCharges
        ? String((account as any).latePaymentCharges)
        : '',
      linkedPaymentAccountId: (account as any).linkedPaymentAccountId || '',
      autoCreateEmi: !!(account as any).autoCreateEmi,
      isInformal: !!(account as any).isInformal || !!(account as any).isInformalLoan,
      loanStatus: (account as any).loanStatus || 'active',
      interestStartDate: (account as any).interestStartDate || (account as any).startDate || '',
      expectedRepaymentDate: (account as any).expectedRepaymentDate || '',
      compoundingFrequency: (account as any).compoundingFrequency || 'monthly',
    });
    setShowAccountForm(true);
  };

  const handleSaveLoan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountForm.name.trim()) return;

    const originalAmountVal = Number(accountForm.originalAmount) || 0;
    const rateVal = Number(accountForm.interestRate) || 0;
    const balanceVal = Number(accountForm.balance) || 0;

    if (originalAmountVal <= 0) {
      toast.error('Principal must be greater than zero.');
      return;
    }
    if (rateVal < 0) {
      toast.error('Interest rate cannot be negative.');
      return;
    }
    if (balanceVal < 0) {
      toast.error('Current outstanding cannot be negative.');
      return;
    }
    if (!accountForm.startDate) {
      toast.error('Loan start date is required.');
      return;
    }

    if (!accountForm.isInformal) {
      const tenureMonthsVal =
        accountForm.tenureType === 'years'
          ? Number(accountForm.tenureYears) * 12
          : Number(accountForm.tenureMonths);
      if (!tenureMonthsVal || tenureMonthsVal <= 0) {
        toast.error('Standard fixed-tenure loans require a valid tenure.');
        return;
      }
    }

    const payload: Partial<Account> = {
      name: accountForm.name.trim(),
      type: 'loan',
      balance: balanceVal,
      color: accountForm.color,
      visible: accountForm.visible,
      icon: accountForm.icon.trim() || '📉',

      originalAmount: originalAmountVal || undefined,
      emiAmount: accountForm.isInformal ? undefined : Number(accountForm.emiAmount) || undefined,
      interestRate: rateVal || undefined,
      dueDate: accountForm.isInformal
        ? accountForm.expectedRepaymentDate.trim() || undefined
        : accountForm.dueDate.trim() || undefined,

      lenderName: accountForm.lenderName.trim() || undefined,
      startDate: accountForm.startDate.trim() || undefined,
      interestType: accountForm.interestType as any,
      firstEmiDate: accountForm.isInformal
        ? undefined
        : accountForm.firstEmiDate.trim() || undefined,
      emiDueDay: accountForm.isInformal ? undefined : Number(accountForm.emiDueDay) || undefined,
      loanAccountNumber: accountForm.loanAccountNumber.trim() || undefined,
      processingFee: Number(accountForm.processingFee) || undefined,
      prepaymentCharges: Number(accountForm.prepaymentCharges) || undefined,
      latePaymentCharges: Number(accountForm.latePaymentCharges) || undefined,
      linkedPaymentAccountId: accountForm.linkedPaymentAccountId || undefined,
      autoCreateEmi: accountForm.isInformal ? false : !!accountForm.autoCreateEmi,
      isInformal: !!accountForm.isInformal,
      isInformalLoan: !!accountForm.isInformal,
      loanStatus: accountForm.loanStatus as any,
      notes: accountForm.notes.trim() || undefined,
      interestStartDate: accountForm.startDate.trim(), // Starts from exact taken date
      expectedRepaymentDate: accountForm.isInformal
        ? accountForm.expectedRepaymentDate.trim() || undefined
        : undefined,
      compoundingFrequency:
        accountForm.isInformal && accountForm.interestType === 'compound'
          ? (accountForm.compoundingFrequency as any)
          : undefined,
    };

    // Calculate tenure
    const tenureMonthsVal = accountForm.isInformal
      ? 0
      : accountForm.tenureType === 'years'
        ? Number(accountForm.tenureYears) * 12
        : Number(accountForm.tenureMonths);
    payload.tenureMonths = tenureMonthsVal || undefined;

    // Convert balance to negative for liability (always borrowing)
    if (balanceVal > 0) {
      payload.balance = -balanceVal;
    } else if (balanceVal === 0 && payload.originalAmount) {
      payload.balance = -payload.originalAmount;
    }

    if (editingId) {
      const { balance, ...editPayload } = payload;
      updateAccount(editingId, editPayload);
      toast.success('Loan updated successfully!');
    } else {
      addAccount(payload as Omit<Account, 'id'>);
      toast.success('New Loan created!');
    }

    refreshAccounts();
    setShowAccountForm(false);
  };

  const handleDeleteExecute = () => {
    if (!deleteAccountTarget) return;
    deleteAccount(deleteAccountTarget.id);
    toast.success(`Account "${deleteAccountTarget.name}" deleted.`);
    setDeleteAccountTarget(null);
    refreshAccounts();
  };

  const handlePayEmi = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingLoan) return;
    if (!payEmiAccountId) {
      toast.error('Please select a payment account.');
      return;
    }
    const amountVal = Number(payEmiAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      toast.error('Please enter a valid amount.');
      return;
    }

    const accrued = payingLoan.accruedInterest || 0;
    const interestComponent = Number(Math.min(accrued, amountVal).toFixed(2));
    const principalComponent = Number((amountVal - interestComponent).toFixed(2));

    if (interestComponent > 0) {
      saveTransaction({
        date: payEmiDate,
        amount: interestComponent,
        account: payEmiAccountId,
        type: 'expense',
        category: 'Interest',
        description: `EMI Repayment (Interest) - ${payingLoan.name}`,
        notes: `Interest portion of EMI payment. Outstanding was ${Math.abs(payingLoan.balance)}`,
      });
    }

    if (principalComponent > 0) {
      saveTransaction({
        date: payEmiDate,
        amount: principalComponent,
        account: payEmiAccountId,
        toAccount: payingLoan.id,
        type: 'transfer',
        category: 'EMI / Rent',
        description: `EMI Repayment (Principal) - ${payingLoan.name}`,
        notes: `Principal portion of EMI payment.`,
      });
    }

    const nextDue = getNextEmiDateStr(
      payingLoan.dueDate || payingLoan.firstEmiDate || payingLoan.startDate || '',
      payingLoan.emiDueDay || 5
    );
    const newAccrued = Number(Math.max(0, accrued - interestComponent).toFixed(2));
    const newPrincipalRepaid = Number(
      ((payingLoan.totalPrincipalRepaid || 0) + principalComponent).toFixed(2)
    );
    const newInterestPaid = Number(
      ((payingLoan.totalInterestPaid || 0) + interestComponent).toFixed(2)
    );
    const newAmountPaid = Number(((payingLoan.totalAmountPaid || 0) + amountVal).toFixed(2));
    const remainingTenure = Math.max(
      0,
      (payingLoan.remainingTenureMonths !== undefined
        ? payingLoan.remainingTenureMonths
        : payingLoan.tenureMonths || 60) - 1
    );

    updateAccount(payingLoan.id, {
      accruedInterest: newAccrued,
      totalPrincipalRepaid: newPrincipalRepaid,
      totalInterestPaid: newInterestPaid,
      totalAmountPaid: newAmountPaid,
      remainingTenureMonths: remainingTenure,
      dueDate: nextDue,
    } as any);

    toast.success('EMI Payment recorded successfully!');
    setPayingLoan(null);
    setActiveLoanDetails(null);
    refreshAccounts();
  };

  const handlePrepayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prepayingLoan) return;
    if (!prepayAccountId) {
      toast.error('Please select a payment account.');
      return;
    }
    const amountVal = Number(prepayAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      toast.error('Please enter a valid amount.');
      return;
    }

    const accrued = prepayingLoan.accruedInterest || 0;
    const interestComponent = Number(Math.min(accrued, amountVal).toFixed(2));
    const principalComponent = Number((amountVal - interestComponent).toFixed(2));

    if (interestComponent > 0) {
      saveTransaction({
        date: prepayDate,
        amount: interestComponent,
        account: prepayAccountId,
        type: 'expense',
        category: 'Interest',
        description: `Prepayment Settlement (Interest) - ${prepayingLoan.name}`,
        notes: `Interest settled during prepayment.`,
      });
    }

    if (principalComponent > 0) {
      saveTransaction({
        date: prepayDate,
        amount: principalComponent,
        account: prepayAccountId,
        toAccount: prepayingLoan.id,
        type: 'transfer',
        category: 'EMI / Rent',
        description: `Prepayment Principal - ${prepayingLoan.name}`,
        notes: prepayNotes.trim() || `Prepayment toward loan principal.`,
      });
    }

    const newOutstanding = Math.abs(prepayingLoan.balance) - principalComponent;
    const rate = Number(prepayingLoan.interestRate) || 0;
    const newAccrued = Number(Math.max(0, accrued - interestComponent).toFixed(2));
    const newPrincipalRepaid = Number(
      ((prepayingLoan.totalPrincipalRepaid || 0) + principalComponent).toFixed(2)
    );
    const newInterestPaid = Number(
      ((prepayingLoan.totalInterestPaid || 0) + interestComponent).toFixed(2)
    );
    const newAmountPaid = Number(((prepayingLoan.totalAmountPaid || 0) + amountVal).toFixed(2));

    const updates: any = {
      accruedInterest: newAccrued,
      totalPrincipalRepaid: newPrincipalRepaid,
      totalInterestPaid: newInterestPaid,
      totalAmountPaid: newAmountPaid,
    };

    if (prepayStrategy === 'emi') {
      const remainingTenure =
        prepayingLoan.remainingTenureMonths !== undefined
          ? prepayingLoan.remainingTenureMonths
          : prepayingLoan.tenureMonths || 60;
      const newEmi = calculateNewEMI(newOutstanding, rate, remainingTenure);
      updates.emiAmount = newEmi;
    } else {
      const emi = Number(prepayingLoan.emiAmount) || 10000;
      const remaining = calculateRemainingTenure(newOutstanding, rate, emi);
      updates.remainingTenureMonths = remaining;
    }

    updateAccount(prepayingLoan.id, updates);

    toast.success('Prepayment recorded successfully!');
    setPrepayingLoan(null);
    setActiveLoanDetails(null);
    refreshAccounts();
  };

  const handleFriendRepayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!friendRepayingLoan) return;
    if (!repayAccountId) {
      toast.error('Please select a payment account.');
      return;
    }
    const amountVal = Number(repayAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      toast.error('Please enter a valid amount.');
      return;
    }

    if (!repayDate) {
      toast.error('Please select a repayment date.');
      return;
    }
    if (new Date(repayDate) < new Date(friendRepayingLoan.startDate || '')) {
      toast.error('Repayment date cannot be before the loan start date.');
      return;
    }

    const newRepayment: Repayment = {
      id: `repay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      loanId: friendRepayingLoan.id,
      amount: amountVal,
      date: repayDate,
      paymentAccountId: repayAccountId,
      notes: repayNotes.trim() || undefined,
      interestPaid: 0,
      principalPaid: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const all = getRepayments();
    all.push(newRepayment);
    saveRepayments(all);

    recalculateLoanTimeline(friendRepayingLoan.id);

    toast.success('Repayment recorded successfully!');
    setFriendRepayingLoan(null);
    setActiveLoanDetails(null);
    refreshAccounts();
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
    refreshAccounts();

    if (activeLoanDetails) {
      const refreshed = getAccounts(true).find((a) => a.id === activeLoanDetails.id);
      if (refreshed) {
        setActiveLoanDetails(refreshed);
      }
    }
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
    refreshAccounts();

    if (activeLoanDetails) {
      const refreshed = getAccounts(true).find((a) => a.id === activeLoanDetails.id);
      if (refreshed) {
        setActiveLoanDetails(refreshed);
      }
    }
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Header section */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-extrabold text-foreground tracking-wide flex items-center gap-2">
              <Landmark className="text-primary" />
              LOANS & LIABILITY MANAGEMENT
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Track outstanding liability, amortization schedules, EMI schedules, and prepayments
            </p>
          </div>
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/95 transition shadow-lg shadow-primary/10"
          >
            <Plus size={14} /> Add Loan Account
          </button>
        </div>

        {/* Aggregate KPI Stats cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-card border border-border rounded-2xl p-4 shadow-md space-y-2">
            <span className="text-3xs text-muted-foreground uppercase font-bold tracking-wider">
              Active Borrowings
            </span>
            <p className="text-xl font-extrabold text-foreground">{stats.count}</p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4 shadow-md space-y-2">
            <span className="text-3xs text-muted-foreground uppercase font-bold tracking-wider">
              Outstanding Principal
            </span>
            <p className="text-xl font-extrabold text-foreground font-mono">
              ₹{stats.outstandingPrincipal.toLocaleString('en-IN')}
            </p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4 shadow-md space-y-2">
            <span className="text-3xs text-muted-foreground uppercase font-bold tracking-wider">
              Accrued Unpaid Interest
            </span>
            <p className="text-xl font-extrabold text-amber-500 font-mono">
              ₹{stats.accruedInterest.toLocaleString('en-IN')}
            </p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4 shadow-md space-y-2">
            <span className="text-3xs text-muted-foreground uppercase font-bold tracking-wider">
              Total Outstanding Debt
            </span>
            <p className="text-xl font-extrabold text-negative font-mono">
              ₹{stats.totalLiability.toLocaleString('en-IN')}
            </p>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-center bg-[#0b0f1a]/40 border border-border rounded-2xl p-4">
          <input
            type="text"
            value={loanSearch}
            onChange={(e) => setLoanSearch(e.target.value)}
            placeholder="Search loans, lenders, reference numbers..."
            className="w-full sm:w-80 rounded-xl border border-border bg-card p-2 text-xs text-foreground focus:outline-none focus:border-primary transition"
          />
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="showArchived"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="rounded border-border text-primary bg-[#0b0f1a] h-4 w-4"
            />
            <label
              htmlFor="showArchived"
              className="text-xs text-muted-foreground font-semibold cursor-pointer"
            >
              Show Archived Loans
            </label>
          </div>
        </div>

        {/* Loan Accounts List */}
        <div className="border border-border rounded-2xl bg-card overflow-hidden shadow-md">
          {/* Mobile view */}
          <div className="block md:hidden divide-y divide-border/30">
            {loansList.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                No loan accounts found matching the criteria.
              </div>
            ) : (
              loansList.map((acc) => {
                const outstanding = Math.abs(acc.balance);
                const totalLiability = outstanding + (acc.accruedInterest || 0);
                return (
                  <div key={acc.id} className="p-4 space-y-3">
                    <div className="flex justify-between items-start gap-2">
                      <div className="font-bold text-sm flex flex-col gap-0.5 text-foreground">
                        <span className="flex items-center gap-2">
                          {acc.name}
                          {acc.archived && (
                            <span className="text-3xs font-bold text-negative border border-negative-subtle bg-negative-subtle px-1 py-0.5 rounded uppercase">
                              Archived
                            </span>
                          )}
                        </span>
                        <span className="text-3xs text-muted-foreground font-normal">
                          Lender: {acc.lenderName || 'Unknown'} | Status:{' '}
                          <span className="capitalize font-semibold text-primary">
                            {(acc.loanStatus || 'active').replace('_', ' ')}
                          </span>
                        </span>
                      </div>
                      <div className="text-right flex flex-col items-end">
                        <span className="text-sm font-extrabold font-mono text-negative">
                          ₹{totalLiability.toLocaleString('en-IN')}
                        </span>
                        {acc.accruedInterest ? (
                          <span className="text-4xs text-amber-500 font-mono">
                            Incl. ₹{acc.accruedInterest.toLocaleString('en-IN')} interest
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-2xs text-muted-foreground">
                      <div>
                        Original Principal:{' '}
                        <span className="text-foreground font-mono">
                          ₹{(acc.originalAmount || 0).toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div>
                        EMI Amount:{' '}
                        <span className="text-negative font-mono">
                          {acc.isInformal ? (
                            <span className="text-muted-foreground font-sans">Flexible</span>
                          ) : (
                            `₹${(acc.emiAmount || 0).toLocaleString('en-IN')}`
                          )}
                        </span>
                      </div>
                      <div>
                        Interest Rate:{' '}
                        <span className="text-foreground font-mono">
                          {acc.interestRate ? (
                            `${acc.interestRate}%`
                          ) : (
                            <span className="text-primary font-sans text-3xs font-semibold">
                              Interest-Free (0%)
                            </span>
                          )}
                        </span>
                      </div>
                      <div>
                        {acc.isInformal ? 'Next Accrual:' : 'Next Due Date:'}{' '}
                        <span className="text-foreground font-medium">{acc.dueDate || '—'}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border/30">
                      <button
                        onClick={() => setActiveLoanDetails(acc)}
                        className="px-2.5 py-1 rounded text-3xs font-bold bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition"
                      >
                        View Details
                      </button>
                      {acc.isInformal ? (
                        <button
                          onClick={() => {
                            setFriendRepayingLoan(acc);
                            setRepayAmount('');
                            setRepayDate(new Date().toISOString().slice(0, 10));
                            setRepayAccountId(acc.linkedPaymentAccountId || '');
                            setRepayNotes('');
                          }}
                          className="px-2.5 py-1 rounded text-3xs font-bold transition disabled:opacity-40 bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20"
                          disabled={(acc.loanStatus || 'active') === 'paid_off'}
                        >
                          Record Repayment
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setPayingLoan(acc);
                            setPayEmiAmount(String(acc.emiAmount || 0));
                            setPayEmiDate(new Date().toISOString().slice(0, 10));
                            setPayEmiAccountId(acc.linkedPaymentAccountId || '');
                          }}
                          className="px-2.5 py-1 rounded text-3xs font-bold bg-[#10b981]/10 border border-[#10b981]/20 text-[#10b981] hover:bg-[#10b981]/20 transition disabled:opacity-40"
                          disabled={(acc.loanStatus || 'active') === 'paid_off'}
                        >
                          Pay EMI
                        </button>
                      )}
                      <button
                        onClick={() => handleOpenEdit(acc)}
                        className="px-2 py-1 rounded text-3xs font-bold bg-muted hover:bg-muted/80 text-foreground transition"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          updateAccount(acc.id, { archived: !acc.archived });
                          refreshAccounts();
                        }}
                        className="p-1 rounded bg-muted hover:bg-muted/80 text-warning transition"
                        title={acc.archived ? 'Restore' : 'Archive'}
                      >
                        <Archive size={12} />
                      </button>
                      <button
                        onClick={() => {
                          updateAccount(acc.id, { visible: acc.visible === false });
                          refreshAccounts();
                        }}
                        className="p-1 rounded bg-muted hover:bg-muted/80 text-foreground transition"
                        title={acc.visible !== false ? 'Hide' : 'Show'}
                      >
                        {acc.visible !== false ? <Eye size={12} /> : <EyeOff size={12} />}
                      </button>
                      <button
                        onClick={() => setDeleteAccountTarget(acc)}
                        className="p-1 rounded bg-negative-subtle border border-negative-subtle/30 text-negative hover:bg-negative/20 transition"
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto select-scrollbar">
            <table className="w-full text-left border-collapse table-fixed min-w-[950px]">
              <thead className="bg-[#0b0f1a]/85 border-b border-border/60">
                <tr>
                  <th className="py-2.5 px-4 text-2xs font-bold text-muted-foreground uppercase tracking-wider">
                    Loan Name
                  </th>
                  <th
                    className="py-2.5 px-4 text-2xs font-bold text-muted-foreground uppercase tracking-wider"
                    style={{ width: '130px' }}
                  >
                    Principal
                  </th>
                  <th
                    className="py-2.5 px-4 text-2xs font-bold text-muted-foreground uppercase tracking-wider"
                    style={{ width: '120px' }}
                  >
                    EMI
                  </th>
                  <th
                    className="py-2.5 px-4 text-2xs font-bold text-muted-foreground uppercase tracking-wider"
                    style={{ width: '100px' }}
                  >
                    Interest Rate
                  </th>
                  <th
                    className="py-2.5 px-4 text-2xs font-bold text-muted-foreground uppercase tracking-wider"
                    style={{ width: '120px' }}
                  >
                    Next Due
                  </th>
                  <th
                    className="py-2.5 px-4 text-2xs font-bold text-muted-foreground uppercase tracking-wider"
                    style={{ width: '100px' }}
                  >
                    Status
                  </th>
                  <th
                    className="py-2.5 px-4 text-2xs font-bold text-muted-foreground uppercase tracking-wider text-right"
                    style={{ width: '160px' }}
                  >
                    Outstanding
                  </th>
                  <th
                    className="py-2.5 px-4 text-2xs font-bold text-muted-foreground uppercase tracking-wider text-center"
                    style={{ width: '280px' }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {loansList.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-xs text-muted-foreground">
                      No loan accounts found matching the criteria.
                    </td>
                  </tr>
                ) : (
                  loansList.map((acc) => {
                    const outstanding = Math.abs(acc.balance);
                    const totalLiability = outstanding + (acc.accruedInterest || 0);
                    return (
                      <tr key={acc.id} className="hover:bg-muted/5 transition-colors h-[48px]">
                        <td className="py-2 px-4 text-xs font-semibold text-foreground truncate">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              {acc.name}
                              {acc.archived && (
                                <span className="text-3xs font-bold text-negative border border-negative-subtle bg-negative-subtle px-1 py-0.5 rounded uppercase">
                                  Archived
                                </span>
                              )}
                            </div>
                            <span className="text-4xs text-muted-foreground font-normal">
                              Lender: {acc.lenderName || 'Unknown'}
                            </span>
                          </div>
                        </td>
                        <td className="py-2 px-4 text-xs font-mono text-foreground/90">
                          ₹{(acc.originalAmount || 0).toLocaleString('en-IN')}
                        </td>
                        <td className="py-2 px-4 text-xs font-mono text-negative">
                          {acc.isInformal ? (
                            <span className="text-muted-foreground font-sans">Flexible</span>
                          ) : (
                            `₹${(acc.emiAmount || 0).toLocaleString('en-IN')}`
                          )}
                        </td>
                        <td className="py-2 px-4 text-xs text-foreground/90 font-mono">
                          {acc.interestRate ? (
                            `${acc.interestRate}%`
                          ) : (
                            <span className="text-primary font-sans text-3xs font-semibold">
                              0% (Free)
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-4 text-xs text-foreground/90 truncate">
                          {acc.dueDate || '—'}
                        </td>
                        <td className="py-2 px-4 text-xs truncate">
                          <span className="capitalize font-semibold text-primary">
                            {(acc.loanStatus || 'active').replace('_', ' ')}
                            {acc.isInformal && ' (Friend)'}
                          </span>
                        </td>
                        <td className="py-2 px-4 text-xs font-bold text-right font-mono tabular-nums text-negative">
                          <div className="flex flex-col items-end">
                            <span>₹{totalLiability.toLocaleString('en-IN')}</span>
                            {acc.accruedInterest ? (
                              <span className="text-4xs font-normal text-amber-500 font-sans">
                                +₹{acc.accruedInterest.toLocaleString('en-IN')} interest
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="py-2 px-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => setActiveLoanDetails(acc)}
                              className="px-2 py-1 rounded text-2xs font-bold bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition"
                            >
                              View Details
                            </button>
                            {acc.isInformal ? (
                              <button
                                onClick={() => {
                                  setFriendRepayingLoan(acc);
                                  setRepayAmount('');
                                  setRepayDate(new Date().toISOString().slice(0, 10));
                                  setRepayAccountId(acc.linkedPaymentAccountId || '');
                                  setRepayNotes('');
                                }}
                                className="px-2 py-1 rounded text-2xs font-bold transition disabled:opacity-40 bg-primary/15 border border-primary/30 text-primary hover:bg-primary/25"
                                disabled={(acc.loanStatus || 'active') === 'paid_off'}
                              >
                                Record Repayment
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setPayingLoan(acc);
                                  setPayEmiAmount(String(acc.emiAmount || 0));
                                  setPayEmiDate(new Date().toISOString().slice(0, 10));
                                  setPayEmiAccountId(acc.linkedPaymentAccountId || '');
                                }}
                                className="px-2 py-1 rounded text-2xs font-bold bg-[#10b981]/10 border border-[#10b981]/20 text-[#10b981] hover:bg-[#10b981]/20 transition disabled:opacity-40"
                                disabled={(acc.loanStatus || 'active') === 'paid_off'}
                              >
                                Pay EMI
                              </button>
                            )}
                            <button
                              onClick={() => handleOpenEdit(acc)}
                              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/30 transition"
                              title="Edit"
                            >
                              <Edit2 size={12} />
                            </button>
                            <button
                              onClick={() => {
                                updateAccount(acc.id, { archived: !acc.archived });
                                refreshAccounts();
                              }}
                              className="p-1 rounded text-muted-foreground hover:text-warning hover:bg-muted/30 transition"
                              title={acc.archived ? 'Restore' : 'Archive'}
                            >
                              <Archive size={12} />
                            </button>
                            <button
                              onClick={() => {
                                updateAccount(acc.id, { visible: acc.visible === false });
                                refreshAccounts();
                              }}
                              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/30 transition"
                              title={acc.visible !== false ? 'Hide' : 'Show'}
                            >
                              {acc.visible !== false ? <Eye size={12} /> : <EyeOff size={12} />}
                            </button>
                            <button
                              onClick={() => setDeleteAccountTarget(acc)}
                              className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-muted/30 transition"
                              title="Delete"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modals & Dialog overlays */}

      {/* 1. Add / Edit Loan Modal */}
      <Modal
        isOpen={showAccountForm}
        onClose={() => setShowAccountForm(false)}
        title={editingId ? 'Edit Loan' : 'Setup New Loan'}
        description={
          editingId
            ? 'Modify loan details'
            : 'Configure loan amount, interest, and repayment details'
        }
      >
        <form
          onSubmit={handleSaveLoan}
          className="space-y-4 max-h-[75vh] overflow-y-auto pr-1 select-scrollbar"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block mb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                Loan Name *
              </label>
              <input
                type="text"
                required
                value={accountForm.name}
                onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
              />
            </div>
            <div>
              <label className="block mb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                Lender *
              </label>
              <input
                type="text"
                required
                value={accountForm.lenderName}
                onChange={(e) => setAccountForm({ ...accountForm, lenderName: e.target.value })}
                className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
              />
            </div>
            <div>
              <label className="block mb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                Loan Start Date *
              </label>
              <input
                type="date"
                required
                value={accountForm.startDate}
                onChange={(e) => setAccountForm({ ...accountForm, startDate: e.target.value })}
                className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
              />
            </div>
            <div>
              <label className="block mb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                Annual Interest Rate (%) *
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={accountForm.interestRate}
                onChange={(e) => setAccountForm({ ...accountForm, interestRate: e.target.value })}
                className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
              />
            </div>
            <div>
              <label className="block mb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                Interest Type *
              </label>
              <select
                value={accountForm.interestType}
                onChange={(e) => setAccountForm({ ...accountForm, interestType: e.target.value })}
                className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
              >
                <option value="reducing">Reducing Balance</option>
                <option value="simple">Simple Interest</option>
                <option value="compound">Compound Interest</option>
              </select>
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  id="isInformal"
                  checked={accountForm.isInformal}
                  onChange={(e) => setAccountForm({ ...accountForm, isInformal: e.target.checked })}
                  className="rounded border-border text-primary bg-[#0b0f1a] h-4 w-4 focus:ring-0"
                />
                <label
                  htmlFor="isInformal"
                  className="text-2xs text-muted-foreground font-semibold cursor-pointer select-none"
                >
                  Friend / Informal Loan
                </label>
              </div>
            </div>
            {!accountForm.isInformal && (
              <>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <div>
                    <label className="block mb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Loan Tenure *
                    </label>
                    <input
                      type="number"
                      required
                      value={
                        accountForm.tenureType === 'years'
                          ? accountForm.tenureYears
                          : accountForm.tenureMonths
                      }
                      onChange={(e) => {
                        if (accountForm.tenureType === 'years') {
                          setAccountForm({ ...accountForm, tenureYears: e.target.value });
                        } else {
                          setAccountForm({ ...accountForm, tenureMonths: e.target.value });
                        }
                      }}
                      className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Unit
                    </label>
                    <select
                      value={accountForm.tenureType}
                      onChange={(e) =>
                        setAccountForm({ ...accountForm, tenureType: e.target.value })
                      }
                      className="rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
                    >
                      <option value="months">Months</option>
                      <option value="years">Years</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block mb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                    EMI Due Day *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    required
                    value={accountForm.emiDueDay}
                    onChange={(e) => setAccountForm({ ...accountForm, emiDueDay: e.target.value })}
                    className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                    First EMI Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={accountForm.firstEmiDate}
                    onChange={(e) =>
                      setAccountForm({ ...accountForm, firstEmiDate: e.target.value })
                    }
                    className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
                  />
                </div>
              </>
            )}

            {!editingId && (
              <>
                <div>
                  <label className="block mb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Original Principal *
                  </label>
                  <input
                    type="number"
                    required
                    value={accountForm.originalAmount}
                    onChange={(e) =>
                      setAccountForm({ ...accountForm, originalAmount: e.target.value })
                    }
                    className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Current Outstanding
                  </label>
                  <input
                    type="number"
                    value={accountForm.balance}
                    onChange={(e) => setAccountForm({ ...accountForm, balance: e.target.value })}
                    className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
                  />
                </div>
              </>
            )}

            {accountForm.isInformal && (
              <div>
                <label className="block mb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Expected Repayment Date
                </label>
                <input
                  type="date"
                  value={accountForm.expectedRepaymentDate}
                  onChange={(e) =>
                    setAccountForm({ ...accountForm, expectedRepaymentDate: e.target.value })
                  }
                  className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
                />
              </div>
            )}

            {!accountForm.isInformal && (
              <div>
                <label className="block mb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Monthly EMI *
                </label>
                <input
                  type="number"
                  required
                  value={accountForm.emiAmount}
                  onChange={(e) => setAccountForm({ ...accountForm, emiAmount: e.target.value })}
                  className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition font-mono"
                />
              </div>
            )}
            <div>
              <label className="block mb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                Theme Color
              </label>
              <input
                type="color"
                value={accountForm.color}
                onChange={(e) => setAccountForm({ ...accountForm, color: e.target.value })}
                className="w-full rounded-xl border border-border bg-[#0b0f1a] h-[38px] p-1 text-sm text-foreground focus:outline-none focus:border-primary transition cursor-pointer"
              />
            </div>
          </div>

          {/* Calculator preview */}
          {emiPreview && !accountForm.isInformal && (
            <div className="bg-primary/10 border border-primary/20 rounded-2xl p-4 space-y-2 mt-2">
              <h4 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                📋 Calculated EMI Preview
              </h4>
              <div className="grid grid-cols-2 gap-4 text-2xs">
                <div>
                  <span className="text-muted-foreground">Monthly EMI</span>
                  <p className="text-sm font-extrabold text-foreground mt-0.5 font-mono">
                    ₹{emiPreview.emi.toLocaleString('en-IN')}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Total Payments</span>
                  <p className="text-sm font-extrabold text-foreground mt-0.5 font-mono">
                    ₹{emiPreview.totalPayment.toLocaleString('en-IN')}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Total Interest</span>
                  <p className="text-sm font-extrabold text-foreground mt-0.5 font-mono">
                    ₹{emiPreview.totalInterest.toLocaleString('en-IN')}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Estimated End Date</span>
                  <p className="text-sm font-extrabold text-foreground mt-0.5">
                    {emiPreview.endDate}
                  </p>
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() =>
                    setAccountForm({ ...accountForm, emiAmount: String(emiPreview.emi) })
                  }
                  className="px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-2xs font-bold hover:bg-primary/90 transition-all font-mono"
                >
                  Apply Calculated EMI
                </button>
              </div>
            </div>
          )}

          {/* Optional fields toggle */}
          <div className="border-t border-border/30 pt-3">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
            >
              {showAdvanced
                ? '▼ Hide Optional / Advanced Settings'
                : '▶ Show Optional / Advanced Settings'}
            </button>

            {showAdvanced && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block mb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Loan Account Number / Ref
                  </label>
                  <input
                    type="text"
                    value={accountForm.loanAccountNumber}
                    onChange={(e) =>
                      setAccountForm({ ...accountForm, loanAccountNumber: e.target.value })
                    }
                    className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Processing Fee
                  </label>
                  <input
                    type="number"
                    value={accountForm.processingFee}
                    onChange={(e) =>
                      setAccountForm({ ...accountForm, processingFee: e.target.value })
                    }
                    className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Prepayment Charges (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={accountForm.prepaymentCharges}
                    onChange={(e) =>
                      setAccountForm({ ...accountForm, prepaymentCharges: e.target.value })
                    }
                    className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Late Payment Charges
                  </label>
                  <input
                    type="number"
                    value={accountForm.latePaymentCharges}
                    onChange={(e) =>
                      setAccountForm({ ...accountForm, latePaymentCharges: e.target.value })
                    }
                    className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Linked Repayment Account
                  </label>
                  <select
                    value={accountForm.linkedPaymentAccountId}
                    onChange={(e) =>
                      setAccountForm({ ...accountForm, linkedPaymentAccountId: e.target.value })
                    }
                    className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
                  >
                    <option value="">None</option>
                    {accounts
                      .filter((a) => a.type === 'accounts')
                      .map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block mb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Loan Status
                  </label>
                  <select
                    value={accountForm.loanStatus}
                    onChange={(e) => setAccountForm({ ...accountForm, loanStatus: e.target.value })}
                    className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
                  >
                    <option value="active">Active</option>
                    <option value="paid_off">Paid Off</option>
                    <option value="closed">Closed</option>
                    <option value="on_hold">On Hold</option>
                  </select>
                </div>
                <div>
                  <label className="block mb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Interest Start Date
                  </label>
                  <input
                    type="date"
                    value={accountForm.interestStartDate}
                    onChange={(e) =>
                      setAccountForm({ ...accountForm, interestStartDate: e.target.value })
                    }
                    className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
                  />
                </div>
                {accountForm.isInformal && accountForm.interestType === 'compound' && (
                  <div>
                    <label className="block mb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Compounding Frequency
                    </label>
                    <select
                      value={accountForm.compoundingFrequency}
                      onChange={(e) =>
                        setAccountForm({
                          ...accountForm,
                          compoundingFrequency: e.target.value as any,
                        })
                      }
                      className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
                    >
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="half-yearly">Half-Yearly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                )}
                <div className="flex items-center gap-2 mt-2 col-span-1 md:col-span-2">
                  <input
                    type="checkbox"
                    id="autoCreateEmi"
                    checked={accountForm.autoCreateEmi}
                    onChange={(e) =>
                      setAccountForm({ ...accountForm, autoCreateEmi: e.target.checked })
                    }
                    className="rounded border-border text-primary bg-[#0b0f1a] h-4 w-4 focus:ring-1 focus:ring-primary"
                  />
                  <label
                    htmlFor="autoCreateEmi"
                    className="text-xs text-muted-foreground font-semibold cursor-pointer select-none"
                  >
                    Auto-create EMI transaction on due date
                  </label>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/95 transition-all shadow-lg"
            >
              Save Details
            </button>
            <button
              type="button"
              onClick={() => setShowAccountForm(false)}
              className="flex-1 py-2.5 rounded-xl bg-muted border border-border text-xs font-semibold text-foreground hover:bg-muted/80 transition"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      {/* 2. Loan Details Modal */}
      {activeLoanDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto space-y-6 shadow-2xl relative select-scrollbar">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-foreground">{activeLoanDetails.name}</h3>
                <p className="text-xs text-muted-foreground">
                  Lender: {activeLoanDetails.lenderName || 'Unknown'} | Ref:{' '}
                  {activeLoanDetails.loanAccountNumber || '—'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveLoanDetails(null)}
                className="text-muted-foreground hover:text-foreground text-sm font-semibold px-2 py-1 bg-muted/40 hover:bg-muted/80 rounded-md transition"
              >
                ✕ Close
              </button>
            </div>

            {/* Repayment Progress Bar */}
            {(() => {
              const original = activeLoanDetails.originalAmount || 1;
              const outstanding = Math.abs(activeLoanDetails.balance);
              const repaid = Math.max(0, original - outstanding);
              const pct = Math.min(100, Math.round((repaid / original) * 100));
              return (
                <div className="space-y-2 bg-[#0b0f1a]/40 border border-border/40 rounded-xl p-4">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-muted-foreground">Payoff Progress</span>
                    <span className="text-primary font-mono">{pct}% Repaid</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-primary h-2 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-2xs text-muted-foreground font-mono">
                    <span>Repaid: ₹{repaid.toLocaleString('en-IN')}</span>
                    <span>Total Borrowed: ₹{original.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              );
            })()}

            {/* Detailed Stats Grid */}
            {activeLoanDetails.isInformal ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="bg-[#0b0f1a]/30 border border-border/30 rounded-xl p-3">
                  <span className="text-3xs text-muted-foreground uppercase tracking-wider block font-semibold">
                    Original Principal
                  </span>
                  <span className="text-sm font-bold text-foreground font-mono block mt-1">
                    ₹{(activeLoanDetails.originalAmount || 0).toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="bg-[#0b0f1a]/30 border border-border/30 rounded-xl p-3">
                  <span className="text-3xs text-muted-foreground uppercase tracking-wider block font-semibold">
                    Current Principal
                  </span>
                  <span className="text-sm font-bold text-foreground font-mono block mt-1">
                    ₹{Math.abs(activeLoanDetails.balance).toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="bg-[#0b0f1a]/30 border border-border/30 rounded-xl p-3">
                  <span className="text-3xs text-muted-foreground uppercase tracking-wider block font-semibold">
                    Accrued Interest
                  </span>
                  <span className="text-sm font-bold text-amber-500 font-mono block mt-1">
                    ₹{(activeLoanDetails.accruedInterest || 0).toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="bg-[#0b0f1a]/30 border border-border/30 rounded-xl p-3">
                  <span className="text-3xs text-muted-foreground uppercase tracking-wider block font-semibold">
                    Total Outstanding
                  </span>
                  <span className="text-sm font-bold text-negative font-mono block mt-1">
                    ₹
                    {(
                      Math.abs(activeLoanDetails.balance) + (activeLoanDetails.accruedInterest || 0)
                    ).toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="bg-[#0b0f1a]/30 border border-border/30 rounded-xl p-3">
                  <span className="text-3xs text-muted-foreground uppercase tracking-wider block font-semibold">
                    Annual Interest Rate
                  </span>
                  <span className="text-sm font-bold text-foreground block mt-1 font-mono">
                    {activeLoanDetails.interestRate}%
                  </span>
                </div>
                <div className="bg-[#0b0f1a]/30 border border-border/30 rounded-xl p-3">
                  <span className="text-3xs text-muted-foreground uppercase tracking-wider block font-semibold">
                    Interest Type
                  </span>
                  <span className="text-sm font-bold text-foreground block mt-1 capitalize">
                    {activeLoanDetails.interestType || 'reducing'}
                  </span>
                </div>
                <div className="bg-[#0b0f1a]/30 border border-border/30 rounded-xl p-3">
                  <span className="text-3xs text-muted-foreground uppercase tracking-wider block font-semibold">
                    Loan Start Date
                  </span>
                  <span className="text-sm font-bold text-foreground font-mono block mt-1">
                    {activeLoanDetails.startDate || '—'}
                  </span>
                </div>
                <div className="bg-[#0b0f1a]/30 border border-border/30 rounded-xl p-3">
                  <span className="text-3xs text-muted-foreground uppercase tracking-wider block font-semibold">
                    Interest Accruing Since
                  </span>
                  <span className="text-sm font-bold text-foreground font-mono block mt-1">
                    {activeLoanDetails.interestStartDate || activeLoanDetails.startDate || '—'}
                  </span>
                </div>
                <div className="bg-[#0b0f1a]/30 border border-border/30 rounded-xl p-3">
                  <span className="text-3xs text-muted-foreground uppercase tracking-wider block font-semibold">
                    Total Principal Repaid
                  </span>
                  <span className="text-sm font-bold text-[#10b981] font-mono block mt-1">
                    ₹{(activeLoanDetails.totalPrincipalRepaid || 0).toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="bg-[#0b0f1a]/30 border border-border/30 rounded-xl p-3">
                  <span className="text-3xs text-muted-foreground uppercase tracking-wider block font-semibold">
                    Total Interest Paid
                  </span>
                  <span className="text-sm font-bold text-foreground font-mono block mt-1">
                    ₹{(activeLoanDetails.totalInterestPaid || 0).toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="bg-[#0b0f1a]/30 border border-border/30 rounded-xl p-3">
                  <span className="text-3xs text-muted-foreground uppercase tracking-wider block font-semibold">
                    Total Amount Repaid
                  </span>
                  <span className="text-sm font-bold text-[#10b981] font-mono block mt-1">
                    ₹{(activeLoanDetails.totalAmountPaid || 0).toLocaleString('en-IN')}
                  </span>
                </div>
                {activeLoanDetails.expectedRepaymentDate && (
                  <div className="bg-[#0b0f1a]/30 border border-border/30 rounded-xl p-3">
                    <span className="text-3xs text-muted-foreground uppercase tracking-wider block font-semibold">
                      Expected Repayment Date
                    </span>
                    <span className="text-sm font-bold text-foreground font-mono block mt-1">
                      {activeLoanDetails.expectedRepaymentDate}
                    </span>
                  </div>
                )}
                <div className="bg-[#0b0f1a]/30 border border-border/30 rounded-xl p-3">
                  <span className="text-3xs text-muted-foreground uppercase tracking-wider block font-semibold">
                    Loan Status
                  </span>
                  <span className="text-sm font-bold text-foreground block mt-1 capitalize">
                    {(activeLoanDetails.loanStatus || 'active').replace('_', ' ')}
                  </span>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="bg-[#0b0f1a]/30 border border-border/30 rounded-xl p-3">
                  <span className="text-3xs text-muted-foreground uppercase tracking-wider block font-semibold">
                    Outstanding Principal
                  </span>
                  <span className="text-sm font-bold text-foreground font-mono block mt-1 font-mono">
                    ₹{Math.abs(activeLoanDetails.balance).toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="bg-[#0b0f1a]/30 border border-border/30 rounded-xl p-3">
                  <span className="text-3xs text-muted-foreground uppercase tracking-wider block font-semibold">
                    Accrued Unpaid Interest
                  </span>
                  <span className="text-sm font-bold text-amber-500 font-mono block mt-1 font-mono">
                    ₹{(activeLoanDetails.accruedInterest || 0).toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="bg-[#0b0f1a]/30 border border-border/30 rounded-xl p-3">
                  <span className="text-3xs text-muted-foreground uppercase tracking-wider block font-semibold">
                    Total Outstanding Liability
                  </span>
                  <span className="text-sm font-bold text-negative font-mono block mt-1 font-mono">
                    ₹
                    {(
                      Math.abs(activeLoanDetails.balance) + (activeLoanDetails.accruedInterest || 0)
                    ).toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="bg-[#0b0f1a]/30 border border-border/30 rounded-xl p-3">
                  <span className="text-3xs text-muted-foreground uppercase tracking-wider block font-semibold">
                    Total Principal Repaid
                  </span>
                  <span className="text-sm font-bold text-[#10b981] font-mono block mt-1 font-mono">
                    ₹{(activeLoanDetails.totalPrincipalRepaid || 0).toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="bg-[#0b0f1a]/30 border border-border/30 rounded-xl p-3">
                  <span className="text-3xs text-muted-foreground uppercase tracking-wider block font-semibold">
                    Total Interest Paid
                  </span>
                  <span className="text-sm font-bold text-foreground font-mono block mt-1 font-mono">
                    ₹{(activeLoanDetails.totalInterestPaid || 0).toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="bg-[#0b0f1a]/30 border border-border/30 rounded-xl p-3">
                  <span className="text-3xs text-muted-foreground uppercase tracking-wider block font-semibold">
                    Total Amount Repaid
                  </span>
                  <span className="text-sm font-bold text-[#10b981] font-mono block mt-1 font-mono">
                    ₹{(activeLoanDetails.totalAmountPaid || 0).toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="bg-[#0b0f1a]/30 border border-border/30 rounded-xl p-3">
                  <span className="text-3xs text-muted-foreground uppercase tracking-wider block font-semibold">
                    Interest Rate & Type
                  </span>
                  <span className="text-xs font-bold text-foreground block mt-1 select-none">
                    {activeLoanDetails.interestRate}% (
                    {activeLoanDetails.interestType || 'reducing'})
                  </span>
                </div>
                <div className="bg-[#0b0f1a]/30 border border-border/30 rounded-xl p-3">
                  <span className="text-3xs text-muted-foreground uppercase tracking-wider block font-semibold">
                    Remaining Tenure
                  </span>
                  <span className="text-xs font-bold text-foreground block mt-1 font-mono">
                    {activeLoanDetails.remainingTenureMonths !== undefined
                      ? activeLoanDetails.remainingTenureMonths
                      : activeLoanDetails.tenureMonths || '—'}{' '}
                    / {activeLoanDetails.tenureMonths || '—'} months
                  </span>
                </div>
                <div className="bg-[#0b0f1a]/30 border border-border/30 rounded-xl p-3">
                  <span className="text-3xs text-muted-foreground uppercase tracking-wider block font-semibold">
                    Next EMI Date
                  </span>
                  <span className="text-xs font-bold text-foreground block mt-1 font-mono">
                    {activeLoanDetails.dueDate || '—'}
                  </span>
                </div>
              </div>
            )}

            {/* Quick Actions Panel */}
            <div className="flex gap-3 justify-end pt-2">
              {activeLoanDetails.isInformal ? (
                <button
                  type="button"
                  onClick={() => {
                    setFriendRepayingLoan(activeLoanDetails);
                    setRepayAmount('');
                    setRepayDate(new Date().toISOString().slice(0, 10));
                    setRepayAccountId(activeLoanDetails.linkedPaymentAccountId || '');
                    setRepayNotes('');
                  }}
                  className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/95 transition-all shadow-lg"
                  disabled={activeLoanDetails.loanStatus === 'paid_off'}
                >
                  💵 Record Repayment
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setPayingLoan(activeLoanDetails);
                      setPayEmiAmount(String(activeLoanDetails.emiAmount || 0));
                      setPayEmiDate(new Date().toISOString().slice(0, 10));
                      setPayEmiAccountId(activeLoanDetails.linkedPaymentAccountId || '');
                    }}
                    className="px-4 py-2 rounded-xl bg-[#10b981] text-white text-xs font-bold shadow-lg shadow-[#10b981]/10 hover:bg-[#10b981]/90 transition"
                    disabled={activeLoanDetails.loanStatus === 'paid_off'}
                  >
                    💵 Record EMI Payment
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPrepayingLoan(activeLoanDetails);
                      setPrepayAmount('');
                      setPrepayDate(new Date().toISOString().slice(0, 10));
                      setPrepayAccountId(activeLoanDetails.linkedPaymentAccountId || '');
                      setPrepayStrategy('tenure');
                      setPrepayNotes('');
                    }}
                    className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/95 transition-all shadow-lg"
                    disabled={activeLoanDetails.loanStatus === 'paid_off'}
                  >
                    ⚡ Make Extra Payment
                  </button>
                </>
              )}
            </div>

            {/* Amortization Repayment Schedule or Ledger */}
            <div className="space-y-3">
              <h4 className="text-xs font-extrabold text-foreground uppercase tracking-wider">
                {activeLoanDetails.isInformal
                  ? '📜 Monthly Interest & Repayment Ledger'
                  : '📊 Amortization Schedule'}
              </h4>
              <div className="overflow-x-auto border border-border/50 rounded-xl max-h-[300px] select-scrollbar">
                <table className="w-full text-left text-2xs table-auto border-collapse min-w-[700px]">
                  {activeLoanDetails.isInformal ? (
                    <>
                      <thead className="bg-[#0b0f1a]/90 text-muted-foreground border-b border-border/50 sticky top-0 font-semibold">
                        <tr>
                          <th className="py-2 px-3">Billing Month</th>
                          <th className="py-2 px-3">Period Range</th>
                          <th className="py-2 px-3">Starting Principal</th>
                          <th className="py-2 px-3">Interest Accrued</th>
                          <th className="py-2 px-3 font-semibold">Repayments (Total)</th>
                          <th className="py-2 px-3 font-semibold">Ending Principal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/20 text-foreground/80 font-mono">
                        {activeLoanLedger.map((row, idx) => (
                          <tr key={idx} className="hover:bg-muted/5 transition-colors">
                            <td className="py-2 px-3 font-sans font-semibold text-foreground">
                              {row.period}
                            </td>
                            <td className="py-2 px-3 font-sans text-muted-foreground">
                              {row.startDateStr} to {row.endDateStr}
                            </td>
                            <td className="py-2 px-3">
                              ₹{row.openingPrincipal.toLocaleString('en-IN')}
                            </td>
                            <td className="py-2 px-3 text-amber-500 font-semibold">
                              +₹{row.interestAccrued.toLocaleString('en-IN')}
                            </td>
                            <td className="py-2 px-3 text-[#10b981] font-semibold">
                              -₹{row.paymentsMade.toLocaleString('en-IN')}
                            </td>
                            <td className="py-2 px-3 font-bold text-foreground">
                              ₹{row.closingPrincipal.toLocaleString('en-IN')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </>
                  ) : (
                    <>
                      <thead className="bg-[#0b0f1a]/90 text-muted-foreground border-b border-border/50 sticky top-0 font-semibold">
                        <tr>
                          <th className="py-2 px-3">Installment #</th>
                          <th className="py-2 px-3">Due Date</th>
                          <th className="py-2 px-3">Opening Principal</th>
                          <th className="py-2 px-3">Total Installment</th>
                          <th className="py-2 px-3">Principal Portion</th>
                          <th className="py-2 px-3">Interest Portion</th>
                          <th className="py-2 px-3">Closing Principal</th>
                          <th className="py-2 px-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/20 text-foreground/80 font-mono">
                        {activeLoanSchedule.map((row) => (
                          <tr key={row.num} className="hover:bg-muted/5 transition-colors">
                            <td className="py-2 px-3 font-semibold text-center">{row.num}</td>
                            <td className="py-2 px-3 font-sans">{row.dueDateStr}</td>
                            <td className="py-2 px-3">₹{row.opening.toLocaleString('en-IN')}</td>
                            <td className="py-2 px-3 text-negative font-semibold font-mono">
                              ₹{row.emi.toLocaleString('en-IN')}
                            </td>
                            <td className="py-2 px-3 text-[#10b981]">
                              ₹{row.principal.toLocaleString('en-IN')}
                            </td>
                            <td className="py-2 px-3">₹{row.interest.toLocaleString('en-IN')}</td>
                            <td className="py-2 px-3">₹{row.closing.toLocaleString('en-IN')}</td>
                            <td className="py-2 px-3 text-center font-sans">
                              <span
                                className={`px-1.5 py-0.5 rounded text-3xs font-bold ${
                                  row.status === 'Paid'
                                    ? 'bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/20'
                                    : row.status === 'Partially Paid'
                                      ? 'bg-amber-500/15 text-amber-500 border border-amber-500/20'
                                      : row.status === 'Overdue'
                                        ? 'bg-red-500/15 text-red-500 border border-red-500/20'
                                        : 'bg-primary/10 text-primary border border-primary/10'
                                }`}
                              >
                                {row.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </>
                  )}
                </table>
              </div>
            </div>

            {/* Repayment History Section */}
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-extrabold text-foreground uppercase tracking-wider">
                📜 Repayment History
              </h4>
              {(() => {
                const reps = getRepayments()
                  .filter((r) => r.loanId === activeLoanDetails.id)
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                if (reps.length === 0) {
                  return (
                    <div className="text-center p-6 bg-[#0b0f1a]/30 border border-border/35 rounded-xl text-2xs text-muted-foreground">
                      No repayments recorded yet for this loan.
                    </div>
                  );
                }

                return (
                  <div className="space-y-2 max-h-[250px] overflow-y-auto select-scrollbar pr-1">
                    {reps.map((rep) => {
                      const account = accounts.find((a) => a.id === rep.paymentAccountId);
                      return (
                        <div
                          key={rep.id}
                          className="p-3 bg-[#0b0f1a]/30 border border-border/40 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-2xs"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-foreground font-sans">
                                {new Date(rep.date).toLocaleDateString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </span>
                              <span className="text-muted-foreground">|</span>
                              <span className="text-muted-foreground font-sans">
                                Paid via:{' '}
                                <strong className="text-foreground">
                                  {account?.name || 'Unknown'}
                                </strong>
                              </span>
                            </div>
                            {rep.notes && (
                              <p className="text-muted-foreground italic text-3xs">
                                Note: {rep.notes}
                              </p>
                            )}
                            <div className="grid grid-cols-3 gap-x-4 gap-y-0.5 text-3xs font-mono mt-0.5">
                              <div>
                                <span className="text-muted-foreground">Total:</span>{' '}
                                <span className="text-foreground font-bold">
                                  ₹{rep.amount.toLocaleString('en-IN')}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Principal:</span>{' '}
                                <span className="text-[#10b981] font-bold">
                                  ₹{rep.principalPaid.toLocaleString('en-IN')}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Interest:</span>{' '}
                                <span className="text-amber-500 font-bold">
                                  ₹{rep.interestPaid.toLocaleString('en-IN')}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-3 self-end md:self-center">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingRepayment(rep);
                                setRepaymentForm({
                                  amount: String(rep.amount),
                                  date: rep.date.slice(0, 10),
                                  paymentAccountId: rep.paymentAccountId,
                                  notes: rep.notes || '',
                                });
                              }}
                              className="text-primary hover:underline font-bold text-3xs uppercase tracking-wider font-sans"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingRepayment(rep)}
                              className="text-red-500 hover:underline font-bold text-3xs uppercase tracking-wider font-sans"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* 3. Pay EMI Modal */}
      {payingLoan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl relative">
            <h3 className="text-lg font-bold text-foreground">Record EMI Payment</h3>
            <p className="text-xs text-muted-foreground -mt-2">
              Logging transaction for {payingLoan.name}
            </p>

            <form onSubmit={handlePayEmi} className="space-y-4">
              <div>
                <label className="block text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Payment Account *
                </label>
                <select
                  value={payEmiAccountId}
                  onChange={(e) => setPayEmiAccountId(e.target.value)}
                  required
                  className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
                >
                  <option value="">Select payment source...</option>
                  {accounts
                    .filter((a) => a.type === 'accounts')
                    .map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} (Balance: ₹{acc.balance.toLocaleString('en-IN')})
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                    EMI Amount *
                  </label>
                  <input
                    type="number"
                    value={payEmiAmount}
                    onChange={(e) => setPayEmiAmount(e.target.value)}
                    required
                    className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary font-mono transition"
                  />
                </div>
                <div>
                  <label className="block text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Payment Date *
                  </label>
                  <input
                    type="date"
                    value={payEmiDate}
                    onChange={(e) => setPayEmiDate(e.target.value)}
                    required
                    className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
                  />
                </div>
              </div>

              {/* Real-time component split calculation */}
              {(() => {
                const amt = Number(payEmiAmount) || 0;
                const accrued = payingLoan.accruedInterest || 0;
                const interestComp = Math.min(accrued, amt);
                const principalComp = Math.max(0, amt - interestComp);
                return (
                  <div className="bg-[#0b0f1a]/40 border border-border/30 rounded-xl p-3 space-y-2 text-2xs">
                    <span className="font-bold text-muted-foreground uppercase tracking-wider block">
                      Repayment Breakdown Summary
                    </span>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Accrued Interest Settle:</span>
                      <span className="font-mono text-amber-500">
                        ₹{interestComp.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Liability Reduction (Principal):
                      </span>
                      <span className="font-mono text-[#10b981]">
                        ₹{principalComp.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="border-t border-border/20 pt-2 flex justify-between font-semibold text-xs">
                      <span className="text-foreground">Total Cash Outflow:</span>
                      <span className="font-mono text-foreground">
                        ₹{amt.toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                );
              })()}

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[#10b981] hover:bg-[#10b981]/90 text-white text-xs font-semibold transition shadow-lg shadow-[#10b981]/10"
                >
                  Record Payment
                </button>
                <button
                  type="button"
                  onClick={() => setPayingLoan(null)}
                  className="flex-1 py-2.5 rounded-xl bg-muted border border-border text-xs font-semibold text-foreground hover:bg-muted/80 transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Make Extra Payment Modal */}
      {prepayingLoan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl relative">
            <h3 className="text-lg font-bold text-foreground">Make Extra Payment (Prepayment)</h3>
            <p className="text-xs text-muted-foreground -mt-2">
              Log prepayment to reduce outstanding principal of {prepayingLoan.name}
            </p>

            <form onSubmit={handlePrepayment} className="space-y-4">
              <div>
                <label className="block text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Payment Account *
                </label>
                <select
                  value={prepayAccountId}
                  onChange={(e) => setPrepayAccountId(e.target.value)}
                  required
                  className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
                >
                  <option value="">Select payment source...</option>
                  {accounts
                    .filter((a) => a.type === 'accounts')
                    .map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} (Balance: ₹{acc.balance.toLocaleString('en-IN')})
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Prepayment Amount *
                  </label>
                  <input
                    type="number"
                    value={prepayAmount}
                    onChange={(e) => setPrepayAmount(e.target.value)}
                    required
                    className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary font-mono transition"
                  />
                </div>
                <div>
                  <label className="block text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Payment Date *
                  </label>
                  <input
                    type="date"
                    value={prepayDate}
                    onChange={(e) => setPrepayDate(e.target.value)}
                    required
                    className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Recalculation Strategy
                </label>
                <select
                  value={prepayStrategy}
                  onChange={(e) => setPrepayStrategy(e.target.value as any)}
                  className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
                >
                  <option value="tenure">Keep EMI and Reduce Tenure (Default)</option>
                  <option value="emi">Reduce EMI and Keep Tenure</option>
                </select>
              </div>

              <div>
                <label className="block text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Notes / Reference
                </label>
                <input
                  type="text"
                  value={prepayNotes}
                  onChange={(e) => setPrepayNotes(e.target.value)}
                  className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
                />
              </div>

              {/* Prepayment impact calculations */}
              {(() => {
                const amt = Number(prepayAmount) || 0;
                const accrued = prepayingLoan.accruedInterest || 0;
                const interestComp = Math.min(accrued, amt);
                const principalComp = Math.max(0, amt - interestComp);
                const newOutstanding = Math.max(0, Math.abs(prepayingLoan.balance) - principalComp);

                let impactText = '';
                if (amt > 0) {
                  if (prepayStrategy === 'emi') {
                    const remainingTenure =
                      prepayingLoan.remainingTenureMonths !== undefined
                        ? prepayingLoan.remainingTenureMonths
                        : prepayingLoan.tenureMonths || 60;
                    const newEmi = calculateNewEMI(
                      newOutstanding,
                      Number(prepayingLoan.interestRate) || 0,
                      remainingTenure
                    );
                    impactText = `EMI will reduce from ₹${(prepayingLoan.emiAmount || 0).toLocaleString('en-IN')} to ₹${newEmi.toLocaleString('en-IN')} per month.`;
                  } else {
                    const emi = Number(prepayingLoan.emiAmount) || 10000;
                    const remaining = calculateRemainingTenure(
                      newOutstanding,
                      Number(prepayingLoan.interestRate) || 0,
                      emi
                    );
                    const origTenure =
                      prepayingLoan.remainingTenureMonths !== undefined
                        ? prepayingLoan.remainingTenureMonths
                        : prepayingLoan.tenureMonths || 60;
                    const savedMonths = Math.max(0, origTenure - remaining);
                    impactText = `Tenure will reduce by ${savedMonths} months. Remaining tenure will be ${remaining} months.`;
                  }
                }

                return (
                  <div className="bg-[#0b0f1a]/40 border border-border/30 rounded-xl p-3 space-y-2 text-2xs">
                    <span className="font-bold text-muted-foreground uppercase tracking-wider block">
                      Estimated Prepayment Impact
                    </span>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Outstanding Principal after:</span>
                      <span className="font-mono text-foreground font-semibold">
                        ₹{newOutstanding.toLocaleString('en-IN')}
                      </span>
                    </div>
                    {impactText && (
                      <p className="text-primary font-semibold mt-1 bg-primary/10 border border-primary/20 rounded-lg p-2 leading-relaxed">
                        💡 {impactText}
                      </p>
                    )}
                  </div>
                );
              })()}

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold shadow-lg hover:bg-primary/95 transition-all"
                >
                  Record Prepayment
                </button>
                <button
                  type="button"
                  onClick={() => setPrepayingLoan(null)}
                  className="flex-1 py-2.5 rounded-xl bg-muted border border-border text-xs font-semibold text-foreground hover:bg-muted/80 transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4.5 Record Friend Repayment Modal */}
      {friendRepayingLoan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl relative">
            <h3 className="text-lg font-bold text-foreground">
              Record Repayment
            </h3>
            <p className="text-xs text-muted-foreground -mt-2">
              Log a flexible repayment on the friend loan &quot;{friendRepayingLoan.name}&quot;
            </p>

            <form onSubmit={handleFriendRepayment} className="space-y-4">
              <div>
                <label className="block text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Payment Account *
                </label>
                <select
                  value={repayAccountId}
                  onChange={(e) => setRepayAccountId(e.target.value)}
                  required
                  className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
                >
                  <option value="">
                    Select payment source...
                  </option>
                  {accounts
                    .filter((a) => a.type === 'accounts')
                    .map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} (Balance: ₹{acc.balance.toLocaleString('en-IN')})
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Repayment Amount *
                  </label>
                  <input
                    type="number"
                    value={repayAmount}
                    onChange={(e) => setRepayAmount(e.target.value)}
                    required
                    className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary font-mono transition"
                  />
                </div>
                <div>
                  <label className="block text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Payment Date *
                  </label>
                  <input
                    type="date"
                    value={repayDate}
                    onChange={(e) => setRepayDate(e.target.value)}
                    required
                    className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Notes / Reference
                </label>
                <input
                  type="text"
                  value={repayNotes}
                  onChange={(e) => setRepayNotes(e.target.value)}
                  className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
                />
              </div>

              {/* Repayment impact calculations */}
              {(() => {
                const amt = Number(repayAmount) || 0;
                const repaymentDateStr = repayDate || new Date().toISOString().slice(0, 10);

                const tempAccount = {
                  ...friendRepayingLoan,
                  balance: friendRepayingLoan.balance,
                };
                const result = calculateInterestAccrual(tempAccount, repaymentDateStr);
                const totalAccruedInterest =
                  (friendRepayingLoan.accruedInterest || 0) + result.accrued;

                const interestPaid = Math.min(totalAccruedInterest, amt);
                const principalPaid = Math.max(0, amt - interestPaid);
                const newOutstandingPrincipal = Math.max(
                  0,
                  Math.abs(friendRepayingLoan.balance) - principalPaid
                );

                return (
                  <div className="bg-[#0b0f1a]/40 border border-border/30 rounded-xl p-3 space-y-2 text-2xs">
                    <span className="font-bold text-muted-foreground uppercase tracking-wider block">
                      Repayment Allocation Preview
                    </span>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Newly Accrued Interest:</span>
                      <span className="font-mono text-amber-500 font-semibold">
                        +₹{result.accrued.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Total Accrued Interest:
                      </span>
                      <span className="font-mono text-amber-500 font-semibold font-bold">
                        ₹{totalAccruedInterest.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-border/20 pt-1.5">
                      <span className="text-muted-foreground">
                        Repayment allocated to Interest:
                      </span>
                      <span className="font-mono text-amber-500 font-semibold">
                        -₹{interestPaid.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Repayment allocated to Principal:
                      </span>
                      <span className="font-mono text-[#10b981] font-semibold">
                        -₹{principalPaid.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-border/20 pt-1.5">
                      <span className="text-muted-foreground font-bold">
                        New Outstanding Principal:
                      </span>
                      <span className="font-mono text-foreground font-bold">
                        ₹{newOutstandingPrincipal.toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                );
              })()}

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold shadow-lg hover:bg-primary/95 transition-all"
                >
                  Record Repayment
                </button>
                <button
                  type="button"
                  onClick={() => setFriendRepayingLoan(null)}
                  className="flex-1 py-2.5 rounded-xl bg-muted border border-border text-xs font-semibold text-foreground hover:bg-muted/80 transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Delete Confirmation Modal */}
      {deleteAccountTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl relative">
            <h3 className="text-lg font-bold text-red-500">Delete Loan Account?</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Are you sure you want to delete the loan account &quot;{deleteAccountTarget.name}
              &quot;? This action will remove the account configuration, but existing transactions
              tied to this account will remain.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleDeleteExecute}
                className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition"
              >
                Delete Account
              </button>
              <button
                type="button"
                onClick={() => setDeleteAccountTarget(null)}
                className="flex-1 py-2 rounded-xl bg-muted border border-border text-xs font-semibold text-foreground hover:bg-muted/80 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 6. Edit Repayment Modal */}
      {editingRepayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl relative">
            <h3 className="text-lg font-bold text-foreground">Edit Repayment</h3>
            <p className="text-xs text-muted-foreground -mt-2">
              Modify the details of this flexible repayment.
            </p>

            <form onSubmit={handleSaveEditedRepayment} className="space-y-4">
              <div>
                <label className="block text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Payment Account *
                </label>
                <select
                  value={repaymentForm.paymentAccountId}
                  onChange={(e) =>
                    setRepaymentForm({ ...repaymentForm, paymentAccountId: e.target.value })
                  }
                  required
                  className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
                >
                  <option value="">Select payment source...</option>
                  {accounts
                    .filter((a) => a.type === 'accounts')
                    .map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} (Balance: ₹{acc.balance.toLocaleString('en-IN')})
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Repayment Amount *
                  </label>
                  <input
                    type="number"
                    value={repaymentForm.amount}
                    onChange={(e) => setRepaymentForm({ ...repaymentForm, amount: e.target.value })}
                    required
                    className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition font-mono"
                  />
                </div>
                <div>
                  <label className="block text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Repayment Date *
                  </label>
                  <input
                    type="date"
                    value={repaymentForm.date}
                    onChange={(e) => setRepaymentForm({ ...repaymentForm, date: e.target.value })}
                    required
                    className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Notes
                </label>
                <textarea
                  value={repaymentForm.notes}
                  onChange={(e) => setRepaymentForm({ ...repaymentForm, notes: e.target.value })}
                  className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition h-20 resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold transition shadow-lg"
                >
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={() => setEditingRepayment(null)}
                  className="flex-1 py-2.5 rounded-xl bg-muted border border-border text-xs font-semibold text-foreground hover:bg-muted/80 transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. Delete Repayment Confirmation Modal */}
      {deletingRepayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl relative">
            <h3 className="text-lg font-bold text-red-500">Delete Repayment?</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Are you sure you want to delete this repayment of ₹
              {deletingRepayment.amount.toLocaleString('en-IN')} on{' '}
              {new Date(deletingRepayment.date).toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
              ?
            </p>
            <p className="text-3xs text-muted-foreground font-semibold uppercase tracking-wider bg-red-500/10 border border-red-500/20 p-2.5 rounded-xl leading-normal text-red-400">
              ⚠️ This will reverse the payment and recalculate the loan balance and all later
              interest calculations.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleDeleteRepayment}
                className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition"
              >
                Delete Repayment
              </button>
              <button
                type="button"
                onClick={() => setDeletingRepayment(null)}
                className="flex-1 py-2 rounded-xl bg-muted border border-border text-xs font-semibold text-foreground hover:bg-muted/80 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
