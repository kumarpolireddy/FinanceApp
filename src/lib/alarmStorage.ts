'use client';

export interface FinanceAlarm {
  id: string;
  title: string;
  time: string; // "HH:MM" in 24h format
  type: 'daily_expense' | 'bill_due' | 'loan_emi' | 'budget_check' | 'custom';
  repeat: 'daily' | 'weekdays' | 'weekends' | 'monthly' | 'once';
  daysOfWeek?: number[]; // 0 = Sun, 1 = Mon, ..., 6 = Sat
  dayOfMonth?: number; // 1 - 31
  enabled: boolean;
  sound: 'chime' | 'digital' | 'radar' | 'gentle' | 'bell' | 'none';
  vibrate: boolean;
  snoozeDurationMinutes: number; // e.g. 5, 10, 15, 30
  linkedAccountId?: string;
  linkedBudgetId?: string;
  amount?: number;
  notes?: string;
  lastTriggered?: string; // ISO String
  snoozedUntil?: string; // ISO String
  createdAt: string;
  updatedAt: string;
}

export interface AlarmLogEntry {
  id: string;
  alarmId: string;
  alarmTitle: string;
  type: FinanceAlarm['type'];
  triggeredAt: string;
  status: 'dismissed' | 'snoozed' | 'completed';
  actionTaken?: string;
}

export interface AlarmSettings {
  masterEnabled: boolean;
  soundEnabled: boolean;
  defaultSound: FinanceAlarm['sound'];
  volume: number; // 0.0 to 1.0
  allowSnooze: boolean;
  defaultSnoozeMinutes: number;
  webNotificationsEnabled: boolean;
}

const ALARMS_STORAGE_KEY = 'wealthiq_finance_alarms';
const ALARM_LOGS_STORAGE_KEY = 'wealthiq_alarm_logs';
const ALARM_SETTINGS_STORAGE_KEY = 'wealthiq_alarm_settings';

export const DEFAULT_ALARM_SETTINGS: AlarmSettings = {
  masterEnabled: true,
  soundEnabled: true,
  defaultSound: 'chime',
  volume: 0.8,
  allowSnooze: true,
  defaultSnoozeMinutes: 10,
  webNotificationsEnabled: true,
};

export const INITIAL_DEFAULT_ALARMS: FinanceAlarm[] = [
  {
    id: 'alarm_daily_logger',
    title: 'Daily Expense Logging',
    time: '21:00',
    type: 'daily_expense',
    repeat: 'daily',
    enabled: true,
    sound: 'chime',
    vibrate: true,
    snoozeDurationMinutes: 10,
    notes: "Don't forget to log today's transactions!",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

function safeGetItem(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.error('Failed to set localStorage item', key, e);
  }
}

export function getStoredAlarms(): FinanceAlarm[] {
  const data = safeGetItem(ALARMS_STORAGE_KEY);
  let alarms: FinanceAlarm[] = [];
  if (data) {
    try {
      const parsed: FinanceAlarm[] = JSON.parse(data);
      alarms = parsed.filter(
        (a) =>
          a.id !== 'alarm_bill_due' &&
          a.id !== 'alarm_loan_emi' &&
          a.id !== 'alarm_monthly_budget' &&
          a.title !== 'Credit Card & Bill Due Alert' &&
          a.title !== 'Loan EMI Due Reminder' &&
          a.title !== 'Monthly Budget Checkup'
      );
      safeSetItem(ALARMS_STORAGE_KEY, JSON.stringify(alarms));
    } catch {
      alarms = INITIAL_DEFAULT_ALARMS;
    }
  } else {
    alarms = INITIAL_DEFAULT_ALARMS;
    saveStoredAlarms(alarms);
  }
  return alarms;
}

export function saveStoredAlarms(alarms: FinanceAlarm[]): void {
  safeSetItem(ALARMS_STORAGE_KEY, JSON.stringify(alarms));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('wealthiq_alarms_updated'));
  }
}

export function addAlarm(alarmData: Omit<FinanceAlarm, 'id' | 'createdAt' | 'updatedAt'>): FinanceAlarm {
  const alarms = getStoredAlarms();
  const now = new Date().toISOString();
  const newAlarm: FinanceAlarm = {
    ...alarmData,
    id: 'alarm_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    createdAt: now,
    updatedAt: now,
  };
  alarms.push(newAlarm);
  saveStoredAlarms(alarms);
  return newAlarm;
}

export function updateAlarm(id: string, updates: Partial<FinanceAlarm>): FinanceAlarm | null {
  const alarms = getStoredAlarms();
  const index = alarms.findIndex((a) => a.id === id);
  if (index === -1) return null;

  alarms[index] = {
    ...alarms[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  saveStoredAlarms(alarms);
  return alarms[index];
}

export function deleteAlarm(id: string): boolean {
  const alarms = getStoredAlarms();
  const filtered = alarms.filter((a) => a.id !== id);
  if (filtered.length === alarms.length) return false;
  saveStoredAlarms(filtered);
  return true;
}

export function toggleAlarmEnabled(id: string): FinanceAlarm | null {
  const alarms = getStoredAlarms();
  const alarm = alarms.find((a) => a.id === id);
  if (!alarm) return null;
  return updateAlarm(id, { enabled: !alarm.enabled });
}

export function getAlarmSettings(): AlarmSettings {
  const data = safeGetItem(ALARM_SETTINGS_STORAGE_KEY);
  if (!data) {
    saveAlarmSettings(DEFAULT_ALARM_SETTINGS);
    return DEFAULT_ALARM_SETTINGS;
  }
  try {
    return { ...DEFAULT_ALARM_SETTINGS, ...JSON.parse(data) };
  } catch {
    return DEFAULT_ALARM_SETTINGS;
  }
}

export function saveAlarmSettings(settings: AlarmSettings): void {
  safeSetItem(ALARM_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function getAlarmLogs(): AlarmLogEntry[] {
  const data = safeGetItem(ALARM_LOGS_STORAGE_KEY);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export function addAlarmLog(entry: Omit<AlarmLogEntry, 'id'>): void {
  const logs = getAlarmLogs();
  const newLog: AlarmLogEntry = {
    ...entry,
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
  };
  const updated = [newLog, ...logs].slice(0, 100);
  safeSetItem(ALARM_LOGS_STORAGE_KEY, JSON.stringify(updated));
}

export function clearAlarmLogs(): void {
  safeSetItem(ALARM_LOGS_STORAGE_KEY, JSON.stringify([]));
}
