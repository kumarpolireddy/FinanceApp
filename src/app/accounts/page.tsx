'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import { getAccounts, type Account, addAccount, getTransactions, type Transaction, calculateCreditCardBalances } from '@/lib/storage';
import { Landmark, Wallet, CreditCard, ShieldAlert, ChevronDown, ChevronRight, Eye, EyeOff, Plus, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { toast } from 'sonner';

export default function AccountsPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [isMounted, setIsMounted] = useState(false);

  // New Account states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newAccName, setNewAccName] = useState('');
  const [newAccBalance, setNewAccBalance] = useState('0');
  const [newAccType, setNewAccType] = useState<Account['type']>('accounts');
  const [newAccNotes, setNewAccNotes] = useState('');
  const [newAccLimit, setNewAccLimit] = useState('100000');
  const [newAccInterest, setNewAccInterest] = useState('8.5');
  const [newAccDueDay, setNewAccDueDay] = useState('25');
  const [newAccMinPayment, setNewAccMinPayment] = useState('0');
  const [newAccBillingCycle, setNewAccBillingCycle] = useState('4');
  const [newAccNotifyDays, setNewAccNotifyDays] = useState('3');

  const handleAddAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccName.trim()) {
      toast.error('Account Name is required');
      return;
    }

    const balanceNum = parseFloat(newAccBalance) || 0;
    
    const colors = {
      accounts: '#60a5fa',
      cash: '#60a5fa',
      credit: '#60a5fa',
      loan: '#60a5fa'
    };
    
    const icons = {
      accounts: '🏦',
      cash: '💵',
      credit: '💳',
      loan: '📉'
    };

    const accountData: Omit<Account, 'id'> = {
      name: newAccName.trim(),
      balance: balanceNum,
      type: newAccType,
      color: colors[newAccType] || '#3b82f6',
      icon: icons[newAccType] || '🏦',
      notes: newAccNotes.trim(),
      visible: true,
    };

    if (newAccType === 'credit') {
      accountData.creditLimit = parseFloat(newAccLimit) || 0;
      accountData.dueDate = newAccDueDay.trim();
      accountData.minPayment = parseFloat(newAccMinPayment) || 0;
      accountData.billingCycle = newAccBillingCycle.trim();
      accountData.notificationDaysBefore = parseInt(newAccNotifyDays, 10) || 3;
    } else if (newAccType === 'loan') {
      accountData.interestRate = parseFloat(newAccInterest) || 0;
    }

    addAccount(accountData);
    toast.success('Account created successfully');
    
    // Refresh and close
    setAccounts(getAccounts(true));
    setAllTransactions(getTransactions(true));
    setIsAddModalOpen(false);
    
    setNewAccName('');
    setNewAccBalance('0');
    setNewAccType('accounts');
    setNewAccNotes('');
    setNewAccLimit('100000');
    setNewAccInterest('8.5');
    setNewAccDueDay('25');
    setNewAccMinPayment('0');
    setNewAccBillingCycle('4');
    setNewAccNotifyDays('3');
  };
  const [showBalances, setShowBalances] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('wealthiq_show_balances') !== 'false';
    }
    return true;
  });

  const toggleSection = (key: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  useEffect(() => {
    setAccounts(getAccounts(true));
    setAllTransactions(getTransactions(true));
    setIsMounted(true);
  }, []);

  const [showHiddenAccounts, setShowHiddenAccounts] = useState(true);
  const [isReorderModalOpen, setIsReorderModalOpen] = useState(false);
  const [reorderTab, setReorderTab] = useState<'groups' | 'accounts'>('groups');

  const [groupOrder, setGroupOrder] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('wealthiq_account_group_order');
        if (saved) return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return [];
  });

  const [accountOrderMap, setAccountOrderMap] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('wealthiq_account_item_order');
        if (saved) return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return [];
  });

  const saveGroupOrder = (newOrder: string[]) => {
    setGroupOrder(newOrder);
    localStorage.setItem('wealthiq_account_group_order', JSON.stringify(newOrder));
  };

  const saveAccountOrder = (newOrder: string[]) => {
    setAccountOrderMap(newOrder);
    localStorage.setItem('wealthiq_account_item_order', JSON.stringify(newOrder));
  };

  const moveGroup = (index: number, direction: 'up' | 'down') => {
    const activeGroupKeys = Object.keys(groupedAccounts.groups);
    const currentOrder = [...groupOrder];
    activeGroupKeys.forEach((k) => {
      if (!currentOrder.includes(k)) currentOrder.push(k);
    });

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentOrder.length) return;

    const updated = [...currentOrder];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, moved);
    saveGroupOrder(updated);
  };

  const moveAccount = (accId: string, direction: 'up' | 'down') => {
    const allAccIds = accounts.map((a) => a.id);
    const currentOrder = [...accountOrderMap];
    allAccIds.forEach((id) => {
      if (!currentOrder.includes(id)) currentOrder.push(id);
    });

    const index = currentOrder.indexOf(accId);
    if (index === -1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentOrder.length) return;

    const updated = [...currentOrder];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, moved);
    saveAccountOrder(updated);
  };

  const groupedAccounts = useMemo(() => {
    const groups: Record<string, { name: string; items: Account[]; total: number; icon: any; color: string }> = {};

    let totalAssets = 0;
    let totalLiabilities = 0;

    accounts.forEach(acc => {
      if ((!showHiddenAccounts && !acc.visible && acc.visible !== undefined) || acc.isDeletedSource) return;

      const type = acc.type || 'accounts';
      const catName = acc.category || 'Unassigned';
      const key = catName.toLowerCase().trim().replace(/[^a-z0-9]/g, '_');

      if (!groups[key]) {
        let icon = Landmark;
        let color = 'text-primary';

        if (type === 'cash' || catName.toLowerCase().includes('cash')) {
          icon = Wallet;
        } else if (type === 'credit' || catName.toLowerCase().includes('card') || catName.toLowerCase().includes('credit')) {
          icon = CreditCard;
        } else if (catName.toLowerCase().includes('borrow') || catName.toLowerCase().includes('debt') || catName.toLowerCase().includes('loan') || type === 'loan') {
          icon = ShieldAlert;
        }

        groups[key] = {
          name: catName,
          items: [],
          total: 0,
          icon,
          color,
        };
      }

      groups[key].items.push(acc);
      groups[key].total += acc.balance;

      const isLiab = type === 'credit' || type === 'loan' || catName.toLowerCase().includes('borrow') || catName.toLowerCase().includes('debt') || catName.toLowerCase().includes('card');
      if (isLiab) {
        totalLiabilities += Math.abs(acc.balance);
      } else {
        totalAssets += acc.balance;
      }
    });

    // Sort items within each group
    Object.keys(groups).forEach((key) => {
      groups[key].items.sort((a, b) => {
        const indexA = accountOrderMap.indexOf(a.id);
        const indexB = accountOrderMap.indexOf(b.id);
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return 0;
      });
    });

    // Sort group entries according to custom groupOrder
    const sortedGroupEntries = Object.entries(groups).sort(([keyA], [keyB]) => {
      const indexA = groupOrder.indexOf(keyA);
      const indexB = groupOrder.indexOf(keyB);
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      return 0;
    });

    const sortedGroupsObj: Record<string, typeof groups[string]> = {};
    sortedGroupEntries.forEach(([key, val]) => {
      sortedGroupsObj[key] = val;
    });

    return {
      groups: sortedGroupsObj,
      totalAssets,
      totalLiabilities,
      netWorth: totalAssets - totalLiabilities
    };
  }, [accounts, showHiddenAccounts, groupOrder, accountOrderMap]);

  const creditCardTotals = useMemo(() => {
    let payable = 0;
    let outstanding = 0;
    accounts.forEach((acc) => {
      if (acc.type === 'credit' && (!acc.visible && acc.visible !== undefined)) return;
      if (acc.type === 'credit') {
        const cc = calculateCreditCardBalances(acc, allTransactions);
        payable += cc.payable;
        outstanding += cc.outstanding;
      }
    });
    return { payable, outstanding };
  }, [accounts, allTransactions]);

  const formatVal = (val: number) => {
    return val.toLocaleString('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    });
  };

  if (!isMounted) {
    return (
      <AppLayout>
        <div className="max-w-md mx-auto px-4 py-3 space-y-4 bg-background min-h-[80vh] flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="w-full px-0 pt-3 pb-32 space-y-4">
        
        {/* Header Bar */}
        <div className="px-3 sm:px-4">
          <div className="flex items-center justify-between pb-3 border-b border-border/60">
            <div>
              <h1 className="text-lg font-bold text-foreground">My Accounts</h1>
              <p className="text-2xs text-muted-foreground mt-0.5">Balances across your money sources</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsReorderModalOpen(true)}
                className="w-9 h-9 rounded-xl transition border border-border text-muted-foreground hover:text-foreground hover:bg-secondary/70 active:scale-95 flex items-center justify-center"
                title="Modify / Reorder Accounts & Groups"
              >
                <ArrowUpDown size={16} />
              </button>
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="w-9 h-9 rounded-xl transition border border-primary/25 bg-primary/10 text-primary hover:bg-primary/20 active:scale-95 flex items-center justify-center"
                title="Add New Account"
              >
                <Plus size={16} />
              </button>
              <button 
                onClick={() => {
                  const nextVal = !showBalances;
                  setShowBalances(nextVal);
                  localStorage.setItem('wealthiq_show_balances', String(nextVal));
                }}
                className="w-9 h-9 rounded-xl transition border border-border text-muted-foreground hover:text-foreground hover:bg-secondary/70 active:scale-95 flex items-center justify-center"
                title={showBalances ? "Hide Balances" : "Show Balances"}
              >
                {showBalances ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
            </div>
          </div>
        </div>

        {/* Net Worth Summary Banner */}
        <div className="w-full py-3.5 px-4 bg-secondary text-center font-mono tabular-nums space-y-3">
          <div className="grid grid-cols-2 divide-x divide-border/60">
            <div>
              <span className="text-2xs font-semibold text-muted-foreground uppercase tracking-wide block">Total Assets</span>
              <span className="text-base font-bold text-positive block mt-1">{formatVal(groupedAccounts.totalAssets)}</span>
            </div>
            <div>
              <span className="text-2xs font-semibold text-muted-foreground uppercase tracking-wide block">Liabilities</span>
              <span className="text-base font-bold text-negative block mt-1">{formatVal(groupedAccounts.totalLiabilities)}</span>
            </div>
          </div>
          <div className="border-t border-border/55 pt-2 flex items-center justify-between px-2">
            <span className="text-2xs font-semibold text-muted-foreground uppercase tracking-wide">Net Worth</span>
            <span className={`text-xl font-bold ${groupedAccounts.netWorth >= 0 ? 'text-positive' : 'text-negative'}`}>
              {formatVal(groupedAccounts.netWorth)}
            </span>
          </div>
        </div>

        {/* Classified Accounts Ledger */}
        <div className="space-y-3 px-0">
          {Object.entries(groupedAccounts.groups).map(([key, group]) => {
            if (group.items.length === 0) return null;
            const Icon = group.icon;

            const isCollapsed = collapsedSections[key];

            return (
              <div key={key} className="overflow-hidden text-xs bg-secondary p-3.5 sm:p-4 space-y-2">
                
                {/* Section Header */}
                <div 
                  onClick={() => toggleSection(key)}
                  className={`flex justify-between items-center px-1 py-2 cursor-pointer hover:bg-muted/20 rounded-lg transition select-none ${!isCollapsed ? 'pb-2.5 border-b border-border/40' : ''}`}
                >
                  <div className="flex items-center gap-1.5 flex-shrink-0 min-w-0">
                    <Icon size={16} className={group.color} />
                    <span className="font-extrabold text-foreground uppercase tracking-wider text-sm">{group.name}</span>
                  </div>
                  <div className="flex items-center gap-4 ml-auto">
                    {showBalances && (
                      key === 'credit' ? (
                        <div className="flex gap-5 text-right select-none pr-1">
                          <div>
                            <div className="text-[9px] text-muted-foreground font-semibold uppercase tracking-tight leading-tight">
                              Balance Payable
                            </div>
                            <div className="text-sm font-bold text-foreground font-mono mt-0.5">
                              {formatVal(creditCardTotals.payable)}
                            </div>
                          </div>
                          <div>
                            <div className="text-[9px] text-muted-foreground font-semibold uppercase tracking-tight leading-tight">
                              Outst. Balance
                            </div>
                            <div className="text-sm font-bold text-foreground font-mono mt-0.5">
                              {formatVal(creditCardTotals.outstanding)}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <span className={`font-mono text-sm font-bold ${group.total < 0 ? 'text-negative' : 'text-positive'}`}>
                          {formatVal(group.total)}
                        </span>
                      )
                    )}
                    <span className="text-muted-foreground/60 transition-transform duration-200">
                      {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    </span>
                  </div>
                </div>

                {/* Account Rows */}
                {!isCollapsed && (
                  <div className="pt-1 space-y-0.5">
                    {group.items.map((acc) => {
                      const isCreditCard = key === 'credit';
                      return (
                        <div 
                          key={acc.id}
                          onClick={() => router.push(`/transactions?account=${acc.id}`)}
                          className="flex justify-between items-center px-2 py-3 hover:bg-muted/30 transition cursor-pointer"
                        >
                          <div className="min-w-0 pr-4 space-y-1">
                            <span className="text-sm font-semibold text-foreground truncate block">{acc.name}</span>
                            {acc.notes && <span className="text-[11px] text-muted-foreground/80 block truncate max-w-[200px]">{acc.notes}</span>}
                            {isCreditCard && acc.dueDate && (
                              <div className="flex flex-wrap gap-1 mt-1 select-none">
                                <span className="inline-flex items-center gap-0.5 bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20 text-[9px] font-bold">
                                  📅 Due Day: {acc.dueDate}th
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="shrink-0 flex gap-8 text-right font-mono select-none">
                            {isCreditCard ? (
                              (() => {
                                const cc = calculateCreditCardBalances(acc, allTransactions);
                                return (
                                  <div className="flex gap-5 text-right items-center">
                                    <div className="min-w-[70px]">
                                      <span className="text-sm font-bold text-negative block">
                                        {formatVal(cc.payable)}
                                      </span>
                                    </div>
                                    <div className="min-w-[70px]">
                                      <span className="text-sm font-bold text-muted-foreground block">
                                        {formatVal(cc.outstanding)}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })()
                            ) : (
                              <div className="min-w-[80px]">
                                <span className={`text-sm font-bold block ${acc.balance < 0 ? 'text-negative' : 'text-positive'}`}>
                                  {formatVal(acc.balance)}
                                </span>
                                {key === 'loan' && (
                                  <span className="block text-[10px] text-muted-foreground/60 font-normal mt-0.5">
                                    {acc.interestRate ? `Rate: ${acc.interestRate}%` : ''}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </div>

      {/* Create Account Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Create New Account"
        description="Set up a new bank, cash, credit card, or loan ledger"
      >
        <form onSubmit={handleAddAccount} className="space-y-5 text-sm font-semibold">
          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
              Account Name *
            </label>
            <input
              type="text"
              required
              value={newAccName}
              onChange={(e) => setNewAccName(e.target.value)}
              className="w-full text-sm bg-[#0b0f1a] border border-border rounded-lg px-3.5 py-2.5 text-foreground focus:outline-none focus:border-primary transition"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                Account Type
              </label>
              <div className="relative">
                <select
                  value={newAccType}
                  onChange={(e) => setNewAccType(e.target.value as any)}
                  className="w-full text-sm bg-[#0b0f1a] border border-border rounded-lg px-3.5 py-2.5 text-foreground appearance-none cursor-pointer focus:outline-none focus:border-primary transition font-bold"
                >
                  <option value="accounts">🏦 Bank Account</option>
                  <option value="cash">💵 Cash Account</option>
                  <option value="credit">💳 Credit Card</option>
                  <option value="loan">📉 Loan Account</option>
                </select>
                <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none opacity-60" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                Base Balance (₹)
              </label>
              <input
                type="number"
                step="any"
                value={newAccBalance}
                onChange={(e) => setNewAccBalance(e.target.value)}
                className="w-full text-sm bg-[#0b0f1a] border border-border rounded-lg px-3.5 py-2.5 text-foreground focus:outline-none focus:border-primary transition font-mono font-bold"
              />
            </div>
          </div>

          {newAccType === 'credit' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Credit Limit (₹)
                </label>
                <input
                  type="number"
                  step="any"
                  value={newAccLimit}
                  onChange={(e) => setNewAccLimit(e.target.value)}
                  className="w-full text-sm bg-[#0b0f1a] border border-border rounded-lg px-3.5 py-2.5 text-foreground focus:outline-none focus:border-primary transition font-mono font-bold"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Cycle Start Day
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={newAccBillingCycle}
                    onChange={(e) => setNewAccBillingCycle(e.target.value)}
                    className="w-full text-sm bg-[#0b0f1a] border border-border rounded-lg px-2.5 py-2.5 text-foreground focus:outline-none focus:border-primary transition font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Due Day (1-31)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={newAccDueDay}
                    onChange={(e) => setNewAccDueDay(e.target.value)}
                    className="w-full text-sm bg-[#0b0f1a] border border-border rounded-lg px-2.5 py-2.5 text-foreground focus:outline-none focus:border-primary transition font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Min Payment (₹)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={newAccMinPayment}
                    onChange={(e) => setNewAccMinPayment(e.target.value)}
                    className="w-full text-sm bg-[#0b0f1a] border border-border rounded-lg px-2.5 py-2.5 text-foreground focus:outline-none focus:border-primary transition font-mono font-bold"
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
                  value={newAccNotifyDays}
                  onChange={(e) => setNewAccNotifyDays(e.target.value)}
                  className="w-full text-sm bg-[#0b0f1a] border border-border rounded-lg px-3.5 py-2.5 text-foreground focus:outline-none focus:border-primary transition font-mono font-bold"
                />
              </div>
            </div>
          )}

          {newAccType === 'loan' && (
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                Interest Rate (% p.a.)
              </label>
              <input
                type="number"
                step="0.01"
                value={newAccInterest}
                onChange={(e) => setNewAccInterest(e.target.value)}
                className="w-full text-sm bg-[#0b0f1a] border border-border rounded-lg px-3.5 py-2.5 text-foreground focus:outline-none focus:border-primary transition font-mono font-bold"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
              Notes / Description
            </label>
            <textarea
              value={newAccNotes}
              onChange={(e) => setNewAccNotes(e.target.value)}
              rows={2}
              className="w-full text-sm bg-[#0b0f1a] border border-border rounded-lg px-3.5 py-2.5 text-foreground focus:outline-none focus:border-primary transition font-medium"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="flex-1 bg-secondary text-foreground hover:bg-secondary/70 border border-border px-4 py-2.5 rounded-lg text-sm font-bold transition uppercase tracking-wider active:scale-95"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary-light px-4 py-2.5 rounded-lg text-sm font-black transition uppercase tracking-wider shadow-sm active:scale-95"
            >
              Create Account
            </button>
          </div>
        </form>
      </Modal>

      {/* Reorder Accounts & Groups Modal */}
      <Modal
        isOpen={isReorderModalOpen}
        onClose={() => setIsReorderModalOpen(false)}
        title="Modify Display Order"
        description="Reorder account groups or individual accounts"
      >
        <div className="space-y-4">
          {/* Tab Switcher */}
          <div className="flex bg-secondary/80 p-1 rounded-xl border border-border/60">
            <button
              onClick={() => setReorderTab('groups')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${
                reorderTab === 'groups'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              📂 Account Groups
            </button>
            <button
              onClick={() => setReorderTab('accounts')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${
                reorderTab === 'accounts'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              💳 Accounts List
            </button>
          </div>

          {/* Groups Reorder Tab */}
          {reorderTab === 'groups' && (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1 select-scrollbar">
              {Object.entries(groupedAccounts.groups).map(([key, group], idx, arr) => {
                const GroupIcon = group.icon;
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between p-3 bg-secondary/60 border border-border/40 rounded-xl"
                  >
                    <div className="flex items-center gap-2">
                      <GroupIcon size={16} className={group.color} />
                      <span className="text-sm font-bold text-foreground">{group.name}</span>
                    </div>
                  <div className="flex items-center gap-1">
                    <button
                      disabled={idx === 0}
                      onClick={() => moveGroup(idx, 'up')}
                      className="p-1.5 rounded-lg border border-border/60 hover:bg-muted/40 disabled:opacity-30 disabled:pointer-events-none transition"
                      title="Move Up"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      disabled={idx === arr.length - 1}
                      onClick={() => moveGroup(idx, 'down')}
                      className="p-1.5 rounded-lg border border-border/60 hover:bg-muted/40 disabled:opacity-30 disabled:pointer-events-none transition"
                      title="Move Down"
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
            </div>
          )}

          {/* Individual Accounts Reorder Tab */}
          {reorderTab === 'accounts' && (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1 select-scrollbar">
              {accounts.map((acc, idx) => (
                <div
                  key={acc.id}
                  className="flex items-center justify-between p-3 bg-secondary/60 border border-border/40 rounded-xl"
                >
                  <div className="min-w-0 pr-2">
                    <div className="text-sm font-bold text-foreground truncate">{acc.name}</div>
                    <div className="text-[10px] text-muted-foreground capitalize mt-0.5">
                      {acc.category || acc.type} • ₹{acc.balance.toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      disabled={idx === 0}
                      onClick={() => moveAccount(acc.id, 'up')}
                      className="p-1.5 rounded-lg border border-border/60 hover:bg-muted/40 disabled:opacity-30 disabled:pointer-events-none transition"
                      title="Move Up"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      disabled={idx === accounts.length - 1}
                      onClick={() => moveAccount(acc.id, 'down')}
                      className="p-1.5 rounded-lg border border-border/60 hover:bg-muted/40 disabled:opacity-30 disabled:pointer-events-none transition"
                      title="Move Down"
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="pt-2">
            <button
              onClick={() => setIsReorderModalOpen(false)}
              className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl font-bold uppercase tracking-wider text-xs shadow-sm hover:brightness-110 active:scale-95 transition"
            >
              Done Reordering
            </button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
