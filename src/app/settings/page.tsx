'use client';

import React, { useEffect, useState, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import {
  getAccounts,
  addAccount,
  updateAccount,
  deleteAccount,
  saveTransaction,
  getTransactions,
  getCategories,
  getBudgetTemplates,
  saveBudgetTemplates,
  getBudgetGlobalSettings,
  saveBudgetGlobalSettings,
  type Account,
  type BudgetTemplate,
  type BudgetGlobalSettings,
  type Category,
} from '@/lib/storage';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import { Edit2, Trash2, Archive, Eye, EyeOff, Plus, TrendingUp, TrendingDown, ChevronRight, ChevronDown } from 'lucide-react';
import { CategorySettingsInner } from '@/app/categories/components/CategorySettingsInner';

const ACCOUNT_TYPES: { value: Account['type']; label: string; icon: string; color: string }[] = [
  { value: 'accounts', label: 'Main Account (Bank/Savings)', icon: '', color: '#3b82f6' },
  { value: 'cash', label: 'Cash Account (Cash/Wallet)', icon: '', color: '#22c55e' },
  { value: 'credit', label: 'Credit Card Account', icon: '', color: '#f97316' },
  { value: 'loan', label: 'Loan Account (Liability)', icon: '', color: '#ef4444' },
];

const PRESET_EMOJIS: string[] = [];

const EMPTY_FORM = {
  name: '',
  type: 'accounts' as Account['type'],
  balance: '',
  color: '#3b82f6',
  visible: true,
  icon: '',
  bankName: '',
  accountNumber: '',
  creditLimit: '',
  dueDate: '',
  minPayment: '',
  billingCycle: '',
  originalAmount: '',
  emiAmount: '',
  interestRate: '',
  notes: '',

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
  loanStatus: 'active',
  isInformal: false,
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

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<
    'accounts' | 'categories' | 'general' | 'system' | 'budgets'
  >('accounts');
  const [currency, setCurrency] = useState('INR');
  const [theme, setTheme] = useState('dark');
  const [defaultAccount, setDefaultAccount] = useState('');
  const [budgetStartDay, setBudgetStartDay] = useState(1);
  const [accounts, setAccounts] = useState<Account[]>([]);

  // Extended Loan states
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

  // Budget settings state
  const [templates, setTemplates] = useState<BudgetTemplate[]>([]);
  const [globalSettings, setGlobalSettings] = useState<BudgetGlobalSettings>({
    autoCreate: true,
    carryLimits: true,
    carryUnused: false,
    carryOverspending: false,
    scope: 'all',
  });
  const [categories, setCategories] = useState<Category[]>([]);

  // Budget template modal state
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<BudgetTemplate | null>(null);
  const [templateFormData, setTemplateFormData] = useState({
    category: '',
    defaultAmount: '',
    notifications: [50, 80, 100] as number[],
    carryForward: false,
    enabled: true,
  });

  // Search, sorting, and filtering state
  const [accountSearch, setAccountSearch] = useState('');
  const [accountTypeFilter, setAccountTypeFilter] = useState<
    'all' | 'accounts' | 'cash' | 'credit' | 'loan'
  >('all');
  const [showHiddenAccounts, setShowHiddenAccounts] = useState(false);
  const [showArchivedAccounts, setShowArchivedAccounts] = useState(false);
  const [accountSortField, setAccountSortField] = useState<'name' | 'balance' | 'last-txn'>('name');

  // Collapsible category states
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({
    accounts: false,
    cash: false,
    credit: false,
    loan: false,
  });

  // Account form state
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState(EMPTY_FORM);

  // Adjust Balance state
  const [adjustAccount, setAdjustAccount] = useState<Account | null>(null);
  const [adjustActualBalance, setAdjustActualBalance] = useState('');
  const [adjustOption, setAdjustOption] = useState<1 | 2 | 3>(1); // 1 = Txn, 2 = Opening Bal, 3 = Force Override
  const [showWarningDialog, setShowWarningDialog] = useState(false);

  // Delete Account options modal state
  const [deleteAccountTarget, setDeleteAccountTarget] = useState<Account | null>(null);
  const [deleteOption, setDeleteOption] = useState<1 | 2 | 3>(3); // 1 = Cascade Delete, 2 = Move, 3 = Archive
  const [deleteTargetAccountForMove, setDeleteTargetAccountForMove] = useState('');

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
      // Reducing balance (default)
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

  useEffect(() => {
    setCurrency(localStorage.getItem('wealthiq_currency') || 'INR');
    setTheme(localStorage.getItem('wealthiq_theme') || 'dark');
    setDefaultAccount(localStorage.getItem('wealthiq_default_account') || '');
    setBudgetStartDay(Number(localStorage.getItem('wealthiq_budget_start_day')) || 1);
    refreshAccounts();
    // Load budgets template settings
    setTemplates(getBudgetTemplates());
    setGlobalSettings(getBudgetGlobalSettings());
    setCategories(getCategories());

    // Sync tab from URL
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (
        tab === 'categories' ||
        tab === 'general' ||
        tab === 'budgets' ||
        tab === 'system' ||
        tab === 'accounts'
      ) {
        setActiveTab(tab as any);
      }
    }
  }, []);

  const refreshAccounts = () => {
    setAccounts(getAccounts(true));
  };

  const handleSaveTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(templateFormData.defaultAmount);
    if (!templateFormData.category) {
      toast.error('Please select a category.');
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid target amount.');
      return;
    }

    let updated: BudgetTemplate[] = [];
    if (editingTemplate) {
      updated = templates.map((t) => {
        if (t.id === editingTemplate.id) {
          return {
            ...t,
            category: templateFormData.category,
            defaultAmount: amount,
            notifications: templateFormData.notifications,
            carryForward: templateFormData.carryForward,
            enabled: templateFormData.enabled,
          };
        }
        return t;
      });
      toast.success('Budget template updated.');
    } else {
      if (templates.some((t) => t.category === templateFormData.category)) {
        toast.error('A default target budget for this category already exists.');
        return;
      }
      const newTemplate: BudgetTemplate = {
        id: `tem-${Date.now()}`,
        category: templateFormData.category,
        defaultAmount: amount,
        notifications: templateFormData.notifications,
        carryForward: templateFormData.carryForward,
        enabled: templateFormData.enabled,
      };
      updated = [...templates, newTemplate];
      toast.success('Category budget template created.');
    }
    setTemplates(updated);
    saveBudgetTemplates(updated);
    setIsTemplateModalOpen(false);
  };

  const handleDeleteTemplate = (id: string) => {
    if (confirm('Are you sure you want to delete this default budget template?')) {
      const updated = templates.filter((t) => t.id !== id);
      setTemplates(updated);
      saveBudgetTemplates(updated);
      toast.success('Default budget template removed.');
    }
  };

  const handleOpenAddTemplate = () => {
    setEditingTemplate(null);
    const expCategories = categories.filter((c) => c.type === 'expense');
    setTemplateFormData({
      category: expCategories.length > 0 ? expCategories[0].name : '',
      defaultAmount: '',
      notifications: [50, 80, 100],
      carryForward: false,
      enabled: true,
    });
    setIsTemplateModalOpen(true);
  };

  const handleOpenEditTemplate = (t: BudgetTemplate) => {
    setEditingTemplate(t);
    setTemplateFormData({
      category: t.category,
      defaultAmount: t.defaultAmount.toString(),
      notifications: t.notifications || [100],
      carryForward: t.carryForward || false,
      enabled: t.enabled !== false,
    });
    setIsTemplateModalOpen(true);
  };

  const handleToggleGlobalSetting = (key: keyof BudgetGlobalSettings, val: any) => {
    const updated = { ...globalSettings, [key]: val };
    setGlobalSettings(updated);
    saveBudgetGlobalSettings(updated);
    toast.success('Global budget settings updated.');
  };

  const saveSetting = (key: string, value: string) => {
    localStorage.setItem(key, value);
    if (key === 'wealthiq_theme') {
      const root = document.documentElement;
      const classesToRemove = ['light', 'dark', 'theme-midnight-blue', 'theme-emerald-green', 'theme-royal-purple', 'theme-sunset-orange'];
      root.classList.remove(...classesToRemove);
      
      let resolved = value;
      if (value === 'system') {
        resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      
      if (resolved === 'light') {
        root.classList.add('light');
      } else {
        root.classList.add('dark');
        if (resolved.startsWith('theme-')) {
          root.classList.add(resolved);
        }
      }
      
      const readableNames: Record<string, string> = {
        'dark': 'Default Dark',
        'light': 'Light Mode',
        'system': 'System Default',
        'theme-midnight-blue': 'Midnight Blue',
        'theme-emerald-green': 'Emerald Green',
        'theme-royal-purple': 'Royal Purple',
        'theme-sunset-orange': 'Sunset Orange'
      };
      
      toast.success(`Theme updated to ${readableNames[value] || value}.`);
    }
  };

  // Last transaction dates mapping
  const lastTransactionDates = useMemo(() => {
    const dates: Record<string, string> = {};
    const txns = getTransactions(true);
    txns.forEach((t) => {
      if (!t || !t.date) return;
      if (!dates[t.account] || t.date > dates[t.account]) {
        dates[t.account] = t.date;
      }
      if (t.toAccount && (!dates[t.toAccount] || t.date > dates[t.toAccount])) {
        dates[t.toAccount] = t.date;
      }
    });
    return dates;
  }, [accounts]);

  // Adjust Balance math
  const adjustDifference = useMemo(() => {
    if (!adjustAccount) return 0;
    const current = adjustAccount.balance || 0;
    const actual = Number(adjustActualBalance) || 0;
    return actual - current;
  }, [adjustAccount, adjustActualBalance]);

  // Delete stats calculation
  const deleteStats = useMemo(() => {
    if (!deleteAccountTarget) return null;
    const txns = getTransactions().filter(
      (t) => t && (t.account === deleteAccountTarget.id || t.toAccount === deleteAccountTarget.id)
    );
    return {
      txn_count: txns.length,
      balance: deleteAccountTarget.balance || 0,
    };
  }, [deleteAccountTarget]);

  // ── Adjust balance confirmation ────────────────────────────────────────

  const handleExecuteAdjust = () => {
    if (!adjustAccount) return;
    const actual = Number(adjustActualBalance);
    const diff = adjustDifference;
    if (diff === 0) {
      setAdjustAccount(null);
      return;
    }

    if (adjustOption === 1) {
      // Option 1: Create Adjustment Transaction
      const type = diff > 0 ? 'income' : 'expense';
      saveTransaction({
        date: new Date().toISOString().slice(0, 10),
        description: 'Balance Adjustment',
        category: 'Adjustment',
        account: adjustAccount.id,
        amount: Math.abs(diff),
        type,
        notes: 'System generated balance adjustment',
      });
      toast.success('Adjustment transaction created successfully.');
    } else if (adjustOption === 2) {
      // Option 2: Modify Opening Balance
      const currentOpening =
        adjustAccount.openingBalance !== undefined
          ? adjustAccount.openingBalance
          : adjustAccount.balance;
      updateAccount(adjustAccount.id, {
        openingBalance: currentOpening + diff,
      });
      toast.success('Opening balance updated.');
    } else if (adjustOption === 3) {
      // Option 3: Replace Current Balance
      if (!showWarningDialog) {
        setShowWarningDialog(true);
        return; // wait for user confirmation check
      }
      const currentOpening =
        adjustAccount.openingBalance !== undefined
          ? adjustAccount.openingBalance
          : adjustAccount.balance;
      updateAccount(adjustAccount.id, {
        openingBalance: currentOpening + diff,
      });
      toast.success('Current balance replaced.');
      setShowWarningDialog(false);
    }

    setAdjustAccount(null);
    setAdjustActualBalance('');
    setAdjustOption(1);
    refreshAccounts();
  };

  // ── Delete confirmation ────────────────────────────────────────────────

  const handleExecuteDelete = () => {
    if (!deleteAccountTarget) return;

    if (deleteOption === 3) {
      // Option 3: Archive Account
      updateAccount(deleteAccountTarget.id, { archived: true });
      toast.success('Account archived successfully.');
    } else if (deleteOption === 1) {
      // Option 1: Delete account and all transactions
      const txns = getTransactions().filter(
        (t) => t && t.account !== deleteAccountTarget.id && t.toAccount !== deleteAccountTarget.id
      );
      localStorage.setItem('wealthiq_transactions', JSON.stringify(txns));
      deleteAccount(deleteAccountTarget.id);
      toast.success('Account and all transactions deleted.');
    } else if (deleteOption === 2) {
      // Option 2: Move transactions to another account
      if (!deleteTargetAccountForMove) {
        toast.error('Please select an account to transfer transactions to.');
        return;
      }
      const txns = getTransactions().map((t) => {
        if (!t) return t;
        const updated = { ...t };
        if (t.account === deleteAccountTarget.id) updated.account = deleteTargetAccountForMove;
        if (t.toAccount === deleteAccountTarget.id) updated.toAccount = deleteTargetAccountForMove;
        return updated;
      });
      localStorage.setItem('wealthiq_transactions', JSON.stringify(txns));
      deleteAccount(deleteAccountTarget.id);
      toast.success('Transactions moved and account deleted successfully.');
    }

    setDeleteAccountTarget(null);
    setDeleteTargetAccountForMove('');
    setDeleteOption(3);
    refreshAccounts();
  };

  // Collapsible category triggers
  const toggleCategoryCollapse = (cat: string) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [cat]: !prev[cat],
    }));
  };

  const openAddForm = (type: Account['type'] = 'accounts') => {
    setEditingId(null);
    let color = '#3b82f6';
    if (type === 'cash') {
      color = '#22c55e';
    } else if (type === 'credit') {
      color = '#f97316';
    } else if (type === 'loan') {
      color = '#ef4444';
    }

    setAccountForm({
      ...EMPTY_FORM,
      type,
      icon: '',
      color,
    });
    setShowAccountForm(true);

    setTimeout(() => {
      document.getElementById('account-form-panel')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const openEditForm = (account: Account) => {
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
      icon: account.icon || '',
      bankName: account.bankName || '',
      accountNumber: account.accountNumber || '',
      creditLimit: account.creditLimit ? String(account.creditLimit) : '',
      dueDate: account.dueDate || '',
      minPayment: account.minPayment ? String(account.minPayment) : '',
      billingCycle: account.billingCycle || '',
      originalAmount: account.originalAmount ? String(account.originalAmount) : '',
      emiAmount: account.emiAmount ? String(account.emiAmount) : '',
      interestRate: account.interestRate ? String(account.interestRate) : '',
      notes: account.notes || '',

      // New Loan Fields
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
      loanStatus: (account as any).loanStatus || 'active',
      isInformal: !!(account as any).isInformal || !!(account as any).isInformalLoan,
      interestStartDate: (account as any).interestStartDate || (account as any).startDate || '',
      expectedRepaymentDate: (account as any).expectedRepaymentDate || '',
      compoundingFrequency: (account as any).compoundingFrequency || 'monthly',
    });
    setShowAccountForm(true);

    setTimeout(() => {
      document.getElementById('account-form-panel')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const closeForm = () => {
    setShowAccountForm(false);
    setEditingId(null);
    setAccountForm(EMPTY_FORM);
  };

  const handleSubmitAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountForm.name.trim()) return;

    const balanceVal = Number(accountForm.balance) || 0;

    const payload: Partial<Account> = {
      name: accountForm.name.trim(),
      type: accountForm.type,
      balance: balanceVal,
      color: accountForm.color,
      visible: accountForm.visible,
      icon: accountForm.icon.trim() || undefined,
    };

    if (accountForm.type === 'accounts') {
      payload.bankName = accountForm.bankName.trim() || undefined;
      payload.accountNumber = accountForm.accountNumber.trim() || undefined;
      payload.notes = accountForm.notes.trim() || undefined;
    } else if (accountForm.type === 'cash') {
      payload.notes = accountForm.notes.trim() || undefined;
    } else if (accountForm.type === 'credit') {
      payload.creditLimit = Number(accountForm.creditLimit) || undefined;
      payload.dueDate = accountForm.dueDate.trim() || undefined;
      payload.minPayment = Number(accountForm.minPayment) || undefined;
      payload.billingCycle = accountForm.billingCycle.trim() || undefined;
      if (balanceVal > 0) {
        payload.balance = -balanceVal;
      }
    } else if (accountForm.type === 'loan') {
      payload.originalAmount = Number(accountForm.originalAmount) || undefined;
      payload.emiAmount = accountForm.isInformal
        ? undefined
        : Number(accountForm.emiAmount) || undefined;
      payload.interestRate = Number(accountForm.interestRate) || undefined;
      payload.dueDate = accountForm.isInformal
        ? (accountForm as any).expectedRepaymentDate?.trim() || undefined
        : accountForm.dueDate.trim() || undefined;

      // New Loan Fields
      payload.lenderName = accountForm.lenderName.trim() || undefined;
      payload.startDate = accountForm.startDate.trim() || undefined;
      payload.interestType = accountForm.interestType as any;
      payload.tenureMonths = accountForm.isInformal
        ? undefined
        : (accountForm.tenureType === 'years'
            ? Number(accountForm.tenureYears) * 12
            : Number(accountForm.tenureMonths)) || undefined;
      payload.firstEmiDate = accountForm.isInformal
        ? undefined
        : accountForm.firstEmiDate.trim() || undefined;
      payload.emiDueDay = accountForm.isInformal
        ? undefined
        : Number(accountForm.emiDueDay) || undefined;
      payload.loanAccountNumber = accountForm.loanAccountNumber.trim() || undefined;
      payload.processingFee = Number(accountForm.processingFee) || undefined;
      payload.prepaymentCharges = Number(accountForm.prepaymentCharges) || undefined;
      payload.latePaymentCharges = Number(accountForm.latePaymentCharges) || undefined;
      payload.linkedPaymentAccountId = accountForm.linkedPaymentAccountId || undefined;
      payload.autoCreateEmi = accountForm.isInformal ? false : !!accountForm.autoCreateEmi;
      payload.loanStatus = accountForm.loanStatus as any;
      payload.notes = accountForm.notes.trim() || undefined;
      payload.isInformal = !!(accountForm as any).isInformal;
      payload.isInformalLoan = !!(accountForm as any).isInformal;
      payload.interestStartDate = accountForm.startDate.trim(); // Starts from exact taken date
      payload.expectedRepaymentDate = accountForm.isInformal
        ? (accountForm as any).expectedRepaymentDate?.trim() || undefined
        : undefined;
      payload.compoundingFrequency =
        accountForm.isInformal && accountForm.interestType === 'compound'
          ? (accountForm as any).compoundingFrequency || 'monthly'
          : undefined;
      // Convert balance to negative for liability (always borrowing)
      if (balanceVal > 0) {
        payload.balance = -balanceVal;
      }
    }

    if (editingId) {
      // Direct edits do not touch balance fields to keep adjusting workflows separate
      const { balance, ...editPayload } = payload;
      updateAccount(editingId, editPayload);
    } else {
      addAccount(payload as Omit<Account, 'id'>);
    }

    refreshAccounts();
    closeForm();
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

    // Save interest component transaction (if > 0)
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

    // Save principal component transaction (if > 0)
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

    // Calculate next due date
    const nextDue = getNextEmiDateStr(
      payingLoan.dueDate || payingLoan.firstEmiDate || payingLoan.startDate || '',
      payingLoan.emiDueDay || 5
    );

    // Update loan details
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

    // Save interest component transaction (if > 0)
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

    // Save principal component transaction (if > 0)
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

    // Recalculate outstanding balance
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

  // Process list items with dense sorting and filters
  const getProcessedAccounts = (type: Account['type']) => {
    let list = accounts.filter((a) => a.type === type);

    // 1. Search queries
    if (accountSearch.trim()) {
      const q = accountSearch.toLowerCase();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.bankName || '').toLowerCase().includes(q) ||
          (a.accountNumber || '').toLowerCase().includes(q) ||
          (a.notes || '').toLowerCase().includes(q)
      );
    }

    // 2. Type selections
    if (accountTypeFilter !== 'all' && accountTypeFilter !== type) {
      return [];
    }

    // 3. Hidden filters
    if (!showHiddenAccounts) {
      list = list.filter((a) => a.visible !== false);
    }

    // 4. Archive filters
    if (!showArchivedAccounts) {
      list = list.filter((a) => !a.archived);
    }

    // 5. Advanced Desktop sorting
    list.sort((a, b) => {
      if (accountSortField === 'name') {
        return a.name.localeCompare(b.name);
      }
      if (accountSortField === 'balance') {
        return Math.abs(b.balance) - Math.abs(a.balance);
      }
      if (accountSortField === 'last-txn') {
        const dateA = lastTransactionDates[a.id] || '';
        const dateB = lastTransactionDates[b.id] || '';
        return dateB.localeCompare(dateA);
      }
      return 0;
    });

    return list;
  };

  // Collapsed header aggregate totals
  const getCategoryAggregateTotal = (type: Account['type']) => {
    const list = accounts.filter((a) => a.type === type && !a.archived);
    const sum = list.reduce((s, a) => s + (a.balance || 0), 0);
    return Math.abs(sum);
  };

  // Reset confirmation modal states
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);

  const handleExecuteReset = () => {
    if (confirmText !== 'DELETE') return;

    const previousState: Record<string, string | null> = {};
    const keysToReset = Object.keys(localStorage).filter((k) => k.startsWith('wealthiq_'));
    keysToReset.forEach((key) => {
      previousState[key] = localStorage.getItem(key);
    });

    try {
      localStorage.setItem('wealthiq_transactions', JSON.stringify([]));
      localStorage.setItem('wealthiq_accounts', JSON.stringify([]));
      localStorage.setItem('wealthiq_budgets', JSON.stringify([]));
      localStorage.setItem('wealthiq_goals', JSON.stringify([]));

      const defaultCats = [
        {
          id: 'cat-salary',
          name: 'Salary',
          type: 'income',
          color: '#22c55e',
          icon: '',
          subcategories: [],
        },
        {
          id: 'cat-business',
          name: 'Business',
          type: 'income',
          color: '#a3e635',
          icon: '',
          subcategories: [],
        },
        {
          id: 'cat-interest',
          name: 'Interest',
          type: 'income',
          color: '#3b82f6',
          icon: '',
          subcategories: [],
        },
        {
          id: 'cat-other-inc',
          name: 'Other Income',
          type: 'income',
          color: '#6b7280',
          icon: '',
          subcategories: [],
        },

        {
          id: 'cat-food',
          name: 'Food',
          type: 'expense',
          color: '#f59e0b',
          icon: '',
          subcategories: [],
        },
        {
          id: 'cat-transport',
          name: 'Transport',
          type: 'expense',
          color: '#3b82f6',
          icon: '',
          subcategories: [],
        },
        {
          id: 'cat-shopping',
          name: 'Shopping',
          type: 'expense',
          color: '#06b6d4',
          icon: '',
          subcategories: [],
        },
        {
          id: 'cat-bills',
          name: 'Bills',
          type: 'expense',
          color: '#f97316',
          icon: '',
          subcategories: [],
        },
        {
          id: 'cat-entertainment',
          name: 'Entertainment',
          type: 'expense',
          color: '#8b5cf6',
          icon: '',
          subcategories: [],
        },
        {
          id: 'cat-healthcare',
          name: 'Healthcare',
          type: 'expense',
          color: '#ec4899',
          icon: '',
          subcategories: [],
        },
        {
          id: 'cat-education',
          name: 'Education',
          type: 'expense',
          color: '#14b8a6',
          icon: '',
          subcategories: [],
        },
        {
          id: 'cat-travel',
          name: 'Travel',
          type: 'expense',
          color: '#fb923c',
          icon: '',
          subcategories: [],
        },
        {
          id: 'cat-other-exp',
          name: 'Other Expenses',
          type: 'expense',
          color: '#6b7280',
          icon: '',
          subcategories: [],
        },
      ];
      localStorage.setItem('wealthiq_categories', JSON.stringify(defaultCats));

      localStorage.setItem('wealthiq_currency', 'INR');
      localStorage.setItem('wealthiq_theme', 'dark');
      localStorage.setItem('wealthiq_default_account', '');
      localStorage.setItem('wealthiq_budget_start_day', '1');

      setIsResetModalOpen(false);
      setConfirmText('');
      setResetSuccess(true);
    } catch (err) {
      Object.entries(previousState).forEach(([key, val]) => {
        if (val === null) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, val);
        }
      });
      alert('Error during reset. Restored previous database backup.');
    }
  };

  const exportBackup = () => {
    const backup: Record<string, any> = {};
    Object.keys(localStorage)
      .filter((key) => key.startsWith('wealthiq_'))
      .forEach((key) => {
        backup[key] = localStorage.getItem(key);
      });

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wealthiq-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        Object.entries(data).forEach(([key, value]) => {
          localStorage.setItem(key, value as string);
        });
        alert('Backup restored successfully.');
        window.location.reload();
      } catch {
        alert('Invalid backup file.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-4 py-3 space-y-4 bg-background">
        <div>
          <h1 className="text-sm font-black uppercase text-foreground">Settings</h1>
          <p className="text-3xs text-muted-foreground mt-0.5">
            Configure accounts, categories, budgets, and system backups.
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex bg-secondary p-1 border border-border rounded-lg overflow-x-auto select-scrollbar gap-1">
          <button
            onClick={() => setActiveTab('accounts')}
            className={`flex-1 text-center py-2 px-2.5 rounded text-3xs font-bold uppercase tracking-wider transition ${
              activeTab === 'accounts'
                ? 'bg-primary text-primary-foreground font-black'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Accounts
          </button>
          <button
            onClick={() => setActiveTab('categories')}
            className={`flex-1 text-center py-2 px-2.5 rounded text-3xs font-bold uppercase tracking-wider transition ${
              activeTab === 'categories'
                ? 'bg-primary text-primary-foreground font-black'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Categories
          </button>
          <button
            onClick={() => setActiveTab('general')}
            className={`flex-1 text-center py-2 px-2.5 rounded text-3xs font-bold uppercase tracking-wider transition ${
              activeTab === 'general'
                ? 'bg-primary text-primary-foreground font-black'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            General
          </button>
          <button
            onClick={() => setActiveTab('budgets')}
            className={`flex-1 text-center py-2 px-2.5 rounded text-3xs font-bold uppercase tracking-wider transition ${
              activeTab === 'budgets'
                ? 'bg-primary text-primary-foreground font-black'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Budgets
          </button>
          <button
            onClick={() => setActiveTab('system')}
            className={`flex-1 text-center py-2 px-2.5 rounded text-3xs font-bold uppercase tracking-wider transition ${
              activeTab === 'system'
                ? 'bg-primary text-primary-foreground font-black'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            System
          </button>
        </div>

        {/* Tab 1: Manage Accounts */}
        {activeTab === 'accounts' && (
          <div className="space-y-4 transition-all duration-300">
            {/* Desktop Filters Bar */}
            <div className="bg-card border border-border rounded-2xl p-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
              {/* Search */}
              <div className="md:col-span-4 relative">
                <input
                  type="text"
                  value={accountSearch}
                  onChange={(e) => setAccountSearch(e.target.value)}
                  placeholder="Search accounts name, bank, number..."
                  className="w-full rounded-xl border border-border bg-[#0b0f1a] px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-primary transition"
                />
              </div>

              {/* Type Filter */}
              <div className="md:col-span-2">
                <select
                  value={accountTypeFilter}
                  onChange={(e) => setAccountTypeFilter(e.target.value as any)}
                  className="w-full rounded-xl border border-border bg-[#0b0f1a] px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-primary transition font-medium"
                >
                  <option value="all">All Types</option>
                  <option value="accounts">Main Account</option>
                  <option value="cash">Cash Account</option>
                  <option value="credit">Credit Card</option>
                  <option value="loan">Loan Account</option>
                </select>
              </div>

              {/* Sorting Filter */}
              <div className="md:col-span-2">
                <select
                  value={accountSortField}
                  onChange={(e) => setAccountSortField(e.target.value as any)}
                  className="w-full rounded-xl border border-border bg-[#0b0f1a] px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-primary transition font-medium"
                >
                  <option value="name">Sort by Name</option>
                  <option value="balance">Sort by Balance</option>
                  <option value="last-txn">Sort by Last Txn</option>
                </select>
              </div>

              {/* Toggles */}
              <div className="md:col-span-4 flex items-center justify-start md:justify-end gap-4 flex-wrap text-2xs text-muted-foreground font-semibold">
                <label className="flex items-center gap-2 cursor-pointer hover:text-foreground transition select-none">
                  <input
                    type="checkbox"
                    checked={showHiddenAccounts}
                    onChange={(e) => setShowHiddenAccounts(e.target.checked)}
                    className="rounded border-border text-primary bg-[#0b0f1a] h-3.5 w-3.5 focus:ring-offset-background focus:ring-1 focus:ring-primary"
                  />
                  Show Hidden
                </label>
                <label className="flex items-center gap-2 cursor-pointer hover:text-foreground transition select-none">
                  <input
                    type="checkbox"
                    checked={showArchivedAccounts}
                    onChange={(e) => setShowArchivedAccounts(e.target.checked)}
                    className="rounded border-border text-primary bg-[#0b0f1a] h-3.5 w-3.5 focus:ring-offset-background focus:ring-1 focus:ring-primary"
                  />
                  Show Archived
                </label>
              </div>
            </div>

            {/* Account Form Drawer Section Anchor */}
            <div id="account-form-panel" className="space-y-4">
              {showAccountForm && (
                <form
                  onSubmit={handleSubmitAccount}
                  className="rounded-2xl border border-border bg-card p-5 space-y-4 shadow-xl"
                >
                  <h3 className="text-sm font-bold text-foreground">
                    {editingId ? 'Modify Account Details' : 'Register New Account'}
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block mb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Category Classification
                      </label>
                      <select
                        value={accountForm.type}
                        disabled={!!editingId}
                        onChange={(e) => {
                          const newType = e.target.value as Account['type'];
                          const icon = '';
                          let color = '#3b82f6';
                          if (newType === 'cash') {
                            color = '#22c55e';
                          } else if (newType === 'credit') {
                            color = '#f97316';
                          } else if (newType === 'loan') {
                            color = '#ef4444';
                          }
                          setAccountForm({
                            ...accountForm,
                            type: newType,
                            icon,
                            color,
                          });
                        }}
                        className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-slate-200 focus:outline-none focus:border-primary transition disabled:opacity-50"
                      >
                        {ACCOUNT_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Common Field Name */}
                    <div>
                      <label className="block mb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {accountForm.type === 'credit'
                          ? 'Card Name'
                          : accountForm.type === 'loan'
                            ? 'Loan Name'
                            : 'Account Name'}
                      </label>
                      <input
                        type="text"
                        required
                        value={accountForm.name}
                        onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                        placeholder="Name your account..."
                        className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
                      />
                    </div>

                    {/* Main Account fields */}
                    {accountForm.type === 'accounts' && (
                      <>
                        <div>
                          <label className="block mb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Bank Name
                          </label>
                          <input
                            type="text"
                            required
                            value={accountForm.bankName}
                            onChange={(e) =>
                              setAccountForm({ ...accountForm, bankName: e.target.value })
                            }
                            placeholder="e.g. State Bank of India"
                            className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
                          />
                        </div>
                        <div>
                          <label className="block mb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Account Number
                          </label>
                          <input
                            type="text"
                            value={accountForm.accountNumber}
                            onChange={(e) =>
                              setAccountForm({ ...accountForm, accountNumber: e.target.value })
                            }
                            placeholder="Optional account number..."
                            className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
                          />
                        </div>
                        {!editingId && (
                          <div>
                            <label className="block mb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                              Opening Balance
                            </label>
                            <input
                              type="number"
                              value={accountForm.balance}
                              onChange={(e) =>
                                setAccountForm({ ...accountForm, balance: e.target.value })
                              }
                              placeholder="0"
                              className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
                            />
                          </div>
                        )}
                        <div className="sm:col-span-2">
                          <label className="block mb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Notes / Remarks
                          </label>
                          <textarea
                            value={accountForm.notes}
                            onChange={(e) =>
                              setAccountForm({ ...accountForm, notes: e.target.value })
                            }
                            placeholder="Internal account descriptions..."
                            rows={2}
                            className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition resize-none"
                          />
                        </div>
                      </>
                    )}

                    {/* Cash Account fields */}
                    {accountForm.type === 'cash' && (
                      <>
                        {!editingId && (
                          <div>
                            <label className="block mb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                              Opening Balance
                            </label>
                            <input
                              type="number"
                              value={accountForm.balance}
                              onChange={(e) =>
                                setAccountForm({ ...accountForm, balance: e.target.value })
                              }
                              placeholder="0"
                              className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
                            />
                          </div>
                        )}
                        <div className="sm:col-span-2">
                          <label className="block mb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Notes / Remarks
                          </label>
                          <textarea
                            value={accountForm.notes}
                            onChange={(e) =>
                              setAccountForm({ ...accountForm, notes: e.target.value })
                            }
                            placeholder="Add cash wallet descriptions..."
                            rows={2}
                            className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition resize-none"
                          />
                        </div>
                      </>
                    )}

                    {/* Credit Card specific fields */}
                    {accountForm.type === 'credit' && (
                      <>
                        <div>
                          <label className="block mb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Credit Limit
                          </label>
                          <input
                            type="number"
                            required
                            value={accountForm.creditLimit}
                            onChange={(e) =>
                              setAccountForm({ ...accountForm, creditLimit: e.target.value })
                            }
                            placeholder="e.g. 150000"
                            className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
                          />
                        </div>
                        {!editingId && (
                          <div>
                            <label className="block mb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                              Current Outstanding Balance
                            </label>
                            <input
                              type="number"
                              value={accountForm.balance}
                              onChange={(e) =>
                                setAccountForm({ ...accountForm, balance: e.target.value })
                              }
                              placeholder="0"
                              className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
                            />
                          </div>
                        )}
                        <div>
                          <label className="block mb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Billing Cycle Date
                          </label>
                          <input
                            type="text"
                            value={accountForm.billingCycle}
                            onChange={(e) =>
                              setAccountForm({ ...accountForm, billingCycle: e.target.value })
                            }
                            placeholder="e.g. 15th of month"
                            className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
                          />
                        </div>
                        <div>
                          <label className="block mb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Due Date
                          </label>
                          <input
                            type="text"
                            value={accountForm.dueDate}
                            onChange={(e) =>
                              setAccountForm({ ...accountForm, dueDate: e.target.value })
                            }
                            placeholder="e.g. 2nd of month"
                            className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
                          />
                        </div>
                      </>
                    )}

                    {/* Loan specific fields */}
                    {accountForm.type === 'loan' && (
                      <>
                        <div>
                          <label className="block mb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Lender *
                          </label>
                          <input
                            type="text"
                            required
                            value={accountForm.lenderName}
                            onChange={(e) =>
                              setAccountForm({ ...accountForm, lenderName: e.target.value })
                            }
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
                            onChange={(e) =>
                              setAccountForm({ ...accountForm, startDate: e.target.value })
                            }
                            className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
                          />
                        </div>

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
                                onChange={(e) =>
                                  setAccountForm({ ...accountForm, balance: e.target.value })
                                }
                                className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
                              />
                            </div>
                          </>
                        )}

                        <div>
                          <label className="block mb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Annual Interest Rate (%) *
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            required
                            value={accountForm.interestRate}
                            onChange={(e) =>
                              setAccountForm({ ...accountForm, interestRate: e.target.value })
                            }
                            className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
                          />
                        </div>

                        <div>
                          <label className="block mb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Interest Type *
                          </label>
                          <select
                            value={accountForm.interestType}
                            onChange={(e) =>
                              setAccountForm({ ...accountForm, interestType: e.target.value })
                            }
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
                              onChange={(e) =>
                                setAccountForm({ ...accountForm, isInformal: e.target.checked })
                              }
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

                        {/* Tenure input with months/years toggle */}
                        {!accountForm.isInformal && (
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
                                    setAccountForm({
                                      ...accountForm,
                                      tenureMonths: e.target.value,
                                    });
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
                        )}

                        {!accountForm.isInformal && (
                          <>
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
                                onChange={(e) =>
                                  setAccountForm({ ...accountForm, emiDueDay: e.target.value })
                                }
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

                            <div>
                              <label className="block mb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                                Monthly EMI *
                              </label>
                              <input
                                type="number"
                                required
                                value={accountForm.emiAmount}
                                onChange={(e) =>
                                  setAccountForm({ ...accountForm, emiAmount: e.target.value })
                                }
                                className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition font-mono"
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
                                setAccountForm({
                                  ...accountForm,
                                  expectedRepaymentDate: e.target.value,
                                })
                              }
                              className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
                            />
                          </div>
                        )}

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

                        {/* Calculated EMI Preview Box */}
                        {emiPreview && !accountForm.isInformal && (
                          <div className="col-span-1 md:col-span-2 bg-primary/10 border border-primary/20 rounded-2xl p-4 space-y-2.5 mt-2">
                            <h4 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                              📋 Calculated EMI Preview (Reducing Balance)
                            </h4>
                            <div className="grid grid-cols-2 gap-4 text-2xs">
                              <div>
                                <span className="text-muted-foreground">
                                  Calculated Monthly EMI
                                </span>
                                <p className="text-sm font-extrabold text-foreground mt-0.5 font-mono">
                                  ₹{emiPreview.emi.toLocaleString('en-IN')}
                                </p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">
                                  Estimated Total Payment
                                </span>
                                <p className="text-sm font-extrabold text-foreground mt-0.5 font-mono">
                                  ₹{emiPreview.totalPayment.toLocaleString('en-IN')}
                                </p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">
                                  Estimated Total Interest
                                </span>
                                <p className="text-sm font-extrabold text-foreground mt-0.5 font-mono">
                                  ₹{emiPreview.totalInterest.toLocaleString('en-IN')}
                                </p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Estimated Payoff Date</span>
                                <p className="text-sm font-extrabold text-foreground mt-0.5">
                                  {emiPreview.endDate}
                                </p>
                              </div>
                            </div>
                            <div className="flex justify-end pt-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setAccountForm({
                                    ...accountForm,
                                    emiAmount: String(emiPreview.emi),
                                  })
                                }
                                className="px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-2xs font-bold hover:bg-primary/90 transition-all"
                              >
                                Apply Calculated EMI
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Advanced settings toggle */}
                        <div className="col-span-1 md:col-span-2 border-t border-border/30 pt-3">
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
                                    setAccountForm({
                                      ...accountForm,
                                      loanAccountNumber: e.target.value,
                                    })
                                  }
                                  placeholder="e.g. 1234-5678-9012"
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
                                    setAccountForm({
                                      ...accountForm,
                                      processingFee: e.target.value,
                                    })
                                  }
                                  placeholder="e.g. 2500"
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
                                    setAccountForm({
                                      ...accountForm,
                                      prepaymentCharges: e.target.value,
                                    })
                                  }
                                  placeholder="e.g. 2.0"
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
                                    setAccountForm({
                                      ...accountForm,
                                      latePaymentCharges: e.target.value,
                                    })
                                  }
                                  placeholder="e.g. 500"
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
                                    setAccountForm({
                                      ...accountForm,
                                      linkedPaymentAccountId: e.target.value,
                                    })
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
                                  onChange={(e) =>
                                    setAccountForm({ ...accountForm, loanStatus: e.target.value })
                                  }
                                  className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
                                >
                                  <option value="active">Active</option>
                                  <option value="paid_off">Paid Off</option>
                                  <option value="closed">Closed</option>
                                  <option value="on_hold">On Hold</option>
                                </select>
                              </div>
                              <div className="flex items-center gap-2 mt-2 col-span-1 md:col-span-2">
                                <input
                                  type="checkbox"
                                  id="autoCreateEmi"
                                  checked={accountForm.autoCreateEmi}
                                  onChange={(e) =>
                                    setAccountForm({
                                      ...accountForm,
                                      autoCreateEmi: e.target.checked,
                                    })
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
                      </>
                    )}

                    {/* Common styles */}
                    <div>
                      <label className="block mb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Color Theme
                      </label>
                      <input
                        type="color"
                        value={accountForm.color}
                        onChange={(e) => setAccountForm({ ...accountForm, color: e.target.value })}
                        className="h-10 w-full rounded-xl border border-border bg-[#0b0f1a] p-1 cursor-pointer"
                      />
                    </div>

                    {editingId && (
                      <div className="sm:col-span-2 bg-[#0b0f1a] border border-border rounded-xl p-3">
                        <p className="text-3xs text-muted-foreground leading-relaxed">
                          Note: Modifying account info here will not edit its balance history. To
                          change the account balance value, please close this form and use the{' '}
                          <span className="font-bold text-foreground">Adjust Balance</span> button
                          next to the account entry.
                        </p>
                      </div>
                    )}

                    <div className="sm:col-span-2 flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="visibleCheckbox"
                        checked={accountForm.visible}
                        onChange={(e) =>
                          setAccountForm({ ...accountForm, visible: e.target.checked })
                        }
                        className="h-4 w-4 rounded border-border text-primary bg-[#0b0f1a] focus:ring-primary"
                      />
                      <label
                        htmlFor="visibleCheckbox"
                        className="text-xs font-semibold text-foreground cursor-pointer"
                      >
                        Display this account on Dashboard (Visibility ON)
                      </label>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:opacity-90 transition"
                    >
                      {editingId ? 'Save Changes' : 'Create Account'}
                    </button>
                    <button
                      type="button"
                      onClick={closeForm}
                      className="px-4 py-2 rounded-xl bg-muted border border-border text-xs font-semibold text-foreground hover:bg-muted/80 transition"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* COLLAPSIBLE CATEGORY SECTIONS (Responsive Layout) */}
            <div className="space-y-4">
              {/* Category 1: Main Accounts */}
              <div className="border border-border rounded-2xl bg-card overflow-hidden shadow-md">
                <div
                  onClick={() => toggleCategoryCollapse('accounts')}
                  className="flex items-center justify-between p-3.5 cursor-pointer hover:bg-muted/10 transition select-none bg-[#0b0f1a]/40"
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <h3 className="text-xs font-black text-foreground tracking-wider flex flex-wrap items-baseline gap-1.5 uppercase leading-tight">
                      <span>MAIN ACCOUNTS</span>
                      <span className="text-2xs font-extrabold text-primary font-mono whitespace-nowrap">
                        (₹{getCategoryAggregateTotal('accounts').toLocaleString('en-IN')})
                      </span>
                    </h3>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => openAddForm('accounts')}
                      className="px-2.5 py-1 rounded-lg border border-primary/20 bg-primary/10 text-primary text-2xs font-bold hover:bg-primary/20 transition flex items-center gap-1"
                    >
                      <span>+</span>
                      <span className="hidden sm:inline">Add Bank Account</span>
                    </button>
                    <span 
                      onClick={() => toggleCategoryCollapse('accounts')}
                      className="text-muted-foreground/60 transition-transform duration-200 cursor-pointer p-1"
                    >
                      {collapsedCategories.accounts ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    </span>
                  </div>
                </div>

                {!collapsedCategories.accounts && (
                  <div className="border-t border-border/30">
                    {/* Mobile list view */}
                    <div className="block md:hidden divide-y divide-border/30">
                      {getProcessedAccounts('accounts').length === 0 ? (
                        <div className="p-4 text-center text-xs text-muted-foreground">
                          No bank accounts matching filters.
                        </div>
                      ) : (
                        getProcessedAccounts('accounts').map((acc) => (
                          <div key={acc.id} className="p-4 space-y-3">
                            <div className="flex justify-between items-start gap-2">
                              <div className="font-bold text-sm flex items-center gap-2 text-foreground">
                                {acc.name}
                                {acc.archived && (
                                  <span className="text-3xs font-bold text-negative border border-negative-subtle bg-negative-subtle px-1 py-0.5 rounded uppercase">
                                    Archived
                                  </span>
                                )}
                              </div>
                              <div className="text-sm font-extrabold text-primary font-mono">
                                ₹{acc.balance.toLocaleString('en-IN')}
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-2xs text-muted-foreground">
                              <div>
                                Bank:{' '}
                                <span className="text-foreground font-medium">
                                  {acc.bankName || '—'}
                                </span>
                              </div>
                              <div>
                                Number:{' '}
                                <span className="text-foreground font-mono">
                                  {acc.accountNumber || '—'}
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border/30">
                              <button
                                onClick={() => {
                                  setAdjustAccount(acc);
                                  setAdjustActualBalance(String(acc.balance));
                                }}
                                className="px-2 py-1 rounded text-3xs font-bold bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition"
                              >
                                Adjust Balance
                              </button>
                              <button
                                onClick={() => openEditForm(acc)}
                                className="p-1.5 rounded bg-muted hover:bg-muted/80 text-foreground transition"
                                title="Edit"
                              >
                                <Edit2 size={12} />
                              </button>
                              <button
                                onClick={() => {
                                  updateAccount(acc.id, { archived: !acc.archived });
                                  refreshAccounts();
                                }}
                                className="p-1.5 rounded bg-muted hover:bg-muted/80 text-warning transition"
                                title={acc.archived ? 'Restore' : 'Archive'}
                              >
                                <Archive size={12} />
                              </button>
                              <button
                                onClick={() => {
                                  updateAccount(acc.id, { visible: acc.visible === false });
                                  refreshAccounts();
                                }}
                                className="p-1.5 rounded bg-muted hover:bg-muted/80 text-foreground transition"
                                title={acc.visible !== false ? 'Hide' : 'Show'}
                              >
                                {acc.visible !== false ? <Eye size={12} /> : <EyeOff size={12} />}
                              </button>
                              <button
                                onClick={() => setDeleteAccountTarget(acc)}
                                className="p-1.5 rounded bg-negative-subtle border border-negative-subtle/30 text-negative hover:bg-negative/20 transition"
                                title="Delete"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Desktop table view */}
                    <div className="hidden md:block overflow-x-auto select-scrollbar">
                      <table className="w-full text-left border-collapse table-fixed min-w-[800px]">
                        <thead className="bg-[#0b0f1a]/80 border-b border-border/60">
                          <tr>
                            <th className="py-2.5 px-4 text-2xs font-bold text-muted-foreground uppercase tracking-wider">
                              Account Name
                            </th>
                            <th
                              className="py-2.5 px-4 text-2xs font-bold text-muted-foreground uppercase tracking-wider"
                              style={{ width: '180px' }}
                            >
                              Bank
                            </th>
                            <th
                              className="py-2.5 px-4 text-2xs font-bold text-muted-foreground uppercase tracking-wider"
                              style={{ width: '150px' }}
                            >
                              Account Number
                            </th>
                            <th
                              className="py-2.5 px-4 text-2xs font-bold text-muted-foreground uppercase tracking-wider text-right"
                              style={{ width: '140px' }}
                            >
                              Balance
                            </th>
                            <th
                              className="py-2.5 px-4 text-2xs font-bold text-muted-foreground uppercase tracking-wider text-center"
                              style={{ width: '300px' }}
                            >
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                          {getProcessedAccounts('accounts').length === 0 ? (
                            <tr>
                              <td
                                colSpan={5}
                                className="py-4 text-center text-xs text-muted-foreground"
                              >
                                No bank accounts matching filters.
                              </td>
                            </tr>
                          ) : (
                            getProcessedAccounts('accounts').map((acc) => (
                              <tr
                                key={acc.id}
                                className="hover:bg-muted/5 transition-colors h-[48px]"
                              >
                                <td className="py-2 px-4 text-xs font-semibold text-foreground truncate">
                                  <div className="flex items-center gap-2">
                                    {acc.name}
                                    {acc.archived && (
                                      <span className="text-3xs font-bold text-negative border border-negative-subtle bg-negative-subtle px-1 py-0.5 rounded uppercase">
                                        Archived
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2 px-4 text-xs text-foreground/90 truncate">
                                  {acc.bankName || '—'}
                                </td>
                                <td className="py-2 px-4 text-xs text-muted-foreground font-mono truncate">
                                  {acc.accountNumber || '—'}
                                </td>
                                <td className="py-2 px-4 text-xs font-bold text-right text-primary font-mono tabular-nums">
                                  ₹{acc.balance.toLocaleString('en-IN')}
                                </td>
                                <td className="py-2 px-4 text-center">
                                  <div className="flex items-center justify-center gap-2">
                                    <button
                                      onClick={() => {
                                        setAdjustAccount(acc);
                                        setAdjustActualBalance(String(acc.balance));
                                      }}
                                      className="px-2 py-1 rounded text-2xs font-bold bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition"
                                    >
                                      Adjust Balance
                                    </button>
                                    <button
                                      onClick={() => openEditForm(acc)}
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
                                      {acc.visible !== false ? (
                                        <Eye size={12} />
                                      ) : (
                                        <EyeOff size={12} />
                                      )}
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
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Category 2: Cash Accounts */}
              <div className="border border-border rounded-2xl bg-card overflow-hidden shadow-md">
                <div
                  onClick={() => toggleCategoryCollapse('cash')}
                  className="flex items-center justify-between p-3.5 cursor-pointer hover:bg-muted/10 transition select-none bg-[#0b0f1a]/40"
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <h3 className="text-xs font-black text-foreground tracking-wider flex flex-wrap items-baseline gap-1.5 uppercase leading-tight">
                      <span>CASH ACCOUNTS</span>
                      <span className="text-2xs font-extrabold text-positive font-mono whitespace-nowrap">
                        (₹{getCategoryAggregateTotal('cash').toLocaleString('en-IN')})
                      </span>
                    </h3>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => openAddForm('cash')}
                      className="px-2.5 py-1 rounded-lg border border-positive/20 bg-positive/10 text-positive text-2xs font-bold hover:bg-positive/20 transition flex items-center gap-1"
                    >
                      <span>+</span>
                      <span className="hidden sm:inline">Add Cash Account</span>
                    </button>
                    <span 
                      onClick={() => toggleCategoryCollapse('cash')}
                      className="text-muted-foreground/60 transition-transform duration-200 cursor-pointer p-1"
                    >
                      {collapsedCategories.cash ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    </span>
                  </div>
                </div>

                {!collapsedCategories.cash && (
                  <div className="border-t border-border/30">
                    {/* Mobile list view */}
                    <div className="block md:hidden divide-y divide-border/30">
                      {getProcessedAccounts('cash').length === 0 ? (
                        <div className="p-4 text-center text-xs text-muted-foreground">
                          No cash accounts matching filters.
                        </div>
                      ) : (
                        getProcessedAccounts('cash').map((acc) => (
                          <div key={acc.id} className="p-4 space-y-3">
                            <div className="flex justify-between items-start gap-2">
                              <div className="font-bold text-sm flex items-center gap-2 text-foreground">
                                {acc.name}
                                {acc.archived && (
                                  <span className="text-3xs font-bold text-negative border border-negative-subtle bg-negative-subtle px-1 py-0.5 rounded uppercase">
                                    Archived
                                  </span>
                                )}
                              </div>
                              <div className="text-sm font-extrabold text-positive font-mono">
                                ₹{acc.balance.toLocaleString('en-IN')}
                              </div>
                            </div>
                            <div className="text-2xs text-muted-foreground truncate">
                              Notes:{' '}
                              <span className="text-foreground font-medium">
                                {acc.notes || '—'}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border/30">
                              <button
                                onClick={() => {
                                  setAdjustAccount(acc);
                                  setAdjustActualBalance(String(acc.balance));
                                }}
                                className="px-2 py-1 rounded text-3xs font-bold bg-positive/10 border border-positive/20 text-positive hover:bg-positive/20 transition"
                              >
                                Adjust Balance
                              </button>
                              <button
                                onClick={() => openEditForm(acc)}
                                className="p-1.5 rounded bg-muted hover:bg-muted/80 text-foreground transition"
                                title="Edit"
                              >
                                <Edit2 size={12} />
                              </button>
                              <button
                                onClick={() => {
                                  updateAccount(acc.id, { archived: !acc.archived });
                                  refreshAccounts();
                                }}
                                className="p-1.5 rounded bg-muted hover:bg-muted/80 text-warning transition"
                                title={acc.archived ? 'Restore' : 'Archive'}
                              >
                                <Archive size={12} />
                              </button>
                              <button
                                onClick={() => {
                                  updateAccount(acc.id, { visible: acc.visible === false });
                                  refreshAccounts();
                                }}
                                className="p-1.5 rounded bg-muted hover:bg-muted/80 text-foreground transition"
                                title={acc.visible !== false ? 'Hide' : 'Show'}
                              >
                                {acc.visible !== false ? <Eye size={12} /> : <EyeOff size={12} />}
                              </button>
                              <button
                                onClick={() => setDeleteAccountTarget(acc)}
                                className="p-1.5 rounded bg-negative-subtle border border-negative-subtle/30 text-negative hover:bg-negative/20 transition"
                                title="Delete"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Desktop table view */}
                    <div className="hidden md:block overflow-x-auto select-scrollbar">
                      <table className="w-full text-left border-collapse table-fixed min-w-[800px]">
                        <thead className="bg-[#0b0f1a]/80 border-b border-border/60">
                          <tr>
                            <th className="py-2.5 px-4 text-2xs font-bold text-muted-foreground uppercase tracking-wider">
                              Account Name
                            </th>
                            <th className="py-2.5 px-4 text-2xs font-bold text-muted-foreground uppercase tracking-wider">
                              Remarks / Notes
                            </th>
                            <th
                              className="py-2.5 px-4 text-2xs font-bold text-muted-foreground uppercase tracking-wider text-right"
                              style={{ width: '140px' }}
                            >
                              Balance
                            </th>
                            <th
                              className="py-2.5 px-4 text-2xs font-bold text-muted-foreground uppercase tracking-wider text-center"
                              style={{ width: '300px' }}
                            >
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                          {getProcessedAccounts('cash').length === 0 ? (
                            <tr>
                              <td
                                colSpan={4}
                                className="py-4 text-center text-xs text-muted-foreground"
                              >
                                No cash accounts matching filters.
                              </td>
                            </tr>
                          ) : (
                            getProcessedAccounts('cash').map((acc) => (
                              <tr
                                key={acc.id}
                                className="hover:bg-muted/5 transition-colors h-[48px]"
                              >
                                <td className="py-2 px-4 text-xs font-semibold text-foreground truncate">
                                  <div className="flex items-center gap-2">
                                    {acc.name}
                                    {acc.archived && (
                                      <span className="text-3xs font-bold text-negative border border-negative-subtle bg-negative-subtle px-1 py-0.5 rounded uppercase">
                                        Archived
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2 px-4 text-xs text-foreground/90 truncate">
                                  {acc.notes || '—'}
                                </td>
                                <td className="py-2 px-4 text-xs font-bold text-right text-positive font-mono tabular-nums">
                                  ₹{acc.balance.toLocaleString('en-IN')}
                                </td>
                                <td className="py-2 px-4 text-center">
                                  <div className="flex items-center justify-center gap-2">
                                    <button
                                      onClick={() => {
                                        setAdjustAccount(acc);
                                        setAdjustActualBalance(String(acc.balance));
                                      }}
                                      className="px-2 py-1 rounded text-2xs font-bold bg-positive/10 border border-positive/20 text-positive hover:bg-positive/20 transition"
                                    >
                                      Adjust Balance
                                    </button>
                                    <button
                                      onClick={() => openEditForm(acc)}
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
                                      {acc.visible !== false ? (
                                        <Eye size={12} />
                                      ) : (
                                        <EyeOff size={12} />
                                      )}
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
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Category 3: Credit Cards */}
              <div className="border border-border rounded-2xl bg-card overflow-hidden shadow-md">
                <div
                  onClick={() => toggleCategoryCollapse('credit')}
                  className="flex items-center justify-between p-3.5 cursor-pointer hover:bg-muted/10 transition select-none bg-[#0b0f1a]/40"
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <h3 className="text-xs font-black text-foreground tracking-wider flex flex-wrap items-baseline gap-1.5 uppercase leading-tight">
                      <span>CREDIT CARDS</span>
                      <span className="text-2xs font-extrabold text-amber-500 font-mono whitespace-nowrap">
                        (₹{getCategoryAggregateTotal('credit').toLocaleString('en-IN')} Outstanding)
                      </span>
                    </h3>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => openAddForm('credit')}
                      className="px-2.5 py-1 rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-500 text-2xs font-bold hover:bg-amber-500/20 transition flex items-center gap-1"
                    >
                      <span>+</span>
                      <span className="hidden sm:inline">Add Credit Card</span>
                    </button>
                    <span 
                      onClick={() => toggleCategoryCollapse('credit')}
                      className="text-muted-foreground/60 transition-transform duration-200 cursor-pointer p-1"
                    >
                      {collapsedCategories.credit ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    </span>
                  </div>
                </div>

                {!collapsedCategories.credit && (
                  <div className="border-t border-border/30">
                    {/* Mobile list view */}
                    <div className="block md:hidden divide-y divide-border/30">
                      {getProcessedAccounts('credit').length === 0 ? (
                        <div className="p-4 text-center text-xs text-muted-foreground">
                          No credit cards matching filters.
                        </div>
                      ) : (
                        getProcessedAccounts('credit').map((acc) => {
                          const outstanding = Math.abs(acc.balance);
                          const limit = acc.creditLimit || 0;
                          const avail = Math.max(0, limit - outstanding);
                          return (
                            <div key={acc.id} className="p-4 space-y-3">
                              <div className="flex justify-between items-start gap-2">
                                <div className="font-bold text-sm flex items-center gap-2 text-foreground">
                                  {acc.name}
                                  {acc.archived && (
                                    <span className="text-3xs font-bold text-negative border border-negative-subtle bg-negative-subtle px-1 py-0.5 rounded uppercase">
                                      Archived
                                    </span>
                                  )}
                                </div>
                                <div className="text-sm font-extrabold text-amber-500 font-mono">
                                  ₹{outstanding.toLocaleString('en-IN')}
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-2xs text-muted-foreground">
                                <div>
                                  Limit:{' '}
                                  <span className="text-foreground font-mono">
                                    ₹{limit.toLocaleString('en-IN')}
                                  </span>
                                </div>
                                <div>
                                  Available:{' '}
                                  <span className="text-positive font-mono">
                                    ₹{avail.toLocaleString('en-IN')}
                                  </span>
                                </div>
                                <div>
                                  Cycle:{' '}
                                  <span className="text-foreground font-medium">
                                    {acc.billingCycle || '—'}
                                  </span>
                                </div>
                                <div>
                                  Due:{' '}
                                  <span className="text-foreground font-medium">
                                    {acc.dueDate || '—'}
                                  </span>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border/30">
                                <button
                                  onClick={() => {
                                    setAdjustAccount(acc);
                                    setAdjustActualBalance(String(outstanding));
                                  }}
                                  className="px-2 py-1 rounded text-3xs font-bold bg-amber-500/10 border border-amber-500/20 text-amber-500 hover:bg-amber-500/20 transition"
                                >
                                  Adjust Balance
                                </button>
                                <button
                                  onClick={() => openEditForm(acc)}
                                  className="p-1.5 rounded bg-muted hover:bg-muted/80 text-foreground transition"
                                  title="Edit"
                                >
                                  <Edit2 size={12} />
                                </button>
                                <button
                                  onClick={() => {
                                    updateAccount(acc.id, { archived: !acc.archived });
                                    refreshAccounts();
                                  }}
                                  className="p-1.5 rounded bg-muted hover:bg-muted/80 text-warning transition"
                                  title={acc.archived ? 'Restore' : 'Archive'}
                                >
                                  <Archive size={12} />
                                </button>
                                <button
                                  onClick={() => {
                                    updateAccount(acc.id, { visible: acc.visible === false });
                                    refreshAccounts();
                                  }}
                                  className="p-1.5 rounded bg-muted hover:bg-muted/80 text-foreground transition"
                                  title={acc.visible !== false ? 'Hide' : 'Show'}
                                >
                                  {acc.visible !== false ? <Eye size={12} /> : <EyeOff size={12} />}
                                </button>
                                <button
                                  onClick={() => setDeleteAccountTarget(acc)}
                                  className="p-1.5 rounded bg-negative-subtle border border-negative-subtle/30 text-negative hover:bg-negative/20 transition"
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

                    {/* Desktop table view */}
                    <div className="hidden md:block overflow-x-auto select-scrollbar">
                      <table className="w-full text-left border-collapse table-fixed min-w-[900px]">
                        <thead className="bg-[#0b0f1a]/80 border-b border-border/60">
                          <tr>
                            <th className="py-2.5 px-4 text-2xs font-bold text-muted-foreground uppercase tracking-wider">
                              Card Name
                            </th>
                            <th
                              className="py-2.5 px-4 text-2xs font-bold text-muted-foreground uppercase tracking-wider"
                              style={{ width: '130px' }}
                            >
                              Limit
                            </th>
                            <th
                              className="py-2.5 px-4 text-2xs font-bold text-muted-foreground uppercase tracking-wider"
                              style={{ width: '130px' }}
                            >
                              Available
                            </th>
                            <th
                              className="py-2.5 px-4 text-2xs font-bold text-muted-foreground uppercase tracking-wider"
                              style={{ width: '110px' }}
                            >
                              Billing Cycle
                            </th>
                            <th
                              className="py-2.5 px-4 text-2xs font-bold text-muted-foreground uppercase tracking-wider"
                              style={{ width: '110px' }}
                            >
                              Due Date
                            </th>
                            <th
                              className="py-2.5 px-4 text-2xs font-bold text-muted-foreground uppercase tracking-wider text-right"
                              style={{ width: '130px' }}
                            >
                              Outstanding
                            </th>
                            <th
                              className="py-2.5 px-4 text-2xs font-bold text-muted-foreground uppercase tracking-wider text-center"
                              style={{ width: '300px' }}
                            >
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                          {getProcessedAccounts('credit').length === 0 ? (
                            <tr>
                              <td
                                colSpan={7}
                                className="py-4 text-center text-xs text-muted-foreground"
                              >
                                No credit cards matching filters.
                              </td>
                            </tr>
                          ) : (
                            getProcessedAccounts('credit').map((acc) => {
                              const outstanding = Math.abs(acc.balance);
                              const limit = acc.creditLimit || 0;
                              const avail = Math.max(0, limit - outstanding);
                              return (
                                <tr
                                  key={acc.id}
                                  className="hover:bg-muted/5 transition-colors h-[48px]"
                                >
                                  <td className="py-2 px-4 text-xs font-semibold text-foreground truncate">
                                    <div className="flex items-center gap-2">
                                      {acc.name}
                                      {acc.archived && (
                                        <span className="text-3xs font-bold text-negative border border-negative-subtle bg-negative-subtle px-1 py-0.5 rounded uppercase">
                                          Archived
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2 px-4 text-xs font-mono text-foreground/90">
                                    ₹{limit.toLocaleString('en-IN')}
                                  </td>
                                  <td className="py-2 px-4 text-xs font-mono text-positive">
                                    ₹{avail.toLocaleString('en-IN')}
                                  </td>
                                  <td className="py-2 px-4 text-xs text-foreground/90 truncate">
                                    {acc.billingCycle || '—'}
                                  </td>
                                  <td className="py-2 px-4 text-xs text-foreground/90 truncate">
                                    {acc.dueDate || '—'}
                                  </td>
                                  <td className="py-2 px-4 text-xs font-bold text-right text-amber-500 font-mono tabular-nums">
                                    ₹{outstanding.toLocaleString('en-IN')}
                                  </td>
                                  <td className="py-2 px-4 text-center">
                                    <div className="flex items-center justify-center gap-2">
                                      <button
                                        onClick={() => {
                                          setAdjustAccount(acc);
                                          setAdjustActualBalance(String(outstanding));
                                        }}
                                        className="px-2 py-1 rounded text-2xs font-bold bg-amber-500/10 border border-amber-500/20 text-amber-500 hover:bg-amber-500/20 transition"
                                      >
                                        Adjust Balance
                                      </button>
                                      <button
                                        onClick={() => openEditForm(acc)}
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
                                        {acc.visible !== false ? (
                                          <Eye size={12} />
                                        ) : (
                                          <EyeOff size={12} />
                                        )}
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
                )}
              </div>

              {/* Category 4: Loan Accounts */}
              <div className="border border-border rounded-2xl bg-card overflow-hidden shadow-md">
                <div
                  onClick={() => toggleCategoryCollapse('loan')}
                  className="flex items-center justify-between p-3.5 cursor-pointer hover:bg-muted/10 transition select-none bg-[#0b0f1a]/40"
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <h3 className="text-xs font-black text-foreground tracking-wider flex flex-wrap items-baseline gap-1.5 uppercase leading-tight">
                      <span>LOAN ACCOUNTS</span>
                      <span className="text-2xs font-extrabold text-negative font-mono whitespace-nowrap">
                        (₹{getCategoryAggregateTotal('loan').toLocaleString('en-IN')} Outstanding)
                      </span>
                    </h3>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => openAddForm('loan')}
                      className="px-2.5 py-1 rounded-lg border border-negative/20 bg-negative/10 text-negative text-2xs font-bold hover:bg-negative/20 transition flex items-center gap-1"
                    >
                      <span>+</span>
                      <span className="hidden sm:inline">Add Loan Account</span>
                    </button>
                    <span 
                      onClick={() => toggleCategoryCollapse('loan')}
                      className="text-muted-foreground/60 transition-transform duration-200 cursor-pointer p-1"
                    >
                      {collapsedCategories.loan ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    </span>
                  </div>
                </div>

                {!collapsedCategories.loan && (
                  <div className="border-t border-border/30">
                    {/* Mobile list view */}
                    <div className="block md:hidden divide-y divide-border/30">
                      {getProcessedAccounts('loan').length === 0 ? (
                        <div className="p-4 text-center text-xs text-muted-foreground">
                          No loan accounts matching filters.
                        </div>
                      ) : (
                        getProcessedAccounts('loan').map((acc) => {
                          const outstanding = Math.abs(acc.balance);
                          const totalLiability = outstanding + (acc.accruedInterest || 0);
                          return (
                            <div key={acc.id} className="p-4 space-y-3">
                              <div className="flex justify-between items-start gap-2">
                                <div className="font-bold text-sm flex flex-col gap-0.5 text-foreground">
                                  <span>{acc.name}</span>
                                  <span className="text-3xs text-muted-foreground font-normal">
                                    Lender: {acc.lenderName || 'Unknown'} | Status:{' '}
                                    <span className="capitalize font-semibold text-primary">
                                      {(acc.loanStatus || 'active').replace('_', ' ')}
                                    </span>
                                  </span>
                                </div>
                                <div className="text-right flex flex-col items-end">
                                  <span className="text-sm font-extrabold text-negative font-mono">
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
                                  Principal:{' '}
                                  <span className="text-foreground font-mono">
                                    ₹{(acc.originalAmount || 0).toLocaleString('en-IN')}
                                  </span>
                                </div>
                                <div>
                                  EMI:{' '}
                                  <span className="text-negative font-mono">
                                    ₹{(acc.emiAmount || 0).toLocaleString('en-IN')}
                                  </span>
                                </div>
                                <div>
                                  Interest Rate:{' '}
                                  <span className="text-foreground font-mono">
                                    {acc.interestRate ? `${acc.interestRate}%` : '—'}
                                  </span>
                                </div>
                                <div>
                                  Next Due Date:{' '}
                                  <span className="text-foreground font-medium">
                                    {acc.dueDate || '—'}
                                  </span>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border/30">
                                <button
                                  onClick={() => {
                                    setActiveLoanDetails(acc);
                                  }}
                                  className="px-2.5 py-1 rounded text-3xs font-bold bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition"
                                >
                                  View Details
                                </button>
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
                                <button
                                  onClick={() => openEditForm(acc)}
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

                    {/* Desktop table view */}
                    <div className="hidden md:block overflow-x-auto select-scrollbar">
                      <table className="w-full text-left border-collapse table-fixed min-w-[950px]">
                        <thead className="bg-[#0b0f1a]/80 border-b border-border/60">
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
                          {getProcessedAccounts('loan').length === 0 ? (
                            <tr>
                              <td
                                colSpan={8}
                                className="py-4 text-center text-xs text-muted-foreground"
                              >
                                No loan accounts matching filters.
                              </td>
                            </tr>
                          ) : (
                            getProcessedAccounts('loan').map((acc) => {
                              const outstanding = Math.abs(acc.balance);
                              const totalLiability = outstanding + (acc.accruedInterest || 0);
                              return (
                                <tr
                                  key={acc.id}
                                  className="hover:bg-muted/5 transition-colors h-[48px]"
                                >
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
                                    ₹{(acc.emiAmount || 0).toLocaleString('en-IN')}
                                  </td>
                                  <td className="py-2 px-4 text-xs text-foreground/90 font-mono">
                                    {acc.interestRate ? `${acc.interestRate}%` : '—'}
                                  </td>
                                  <td className="py-2 px-4 text-xs text-foreground/90 truncate">
                                    {acc.dueDate || '—'}
                                  </td>
                                  <td className="py-2 px-4 text-xs truncate">
                                    <span className="capitalize font-semibold text-primary">
                                      {(acc.loanStatus || 'active').replace('_', ' ')}
                                    </span>
                                  </td>
                                  <td className="py-2 px-4 text-xs font-bold text-right text-negative font-mono tabular-nums">
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
                                        onClick={() => {
                                          setActiveLoanDetails(acc);
                                        }}
                                        className="px-2 py-1 rounded text-2xs font-bold bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition"
                                      >
                                        View Details
                                      </button>
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
                                      <button
                                        onClick={() => openEditForm(acc)}
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
                                        {acc.visible !== false ? (
                                          <Eye size={12} />
                                        ) : (
                                          <EyeOff size={12} />
                                        )}
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
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab Categories: Category Settings */}
        {activeTab === 'categories' && (
          <div className="space-y-6 transition-all duration-300">
            <CategorySettingsInner />
          </div>
        )}

        {/* Tab 2: General Preferences */}
        {activeTab === 'general' && (
          <div className="bg-card border border-border rounded-2xl p-6 space-y-6 transition-all duration-300">
            <div>
              <h2 className="text-lg font-semibold text-foreground">General Preferences</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Set application theme, localization currencies, and budget cycles.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Currency
                </label>
                <select
                  value={currency}
                  onChange={(e) => {
                    setCurrency(e.target.value);
                    saveSetting('wealthiq_currency', e.target.value);
                  }}
                  className="w-full rounded-xl border border-border bg-[#0b0f1a] p-3 text-slate-200 focus:outline-none focus:border-primary transition-all font-medium text-sm"
                >
                  <option value="INR">₹ Indian Rupee (INR)</option>
                  <option value="USD">$ US Dollar (USD)</option>
                  <option value="EUR">€ Euro (EUR)</option>
                  <option value="GBP">£ British Pound (GBP)</option>
                  <option value="JPY">¥ Japanese Yen (JPY)</option>
                </select>
              </div>

              <div>
                <label className="block mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Theme
                </label>
                <select
                  value={theme}
                  onChange={(e) => {
                    setTheme(e.target.value);
                    saveSetting('wealthiq_theme', e.target.value);
                  }}
                  className="w-full rounded-xl border border-border bg-[#0b0f1a] p-3 text-slate-200 focus:outline-none focus:border-primary transition-all font-semibold text-sm"
                >
                  <option value="dark">🖤 Default Dark</option>
                  <option value="light">🤍 Light Mode</option>
                  <option value="system">⚙️ System Default</option>
                  <option value="theme-midnight-blue">🌌 Midnight Blue</option>
                  <option value="theme-emerald-green">💚 Emerald Green</option>
                  <option value="theme-royal-purple">💜 Royal Purple</option>
                  <option value="theme-sunset-orange">🧡 Sunset Orange</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Budget Month Start Day
                </label>
                <input
                  type="number"
                  min="1"
                  max="28"
                  value={budgetStartDay}
                  onChange={(e) => {
                    setBudgetStartDay(Number(e.target.value));
                    saveSetting('wealthiq_budget_start_day', e.target.value);
                  }}
                  className="w-full rounded-xl border border-border bg-[#0b0f1a] p-3 text-slate-200 focus:outline-none focus:border-primary transition-all text-sm font-medium"
                />
                <p className="text-2xs text-muted-foreground mt-1.5">
                  Choose the day of the month when your budgets should reset (e.g. your salary day).
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Backup & Reset */}
        {activeTab === 'system' && (
          <div className="space-y-6 transition-all duration-300">
            <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Backup & Sync</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Export your database file locally or restore a previous data state.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={exportBackup}
                  className="px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-semibold hover:opacity-90 shadow-lg shadow-primary/10 transition"
                >
                  Export Backup File
                </button>
                <label className="px-4 py-2.5 rounded-xl bg-muted border border-border cursor-pointer hover:bg-muted/80 text-xs font-semibold text-foreground transition">
                  Import Backup File
                  <input type="file" accept=".json" hidden onChange={importBackup} />
                </label>
              </div>
            </div>

            <div className="bg-card border border-red-500/30 rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2 text-red-400">
                <h2 className="text-lg font-semibold">Danger Zone</h2>
              </div>
              <p className="text-muted-foreground text-xs leading-relaxed max-w-2xl">
                Permanently erase all transaction histories, category structures, budget limits,
                savings goals, and custom user options. This action cannot be reversed.
              </p>
              <button
                onClick={() => setIsResetModalOpen(true)}
                className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition"
              >
                Reset All Local Storage Data
              </button>
            </div>
          </div>
        )}

        {/* Tab 4: Budget Settings */}
        {activeTab === 'budgets' && (
          <div className="space-y-6 transition-all duration-300">
            {/* Global Settings Card */}
            <div className="bg-card border border-border rounded-2xl p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Global Budget Options</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Configure default policies for monthly budgets generation and roll-overs.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Auto Create */}
                <div className="flex items-center justify-between p-4 border border-border/60 bg-[#0b0f1a]/20 rounded-xl">
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-slate-200">
                      Auto-create Monthly Budgets
                    </p>
                    <p className="text-3xs text-muted-foreground">
                      Automatically initialize next month from the default template
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={globalSettings.autoCreate}
                    onChange={(e) => handleToggleGlobalSetting('autoCreate', e.target.checked)}
                    className="h-4 w-4 rounded border-border bg-[#0b0f1a] text-primary focus:ring-primary/20 cursor-pointer"
                  />
                </div>

                {/* Carry limits */}
                <div className="flex items-center justify-between p-4 border border-border/60 bg-[#0b0f1a]/20 rounded-xl">
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-slate-200">Carry Forward Limits</p>
                    <p className="text-3xs text-muted-foreground">
                      Keep the same target allocation sizes for the next month
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={globalSettings.carryLimits}
                    onChange={(e) => handleToggleGlobalSetting('carryLimits', e.target.checked)}
                    className="h-4 w-4 rounded border-border bg-[#0b0f1a] text-primary focus:ring-primary/20 cursor-pointer"
                  />
                </div>

                {/* Carry unused */}
                <div className="flex items-center justify-between p-4 border border-border/60 bg-[#0b0f1a]/20 rounded-xl">
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-slate-200">
                      Carry Forward Unused Budgets
                    </p>
                    <p className="text-3xs text-muted-foreground">
                      Add left-over savings from last month to next {"month's"} limits
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={globalSettings.carryUnused}
                    onChange={(e) => handleToggleGlobalSetting('carryUnused', e.target.checked)}
                    className="h-4 w-4 rounded border-border bg-[#0b0f1a] text-primary focus:ring-primary/20 cursor-pointer"
                  />
                </div>

                {/* Carry overspending */}
                <div className="flex items-center justify-between p-4 border border-border/60 bg-[#0b0f1a]/20 rounded-xl">
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-slate-200">
                      Carry Forward Overspending
                    </p>
                    <p className="text-3xs text-muted-foreground">
                      Deduct last {"month's"} breaches from next {"month's"} allocations
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={globalSettings.carryOverspending}
                    onChange={(e) =>
                      handleToggleGlobalSetting('carryOverspending', e.target.checked)
                    }
                    className="h-4 w-4 rounded border-border bg-[#0b0f1a] text-primary focus:ring-primary/20 cursor-pointer"
                  />
                </div>

                {/* Scope Selection */}
                <div className="md:col-span-2 space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Default Budget Scope
                  </label>
                  <select
                    value={globalSettings.scope}
                    onChange={(e) => handleToggleGlobalSetting('scope', e.target.value)}
                    className="w-full rounded-xl border border-border bg-[#0b0f1a] p-3 text-slate-200 focus:outline-none focus:border-primary transition-all text-sm font-medium"
                  >
                    <option value="all">All Accounts (Consolidated)</option>
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        Only {acc.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-3xs text-muted-foreground">
                    Define whether default category budget limits apply to all accounts combined or
                    a specific account.
                  </p>
                </div>
              </div>
            </div>

            {/* Template List Card */}
            <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    Default Category Targets
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Configure standard target allocations used as templates for monthly limits.
                  </p>
                </div>
                <button
                  onClick={handleOpenAddTemplate}
                  className="flex items-center gap-1.5 px-3 py-2 bg-primary hover:bg-primary/95 text-xs font-semibold text-white rounded-xl transition shadow"
                >
                  <Plus size={13} />
                  Add Template
                </button>
              </div>

              {templates.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-border rounded-xl">
                  <p className="text-xs text-muted-foreground">
                    No category budget templates set yet.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {templates.map((t) => (
                    <div
                      key={t.id}
                      className="border border-border/80 bg-[#0b0f1a]/40 rounded-xl p-4 flex flex-col justify-between gap-3 hover:border-primary/20 transition-all"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="text-sm font-bold text-slate-200">{t.category}</h4>
                          <span
                            className={`inline-block text-3xs px-2 py-0.5 rounded-full mt-1 font-semibold ${
                              t.enabled
                                ? 'bg-positive/10 text-positive'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {t.enabled ? 'Template Enabled' : 'Disabled'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleOpenEditTemplate(t)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted text-slate-400 hover:text-primary transition-all"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            onClick={() => handleDeleteTemplate(t.id)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted text-slate-400 hover:text-negative transition-all"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                      <div className="flex items-end justify-between border-t border-border/40 pt-2 mt-1">
                        <div>
                          <p className="text-3xs text-muted-foreground">Default Target</p>
                          <p className="text-sm font-black text-slate-200 tabular-nums">
                            ₹{t.defaultAmount.toLocaleString('en-IN')}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-3xs text-muted-foreground">Notifications</p>
                          <p className="text-3xs font-medium text-slate-300">
                            {t.notifications && t.notifications.length > 0
                              ? t.notifications.map((n: number) => `${n}%`).join(', ')
                              : 'None'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Template Dialog Modal */}
            <Modal
              isOpen={isTemplateModalOpen}
              onClose={() => setIsTemplateModalOpen(false)}
              title={
                editingTemplate ? 'Edit Category Budget Template' : 'Configure New Default Budget'
              }
              description={
                editingTemplate
                  ? 'Edit standard limit configurations'
                  : 'Create standard templates for monthly allocations'
              }
            >
              <form onSubmit={handleSaveTemplate} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    Category
                  </label>
                  <select
                    value={templateFormData.category}
                    onChange={(e) =>
                      setTemplateFormData({ ...templateFormData, category: e.target.value })
                    }
                    required
                    disabled={!!editingTemplate}
                    className="w-full rounded-lg border border-border bg-[#0b0f1a] p-2.5 text-sm text-slate-200 focus:outline-none focus:border-primary transition-all font-medium disabled:opacity-60"
                  >
                    {categories
                      .filter((c) => c.type === 'expense')
                      .map((cat) => (
                        <option key={cat.id} value={cat.name}>
                          {cat.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    Default Target Limit Amount (₹)
                  </label>
                  <input
                    type="number"
                    value={templateFormData.defaultAmount}
                    onChange={(e) =>
                      setTemplateFormData({ ...templateFormData, defaultAmount: e.target.value })
                    }
                    placeholder="e.g. 15000"
                    required
                    min="1"
                    className="w-full rounded-lg border border-border bg-[#0b0f1a] p-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-primary transition-all font-semibold"
                  />
                </div>

                {/* Notifications Threshold checkbox multi-select */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    Notification Thresholds
                  </label>
                  <div className="grid grid-cols-2 gap-2 p-3 border border-border/80 bg-[#0b0f1a]/40 rounded-xl">
                    {[50, 80, 100, 120].map((pct) => {
                      const label = pct === 120 ? 'Exceeded (>100%)' : `${pct}% Limit`;
                      const isChecked = templateFormData.notifications.includes(pct);
                      return (
                        <label
                          key={pct}
                          className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              const updated = e.target.checked
                                ? [...templateFormData.notifications, pct].sort((a, b) => a - b)
                                : templateFormData.notifications.filter((n) => n !== pct);
                              setTemplateFormData({ ...templateFormData, notifications: updated });
                            }}
                            className="h-3.5 w-3.5 rounded border-border bg-[#0b0f1a] text-primary focus:ring-primary/20"
                          />
                          <span>{label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Carry Forward Options */}
                <div className="flex items-center justify-between p-3 border border-border/80 bg-[#0b0f1a]/40 rounded-xl">
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-slate-200">
                      Carry Forward Remaining Limits
                    </p>
                    <p className="text-3xs text-muted-foreground">
                      Carry unused budget sizes into the next cycles
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={templateFormData.carryForward}
                    onChange={(e) =>
                      setTemplateFormData({ ...templateFormData, carryForward: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-border bg-[#0b0f1a] text-primary focus:ring-primary/20 cursor-pointer"
                  />
                </div>

                {/* Enabled */}
                <div className="flex items-center justify-between p-3 border border-border/80 bg-[#0b0f1a]/40 rounded-xl">
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-slate-200">Template Enabled</p>
                    <p className="text-3xs text-muted-foreground">
                      Keep this template active during auto-creations
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={templateFormData.enabled}
                    onChange={(e) =>
                      setTemplateFormData({ ...templateFormData, enabled: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-border bg-[#0b0f1a] text-primary focus:ring-primary/20 cursor-pointer"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsTemplateModalOpen(false)}
                    className="px-4 py-2 border border-border bg-[#0b0f1a] hover:bg-muted text-xs font-semibold text-foreground rounded-lg transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-primary hover:bg-primary/95 text-xs font-semibold text-primary-foreground rounded-lg transition-all"
                  >
                    Save Template
                  </button>
                </div>
              </form>
            </Modal>
          </div>
        )}
      </div>

      {/* Adjust Balance Modal */}
      {adjustAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              Adjust Account Balance
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <p className="text-3xs text-muted-foreground uppercase font-bold tracking-wider">
                  Account Name
                </p>
                <p className="text-sm font-semibold text-foreground mt-0.5">{adjustAccount.name}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-3xs text-muted-foreground uppercase font-bold tracking-wider">
                    Current Balance
                  </p>
                  <p className="text-sm font-bold text-foreground mt-0.5">
                    ₹{Math.abs(adjustAccount.balance).toLocaleString('en-IN')}
                  </p>
                </div>
                <div>
                  <p className="text-3xs text-muted-foreground uppercase font-bold tracking-wider">
                    Difference
                  </p>
                  <p
                    className={`text-sm font-bold mt-0.5 font-mono ${adjustDifference === 0 ? 'text-slate-400' : adjustDifference > 0 ? 'text-positive' : 'text-negative'}`}
                  >
                    {adjustDifference > 0 ? '+' : ''}
                    {adjustDifference.toLocaleString('en-IN')}
                  </p>
                </div>
              </div>

              <div>
                <label className="block mb-1 text-3xs text-muted-foreground uppercase font-bold tracking-wider">
                  Actual Balance
                </label>
                <input
                  type="number"
                  value={adjustActualBalance}
                  onChange={(e) => setAdjustActualBalance(e.target.value)}
                  placeholder="Enter current actual balance..."
                  className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-sm font-semibold text-foreground focus:outline-none focus:border-primary transition"
                />
              </div>

              <div className="space-y-2.5 pt-2 border-t border-border/40">
                <p className="text-3xs text-muted-foreground uppercase font-bold tracking-wider">
                  How should this adjustment be handled?
                </p>

                {/* Option 1 */}
                <label className="flex items-start gap-2.5 p-2 rounded-lg border border-border bg-[#0b0f1a]/40 hover:bg-muted/10 cursor-pointer transition">
                  <input
                    type="radio"
                    name="adjustOpt"
                    checked={adjustOption === 1}
                    onChange={() => {
                      setAdjustOption(1);
                      setShowWarningDialog(false);
                    }}
                    className="mt-1"
                  />
                  <div>
                    <p className="text-2xs font-bold text-foreground">
                      Create Adjustment Transaction (Recommended)
                    </p>
                    <p className="text-3xs text-muted-foreground leading-tight mt-0.5">
                      Creates a balance adjustment entry under the {"'Adjustment'"} category to keep
                      transaction history accurate.
                    </p>
                  </div>
                </label>

                {/* Option 2 */}
                <label className="flex items-start gap-2.5 p-2 rounded-lg border border-border bg-[#0b0f1a]/40 hover:bg-muted/10 cursor-pointer transition">
                  <input
                    type="radio"
                    name="adjustOpt"
                    checked={adjustOption === 2}
                    onChange={() => {
                      setAdjustOption(2);
                      setShowWarningDialog(false);
                    }}
                    className="mt-1"
                  />
                  <div>
                    <p className="text-2xs font-bold text-foreground">Modify Opening Balance</p>
                    <p className="text-3xs text-muted-foreground leading-tight mt-0.5">
                      Directly edits the {"account's"} opening deposit. Use if you entered the wrong
                      start amount. Existing transactions remain untouched.
                    </p>
                  </div>
                </label>

                {/* Option 3 */}
                <label className="flex items-start gap-2.5 p-2 rounded-lg border border-border bg-[#0b0f1a]/40 hover:bg-muted/10 cursor-pointer transition">
                  <input
                    type="radio"
                    name="adjustOpt"
                    checked={adjustOption === 3}
                    onChange={() => {
                      setAdjustOption(3);
                      setShowWarningDialog(false);
                    }}
                    className="mt-1"
                  />
                  <div>
                    <p className="text-2xs font-bold text-foreground">Replace Current Balance</p>
                    <p className="text-3xs text-muted-foreground leading-tight mt-0.5 text-warning/80">
                      Forces account balance to the new value. May introduce discrepancies with
                      transaction logs.
                    </p>
                  </div>
                </label>
              </div>

              {/* Force Override Warning */}
              {adjustOption === 3 && showWarningDialog && (
                <div className="bg-red-950/20 border border-red-500/20 rounded-xl p-3 flex items-start gap-2 text-[#ef4444]">
                  <p className="text-3xs leading-relaxed">
                    Warning: Directly replacing current balance overrides opening balance targets
                    without creating ledger entries. This may create inconsistencies. Click Adjust
                    to proceed.
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-3 border-t border-border/40">
              <button
                type="button"
                onClick={handleExecuteAdjust}
                className="flex-1 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:opacity-90 transition"
              >
                {adjustOption === 3 && !showWarningDialog ? 'Verify Adjustment' : 'Adjust Balance'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdjustAccount(null);
                  setAdjustActualBalance('');
                  setAdjustOption(1);
                  setShowWarningDialog(false);
                }}
                className="flex-1 py-2 rounded-xl bg-muted border border-border text-xs font-semibold text-foreground hover:bg-muted/80 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Options Modal */}
      {deleteAccountTarget && deleteStats && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              Delete Account Options
            </h3>

            <div className="space-y-3 text-xs">
              <div className="bg-muted/20 border border-border rounded-xl p-3 text-3xs text-muted-foreground space-y-1">
                <p>
                  Target Account:{' '}
                  <span className="font-semibold text-foreground">{deleteAccountTarget.name}</span>
                </p>
                <p>
                  Contains:{' '}
                  <span className="font-semibold text-foreground">
                    {deleteStats.txn_count} transactions
                  </span>
                </p>
                <p>
                  Current Balance:{' '}
                  <span className="font-semibold text-foreground">
                    ₹{Math.abs(deleteStats.balance).toLocaleString('en-IN')}
                  </span>
                </p>
              </div>

              <div className="space-y-2.5 pt-2">
                <p className="text-3xs text-muted-foreground uppercase font-bold tracking-wider">
                  How should we handle this {"account's"} records?
                </p>

                {/* Option 3: Archive (Recommended) */}
                <label className="flex items-start gap-2.5 p-2 rounded-lg border border-border bg-[#0b0f1a]/40 hover:bg-muted/10 cursor-pointer transition">
                  <input
                    type="radio"
                    name="deleteOpt"
                    checked={deleteOption === 3}
                    onChange={() => setDeleteOption(3)}
                    className="mt-1"
                  />
                  <div>
                    <p className="text-2xs font-bold text-foreground">
                      Archive Account (Recommended)
                    </p>
                    <p className="text-3xs text-muted-foreground leading-tight mt-0.5">
                      Keeps all transaction logs and past balance details intact for reports, but
                      hides the account from lists and dashboard drop-downs.
                    </p>
                  </div>
                </label>

                {/* Option 2: Move */}
                <label className="flex items-start gap-2.5 p-2 rounded-lg border border-border bg-[#0b0f1a]/40 hover:bg-muted/10 cursor-pointer transition">
                  <input
                    type="radio"
                    name="deleteOpt"
                    checked={deleteOption === 2}
                    onChange={() => setDeleteOption(2)}
                    className="mt-1"
                  />
                  <div>
                    <p className="text-2xs font-bold text-foreground">
                      Move Transactions to Another Account
                    </p>
                    <p className="text-3xs text-muted-foreground leading-tight mt-0.5">
                      Re-links all {deleteStats.txn_count} transactions to another account of your
                      choice before deleting this account record.
                    </p>
                  </div>
                </label>

                {deleteOption === 2 && (
                  <div className="pl-6 pt-1">
                    <label className="block mb-1 text-4xs text-muted-foreground uppercase font-bold tracking-wider">
                      Select Destination Account
                    </label>
                    <select
                      value={deleteTargetAccountForMove}
                      onChange={(e) => setDeleteTargetAccountForMove(e.target.value)}
                      className="w-full rounded-lg border border-border bg-[#0b0f1a] px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-primary transition"
                    >
                      <option value="">— Select Account —</option>
                      {accounts
                        .filter((a) => a.id !== deleteAccountTarget.id && !a.archived)
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                {/* Option 1: Cascade Delete */}
                <label className="flex items-start gap-2.5 p-2 rounded-lg border border-border bg-red-950/10 hover:bg-red-950/20 cursor-pointer transition text-[#ef4444]">
                  <input
                    type="radio"
                    name="deleteOpt"
                    checked={deleteOption === 1}
                    onChange={() => setDeleteOption(1)}
                    className="mt-1"
                  />
                  <div>
                    <p className="text-2xs font-bold">Delete Account and All Transactions</p>
                    <p className="text-3xs text-red-400/80 leading-tight mt-0.5">
                      Permanently deletes this account and purges every single one of its{' '}
                      {deleteStats.txn_count} linked transactions. Cannot be undone.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <div className="flex gap-3 pt-3 border-t border-border/40">
              <button
                type="button"
                onClick={handleExecuteDelete}
                className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition"
              >
                {deleteOption === 3 ? 'Archive Account' : 'Confirm Deletion'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteAccountTarget(null);
                  setDeleteTargetAccountForMove('');
                  setDeleteOption(3);
                }}
                className="flex-1 py-2 rounded-xl bg-muted border border-border text-xs font-semibold text-foreground hover:bg-muted/80 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl relative">
            <h3 className="text-lg font-bold text-red-400 flex items-center gap-2">
              Reset All Data
            </h3>

            <div className="text-xs text-muted-foreground space-y-2 leading-relaxed">
              <p>This action will permanently delete:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>All accounts</li>
                <li>All transactions</li>
                <li>All categories</li>
                <li>Budgets</li>
                <li>Goals</li>
                <li>Reports</li>
                <li>AI insights</li>
                <li>Settings and preferences</li>
              </ul>
              <p className="text-red-400/90 font-semibold mt-2">This action cannot be undone.</p>
              <p className="mt-4 font-semibold text-foreground">
                Type{' '}
                <span className="text-red-400 select-all font-mono bg-[#0b0f1a] px-1.5 py-0.5 rounded border border-border">
                  DELETE
                </span>{' '}
                to confirm.
              </p>
            </div>

            <div>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
                className="w-full rounded-xl border border-border bg-[#0b0f1a] p-2.5 text-center text-sm font-bold tracking-widest text-foreground focus:outline-none focus:border-red-500 transition"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleExecuteReset}
                disabled={confirmText !== 'DELETE'}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-semibold shadow-lg shadow-red-500/10 transition"
              >
                Reset All Data
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsResetModalOpen(false);
                  setConfirmText('');
                }}
                className="flex-1 py-2.5 rounded-xl bg-muted border border-border text-xs font-semibold text-foreground hover:bg-muted/80 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {resetSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full text-center space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-foreground">
              All data has been reset successfully.
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              You can now create new accounts and start tracking finances again.
            </p>
            <button
              type="button"
              onClick={() => {
                setResetSuccess(false);
                window.location.reload();
              }}
              className="w-full py-2.5 rounded-xl bg-primary text-white text-xs font-semibold shadow-lg shadow-primary/10 transition"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* 1. Loan Details Modal */}
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
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-[#0b0f1a]/30 border border-border/30 rounded-xl p-3">
                <span className="text-3xs text-muted-foreground uppercase tracking-wider block font-semibold">
                  Outstanding Principal
                </span>
                <span className="text-sm font-bold text-foreground font-mono block mt-1">
                  ₹{Math.abs(activeLoanDetails.balance).toLocaleString('en-IN')}
                </span>
              </div>
              <div className="bg-[#0b0f1a]/30 border border-border/30 rounded-xl p-3">
                <span className="text-3xs text-muted-foreground uppercase tracking-wider block font-semibold">
                  Accrued Unpaid Interest
                </span>
                <span className="text-sm font-bold text-amber-500 font-mono block mt-1">
                  ₹{(activeLoanDetails.accruedInterest || 0).toLocaleString('en-IN')}
                </span>
              </div>
              <div className="bg-[#0b0f1a]/30 border border-border/30 rounded-xl p-3">
                <span className="text-3xs text-muted-foreground uppercase tracking-wider block font-semibold">
                  Total Outstanding Liability
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
              <div className="bg-[#0b0f1a]/30 border border-border/30 rounded-xl p-3">
                <span className="text-3xs text-muted-foreground uppercase tracking-wider block font-semibold">
                  Interest Rate & Type
                </span>
                <span className="text-xs font-bold text-foreground block mt-1 select-none">
                  {activeLoanDetails.interestRate}% ({activeLoanDetails.interestType || 'reducing'})
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

            {/* Quick Actions Panel */}
            <div className="flex gap-3 justify-end pt-2">
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
            </div>

            {/* Amortization Repayment Schedule */}
            <div className="space-y-3">
              <h4 className="text-xs font-extrabold text-foreground uppercase tracking-wider">
                📊 Amortization Schedule
              </h4>
              <div className="overflow-x-auto border border-border/50 rounded-xl max-h-[300px] select-scrollbar">
                <table className="w-full text-left text-2xs table-auto border-collapse min-w-[700px]">
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
                        <td className="py-2 px-3 text-negative font-semibold">
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
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Pay EMI Modal */}
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

      {/* 3. Make Extra Payment Modal */}
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
                    placeholder="e.g. 50000"
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
                  placeholder="e.g. Prepayment from annual bonus"
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
    </AppLayout>
  );
}
