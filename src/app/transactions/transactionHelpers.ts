import type { Transaction } from '@/lib/storage';

interface TransactionFilters {
  typeFilter: Transaction['type'] | 'all' | 'cash-in' | 'cash-out';
  accountFilter: string;
  destinationAccountFilter: string;
  categoryFilter: string;
  search: string;
}

export function matchesTransactionFilters(
  t: Transaction,
  {
    typeFilter,
    accountFilter,
    destinationAccountFilter,
    categoryFilter,
    search,
  }: TransactionFilters,
  getAccountName: (id: string) => string
): boolean {
  if (typeFilter !== 'all') {
    if (typeFilter === 'cash-in') {
      if (t.type !== 'income' && t.type !== 'transfer') return false;
    } else if (typeFilter === 'cash-out') {
      if (t.type !== 'expense' && t.type !== 'transfer') return false;
    } else if (t.type !== typeFilter) {
      return false;
    }
  }

  if (typeFilter === 'transfer') {
    const matchSource = accountFilter === 'all' || t.account === accountFilter;
    const matchDest =
      destinationAccountFilter === 'all' || t.toAccount === destinationAccountFilter;
    if (!matchSource || !matchDest) return false;
  } else if (typeFilter === 'cash-in') {
    if (accountFilter !== 'all') {
      const matched =
        t.type === 'transfer' ? t.toAccount === accountFilter : t.account === accountFilter;
      if (!matched) return false;
    }
  } else if (typeFilter === 'cash-out') {
    if (accountFilter !== 'all') {
      const matched = t.account === accountFilter;
      if (!matched) return false;
    }
  } else {
    const matched =
      accountFilter === 'all' || t.account === accountFilter || t.toAccount === accountFilter;
    if (!matched) return false;
  }

  if (typeFilter !== 'transfer') {
    if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
  }

  if (search.trim() !== '') {
    const q = search.toLowerCase();
    const accName = getAccountName(t.account).toLowerCase();
    const toAccName = t.toAccount ? getAccountName(t.toAccount).toLowerCase() : '';
    const note = (t.notes || '').toLowerCase();
    const matchesSearch =
      t.description.toLowerCase().includes(q) ||
      (t.category || '').toLowerCase().includes(q) ||
      accName.includes(q) ||
      toAccName.includes(q) ||
      note.includes(q);
    if (!matchesSearch) return false;
  }

  return true;
}

interface ChartAmounts {
  income: number;
  expense: number;
  transfer: number;
}

export function getChartScale(data: ChartAmounts[]) {
  const values = data.flatMap((item) =>
    [item.income, item.expense, item.transfer].filter((value) => value > 0)
  );
  if (values.length < 2) return { logarithmic: false, minimum: 0 };
  const minimum = Math.min(...values);
  return { logarithmic: Math.max(...values) / minimum >= 100, minimum };
}

export function getChartPlotData<T extends ChartAmounts>(data: T[], logarithmic: boolean) {
  if (!logarithmic) return data;
  return data.map((item) => ({
    ...item,
    incomeRaw: item.income,
    expenseRaw: item.expense,
    transferRaw: item.transfer,
    income: Math.log10(item.income + 1),
    expense: Math.log10(item.expense + 1),
    transfer: Math.log10(item.transfer + 1),
  }));
}
