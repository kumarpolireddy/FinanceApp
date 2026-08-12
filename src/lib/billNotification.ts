'use client';

import { BillPaymentReminder, getBillSettings } from './billStorage';

export async function requestLocalNotificationPermissions(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const isCapacitor = typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.();

  if (isCapacitor) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const status = await LocalNotifications.requestPermissions();
      return status.display === 'granted';
    } catch (e) {
      console.warn('Capacitor LocalNotifications permission error:', e);
    }
  }

  // Web Notification fallback
  if ('Notification' in window) {
    if (Notification.permission === 'granted') return true;
    if (Notification.permission !== 'denied') {
      const result = await Notification.requestPermission();
      return result === 'granted';
    }
  }
  return false;
}

export async function scheduleBillNotifications(bill: BillPaymentReminder): Promise<void> {
  if (typeof window === 'undefined') return;

  const settings = getBillSettings();
  if (bill.status === 'paid' || bill.status === 'skipped') return;

  const isCapacitor = typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.();
  const dueDateObj = new Date(`${bill.dueDate}T${bill.dueTime || '09:00'}:00`);

  const remindersToSchedule: { offsetDays: number; title: string; body: string; id: number }[] = [];

  const baseHash = Math.abs(
    bill.id.split('').reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0)
  ) % 100000;

  // Custom Auto Reminders for Credit Cards
  if (bill.type === 'Credit Card' && settings.creditCardReminders?.enabled) {
    const days = settings.creditCardReminders.daysBefore || 5;
    remindersToSchedule.push({
      offsetDays: -Math.abs(days),
      title: `Credit Card Due Alert (${days} days left): ${bill.name}`,
      body: `${bill.name} bill payment of ₹${bill.amount.toLocaleString('en-IN')} is due in ${days} day(s) on ${bill.dueDate}.`,
      id: baseHash + Math.abs(days) * 10 + 1,
    });
  }

  // Custom Auto Reminders for EMI / Loans
  if (bill.type === 'EMI / Loan' && settings.emiReminders?.enabled) {
    const days = settings.emiReminders.daysBefore || 5;
    remindersToSchedule.push({
      offsetDays: -Math.abs(days),
      title: `EMI Payment Due Alert (${days} days left): ${bill.name}`,
      body: `${bill.name} EMI of ₹${bill.amount.toLocaleString('en-IN')} is due in ${days} day(s) on ${bill.dueDate}.`,
      id: baseHash + Math.abs(days) * 10 + 2,
    });
  }

  if (bill.reminderSchedule.sevenDaysBefore) {
    remindersToSchedule.push({
      offsetDays: -7,
      title: `7 Days Reminder: ${bill.name}`,
      body: `${bill.name} payment of ₹${bill.amount.toLocaleString('en-IN')} is due in 7 days (${bill.dueDate}).`,
      id: baseHash + 7,
    });
  }

  if (bill.reminderSchedule.threeDaysBefore) {
    remindersToSchedule.push({
      offsetDays: -3,
      title: `Due Soon: ${bill.name}`,
      body: `${bill.name} payment of ₹${bill.amount.toLocaleString('en-IN')} is due in 3 days (${bill.dueDate}).`,
      id: baseHash + 3,
    });
  }

  if (bill.reminderSchedule.oneDayBefore) {
    remindersToSchedule.push({
      offsetDays: -1,
      title: `Due Tomorrow: ${bill.name}`,
      body: `${bill.name} payment of ₹${bill.amount.toLocaleString('en-IN')} is due tomorrow.`,
      id: baseHash + 1,
    });
  }

  if (bill.reminderSchedule.onDueDate) {
    remindersToSchedule.push({
      offsetDays: 0,
      title: `Payment Due Today: ${bill.name}`,
      body: `${bill.name} payment of ₹${bill.amount.toLocaleString('en-IN')} is due today!`,
      id: baseHash + 0,
    });
  }

  const now = new Date();

  if (isCapacitor) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const notificationsToSchedule = remindersToSchedule
        .map((r) => {
          const scheduleDate = new Date(dueDateObj);
          scheduleDate.setDate(scheduleDate.getDate() + r.offsetDays);
          return {
            id: r.id,
            title: r.title,
            body: r.body,
            schedule: { at: scheduleDate },
            sound: settings.soundEnabled ? 'res://platform_default' : undefined,
            extra: { billId: bill.id },
          };
        })
        .filter((n) => n.schedule.at > now);

      if (notificationsToSchedule.length > 0) {
        await LocalNotifications.schedule({ notifications: notificationsToSchedule as any });
      }
    } catch (err) {
      console.warn('Capacitor LocalNotifications scheduling failed:', err);
    }
  } else {
    // Web Fallback: trigger notification if scheduled time is reached
    remindersToSchedule.forEach((r) => {
      const scheduleDate = new Date(dueDateObj);
      scheduleDate.setDate(scheduleDate.getDate() + r.offsetDays);
      if (Math.abs(scheduleDate.getTime() - now.getTime()) < 60000) {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(r.title, { body: r.body });
        }
      }
    });
  }
}

export async function cancelBillNotifications(billId: string): Promise<void> {
  const isCapacitor = typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.();
  if (isCapacitor) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const baseHash = Math.abs(
        billId.split('').reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0)
      ) % 100000;
      await LocalNotifications.cancel({
        notifications: [{ id: baseHash + 7 }, { id: baseHash + 3 }, { id: baseHash + 1 }, { id: baseHash + 0 }],
      });
    } catch (e) {
      console.warn('Failed to cancel Capacitor notifications:', e);
    }
  }
}
