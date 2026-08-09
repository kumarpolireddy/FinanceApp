'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import Modal from '@/components/ui/Modal';
import { toast } from 'sonner';
import {
  getSplitExpenses,
  getSplitPayments,
  recordSplitRepayment,
  getAccounts,
  getTransactions,
  getCategories,
  saveTransaction,
  deleteTransaction,
  updateTransaction,
  type SplitDetails,
  type SplitPaymentRecord,
  type SplitMember,
  type Account,
  type Transaction,
  type Category,
} from '@/lib/storage';
import {
  Users,
  UserCheck,
  ReceiptText,
  DollarSign,
  ArrowLeft,
  CheckCircle2,
  Clock,
  PlusCircle,
  TrendingUp,
  Search,
  Check,
  ChevronRight,
  Wallet,
  X,
  Pencil,
  Trash2,
} from 'lucide-react';

export default function SplitExpensesPage() {
  const router = useRouter();
  const [splits, setSplits] = useState<SplitDetails[]>([]);
  const [payments, setPayments] = useState<SplitPaymentRecord[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [search, setSearch] = useState('');
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'settled'>('all');

  // Record Payment Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [targetSplit, setTargetSplit] = useState<SplitDetails | null>(null);
  const [paymentPerson, setPaymentPerson] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentAccount, setPaymentAccount] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  // Add Split Expense Modal State
  const [isAddSplitModalOpen, setIsAddSplitModalOpen] = useState(false);
  const [newSplitName, setNewSplitName] = useState('');
  const [newTotalAmount, setNewTotalAmount] = useState('');
  const [newCategory, setNewCategory] = useState('Food & Dining');
  const [newAccount, setNewAccount] = useState('');
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newSplitMethod, setNewSplitMethod] = useState<'equal' | 'custom'>('equal');
  const [newSplitMembers, setNewSplitMembers] = useState<{ name: string; share: string }[]>([
    { name: '', share: '' },
  ]);
  const [newMyShareCustom, setNewMyShareCustom] = useState('');
  const [newNotes, setNewNotes] = useState('');

  const [txns, setTxns] = useState<Transaction[]>([]);

  const [categories, setCategories] = useState<Category[]>([]);

  const loadData = () => {
    setSplits(getSplitExpenses());
    setPayments(getSplitPayments());
    setTxns(getTransactions(true));
    const accs = getAccounts();
    setAccounts(accs);
    const cats = getCategories();
    setCategories(cats);
    if (accs.length > 0) {
      if (!paymentAccount) setPaymentAccount(accs[0].id);
      if (!newAccount) setNewAccount(accs[0].id);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const availableCategories = useMemo(() => {
    const expenseCatNames = categories
      .filter((c) => !c.type || c.type === 'expense')
      .map((c) => c.name);
    if (expenseCatNames.length > 0) {
      return Array.from(new Set(expenseCatNames));
    }
    return ['Food & Dining', 'Shopping', 'Utilities', 'Entertainment', 'Travel', 'Health & Fitness', 'General'];
  }, [categories]);

  useEffect(() => {
    if (availableCategories.length > 0 && !availableCategories.includes(newCategory)) {
      setNewCategory(availableCategories[0]);
    }
  }, [availableCategories, newCategory]);

  const newSplitCalculations = useMemo(() => {
    const totalPaid = Math.max(0, parseFloat(newTotalAmount) || 0);
    const validMembersCount = newSplitMembers.filter((m) => m.name.trim()).length + 1;

    if (newSplitMethod === 'equal') {
      const equalShare = totalPaid > 0 ? Number((totalPaid / validMembersCount).toFixed(2)) : 0;
      const myShare = equalShare;
      const computedMembers: SplitMember[] = newSplitMembers.map((m) => ({
        name: m.name.trim() || 'Person',
        share: equalShare,
        paid: 0,
        pending: equalShare,
      }));
      const toReceive = Number((totalPaid - myShare).toFixed(2));
      const totalShares = Number((myShare + computedMembers.reduce((sum, m) => sum + m.share, 0)).toFixed(2));
      const isValid = Math.abs(totalPaid - totalShares) < 0.05 && totalPaid > 0 && newSplitMembers.every((m) => m.name.trim().length > 0);

      return { totalPaid, myShare, toReceive, totalShares, members: computedMembers, isValid };
    } else {
      const myShare = Math.max(0, parseFloat(newMyShareCustom) || 0);
      const computedMembers: SplitMember[] = newSplitMembers.map((m) => {
        const s = Math.max(0, parseFloat(m.share) || 0);
        return { name: m.name.trim() || 'Person', share: s, paid: 0, pending: s };
      });
      const toReceive = Number(computedMembers.reduce((sum, m) => sum + m.share, 0).toFixed(2));
      const totalShares = Number((myShare + toReceive).toFixed(2));
      const isValid = Math.abs(totalPaid - totalShares) < 0.05 && totalPaid > 0 && newSplitMembers.every((m) => m.name.trim().length > 0);

      return { totalPaid, myShare, toReceive, totalShares, members: computedMembers, isValid };
    }
  }, [newTotalAmount, newSplitMethod, newSplitMembers, newMyShareCustom]);

  const handleAddSplitSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const totalPaid = Math.max(0, parseFloat(newTotalAmount) || 0);
    if (totalPaid <= 0) {
      toast.error('Please enter a valid total amount.');
      return;
    }
    if (!newAccount) {
      toast.error('Please select an account.');
      return;
    }
    if (newSplitMembers.length === 0) {
      toast.error('Please add at least one person to split with.');
      return;
    }
    for (const m of newSplitMembers) {
      if (!m.name.trim()) {
        toast.error('Please enter valid names for all members.');
        return;
      }
    }
    const names = newSplitMembers.map((m) => m.name.trim().toLowerCase());
    if (new Set(names).size !== names.length || names.includes('you')) {
      toast.error('Member names must be unique.');
      return;
    }
    if (!newSplitCalculations.isValid) {
      toast.error(`Split amounts total ₹${newSplitCalculations.totalShares.toLocaleString('en-IN')}. Must equal ₹${totalPaid.toLocaleString('en-IN')}.`);
      return;
    }

    const splitDetails: SplitDetails = {
      id: `split-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      transactionId: '',
      name: newSplitName.trim() || undefined,
      totalAmount: totalPaid,
      myShare: newSplitCalculations.myShare,
      toReceive: newSplitCalculations.toReceive,
      received: 0,
      pending: newSplitCalculations.toReceive,
      splitMethod: newSplitMethod,
      members: newSplitCalculations.members,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveTransaction({
      date: newDate,
      description: newSplitName.trim() || newCategory || 'Split Expense',
      category: newCategory,
      account: newAccount,
      amount: newSplitCalculations.myShare,
      type: 'expense',
      notes: newNotes.trim() || undefined,
      isSplit: true,
      splitDetails,
    });

    toast.success('Split expense added successfully!');
    setIsAddSplitModalOpen(false);
    setNewSplitName('');
    setNewTotalAmount('');
    setNewNotes('');
    setNewSplitMembers([{ name: '', share: '' }]);
    setNewMyShareCustom('');
    loadData();
  };

  // Edit Split Expense Modal State
  const [isEditSplitModalOpen, setIsEditSplitModalOpen] = useState(false);
  const [editingSplit, setEditingSplit] = useState<SplitDetails | null>(null);
  const [editSplitName, setEditSplitName] = useState('');
  const [editTotalAmount, setEditTotalAmount] = useState('');
  const [editCategory, setEditCategory] = useState('Food & Dining');
  const [editAccount, setEditAccount] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editSplitMethod, setEditSplitMethod] = useState<'equal' | 'custom'>('equal');
  const [editSplitMembers, setEditSplitMembers] = useState<{ name: string; share: string }[]>([]);
  const [editMyShareCustom, setEditMyShareCustom] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const handleOpenEditModal = (s: SplitDetails) => {
    const linkedTxn = txns.find((t) => t.id === s.transactionId);
    setEditingSplit(s);
    setEditSplitName(s.name || linkedTxn?.description || '');
    setEditTotalAmount(String(s.totalAmount));
    setEditCategory(linkedTxn?.category || 'Food & Dining');
    setEditAccount(linkedTxn?.account || (accounts[0]?.id || ''));
    setEditDate(linkedTxn?.date ? linkedTxn.date.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setEditSplitMethod(s.splitMethod || 'equal');
    setEditSplitMembers(s.members.map((m) => ({ name: m.name, share: String(m.share) })));
    setEditMyShareCustom(String(s.myShare));
    setEditNotes(linkedTxn?.notes || '');
    setIsEditSplitModalOpen(true);
  };

  const handleDeleteSplit = (s: SplitDetails) => {
    const title = s.name || 'this split expense';
    if (confirm(`Are you sure you want to delete "${title}"? This will reverse its transaction and account balance adjustment.`)) {
      deleteTransaction(s.transactionId);
      toast.success('Split expense deleted successfully!');
      loadData();
    }
  };

  const editSplitCalculations = useMemo(() => {
    const totalPaid = Math.max(0, parseFloat(editTotalAmount) || 0);
    const validMembersCount = editSplitMembers.filter((m) => m.name.trim()).length + 1;

    if (editSplitMethod === 'equal') {
      const equalShare = totalPaid > 0 ? Number((totalPaid / validMembersCount).toFixed(2)) : 0;
      const myShare = equalShare;
      const computedMembers: SplitMember[] = editSplitMembers.map((m) => {
        const existing = editingSplit?.members.find((em) => em.name.trim().toLowerCase() === m.name.trim().toLowerCase());
        const paid = existing ? existing.paid : 0;
        return {
          name: m.name.trim() || 'Person',
          share: equalShare,
          paid,
          pending: Math.max(0, Number((equalShare - paid).toFixed(2))),
        };
      });
      const toReceive = Number((totalPaid - myShare).toFixed(2));
      const totalShares = Number((myShare + computedMembers.reduce((sum, m) => sum + m.share, 0)).toFixed(2));
      const isValid = Math.abs(totalPaid - totalShares) < 0.05 && totalPaid > 0 && editSplitMembers.every((m) => m.name.trim().length > 0);

      return { totalPaid, myShare, toReceive, totalShares, members: computedMembers, isValid };
    } else {
      const myShare = Math.max(0, parseFloat(editMyShareCustom) || 0);
      const computedMembers: SplitMember[] = editSplitMembers.map((m) => {
        const s = Math.max(0, parseFloat(m.share) || 0);
        const existing = editingSplit?.members.find((em) => em.name.trim().toLowerCase() === m.name.trim().toLowerCase());
        const paid = existing ? existing.paid : 0;
        return {
          name: m.name.trim() || 'Person',
          share: s,
          paid,
          pending: Math.max(0, Number((s - paid).toFixed(2))),
        };
      });
      const toReceive = Number(computedMembers.reduce((sum, m) => sum + m.share, 0).toFixed(2));
      const totalShares = Number((myShare + toReceive).toFixed(2));
      const isValid = Math.abs(totalPaid - totalShares) < 0.05 && totalPaid > 0 && editSplitMembers.every((m) => m.name.trim().length > 0);

      return { totalPaid, myShare, toReceive, totalShares, members: computedMembers, isValid };
    }
  }, [editTotalAmount, editSplitMethod, editSplitMembers, editMyShareCustom, editingSplit]);

  const handleEditSplitSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSplit) return;

    const totalPaid = Math.max(0, parseFloat(editTotalAmount) || 0);
    if (totalPaid <= 0) {
      toast.error('Please enter a valid total amount.');
      return;
    }
    if (!editAccount) {
      toast.error('Please select an account.');
      return;
    }
    if (editSplitMembers.length === 0) {
      toast.error('Please add at least one person to split with.');
      return;
    }
    for (const m of editSplitMembers) {
      if (!m.name.trim()) {
        toast.error('Please enter valid names for all members.');
        return;
      }
    }
    if (!editSplitCalculations.isValid) {
      toast.error(`Split amounts total ₹${editSplitCalculations.totalShares.toLocaleString('en-IN')}. Must equal ₹${totalPaid.toLocaleString('en-IN')}.`);
      return;
    }

    const updatedSplitDetails: SplitDetails = {
      ...editingSplit,
      name: editSplitName.trim() || undefined,
      totalAmount: totalPaid,
      myShare: editSplitCalculations.myShare,
      toReceive: editSplitCalculations.toReceive,
      pending: Math.max(0, Number((editSplitCalculations.toReceive - editingSplit.received).toFixed(2))),
      splitMethod: editSplitMethod,
      members: editSplitCalculations.members,
      updatedAt: new Date().toISOString(),
    };

    updateTransaction(editingSplit.transactionId, {
      date: editDate,
      description: editSplitName.trim() || editCategory || 'Split Expense',
      category: editCategory,
      account: editAccount,
      amount: editSplitCalculations.myShare,
      notes: editNotes.trim() || undefined,
      isSplit: true,
      splitDetails: updatedSplitDetails,
    });

    toast.success('Split expense updated successfully!');
    setIsEditSplitModalOpen(false);
    setEditingSplit(null);
    loadData();
  };

  const txnMap = useMemo(() => {
    return new Map(txns.map((t) => [t.id, t]));
  }, [txns]);

  // Calculate Overall Totals
  const overallSummary = useMemo(() => {
    let totalToReceive = 0;
    let totalReceived = 0;

    splits.forEach((s) => {
      totalToReceive += s.toReceive || 0;
      totalReceived += s.received || 0;
    });

    const pending = Math.max(0, totalToReceive - totalReceived);

    return {
      totalToReceive,
      totalReceived,
      pending,
    };
  }, [splits]);

  // Group by Person
  const personSummary = useMemo(() => {
    const map: Record<
      string,
      {
        personName: string;
        totalShared: number;
        totalReceived: number;
        pending: number;
        splitsCount: number;
        items: {
          split: SplitDetails;
          memberShare: number;
          memberPaid: number;
          memberPending: number;
        }[];
      }
    > = {};

    splits.forEach((s) => {
      s.members.forEach((m) => {
        const nameKey = m.name.trim();
        if (!nameKey) return;

        if (!map[nameKey]) {
          map[nameKey] = {
            personName: nameKey,
            totalShared: 0,
            totalReceived: 0,
            pending: 0,
            splitsCount: 0,
            items: [],
          };
        }

        map[nameKey].totalShared += m.share;
        map[nameKey].totalReceived += m.paid;
        map[nameKey].pending += m.pending;
        map[nameKey].splitsCount += 1;
        map[nameKey].items.push({
          split: s,
          memberShare: m.share,
          memberPaid: m.paid,
          memberPending: m.pending,
        });
      });
    });

    return Object.values(map).sort((a, b) => b.pending - a.pending);
  }, [splits]);

  // Filtered People
  const filteredPeople = useMemo(() => {
    if (!search.trim()) return personSummary;
    const q = search.trim().toLowerCase();
    return personSummary.filter((p) => p.personName.toLowerCase().includes(q));
  }, [personSummary, search]);

  const activePersonData = useMemo(() => {
    if (!selectedPerson) return null;
    return personSummary.find((p) => p.personName.toLowerCase() === selectedPerson.toLowerCase()) || null;
  }, [personSummary, selectedPerson]);

  const handleOpenPaymentModal = (split: SplitDetails, personName: string, defaultAmount?: number) => {
    setTargetSplit(split);
    setPaymentPerson(personName);
    setPaymentAmount(defaultAmount ? String(defaultAmount) : '');
    setPaymentNotes('');
    setIsPaymentModalOpen(true);
  };

  const handleRecordPaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetSplit || !paymentPerson) return;
    const amt = parseFloat(paymentAmount);
    if (!amt || amt <= 0) {
      toast.error('Please enter a valid repayment amount.');
      return;
    }
    if (!paymentAccount) {
      toast.error('Please select an account to deposit the payment.');
      return;
    }

    try {
      recordSplitRepayment({
        splitId: targetSplit.id,
        transactionId: targetSplit.transactionId,
        personName: paymentPerson,
        amount: amt,
        paymentAccountId: paymentAccount,
        date: new Date().toISOString(),
        notes: paymentNotes.trim() || undefined,
      });

      toast.success(`Recorded ₹${amt.toLocaleString('en-IN')} payment from ${paymentPerson}!`);
      setIsPaymentModalOpen(false);
      setPaymentAmount('');
      setPaymentNotes('');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to record repayment');
    }
  };

  const formatCurrency = (val: number) => {
    return val.toLocaleString('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    });
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-3.5 py-3 space-y-4 bg-background min-h-[90vh]">
        
        {/* Header Navigation */}
        <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (selectedPerson) setSelectedPerson(null);
                else router.push('/more');
              }}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/30 transition cursor-pointer"
            >
              <ArrowLeft size={18} />
            </button>
            <h1 className="text-base md:text-lg font-normal text-foreground uppercase tracking-tight">
              {selectedPerson ? `Split with ${selectedPerson}` : 'Split Expenses'}
            </h1>
          </div>

          <button
            onClick={() => setIsAddSplitModalOpen(true)}
            className="px-3 py-1 bg-primary text-primary-foreground text-xs font-normal rounded-lg hover:opacity-90 transition flex items-center gap-1 cursor-pointer shadow-xs"
          >
            <PlusCircle size={14} />
            <span>Add Split</span>
          </button>
        </div>

        {/* Top Summary Banner */}
        <div className="grid grid-cols-3 bg-secondary/40 border border-border/60 rounded-xl p-3 text-center gap-2 shadow-xs">
          <div>
            <span className="text-[10px] text-muted-foreground font-normal uppercase block">Total To Receive</span>
            <span className="text-sm font-normal text-foreground block mt-0.5">{formatCurrency(overallSummary.totalToReceive)}</span>
          </div>
          <div className="border-x border-border/40">
            <span className="text-[10px] text-muted-foreground font-normal uppercase block">Total Received</span>
            <span className="text-sm font-normal text-positive block mt-0.5">{formatCurrency(overallSummary.totalReceived)}</span>
          </div>
          <div>
            <span className="text-[10px] text-muted-foreground font-normal uppercase block">Pending</span>
            <span className="text-sm font-normal text-negative block mt-0.5">{formatCurrency(overallSummary.pending)}</span>
          </div>
        </div>

        {/* Main Content Area */}
        {!selectedPerson ? (
          <div className="space-y-4">
            {/* Search & Filter Bar */}
            <div className="space-y-2.5">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-secondary border border-border/60 rounded-xl pl-9 pr-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary font-normal"
                />
              </div>

              {/* Status Filter Tabs */}
              <div className="flex items-center gap-1 bg-secondary/80 p-1 rounded-xl border border-border/60 text-xs">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-normal transition cursor-pointer ${
                    statusFilter === 'all' ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  All ({personSummary.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('pending')}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-normal transition cursor-pointer flex items-center justify-center gap-1 ${
                    statusFilter === 'pending' ? 'bg-negative text-white shadow-xs' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Clock size={13} />
                  <span>Pending ({personSummary.filter((p) => p.pending > 0).length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('settled')}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-normal transition cursor-pointer flex items-center justify-center gap-1 ${
                    statusFilter === 'settled' ? 'bg-positive text-white shadow-xs' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <CheckCircle2 size={13} />
                  <span>Settled ({personSummary.filter((p) => p.pending <= 0).length})</span>
                </button>
              </div>
            </div>

            {/* People List Categorized */}
            <div className="space-y-4">
              {filteredPeople.length === 0 ? (
                <div className="bg-secondary border border-border/60 rounded-xl p-8 text-center space-y-3">
                  <Users size={32} className="mx-auto text-muted-foreground/40" />
                  <p className="text-sm font-normal text-foreground">No Split Expenses Found</p>
                  <p className="text-xs text-muted-foreground">
                    Record shared expenses with friends and track receivables easily.
                  </p>
                  <button
                    onClick={() => setIsAddSplitModalOpen(true)}
                    className="px-4 py-2 bg-primary text-primary-foreground text-xs font-normal rounded-lg hover:opacity-90 transition inline-flex items-center gap-1.5 cursor-pointer shadow-xs mt-1"
                  >
                    <PlusCircle size={14} />
                    <span>Create First Split Expense</span>
                  </button>
                </div>
              ) : (
                <>
                  {/* Pending / Not Settled Category Section */}
                  {(statusFilter === 'all' || statusFilter === 'pending') && (
                    (() => {
                      const pendingList = filteredPeople.filter((p) => p.pending > 0);
                      if (pendingList.length === 0 && statusFilter === 'pending') {
                        return (
                          <div className="bg-secondary/40 border border-border/40 rounded-xl p-6 text-center text-xs text-muted-foreground">
                            No pending receivables found. All split expenses are settled! 🎉
                          </div>
                        );
                      }
                      if (pendingList.length === 0) return null;

                      return (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between px-1">
                            <h2 className="text-xs font-normal text-negative uppercase tracking-wider flex items-center gap-1.5">
                              <Clock size={13} />
                              <span>Active Pending ({pendingList.length})</span>
                            </h2>
                            <span className="text-2xs font-mono text-negative font-normal">
                              Total Receivable: {formatCurrency(pendingList.reduce((sum, p) => sum + p.pending, 0))}
                            </span>
                          </div>
                          {pendingList.map((person) => (
                            <div
                              key={person.personName}
                              onClick={() => setSelectedPerson(person.personName)}
                              className="bg-secondary border border-border/60 hover:border-primary/40 rounded-xl p-3.5 flex items-center justify-between gap-3 cursor-pointer transition active:scale-[0.99] shadow-xs"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-full bg-negative/10 border border-negative/20 flex items-center justify-center text-negative shrink-0">
                                  <UserCheck size={18} />
                                </div>
                                <div className="space-y-0.5 truncate">
                                  <span className="text-sm font-normal text-foreground block truncate">{person.personName}</span>
                                  <span className="text-2xs text-muted-foreground block truncate">
                                    {person.items
                                      .map((i) => {
                                        const linkedTxn = txnMap.get(i.split.transactionId);
                                        return i.split.name || linkedTxn?.description || linkedTxn?.category || 'Split Expense';
                                      })
                                      .filter(Boolean)
                                      .join(' • ')}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-3 shrink-0 text-right">
                                <div>
                                  <span className="text-xs text-muted-foreground block">You need to receive</span>
                                  <span className="text-sm font-normal text-negative block font-mono">
                                    {formatCurrency(person.pending)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()
                  )}

                  {/* Fully Settled Category Section */}
                  {(statusFilter === 'all' || statusFilter === 'settled') && (
                    (() => {
                      const settledList = filteredPeople.filter((p) => p.pending <= 0);
                      if (settledList.length === 0 && statusFilter === 'settled') {
                        return (
                          <div className="bg-secondary/40 border border-border/40 rounded-xl p-6 text-center text-xs text-muted-foreground">
                            No settled split expenses found.
                          </div>
                        );
                      }
                      if (settledList.length === 0) return null;

                      return (
                        <div className="space-y-2 pt-2">
                          <div className="flex items-center justify-between px-1">
                            <h2 className="text-xs font-normal text-positive uppercase tracking-wider flex items-center gap-1.5">
                              <CheckCircle2 size={13} />
                              <span>Fully Settled ({settledList.length})</span>
                            </h2>
                          </div>
                          {settledList.map((person) => (
                            <div
                              key={person.personName}
                              onClick={() => setSelectedPerson(person.personName)}
                              className="bg-secondary border border-border/60 hover:border-primary/40 rounded-xl p-3.5 flex items-center justify-between gap-3 cursor-pointer transition active:scale-[0.99] shadow-xs"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-full bg-positive/10 border border-positive/20 flex items-center justify-center text-positive shrink-0">
                                  <CheckCircle2 size={18} />
                                </div>
                                <div className="space-y-0.5 truncate">
                                  <span className="text-sm font-normal text-foreground block truncate">{person.personName}</span>
                                  <span className="text-2xs text-muted-foreground block truncate">
                                    {person.items
                                      .map((i) => {
                                        const linkedTxn = txnMap.get(i.split.transactionId);
                                        return i.split.name || linkedTxn?.description || linkedTxn?.category || 'Split Expense';
                                      })
                                      .filter(Boolean)
                                      .join(' • ')}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-3 shrink-0 text-right">
                                <div>
                                  <span className="text-xs font-normal text-positive shrink-0">
                                    Paid
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()
                  )}
                </>
              )}
            </div>
          </div>
        ) : (
          /* Person Detail View */
          activePersonData && (
            <div className="space-y-4 animate-slide-up">
              {/* Status Filter Tabs inside Person Detail View */}
              <div className="flex items-center gap-1 bg-secondary/80 p-1 rounded-xl border border-border/60 text-xs">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-normal transition cursor-pointer ${
                    statusFilter === 'all' ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  All ({activePersonData.items.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('pending')}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-normal transition cursor-pointer flex items-center justify-center gap-1 ${
                    statusFilter === 'pending' ? 'bg-negative text-white shadow-xs' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Clock size={13} />
                  <span>Pending ({activePersonData.items.filter((i) => i.memberPending > 0).length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('settled')}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-normal transition cursor-pointer flex items-center justify-center gap-1 ${
                    statusFilter === 'settled' ? 'bg-positive text-white shadow-xs' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <CheckCircle2 size={13} />
                  <span>Settled ({activePersonData.items.filter((i) => i.memberPending <= 0).length})</span>
                </button>
              </div>

              {/* Transactions List with this person */}
              <div className="space-y-4">
                {/* Active Pending Shared Expenses Category Section */}
                {(statusFilter === 'all' || statusFilter === 'pending') && (
                  (() => {
                    const pendingItems = activePersonData.items.filter((i) => i.memberPending > 0);
                    if (pendingItems.length === 0 && statusFilter === 'pending') {
                      return (
                        <div className="py-4 text-center text-xs text-muted-foreground">
                          No pending expenses with {activePersonData.personName}. All splits are settled! 🎉
                        </div>
                      );
                    }
                    if (pendingItems.length === 0) return null;

                    return (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between px-1 border-b border-border/30 pb-1.5">
                          <h3 className="text-xs font-normal text-negative uppercase tracking-wider flex items-center gap-1.5">
                            <Clock size={13} />
                            <span>Active Pending Expenses ({pendingItems.length})</span>
                          </h3>
                          <span className="text-2xs font-mono text-negative">
                            Pending: {formatCurrency(pendingItems.reduce((sum, i) => sum + i.memberPending, 0))}
                          </span>
                        </div>

                        {pendingItems.map((item) => {
                          const s = item.split;
                          const linkedTxn = txnMap.get(s.transactionId);
                          const title = s.name || linkedTxn?.description || linkedTxn?.category || 'Shared Expense';
                          const splitNames = s.members.map((m) => m.name).filter(Boolean).join(', ');
                          const rawDate = linkedTxn?.date || s.createdAt;
                          const d = new Date(rawDate);
                          const numericDate = !isNaN(d.getTime())
                            ? `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getFullYear()).slice(-2)}`
                            : String(rawDate).slice(0, 10);

                          return (
                            <div key={s.id} className="bg-negative/10 border border-negative/30 hover:border-negative/50 rounded-xl p-3.5 space-y-2.5 shadow-xs">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <span className="text-sm font-normal text-foreground block">
                                    {title}
                                  </span>
                                  <span className="text-2xs text-muted-foreground block mt-0.5">
                                    Split with: {splitNames}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    onClick={() => handleOpenEditModal(s)}
                                    className="p-1 text-muted-foreground hover:text-foreground transition cursor-pointer"
                                    title="Edit Split Expense"
                                  >
                                    <Pencil size={14} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteSplit(s)}
                                    className="p-1 text-muted-foreground hover:text-negative transition cursor-pointer"
                                    title="Delete Split Expense"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                  <span className="text-3xs font-mono text-muted-foreground ml-1">
                                    {numericDate}
                                  </span>
                                  <span
                                    className={`text-xs font-normal shrink-0 ${
                                      item.memberPaid > 0
                                        ? 'text-amber-500'
                                        : 'text-negative'
                                    }`}
                                  >
                                    {item.memberPaid > 0 ? 'Partially Paid' : 'Pending'}
                                  </span>
                                </div>
                              </div>

                              <div className="grid grid-cols-4 text-center text-xs font-mono py-1">
                                <div>
                                  <span className="text-2xs text-muted-foreground uppercase block font-normal">Total Paid</span>
                                  <span>{formatCurrency(s.totalAmount)}</span>
                                </div>
                                <div>
                                  <span className="text-2xs text-muted-foreground uppercase block font-normal">Share</span>
                                  <span>{formatCurrency(item.memberShare)}</span>
                                </div>
                                <div>
                                  <span className="text-2xs text-muted-foreground uppercase block font-normal">Received</span>
                                  <span>{formatCurrency(item.memberPaid)}</span>
                                </div>
                                <div>
                                  <span className="text-2xs text-muted-foreground uppercase block font-normal">Pending</span>
                                  <span className="text-negative">{formatCurrency(item.memberPending)}</span>
                                </div>
                              </div>

                              <div className="flex items-center justify-end pt-1">
                                <button
                                  onClick={() => handleOpenPaymentModal(s, activePersonData.personName, item.memberPending)}
                                  className="px-3 py-1 bg-primary text-primary-foreground text-xs font-normal rounded-lg hover:opacity-90 transition flex items-center gap-1 cursor-pointer"
                                >
                                  <span>Record Payment</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()
                )}

                {/* Fully Settled Shared Expenses Category Section */}
                {(statusFilter === 'all' || statusFilter === 'settled') && (
                  (() => {
                    const settledItems = activePersonData.items.filter((i) => i.memberPending <= 0);
                    if (settledItems.length === 0 && statusFilter === 'settled') {
                      return (
                        <div className="py-4 text-center text-xs text-muted-foreground">
                          No settled expenses found with {activePersonData.personName}.
                        </div>
                      );
                    }
                    if (settledItems.length === 0) return null;

                    return (
                      <div className="space-y-3 pt-2">
                        <div className="flex items-center justify-between px-1 border-b border-border/30 pb-1.5">
                          <h3 className="text-xs font-normal text-positive uppercase tracking-wider flex items-center gap-1.5">
                            <CheckCircle2 size={13} />
                            <span>Fully Settled Expenses ({settledItems.length})</span>
                          </h3>
                        </div>

                        {settledItems.map((item) => {
                          const s = item.split;
                          const linkedTxn = txnMap.get(s.transactionId);
                          const title = s.name || linkedTxn?.description || linkedTxn?.category || 'Shared Expense';
                          const splitNames = s.members.map((m) => m.name).filter(Boolean).join(', ');

                          const rawDate = linkedTxn?.date || s.createdAt;
                          const d = new Date(rawDate);
                          const numericDate = !isNaN(d.getTime())
                            ? `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getFullYear()).slice(-2)}`
                            : String(rawDate).slice(0, 10);

                          return (
                            <div key={s.id} className="bg-positive/10 border border-positive/30 hover:border-positive/50 rounded-xl p-3.5 space-y-2.5 shadow-xs">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <span className="text-sm font-normal text-foreground block">
                                    {title}
                                  </span>
                                  <span className="text-2xs text-muted-foreground block mt-0.5">
                                    Split with: {splitNames}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    onClick={() => handleOpenEditModal(s)}
                                    className="p-1 text-muted-foreground hover:text-foreground transition cursor-pointer"
                                    title="Edit Split Expense"
                                  >
                                    <Pencil size={14} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteSplit(s)}
                                    className="p-1 text-muted-foreground hover:text-negative transition cursor-pointer"
                                    title="Delete Split Expense"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                  <span className="text-3xs font-mono text-muted-foreground ml-1">
                                    {numericDate}
                                  </span>
                                  <span className="text-xs font-normal text-positive shrink-0">
                                    Paid
                                  </span>
                                </div>
                              </div>

                              <div className="grid grid-cols-4 text-center text-xs font-mono py-1">
                                <div>
                                  <span className="text-2xs text-muted-foreground uppercase block font-normal">Total Paid</span>
                                  <span>{formatCurrency(s.totalAmount)}</span>
                                </div>
                                <div>
                                  <span className="text-2xs text-muted-foreground uppercase block font-normal">Share</span>
                                  <span>{formatCurrency(item.memberShare)}</span>
                                </div>
                                <div>
                                  <span className="text-2xs text-muted-foreground uppercase block font-normal">Received</span>
                                  <span>{formatCurrency(item.memberPaid)}</span>
                                </div>
                                <div>
                                  <span className="text-2xs text-muted-foreground uppercase block font-normal">Pending</span>
                                  <span>₹0</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()
                )}
              </div>
            </div>
          )
        )}

        {/* Record Payment Modal */}
        <Modal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          title={`Record Payment from ${paymentPerson}`}
        >
          <form onSubmit={handleRecordPaymentSubmit} className="space-y-4 py-1">
            <div>
              <label className="block text-xs font-normal text-muted-foreground uppercase tracking-wider mb-1">
                Amount Received (₹)
              </label>
              <input
                type="number"
                step="any"
                min="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                required
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-normal text-muted-foreground uppercase tracking-wider mb-1">
                Deposit to Account
              </label>
              <select
                value={paymentAccount}
                onChange={(e) => setPaymentAccount(e.target.value)}
                required
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs font-normal text-foreground focus:outline-none focus:border-primary appearance-none cursor-pointer"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-normal text-muted-foreground uppercase tracking-wider mb-1">
                Notes (Optional)
              </label>
              <input
                type="text"
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(false)}
                className="px-3.5 py-1.5 bg-secondary text-foreground text-xs font-normal rounded-lg hover:bg-muted/40 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-primary text-primary-foreground text-xs font-normal rounded-lg hover:opacity-90 transition cursor-pointer"
              >
                Save Repayment
              </button>
            </div>
          </form>
        </Modal>

        {/* Add Split Expense Modal */}
        {isAddSplitModalOpen && (
          <Modal
            isOpen={isAddSplitModalOpen}
            onClose={() => setIsAddSplitModalOpen(false)}
            title="Add New Split Expense"
            size="lg"
          >
            <form onSubmit={handleAddSplitSubmit} className="space-y-3 text-xs font-normal">
              {/* Split Name Row */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground w-28 shrink-0 font-normal">Split Name</span>
                <input
                  type="text"
                  value={newSplitName}
                  onChange={(e) => setNewSplitName(e.target.value)}
                  required
                  className="flex-1 bg-transparent border-b border-white/[0.12] focus:border-primary text-xs text-foreground focus:outline-none py-1 px-0 font-normal"
                />
              </div>

              {/* Total Amount Row */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground w-28 shrink-0 font-normal">Total Paid</span>
                <div className="flex-1 flex items-center bg-transparent border-b border-white/[0.12] focus-within:border-primary text-xs font-mono text-foreground py-1 px-0">
                  <span className="mr-1 text-muted-foreground font-normal">₹</span>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    value={newTotalAmount}
                    onChange={(e) => setNewTotalAmount(e.target.value)}
                    required
                    className="w-full bg-transparent border-none text-xs font-mono text-foreground focus:outline-none p-0"
                  />
                </div>
              </div>

              {/* Date Row */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground w-28 shrink-0 font-normal">Date</span>
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  required
                  className="flex-1 bg-transparent border-b border-white/[0.12] focus:border-primary text-xs text-foreground focus:outline-none py-1 px-0 font-normal"
                />
              </div>

              {/* Paid From Account Row */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground w-28 shrink-0 font-normal">Paid From</span>
                <select
                  value={newAccount}
                  onChange={(e) => setNewAccount(e.target.value)}
                  required
                  className="flex-1 bg-transparent border-b border-white/[0.12] focus:border-primary text-xs text-foreground focus:outline-none py-1 px-0 font-normal appearance-none cursor-pointer"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id} className="bg-[#1F2027] text-[#F2F2F4]">
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Category Row */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground w-28 shrink-0 font-normal">Category</span>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="flex-1 bg-transparent border-b border-white/[0.12] focus:border-primary text-xs text-foreground focus:outline-none py-1 px-0 font-normal appearance-none cursor-pointer"
                >
                  {availableCategories.map((cat) => (
                    <option key={cat} value={cat} className="bg-[#1F2027] text-[#F2F2F4]">
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              {/* Split Method */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-2xs text-muted-foreground uppercase font-normal">Split Method</span>
                <div className="flex bg-secondary rounded-lg p-0.5 border border-border/60">
                  <button
                    type="button"
                    onClick={() => setNewSplitMethod('equal')}
                    className={`px-3 py-1 text-xs rounded-md font-normal transition cursor-pointer ${
                      newSplitMethod === 'equal' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Equal
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewSplitMethod('custom')}
                    className={`px-3 py-1 text-xs rounded-md font-normal transition cursor-pointer ${
                      newSplitMethod === 'custom' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Custom
                  </button>
                </div>
              </div>

              {/* Members list */}
              <div className="space-y-2 pt-1 border-t border-border/40">
                <div className="flex items-center justify-between">
                  <span className="text-2xs text-muted-foreground uppercase font-normal">Split With</span>
                  <button
                    type="button"
                    onClick={() => setNewSplitMembers([...newSplitMembers, { name: '', share: '' }])}
                    className="text-xs text-primary font-normal hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <PlusCircle size={13} /> Add Person
                  </button>
                </div>

                {/* You */}
                <div className="flex items-center justify-between py-1 px-1 text-xs">
                  <span className="font-normal text-foreground">You (Your Share)</span>
                  {newSplitMethod === 'equal' ? (
                    <span className="font-mono text-primary font-normal">₹{newSplitCalculations.myShare.toLocaleString('en-IN')}</span>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span>₹</span>
                      <input
                        type="number"
                        value={newMyShareCustom}
                        onChange={(e) => setNewMyShareCustom(e.target.value)}
                        className="w-20 bg-transparent border-b border-border text-right text-xs font-mono focus:outline-none focus:border-primary p-0"
                      />
                    </div>
                  )}
                </div>

                {/* Other Members */}
                {newSplitMembers.map((member, index) => (
                  <div key={`new-mem-${index}`} className="flex items-center gap-2 py-1 px-1 text-xs">
                    <input
                      type="text"
                      value={member.name}
                      onChange={(e) => {
                        const updated = [...newSplitMembers];
                        updated[index].name = e.target.value;
                        setNewSplitMembers(updated);
                      }}
                      className="flex-1 bg-transparent border-b border-border/50 focus:border-primary text-xs text-foreground focus:outline-none font-normal py-0.5 px-0"
                    />
                    {newSplitMethod === 'equal' ? (
                      <span className="font-mono text-foreground font-normal px-1">
                        ₹{newSplitCalculations.members[index]?.share.toLocaleString('en-IN') || 0}
                      </span>
                    ) : (
                      <div className="flex items-center gap-1">
                        <span>₹</span>
                        <input
                          type="number"
                          value={member.share}
                          onChange={(e) => {
                            const updated = [...newSplitMembers];
                            updated[index].share = e.target.value;
                            setNewSplitMembers(updated);
                          }}
                          className="w-20 bg-transparent border-b border-border text-right text-xs font-mono focus:outline-none focus:border-primary p-0"
                        />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const updated = newSplitMembers.filter((_, i) => i !== index);
                        setNewSplitMembers(updated);
                      }}
                      className="p-1 text-muted-foreground hover:text-negative transition cursor-pointer"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Validation & Summary */}
              <div className="py-2 space-y-1 text-2xs border-t border-border/40">
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Account Outflow:</span>
                  <span className="font-mono font-normal text-foreground">₹{newSplitCalculations.totalPaid.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Your Expense:</span>
                  <span className="font-mono font-normal text-primary">₹{newSplitCalculations.myShare.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>To Receive from Friends:</span>
                  <span className="font-mono font-normal text-positive">₹{newSplitCalculations.toReceive.toLocaleString('en-IN')}</span>
                </div>
                {!newSplitCalculations.isValid && newSplitCalculations.totalPaid > 0 && (
                  <p className="text-negative text-3xs font-normal pt-1 border-t border-border/40">
                    ⚠️ Split amounts total ₹{newSplitCalculations.totalShares.toLocaleString('en-IN')}. Must equal ₹{newSplitCalculations.totalPaid.toLocaleString('en-IN')}.
                  </p>
                )}
              </div>

              {/* Notes Row */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground w-28 shrink-0 font-normal">Notes</span>
                <input
                  type="text"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="flex-1 bg-transparent border-b border-white/[0.12] focus:border-primary text-xs text-foreground focus:outline-none py-1 px-0 font-normal"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddSplitModalOpen(false)}
                  className="px-3.5 py-1.5 bg-secondary text-foreground text-xs font-normal rounded-lg hover:bg-muted/40 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newSplitCalculations.isValid}
                  className="px-4 py-1.5 bg-primary text-primary-foreground text-xs font-normal rounded-lg hover:opacity-90 transition cursor-pointer shadow-xs disabled:opacity-50"
                >
                  Save Split Expense
                </button>
              </div>
            </form>
          </Modal>
        )}

        {/* Edit Split Expense Modal */}
        {isEditSplitModalOpen && editingSplit && (
          <Modal
            isOpen={isEditSplitModalOpen}
            onClose={() => {
              setIsEditSplitModalOpen(false);
              setEditingSplit(null);
            }}
            title="Edit Split Expense"
            size="lg"
          >
            <form onSubmit={handleEditSplitSubmit} className="space-y-3 text-xs font-normal">
              {/* Split Name Row */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground w-28 shrink-0 font-normal">Split Name</span>
                <input
                  type="text"
                  value={editSplitName}
                  onChange={(e) => setEditSplitName(e.target.value)}
                  required
                  className="flex-1 bg-transparent border-b border-white/[0.12] focus:border-primary text-xs text-foreground focus:outline-none py-1 px-0 font-normal"
                />
              </div>

              {/* Total Amount Row */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground w-28 shrink-0 font-normal">Total Paid</span>
                <div className="flex-1 flex items-center bg-transparent border-b border-white/[0.12] focus-within:border-primary text-xs font-mono text-foreground py-1 px-0">
                  <span className="mr-1 text-muted-foreground font-normal">₹</span>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    value={editTotalAmount}
                    onChange={(e) => setEditTotalAmount(e.target.value)}
                    required
                    className="w-full bg-transparent border-none text-xs font-mono text-foreground focus:outline-none p-0"
                  />
                </div>
              </div>

              {/* Date Row */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground w-28 shrink-0 font-normal">Date</span>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  required
                  className="flex-1 bg-transparent border-b border-white/[0.12] focus:border-primary text-xs text-foreground focus:outline-none py-1 px-0 font-normal"
                />
              </div>

              {/* Paid From Account Row */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground w-28 shrink-0 font-normal">Paid From</span>
                <select
                  value={editAccount}
                  onChange={(e) => setEditAccount(e.target.value)}
                  required
                  className="flex-1 bg-transparent border-b border-white/[0.12] focus:border-primary text-xs text-foreground focus:outline-none py-1 px-0 font-normal appearance-none cursor-pointer"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id} className="bg-[#1F2027] text-[#F2F2F4]">
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Category Row */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground w-28 shrink-0 font-normal">Category</span>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className="flex-1 bg-transparent border-b border-white/[0.12] focus:border-primary text-xs text-foreground focus:outline-none py-1 px-0 font-normal appearance-none cursor-pointer"
                >
                  {availableCategories.map((cat) => (
                    <option key={cat} value={cat} className="bg-[#1F2027] text-[#F2F2F4]">
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              {/* Split Method */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-2xs text-muted-foreground uppercase font-normal">Split Method</span>
                <div className="flex bg-secondary rounded-lg p-0.5 border border-border/60">
                  <button
                    type="button"
                    onClick={() => setEditSplitMethod('equal')}
                    className={`px-3 py-1 text-xs rounded-md font-normal transition cursor-pointer ${
                      editSplitMethod === 'equal' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Equal
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditSplitMethod('custom')}
                    className={`px-3 py-1 text-xs rounded-md font-normal transition cursor-pointer ${
                      editSplitMethod === 'custom' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Custom
                  </button>
                </div>
              </div>

              {/* Members list */}
              <div className="space-y-2 pt-1 border-t border-border/40">
                <div className="flex items-center justify-between">
                  <span className="text-2xs text-muted-foreground uppercase font-normal">Split With</span>
                  <button
                    type="button"
                    onClick={() => setEditSplitMembers([...editSplitMembers, { name: '', share: '' }])}
                    className="text-xs text-primary font-normal hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <PlusCircle size={13} /> Add Person
                  </button>
                </div>

                {/* You */}
                <div className="flex items-center justify-between py-1 px-1 text-xs">
                  <span className="font-normal text-foreground">You (Your Share)</span>
                  {editSplitMethod === 'equal' ? (
                    <span className="font-mono text-primary font-normal">₹{editSplitCalculations.myShare.toLocaleString('en-IN')}</span>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span>₹</span>
                      <input
                        type="number"
                        value={editMyShareCustom}
                        onChange={(e) => setEditMyShareCustom(e.target.value)}
                        className="w-20 bg-transparent border-b border-border text-right text-xs font-mono focus:outline-none focus:border-primary p-0"
                      />
                    </div>
                  )}
                </div>

                {/* Other Members */}
                {editSplitMembers.map((member, index) => (
                  <div key={`edit-mem-${index}`} className="flex items-center gap-2 py-1 px-1 text-xs">
                    <input
                      type="text"
                      value={member.name}
                      onChange={(e) => {
                        const updated = [...editSplitMembers];
                        updated[index].name = e.target.value;
                        setEditSplitMembers(updated);
                      }}
                      className="flex-1 bg-transparent border-b border-border/50 focus:border-primary text-xs text-foreground focus:outline-none font-normal py-0.5 px-0"
                    />
                    {editSplitMethod === 'equal' ? (
                      <span className="font-mono text-foreground font-normal px-1">
                        ₹{editSplitCalculations.members[index]?.share.toLocaleString('en-IN') || 0}
                      </span>
                    ) : (
                      <div className="flex items-center gap-1">
                        <span>₹</span>
                        <input
                          type="number"
                          value={member.share}
                          onChange={(e) => {
                            const updated = [...editSplitMembers];
                            updated[index].share = e.target.value;
                            setEditSplitMembers(updated);
                          }}
                          className="w-20 bg-transparent border-b border-border text-right text-xs font-mono focus:outline-none focus:border-primary p-0"
                        />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const updated = editSplitMembers.filter((_, i) => i !== index);
                        setEditSplitMembers(updated);
                      }}
                      className="p-1 text-muted-foreground hover:text-negative transition cursor-pointer"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Validation & Summary */}
              <div className="py-2 space-y-1 text-2xs border-t border-border/40">
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Account Outflow:</span>
                  <span className="font-mono font-normal text-foreground">₹{editSplitCalculations.totalPaid.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Your Expense:</span>
                  <span className="font-mono font-normal text-primary">₹{editSplitCalculations.myShare.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>To Receive from Friends:</span>
                  <span className="font-mono font-normal text-positive">₹{editSplitCalculations.toReceive.toLocaleString('en-IN')}</span>
                </div>
                {!editSplitCalculations.isValid && editSplitCalculations.totalPaid > 0 && (
                  <p className="text-negative text-3xs font-normal pt-1 border-t border-border/40">
                    ⚠️ Split amounts total ₹{editSplitCalculations.totalShares.toLocaleString('en-IN')}. Must equal ₹{editSplitCalculations.totalPaid.toLocaleString('en-IN')}.
                  </p>
                )}
              </div>

              {/* Notes Row */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground w-28 shrink-0 font-normal">Notes</span>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="flex-1 bg-transparent border-b border-white/[0.12] focus:border-primary text-xs text-foreground focus:outline-none py-1 px-0 font-normal"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditSplitModalOpen(false);
                    setEditingSplit(null);
                  }}
                  className="px-3.5 py-1.5 bg-secondary text-foreground text-xs font-normal rounded-lg hover:bg-muted/40 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!editSplitCalculations.isValid}
                  className="px-4 py-1.5 bg-primary text-primary-foreground text-xs font-normal rounded-lg hover:opacity-90 transition cursor-pointer shadow-xs disabled:opacity-50"
                >
                  Update Split Expense
                </button>
              </div>
            </form>
          </Modal>
        )}

      </div>
    </AppLayout>
  );
}
