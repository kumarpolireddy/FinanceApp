'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
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
  getRepayments,
  saveRepayments,
  recalculateLoanTimeline,
  type Account,
  type Repayment,
} from '@/lib/storage';
import { toast } from 'sonner';
import {
  calculateNewEMI,
  calculateLoanPreview,
  calculateRemainingTenure,
  getNextEmiDateStr,
} from '@/lib/loanCalculations';
import { createLocalId } from '@/lib/ids';
import {
  Edit2,
  Trash2,
  Plus,
  Calendar,
  DollarSign,
  Search,
  Filter,
  ChevronRight,
  ChevronLeft,
  PieChart,
  CreditCard,
  X,
  LayoutGrid,
  List,
  FileText,
  History,
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

    const prevDay = new Date(nextMonthDate.getTime() - 86400000);
    const cycleEndStr = prevDay.toISOString().slice(0, 10);

    const periodTxns = loanTxns.filter((t) => t.date >= cycleStartStr && t.date <= cycleEndStr);
    const principalRepaid = periodTxns
      .filter((t) => t.toAccount === loan.id)
      .reduce((sum, t) => sum + t.amount, 0);
    const interestRepaid = periodTxns
      .filter((t) => t.category === 'Interest')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalPayments = principalRepaid + interestRepaid;
    const interestAccrued = currentOutstanding * monthlyRate;
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

    if (cycleIndex > 240) break;
  }

  return ledger;
}

export default function LoansPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loanSearch, setLoanSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [filterCategory, setFilterCategory] = useState<'all' | 'bank' | 'informal' | 'paid'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [sortBy, setSortBy] = useState<'balance' | 'dueDate' | 'rate' | 'name'>('balance');

  // Modals and form state
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState(EMPTY_FORM);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [activeLoanDetails, setActiveLoanDetails] = useState<Account | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<'overview' | 'schedule' | 'ledger'>(
    'overview'
  );

  const [payingLoan, setPayingLoan] = useState<Account | null>(null);
  const [prepayingLoan, setPrepayingLoan] = useState<Account | null>(null);

  // Simulator Modal state
  const [showSimulatorModal, setShowSimulatorModal] = useState(false);
  const [simLoanId, setSimLoanId] = useState<string>('');
  const [simPrepayAmount, setSimPrepayAmount] = useState<string>('50000');

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
    const list = getAccounts(true);
    setAccounts(list);
    const txns = getTransactions(true);
    setAllTransactions(txns);
  };

  const activeLoanLedger = useMemo(() => {
    if (!activeLoanDetails) return [];
    return generateMonthlyLedger(activeLoanDetails, allTransactions);
  }, [activeLoanDetails, allTransactions]);

  const activeLoanRepayments = useMemo(() => {
    if (!activeLoanDetails) return [];
    const allR = getRepayments();
    return allR.filter((r) => r.loanId === activeLoanDetails.id);
  }, [activeLoanDetails]);

  const loansList = useMemo(() => {
    let list = accounts.filter((a) => a.type === 'loan');

    if (!showArchived) {
      list = list.filter((a) => !a.archived);
    }

    if (filterCategory === 'bank') {
      list = list.filter((a) => !a.isInformal && a.loanStatus !== 'paid_off');
    } else if (filterCategory === 'informal') {
      list = list.filter((a) => a.isInformal && a.loanStatus !== 'paid_off');
    } else if (filterCategory === 'paid') {
      list = list.filter((a) => a.loanStatus === 'paid_off' || Math.abs(a.balance) === 0);
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

    list = [...list].sort((a, b) => {
      if (sortBy === 'balance') return Math.abs(b.balance) - Math.abs(a.balance);
      if (sortBy === 'rate') return (b.interestRate || 0) - (a.interestRate || 0);
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'dueDate') {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      }
      return 0;
    });

    return list;
  }, [accounts, loanSearch, showArchived, filterCategory, sortBy]);

  // Aggregate stats
  const stats = useMemo(() => {
    const activeLoans = accounts.filter(
      (a) => a.type === 'loan' && !a.archived && a.loanStatus !== 'paid_off'
    );
    const outstandingPrincipal = activeLoans.reduce((s, a) => s + Math.abs(a.balance), 0);
    const accruedInterest = activeLoans.reduce((s, a) => s + (a.accruedInterest || 0), 0);
    const totalLiability = outstandingPrincipal + accruedInterest;

    const totalOriginalPrincipal = accounts
      .filter((a) => a.type === 'loan')
      .reduce((s, a) => s + (a.originalAmount || Math.abs(a.balance) || 0), 0);

    const totalRepaidPrincipal = accounts
      .filter((a) => a.type === 'loan')
      .reduce((s, a) => s + (a.totalPrincipalRepaid || 0), 0);
    const totalRepaidInterest = accounts
      .filter((a) => a.type === 'loan')
      .reduce((s, a) => s + (a.totalInterestPaid || 0), 0);
    const totalRepaid = totalRepaidPrincipal + totalRepaidInterest;

    const overallProgress =
      totalOriginalPrincipal > 0
        ? Math.min(100, Math.round((totalRepaidPrincipal / totalOriginalPrincipal) * 100))
        : 0;

    return {
      count: activeLoans.length,
      outstandingPrincipal,
      accruedInterest,
      totalLiability,
      totalRepaid,
      totalOriginalPrincipal,
      totalRepaidPrincipal,
      totalRepaidInterest,
      overallProgress,
    };
  }, [accounts]);

  const paymentAccountOptions = useMemo(() => {
    return accounts.filter((a) => a.type !== 'loan' && !a.archived);
  }, [accounts]);

  const emiPreview = useMemo(() => calculateLoanPreview(accountForm), [
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

  // Simulator results computation
  const simResults = useMemo(() => {
    if (!simLoanId) return null;
    const loan = accounts.find((a) => a.id === simLoanId);
    if (!loan) return null;

    const prepayVal = Number(simPrepayAmount) || 0;
    if (prepayVal <= 0) return null;

    const currentBal = Math.abs(loan.balance);
    const rate = Number(loan.interestRate) || 0;
    const currentEmi = Number(loan.emiAmount) || 0;
    const currentTenure =
      loan.remainingTenureMonths !== undefined
        ? loan.remainingTenureMonths
        : loan.tenureMonths || 60;

    const newOutstanding = Math.max(0, currentBal - prepayVal);
    const newTenureOption = calculateRemainingTenure(newOutstanding, rate, currentEmi);
    const monthsSaved = Math.max(0, currentTenure - newTenureOption);
    const interestSavedTenure = Math.round(
      monthsSaved * (currentEmi - newOutstanding * (rate / 12 / 100))
    );

    const newEmiOption = calculateNewEMI(newOutstanding, rate, currentTenure);
    const emiReduction = Math.max(0, currentEmi - newEmiOption);
    const interestSavedEmi = Math.round(emiReduction * currentTenure);

    return {
      loan,
      currentBal,
      newOutstanding,
      prepayVal,
      currentEmi,
      currentTenure,
      newTenureOption,
      monthsSaved,
      interestSavedTenure: Math.max(0, interestSavedTenure),
      newEmiOption,
      emiReduction,
      interestSavedEmi: Math.max(0, interestSavedEmi),
    };
  }, [simLoanId, simPrepayAmount, accounts]);

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

  useEffect(() => {
    if (accounts.length === 0 || typeof window === 'undefined') return;

    const editId = new URLSearchParams(window.location.search).get('edit');
    if (!editId) return;

    const loanToEdit = accounts.find((account) => account.id === editId && account.type === 'loan');
    if (!loanToEdit) return;

    handleOpenEdit(loanToEdit);
    window.history.replaceState({}, '', window.location.pathname);
  }, [accounts]);

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
      interestStartDate: accountForm.startDate.trim(),
      expectedRepaymentDate: accountForm.isInformal
        ? accountForm.expectedRepaymentDate.trim() || undefined
        : undefined,
      compoundingFrequency:
        accountForm.isInformal && accountForm.interestType === 'compound'
          ? (accountForm.compoundingFrequency as any)
          : undefined,
    };

    const tenureMonthsVal = accountForm.isInformal
      ? 0
      : accountForm.tenureType === 'years'
        ? Number(accountForm.tenureYears) * 12
        : Number(accountForm.tenureMonths);
    payload.tenureMonths = tenureMonthsVal || undefined;

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
      id: createLocalId('repay', 5),
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
      <div className="loans-mobile-ui min-h-full bg-background px-4 py-2 sm:p-6 space-y-2 sm:space-y-6 max-w-5xl mx-auto pb-24">
        {/* 1. PAGE HEADER */}
        <div className="hidden md:flex items-center justify-between gap-4 py-1">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="p-2 rounded-xl bg-secondary/80 text-foreground hover:bg-secondary border border-border/60 transition active:scale-95 flex items-center justify-center"
              aria-label="Go Back"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg sm:text-xl font-black text-foreground tracking-tight flex items-center gap-2">
                Loans & Debts
                <span className="px-2 py-0.5 rounded-full text-3xs font-extrabold bg-primary/10 text-primary border border-primary/20">
                  {stats.count} Active
                </span>
              </h1>
              <p className="text-2xs text-muted-foreground font-medium">Manage your liabilities</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (loansList.length > 0) {
                  setSimLoanId(loansList[0].id);
                }
                setShowSimulatorModal(true);
              }}
              className="p-2 sm:px-4 sm:py-2 rounded-xl bg-secondary/80 hover:bg-secondary text-foreground text-xs font-bold border border-border/80 transition flex items-center gap-1.5 shadow-sm active:scale-95"
              title="Prepayment Simulator"
            >
              <span className="hidden sm:inline">Simulator</span>
            </button>

            <button
              onClick={handleOpenAdd}
              className="px-4 py-2 sm:px-4 sm:py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-95 transition flex items-center gap-1.5 shadow-md active:scale-95"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span className="hidden sm:inline">Add Loan</span>
            </button>
          </div>
        </div>

        {/* 2. DEBT OVERVIEW */}
        <div className="py-1">
          <div className="flex items-end justify-between gap-4">
            <div className="space-y-1">
            <div className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
              Total Outstanding
            </div>
            <p className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight tabular-nums">
              ₹{stats.totalLiability.toLocaleString('en-IN')}
            </p>
            </div>
            <p className="text-xs text-muted-foreground pb-1">{stats.count} active loans</p>
          </div>
        </div>

        {/* 4. DEBT PAYOFF PROGRESS */}
        {stats.totalOriginalPrincipal > 0 && (
          <div className="py-2 border-y border-border/60 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div>
                <h3 className="font-semibold text-foreground tracking-tight">
                  Debt Payoff · {stats.overallProgress}%
                </h3>
                <p className="text-3xs text-muted-foreground mt-0.5">
                  ₹{stats.totalRepaidPrincipal.toLocaleString('en-IN')} repaid of ₹
                  {stats.totalOriginalPrincipal.toLocaleString('en-IN')}
                </p>
              </div>
            </div>

            <div className="w-full h-2.5 bg-secondary/80 rounded-full overflow-hidden p-0.5 border border-border/40">
              <div
                className="h-full bg-[#6f7782] dark:bg-[#9299a3] rounded-full transition-all duration-500"
                style={{ width: `${Math.max(3, stats.overallProgress)}%` }}
              />
            </div>
          </div>
        )}

        {/* 5 & 7. LOAN ACCOUNT SECTION & SEARCH / SORT / FILTER */}
        <div className="space-y-1.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-4">
            <div className="flex items-center justify-between w-full sm:w-auto">
              <h2 className="text-base font-extrabold text-foreground tracking-tight flex items-center gap-2">
                Your Loans
                <span className="text-xs font-bold text-muted-foreground">
                  ({loansList.length})
                </span>
              </h2>

              <button
                onClick={handleOpenAdd}
                className="sm:hidden flex items-center gap-1 px-4 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-sm"
              >
                <Plus className="w-3.5 h-3.5 stroke-[3]" /> Add Loan
              </button>
            </div>

            {/* Segmented Filter Chips */}
            <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-none">
              <button
                onClick={() => setFilterCategory('all')}
                className={`px-2 py-2 border-b-2 text-xs font-semibold transition whitespace-nowrap ${
                  filterCategory === 'all'
                    ? 'border-[#666d76] text-foreground dark:border-[#9aa0a8]'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                All{' '}
                {
                  accounts.filter((a) => a.type === 'loan' && (!showArchived ? !a.archived : true))
                    .length
                }
              </button>

              <button
                onClick={() => setFilterCategory('bank')}
                className={`px-2 py-2 border-b-2 text-xs font-semibold transition whitespace-nowrap ${
                  filterCategory === 'bank'
                    ? 'border-[#666d76] text-foreground dark:border-[#9aa0a8]'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Bank & EMI
              </button>

              <button
                onClick={() => setFilterCategory('informal')}
                className={`px-2 py-2 border-b-2 text-xs font-semibold transition whitespace-nowrap ${
                  filterCategory === 'informal'
                    ? 'border-[#666d76] text-foreground dark:border-[#9aa0a8]'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Informal
              </button>

              <button
                onClick={() => setFilterCategory('paid')}
                className={`px-2 py-2 border-b-2 text-xs font-semibold transition whitespace-nowrap ${
                  filterCategory === 'paid'
                    ? 'border-[#666d76] text-foreground dark:border-[#9aa0a8]'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Paid Off
              </button>
            </div>
          </div>

          {/* Search, Sort & Controls Bar */}
          <div className="grid grid-cols-[1fr_auto] sm:flex items-center gap-1.5 py-1 border-y border-border/60 bg-secondary/35">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={loanSearch}
                onChange={(e) => setLoanSearch(e.target.value)}
                placeholder="Search loans"
                className="w-full pl-8 pr-7 py-2 bg-transparent text-xs text-foreground focus:outline-none border-0 transition"
              />
              {loanSearch && (
                <button
                  onClick={() => setLoanSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="hidden sm:block py-2 px-2 bg-transparent border-0 text-xs text-foreground focus:outline-none cursor-pointer font-medium"
            >
              <option value="balance">Sort: Balance</option>
              <option value="dueDate">Sort: Due Date</option>
              <option value="rate">Sort: Rate</option>
              <option value="name">Sort: Name</option>
            </select>

            <div className="hidden sm:flex items-center gap-0.5 bg-secondary/50 p-0.5 rounded-xl border border-border/40">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg transition ${
                  viewMode === 'grid'
                    ? 'bg-card text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Grid View"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg transition ${
                  viewMode === 'table'
                    ? 'bg-card text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Table View"
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowArchived((current) => !current)}
              className={`flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium transition ${
                showArchived ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-pressed={showArchived}
            >
              <Filter className="w-3.5 h-3.5" />
              {showArchived ? 'Archived shown' : 'Filter'}
            </button>
          </div>
        </div>

        {/* 6. LOAN CARDS RENDERING */}
        {loansList.length === 0 ? (
          <div className="py-12 text-center space-y-4">
            <div className="max-w-md mx-auto space-y-1">
              <h3 className="text-base font-bold text-foreground">No loan accounts found</h3>
              <p className="text-xs text-muted-foreground">
                {loanSearch
                  ? `No loans match your search query "${loanSearch}". Try clearing filters.`
                  : 'You have no loans listed in this category. Click "+ Add Loan Account" to create your first debt tracking profile.'}
              </p>
            </div>
            <button
              onClick={handleOpenAdd}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition shadow-md"
            >
              <Plus className="w-4 h-4 inline mr-1" /> Add New Loan
            </button>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0 sm:gap-4">
            {loansList.map((acc) => {
              const outstanding = Math.abs(acc.balance);
              const totalLiability = outstanding + (acc.accruedInterest || 0);
              const isPaidOff = acc.loanStatus === 'paid_off' || totalLiability === 0;

              return (
                <div
                  key={acc.id}
                  onClick={() => {
                    setActiveLoanDetails(acc);
                    setActiveDetailTab('overview');
                  }}
                  className="flex items-center justify-between gap-4 py-3 px-4 sm:p-6 border-b border-border/60 cursor-pointer group bg-secondary hover:bg-secondary/80 transition"
                  title="Click to view all loan details"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-foreground truncate">{acc.name}</h3>
                      {acc.archived && (
                        <span className="text-3xs text-muted-foreground uppercase">Archived</span>
                      )}
                    </div>
                    <p className="text-2xs text-muted-foreground truncate">
                      {acc.lenderName || (acc.isInformal ? 'Personal loan' : 'Loan account')}
                      {' · '}
                      {isPaidOff ? 'Paid off' : 'Active'}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <span className="block text-sm font-semibold text-foreground tabular-nums">
                      ₹{totalLiability.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Table View */
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-foreground">
                <thead className="bg-secondary/50 text-muted-foreground uppercase text-3xs font-extrabold tracking-wider border-b border-border">
                  <tr>
                    <th className="p-4">Loan Name</th>
                    <th className="p-4">Outstanding Balance</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 font-medium">
                  {loansList.map((acc) => {
                    const outstanding = Math.abs(acc.balance);
                    const totalLiability = outstanding + (acc.accruedInterest || 0);
                    const isPaidOff = acc.loanStatus === 'paid_off' || totalLiability === 0;

                    return (
                      <tr
                        key={acc.id}
                        onClick={() => {
                          setActiveLoanDetails(acc);
                          setActiveDetailTab('overview');
                        }}
                        className="hover:bg-secondary/30 transition cursor-pointer group"
                      >
                        <td className="p-4">
                          <div className="flex items-center gap-2.5">
                            <span className="text-lg">{acc.icon || '📉'}</span>
                            <div className="font-bold text-foreground flex items-center gap-1.5 group-hover:text-primary transition">
                              {acc.name}
                              {acc.archived && (
                                <span className="text-4xs font-medium text-muted-foreground bg-secondary border border-border px-1 py-0.2 rounded">
                                  Archived
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="p-4 font-mono font-semibold text-foreground text-sm">
                          ₹{totalLiability.toLocaleString('en-IN')}
                        </td>

                        <td className="p-4">
                          <span
                            className={`text-3xs font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                              isPaidOff
                                ? 'bg-secondary text-foreground border border-border'
                                : acc.isInformal
                                  ? 'bg-secondary text-muted-foreground border border-border'
                                  : 'bg-secondary text-muted-foreground border border-border'
                            }`}
                          >
                            {isPaidOff ? 'Paid Off' : acc.loanStatus || 'Active'}
                          </span>
                        </td>

                        <td className="p-4 text-right">
                          <span className="text-xs text-primary font-semibold flex items-center justify-end gap-1 group-hover:underline">
                            View Details <ChevronRight className="w-3.5 h-3.5" />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* LOAN DETAIL DRAWER / MODAL */}
      <Modal
        isOpen={!!activeLoanDetails}
        onClose={() => setActiveLoanDetails(null)}
        title={activeLoanDetails?.name || 'Loan Profile Details'}
        description={`Lender: ${activeLoanDetails?.lenderName || 'Unknown'} | Account: ${activeLoanDetails?.loanAccountNumber || 'N/A'}`}
        size="xl"
      >
        {activeLoanDetails && (
          <div className="space-y-6">
            {/* Modal Top Tab Switcher */}
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <button
                onClick={() => setActiveDetailTab('overview')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                  activeDetailTab === 'overview'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                }`}
              >
                <PieChart className="w-4 h-4" /> Overview & Spec
              </button>

              {!activeLoanDetails.isInformal && (
                <button
                  onClick={() => setActiveDetailTab('schedule')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                    activeDetailTab === 'schedule'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                  }`}
                >
                  <Calendar className="w-4 h-4" /> Amortization Schedule
                </button>
              )}

              <button
                onClick={() => setActiveDetailTab('ledger')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                  activeDetailTab === 'ledger'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                }`}
              >
                <History className="w-4 h-4" /> Ledger & History ({activeLoanRepayments.length})
              </button>
            </div>

            {/* TAB 1: OVERVIEW */}
            {activeDetailTab === 'overview' && (
              <div className="space-y-6">
                {/* Stats Breakdown Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="bg-secondary/30 border border-border/50 rounded-2xl p-4 space-y-1">
                    <span className="text-3xs uppercase font-extrabold text-muted-foreground">
                      Original Principal
                    </span>
                    <p className="text-lg font-black font-mono text-foreground">
                      ₹{(activeLoanDetails.originalAmount || 0).toLocaleString('en-IN')}
                    </p>
                  </div>
                  <div className="bg-secondary/30 border border-border/50 rounded-2xl p-4 space-y-1">
                    <span className="text-3xs uppercase font-semibold text-muted-foreground">
                      Current Outstanding
                    </span>
                    <p className="text-lg font-semibold font-mono text-foreground">
                      ₹
                      {(
                        Math.abs(activeLoanDetails.balance) +
                        (activeLoanDetails.accruedInterest || 0)
                      ).toLocaleString('en-IN')}
                    </p>
                  </div>
                  <div className="bg-secondary/30 border border-border/50 rounded-2xl p-4 space-y-1">
                    <span className="text-3xs uppercase font-semibold text-muted-foreground">
                      Principal Repaid
                    </span>
                    <p className="text-lg font-semibold font-mono text-foreground">
                      ₹{(activeLoanDetails.totalPrincipalRepaid || 0).toLocaleString('en-IN')}
                    </p>
                  </div>
                  <div className="bg-secondary/30 border border-border/50 rounded-2xl p-4 space-y-1">
                    <span className="text-3xs uppercase font-semibold text-muted-foreground">
                      Interest Paid
                    </span>
                    <p className="text-lg font-semibold font-mono text-foreground">
                      ₹{(activeLoanDetails.totalInterestPaid || 0).toLocaleString('en-IN')}
                    </p>
                  </div>
                </div>

                {/* Progress Bar Card */}
                {(() => {
                  const outstanding = Math.abs(activeLoanDetails.balance);
                  const original = activeLoanDetails.originalAmount || outstanding;
                  const repaid =
                    activeLoanDetails.totalPrincipalRepaid || Math.max(0, original - outstanding);
                  const progressPct =
                    original > 0 ? Math.min(100, Math.round((repaid / original) * 100)) : 0;
                  return (
                    <div className="space-y-1.5 bg-secondary/30 p-4 rounded-2xl border border-border/50">
                      <div className="flex justify-between items-center text-xs font-bold">
                        <span className="text-muted-foreground uppercase">Principal Repaid</span>
                        <span className="text-emerald-400 font-mono">{progressPct}% Paid</span>
                      </div>
                      <div className="w-full h-2.5 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-300"
                          style={{ width: `${Math.max(4, progressPct)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-2xs text-muted-foreground font-mono pt-0.5">
                        <span>Paid: ₹{repaid.toLocaleString('en-IN')}</span>
                        <span>Orig: ₹{original.toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Specs Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
                    <h4 className="font-extrabold text-xs uppercase text-primary tracking-wider flex items-center gap-1.5">
                      <FileText className="w-4 h-4" /> Financial Specifications
                    </h4>
                    <div className="space-y-2 text-xs divide-y divide-border/30">
                      <div className="flex justify-between py-1">
                        <span className="text-muted-foreground">Interest Rate:</span>
                        <span className="font-semibold font-mono text-foreground">
                          {activeLoanDetails.interestRate
                            ? `${activeLoanDetails.interestRate}%`
                            : '0% Interest-Free'}
                        </span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-muted-foreground">Next Due Date:</span>
                        <span className="font-medium text-foreground">
                          {activeLoanDetails.dueDate || '—'}
                        </span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-muted-foreground">Interest Structure:</span>
                        <span className="font-semibold text-foreground capitalize">
                          {activeLoanDetails.interestType || 'reducing'}
                        </span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-muted-foreground">Monthly EMI Amount:</span>
                        <span className="font-bold font-mono text-foreground">
                          {activeLoanDetails.emiAmount
                            ? `₹${activeLoanDetails.emiAmount.toLocaleString('en-IN')}`
                            : 'Flexible'}
                        </span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-muted-foreground">Tenure:</span>
                        <span className="font-medium text-foreground">
                          {activeLoanDetails.tenureMonths
                            ? `${activeLoanDetails.tenureMonths} Months`
                            : 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-muted-foreground">Start Date:</span>
                        <span className="font-medium text-foreground">
                          {activeLoanDetails.startDate || '—'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
                    <h4 className="font-extrabold text-xs uppercase text-primary tracking-wider flex items-center gap-1.5">
                      <CreditCard className="w-4 h-4" /> Additional & Payment Details
                    </h4>
                    <div className="space-y-2 text-xs divide-y divide-border/30">
                      <div className="flex justify-between py-1">
                        <span className="text-muted-foreground">Lender / Bank:</span>
                        <span className="font-semibold text-foreground">
                          {activeLoanDetails.lenderName || 'Direct'}
                        </span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-muted-foreground">Loan Account Number:</span>
                        <span className="font-mono text-foreground">
                          {activeLoanDetails.loanAccountNumber || '—'}
                        </span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-muted-foreground">Processing Fee:</span>
                        <span className="font-mono text-foreground">
                          {activeLoanDetails.processingFee
                            ? `₹${activeLoanDetails.processingFee}`
                            : 'None'}
                        </span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-muted-foreground">Linked Bank Account:</span>
                        <span className="font-medium text-foreground">
                          {paymentAccountOptions.find(
                            (a) => a.id === activeLoanDetails.linkedPaymentAccountId
                          )?.name || 'Not Linked'}
                        </span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-muted-foreground">Notes:</span>
                        <span className="font-medium text-foreground italic">
                          {activeLoanDetails.notes || 'No notes added'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions Bar inside Modal */}
                <div className="bg-secondary/40 p-4 rounded-2xl border border-border/60 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-2 flex-1">
                    {activeLoanDetails.isInformal ? (
                      <button
                        onClick={() => {
                          const loan = activeLoanDetails;
                          setActiveLoanDetails(null);
                          setFriendRepayingLoan(loan);
                          setRepayAmount('');
                          setRepayDate(new Date().toISOString().slice(0, 10));
                          setRepayAccountId(loan.linkedPaymentAccountId || '');
                          setRepayNotes('');
                        }}
                        className="px-4 py-2.5 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:opacity-95 transition shadow-md flex items-center gap-1.5"
                      >
                        <DollarSign className="w-4 h-4" /> Record Repayment
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            const loan = activeLoanDetails;
                            setActiveLoanDetails(null);
                            setPayingLoan(loan);
                            setPayEmiAmount(String(loan.emiAmount || ''));
                            setPayEmiDate(new Date().toISOString().slice(0, 10));
                            setPayEmiAccountId(loan.linkedPaymentAccountId || '');
                          }}
                          className="px-4 py-2.5 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:opacity-95 transition shadow-md flex items-center gap-1.5"
                        >
                          <DollarSign className="w-4 h-4" /> Pay EMI
                        </button>
                        <button
                          onClick={() => {
                            const loan = activeLoanDetails;
                            setActiveLoanDetails(null);
                            setPrepayingLoan(loan);
                            setPrepayAmount('');
                            setPrepayDate(new Date().toISOString().slice(0, 10));
                            setPrepayAccountId(loan.linkedPaymentAccountId || '');
                            setPrepayNotes('');
                          }}
                          className="px-4 py-2.5 rounded-xl text-xs font-bold bg-secondary hover:bg-secondary/80 text-foreground border border-border transition flex items-center gap-1.5"
                        >
                          Prepay Loan
                        </button>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const loan = activeLoanDetails;
                        setActiveLoanDetails(null);
                        handleOpenEdit(loan);
                      }}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-secondary hover:bg-secondary/80 text-foreground border border-border transition flex items-center gap-1.5"
                    >
                      <Edit2 className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button
                      onClick={() => {
                        const loan = activeLoanDetails;
                        setActiveLoanDetails(null);
                        setDeleteAccountTarget(loan);
                      }}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: AMORTIZATION SCHEDULE */}
            {activeDetailTab === 'schedule' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground font-medium">
                    Full installment amortization projection schedule
                  </span>
                  <span className="font-mono font-bold text-foreground">
                    {activeLoanSchedule.length} Months Total
                  </span>
                </div>

                <div className="border border-border rounded-2xl overflow-hidden max-h-[400px] overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-secondary/60 sticky top-0 text-muted-foreground uppercase text-3xs font-extrabold tracking-wider border-b border-border">
                      <tr>
                        <th className="p-4">#</th>
                        <th className="p-4">Due Date</th>
                        <th className="p-4">Opening</th>
                        <th className="p-4">EMI</th>
                        <th className="p-4">Principal</th>
                        <th className="p-4">Interest</th>
                        <th className="p-4">Closing</th>
                        <th className="p-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30 font-mono text-2xs">
                      {activeLoanSchedule.map((row) => (
                        <tr key={row.num} className="hover:bg-secondary/20 transition">
                          <td className="p-4 font-bold text-muted-foreground">{row.num}</td>
                          <td className="p-4 font-sans text-foreground">{row.dueDateStr}</td>
                          <td className="p-4">₹{row.opening.toLocaleString('en-IN')}</td>
                          <td className="p-4 font-bold text-foreground">
                            ₹{row.emi.toLocaleString('en-IN')}
                          </td>
                          <td className="p-4 text-emerald-400">
                            ₹{row.principal.toLocaleString('en-IN')}
                          </td>
                          <td className="p-4 text-amber-400">
                            ₹{row.interest.toLocaleString('en-IN')}
                          </td>
                          <td className="p-4">₹{row.closing.toLocaleString('en-IN')}</td>
                          <td className="p-4 font-sans">
                            <span
                              className={`px-2 py-0.5 rounded-full text-4xs font-black uppercase tracking-wider ${
                                row.status === 'Paid'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : row.status === 'Overdue'
                                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                    : 'bg-secondary text-muted-foreground'
                              }`}
                            >
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 3: LEDGER & REPAYMENTS */}
            {activeDetailTab === 'ledger' && (
              <div className="space-y-6">
                {/* Repayments Recorded List */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="font-extrabold text-xs uppercase text-primary tracking-wider">
                      Recorded Repayment Logs
                    </h4>
                  </div>

                  {activeLoanRepayments.length === 0 ? (
                    <div className="p-4 rounded-xl border border-dashed border-border text-center text-xs text-muted-foreground">
                      No individual repayments logged yet for this account.
                    </div>
                  ) : (
                    <div className="border border-border rounded-2xl overflow-hidden divide-y divide-border/30">
                      {activeLoanRepayments.map((r) => (
                        <div
                          key={r.id}
                          className="p-4 flex items-center justify-between text-xs hover:bg-secondary/30 transition"
                        >
                          <div>
                            <div className="font-bold text-foreground font-mono">
                              ₹{r.amount.toLocaleString('en-IN')}
                            </div>
                            <div className="text-3xs text-muted-foreground">
                              Date: {r.date} {r.notes ? `| ${r.notes}` : ''}
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                setEditingRepayment(r);
                                setRepaymentForm({
                                  amount: String(r.amount),
                                  date: r.date,
                                  paymentAccountId: r.paymentAccountId || '',
                                  notes: r.notes || '',
                                });
                              }}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition"
                              title="Edit Repayment"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeletingRepayment(r)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition"
                              title="Delete Repayment"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Monthly Ledger Table */}
                <div className="space-y-4">
                  <h4 className="font-extrabold text-xs uppercase text-primary tracking-wider">
                    Calculated Monthly Interest & Principal Ledger
                  </h4>
                  <div className="border border-border rounded-2xl overflow-hidden max-h-[300px] overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-secondary/60 sticky top-0 text-muted-foreground uppercase text-3xs font-extrabold tracking-wider border-b border-border">
                        <tr>
                          <th className="p-4">Period</th>
                          <th className="p-4">Opening</th>
                          <th className="p-4">Accrued Interest</th>
                          <th className="p-4">Payments</th>
                          <th className="p-4">Closing Principal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30 font-mono text-2xs">
                        {activeLoanLedger.map((row, idx) => (
                          <tr key={idx} className="hover:bg-secondary/20 transition">
                            <td className="p-4 font-sans font-bold text-foreground">
                              {row.period}
                            </td>
                            <td className="p-4">₹{row.openingPrincipal.toLocaleString('en-IN')}</td>
                            <td className="p-4 text-amber-400">
                              ₹{row.interestAccrued.toLocaleString('en-IN')}
                            </td>
                            <td className="p-4 text-emerald-400">
                              ₹{row.paymentsMade.toLocaleString('en-IN')}
                            </td>
                            <td className="p-4 font-bold text-foreground">
                              ₹{row.closingPrincipal.toLocaleString('en-IN')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Modal Bottom Actions */}
            <div className="pt-4 border-t border-border flex justify-end gap-4">
              <button
                onClick={() => setActiveLoanDetails(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-secondary text-foreground hover:bg-secondary/80 transition"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* PREPAYMENT SIMULATOR MODAL */}
      <Modal
        isOpen={showSimulatorModal}
        onClose={() => setShowSimulatorModal(false)}
        title="Prepayment Simulator"
        description="Estimate interest and tenure savings before making a lump-sum loan prepayment."
        size="lg"
      >
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground uppercase">
                Select Loan
              </label>
              <select
                value={simLoanId}
                onChange={(e) => setSimLoanId(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-primary font-medium"
              >
                {loansList.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} (Bal: ₹{Math.abs(a.balance).toLocaleString('en-IN')})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground uppercase">
                Prepayment Amount (₹)
              </label>
              <input
                type="number"
                value={simPrepayAmount}
                onChange={(e) => setSimPrepayAmount(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-primary font-mono"
              />
            </div>
          </div>

          {simResults && (
            <div className="space-y-4">
              <h4 className="text-xs font-black uppercase text-primary tracking-wider">
                Comparison Scenarios
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Scenario A: Reduce Tenure */}
                <div className="bg-card border border-emerald-500/30 rounded-2xl p-4 space-y-4 relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-emerald-400 uppercase">
                      Option 1: Reduce Tenure
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-4xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Recommended
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="text-2xl font-black text-emerald-400 font-mono">
                      Save {simResults.monthsSaved} Months
                    </div>
                    <p className="text-2xs text-muted-foreground">
                      New Tenure:{' '}
                      <strong className="text-foreground">
                        {simResults.newTenureOption} Months
                      </strong>{' '}
                      (Down from {simResults.currentTenure})
                    </p>
                  </div>
                  <div className="pt-2 border-t border-border/40 text-xs">
                    <span className="text-muted-foreground">Est. Interest Savings: </span>
                    <span className="font-mono font-bold text-emerald-400">
                      ₹{simResults.interestSavedTenure.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                {/* Scenario B: Reduce EMI */}
                <div className="bg-card border border-primary/30 rounded-2xl p-4 space-y-4 relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-primary uppercase">
                      Option 2: Reduce Monthly EMI
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="text-2xl font-black text-primary font-mono">
                      ₹{simResults.newEmiOption.toLocaleString('en-IN')}/mo
                    </div>
                    <p className="text-2xs text-muted-foreground">
                      EMI Drop:{' '}
                      <strong className="text-foreground">
                        ₹{simResults.emiReduction.toLocaleString('en-IN')}/month lower
                      </strong>
                    </p>
                  </div>
                  <div className="pt-2 border-t border-border/40 text-xs">
                    <span className="text-muted-foreground">Est. Interest Savings: </span>
                    <span className="font-mono font-bold text-primary">
                      ₹{simResults.interestSavedEmi.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-border flex justify-end">
            <button
              onClick={() => setShowSimulatorModal(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-secondary text-foreground hover:bg-secondary/80 transition"
            >
              Close Simulator
            </button>
          </div>
        </div>
      </Modal>

      {/* ADD / EDIT LOAN FORM MODAL */}
      <Modal
        isOpen={showAccountForm}
        onClose={() => setShowAccountForm(false)}
        title={editingId ? 'Edit Loan Account' : 'Add New Loan'}
        size="lg"
      >
        <form onSubmit={handleSaveLoan} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground uppercase">
                Loan Name *
              </label>
              <input
                type="text"
                required
                value={accountForm.name}
                onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground uppercase">
                Lender / Bank Name
              </label>
              <input
                type="text"
                value={accountForm.lenderName}
                onChange={(e) => setAccountForm({ ...accountForm, lenderName: e.target.value })}
                className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground uppercase">
                Original Loan Amount (₹) *
              </label>
              <input
                type="number"
                required
                value={accountForm.originalAmount}
                onChange={(e) => setAccountForm({ ...accountForm, originalAmount: e.target.value })}
                className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-primary font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground uppercase">
                Current Outstanding Balance (₹) *
              </label>
              <input
                type="number"
                required
                value={accountForm.balance}
                onChange={(e) => setAccountForm({ ...accountForm, balance: e.target.value })}
                className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-primary font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground uppercase">
                Annual Interest Rate (%)
              </label>
              <input
                type="number"
                step="0.01"
                value={accountForm.interestRate}
                onChange={(e) => setAccountForm({ ...accountForm, interestRate: e.target.value })}
                className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-primary font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground uppercase">
                Loan Start Date *
              </label>
              <input
                type="date"
                required
                value={accountForm.startDate}
                onChange={(e) => setAccountForm({ ...accountForm, startDate: e.target.value })}
                className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-border flex items-center gap-2">
            <input
              type="checkbox"
              id="isInformal"
              checked={accountForm.isInformal}
              onChange={(e) => setAccountForm({ ...accountForm, isInformal: e.target.checked })}
              className="rounded border-border text-primary h-4 w-4"
            />
            <label
              htmlFor="isInformal"
              className="text-xs font-semibold text-foreground cursor-pointer"
            >
              This is an informal / personal loan from a friend or relative (Flexible EMI)
            </label>
          </div>

          {!accountForm.isInformal && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-secondary/30 p-4 rounded-2xl border border-border/50">
              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground uppercase">
                  Tenure Months
                </label>
                <input
                  type="number"
                  value={accountForm.tenureMonths}
                  onChange={(e) =>
                    setAccountForm({
                      ...accountForm,
                      tenureMonths: e.target.value,
                      tenureType: 'months',
                    })
                  }
                  className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-primary font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground uppercase">
                  Monthly EMI Amount (₹)
                </label>
                <input
                  type="number"
                  value={accountForm.emiAmount}
                  onChange={(e) => setAccountForm({ ...accountForm, emiAmount: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-primary font-mono"
                />
              </div>
            </div>
          )}

          {/* EMI Preview Card */}
          {emiPreview && !accountForm.isInformal && (
            <div className="bg-primary/10 border border-primary/20 rounded-2xl p-4 space-y-2 text-xs">
              <div className="font-extrabold text-primary uppercase text-3xs tracking-wider">
                Calculated EMI Estimate
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono">
                <div>
                  EMI:{' '}
                  <strong className="text-foreground">
                    ₹{emiPreview.emi.toLocaleString('en-IN')}
                  </strong>
                </div>
                <div>
                  Total Interest:{' '}
                  <strong className="text-amber-400">
                    ₹{emiPreview.totalInterest.toLocaleString('en-IN')}
                  </strong>
                </div>
                <div>
                  End Date: <strong className="text-foreground">{emiPreview.endDate}</strong>
                </div>
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-border flex justify-end gap-4">
            <button
              type="button"
              onClick={() => setShowAccountForm(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-secondary text-foreground hover:bg-secondary/80 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 transition shadow-md"
            >
              {editingId ? 'Update Loan' : 'Create Loan'}
            </button>
          </div>
        </form>
      </Modal>

      {/* PAY EMI MODAL */}
      <Modal
        isOpen={!!payingLoan}
        onClose={() => setPayingLoan(null)}
        title={`Pay EMI - ${payingLoan?.name}`}
        description={`Record monthly EMI installment for ${payingLoan?.lenderName || 'Loan'}`}
      >
        <form onSubmit={handlePayEmi} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-muted-foreground uppercase">
              Payment Date
            </label>
            <input
              type="date"
              required
              value={payEmiDate}
              onChange={(e) => setPayEmiDate(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-muted-foreground uppercase">
              EMI Repayment Amount (₹)
            </label>
            <input
              type="number"
              required
              value={payEmiAmount}
              onChange={(e) => setPayEmiAmount(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-primary font-mono text-base font-bold text-rose-400"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-muted-foreground uppercase">
              Payment From Bank Account *
            </label>
            <select
              required
              value={payEmiAccountId}
              onChange={(e) => setPayEmiAccountId(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-primary font-medium"
            >
              <option value="">Select Account...</option>
              {paymentAccountOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} (Bal: ₹{a.balance.toLocaleString('en-IN')})
                </option>
              ))}
            </select>
          </div>

          <div className="pt-4 border-t border-border flex justify-end gap-4">
            <button
              type="button"
              onClick={() => setPayingLoan(null)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-secondary text-foreground hover:bg-secondary/80 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 transition shadow-md"
            >
              Confirm EMI Payment
            </button>
          </div>
        </form>
      </Modal>

      {/* PREPAYMENT MODAL */}
      <Modal
        isOpen={!!prepayingLoan}
        onClose={() => setPrepayingLoan(null)}
        title={`Make Prepayment - ${prepayingLoan?.name}`}
        description="Lump-sum payment directly reducing your loan principal balance."
      >
        <form onSubmit={handlePrepayment} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-muted-foreground uppercase">
              Prepayment Date
            </label>
            <input
              type="date"
              required
              value={prepayDate}
              onChange={(e) => setPrepayDate(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-muted-foreground uppercase">
              Prepayment Amount (₹)
            </label>
            <input
              type="number"
              required
              value={prepayAmount}
              onChange={(e) => setPrepayAmount(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-primary font-mono text-base font-bold text-emerald-400"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-muted-foreground uppercase">
              Payment Strategy
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setPrepayStrategy('tenure')}
                className={`p-4 rounded-xl border text-xs font-bold text-center transition ${
                  prepayStrategy === 'tenure'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground'
                }`}
              >
                Reduce Tenure
              </button>
              <button
                type="button"
                onClick={() => setPrepayStrategy('emi')}
                className={`p-4 rounded-xl border text-xs font-bold text-center transition ${
                  prepayStrategy === 'emi'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground'
                }`}
              >
                Reduce Monthly EMI
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-muted-foreground uppercase">
              Payment From Bank Account *
            </label>
            <select
              required
              value={prepayAccountId}
              onChange={(e) => setPrepayAccountId(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-primary font-medium"
            >
              <option value="">Select Account...</option>
              {paymentAccountOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} (Bal: ₹{a.balance.toLocaleString('en-IN')})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-muted-foreground uppercase">
              Notes / Remarks
            </label>
            <input
              type="text"
              value={prepayNotes}
              onChange={(e) => setPrepayNotes(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div className="pt-4 border-t border-border flex justify-end gap-4">
            <button
              type="button"
              onClick={() => setPrepayingLoan(null)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-secondary text-foreground hover:bg-secondary/80 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 rounded-xl text-xs font-bold bg-emerald-500 text-white hover:opacity-90 transition shadow-md"
            >
              Confirm Prepayment
            </button>
          </div>
        </form>
      </Modal>

      {/* RECORD INFORMAL REPAYMENT MODAL */}
      <Modal
        isOpen={!!friendRepayingLoan}
        onClose={() => setFriendRepayingLoan(null)}
        title={`Record Repayment - ${friendRepayingLoan?.name}`}
        description={`Record repayment for ${friendRepayingLoan?.lenderName || 'friend'}`}
      >
        <form onSubmit={handleFriendRepayment} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-muted-foreground uppercase">
              Repayment Date *
            </label>
            <input
              type="date"
              required
              value={repayDate}
              onChange={(e) => setRepayDate(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-muted-foreground uppercase">
              Amount Paid (₹) *
            </label>
            <input
              type="number"
              required
              value={repayAmount}
              onChange={(e) => setRepayAmount(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-primary font-mono text-base font-bold text-emerald-400"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-muted-foreground uppercase">
              Paid From Account *
            </label>
            <select
              required
              value={repayAccountId}
              onChange={(e) => setRepayAccountId(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-primary font-medium"
            >
              <option value="">Select Account...</option>
              {paymentAccountOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} (Bal: ₹{a.balance.toLocaleString('en-IN')})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-muted-foreground uppercase">Notes</label>
            <input
              type="text"
              value={repayNotes}
              onChange={(e) => setRepayNotes(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div className="pt-4 border-t border-border flex justify-end gap-4">
            <button
              type="button"
              onClick={() => setFriendRepayingLoan(null)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-secondary text-foreground hover:bg-secondary/80 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 transition shadow-md"
            >
              Save Repayment
            </button>
          </div>
        </form>
      </Modal>

      {/* EDIT REPAYMENT MODAL */}
      <Modal
        isOpen={!!editingRepayment}
        onClose={() => setEditingRepayment(null)}
        title="Edit Recorded Repayment"
      >
        <form onSubmit={handleSaveEditedRepayment} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-muted-foreground uppercase">Date *</label>
            <input
              type="date"
              required
              value={repaymentForm.date}
              onChange={(e) => setRepaymentForm({ ...repaymentForm, date: e.target.value })}
              className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-muted-foreground uppercase">
              Amount (₹) *
            </label>
            <input
              type="number"
              required
              value={repaymentForm.amount}
              onChange={(e) => setRepaymentForm({ ...repaymentForm, amount: e.target.value })}
              className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-primary font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-muted-foreground uppercase">Notes</label>
            <input
              type="text"
              value={repaymentForm.notes}
              onChange={(e) => setRepaymentForm({ ...repaymentForm, notes: e.target.value })}
              className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div className="pt-4 border-t border-border flex justify-end gap-4">
            <button
              type="button"
              onClick={() => setEditingRepayment(null)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-secondary text-foreground hover:bg-secondary/80 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 transition shadow-md"
            >
              Update Repayment
            </button>
          </div>
        </form>
      </Modal>

      {/* CONFIRM DELETE REPAYMENT MODAL */}
      <Modal
        isOpen={!!deletingRepayment}
        onClose={() => setDeletingRepayment(null)}
        title="Delete Repayment Record?"
      >
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Are you sure you want to delete repayment of{' '}
            <strong className="text-foreground font-mono">₹{deletingRepayment?.amount}</strong>{' '}
            dated {deletingRepayment?.date}? The loan balance and interest ledger will be
            automatically recalculated.
          </p>
          <div className="pt-4 border-t border-border flex justify-end gap-4">
            <button
              onClick={() => setDeletingRepayment(null)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-secondary text-foreground hover:bg-secondary/80 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteRepayment}
              className="px-6 py-2 rounded-xl text-xs font-bold bg-rose-500 text-white hover:opacity-90 transition shadow-md"
            >
              Delete Repayment
            </button>
          </div>
        </div>
      </Modal>

      {/* CONFIRM DELETE LOAN ACCOUNT MODAL */}
      <Modal
        isOpen={!!deleteAccountTarget}
        onClose={() => setDeleteAccountTarget(null)}
        title="Delete Loan Account?"
      >
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Are you sure you want to delete loan account{' '}
            <strong className="text-foreground">{deleteAccountTarget?.name}</strong>? This action
            cannot be undone.
          </p>
          <div className="pt-4 border-t border-border flex justify-end gap-4">
            <button
              onClick={() => setDeleteAccountTarget(null)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-secondary text-foreground hover:bg-secondary/80 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteExecute}
              className="px-6 py-2 rounded-xl text-xs font-bold bg-rose-500 text-white hover:opacity-90 transition shadow-md"
            >
              Delete Account
            </button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
