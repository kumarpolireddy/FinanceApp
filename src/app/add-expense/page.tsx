'use client';

import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import Modal from '@/components/ui/Modal';
import { toast } from 'sonner';
import {
  saveTransaction,
  getTransactions,
  deleteTransaction,
  getAccounts,
  getCategories,
  saveCategories,
  type Transaction,
  type Account,
  type Category,
} from '@/lib/storage';
import {
  ArrowLeftRight,
  Calendar,
  ChevronDown,
  Landmark,
  PlusCircle,
  ReceiptText,
  TrendingDown,
  TrendingUp,
  ArrowLeft,
  Camera,
  Check,
} from 'lucide-react';

function cleanString(val: unknown): string {
  if (val === undefined || val === null) return '';
  const str = String(val).trim();
  return str.replace(/[^\w\s\-&/().,]/g, '').trim();
}

type TxnType = 'expense' | 'income' | 'transfer';

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

function todayDateTimeISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

const COLOR_PRESETS = ['#ef4444', '#f97316', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#6b7280'];
const ICON_PRESETS = ['🍽️', '🚗', '🛍️', '🎬', '💡', '🏥', '🛒', '⛽', '🏠', '📈', '💼', '💻', '💰', '🎁'];

export default function AddExpensePage() {
  const router = useRouter();
  const [type, setType] = useState<TxnType>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [account, setAccount] = useState('');
  const [toAccount, setToAccount] = useState('');
  const [date, setDate] = useState(todayDateTimeISO());
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(false);
  const [todayTxns, setTodayTxns] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categoriesMeta, setCategoriesMeta] = useState<Category[]>([]);
  const [filterDate, setFilterDate] = useState(todayISO());

  // Add Category Modal States
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState(COLOR_PRESETS[0]);
  const [newCategoryIcon, setNewCategoryIcon] = useState(ICON_PRESETS[0]);

  // Add Subcategory Modal States
  const [isAddSubcategoryOpen, setIsAddSubcategoryOpen] = useState(false);
  const [newSubcategoryName, setNewSubcategoryName] = useState('');
  const [deletingTxn, setDeletingTxn] = useState<Transaction | null>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);

  useEffect(() => {
    const accs = getAccounts();
    setAccounts(accs);
    setCategoriesMeta(getCategories());
    if (accs.length > 0) {
      setAccount(accs[0].id);
      if (accs.length > 1) {
        setToAccount(accs[1].id);
      } else {
        setToAccount(accs[0].id);
      }
    }
    loadDayTxns(todayISO());

    const params = new URLSearchParams(window.location.search);
    const urlType = params.get('type') as TxnType | null;
    if (urlType === 'transfer' || urlType === 'income' || urlType === 'expense') {
      setType(urlType);
    }
  }, []);

  function loadDayTxns(day: string) {
    const all = getTransactions()
      .filter((t) => t.date && t.date.startsWith(day))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    setTodayTxns(all);
  }

  const categories = useMemo(() => {
    return categoriesMeta.filter((c) => c.type === type).map((c) => c.name);
  }, [categoriesMeta, type]);

  const activeCategorySubcategories = useMemo(() => {
    if (!category) return [];
    const cat = categoriesMeta.find((c) => c.name.toLowerCase() === category.toLowerCase());
    return cat?.subcategories || [];
  }, [categoriesMeta, category]);

  function getAccountName(id: string) {
    return accounts.find((a) => a.id === id)?.name || 'Unknown';
  }

  function handleKeypadPress(val: string) {
    if (val === '⌫') {
      setAmount((prev) => prev.slice(0, -1));
    } else if (val === '.') {
      setAmount((prev) => (prev.includes('.') ? prev : prev + '.'));
    } else {
      setAmount((prev) => prev + val);
    }
  }

  function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!amount || Number(amount) <= 0) {
      toast.error('Please enter a valid amount.');
      return;
    }
    if (!account) {
      toast.error('Please select a payment account.');
      return;
    }
    if (type !== 'transfer' && !category) {
      toast.error('Please select a category.');
      return;
    }
    if (type === 'transfer' && !toAccount) {
      toast.error('Please select a destination account.');
      return;
    }
    if (type === 'transfer' && account === toAccount) {
      toast.error('Source and destination accounts must be different.');
      return;
    }

    saveTransaction({
      date,
      description: description.trim() || (type === 'transfer' ? 'Transfer' : (category || 'Expense')),
      category: type === 'transfer' ? 'Transfer' : category,
      subcategory: type === 'transfer' ? undefined : subcategory || undefined,
      account,
      toAccount: type === 'transfer' ? toAccount : undefined,
      amount: parseFloat(amount),
      type,
      notes: notes.trim() || undefined,
    });

    setSaved(true);
    setAmount('');
    setDescription('');
    setNotes('');
    setCategory('');
    setSubcategory('');
    const dayOnly = date.slice(0, 10);
    setFilterDate(dayOnly);
    loadDayTxns(dayOnly);
    setAccounts(getAccounts());
    setDate(todayDateTimeISO());
    toast.success('Transaction saved!');
    setTimeout(() => {
      setSaved(false);
      router.push('/transactions');
    }, 800);
  }

  const handleAddCategorySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = cleanString(newCategoryName);
    if (!cleanName) {
      toast.error('Please enter a valid category name.');
      return;
    }

    const exists = categoriesMeta.some((c) => c.name.toLowerCase() === cleanName.toLowerCase());
    if (exists) {
      toast.error('Category already exists.');
      return;
    }

    const allCats = getCategories();
    const newCat: Category = {
      id: `cat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName,
      type: type === 'income' ? 'income' : 'expense',
      color: newCategoryColor,
      icon: newCategoryIcon,
      subcategories: [],
    };
    allCats.push(newCat);
    saveCategories(allCats);

    setCategoriesMeta(allCats);
    setCategory(cleanName);
    setSubcategory('');

    setNewCategoryName('');
    setIsAddCategoryOpen(false);
    toast.success(`Category "${cleanName}" added successfully.`);
  };

  const handleAddSubcategorySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSub = cleanString(newSubcategoryName);
    if (!cleanSub) {
      toast.error('Please enter a valid subcategory name.');
      return;
    }

    if (!category) {
      toast.error('Please select a category first.');
      return;
    }

    const allCats = getCategories();
    const targetCat = allCats.find((c) => c.name.toLowerCase() === category.toLowerCase());
    if (!targetCat) {
      toast.error('Selected category not found.');
      return;
    }

    if (!targetCat.subcategories) {
      targetCat.subcategories = [];
    }

    const exists = targetCat.subcategories.some((s) => s.toLowerCase() === cleanSub.toLowerCase());
    if (exists) {
      toast.error('Subcategory already exists.');
      return;
    }

    targetCat.subcategories.push(cleanSub);
    saveCategories(allCats);

    setCategoriesMeta(allCats);
    setSubcategory(cleanSub);

    setNewSubcategoryName('');
    setIsAddSubcategoryOpen(false);
    toast.success(`Subcategory "${cleanSub}" added.`);
  };

  function handleDelete(txn: Transaction) {
    deleteTransaction(txn.id, 'reverse');
    loadDayTxns(filterDate);
    setAccounts(getAccounts());
  }

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

  return (
    <div className="fixed inset-0 z-50 bg-[#1F2027] flex flex-col text-[#F2F2F4] select-text animate-fade-in overflow-hidden">
      {/* Header with Always Visible Save Button */}
      <div className="flex items-center justify-between h-14 px-5 bg-[#1F2027] shrink-0 border-b border-white/[0.08] sticky top-0 z-30">
        <div className="flex items-center">
          <button 
            type="button"
            onClick={() => router.push('/transactions')}
            className="text-[#F2F2F4] hover:bg-white/[0.08] transition flex items-center justify-center h-10 w-10 shrink-0 -ml-2 rounded-full"
            title="Cancel"
          >
            <ArrowLeft size={24} />
          </button>
          <h2 className="text-[20px] font-medium text-[#F2F2F4] ml-2 capitalize">
            {type}
          </h2>
        </div>

        <button
          type="button"
          onClick={() => handleSubmit()}
          className="px-4 py-2 bg-primary text-primary-foreground font-black text-xs uppercase tracking-wider rounded-lg hover:opacity-90 active:scale-95 transition shadow-sm"
        >
          Save Transaction
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto w-full max-w-2xl mx-auto pb-12">
        <form onSubmit={handleSubmit} className="flex flex-col">
          
          {/* Transaction Type Selector */}
          <div className="grid grid-cols-3 gap-2.5 px-5 mt-2">
            {(['income', 'expense', 'transfer'] as const).map((t) => {
              const isActive = type === t;
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
                  onClick={() => {
                    setType(t);
                    setCategory('');
                    setSubcategory('');
                  }}
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
                {formatDisplayDate(date)}
              </div>
              <input
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
            </div>

            {/* Amount Row */}
            <div className="relative flex items-center h-[54px] border-b border-white/[0.08] px-5">
              <span className="text-[15px] text-[#A5A6AD] w-[110px] shrink-0 font-normal">Amount</span>
              <div className="flex-1 flex items-center text-[17px] text-[#F2F2F4] font-medium">
                <span className="mr-1">₹</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onFocus={() => setIsInputFocused(true)}
                  onBlur={() => setIsInputFocused(false)}
                  required
                  min="0.01"
                  step="any"
                  className="bg-transparent border-none text-left focus:outline-none text-[#F2F2F4] font-medium w-full p-0"
                />
              </div>
            </div>

            {/* Conditional Transfer Account Rows */}
            {type === 'transfer' ? (
              <>
                {/* From Account */}
                <div className="relative flex items-center h-[54px] border-b border-white/[0.08] px-5">
                  <span className="text-[15px] text-[#A5A6AD] w-[110px] shrink-0 font-normal">Account</span>
                  <div className="flex-1 flex items-center text-[17px] text-[#F2F2F4] font-medium select-none pointer-events-none">
                    <span>{accounts.find(a => a.id === account)?.name || 'Select account'}</span>
                  </div>
                  <select
                    value={account}
                    onChange={(e) => setAccount(e.target.value)}
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

                {/* To Account */}
                <div className="relative flex items-center h-[54px] border-b border-white/[0.08] px-5">
                  <span className="text-[15px] text-[#A5A6AD] w-[110px] shrink-0 font-normal">To Account</span>
                  <div className="flex-1 flex items-center text-[17px] text-[#F2F2F4] font-medium select-none pointer-events-none">
                    <span>{accounts.find(a => a.id === toAccount)?.name || 'Select destination...'}</span>
                  </div>
                  <select
                    value={toAccount}
                    onChange={(e) => setToAccount(e.target.value)}
                    required
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  >
                    <option value="" disabled className="text-muted-foreground">Select destination...</option>
                    {accounts.filter((acc) => acc.id !== account).map((acc) => (
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
                    <span>{category || 'Select category'}</span>
                  </div>
                  <select
                    value={category}
                    onChange={(e) => {
                      setCategory(e.target.value);
                      setSubcategory('');
                    }}
                    required
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  >
                    <option value="" disabled className="text-muted-foreground">Select category</option>
                    {categories.map((catName) => (
                      <option key={catName} value={catName} className="bg-[#1F2027] text-[#F2F2F4]">
                        {catName}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Account Row */}
                <div className="relative flex items-center h-[54px] border-b border-white/[0.08] px-5">
                  <span className="text-[15px] text-[#A5A6AD] w-[110px] shrink-0 font-normal">Account</span>
                  <div className="flex-1 flex items-center text-[17px] text-[#F2F2F4] font-medium select-none pointer-events-none">
                    <span>{accounts.find(a => a.id === account)?.name || 'Select account'}</span>
                  </div>
                  <select
                    value={account}
                    onChange={(e) => setAccount(e.target.value)}
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
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                rows={1}
                className="bg-transparent border-none text-left text-[17px] text-[#F2F2F4] font-medium focus:outline-none w-full p-0 resize-none h-auto min-h-[26px]"
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
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                className="bg-transparent border-none text-left text-[17px] text-[#F2F2F4] font-medium focus:outline-none w-full p-0 pr-8"
              />
              <Camera size={20} className="text-[#A5A6AD] hover:text-[#F2F2F4] cursor-pointer shrink-0 absolute right-5" />
            </div>
          </div>

          {/* Bottom Action Grid */}
          <div className="px-5 mt-5">
            <button
              type="button"
              onClick={() => handleSubmit()}
              className="w-full h-12 rounded-[10px] bg-primary text-primary-foreground font-black text-sm uppercase tracking-wider hover:opacity-90 active:scale-95 transition-all shadow-md flex items-center justify-center gap-2"
            >
              <Check size={18} />
              <span>Save Transaction</span>
            </button>
          </div>

        </form>
      </div>

      {isAddCategoryOpen && (
        <Modal
          isOpen={isAddCategoryOpen}
          onClose={() => setIsAddCategoryOpen(false)}
          title="Create Custom Category"
        >
          <form onSubmit={handleAddCategorySubmit} className="space-y-3.5 text-2xs">
            <div>
              <label className="block text-[9px] font-bold text-muted-foreground uppercase mb-1">Category Name *</label>
              <input
                type="text"
                required
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="e.g. Subscriptions"
                className="w-full rounded border border-border bg-background p-2 text-2xs focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-[9px] font-bold text-muted-foreground uppercase mb-1.5">Color Tag</label>
              <div className="flex flex-wrap gap-1.5">
                {COLOR_PRESETS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewCategoryColor(c)}
                    className="w-5 h-5 rounded-full border transition active:scale-90"
                    style={{ backgroundColor: c, borderColor: newCategoryColor === c ? '#ffffff' : 'transparent' }}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[9px] font-bold text-muted-foreground uppercase mb-1.5">Emoji Icon</label>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto bg-background p-1.5 border border-border rounded">
                {ICON_PRESETS.map(emoji => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setNewCategoryIcon(emoji)}
                    className={`text-sm p-1 rounded transition hover:bg-muted ${newCategoryIcon === emoji ? 'bg-primary/20 scale-110' : ''}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-1.5">
              <button type="submit" className="flex-1 py-2 bg-primary text-primary-foreground font-bold rounded">Create</button>
              <button type="button" onClick={() => setIsAddCategoryOpen(false)} className="flex-1 py-2 bg-secondary border border-border rounded text-muted-foreground">Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {isAddSubcategoryOpen && (
        <Modal
          isOpen={isAddSubcategoryOpen}
          onClose={() => setIsAddSubcategoryOpen(false)}
          title="Create Custom Subcategory"
        >
          <form onSubmit={handleAddSubcategorySubmit} className="space-y-3.5 text-2xs">
            <div>
              <p className="text-muted-foreground mb-2">Creating subcategory for: <span className="font-bold text-foreground uppercase">{category}</span></p>
              <label className="block text-[9px] font-bold text-muted-foreground uppercase mb-1">Subcategory Name *</label>
              <input
                type="text"
                required
                value={newSubcategoryName}
                onChange={(e) => setNewSubcategoryName(e.target.value)}
                placeholder="e.g. Netflix"
                className="w-full rounded border border-border bg-background p-2 text-2xs focus:outline-none focus:border-primary"
              />
            </div>

            <div className="flex gap-2 pt-1.5">
              <button type="submit" className="flex-1 py-2 bg-primary text-primary-foreground font-bold rounded">Create</button>
              <button type="button" onClick={() => setIsAddSubcategoryOpen(false)} className="flex-1 py-2 bg-secondary border border-border rounded text-muted-foreground">Cancel</button>
            </div>
          </form>
        </Modal>
      )}

    </div>
  );
}
