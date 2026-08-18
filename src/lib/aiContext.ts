import {
  getAccounts,
  getTransactions,
  getBudgets,
  getGoals,
  type Transaction,
  type Account,
  type Budget,
  type Goal,
} from './storage';

export interface FinancialContext {
  netWorth: number;
  totalIncomeAllTime: number;
  totalExpenseAllTime: number;
  totalTransactionsCount: number;
  dateRange: { start: string; end: string };
  currentMonth: string;
  monthlyIncome: number;
  monthlyExpense: number;
  monthlyHistory: Array<{ month: string; income: number; expense: number }>;
  monthlyCategoryBreakdown: Record<string, Record<string, number>>;
  allTimeCategories: Array<{ category: string; amount: number }>;
  topCategories: Array<{ category: string; amount: number }>;
  accounts: Array<{ name: string; type: string; balance: number }>;
  budgets: Array<{ category: string; allocated: number; spent: number }>;
  goals: Array<{ name: string; target: number; current: number }>;
  recentTransactions: Array<{
    date: string;
    description: string;
    notes?: string;
    category: string;
    subcategory?: string;
    amount: number;
    type: string;
    account: string;
  }>;
  largestExpenses: Array<{
    date: string;
    description: string;
    notes?: string;
    category: string;
    subcategory?: string;
    amount: number;
    account: string;
  }>;
}

export function getFullFinancialContext(): FinancialContext | null {
  if (typeof window === 'undefined') return null;

  try {
    const accounts: Account[] = getAccounts() || [];
    const txns: Transaction[] = getTransactions() || [];
    const budgets: Budget[] = getBudgets() || [];
    const goals: Goal[] = getGoals() || [];

    if (txns.length === 0 && accounts.length === 0) {
      return {
        netWorth: 0,
        totalIncomeAllTime: 0,
        totalExpenseAllTime: 0,
        totalTransactionsCount: 0,
        dateRange: { start: 'N/A', end: 'N/A' },
        currentMonth: new Date().toISOString().slice(0, 7),
        monthlyIncome: 0,
        monthlyExpense: 0,
        monthlyHistory: [],
        monthlyCategoryBreakdown: {},
        allTimeCategories: [],
        topCategories: [],
        accounts: [],
        budgets: [],
        goals: [],
        recentTransactions: [],
        largestExpenses: [],
      };
    }

    const now = new Date();
    const currentMonthStr = now.toISOString().slice(0, 7);

    // Sort transactions chronologically
    const sortedTxns = txns.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const startDate = sortedTxns.length > 0 ? sortedTxns[0].date : 'N/A';
    const endDate = sortedTxns.length > 0 ? sortedTxns[sortedTxns.length - 1].date : 'N/A';

    // All-time Totals
    let totalIncomeAllTime = 0;
    let totalExpenseAllTime = 0;

    // Monthly breakdown map
    const monthlyMap: Record<string, { income: number; expense: number }> = {};
    // Monthly category breakdown map { '2026-08': { 'Food': 750, 'Shopping': 4550 } }
    const monthlyCategoryMap: Record<string, Record<string, number>> = {};
    // All-time category breakdown map
    const allTimeCategoryMap: Record<string, number> = {};
    // Current month category map
    const currentMonthCategoryMap: Record<string, number> = {};

    let monthlyIncome = 0;
    let monthlyExpense = 0;

    txns.forEach((t) => {
      const monthKey = t.date.slice(0, 7);
      if (!monthlyMap[monthKey]) {
        monthlyMap[monthKey] = { income: 0, expense: 0 };
      }
      if (!monthlyCategoryMap[monthKey]) {
        monthlyCategoryMap[monthKey] = {};
      }

      if (t.type === 'income') {
        totalIncomeAllTime += t.amount;
        monthlyMap[monthKey].income += t.amount;
        if (monthKey === currentMonthStr) {
          monthlyIncome += t.amount;
        }
      } else if (t.type === 'expense') {
        totalExpenseAllTime += t.amount;
        monthlyMap[monthKey].expense += t.amount;
        allTimeCategoryMap[t.category] = (allTimeCategoryMap[t.category] || 0) + t.amount;
        monthlyCategoryMap[monthKey][t.category] = (monthlyCategoryMap[monthKey][t.category] || 0) + t.amount;

        if (monthKey === currentMonthStr) {
          monthlyExpense += t.amount;
          currentMonthCategoryMap[t.category] = (currentMonthCategoryMap[t.category] || 0) + t.amount;
        }
      }
    });

    const netWorth = accounts.reduce((sum, a) => sum + a.balance, 0);

    // Monthly History (All recorded months, up to 36 months)
    const monthlyHistory = Object.entries(monthlyMap)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 36)
      .map(([month, data]) => ({
        month,
        income: Math.round(data.income),
        expense: Math.round(data.expense),
      }));

    // All-time Categories (All recorded categories, no artificial cut-off)
    const allTimeCategories = Object.entries(allTimeCategoryMap)
      .sort((a, b) => b[1] - a[1])
      .map(([category, amount]) => ({ category, amount: Math.round(amount) }));

    // Top Categories This Month
    const topCategories = Object.entries(currentMonthCategoryMap)
      .sort((a, b) => b[1] - a[1])
      .map(([category, amount]) => ({ category, amount: Math.round(amount) }));

    // Month transactions for current budget calculations
    const currentMonthTxns = txns.filter((t) => t.date.startsWith(currentMonthStr));

    const budgetList = budgets.map((b) => ({
      category: b.category || b.name,
      allocated: b.allocated || 0,
      spent: currentMonthTxns
        .filter((t) => t.type === 'expense' && (t.category === b.category || t.category === b.name))
        .reduce((sum, t) => sum + t.amount, 0),
    }));

    // Comprehensive Recent Transactions (Up to 300 transactions with full notes & subcategory)
    const recentTxns = txns
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 300)
      .map((t) => ({
        date: t.date,
        description: t.description || 'No description',
        notes: t.notes && t.notes.trim() ? t.notes.trim() : undefined,
        category: t.category,
        subcategory: t.subcategory && t.subcategory.trim() ? t.subcategory.trim() : undefined,
        amount: t.amount,
        type: t.type,
        account: t.account || t.historicalAccountName || 'Default',
      }));

    // Top 30 Largest Expenses All-Time with full details
    const largestExpenses = txns
      .filter((t) => t.type === 'expense')
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 30)
      .map((t) => ({
        date: t.date,
        description: t.description || 'No description',
        notes: t.notes && t.notes.trim() ? t.notes.trim() : undefined,
        category: t.category,
        subcategory: t.subcategory && t.subcategory.trim() ? t.subcategory.trim() : undefined,
        amount: t.amount,
        account: t.account || t.historicalAccountName || 'Default',
      }));

    return {
      netWorth,
      totalIncomeAllTime,
      totalExpenseAllTime,
      totalTransactionsCount: txns.length,
      dateRange: { start: startDate, end: endDate },
      currentMonth: currentMonthStr,
      monthlyIncome,
      monthlyExpense,
      monthlyHistory,
      monthlyCategoryBreakdown: monthlyCategoryMap,
      allTimeCategories,
      topCategories,
      accounts: accounts.map((a) => ({ name: a.name, type: a.type, balance: a.balance })),
      budgets: budgetList,
      goals: goals.map((g) => ({
        name: g.name,
        target: g.targetAmount,
        current: g.currentAmount,
      })),
      recentTransactions: recentTxns,
      largestExpenses,
    };
  } catch (e) {
    console.error('Failed to get full financial context:', e);
    return null;
  }
}
