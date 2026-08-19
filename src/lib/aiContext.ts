import {
  getAccounts,
  getAccountCategories,
  getTransactions,
  getBudgets,
  getGoals,
  getTrips,
  getSplitExpenses,
  type Transaction,
  type Account,
  type AccountCategory,
  type Budget,
  type Goal,
  type Trip,
  type SplitDetails,
  type SplitMember,
} from './storage';
import {
  getStoredAlarms,
  getAlarmLogs,
  getAlarmSettings,
} from './alarmStorage';

export interface TripSummaryContext {
  id: string;
  name: string;
  destination?: string;
  status: 'active' | 'completed' | 'planned';
  startDate: string;
  endDate?: string;
  budget?: number;
  totalExpense: number;
  totalIncome: number;
  transactionCount: number;
  categoryBreakdown: Record<string, number>;
}

export interface AlarmContext {
  id: string;
  title: string;
  time: string;
  type: string;
  repeat: string;
  enabled: boolean;
  notes?: string;
}

export interface AlarmLogContext {
  alarmTitle: string;
  type: string;
  triggeredAt: string;
  status: string;
  actionTaken?: string;
}

export interface DetailedAccountContext {
  name: string;
  type: string;
  category?: string;
  balance: number;
  dueDate?: string;
  billingCycle?: string;
  emiAmount?: number;
  emiDueDay?: number;
  creditLimit?: number;
}

export interface AccountCategoryContext {
  id: string;
  name: string;
  baseType: string;
}

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
  accounts: DetailedAccountContext[];
  accountCategories?: AccountCategoryContext[];
  budgets: Array<{ category: string; allocated: number; spent: number }>;
  goals: Array<{ name: string; target: number; current: number }>;
  trips: TripSummaryContext[];
  alarms?: AlarmContext[];
  alarmLogs?: AlarmLogContext[];
  alarmSettings?: {
    masterEnabled: boolean;
    soundEnabled: boolean;
    volume: number;
    webNotificationsEnabled: boolean;
  };
  splitExpenses?: Array<{
    title: string;
    totalAmount: number;
    myShare: number;
    pendingToReceive: number;
    members: Array<{ personName: string; share: number; paid: number; pending: number }>;
  }>;
  recentTransactions: Array<{
    date: string;
    description: string;
    notes?: string;
    category: string;
    subcategory?: string;
    amount: number;
    type: string;
    account: string;
    toAccount?: string;
    tripName?: string;
    isSplit?: boolean;
  }>;
  largestExpenses: Array<{
    date: string;
    description: string;
    notes?: string;
    category: string;
    subcategory?: string;
    amount: number;
    account: string;
    tripName?: string;
  }>;
}

export function getFullFinancialContext(): FinancialContext | null {
  if (typeof window === 'undefined') return null;

  try {
    const accounts: Account[] = getAccounts(true) || [];
    const txns: Transaction[] = getTransactions(true) || [];
    const budgets: Budget[] = getBudgets() || [];
    const goals: Goal[] = getGoals() || [];
    const trips: Trip[] = getTrips() || [];
    const storedAlarms = getStoredAlarms() || [];
    const alarmLogs = getAlarmLogs() || [];
    const alarmSettings = getAlarmSettings();
    const rawSplits: SplitDetails[] = getSplitExpenses() || [];

    if (txns.length === 0 && accounts.length === 0 && trips.length === 0) {
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
        trips: [],
        alarms: [],
        alarmLogs: [],
        alarmSettings,
        splitExpenses: [],
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

    const netWorth = accounts.reduce((sum, a) => sum + (a.balance || 0), 0);

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

    // Build Trip Lookup Map & Trip Summaries
    const tripMap = new Map<string, string>();
    trips.forEach((tr) => tripMap.set(tr.id, tr.name));

    const tripSummaries: TripSummaryContext[] = trips.map((trip) => {
      const tripTxns = txns.filter((t) => t.tripId === trip.id);
      let totalExpense = 0;
      let totalIncome = 0;
      const categoryBreakdown: Record<string, number> = {};

      tripTxns.forEach((t) => {
        const amt = Number(t.amount) || 0;
        if (t.type === 'expense') {
          totalExpense += amt;
          categoryBreakdown[t.category] = (categoryBreakdown[t.category] || 0) + amt;
        } else if (t.type === 'income') {
          totalIncome += amt;
        }
      });

      return {
        id: trip.id,
        name: trip.name,
        destination: trip.destination,
        status: trip.status,
        startDate: trip.startDate,
        endDate: trip.endDate,
        budget: trip.budget,
        totalExpense: Math.round(totalExpense),
        totalIncome: Math.round(totalIncome),
        transactionCount: tripTxns.length,
        categoryBreakdown,
      };
    });

    // Format Alarms & Notifications
    const alarmsContext: AlarmContext[] = storedAlarms.map((a) => ({
      id: a.id,
      title: a.title,
      time: a.time,
      type: a.type,
      repeat: a.repeat,
      enabled: a.enabled,
      notes: a.notes,
    }));

    const alarmLogsContext: AlarmLogContext[] = alarmLogs.slice(0, 30).map((l) => ({
      alarmTitle: l.alarmTitle,
      type: l.type,
      triggeredAt: l.triggeredAt,
      status: l.status,
      actionTaken: l.actionTaken,
    }));

    // Format Split Expenses
    const splitExpensesContext = rawSplits.map((s) => ({
      title: s.name || 'Shared Expense',
      totalAmount: s.totalAmount,
      myShare: s.myShare,
      pendingToReceive: s.pending,
      members: (s.members || []).map((m: SplitMember) => ({
        personName: m.name,
        share: m.share,
        paid: m.paid,
        pending: m.pending,
      })),
    }));

    const rawAccCats: AccountCategory[] = getAccountCategories() || [];
    const accountCategories = rawAccCats.map((ac) => ({
      id: ac.id,
      name: ac.name,
      baseType: ac.baseType,
    }));

    // Detailed Accounts & Cards Info
    const detailedAccounts: DetailedAccountContext[] = accounts.map((a: any) => ({
      name: a.name,
      type: a.type,
      category: a.category || 'Unassigned',
      balance: a.balance,
      dueDate: a.dueDate,
      billingCycle: a.billingCycle,
      emiAmount: a.emiAmount,
      emiDueDay: a.emiDueDay,
      creditLimit: a.creditLimit,
    }));

    // ALL RECORDED TRANSACTIONS HISTORY (NO truncating to 300 - include full set up to 1000 items)
    const recentTxns = txns
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 1000)
      .map((t) => ({
        date: t.date,
        description: t.description || 'No description',
        notes: t.notes && t.notes.trim() ? t.notes.trim() : undefined,
        category: t.category,
        subcategory: t.subcategory && t.subcategory.trim() ? t.subcategory.trim() : undefined,
        amount: t.amount,
        type: t.type,
        account: t.account || t.historicalAccountName || 'Default',
        toAccount: t.toAccount,
        tripName: t.tripId ? tripMap.get(t.tripId) || undefined : undefined,
        isSplit: t.isSplit,
      }));

    // Top 50 Largest Expenses All-Time with full details & tripName
    const largestExpenses = txns
      .filter((t) => t.type === 'expense')
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 50)
      .map((t) => ({
        date: t.date,
        description: t.description || 'No description',
        notes: t.notes && t.notes.trim() ? t.notes.trim() : undefined,
        category: t.category,
        subcategory: t.subcategory && t.subcategory.trim() ? t.subcategory.trim() : undefined,
        amount: t.amount,
        account: t.account || t.historicalAccountName || 'Default',
        tripName: t.tripId ? tripMap.get(t.tripId) || undefined : undefined,
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
      accounts: detailedAccounts,
      accountCategories,
      budgets: budgetList,
      goals: goals.map((g) => ({
        name: g.name,
        target: g.targetAmount,
        current: g.currentAmount,
      })),
      trips: tripSummaries,
      alarms: alarmsContext,
      alarmLogs: alarmLogsContext,
      alarmSettings: {
        masterEnabled: alarmSettings.masterEnabled,
        soundEnabled: alarmSettings.soundEnabled,
        volume: alarmSettings.volume,
        webNotificationsEnabled: alarmSettings.webNotificationsEnabled,
      },
      splitExpenses: splitExpensesContext,
      recentTransactions: recentTxns,
      largestExpenses,
    };
  } catch (e) {
    console.error('Failed to get full financial context:', e);
    return null;
  }
}
