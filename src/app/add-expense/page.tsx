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
    if (!description.trim()) {
      toast.error('Please enter a description.');
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
      description: description.trim(),
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
    toast.success('Transaction deleted');
  }

  const keypadButtons = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];

  return (
    <AppLayout>
      <div className={`max-w-md mx-auto px-4 pt-3 ${isInputFocused ? 'pb-8' : 'pb-[240px]'} space-y-4 bg-background transition-all`}>
        
        {/* Header Tabs (Segmented Select type) */}
        <div className="flex bg-secondary p-1 border border-border rounded-lg">
          {(['expense', 'income', 'transfer'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setType(t);
                setCategory('');
                setSubcategory('');
              }}
              className={`flex-1 text-center py-2 rounded text-xs font-bold uppercase tracking-wider transition ${
                type === t 
                  ? 'bg-primary text-primary-foreground font-black' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Dense Entry Form */}
        <div className="bg-secondary p-3.5 rounded-lg border border-border/80 space-y-3.5 text-sm">
          
          {/* Row 1: Amount Display (Huge and aligned) */}
          <div className="flex items-center justify-between border-b border-border/60 pb-2">
            <span className="text-xs font-bold text-muted-foreground uppercase">Amount (₹)</span>
            <input
              type="text"
              readOnly
              value={amount}
              className="text-3xl font-bold font-mono tracking-tight text-right text-foreground bg-transparent focus:outline-none placeholder:text-muted-foreground/30 max-w-[200px]"
            />
          </div>

          {/* Row 2: Date & Time */}
          <div className="flex items-center justify-between gap-4 border-b border-border/30 pb-2">
            <span className="text-xs font-bold text-muted-foreground uppercase shrink-0">Date & Time</span>
            <input
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent text-right font-semibold text-foreground focus:outline-none cursor-pointer text-base"
            />
          </div>

          {/* Row 3: Account Select */}
          {type === 'transfer' ? (
            <>
              <div className="flex items-center justify-between gap-4 border-b border-border/30 pb-2">
                <span className="text-xs font-bold text-muted-foreground uppercase shrink-0">From Account</span>
                <select
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  className="bg-transparent text-right font-semibold text-foreground focus:outline-none cursor-pointer text-base"
                >
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id} className="bg-secondary">{acc.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-between gap-4 border-b border-border/30 pb-2">
                <span className="text-xs font-bold text-muted-foreground uppercase shrink-0">To Account</span>
                <select
                  value={toAccount}
                  onChange={(e) => setToAccount(e.target.value)}
                  className="bg-transparent text-right font-semibold text-foreground focus:outline-none cursor-pointer text-base"
                >
                  {accounts.filter(a => a.id !== account).map(acc => (
                    <option key={acc.id} value={acc.id} className="bg-secondary">{acc.name}</option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between gap-4 border-b border-border/30 pb-2">
              <span className="text-xs font-bold text-muted-foreground uppercase shrink-0">Account</span>
              <select
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                className="bg-transparent text-right font-semibold text-foreground focus:outline-none cursor-pointer text-base"
              >
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id} className="bg-secondary">{acc.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Row 4: Category & Subcategory */}
          {type !== 'transfer' && (
            <div className="grid grid-cols-2 gap-4 border-b border-border/30 pb-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-muted-foreground uppercase shrink-0">Category</span>
                <select
                  value={category}
                  onChange={(e) => {
                    if (e.target.value === 'ADD_NEW') {
                      setIsAddCategoryOpen(true);
                      return;
                    }
                    setCategory(e.target.value);
                    const targetCat = categoriesMeta.find(c => c.name.toLowerCase() === e.target.value.toLowerCase());
                    setSubcategory(targetCat?.subcategories?.[0] || '');
                  }}
                  className="bg-transparent text-right font-semibold text-foreground focus:outline-none cursor-pointer text-base select-none max-w-[120px] truncate"
                >
                  <option value="" className="bg-secondary">Select</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat} className="bg-secondary">{cat}</option>
                  ))}
                  <option value="ADD_NEW" className="bg-secondary text-primary font-bold">+ New...</option>
                </select>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-muted-foreground uppercase shrink-0">Subcat</span>
                <select
                  value={subcategory}
                  onChange={(e) => {
                    if (e.target.value === 'ADD_NEW') {
                      setIsAddSubcategoryOpen(true);
                      return;
                    }
                    setSubcategory(e.target.value);
                  }}
                  disabled={!category}
                  className="bg-transparent text-right font-semibold text-foreground focus:outline-none cursor-pointer text-base max-w-[120px] truncate disabled:opacity-50"
                >
                  <option value="" className="bg-secondary">None</option>
                  {activeCategorySubcategories.map(sub => (
                    <option key={sub} value={sub} className="bg-secondary">{sub}</option>
                  ))}
                  {category && <option value="ADD_NEW" className="bg-secondary text-primary font-bold">+ New...</option>}
                </select>
              </div>
            </div>
          )}

          {/* Row 5: Description */}
          <div className="flex items-center justify-between gap-4 border-b border-border/30 pb-2">
            <span className="text-xs font-bold text-muted-foreground uppercase shrink-0">Description</span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
              className="bg-transparent text-right font-semibold text-foreground focus:outline-none placeholder:text-muted-foreground/35 max-w-[200px] text-base"
            />
          </div>

          {/* Row 6: Notes */}
          <div className="flex items-center justify-between gap-4 pb-1">
            <span className="text-xs font-bold text-muted-foreground uppercase shrink-0">Notes</span>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
              className="bg-transparent text-right font-semibold text-foreground focus:outline-none placeholder:text-muted-foreground/35 max-w-[200px] text-base"
            />
          </div>

        </div>

        {/* custom numeric keypad */}
        {!isInputFocused && (
          <div className="fixed bottom-16 md:bottom-4 left-0 right-0 z-40 max-w-md mx-auto bg-secondary border-t md:border border-border/80 p-3 shadow-2xl space-y-2">
            <div className="grid grid-cols-3 gap-1.5 font-mono text-2xl font-bold">
              {keypadButtons.map((btn) => (
                <button
                  key={`keypad-${btn}`}
                  type="button"
                  onClick={() => handleKeypadPress(btn)}
                  className="py-4 bg-background hover:bg-muted/40 rounded border border-border/40 transition active:scale-95 text-foreground flex items-center justify-center cursor-pointer select-none"
                >
                  {btn}
                </button>
              ))}
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => handleSubmit()}
                className="flex-1 py-2.5 bg-primary text-primary-foreground font-black uppercase text-xs tracking-wider rounded shadow-md active:scale-95 transition cursor-pointer"
              >
                Save Transaction
              </button>
              <button
                onClick={() => router.push('/transactions')}
                className="flex-1 py-2.5 bg-background border border-border text-muted-foreground font-bold uppercase text-xs tracking-wider rounded active:scale-95 transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Today's logged transactions (dense summary for confirmation) */}
        {todayTxns.length > 0 && (
          <div className="bg-secondary/40 p-3 rounded-lg border border-border/60 space-y-2 text-xs">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground pb-1 border-b border-border/50">Recorded Today ({todayTxns.length})</p>
            <div className="divide-y divide-border/20 max-h-36 overflow-y-auto pr-1">
              {todayTxns.map((t) => (
                <div key={t.id} className="py-1.5 flex justify-between items-center">
                  <div>
                    <p className="text-sm font-bold text-foreground truncate max-w-[150px]">{t.description}</p>
                    <p className="text-[11px] text-muted-foreground">{t.type === 'transfer' ? 'Transfer' : t.category} • {getAccountName(t.account)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`font-mono text-sm font-bold ${t.type === 'income' ? 'text-positive' : t.type === 'expense' ? 'text-negative' : 'text-foreground'}`}>
                      {t.type === 'income' ? '+' : t.type === 'expense' ? '-' : ''}{t.amount.toLocaleString('en-IN')}
                    </span>
                    <button 
                      onClick={() => handleDelete(t)}
                      className="text-muted-foreground hover:text-negative font-bold p-1 text-xs"
                      title="Delete entry"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Modals for Add Category / Subcategory */}
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
    </AppLayout>
  );
}
