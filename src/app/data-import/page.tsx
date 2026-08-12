'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import DropZone from './components/DropZone';
import ColumnMapper, { ColumnMapping } from './components/ColumnMapper';
import ImportPreview, { PreviewRow } from './components/ImportPreview';
import ImportProgress from './components/ImportProgress';
import CategoryWizard, { CategoryMap } from './components/CategoryWizard';
import { Upload, Map, Eye, CheckCircle, Play, ChevronRight, Database } from 'lucide-react';
import { toast } from 'sonner';
import {
  getTransactions,
  getAccounts,
  getCategories,
  saveAccounts,
  saveCategories,
  type Transaction,
  type Category,
  type AccountCategory,
  type Account,
} from '@/lib/storage';

type WizardStep = 'upload' | 'map-columns' | 'map-categories' | 'preview' | 'importing' | 'done';

const WIZARD_STEPS: { id: WizardStep; label: string; icon: React.ElementType }[] = [
  { id: 'upload', label: 'Upload File', icon: Upload },
  { id: 'map-columns', label: 'Map Columns', icon: Map },
  { id: 'map-categories', label: 'Map Categories', icon: Database },
  { id: 'preview', label: 'Preview & Validate', icon: Eye },
  { id: 'importing', label: 'Import', icon: Play },
];

const INITIAL_COLUMN_MAPPINGS: ColumnMapping[] = [
  { sourceColumn: 'Date', targetField: 'date', confidence: 98, status: 'mapped' },
  { sourceColumn: 'Account', targetField: 'account', confidence: 98, status: 'mapped' },
  { sourceColumn: 'Category', targetField: 'category', confidence: 98, status: 'mapped' },
  { sourceColumn: 'Subcategory', targetField: 'subcategory', confidence: 98, status: 'mapped' },
  { sourceColumn: 'Description', targetField: 'description', confidence: 98, status: 'mapped' },
  { sourceColumn: 'Note', targetField: 'notes', confidence: 98, status: 'mapped' },
  { sourceColumn: 'Amount', targetField: 'amount', confidence: 98, status: 'mapped' },
  { sourceColumn: 'Income/Expense', targetField: 'type', confidence: 98, status: 'mapped' },
  { sourceColumn: 'INR', targetField: 'ignore', confidence: 50, status: 'ignored' },
  { sourceColumn: 'Currency', targetField: 'ignore', confidence: 50, status: 'ignored' },
  { sourceColumn: 'Account_1', targetField: 'ignore', confidence: 50, status: 'ignored' },
];

function formatDateLocal(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseExcelDate(val: unknown): string {
  if (val instanceof Date) {
    return val.toISOString();
  }
  if (typeof val === 'number') {
    // Correcting for Excel Leap Year Bug (Excel epoch offset)
    const epochOffset = val > 60 ? 25569 : 25568;
    const date = new Date((val - epochOffset) * 86400 * 1000);
    return date.toISOString();
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) {
      return new Date().toISOString();
    }

    // Pattern 1: YYYY-MM-DD or YYYY/MM/DD
    const ymdPattern = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/;
    const ymdMatch = trimmed.match(ymdPattern);
    if (ymdMatch) {
      const [_, year, month, day] = ymdMatch;
      const timePart = trimmed.slice(ymdMatch[0].length).trim();
      if (timePart) {
        const date = new Date(trimmed.replace(/\//g, '-'));
        if (!isNaN(date.getTime())) {
          return date.toISOString();
        }
      }
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00.000Z`;
    }

    // Pattern 2: DD-MM-YYYY or DD/MM/YYYY
    const dmyPattern = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/;
    const dmyMatch = trimmed.match(dmyPattern);
    if (dmyMatch) {
      const [_, day, month, year] = dmyMatch;
      const timePart = trimmed.slice(dmyMatch[0].length).trim();
      if (timePart) {
        const date = new Date(
          `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${timePart}`
        );
        if (!isNaN(date.getTime())) {
          return date.toISOString();
        }
        const date2 = new Date(
          `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')} ${timePart}`
        );
        if (!isNaN(date2.getTime())) {
          return date2.toISOString();
        }
      }
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00.000Z`;
    }

    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  return new Date().toISOString();
}

function cleanString(val: unknown): string {
  if (val === undefined || val === null) return '';
  return String(val)
    .replace(/[\uE000-\uFAFF]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function parseRowsWithMappings(rows: any[], mappings: ColumnMapping[]): PreviewRow[] {
  const getSourceCol = (field: string) =>
    mappings.find((m) => m.targetField === field && m.status === 'mapped')?.sourceColumn;

  const dateCol = getSourceCol('date');
  const amountCol = getSourceCol('amount');
  const categoryCol = getSourceCol('category');
  const subcategoryCol = getSourceCol('subcategory');
  const accountCol = getSourceCol('account');
  const notesCol = getSourceCol('notes'); // Target: transaction.notes (Excel Note/Memo)
  const descriptionCol = getSourceCol('description'); // Target: transaction.description (Excel Description/Merchant)
  const typeCol = getSourceCol('type');

  return rows.map((row: any, index: number) => {
    // 1. Date
    const rawDate = dateCol ? row[dateCol] : undefined;
    const dateStr = parseExcelDate(rawDate);

    // 2. Transaction Type Classification
    let type: 'income' | 'expense' | 'transfer' = 'expense';
    const rawTypeVal = typeCol && row[typeCol] ? String(row[typeCol]).toLowerCase().trim() : '';
    if (rawTypeVal.includes('transfer')) {
      type = 'transfer';
    } else if (rawTypeVal === 'income') {
      type = 'income';
    } else {
      type = 'expense';
    }

    // 3. Account
    const rawAccount = accountCol ? row[accountCol] : 'Cash';
    const accountName = cleanString(rawAccount) || 'Cash';

    // Destination Account for Transfers / Category / Subcategory
    let toAccountName = '';
    let categoryName: string | null = null;
    let subcategoryName: string | undefined = undefined;

    if (type === 'transfer') {
      toAccountName = categoryCol ? cleanString(row[categoryCol]) : '';
      categoryName = null;
      subcategoryName = undefined;
    } else {
      categoryName = categoryCol ? cleanString(row[categoryCol]) || 'Other' : 'Other';
      if (type === 'expense') {
        const rawSub = subcategoryCol ? cleanString(row[subcategoryCol]) : '';
        subcategoryName = rawSub || undefined;
      } else if (type === 'income') {
        const rawSub = subcategoryCol ? cleanString(row[subcategoryCol]) : '';
        subcategoryName = rawSub || undefined;
      }
    }

    // 5. Amount
    let amount = 0;
    if (amountCol && row[amountCol] !== undefined) {
      const rawVal = row[amountCol];
      if (typeof rawVal === 'number') {
        amount = Math.abs(rawVal);
      } else {
        amount = Math.abs(Number(String(rawVal).replace(/[^\d.-]/g, ''))) || 0;
      }
    }

    // 6. Notes and Descriptions (Do NOT merge)
    // Title is stored in the Note column (descriptionCol)
    // Description/Remarks is stored in the Description column (notesCol)
    const titleVal = descriptionCol ? row[descriptionCol] : undefined;
    const descVal = notesCol ? row[notesCol] : undefined;

    const description = titleVal !== undefined && titleVal !== null ? cleanString(titleVal) : '';
    const notes = descVal !== undefined && descVal !== null ? cleanString(descVal) : '';

    // Validation checks
    let status: 'valid' | 'duplicate' | 'error' = 'valid';
    let errorMessage: string | undefined = undefined;

    if (!dateStr || !accountName || amount <= 0) {
      status = 'error';
      errorMessage = 'Missing required fields or invalid amount';
    } else if (type === 'transfer') {
      if (!toAccountName) {
        status = 'error';
        errorMessage = 'Transfer destination account is missing';
      } else if (toAccountName.toLowerCase() === accountName.toLowerCase()) {
        status = 'error';
        errorMessage = 'Source and destination account cannot be the same.';
      }
    }

    return {
      id: `prev-${index}-${Date.now()}`,
      date: dateStr,
      description: description || 'Imported Transaction',
      category: categoryName,
      subcategory: subcategoryName,
      account: accountName,
      toAccount: type === 'transfer' ? toAccountName : undefined,
      amount,
      type,
      notes,
      status,
      errorMessage,
    } as PreviewRow;
  });
}

export default function DataImportPage() {
  const [importMode, setImportMode] = useState<'sqlite' | 'spreadsheet'>('sqlite');
  const [currentStep, setCurrentStep] = useState<WizardStep>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>(INITIAL_COLUMN_MAPPINGS);
  const [isImporting, setIsImporting] = useState(false);
  const [importDone, setImportDone] = useState(false);
  const [importedRows, setImportedRows] = useState<PreviewRow[]>([]);

  const [rawRows, setRawRows] = useState<any[]>([]);
  const [sampleRow, setSampleRow] = useState<Record<string, any> | undefined>(undefined);
  const [categoryMappings, setCategoryMappings] = useState<CategoryMap[]>([]);

  const [importStats, setImportStats] = useState({
    transactions: 0,
    duplicates: 0,
    categories: 0,
    accounts: 0,
  });

  const stepIndex = WIZARD_STEPS.findIndex((s) => s.id === currentStep);

  const handleImportSqlite = async (file: File) => {
    setIsImporting(true);
    setCurrentStep('importing');
    const toastId = toast.loading(`Importing Money Manager backup file "${file.name}"...`);

    try {
      const buffer = await file.arrayBuffer();
      const { parseMoneyManagerSqlite } = await import('@/lib/moneyManagerSqliteParser');
      const result = await parseMoneyManagerSqlite(buffer);

      if (!result.success || (result as any).error) {
        throw new Error((result as any).error || 'Failed to parse Money Manager SQLite file');
      }

      // 1. Process & Save Faithful Active Account Groups (ASSETGROUP) ONLY - Clear previous data
      const { saveAccountCategories, saveAccounts, saveCategories } = await import('@/lib/storage');
      
      const activeGroups = (result.assetGroups || []).filter((g) => !g.isDeleted);
      const newAccCats: AccountCategory[] = [];

      activeGroups.forEach((g) => {
        let baseType: 'accounts' | 'cash' | 'credit' | 'loan' = 'accounts';
        const n = g.name.toLowerCase();
        if (n.includes('card') || n.includes('credit')) baseType = 'credit';
        else if (n.includes('cash') || n.includes('wallet')) baseType = 'cash';
        else if (n.includes('borrow') || n.includes('lend') || n.includes('loan') || n.includes('debt') || n.includes('liability')) baseType = 'loan';

        newAccCats.push({
          id: `acc-cat-${g.uid || Date.now()}`,
          sourceUid: g.uid,
          name: g.name,
          baseType,
        });
      });

      saveAccountCategories(newAccCats);

      // 2. Process & Save Faithful Active Accounts (ASSETS) ONLY
      const newAccounts: Account[] = [];
      const accountIdMap: Record<string, string> = {};

      const activeAccounts = result.accounts.filter((a) => !a.isDeleted);
      activeAccounts.forEach((acc) => {
        const newAcc: Account = {
          id: acc.id || `acc-${acc.sourceUid || Date.now()}`,
          sourceUid: acc.sourceUid,
          groupUid: acc.groupUid,
          name: acc.name,
          type: acc.type,
          category: acc.category || acc.groupName || 'Main Accounts',
          balance: acc.balance || 0,
          openingBalance: acc.balance || 0,
          color: acc.color,
          visible: true,
          icon: acc.icon,
          isInformal: acc.isBorrowing || acc.isLending,
        };
        newAccounts.push(newAcc);
        accountIdMap[acc.sourceUid] = newAcc.id;
        accountIdMap[acc.name] = newAcc.id;
      });

      saveAccounts(newAccounts);

      // 3. Process & Save Faithful Active Categories (ZCATEGORY) ONLY
      const activeCategories = result.categories.filter((c) => !c.isDeleted);
      const newCategories: Category[] = activeCategories.map((cat) => ({
        id: cat.id || `cat-${cat.sourceUid || Date.now()}`,
        sourceUid: cat.sourceUid,
        parentUid: cat.parentUid,
        name: cat.name,
        type: cat.type,
        color: cat.color || (cat.type === 'income' ? '#10b981' : '#ef4444'),
        icon: '📦',
        subcategories: cat.subcategories || [],
      }));

      saveCategories(newCategories);

      // 4. Process & Save Transactions ONLY (No merge with old transactions)
      const parsedTransactions: Transaction[] = [];

      const findAccId = (nameStr: string, uidStr?: string): string => {
        if (uidStr && accountIdMap[uidStr]) return accountIdMap[uidStr];
        if (nameStr && accountIdMap[nameStr]) return accountIdMap[nameStr];
        const found = newAccounts.find((a) => a.sourceUid === uidStr || a.name.toLowerCase().trim() === (nameStr || '').toLowerCase().trim());
        return found ? found.id : (newAccounts[0]?.id || 'acc-cash');
      };

      result.transactions.forEach((tx, index) => {
        const accountId = findAccId(tx.account, tx.accountUid);
        const toAccountId = tx.toAccount ? findAccId(tx.toAccount, tx.toAccountUid) : undefined;

        parsedTransactions.push({
          id: tx.id || `txn-${tx.sourceUid || Date.now()}-${index}`,
          sourceUid: tx.sourceUid,
          date: tx.date,
          description: tx.description,
          category: (tx.category as any) || (tx.type === 'transfer' ? 'Transfer' : 'Other'),
          categoryUid: tx.categoryUid,
          subcategory: tx.subcategory,
          account: accountId,
          accountUid: tx.accountUid,
          toAccount: toAccountId,
          toAccountUid: tx.toAccountUid,
          amount: tx.amount,
          type: tx.type,
          notes: tx.notes || '',
          historicalCategoryName: tx.historicalCategoryName,
          isHistoricalOnly: tx.isHistoricalOnly,
          createdAt: new Date(Date.now() + index).toISOString(),
        });
      });

      localStorage.setItem('wealthiq_transactions', JSON.stringify(parsedTransactions));

      // 5. Process & Save Budgets ONLY
      if (result.budgets && result.budgets.length > 0) {
        const newBudgets = result.budgets.map((b) => ({
          id: b.id || `budget-${b.sourceUid || Date.now()}`,
          sourceUid: b.sourceUid,
          name: `${b.categoryName} Budget`,
          category: b.categoryName,
          categoryUid: b.categoryUid,
          allocated: b.amount,
          month: b.month || new Date().toISOString().slice(0, 7),
        }));
        localStorage.setItem('wealthiq_budgets', JSON.stringify(newBudgets));
      } else {
        localStorage.setItem('wealthiq_budgets', JSON.stringify([]));
      }

      setImportStats({
        transactions: parsedTransactions.length,
        duplicates: 0,
        categories: newCategories.length,
        accounts: newAccounts.length,
      });

      setImportDone(true);
      toast.success(
        `${parsedTransactions.length} transactions imported successfully from "${file.name}"!`,
        { id: toastId }
      );
    } catch (err: any) {
      setCurrentStep('upload');
      toast.error(err.message || 'SQLite import failed', { id: toastId });
    } finally {
      setIsImporting(false);
    }
  };

  const handleFileSelected = async (file: File) => {
    setSelectedFile(file);

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'sqlite' || ext === 'db') {
      await handleImportSqlite(file);
      return;
    }

    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet);

      if (rows.length === 0) {
        toast.error('The uploaded file is empty.');
        return;
      }

      setRawRows(rows);
      setSampleRow(rows[0] as Record<string, any>);

      // Get columns from the first row
      const headers = Object.keys(rows[0] as object);

      // Generate mappings
      const hasNote = headers.some((h) => {
        const l = h
          .toLowerCase()
          .trim()
          .replace(/[-_\s/]/g, '');
        return l === 'note' || l === 'notes' || l === 'title' || l === 'memo';
      });

      const hasAmount = headers.some((h) => {
        const l = h
          .toLowerCase()
          .trim()
          .replace(/[-_\s/]/g, '');
        return l === 'amount' || l === 'val' || l === 'value';
      });

      const hasAccount = headers.some((h) => {
        const l = h
          .toLowerCase()
          .trim()
          .replace(/[-_\s/]/g, '');
        return l === 'account' || l === 'acc';
      });

      const detectedMappings = headers.map((header) => {
        const lower = header
          .toLowerCase()
          .trim()
          .replace(/[-_\s/]/g, '');
        let targetField = 'ignore';
        let confidence = 0;

        if (lower === 'date') {
          targetField = 'date';
          confidence = 98;
        } else if (lower === 'amount' || lower === 'val' || lower === 'value') {
          targetField = 'amount';
          confidence = 98;
        } else if (lower === 'inr') {
          if (hasAmount) {
            targetField = 'ignore';
            confidence = 50;
          } else {
            targetField = 'amount';
            confidence = 95;
          }
        } else if (lower === 'income') {
          targetField = 'income';
          confidence = 90;
        } else if (lower === 'expense') {
          targetField = 'expense';
          confidence = 90;
        } else if (lower === 'category') {
          targetField = 'category';
          confidence = 96;
        } else if (lower === 'subcategory' || lower === 'subcat') {
          targetField = 'subcategory';
          confidence = 92;
        } else if (lower === 'account' || lower === 'acc') {
          targetField = 'account';
          confidence = 98;
        } else if (lower === 'account1') {
          if (hasAccount) {
            targetField = 'ignore';
            confidence = 50;
          } else {
            targetField = 'account';
            confidence = 89;
          }
        } else if (
          lower === 'description' ||
          lower === 'desc' ||
          lower === 'merchant' ||
          lower === 'payee' ||
          lower === 'details' ||
          lower === 'title'
        ) {
          targetField = 'description';
          confidence = 96;
        } else if (
          lower === 'note' ||
          lower === 'notes' ||
          lower === 'memo' ||
          lower === 'remarks' ||
          lower === 'comment' ||
          lower === 'comments'
        ) {
          targetField = 'notes';
          confidence = 96;
        } else if (lower === 'incomeexpense' || lower === 'type' || lower === 'txntype') {
          targetField = 'type';
          confidence = 95;
        }

        return {
          sourceColumn: header,
          targetField,
          confidence,
          status: targetField === 'ignore' ? 'ignored' : 'mapped',
        } as ColumnMapping;
      });

      setColumnMappings(detectedMappings);

      // Parse rows with mappings
      const parsedRows = parseRowsWithMappings(rows, detectedMappings);
      setImportedRows(parsedRows);

      // Extract unique categories and counts
      const catCounts: Record<string, number> = {};
      parsedRows.forEach((r) => {
        if (r.category && r.type !== 'transfer') {
          catCounts[r.category] = (catCounts[r.category] || 0) + 1;
        }
      });

      const userCats = getCategories();
      const initialCatMappings = Object.entries(catCounts).map(([srcCat, count]) => {
        const suggested =
          userCats.find((c) => c.name && c.name.toLowerCase() === srcCat.toLowerCase())?.name ||
          userCats.find(
            (c) =>
              c.name &&
              (c.name.toLowerCase().includes(srcCat.toLowerCase()) ||
                srcCat.toLowerCase().includes(c.name.toLowerCase()))
          )?.name ||
          '';

        return {
          id: `catmap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          sourceCategory: srcCat,
          transactionCount: count,
          selectedTarget: suggested,
          confidence: suggested ? 90 : 50,
        };
      });

      setCategoryMappings(initialCatMappings);
    } catch (err: any) {
      toast.error('Failed to parse Excel file: ' + err.message);
    }
  };

  const handleColumnMappingChange = (idx: number, targetField: string) => {
    setColumnMappings((prev) => {
      const newMappings = prev.map((m, i) =>
        i === idx
          ? {
              ...m,
              targetField,
              status: (targetField === 'ignore' ? 'ignored' : 'mapped') as
                'mapped' | 'unmapped' | 'ignored',
            }
          : m
      );

      if (rawRows.length > 0) {
        const parsedRows = parseRowsWithMappings(rawRows, newMappings);
        setImportedRows(parsedRows);

        // Recalculate unique categories
        const catCounts: Record<string, number> = {};
        parsedRows.forEach((r) => {
          if (r.category && r.type !== 'transfer') {
            catCounts[r.category] = (catCounts[r.category] || 0) + 1;
          }
        });

        const userCats = getCategories();
        setCategoryMappings((prevCatMaps) => {
          return Object.entries(catCounts).map(([srcCat, count]) => {
            const existing = prevCatMaps.find((m) => m.sourceCategory === srcCat);
            if (existing) {
              return { ...existing, transactionCount: count };
            }

            const suggested =
              userCats.find((c) => c.name && c.name.toLowerCase() === srcCat.toLowerCase())?.name ||
              userCats.find(
                (c) =>
                  c.name &&
                  (c.name.toLowerCase().includes(srcCat.toLowerCase()) ||
                    srcCat.toLowerCase().includes(c.name.toLowerCase()))
              )?.name ||
              '';

            return {
              id: `catmap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              sourceCategory: srcCat,
              transactionCount: count,
              selectedTarget: suggested,
              confidence: suggested ? 90 : 50,
            };
          });
        });
      }

      return newMappings;
    });
  };

  const handleCategoryMappingChange = (sourceCategory: string, selectedTarget: string) => {
    setCategoryMappings((prev) =>
      prev.map((m) =>
        m.sourceCategory === sourceCategory
          ? { ...m, selectedTarget, confidence: selectedTarget ? 100 : 0 }
          : m
      )
    );
  };

  const handleAddCustomCategory = (newCatName: string) => {
    const cleanCat = cleanString(newCatName);
    if (!cleanCat) return;

    const existing = getCategories();
    const exists = existing.some((c) => c.name.toLowerCase() === cleanCat.toLowerCase());

    if (!exists) {
      const newCat = {
        id: `cat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: cleanCat,
        type: 'expense' as const,
        color: `#${Math.floor(Math.random() * 16777215)
          .toString(16)
          .padStart(6, '0')}`,
        icon: '📦',
        subcategories: [],
      };
      saveCategories([...existing, newCat]);
      toast.success(`Category "${cleanCat}" created!`);
    }
  };

  const handleNext = () => {
    const steps: WizardStep[] = ['upload', 'map-columns', 'map-categories', 'preview', 'importing'];
    const idx = steps.indexOf(currentStep);
    if (idx < steps.length - 1) {
      setCurrentStep(steps[idx + 1]);
    }
  };

  const handleBack = () => {
    const steps: WizardStep[] = ['upload', 'map-columns', 'map-categories', 'preview', 'importing'];
    const idx = steps.indexOf(currentStep);
    if (idx > 0) setCurrentStep(steps[idx - 1]);
  };

  const handleStartImport = () => {
    setIsImporting(true);
    setCurrentStep('importing');
  };

  const handleImportComplete = () => {
    const existingAccounts = getAccounts();
    const existingCategories = getCategories();
    const existingTransactions = getTransactions();

    const newAccounts = [...existingAccounts];
    const newCategories = [...existingCategories];

    let newAccountsCreated = 0;
    let newCategoriesCreated = 0;

    const findOrCreateAccount = (accountName: string): { id: string } => {
      const cleanName = cleanString(accountName).trim() || 'Cash';

      // 1. Try exact match
      let acc = newAccounts.find((a) => a.name === cleanName);

      // 2. Try case insensitive match
      if (!acc) {
        acc = newAccounts.find((a) => a.name.toLowerCase() === cleanName.toLowerCase());
      }

      // 3. Create account if still not found
      if (!acc) {
        const lowerName = cleanName.toLowerCase();
        let accType: 'accounts' | 'cash' | 'credit' | 'loan' = 'accounts';
        if (lowerName.includes('credit card') || lowerName.includes('card')) {
          accType = 'credit';
        } else if (lowerName.includes('loan')) {
          accType = 'loan';
        } else if (lowerName.includes('cash') || lowerName.includes('wallet')) {
          accType = 'cash';
        }

        const colors = {
          accounts: '#3b82f6',
          cash: '#10b981',
          credit: '#f97316',
          loan: '#ef4444',
        };
        const color = colors[accType];

        acc = {
          id: `acc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: cleanName,
          type: accType,
          balance: 0,
          color,
          visible: true,
          icon:
            accType === 'cash'
              ? '💵'
              : accType === 'credit'
                ? '💳'
                : accType === 'loan'
                  ? '📉'
                  : '🏦',
        };
        newAccounts.push(acc);
        newAccountsCreated++;
      }
      return { id: acc.id };
    };

    const findOrCreateCategory = (
      categoryName: string,
      type: 'expense' | 'income' | 'transfer'
    ): Category => {
      const cleanName = cleanString(categoryName) || 'Other';
      let cat = newCategories.find((c) => c.name.toLowerCase() === cleanName.toLowerCase());
      if (!cat) {
        cat = {
          id: `cat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: cleanName,
          type: type === 'income' ? 'income' : 'expense',
          color: `#${Math.floor(Math.random() * 16777215)
            .toString(16)
            .padStart(6, '0')}`,
          icon: '📦',
          subcategories: [],
        };
        newCategories.push(cat);
        newCategoriesCreated++;
      }
      if (!cat.subcategories) {
        cat.subcategories = [];
      }
      return cat;
    };

    let duplicatesCount = 0;
    const parsedTransactions: Transaction[] = [];

    importedRows.forEach((row, index) => {
      if (row.status === 'error') return;

      const sourceResult = findOrCreateAccount(row.account);
      const accountId = sourceResult.id;

      let toAccountId: string | undefined = undefined;

      if (row.type === 'transfer') {
        const destName =
          row.toAccount || (row.account.toLowerCase() === 'cash' ? 'SBI Savings' : 'Cash');
        const destResult = findOrCreateAccount(destName);
        toAccountId = destResult.id;
      }

      // Resolve mapped category name
      let categoryName: string | null = null;
      let subcategoryName: string | undefined = undefined;

      if (row.type !== 'transfer') {
        const catMapping = categoryMappings.find((m) => m.sourceCategory === row.category);
        const targetCategoryName = catMapping?.selectedTarget || row.category || 'Other';
        const category = findOrCreateCategory(targetCategoryName, row.type);
        categoryName = category.name;

        if (row.subcategory) {
          const cleanSub = cleanString(row.subcategory);
          if (cleanSub) {
            subcategoryName = cleanSub;
            const subExists = category.subcategories?.some(
              (s: string) => s && s.toLowerCase() === cleanSub.toLowerCase()
            );
            if (!subExists) {
              category.subcategories = [...(category.subcategories || []), cleanSub];
            }
          }
        }
      }

      // Deduplication check - compare dates based on date-only part (YYYY-MM-DD) to handle timestamp differences
      const isDuplicate =
        existingTransactions.some(
          (t) =>
            t &&
            (t.date || '').slice(0, 10) === (row.date || '').slice(0, 10) &&
            t.amount === row.amount &&
            t.account === accountId &&
            t.type === row.type &&
            (row.type !== 'transfer' || t.toAccount === toAccountId) &&
            t.description &&
            row.description &&
            t.description.toLowerCase() === row.description.toLowerCase()
        ) ||
        parsedTransactions.some(
          (t) =>
            t &&
            (t.date || '').slice(0, 10) === (row.date || '').slice(0, 10) &&
            t.amount === row.amount &&
            t.account === accountId &&
            t.type === row.type &&
            (row.type !== 'transfer' || t.toAccount === toAccountId) &&
            t.description &&
            row.description &&
            t.description.toLowerCase() === row.description.toLowerCase()
        );

      if (isDuplicate) {
        duplicatesCount++;
        return;
      }

      parsedTransactions.push({
        id: `txn-${Date.now()}-${index}`,
        date: row.date,
        description: row.description,
        category: categoryName as any,
        subcategory: subcategoryName,
        account: accountId,
        toAccount: toAccountId,
        amount: row.amount,
        type: row.type,
        notes: row.notes || '',
        createdAt: new Date(Date.now() + index).toISOString(), // add sequence offset for stable chronological sorting
      });
    });

    saveAccounts(newAccounts);
    saveCategories(newCategories);

    const mergedTransactions = [...existingTransactions, ...parsedTransactions];
    localStorage.setItem('wealthiq_transactions', JSON.stringify(mergedTransactions));

    setImportStats({
      transactions: parsedTransactions.length,
      duplicates: duplicatesCount,
      categories: newCategoriesCreated,
      accounts: newAccountsCreated,
    });

    setIsImporting(false);
    setImportDone(true);

    toast.success(`${parsedTransactions.length} transactions imported successfully`);
  };

  const canProceed = () => {
    if (currentStep === 'upload') return !!selectedFile;
    if (currentStep === 'map-columns') {
      const requiredFields = ['date', 'amount'];
      return requiredFields.every((field) =>
        columnMappings.some((m) => m.targetField === field && m.status === 'mapped')
      );
    }
    return true;
  };

  return (
    <AppLayout>
      <div className="px-6 py-6 xl:px-10 max-w-screen-2xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2 font-medium">
            <Link href="/" className="hover:text-foreground">
              Dashboard
            </Link>
            <ChevronRight size={12} />
            <span className="text-foreground">Import Data</span>
          </div>

          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-border bg-muted/10 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  {currentStep === 'upload' && 'Upload Your Money Manager File'}
                  {currentStep === 'map-columns' && 'Map Source Columns'}
                  {currentStep === 'map-categories' && 'Map Spending Categories'}
                  {currentStep === 'preview' && 'Preview & Validate Import'}
                  {currentStep === 'importing' &&
                    (importDone ? 'Import Complete' : 'Importing Data…')}
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {currentStep === 'upload' &&
                    'Select or drag & drop your Money Manager SQLite backup file (.sqlite / .db) or spreadsheet'}
                  {currentStep === 'map-columns' &&
                    'Confirm how your spreadsheet columns map to WealthIQ fields'}
                  {currentStep === 'map-categories' &&
                    "Align your existing categories with WealthIQ's category taxonomy"}
                  {currentStep === 'preview' &&
                    'Review the first 50 rows before committing the full import'}
                  {currentStep === 'importing' &&
                    (importDone
                      ? `${importStats.transactions} transactions imported successfully`
                      : 'Processing your historical transaction data…')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-medium">
                  Step {stepIndex + 1} of {WIZARD_STEPS.length}
                </span>
                <div className="flex items-center gap-1">
                  {WIZARD_STEPS.map((s, i) => (
                    <div
                      key={`progress-dot-${s.id}`}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        i === stepIndex
                          ? 'w-6 bg-primary'
                          : i < stepIndex || importDone
                            ? 'w-1.5 bg-positive'
                            : 'w-1.5 bg-muted'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6">
              {currentStep === 'upload' && (
                <div className="space-y-6">
                  {/* Import Mode Selector */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setImportMode('sqlite')}
                      className={`p-5 rounded-2xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                        importMode === 'sqlite'
                          ? 'border-primary bg-primary/5 shadow-md ring-2 ring-primary/20'
                          : 'border-border bg-card hover:bg-muted/10'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                          <Database className="w-5 h-5" />
                        </div>
                        <span className="px-2.5 py-0.5 rounded-full text-3xs font-extrabold bg-primary/10 text-primary border border-primary/20">
                          Option 1 • Money Manager Backup
                        </span>
                      </div>
                      <div>
                        <h3 className="font-bold text-base text-foreground mb-1">
                          Money Manager SQLite Backup
                        </h3>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Upload your Money Manager <code className="text-primary font-bold">.sqlite</code> or <code className="text-primary font-bold">.db</code> database file. Direct 1-click import!
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setImportMode('spreadsheet')}
                      className={`p-5 rounded-2xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                        importMode === 'spreadsheet'
                          ? 'border-primary bg-primary/5 shadow-md ring-2 ring-primary/20'
                          : 'border-border bg-card hover:bg-muted/10'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="w-10 h-10 rounded-xl bg-muted text-muted-foreground flex items-center justify-center font-bold">
                          <Upload className="w-5 h-5" />
                        </div>
                        <span className="px-2.5 py-0.5 rounded-full text-3xs font-bold bg-muted text-muted-foreground border border-border">
                          Option 2 • Spreadsheets
                        </span>
                      </div>
                      <div>
                        <h3 className="font-bold text-base text-foreground mb-1">
                          Excel / CSV Spreadsheets
                        </h3>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Upload <code className="font-bold">.xlsx</code> or <code className="font-bold">.csv</code> files and map columns manually via wizard.
                        </p>
                      </div>
                    </button>
                  </div>

                  {importMode === 'sqlite' ? (
                    <div className="border-2 border-dashed border-primary/40 rounded-2xl p-10 bg-card/40 text-center space-y-4 shadow-sm">
                      <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center mx-auto shadow-inner">
                        <Database className="w-8 h-8" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-lg font-extrabold text-foreground">
                          Upload Money Manager SQLite Database
                        </h3>
                        <p className="text-xs text-muted-foreground max-w-md mx-auto">
                          Select your Money Manager database file (<span className="text-primary font-bold">.sqlite</span> or <span className="text-primary font-bold">.db</span>). All accounts, categories, income, expenses, and transfers will be extracted automatically.
                        </p>
                      </div>

                      <div className="pt-2">
                        <label className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-bold text-xs hover:opacity-95 transition shadow-lg shadow-primary/25 cursor-pointer active:scale-95">
                          <Upload className="w-4 h-4" />
                          Choose Money Manager SQLite File (.sqlite / .db)
                          <input
                            type="file"
                            accept=".sqlite,.db,application/x-sqlite3,application/octet-stream,*/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleFileSelected(f);
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  ) : (
                    <DropZone
                      onFileSelected={handleFileSelected}
                      selectedFile={selectedFile}
                      onClear={() => setSelectedFile(null)}
                    />
                  )}

                  <div className="flex items-start gap-3 p-4 rounded-xl bg-info-subtle border border-info-subtle">
                    <Database size={16} className="text-info flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-foreground mb-1">
                        Importing historical data?
                      </p>
                      <p className="text-sm text-muted-foreground">
                        WealthIQ handles 10+ years of transaction history without performance
                        issues. Files up to 50MB are processed entirely in memory — your data never
                        leaves your browser during upload.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 'map-columns' && (
                <ColumnMapper
                  columns={columnMappings.map((m) => m.sourceColumn)}
                  mappings={columnMappings}
                  onMappingChange={handleColumnMappingChange}
                  sampleRow={sampleRow}
                />
              )}

              {currentStep === 'map-categories' && (
                <CategoryWizard
                  mappings={categoryMappings}
                  onMappingChange={handleCategoryMappingChange}
                  userCategories={getCategories().map((c) => c.name)}
                  onAddCustomCategory={handleAddCustomCategory}
                />
              )}

              {currentStep === 'preview' && (
                <ImportPreview rows={importedRows} totalRows={importedRows.length} />
              )}

              {currentStep === 'importing' && (
                <div>
                  {importDone ? (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 rounded-full bg-positive-subtle border border-positive-subtle flex items-center justify-center mx-auto mb-4">
                        <CheckCircle size={28} className="text-positive" />
                      </div>
                      <h3 className="text-xl font-bold text-foreground mb-2">Import Successful!</h3>
                      <p className="text-sm text-muted-foreground mb-6">
                        {importStats.transactions.toLocaleString('en-IN')} transactions imported
                        across {importStats.accounts} new accounts and {importStats.categories} new
                        categories.
                      </p>
                      <div className="grid grid-cols-3 gap-4 max-w-md mx-auto mb-6">
                        {[
                          {
                            id: 'done-stat-transactions',
                            label: 'Transactions Added',
                            value: importStats.transactions.toLocaleString('en-IN'),
                          },
                          {
                            id: 'done-stat-duplicates',
                            label: 'Duplicates Skipped',
                            value: importStats.duplicates.toLocaleString('en-IN'),
                          },
                          {
                            id: 'done-stat-categories',
                            label: 'New Categories',
                            value: importStats.categories.toLocaleString('en-IN'),
                          },
                        ].map((stat) => (
                          <div
                            key={stat.id}
                            className="bg-muted/20 border border-border rounded-xl p-3 text-center"
                          >
                            <p className="text-xl font-bold tabular-nums text-foreground">
                              {stat.value}
                            </p>
                            <p className="text-xs text-muted-foreground font-medium">
                              {stat.label}
                            </p>
                          </div>
                        ))}
                      </div>
                      <Link
                        href="/"
                        className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-all duration-150 active:scale-95"
                      >
                        View Dashboard
                        <ChevronRight size={16} />
                      </Link>
                    </div>
                  ) : (
                    <ImportProgress
                      isRunning={isImporting}
                      onComplete={handleImportComplete}
                      totalRows={importedRows.length}
                    />
                  )}
                </div>
              )}
            </div>

            {currentStep !== 'importing' && (
              <div className="px-6 py-4 border-t border-border bg-muted/10 flex items-center justify-between">
                <button
                  onClick={handleBack}
                  disabled={currentStep === 'upload'}
                  className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg hover:border-primary/30 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                >
                  ← Back
                </button>

                <div className="flex items-center gap-3">
                  {currentStep === 'preview' ? (
                    <button
                      onClick={handleStartImport}
                      className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-all duration-150 active:scale-95"
                    >
                      <Play size={14} />
                      Start Import ({importedRows.length.toLocaleString('en-IN')} rows)
                    </button>
                  ) : (
                    <button
                      onClick={handleNext}
                      disabled={!canProceed()}
                      className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                    >
                      Continue
                      <ChevronRight size={14} />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
