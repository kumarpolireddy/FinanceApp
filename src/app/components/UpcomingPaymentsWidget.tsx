'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Receipt, ChevronRight, AlertCircle, Clock, CheckCircle2 } from 'lucide-react';
import { getStoredBills, BillPaymentReminder } from '@/lib/billStorage';

export default function UpcomingPaymentsWidget() {
  const [bills, setBills] = useState<BillPaymentReminder[]>([]);

  useEffect(() => {
    setBills(getStoredBills());
    const handleUpdate = () => setBills(getStoredBills());
    window.addEventListener('wealthiq_bills_updated', handleUpdate);
    return () => window.removeEventListener('wealthiq_bills_updated', handleUpdate);
  }, []);

  const { upcomingList, overdueTotal } = useMemo(() => {
    const activeUnpaid = bills.filter(
      (b) => b.status !== 'paid' && b.status !== 'skipped' && !(b.type === 'Credit Card' && Number(b.amount || 0) <= 0)
    );
    const overdue = activeUnpaid.filter((b) => b.status === 'overdue');
    const overdueTotal = overdue.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);

    const sorted = activeUnpaid.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 4);

    return { upcomingList: sorted, overdueTotal };
  }, [bills]);

  return (
    <div className="bg-secondary/60 border border-border/80 rounded-2xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
            <Receipt size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Upcoming Payments</h3>
            <p className="text-2xs text-muted-foreground">Scheduled bills & payment reminders</p>
          </div>
        </div>

        <Link
          href="/bills"
          className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
        >
          View All <ChevronRight size={14} />
        </Link>
      </div>

      {overdueTotal > 0 && (
        <div className="p-3 rounded-xl bg-negative-subtle/30 border border-negative/30 flex items-center justify-between text-xs text-negative font-semibold">
          <span className="flex items-center gap-1.5">
            <AlertCircle size={15} />
            Overdue Payments Total
          </span>
          <span className="font-mono font-extrabold text-sm">₹{overdueTotal.toLocaleString('en-IN')}</span>
        </div>
      )}

      {upcomingList.length === 0 ? (
        <div className="p-4 text-center text-xs text-muted-foreground bg-background/50 rounded-xl border border-border/40">
          No upcoming payments due soon. All bills are clear!
        </div>
      ) : (
        <div className="space-y-2">
          {upcomingList.map((bill) => {
            const todayStr = new Date().toISOString().split('T')[0];
            const dueDays = Math.round(
              (new Date(bill.dueDate + 'T00:00:00').getTime() - new Date(todayStr + 'T00:00:00').getTime()) /
                (1000 * 3600 * 24)
            );

            let dueLabel = '';
            if (dueDays < 0) dueLabel = `Overdue by ${Math.abs(dueDays)} day${Math.abs(dueDays) > 1 ? 's' : ''}`;
            else if (dueDays === 0) dueLabel = 'Due Today';
            else if (dueDays === 1) dueLabel = 'Due Tomorrow';
            else dueLabel = `Due in ${dueDays} days`;

            return (
              <div
                key={bill.id}
                className="p-3 rounded-xl bg-background border border-border/60 flex items-center justify-between text-xs"
              >
                <div className="space-y-0.5">
                  <p className="font-bold text-foreground">{bill.name}</p>
                  <p
                    className={`text-2xs font-semibold ${
                      dueDays < 0
                        ? 'text-negative font-bold'
                        : dueDays === 0
                        ? 'text-warning font-bold animate-pulse'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {dueLabel}
                  </p>
                </div>

                <span className="font-mono font-bold text-foreground text-sm">
                  ₹{bill.amount.toLocaleString('en-IN')}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
