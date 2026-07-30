'use client';

import React, { useState, useEffect, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { getTransactions, getAccounts, type Transaction, type Account } from '@/lib/storage';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const selectedYear = currentDate.getFullYear();
  const selectedMonth = currentDate.getMonth();

  useEffect(() => {
    setTransactions(getTransactions(true));
    setAccounts(getAccounts(true));
  }, []);

  const shiftMonth = (delta: number) => {
    setCurrentDate(prev => {
      const next = new Date(prev);
      next.setMonth(next.getMonth() + delta);
      return next;
    });
    setSelectedDay(null);
  };

  const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  
  const monthTransactions = useMemo(() => {
    return transactions.filter(t => t.date && t.date.startsWith(monthKey));
  }, [transactions, monthKey]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(selectedYear, selectedMonth, 1).getDay();
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    
    const dayTotals: Record<number, { income: number, expense: number }> = {};
    monthTransactions.forEach(t => {
      const day = new Date(t.date).getDate();
      if (!dayTotals[day]) dayTotals[day] = { income: 0, expense: 0 };
      if (t.type === 'income') dayTotals[day].income += t.amount;
      else if (t.type === 'expense') dayTotals[day].expense += t.amount;
    });

    const grid = [];
    for (let i = 0; i < firstDay; i++) {
      grid.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      grid.push({
        day: d,
        income: dayTotals[d]?.income || 0,
        expense: dayTotals[d]?.expense || 0
      });
    }
    return grid;
  }, [monthTransactions, selectedYear, selectedMonth]);

  const selectedDayTransactions = useMemo(() => {
    if (selectedDay === null) return [];
    return monthTransactions.filter(t => new Date(t.date).getDate() === selectedDay);
  }, [monthTransactions, selectedDay]);

  const formatVal = (val: number) => {
    return val.toLocaleString('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    });
  };

  return (
    <AppLayout>
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
        
        {/* Header with Nav */}
        <div className="flex justify-between items-center bg-card border border-border p-4 rounded-2xl shadow-sm">
          <h1 className="text-lg md:text-xl font-extrabold text-foreground tracking-tight">Financial Calendar</h1>
          <div className="flex items-center gap-4">
            <button onClick={() => shiftMonth(-1)} className="p-1.5 rounded-lg border border-border hover:bg-muted/50 transition">
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm font-bold text-foreground min-w-[120px] text-center">
              {MONTH_NAMES[selectedMonth]} {selectedYear}
            </span>
            <button onClick={() => shiftMonth(1)} className="p-1.5 rounded-lg border border-border hover:bg-muted/50 transition">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="bg-card border border-border rounded-2xl p-4 shadow-md">
          {/* Weekdays */}
          <div className="grid grid-cols-7 text-center gap-2 mb-3 border-b border-border/60 pb-3">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((w, idx) => (
              <span 
                key={w} 
                className={`text-2xs font-extrabold uppercase ${idx === 0 ? 'text-negative' : idx === 6 ? 'text-primary' : 'text-muted-foreground'}`}
              >
                {w}
              </span>
            ))}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7 gap-3">
            {calendarDays.map((cell, idx) => {
              if (!cell) return <div key={`empty-${idx}`} className="min-h-[70px]"></div>;
              
              const isSelected = selectedDay === cell.day;
              const hasValues = cell.income > 0 || cell.expense > 0;

              return (
                <div
                  key={`day-${cell.day}`}
                  onClick={() => setSelectedDay(cell.day)}
                  className={`min-h-[75px] rounded-xl flex flex-col justify-between p-2 cursor-pointer border transition-all ${
                    isSelected 
                      ? 'bg-primary/10 border-primary shadow-sm shadow-primary/10' 
                      : 'border-border/60 hover:bg-muted/10'
                  }`}
                >
                  <span className={`text-xs font-black ${
                    (idx % 7 === 0) ? 'text-negative' : (idx % 7 === 6) ? 'text-primary' : 'text-foreground'
                  }`}>
                    {cell.day}
                  </span>
                  {hasValues && (
                    <div className="text-4xs font-bold leading-tight scale-[0.9] origin-bottom-left tracking-tighter space-y-0.5">
                      {cell.income > 0 && (
                        <span className="text-positive block font-black">+{cell.income.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                      )}
                      {cell.expense > 0 && (
                        <span className="text-negative block font-black">-{cell.expense.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected day details */}
        {selectedDay !== null && (
          <div className="space-y-3 animate-slide-up">
            <h3 className="text-sm font-extrabold text-foreground tracking-tight">
              Transactions for {selectedDay} {MONTH_NAMES[selectedMonth]} {selectedYear}
            </h3>
            {selectedDayTransactions.length === 0 ? (
              <div className="bg-card border border-border rounded-2xl p-6 text-center text-xs text-muted-foreground">
                No transactions recorded on this day.
              </div>
            ) : (
              <div className="bg-card border border-border rounded-2xl divide-y divide-border/60 overflow-hidden shadow-sm">
                {selectedDayTransactions.map(tx => {
                  const isTransfer = tx.type === 'transfer';
                  const sourceName = accounts.find(a => a.id === tx.account)?.name || 'Unknown';
                  const destName = isTransfer ? (accounts.find(a => a.id === tx.toAccount)?.name || 'Unknown') : '';
                  return (
                    <div key={tx.id} className="flex justify-between items-center p-4 hover:bg-muted/5 transition">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-foreground">{tx.description}</span>
                          {!isTransfer && (
                            <span className="text-4xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-bold">
                              {tx.category}
                            </span>
                          )}
                        </div>
                        <span className="text-3xs text-muted-foreground font-medium block mt-1">
                          {isTransfer ? `${sourceName} ➔ ${destName}` : sourceName}
                        </span>
                      </div>
                      <span className={`text-xs font-bold tabular-nums ${
                        tx.type === 'income' ? 'text-positive' : tx.type === 'expense' ? 'text-negative' : 'text-muted-foreground'
                      }`}>
                        {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : '⇄'}
                        {formatVal(tx.amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </AppLayout>
  );
}
