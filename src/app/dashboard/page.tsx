'use client';

import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import DashboardKPIs from '../components/DashboardKPIs';
import IncomeExpenseChart from '../components/IncomeExpenseChart';
import CategorySpendingChart from '../components/CategorySpendingChart';
import AccountBalances from '../components/AccountBalances';
import BudgetUtilization from '../components/BudgetUtilization';
import DashboardHeader from '../components/DashboardHeader';
import GoalProgressRings from '../components/GoalProgressRings';
import UpcomingPaymentsWidget from '../components/UpcomingPaymentsWidget';

export default function DashboardPage() {
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');

  const updateDate = (month: number, year: number) => {
    setSelectedMonth(month);
    setSelectedYear(year);
  };

  return (
    <AppLayout>
      <div className="px-0 md:px-6 py-6 xl:px-10 2xl:px-16 max-w-screen-2xl mx-auto space-y-6">
        <div className="px-4 md:px-0">
          <DashboardHeader
            selectedMonth={selectedMonth}
            selectedYear={selectedYear}
            updateDate={updateDate}
            selectedAccountId={selectedAccountId}
            setSelectedAccountId={setSelectedAccountId}
          />
        </div>
        <DashboardKPIs
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          selectedAccountId={selectedAccountId}
        />
        {/* Upcoming Payments Widget */}
        <UpcomingPaymentsWidget />

        {/* Charts row */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2">
            <IncomeExpenseChart
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
              selectedAccountId={selectedAccountId}
            />
          </div>
          <div className="xl:col-span-1">
            <CategorySpendingChart
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
              selectedAccountId={selectedAccountId}
            />
          </div>
        </div>
        {/* Bottom row */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div>
            <AccountBalances
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
              selectedAccountId={selectedAccountId}
              setSelectedAccountId={setSelectedAccountId}
            />
          </div>
          <div>
            <BudgetUtilization
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
              selectedAccountId={selectedAccountId}
            />
          </div>
        </div>
        {/* Goal Progress Rings row */}
        <GoalProgressRings />
      </div>
    </AppLayout>
  );
}
