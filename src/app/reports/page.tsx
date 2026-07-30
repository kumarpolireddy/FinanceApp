'use client';

import React, { useState, useMemo, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { getTransactions, getAccounts, getTransactionImpact, type Transaction, type Account } from '@/lib/storage';
import {
  FileText,
  Printer,
  Download,
  Filter,
  Calendar,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Wallet,
  Landmark,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';
import { toast } from 'sonner';

type DateFilterRange = 'this-month' | 'last-3-months' | 'this-year' | 'all-time';

export default function ReportsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  // Filter states
  const [dateRange, setDateRange] = useState<DateFilterRange>('this-year');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'cash-flow' | 'category' | 'net-worth' | 'ledger'>(
    'cash-flow'
  );

  useEffect(() => {
    setTransactions(getTransactions(true));
    setAccounts(getAccounts(true));
  }, []);

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (!t) return false;

      // Account filter
      if (selectedAccountId !== 'all') {
        if (t.type === 'transfer') {
          if (t.account !== selectedAccountId && t.toAccount !== selectedAccountId) {
            return false;
          }
        } else {
          if (t.account !== selectedAccountId) {
            return false;
          }
        }
      }

      // Date filter
      const txnDate = new Date(t.date);
      if (isNaN(txnDate.getTime())) return false;

      const now = new Date();
      switch (dateRange) {
        case 'this-month':
          return (
            txnDate.getFullYear() === now.getFullYear() && txnDate.getMonth() === now.getMonth()
          );
        case 'last-3-months': {
          const limitDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
          return txnDate >= limitDate;
        }
        case 'this-year':
          return txnDate.getFullYear() === now.getFullYear();
        case 'all-time':
        default:
          return true;
      }
    });
  }, [transactions, dateRange, selectedAccountId]);

  // Cash flow summary metrics
  const cashFlowMetrics = useMemo(() => {
    let income = 0;
    let expense = 0;
    let cashIn = 0;
    let cashOut = 0;

    filteredTransactions.forEach((t) => {
      const impact = getTransactionImpact(t);
      income += impact.income;
      expense += impact.expense;
      cashIn += impact.cashIn;
      cashOut += impact.cashOut;
    });

    const netSavings = income - expense;
    const savingsRate = income > 0 ? Math.round((netSavings / income) * 100) : 0;
    const netCashFlow = cashIn - cashOut;

    return { income, expense, netSavings, savingsRate, cashIn, cashOut, netCashFlow };
  }, [filteredTransactions]);

  // Category breakdown metrics
  const categoryBreakdown = useMemo(() => {
    const categoriesMap: Record<string, { income: number; expense: number }> = {};

    filteredTransactions.forEach((t) => {
      const cat = t.category || 'Uncategorized';
      const impact = getTransactionImpact(t);
      if (!categoriesMap[cat]) {
        categoriesMap[cat] = { income: 0, expense: 0 };
      }
      categoriesMap[cat].income += impact.income;
      categoriesMap[cat].expense += impact.expense;
    });

    return Object.entries(categoriesMap)
      .map(([name, val]) => ({
        name,
        income: val.income,
        expense: val.expense,
        net: val.income - val.expense,
      }))
      .sort((a, b) => b.expense - a.expense);
  }, [filteredTransactions]);

  // Net worth metrics
  const netWorthMetrics = useMemo(() => {
    let assets = 0;
    let liabilities = 0;

    accounts.forEach((acc) => {
      if (
        acc.type === 'accounts' ||
        acc.type === 'cash'
      ) {
        assets += acc.balance;
      } else if (acc.type === 'loan') {
        // Loan balances are negative liabilities
        liabilities += Math.abs(acc.balance);
      }
    });

    return {
      assets,
      liabilities,
      netWorth: assets - liabilities,
    };
  }, [accounts]);

  // Export to CSV trigger
  const handleExportCSV = () => {
    try {
      let headers: string[] = [];
      let rows: string[][] = [];
      let filename = '';

      if (activeTab === 'cash-flow') {
        filename = 'cash_flow_statement';
        headers = ['Metric', 'Amount (INR)'];
        rows = [
          ['Total Income', cashFlowMetrics.income.toFixed(2)],
          ['Total Expenses', cashFlowMetrics.expense.toFixed(2)],
          ['Net Savings', cashFlowMetrics.netSavings.toFixed(2)],
          ['Savings Rate (%)', `${cashFlowMetrics.savingsRate}%`],
        ];
      } else if (activeTab === 'category') {
        filename = 'category_spending_report';
        headers = ['Category', 'Income (INR)', 'Expenses (INR)', 'Net (INR)'];
        rows = categoryBreakdown.map((c) => [
          c.name,
          c.income.toFixed(2),
          c.expense.toFixed(2),
          c.net.toFixed(2),
        ]);
      } else if (activeTab === 'net-worth') {
        filename = 'net_worth_statement';
        headers = ['Account Name', 'Type', 'Balance (INR)'];
        rows = accounts.map((a) => [
          a.name,
          a.type === 'loan'
            ? 'Liability (Loan)'
            : 'Asset',
          a.balance.toFixed(2),
        ]);
        rows.push(['']);
        rows.push(['Total Assets', '', netWorthMetrics.assets.toFixed(2)]);
        rows.push(['Total Liabilities', '', netWorthMetrics.liabilities.toFixed(2)]);
        rows.push(['Net Worth', '', netWorthMetrics.netWorth.toFixed(2)]);
      } else {
        filename = 'transaction_ledger';
        headers = ['Date', 'Description', 'Category', 'Account', 'Type', 'Amount (INR)'];
        rows = filteredTransactions.map((t) => [
          new Date(t.date).toLocaleDateString('en-IN'),
          t.description || '',
          t.category || '',
          accounts.find((a) => a.id === t.account)?.name || 'Unknown',
          t.type.toUpperCase(),
          t.amount.toFixed(2),
        ]);
      }

      const csvContent = [
        headers.join(','),
        ...rows.map((e) => e.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(',')),
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute(
        'download',
        `${filename}_report_${new Date().toISOString().slice(0, 10)}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Report exported to CSV successfully!');
    } catch {
      toast.error('Failed to export CSV report.');
    }
  };

  // Print function
  const handlePrint = () => {
    window.print();
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto print:p-0 print:max-w-none">
        {/* Style block for clean printing layout */}
        <style jsx global>{`
          @media print {
            body {
              background: white !important;
              color: black !important;
            }
            header,
            nav,
            aside,
            button,
            .print-hide {
              display: none !important;
            }
            .print-full-width {
              width: 100% !important;
              max-width: 100% !important;
              padding: 0 !important;
              margin: 0 !important;
            }
            .print-border {
              border: 1px solid #ddd !important;
            }
          }
        `}</style>

        {/* Header section */}
        <div className="flex justify-between items-center print-hide">
          <div>
            <h1 className="text-xl font-extrabold text-foreground tracking-wide flex items-center gap-2">
              <FileText className="text-primary animate-pulse" />
              FINANCIAL REPORTS
            </h1>
            <p className="text-2xs text-muted-foreground uppercase tracking-wider font-semibold">
              Generate, print, and export structured financial insights
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-card border border-border text-2xs font-bold text-foreground hover:bg-muted/80 transition"
            >
              <Printer size={13} />
              Print Report
            </button>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-2xs font-bold hover:bg-primary/95 transition-all shadow-md"
            >
              <Download size={13} />
              Export CSV
            </button>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="bg-[#0b0f1a]/40 border border-border/30 rounded-2xl p-4 backdrop-blur-md flex flex-wrap gap-4 items-center justify-between print-hide">
          <div className="flex items-center gap-2 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
            <Filter size={12} className="text-primary" />
            Filters
          </div>

          <div className="flex flex-wrap gap-3">
            {/* Range filter */}
            <div className="flex items-center gap-2 bg-[#0b0f1a] border border-border rounded-xl px-2 py-1.5">
              <Calendar size={12} className="text-muted-foreground" />
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as DateFilterRange)}
                className="bg-transparent text-foreground text-2xs font-medium focus:outline-none cursor-pointer"
              >
                <option value="this-month">This Month</option>
                <option value="last-3-months">Last 3 Months</option>
                <option value="this-year">This Year</option>
                <option value="all-time">All Time</option>
              </select>
            </div>

            {/* Account filter */}
            <div className="flex items-center gap-2 bg-[#0b0f1a] border border-border rounded-xl px-2 py-1.5">
              <Wallet size={12} className="text-muted-foreground" />
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="bg-transparent text-foreground text-2xs font-medium focus:outline-none cursor-pointer"
              >
                <option value="all">All Accounts</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* KPI Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 print-full-width">
          {/* Asset Card */}
          <div className="bg-[#0b0f1a]/40 border border-border/30 rounded-2xl p-4 flex items-center justify-between shadow-lg">
            <div className="space-y-1">
              <span className="text-3xs text-muted-foreground uppercase tracking-wider block font-bold">
                Total Assets
              </span>
              <span className="text-lg font-bold text-foreground font-mono block">
                ₹{netWorthMetrics.assets.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Wallet size={18} />
            </div>
          </div>

          {/* Liabilities Card */}
          <div className="bg-[#0b0f1a]/40 border border-border/30 rounded-2xl p-4 flex items-center justify-between shadow-lg">
            <div className="space-y-1">
              <span className="text-3xs text-muted-foreground uppercase tracking-wider block font-bold">
                Total Liabilities
              </span>
              <span className="text-lg font-bold text-red-400 font-mono block">
                ₹{netWorthMetrics.liabilities.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20">
              <Landmark size={18} />
            </div>
          </div>

          {/* Net Savings Card */}
          <div className="bg-[#0b0f1a]/40 border border-border/30 rounded-2xl p-4 flex items-center justify-between shadow-lg">
            <div className="space-y-1">
              <span className="text-3xs text-muted-foreground uppercase tracking-wider block font-bold">
                Net Period Savings
              </span>
              <span
                className={`text-lg font-bold font-mono block ${
                  cashFlowMetrics.netSavings >= 0 ? 'text-[#10b981]' : 'text-red-400'
                }`}
              >
                ₹{cashFlowMetrics.netSavings.toLocaleString('en-IN')}
              </span>
            </div>
            <div
              className={`p-2.5 rounded-xl border ${
                cashFlowMetrics.netSavings >= 0
                  ? 'bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20'
                  : 'bg-red-500/10 text-red-400 border-red-500/20'
              }`}
            >
              {cashFlowMetrics.netSavings >= 0 ? (
                <TrendingUp size={18} />
              ) : (
                <TrendingDown size={18} />
              )}
            </div>
          </div>

          {/* Net Worth Card */}
          <div className="bg-[#0b0f1a]/40 border border-border/30 rounded-2xl p-4 flex items-center justify-between shadow-lg">
            <div className="space-y-1">
              <span className="text-3xs text-muted-foreground uppercase tracking-wider block font-bold">
                Current Net Worth
              </span>
              <span className="text-lg font-bold text-primary font-mono block">
                ₹{netWorthMetrics.netWorth.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
              <DollarSign size={18} />
            </div>
          </div>
        </div>

        {/* Tabs block */}
        <div className="flex border-b border-border/50 gap-2 print-hide">
          <button
            onClick={() => setActiveTab('cash-flow')}
            className={`pb-3 px-4 text-xs font-bold transition-all relative ${
              activeTab === 'cash-flow'
                ? 'text-primary border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            💵 Cash Flow
          </button>
          <button
            onClick={() => setActiveTab('category')}
            className={`pb-3 px-4 text-xs font-bold transition-all relative ${
              activeTab === 'category'
                ? 'text-primary border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            📊 Category Spending
          </button>
          <button
            onClick={() => setActiveTab('net-worth')}
            className={`pb-3 px-4 text-xs font-bold transition-all relative ${
              activeTab === 'net-worth'
                ? 'text-primary border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            🏛️ Net Worth Statement
          </button>
          <button
            onClick={() => setActiveTab('ledger')}
            className={`pb-3 px-4 text-xs font-bold transition-all relative ${
              activeTab === 'ledger'
                ? 'text-primary border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            📜 Transaction Ledger
          </button>
        </div>

        {/* Tab Contents */}
        <div className="print-full-width">
          {/* TAB 1: CASH FLOW */}
          {activeTab === 'cash-flow' && (
            <div className="bg-[#0b0f1a]/40 border border-border/30 rounded-2xl p-6 space-y-6 print-border print:bg-transparent">
              <div className="flex justify-between items-center border-b border-border/30 pb-4">
                <h2 className="text-base font-bold text-foreground">Cash Flow Statement</h2>
                <span className="text-3xs text-muted-foreground uppercase font-bold tracking-wider font-mono">
                  Range: {dateRange.toUpperCase()}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Visual Cash Flow Bars */}
                <div className="space-y-4">
                  <span className="text-2xs font-extrabold text-muted-foreground uppercase block tracking-wider">
                    Breakdown
                  </span>

                  {/* Income Bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-2xs font-bold">
                      <span className="flex items-center gap-1 text-[#10b981]">
                        <ArrowUpRight size={13} /> Income
                      </span>
                      <span className="font-mono text-foreground">
                        ₹{cashFlowMetrics.income.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="h-2 w-full bg-[#0b0f1a] rounded-full overflow-hidden border border-border/20">
                      <div className="h-full bg-[#10b981]" style={{ width: '100%' }} />
                    </div>
                  </div>

                  {/* Expense Bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-2xs font-bold">
                      <span className="flex items-center gap-1 text-red-400">
                        <ArrowDownLeft size={13} /> Expenses
                      </span>
                      <span className="font-mono text-foreground">
                        ₹{cashFlowMetrics.expense.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="h-2 w-full bg-[#0b0f1a] rounded-full overflow-hidden border border-border/20">
                      <div
                        className="h-full bg-red-400"
                        style={{
                          width: `${
                            cashFlowMetrics.income > 0
                              ? Math.min(
                                  100,
                                  (cashFlowMetrics.expense / cashFlowMetrics.income) * 100
                                )
                              : 100
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* KPI Breakdown Table */}
                <div className="overflow-x-auto border border-border/30 rounded-xl">
                  <table className="w-full text-left text-2xs border-collapse">
                    <thead className="bg-[#0b0f1a] text-muted-foreground border-b border-border/30 font-bold uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-4">Metric</th>
                        <th className="py-2.5 px-4 text-right">Value (INR)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/25 text-foreground/80 font-mono">
                      <tr>
                        <td className="py-3 px-4 font-sans font-semibold">Total Period Revenue</td>
                        <td className="py-3 px-4 text-right text-[#10b981] font-bold">
                          ₹{cashFlowMetrics.income.toLocaleString('en-IN')}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-3 px-4 font-sans font-semibold">
                          Total Period Expenditures
                        </td>
                        <td className="py-3 px-4 text-right text-red-400 font-bold">
                          ₹{cashFlowMetrics.expense.toLocaleString('en-IN')}
                        </td>
                      </tr>
                      <tr className="bg-muted/10 font-bold text-foreground">
                        <td className="py-3 px-4 font-sans">Net Cash Position (Savings)</td>
                        <td
                          className={`py-3 px-4 text-right font-bold ${
                            cashFlowMetrics.netSavings >= 0 ? 'text-[#10b981]' : 'text-red-400'
                          }`}
                        >
                          ₹{cashFlowMetrics.netSavings.toLocaleString('en-IN')}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-3 px-4 font-sans font-semibold">Savings Margin (%)</td>
                        <td className="py-3 px-4 text-right font-bold text-primary">
                          {cashFlowMetrics.savingsRate}%
                        </td>
                      </tr>
                      <tr>
                        <td className="py-3 px-4 font-sans font-semibold">Total Cash Inflow</td>
                        <td className="py-3 px-4 text-right text-[#10b981] font-bold">
                          ₹{cashFlowMetrics.cashIn.toLocaleString('en-IN')}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-3 px-4 font-sans font-semibold">Total Cash Outflow</td>
                        <td className="py-3 px-4 text-right text-red-400 font-bold">
                          ₹{cashFlowMetrics.cashOut.toLocaleString('en-IN')}
                        </td>
                      </tr>
                      <tr className="bg-muted/10 font-bold text-foreground">
                        <td className="py-3 px-4 font-sans">Net Cash Flow</td>
                        <td
                          className={`py-3 px-4 text-right font-bold ${
                            cashFlowMetrics.netCashFlow >= 0 ? 'text-[#10b981]' : 'text-red-400'
                          }`}
                        >
                          ₹{cashFlowMetrics.netCashFlow.toLocaleString('en-IN')}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CATEGORY SPENDING */}
          {activeTab === 'category' && (
            <div className="bg-[#0b0f1a]/40 border border-border/30 rounded-2xl p-6 space-y-4 print-border print:bg-transparent">
              <div className="flex justify-between items-center border-b border-border/30 pb-4 mb-2">
                <h2 className="text-base font-bold text-foreground">Category Spending Report</h2>
                <span className="text-3xs text-muted-foreground uppercase font-bold tracking-wider font-mono">
                  Sorted by Expenditure (Descending)
                </span>
              </div>

              {categoryBreakdown.length === 0 ? (
                <div className="text-center p-12 text-2xs text-muted-foreground italic">
                  No transaction data available for this range.
                </div>
              ) : (
                <div className="overflow-x-auto border border-border/30 rounded-xl">
                  <table className="w-full text-left text-2xs border-collapse">
                    <thead className="bg-[#0b0f1a] text-muted-foreground border-b border-border/30 font-bold uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-4">Category</th>
                        <th className="py-2.5 px-4 text-right">Income</th>
                        <th className="py-2.5 px-4 text-right">Expenses</th>
                        <th className="py-2.5 px-4 text-right">Net Flow</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/25 text-foreground/80 font-mono">
                      {categoryBreakdown.map((cat, idx) => (
                        <tr key={idx} className="hover:bg-muted/5 transition-colors">
                          <td className="py-3 px-4 font-sans font-normal text-foreground">
                            {cat.name}
                          </td>
                          <td className="py-3 px-4 text-right text-[#10b981]">
                            {cat.income > 0 ? `₹${cat.income.toLocaleString('en-IN')}` : '—'}
                          </td>
                          <td className="py-3 px-4 text-right text-red-400 font-normal">
                            {cat.expense > 0 ? `₹${cat.expense.toLocaleString('en-IN')}` : '—'}
                          </td>
                          <td
                            className={`py-3 px-4 text-right font-normal ${
                              cat.net >= 0 ? 'text-[#10b981]' : 'text-red-400'
                            }`}
                          >
                            ₹{cat.net.toLocaleString('en-IN')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: NET WORTH STATEMENT */}
          {activeTab === 'net-worth' && (
            <div className="bg-[#0b0f1a]/40 border border-border/30 rounded-2xl p-6 space-y-6 print-border print:bg-transparent">
              <div className="flex justify-between items-center border-b border-border/30 pb-4">
                <h2 className="text-base font-bold text-foreground">Net Worth Statement</h2>
                <span className="text-3xs text-muted-foreground uppercase font-bold tracking-wider font-mono">
                  Asset & Liability Breakdown
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Assets Table */}
                <div className="space-y-3">
                  <h3 className="text-2xs font-extrabold text-[#10b981] uppercase tracking-wider">
                    Assets (Cash & Bank)
                  </h3>
                  <div className="overflow-x-auto border border-border/30 rounded-xl">
                    <table className="w-full text-left text-2xs border-collapse">
                      <thead className="bg-[#0b0f1a] text-muted-foreground border-b border-border/30 font-bold uppercase">
                        <tr>
                          <th className="py-2 px-3">Account</th>
                          <th className="py-2 px-3 text-right">Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/25 font-mono">
                        {accounts
                          .filter(
                            (acc) =>
                              acc.type === 'accounts' ||
                              acc.type === 'cash'
                          )
                          .map((acc) => (
                            <tr key={acc.id}>
                              <td className="py-2.5 px-3 font-sans text-foreground">{acc.name}</td>
                              <td className="py-2.5 px-3 text-right text-[#10b981] font-bold">
                                ₹{acc.balance.toLocaleString('en-IN')}
                              </td>
                            </tr>
                          ))}
                        <tr className="bg-muted/10 font-bold">
                          <td className="py-2.5 px-3 font-sans">Total Assets</td>
                          <td className="py-2.5 px-3 text-right text-[#10b981]">
                            ₹{netWorthMetrics.assets.toLocaleString('en-IN')}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Liabilities Table */}
                <div className="space-y-3">
                  <h3 className="text-2xs font-extrabold text-red-400 uppercase tracking-wider">
                    Liabilities (Loans)
                  </h3>
                  <div className="overflow-x-auto border border-border/30 rounded-xl">
                    <table className="w-full text-left text-2xs border-collapse">
                      <thead className="bg-[#0b0f1a] text-muted-foreground border-b border-border/30 font-bold uppercase">
                        <tr>
                          <th className="py-2 px-3">Loan Target</th>
                          <th className="py-2 px-3 text-right">Outstanding</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/25 font-mono">
                        {accounts
                          .filter((acc) => acc.type === 'loan')
                          .map((acc) => (
                            <tr key={acc.id}>
                              <td className="py-2.5 px-3 font-sans text-foreground">{acc.name}</td>
                              <td className="py-2.5 px-3 text-right text-red-400 font-bold">
                                ₹{Math.abs(acc.balance).toLocaleString('en-IN')}
                              </td>
                            </tr>
                          ))}
                        {accounts.filter((acc) => acc.type === 'loan').length === 0 && (
                          <tr>
                            <td
                              colSpan={2}
                              className="py-4 px-3 text-center text-muted-foreground italic text-3xs"
                            >
                              No liability accounts configured.
                            </td>
                          </tr>
                        )}
                        <tr className="bg-muted/10 font-bold">
                          <td className="py-2.5 px-3 font-sans">Total Liabilities</td>
                          <td className="py-2.5 px-3 text-right text-red-400">
                            ₹{netWorthMetrics.liabilities.toLocaleString('en-IN')}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: TRANSACTION LEDGER */}
          {activeTab === 'ledger' && (
            <div className="bg-[#0b0f1a]/40 border border-border/30 rounded-2xl p-6 space-y-4 print-border print:bg-transparent">
              <div className="flex justify-between items-center border-b border-border/30 pb-4 mb-2">
                <h2 className="text-base font-bold text-foreground">Transaction Ledger</h2>
                <span className="text-3xs text-muted-foreground uppercase font-bold tracking-wider font-mono">
                  Showing {filteredTransactions.length} records matching filters
                </span>
              </div>

              {filteredTransactions.length === 0 ? (
                <div className="text-center p-12 text-2xs text-muted-foreground italic">
                  No records match the current filter selection.
                </div>
              ) : (
                <div className="overflow-x-auto border border-border/30 rounded-xl max-h-[400px] select-scrollbar">
                  <table className="w-full text-left text-2xs border-collapse">
                    <thead className="bg-[#0b0f1a] text-muted-foreground border-b border-border/30 font-bold uppercase sticky top-0">
                      <tr>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Description</th>
                        <th className="py-2.5 px-3">Category</th>
                        <th className="py-2.5 px-3">Account</th>
                        <th className="py-2.5 px-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/25 text-foreground/80 font-mono">
                      {filteredTransactions.map((t) => {
                        const accName = accounts.find((a) => a.id === t.account)?.name || 'Unknown';
                        return (
                          <tr key={t.id} className="hover:bg-muted/5 transition-colors">
                            <td className="py-2 px-3 font-sans">
                              {new Date(t.date).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </td>
                            <td className="py-2 px-3 font-sans font-semibold text-foreground">
                              {t.description}
                            </td>
                            <td className="py-2 px-3 font-sans">
                              <span className="px-1.5 py-0.5 rounded bg-muted border border-border/30 text-3xs">
                                {t.category}
                              </span>
                            </td>
                            <td className="py-2 px-3 font-sans">{accName}</td>
                            <td
                              className={`py-2 px-3 text-right font-bold ${
                                t.type === 'income'
                                  ? 'text-[#10b981]'
                                  : t.type === 'expense'
                                    ? 'text-red-400'
                                    : 'text-primary'
                              }`}
                            >
                              {t.type === 'expense' ? '-' : t.type === 'income' ? '+' : ''}₹
                              {t.amount.toLocaleString('en-IN')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
