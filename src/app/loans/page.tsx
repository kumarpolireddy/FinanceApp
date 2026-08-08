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
  calculateInterestAccrual,
  getRepayments,
  saveRepayments,
  recalculateLoanTimeline,
  type Account,
  type Repayment,
} from '@/lib/storage';
import { toast } from 'sonner';
import {
  ChevronLeft,
  Landmark,
  Plus,
  Calculator,
  Wallet,
  DollarSign,
  Percent,
  CheckCircle2,
  GraduationCap,
  ChevronRight,
  Calendar,
  PieChart,
  CreditCard,
  FileText,
  LayoutGrid,
  Edit2,
  Trash2,
  Archive,
  Search,
  X,
  Sparkles,
  Clock,
  ArrowUpRight,
  ShieldAlert,
  Users,
  Check,
  Building,
  TrendingDown,
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
  const m = parseInt(parts[1]) - 1;
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
  const [showAllLoans, setShowAllLoans] = useState(false);

  // Modals and form state
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState(EMPTY_FORM);

  const [activeLoanDetails, setActiveLoanDetails] = useState<Account | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<'overview' | 'schedule' | 'ledger'>('overview');

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

  const displayedLoans = useMemo(() => {
    if (showAllLoans || loansList.length <= 2) {
      return loansList;
    }
    return loansList.slice(0, 2);
  }, [loansList, showAllLoans]);

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

    const interestPct =
      totalLiability > 0
        ? ((accruedInterest / totalLiability) * 100).toFixed(2)
        : '0.00';

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
      interestPct,
    };
  }, [accounts]);

  const paymentAccountOptions = useMemo(() => {
    return accounts.filter((a) => a.type !== 'loan' && !a.archived);
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
    const currentTenure = loan.remainingTenureMonths !== undefined ? loan.remainingTenureMonths : (loan.tenureMonths || 60);

    const newOutstanding = Math.max(0, currentBal - prepayVal);
    const newTenureOption = calculateRemainingTenure(newOutstanding, rate, currentEmi);
    const monthsSaved = Math.max(0, currentTenure - newTenureOption);
    const interestSavedTenure = Math.round(monthsSaved * (currentEmi - (newOutstanding * (rate / 12 / 100))));

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

  // Format tenure helper
  const formatTenureLeft = (acc: Account) => {
    const months = acc.remainingTenureMonths !== undefined ? acc.remainingTenureMonths : acc.tenureMonths;
    if (!months || months <= 0) return 'Flexible';
    const y = Math.floor(months / 12);
    const m = months % 12;
    if (y === 0) return `${m}m`;
    if (m === 0) return `${y}y`;
    return `${y}y ${m}m`;
  };

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#0b101d] text-foreground p-4 sm:p-6 lg:p-8 space-y-5 max-w-md md:max-w-4xl lg:max-w-6xl mx-auto font-sans select-none pb-24">
        
        {/* 1. TOP HEADER */}
        <header className="flex items-center justify-between py-1 px-1">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1 text-cyan-400 font-bold text-sm hover:opacity-80 transition"
          >
            <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
            <span>Back</span>
          </button>

          <div className="text-center">
            <h1 className="text-base sm:text-lg font-black text-white tracking-tight">
              Loans & Debts
            </h1>
            <p className="text-3xs sm:text-2xs text-slate-400 font-medium">
              Manage your liabilities with clarity
            </p>
          </div>

          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`w-9 h-9 rounded-xl border border-[#1e293b] flex items-center justify-center transition ${
              showArchived ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40' : 'bg-[#121927] text-cyan-400 hover:bg-[#1e293b]'
            }`}
            title="Toggle Menu / Archived"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </header>

        {/* 2. INTRODUCTION CARD */}
        <section className="bg-[#121927] border border-[#1e293b] rounded-3xl p-5 space-y-4 shadow-xl relative overflow-hidden">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#0d3b44] flex items-center justify-center text-cyan-400 border border-cyan-800/40 shrink-0">
                <Building className="w-6 h-6" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-white tracking-tight">
                    Loans & Debts
                  </h2>
                  <span className="bg-[#0e3038] text-cyan-400 border border-cyan-800/50 px-2.5 py-0.5 rounded-full text-3xs font-black uppercase tracking-wide">
                    {stats.count} Active
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-snug">
                  Track total liabilities, amortizations, informal loans, EMI schedules, and prepayments.
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={() => {
                if (loansList.length > 0) {
                  setSimLoanId(loansList[0].id);
                }
                setShowSimulatorModal(true);
              }}
              className="flex-1 py-2.5 px-3 rounded-2xl border border-cyan-500/40 bg-[#121927] hover:bg-cyan-500/10 text-cyan-400 text-xs font-bold flex items-center justify-center gap-2 transition active:scale-[0.98]"
            >
              <Calculator className="w-4 h-4" />
              <span>Prepayment Simulator</span>
            </button>

            <button
              onClick={handleOpenAdd}
              className="flex-1 py-2.5 px-3 rounded-2xl bg-[#06b6d4] hover:bg-[#0891b2] text-slate-950 text-xs font-black flex items-center justify-center gap-1.5 transition shadow-lg shadow-cyan-500/20 active:scale-[0.98]"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Add Loan Account</span>
            </button>
          </div>
        </section>

        {/* 3. TOTAL OUTSTANDING DEBT CARD */}
        <section className="bg-[#18121a] border border-rose-950/60 rounded-3xl p-5 space-y-2 relative overflow-hidden shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-full bg-rose-950/80 text-rose-500 border border-rose-800/40 flex items-center justify-center shrink-0">
                <Wallet className="w-5 h-5" />
              </div>
              <span className="text-xs font-extrabold uppercase tracking-wider text-rose-500">
                TOTAL OUTSTANDING DEBT
              </span>
            </div>

            {/* Subtle trend indicator if active loans exist */}
            <div className="flex items-center gap-1.5 bg-rose-950/60 text-rose-400 border border-rose-900/50 px-2 py-0.5 rounded-lg text-3xs font-bold">
              <TrendingDown className="w-3 h-3" />
              <span>2.4%</span>
              <span className="text-slate-400 font-normal text-4xs">vs last month</span>
            </div>
          </div>

          <div className="pt-1">
            <p className="text-3xl sm:text-4xl font-black text-rose-400 font-mono tracking-tight">
              ₹{stats.totalLiability.toLocaleString('en-IN')}
            </p>
            <p className="text-xs text-slate-400 font-medium mt-1">
              Principal + Unpaid Interest
            </p>
          </div>
        </section>

        {/* 4. THREE SUMMARY CARDS */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          
          {/* Card A: REMAINING PRINCIPAL */}
          <div className="bg-[#101926] border border-[#1e293b] rounded-2xl p-4 space-y-2 relative overflow-hidden shadow-md">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800/40 flex items-center justify-center text-xs font-bold shrink-0">
                ₹
              </div>
              <span className="text-3xs font-extrabold uppercase tracking-wider text-slate-400">
                REMAINING PRINCIPAL
              </span>
            </div>

            <p className="text-xl font-black font-mono text-cyan-400">
              ₹{stats.outstandingPrincipal.toLocaleString('en-IN')}
            </p>

            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-4xs text-slate-400 font-medium">
                <span>Original: ₹{stats.totalOriginalPrincipal.toLocaleString('en-IN')}</span>
                <span className="text-cyan-400 font-bold font-mono">
                  {stats.totalOriginalPrincipal > 0
                    ? Math.round((stats.outstandingPrincipal / stats.totalOriginalPrincipal) * 100)
                    : 100}%
                </span>
              </div>
              <div className="w-full h-1.5 bg-[#0b101d] rounded-full overflow-hidden">
                <div
                  className="h-full bg-cyan-400 rounded-full transition-all duration-300"
                  style={{
                    width: `${
                      stats.totalOriginalPrincipal > 0
                        ? Math.max(5, Math.round((stats.outstandingPrincipal / stats.totalOriginalPrincipal) * 100))
                        : 100
                    }%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Card B: ACCRUED UNPAID INTEREST */}
          <div className="bg-[#181717] border border-[#2e2617] rounded-2xl p-4 space-y-2 relative overflow-hidden shadow-md">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-amber-950 text-amber-400 border border-amber-800/40 flex items-center justify-center text-xs font-bold shrink-0">
                %
              </div>
              <span className="text-3xs font-extrabold uppercase tracking-wider text-amber-400/90">
                ACCRUED UNPAID INTEREST
              </span>
            </div>

            <p className="text-xl font-black font-mono text-amber-400">
              ₹{stats.accruedInterest.toLocaleString('en-IN')}
            </p>

            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-4xs text-slate-400 font-medium">
                <span>Interest calculated to current date</span>
                <span className="text-amber-400 font-bold font-mono">
                  {stats.interestPct}%
                </span>
              </div>
              <div className="w-full h-1.5 bg-[#0b101d] rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-400 rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(2, parseFloat(stats.interestPct))}%` }}
                />
              </div>
            </div>
          </div>

          {/* Card C: TOTAL REPAID */}
          <div className="bg-[#101d19] border border-[#14382c] rounded-2xl p-4 space-y-2 relative overflow-hidden shadow-md">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/40 flex items-center justify-center text-xs shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <span className="text-3xs font-extrabold uppercase tracking-wider text-emerald-400/90">
                TOTAL REPAID
              </span>
            </div>

            <p className="text-xl font-black font-mono text-emerald-400">
              ₹{stats.totalRepaid.toLocaleString('en-IN')}
            </p>

            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-4xs text-slate-400 font-medium">
                <span>Amount paid till date</span>
                <span className="text-emerald-400 font-bold font-mono">
                  {stats.overallProgress}%
                </span>
              </div>
              <div className="w-full h-1.5 bg-[#0b101d] rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-400 rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(2, stats.overallProgress)}%` }}
                />
              </div>
            </div>
          </div>

        </section>

        {/* 5. YOUR LOAN ACCOUNTS */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-white uppercase tracking-wider">
              Your Loan Accounts
            </h2>
            {loansList.length > 0 && (
              <span className="text-xs text-slate-400 font-medium">
                {loansList.length} Total
              </span>
            )}
          </div>

          <div className="bg-[#121927] border border-[#1e293b] rounded-3xl p-4 space-y-3 shadow-lg">
            {displayedLoans.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-[#0d131f] flex items-center justify-center text-slate-500 mx-auto">
                  <Landmark className="w-6 h-6" />
                </div>
                <p className="text-xs text-slate-400">No loan accounts found.</p>
                <button
                  onClick={handleOpenAdd}
                  className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold hover:bg-cyan-400 transition"
                >
                  <Plus className="w-4 h-4 inline mr-1" /> Add New Loan
                </button>
              </div>
            ) : (
              displayedLoans.map((acc) => {
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
                    className="bg-[#0d131f] border border-[#1e293b] rounded-2xl p-4 space-y-3 cursor-pointer hover:border-cyan-500/40 transition-all duration-200 group"
                  >
                    {/* Top Row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-blue-950/80 border border-blue-800/40 flex items-center justify-center text-blue-400 shrink-0">
                          {acc.icon && acc.icon !== '📉' ? (
                            <span className="text-base">{acc.icon}</span>
                          ) : (
                            <GraduationCap className="w-5 h-5" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-sm text-white tracking-tight">
                              {acc.name}
                            </h3>
                            <span
                              className={`text-4xs font-black uppercase px-2 py-0.5 rounded-full border ${
                                isPaidOff
                                  ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/50'
                                  : 'bg-emerald-950/80 text-emerald-400 border-emerald-800/50'
                              }`}
                            >
                              {isPaidOff ? 'Paid' : 'Active'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 font-medium">
                            Account No. •••• {acc.loanAccountNumber ? acc.loanAccountNumber.slice(-4) : acc.id.slice(-4)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <span className="text-base font-black font-mono text-white">
                          ₹{totalLiability.toLocaleString('en-IN')}
                        </span>
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-cyan-400 transition-colors" />
                      </div>
                    </div>

                    {/* Divider */}
                    <div className="border-t border-[#1e293b]" />

                    {/* Bottom 4 Metric Columns */}
                    <div className="grid grid-cols-4 gap-2 text-center divide-x divide-[#1e293b]/80 pt-0.5">
                      <div className="px-1">
                        <span className="text-4xs font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                          EMI Amount
                        </span>
                        <span className="text-xs font-bold font-mono text-cyan-400">
                          {acc.isInformal ? 'Flexible' : `₹${(acc.emiAmount || 0).toLocaleString('en-IN')}`}
                        </span>
                      </div>

                      <div className="px-1">
                        <span className="text-4xs font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                          Interest Rate
                        </span>
                        <span className="text-xs font-bold font-mono text-cyan-400">
                          {acc.interestRate ? `${acc.interestRate}%` : '0%'}
                        </span>
                      </div>

                      <div className="px-1">
                        <span className="text-4xs font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                          Next EMI
                        </span>
                        <span className="text-xs font-bold font-mono text-cyan-400">
                          {acc.dueDate || '—'}
                        </span>
                      </div>

                      <div className="px-1">
                        <span className="text-4xs font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                          Tenure Left
                        </span>
                        <span className="text-xs font-bold font-mono text-cyan-400">
                          {formatTenureLeft(acc)}
                        </span>
                      </div>
                    </div>

                  </div>
                );
              })
            )}

            {/* View All Loans Action Button */}
            {loansList.length > 2 && (
              <button
                onClick={() => setShowAllLoans(!showAllLoans)}
                className="w-full py-3 rounded-2xl bg-[#0d131f] border border-[#1e293b] text-cyan-400 text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-[#121927] transition"
              >
                <span>{showAllLoans ? 'Show Less Loans' : 'View All Loans'}</span>
                <ChevronRight className={`w-4 h-4 transition-transform ${showAllLoans ? 'rotate-90' : ''}`} />
              </button>
            )}
          </div>
        </section>

        {/* 6. QUICK ACTIONS */}
        <section className="space-y-3">
          <h2 className="text-sm font-extrabold text-white uppercase tracking-wider">
            Quick Actions
          </h2>

          <div className="grid grid-cols-4 gap-2.5">
            
            {/* EMI Schedule */}
            <button
              onClick={() => {
                if (loansList.length > 0) {
                  setActiveLoanDetails(loansList[0]);
                  setActiveDetailTab('schedule');
                } else {
                  handleOpenAdd();
                }
              }}
              className="bg-[#0d131f] border border-[#1e293b] rounded-2xl p-3 flex flex-col items-center justify-center gap-2 hover:border-cyan-500/40 transition active:scale-95 cursor-pointer shadow-md"
            >
              <div className="w-10 h-10 rounded-2xl bg-[#0d3b44] border border-cyan-800/40 flex items-center justify-center text-cyan-400 shrink-0">
                <Calendar className="w-5 h-5" />
              </div>
              <span className="text-3xs sm:text-2xs font-bold text-slate-300 text-center leading-tight">
                EMI Schedule
              </span>
            </button>

            {/* Amortization */}
            <button
              onClick={() => {
                if (loansList.length > 0) {
                  setActiveLoanDetails(loansList[0]);
                  setActiveDetailTab('overview');
                } else {
                  handleOpenAdd();
                }
              }}
              className="bg-[#0d131f] border border-[#1e293b] rounded-2xl p-3 flex flex-col items-center justify-center gap-2 hover:border-emerald-500/40 transition active:scale-95 cursor-pointer shadow-md"
            >
              <div className="w-10 h-10 rounded-2xl bg-emerald-950/80 border border-emerald-800/40 flex items-center justify-center text-emerald-400 shrink-0">
                <PieChart className="w-5 h-5" />
              </div>
              <span className="text-3xs sm:text-2xs font-bold text-slate-300 text-center leading-tight">
                Amortization
              </span>
            </button>

            {/* Make Payment */}
            <button
              onClick={() => {
                if (loansList.length > 0) {
                  const target = loansList[0];
                  if (target.isInformal) {
                    setFriendRepayingLoan(target);
                    setRepayAmount('');
                    setRepayDate(new Date().toISOString().slice(0, 10));
                    setRepayAccountId(target.linkedPaymentAccountId || '');
                  } else {
                    setPayingLoan(target);
                    setPayEmiAmount(String(target.emiAmount || ''));
                    setPayEmiDate(new Date().toISOString().slice(0, 10));
                    setPayEmiAccountId(target.linkedPaymentAccountId || '');
                  }
                } else {
                  handleOpenAdd();
                }
              }}
              className="bg-[#0d131f] border border-[#1e293b] rounded-2xl p-3 flex flex-col items-center justify-center gap-2 hover:border-purple-500/40 transition active:scale-95 cursor-pointer shadow-md"
            >
              <div className="w-10 h-10 rounded-2xl bg-purple-950/80 border border-purple-800/40 flex items-center justify-center text-purple-400 shrink-0">
                <Wallet className="w-5 h-5" />
              </div>
              <span className="text-3xs sm:text-2xs font-bold text-slate-300 text-center leading-tight">
                Make Payment
              </span>
            </button>

            {/* Reports */}
            <button
              onClick={() => {
                if (loansList.length > 0) {
                  setActiveLoanDetails(loansList[0]);
                  setActiveDetailTab('ledger');
                } else {
                  handleOpenAdd();
                }
              }}
              className="bg-[#0d131f] border border-[#1e293b] rounded-2xl p-3 flex flex-col items-center justify-center gap-2 hover:border-amber-500/40 transition active:scale-95 cursor-pointer shadow-md"
            >
              <div className="w-10 h-10 rounded-2xl bg-amber-950/80 border border-amber-800/40 flex items-center justify-center text-amber-400 shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <span className="text-3xs sm:text-2xs font-bold text-slate-300 text-center leading-tight">
                Reports
              </span>
            </button>

          </div>
        </section>

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
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
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
                      ? 'bg-cyan-500 text-slate-950 shadow-sm'
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
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                }`}
              >
                <FileText className="w-4 h-4" /> Ledger & History ({activeLoanRepayments.length})
              </button>
            </div>

            {/* TAB 1: OVERVIEW */}
            {activeDetailTab === 'overview' && (
              <div className="space-y-6">
                
                {/* Stats Breakdown Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="bg-secondary/30 border border-border/50 rounded-2xl p-4 space-y-1">
                    <span className="text-3xs uppercase font-extrabold text-muted-foreground">Original Principal</span>
                    <p className="text-lg font-black font-mono text-foreground">
                      ₹{(activeLoanDetails.originalAmount || 0).toLocaleString('en-IN')}
                    </p>
                  </div>
                  <div className="bg-secondary/30 border border-border/50 rounded-2xl p-4 space-y-1">
                    <span className="text-3xs uppercase font-extrabold text-rose-400">Current Outstanding</span>
                    <p className="text-lg font-black font-mono text-rose-400">
                      ₹{(Math.abs(activeLoanDetails.balance) + (activeLoanDetails.accruedInterest || 0)).toLocaleString('en-IN')}
                    </p>
                  </div>
                  <div className="bg-secondary/30 border border-border/50 rounded-2xl p-4 space-y-1">
                    <span className="text-3xs uppercase font-extrabold text-emerald-400">Principal Repaid</span>
                    <p className="text-lg font-black font-mono text-emerald-400">
                      ₹{(activeLoanDetails.totalPrincipalRepaid || 0).toLocaleString('en-IN')}
                    </p>
                  </div>
                  <div className="bg-secondary/30 border border-border/50 rounded-2xl p-4 space-y-1">
                    <span className="text-3xs uppercase font-extrabold text-amber-400">Interest Paid</span>
                    <p className="text-lg font-black font-mono text-amber-400">
                      ₹{(activeLoanDetails.totalInterestPaid || 0).toLocaleString('en-IN')}
                    </p>
                  </div>
                </div>

                {/* Specs Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
                    <h4 className="font-extrabold text-xs uppercase text-cyan-400 tracking-wider flex items-center gap-1.5">
                      <FileText className="w-4 h-4" /> Financial Specifications
                    </h4>
                    <div className="space-y-2 text-xs divide-y divide-border/30">
                      <div className="flex justify-between py-1">
                        <span className="text-muted-foreground">Interest Rate:</span>
                        <span className="font-semibold font-mono text-foreground">{activeLoanDetails.interestRate ? `${activeLoanDetails.interestRate}%` : '0%'}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-muted-foreground">Interest Structure:</span>
                        <span className="font-semibold text-foreground capitalize">{activeLoanDetails.interestType || 'reducing'}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-muted-foreground">Monthly EMI Amount:</span>
                        <span className="font-bold font-mono text-foreground">{activeLoanDetails.emiAmount ? `₹${activeLoanDetails.emiAmount.toLocaleString('en-IN')}` : 'Flexible'}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-muted-foreground">Tenure:</span>
                        <span className="font-medium text-foreground">{activeLoanDetails.tenureMonths ? `${activeLoanDetails.tenureMonths} Months` : 'N/A'}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-muted-foreground">Start Date:</span>
                        <span className="font-medium text-foreground">{activeLoanDetails.startDate || '—'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
                    <h4 className="font-extrabold text-xs uppercase text-cyan-400 tracking-wider flex items-center gap-1.5">
                      <CreditCard className="w-4 h-4" /> Additional & Payment Details
                    </h4>
                    <div className="space-y-2 text-xs divide-y divide-border/30">
                      <div className="flex justify-between py-1">
                        <span className="text-muted-foreground">Loan Account Number:</span>
                        <span className="font-mono text-foreground">{activeLoanDetails.loanAccountNumber || '—'}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-muted-foreground">Processing Fee:</span>
                        <span className="font-mono text-foreground">{activeLoanDetails.processingFee ? `₹${activeLoanDetails.processingFee}` : 'None'}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-muted-foreground">Linked Bank Account:</span>
                        <span className="font-medium text-foreground">
                          {paymentAccountOptions.find(a => a.id === activeLoanDetails.linkedPaymentAccountId)?.name || 'Not Linked'}
                        </span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-muted-foreground">Notes:</span>
                        <span className="font-medium text-foreground italic">{activeLoanDetails.notes || 'No notes added'}</span>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* TAB 2: AMORTIZATION SCHEDULE */}
            {activeDetailTab === 'schedule' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground font-medium">Full installment amortization projection schedule</span>
                  <span className="font-mono font-bold text-foreground">{activeLoanSchedule.length} Months Total</span>
                </div>
                
                <div className="border border-border rounded-2xl overflow-hidden max-h-[400px] overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-secondary/60 sticky top-0 text-muted-foreground uppercase text-3xs font-extrabold tracking-wider border-b border-border">
                      <tr>
                        <th className="p-3">#</th>
                        <th className="p-3">Due Date</th>
                        <th className="p-3">Opening</th>
                        <th className="p-3">EMI</th>
                        <th className="p-3">Principal</th>
                        <th className="p-3">Interest</th>
                        <th className="p-3">Closing</th>
                        <th className="p-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30 font-mono text-2xs">
                      {activeLoanSchedule.map((row) => (
                        <tr key={row.num} className="hover:bg-secondary/20 transition">
                          <td className="p-3 font-bold text-muted-foreground">{row.num}</td>
                          <td className="p-3 font-sans text-foreground">{row.dueDateStr}</td>
                          <td className="p-3">₹{row.opening.toLocaleString('en-IN')}</td>
                          <td className="p-3 font-bold text-foreground">₹{row.emi.toLocaleString('en-IN')}</td>
                          <td className="p-3 text-emerald-400">₹{row.principal.toLocaleString('en-IN')}</td>
                          <td className="p-3 text-amber-400">₹{row.interest.toLocaleString('en-IN')}</td>
                          <td className="p-3">₹{row.closing.toLocaleString('en-IN')}</td>
                          <td className="p-3 font-sans">
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
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="font-extrabold text-xs uppercase text-cyan-400 tracking-wider">
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
                        <div key={r.id} className="p-3 flex items-center justify-between text-xs hover:bg-secondary/30 transition">
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
                <div className="space-y-3">
                  <h4 className="font-extrabold text-xs uppercase text-cyan-400 tracking-wider">
                    Calculated Monthly Interest & Principal Ledger
                  </h4>
                  <div className="border border-border rounded-2xl overflow-hidden max-h-[300px] overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-secondary/60 sticky top-0 text-muted-foreground uppercase text-3xs font-extrabold tracking-wider border-b border-border">
                        <tr>
                          <th className="p-3">Period</th>
                          <th className="p-3">Opening</th>
                          <th className="p-3">Accrued Interest</th>
                          <th className="p-3">Payments</th>
                          <th className="p-3">Closing Principal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30 font-mono text-2xs">
                        {activeLoanLedger.map((row, idx) => (
                          <tr key={idx} className="hover:bg-secondary/20 transition">
                            <td className="p-3 font-sans font-bold text-foreground">{row.period}</td>
                            <td className="p-3">₹{row.openingPrincipal.toLocaleString('en-IN')}</td>
                            <td className="p-3 text-amber-400">₹{row.interestAccrued.toLocaleString('en-IN')}</td>
                            <td className="p-3 text-emerald-400">₹{row.paymentsMade.toLocaleString('en-IN')}</td>
                            <td className="p-3 font-bold text-foreground">₹{row.closingPrincipal.toLocaleString('en-IN')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}

            {/* Modal Bottom Actions */}
            <div className="pt-4 border-t border-border flex justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleOpenEdit(activeLoanDetails)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-secondary text-foreground hover:bg-secondary/80 transition flex items-center gap-1.5"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Edit Loan
                </button>
                <button
                  onClick={() => setDeleteAccountTarget(activeLoanDetails)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </div>

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
              <label className="text-xs font-bold text-muted-foreground uppercase">Select Loan</label>
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
              <label className="text-xs font-bold text-muted-foreground uppercase">Prepayment Amount (₹)</label>
              <input
                type="number"
                value={simPrepayAmount}
                onChange={(e) => setSimPrepayAmount(e.target.value)}
                placeholder="e.g. 50000"
                className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-primary font-mono"
              />
            </div>
          </div>

          {simResults && (
            <div className="space-y-4">
              <h4 className="text-xs font-black uppercase text-cyan-400 tracking-wider">Comparison Scenarios</h4>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Scenario A: Reduce Tenure */}
                <div className="bg-card border border-emerald-500/30 rounded-2xl p-4 space-y-3 relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-emerald-400 uppercase">Option 1: Reduce Tenure</span>
                    <span className="px-2 py-0.5 rounded-full text-4xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Recommended
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="text-2xl font-black text-emerald-400 font-mono">
                      Save {simResults.monthsSaved} Months
                    </div>
                    <p className="text-2xs text-muted-foreground">
                      New Tenure: <strong className="text-foreground">{simResults.newTenureOption} Months</strong> (Down from {simResults.currentTenure})
                    </p>
                  </div>
                  <div className="pt-2 border-t border-border/40 text-xs">
                    <span className="text-muted-foreground">Est. Interest Savings: </span>
                    <span className="font-mono font-bold text-emerald-400">₹{simResults.interestSavedTenure.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                {/* Scenario B: Reduce EMI */}
                <div className="bg-card border border-cyan-500/30 rounded-2xl p-4 space-y-3 relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-cyan-400 uppercase">Option 2: Reduce Monthly EMI</span>
                  </div>
                  <div className="space-y-1">
                    <div className="text-2xl font-black text-cyan-400 font-mono">
                      ₹{simResults.newEmiOption.toLocaleString('en-IN')}/mo
                    </div>
                    <p className="text-2xs text-muted-foreground">
                      EMI Drop: <strong className="text-foreground">₹{simResults.emiReduction.toLocaleString('en-IN')}/month lower</strong>
                    </p>
                  </div>
                  <div className="pt-2 border-t border-border/40 text-xs">
                    <span className="text-muted-foreground">Est. Interest Savings: </span>
                    <span className="font-mono font-bold text-cyan-400">₹{simResults.interestSavedEmi.toLocaleString('en-IN')}</span>
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
              <label className="text-xs font-bold text-muted-foreground uppercase">Loan Name *</label>
              <input
                type="text"
                required
                value={accountForm.name}
                onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                placeholder="e.g. SBI Education Loan, HDFC Home Loan"
                className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground uppercase">Lender / Bank Name</label>
              <input
                type="text"
                value={accountForm.lenderName}
                onChange={(e) => setAccountForm({ ...accountForm, lenderName: e.target.value })}
                placeholder="e.g. SBI, HDFC, Friend John"
                className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground uppercase">Original Loan Amount (₹) *</label>
              <input
                type="number"
                required
                value={accountForm.originalAmount}
                onChange={(e) => setAccountForm({ ...accountForm, originalAmount: e.target.value })}
                placeholder="e.g. 50000"
                className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground uppercase">Current Outstanding Balance (₹) *</label>
              <input
                type="number"
                required
                value={accountForm.balance}
                onChange={(e) => setAccountForm({ ...accountForm, balance: e.target.value })}
                placeholder="e.g. 50000"
                className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground uppercase">Annual Interest Rate (%)</label>
              <input
                type="number"
                step="0.01"
                value={accountForm.interestRate}
                onChange={(e) => setAccountForm({ ...accountForm, interestRate: e.target.value })}
                placeholder="e.g. 6.90"
                className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground uppercase">Loan Start Date *</label>
              <input
                type="date"
                required
                value={accountForm.startDate}
                onChange={(e) => setAccountForm({ ...accountForm, startDate: e.target.value })}
                className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-cyan-500"
              />
            </div>

          </div>

          <div className="pt-2 border-t border-border flex items-center gap-2">
            <input
              type="checkbox"
              id="isInformal"
              checked={accountForm.isInformal}
              onChange={(e) => setAccountForm({ ...accountForm, isInformal: e.target.checked })}
              className="rounded border-border text-cyan-500 h-4 w-4"
            />
            <label htmlFor="isInformal" className="text-xs font-semibold text-foreground cursor-pointer">
              This is an informal / personal loan from a friend or relative (Flexible EMI)
            </label>
          </div>

          {!accountForm.isInformal && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-secondary/30 p-4 rounded-2xl border border-border/50">
              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground uppercase">Tenure Months</label>
                <input
                  type="number"
                  value={accountForm.tenureMonths}
                  onChange={(e) => setAccountForm({ ...accountForm, tenureMonths: e.target.value, tenureType: 'months' })}
                  placeholder="e.g. 176"
                  className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground uppercase">Monthly EMI Amount (₹)</label>
                <input
                  type="number"
                  value={accountForm.emiAmount}
                  onChange={(e) => setAccountForm({ ...accountForm, emiAmount: e.target.value })}
                  placeholder="e.g. 3500"
                  className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>
            </div>
          )}

          {/* EMI Preview Card */}
          {emiPreview && !accountForm.isInformal && (
            <div className="bg-cyan-950/40 border border-cyan-800/40 rounded-2xl p-4 space-y-2 text-xs">
              <div className="font-extrabold text-cyan-400 uppercase text-3xs tracking-wider">
                Calculated EMI Estimate
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono">
                <div>EMI: <strong className="text-foreground">₹{emiPreview.emi.toLocaleString('en-IN')}</strong></div>
                <div>Total Interest: <strong className="text-amber-400">₹{emiPreview.totalInterest.toLocaleString('en-IN')}</strong></div>
                <div>End Date: <strong className="text-foreground">{emiPreview.endDate}</strong></div>
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-border flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowAccountForm(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-secondary text-foreground hover:bg-secondary/80 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-black bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition shadow-md"
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
            <label className="text-xs font-bold text-muted-foreground uppercase">Payment Date</label>
            <input
              type="date"
              required
              value={payEmiDate}
              onChange={(e) => setPayEmiDate(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-muted-foreground uppercase">EMI Repayment Amount (₹)</label>
            <input
              type="number"
              required
              value={payEmiAmount}
              onChange={(e) => setPayEmiAmount(e.target.value)}
              placeholder="e.g. 3500"
              className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-cyan-500 font-mono text-base font-bold text-rose-400"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-muted-foreground uppercase">Payment From Bank Account *</label>
            <select
              required
              value={payEmiAccountId}
              onChange={(e) => setPayEmiAccountId(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-cyan-500 font-medium"
            >
              <option value="">Select Account...</option>
              {paymentAccountOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} (Bal: ₹{a.balance.toLocaleString('en-IN')})
                </option>
              ))}
            </select>
          </div>

          <div className="pt-4 border-t border-border flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setPayingLoan(null)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-secondary text-foreground hover:bg-secondary/80 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-black bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition shadow-md"
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
            <label className="text-xs font-bold text-muted-foreground uppercase">Prepayment Date</label>
            <input
              type="date"
              required
              value={prepayDate}
              onChange={(e) => setPrepayDate(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-muted-foreground uppercase">Prepayment Amount (₹)</label>
            <input
              type="number"
              required
              value={prepayAmount}
              onChange={(e) => setPrepayAmount(e.target.value)}
              placeholder="e.g. 50000"
              className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-cyan-500 font-mono text-base font-bold text-emerald-400"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-muted-foreground uppercase">Payment Strategy</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPrepayStrategy('tenure')}
                className={`p-3 rounded-xl border text-xs font-bold text-center transition ${
                  prepayStrategy === 'tenure'
                    ? 'border-cyan-500 bg-cyan-950/40 text-cyan-400'
                    : 'border-border bg-card text-muted-foreground'
                }`}
              >
                Reduce Tenure
              </button>
              <button
                type="button"
                onClick={() => setPrepayStrategy('emi')}
                className={`p-3 rounded-xl border text-xs font-bold text-center transition ${
                  prepayStrategy === 'emi'
                    ? 'border-cyan-500 bg-cyan-950/40 text-cyan-400'
                    : 'border-border bg-card text-muted-foreground'
                }`}
              >
                Reduce Monthly EMI
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-muted-foreground uppercase">Payment From Bank Account *</label>
            <select
              required
              value={prepayAccountId}
              onChange={(e) => setPrepayAccountId(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-cyan-500 font-medium"
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
            <label className="text-xs font-bold text-muted-foreground uppercase">Notes / Remarks</label>
            <input
              type="text"
              value={prepayNotes}
              onChange={(e) => setPrepayNotes(e.target.value)}
              placeholder="e.g. Prepayment towards principal"
              className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="pt-4 border-t border-border flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setPrepayingLoan(null)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-secondary text-foreground hover:bg-secondary/80 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-black bg-emerald-500 text-white hover:bg-emerald-400 transition shadow-md"
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
            <label className="text-xs font-bold text-muted-foreground uppercase">Repayment Date *</label>
            <input
              type="date"
              required
              value={repayDate}
              onChange={(e) => setRepayDate(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-muted-foreground uppercase">Amount Paid (₹) *</label>
            <input
              type="number"
              required
              value={repayAmount}
              onChange={(e) => setRepayAmount(e.target.value)}
              placeholder="e.g. 5000"
              className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-cyan-500 font-mono text-base font-bold text-emerald-400"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-muted-foreground uppercase">Paid From Account *</label>
            <select
              required
              value={repayAccountId}
              onChange={(e) => setRepayAccountId(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-cyan-500 font-medium"
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
              placeholder="e.g. Partial repayment via UPI"
              className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="pt-4 border-t border-border flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setFriendRepayingLoan(null)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-secondary text-foreground hover:bg-secondary/80 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-black bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition shadow-md"
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
              className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-muted-foreground uppercase">Amount (₹) *</label>
            <input
              type="number"
              required
              value={repaymentForm.amount}
              onChange={(e) => setRepaymentForm({ ...repaymentForm, amount: e.target.value })}
              className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-muted-foreground uppercase">Notes</label>
            <input
              type="text"
              value={repaymentForm.notes}
              onChange={(e) => setRepaymentForm({ ...repaymentForm, notes: e.target.value })}
              className="w-full p-2.5 rounded-xl border border-border bg-card text-xs text-foreground focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="pt-4 border-t border-border flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setEditingRepayment(null)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-secondary text-foreground hover:bg-secondary/80 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-black bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition shadow-md"
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
            Are you sure you want to delete repayment of <strong className="text-foreground font-mono">₹{deletingRepayment?.amount}</strong> dated {deletingRepayment?.date}? The loan balance and interest ledger will be automatically recalculated.
          </p>
          <div className="pt-4 border-t border-border flex justify-end gap-3">
            <button
              onClick={() => setDeletingRepayment(null)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-secondary text-foreground hover:bg-secondary/80 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteRepayment}
              className="px-5 py-2 rounded-xl text-xs font-black bg-rose-500 text-white hover:bg-rose-400 transition shadow-md"
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
            Are you sure you want to delete loan account <strong className="text-foreground">{deleteAccountTarget?.name}</strong>? This action cannot be undone.
          </p>
          <div className="pt-4 border-t border-border flex justify-end gap-3">
            <button
              onClick={() => setDeleteAccountTarget(null)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-secondary text-foreground hover:bg-secondary/80 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteExecute}
              className="px-5 py-2 rounded-xl text-xs font-black bg-rose-500 text-white hover:bg-rose-400 transition shadow-md"
            >
              Delete Account
            </button>
          </div>
        </div>
      </Modal>

    </AppLayout>
  );
}
