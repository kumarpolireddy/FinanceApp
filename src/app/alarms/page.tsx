'use client';

import React, { useState, useEffect, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import {
  Clock,
  Plus,
  Bell,
  BellOff,
  CheckCircle2,
  Calendar,
  Volume2,
  Trash2,
  Edit2,
  Play,
  RotateCcw,
  Sparkles,
  CreditCard,
  Landmark,
  ShieldCheck,
  Zap,
  Info,
  Settings,
  History,
  AlertCircle,
  PlusCircle,
} from 'lucide-react';
import {
  FinanceAlarm,
  AlarmLogEntry,
  AlarmSettings,
  getStoredAlarms,
  saveStoredAlarms,
  addAlarm,
  updateAlarm,
  deleteAlarm,
  toggleAlarmEnabled,
  getAlarmSettings,
  saveAlarmSettings,
  getAlarmLogs,
  clearAlarmLogs,
} from '@/lib/alarmStorage';
import { playSoundSequence, requestNotificationPermission } from '@/lib/alarmSound';
import { getAccounts, getTransactions } from '@/lib/storage';

export default function AlarmsPage() {
  const [alarms, setAlarms] = useState<FinanceAlarm[]>([]);
  const [logs, setLogs] = useState<AlarmLogEntry[]>([]);
  const [settings, setSettings] = useState<AlarmSettings>(getAlarmSettings());
  const [activeTab, setActiveTab] = useState<'alarms' | 'smart_alerts' | 'history' | 'settings'>('alarms');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingAlarm, setEditingAlarm] = useState<FinanceAlarm | null>(null);

  // Form State
  const [formData, setFormData] = useState<{
    title: string;
    time: string;
    type: FinanceAlarm['type'];
    repeat: FinanceAlarm['repeat'];
    sound: FinanceAlarm['sound'];
    vibrate: boolean;
    snoozeDurationMinutes: number;
    notes: string;
  }>({
    title: '',
    time: '21:00',
    type: 'daily_expense',
    repeat: 'daily',
    sound: 'chime',
    vibrate: true,
    snoozeDurationMinutes: 10,
    notes: '',
  });

  // Accounts & Loans for Smart Alerts
  const [accounts, setAccounts] = useState<any[]>([]);
  const [todayTransactionCount, setTodayTransactionCount] = useState<number>(0);

  const loadData = () => {
    setAlarms(getStoredAlarms());
    setLogs(getAlarmLogs());
    setSettings(getAlarmSettings());

    const accs = getAccounts();
    setAccounts(accs);

    const txs = getTransactions();
    const todayStr = new Date().toISOString().split('T')[0];
    const count = txs.filter((t) => t.date && t.date.startsWith(todayStr)).length;
    setTodayTransactionCount(count);
  };

  useEffect(() => {
    loadData();
    const handleUpdate = () => loadData();
    window.addEventListener('wealthiq_alarms_updated', handleUpdate);
    return () => window.removeEventListener('wealthiq_alarms_updated', handleUpdate);
  }, []);

  // Compute Next Alarm
  const nextAlarmInfo = useMemo(() => {
    const active = alarms.filter((a) => a.enabled && settings.masterEnabled);
    if (active.length === 0) return null;

    const now = new Date();
    const currentMin = now.getHours() * 60 + now.getMinutes();

    let earliestDiff = Infinity;
    let nextAlarm: FinanceAlarm | null = null;

    active.forEach((alarm) => {
      const [h, m] = alarm.time.split(':').map(Number);
      const alarmMin = h * 60 + m;
      let diff = alarmMin - currentMin;
      if (diff <= 0) diff += 24 * 60; // Next day

      if (diff < earliestDiff) {
        earliestDiff = diff;
        nextAlarm = alarm;
      }
    });

    if (!nextAlarm) return null;
    const hrs = Math.floor(earliestDiff / 60);
    const mins = earliestDiff % 60;
    return {
      alarm: nextAlarm as FinanceAlarm,
      countdown: hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`,
    };
  }, [alarms, settings.masterEnabled]);

  const handleOpenAddModal = () => {
    setEditingAlarm(null);
    setFormData({
      title: 'Daily Expense Logging',
      time: '21:00',
      type: 'daily_expense',
      repeat: 'daily',
      sound: 'chime',
      vibrate: true,
      snoozeDurationMinutes: 10,
      notes: 'Log daily cash & card expenses',
    });
    setShowModal(true);
  };

  const handleOpenEditModal = (alarm: FinanceAlarm) => {
    setEditingAlarm(alarm);
    setFormData({
      title: alarm.title,
      time: alarm.time,
      type: alarm.type,
      repeat: alarm.repeat,
      sound: alarm.sound,
      vibrate: alarm.vibrate,
      snoozeDurationMinutes: alarm.snoozeDurationMinutes,
      notes: alarm.notes || '',
    });
    setShowModal(true);
  };

  const handleSaveAlarm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    if (editingAlarm) {
      updateAlarm(editingAlarm.id, {
        title: formData.title,
        time: formData.time,
        type: formData.type,
        repeat: formData.repeat,
        sound: formData.sound,
        vibrate: formData.vibrate,
        snoozeDurationMinutes: formData.snoozeDurationMinutes,
        notes: formData.notes,
      });
    } else {
      addAlarm({
        title: formData.title,
        time: formData.time,
        type: formData.type,
        repeat: formData.repeat,
        enabled: true,
        sound: formData.sound,
        vibrate: formData.vibrate,
        snoozeDurationMinutes: formData.snoozeDurationMinutes,
        notes: formData.notes,
      });
    }

    setShowModal(false);
    loadData();
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this alarm?')) {
      deleteAlarm(id);
      loadData();
    }
  };

  const handleToggle = (id: string) => {
    toggleAlarmEnabled(id);
    loadData();
  };

  const handleTestSound = (sound: FinanceAlarm['sound']) => {
    playSoundSequence(sound, settings.volume);
  };

  const handleTriggerTestAlarm = (alarm: FinanceAlarm) => {
    const event = new CustomEvent('wealthiq_trigger_test_alarm', { detail: alarm });
    window.dispatchEvent(event);
  };

  const handleMasterToggle = () => {
    const updated = { ...settings, masterEnabled: !settings.masterEnabled };
    setSettings(updated);
    saveAlarmSettings(updated);
  };

  const handleRequestNotifications = async () => {
    const granted = await requestNotificationPermission();
    if (granted) {
      const updated = { ...settings, webNotificationsEnabled: true };
      setSettings(updated);
      saveAlarmSettings(updated);
      alert('Desktop Notifications Enabled successfully!');
    } else {
      alert('Notification permission denied by browser.');
    }
  };

  // Helper 12h time format
  const format12Hour = (time24: string) => {
    const [h, m] = time24.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 || 12;
    return `${displayH}:${String(m).padStart(2, '0')} ${period}`;
  };

  const getCategoryBadge = (type: FinanceAlarm['type']) => {
    switch (type) {
      case 'daily_expense':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">Daily Expense</span>;
      case 'bill_due':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/20">Bill / Card Due</span>;
      case 'loan_emi':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/20">Loan EMI</span>;
      case 'budget_check':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/20">Budget Alert</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/20">Custom</span>;
    }
  };

  // Smart Due Items (Credit Cards & Loans)
  const creditCardsWithDue = useMemo(() => {
    return accounts.filter((a) => a.type === 'credit' && (a.dueDate || a.billingCycle));
  }, [accounts]);

  const loansWithEMI = useMemo(() => {
    return accounts.filter((a) => a.type === 'loan' && (a.emiDueDay || a.nextEmiDate));
  }, [accounts]);

  return (
    <AppLayout>
      <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Top Title Banner */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-950 p-6 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="space-y-1 z-10">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-inner">
                <Clock className="w-7 h-7 animate-pulse" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                  Reminders
                </h1>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 z-10">
            {/* Master Toggle */}
            <button
              onClick={handleMasterToggle}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-2xl border font-semibold text-xs sm:text-sm transition-all shadow-md ${
                settings.masterEnabled
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25'
                  : 'bg-red-500/15 border-red-500/30 text-red-400 hover:bg-red-500/25'
              }`}
            >
              {settings.masterEnabled ? (
                <>
                  <Bell className="w-4 h-4 text-emerald-400 animate-bounce" />
                  Alarms Active
                </>
              ) : (
                <>
                  <BellOff className="w-4 h-4 text-red-400" />
                  Alarms Muted
                </>
              )}
            </button>

            <button
              onClick={handleOpenAddModal}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm shadow-lg shadow-emerald-500/20 transition-all transform active:scale-95"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              Create Alarm
            </button>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-slate-900/80 border border-white/10 shadow-lg flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Alarms</p>
              <p className="text-2xl font-bold text-white mt-1">
                {alarms.filter((a) => a.enabled).length} / {alarms.length}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Zap className="w-6 h-6" />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/80 border border-white/10 shadow-lg flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Next Alarm</p>
              <p className="text-xl font-mono font-bold text-emerald-400 mt-1">
                {nextAlarmInfo ? `${format12Hour(nextAlarmInfo.alarm.time)}` : 'None active'}
              </p>
              {nextAlarmInfo && (
                <p className="text-2xs text-slate-400">Rings in {nextAlarmInfo.countdown}</p>
              )}
            </div>
            <div className="p-3 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <Clock className="w-6 h-6" />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/80 border border-white/10 shadow-lg flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Daily Expense Logging</p>
              <p className="text-xl font-bold text-white mt-1">
                {todayTransactionCount > 0 ? (
                  <span className="text-emerald-400 flex items-center gap-1.5 text-sm">
                    <CheckCircle2 className="w-4 h-4" /> {todayTransactionCount} logged today
                  </span>
                ) : (
                  <span className="text-amber-400 flex items-center gap-1.5 text-sm">
                    <AlertCircle className="w-4 h-4" /> Pending today
                  </span>
                )}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <PlusCircle className="w-6 h-6" />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/80 border border-white/10 shadow-lg flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Audio & Sound</p>
              <p className="text-sm font-semibold text-slate-200 mt-1">
                Volume: {Math.round(settings.volume * 100)}%
              </p>
              <p className="text-2xs text-slate-400 capitalize">Default: {settings.defaultSound}</p>
            </div>
            <div className="p-3 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Volume2 className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-white/10 space-x-2 sm:space-x-6 overflow-x-auto pb-1">
          {[
            { id: 'alarms', label: 'Active Alarms', icon: Clock, count: alarms.length },
            { id: 'smart_alerts', label: 'Smart Finance Alerts', icon: Sparkles, count: creditCardsWithDue.length + loansWithEMI.length },
            { id: 'history', label: 'Trigger Log & History', icon: History, count: logs.length },
            { id: 'settings', label: 'Alarm Settings', icon: Settings },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 py-3 px-4 rounded-xl font-semibold text-sm transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-400 border-b-2 border-emerald-400 shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {tab.count !== undefined && (
                  <span className={`px-2 py-0.5 rounded-full text-2xs font-bold ${
                    isActive ? 'bg-emerald-500 text-slate-950' : 'bg-white/10 text-slate-300'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* TAB 1: ACTIVE ALARMS */}
        {activeTab === 'alarms' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {alarms.map((alarm) => (
              <div
                key={alarm.id}
                className={`relative flex flex-col justify-between p-6 rounded-3xl border transition-all shadow-xl overflow-hidden group ${
                  alarm.enabled
                    ? 'bg-gradient-to-b from-slate-900 via-slate-900/90 to-slate-950 border-white/15 hover:border-emerald-500/40'
                    : 'bg-slate-900/40 border-white/5 opacity-60'
                }`}
              >
                {/* Glow Effect */}
                {alarm.enabled && (
                  <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/15 transition-all pointer-events-none" />
                )}

                <div>
                  {/* Top Bar */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    {getCategoryBadge(alarm.type)}

                    {/* Enable Toggle Switch */}
                    <button
                      onClick={() => handleToggle(alarm.id)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                        alarm.enabled ? 'bg-emerald-500' : 'bg-slate-700'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-slate-950 font-bold transition-transform ${
                          alarm.enabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Huge Time Display */}
                  <div className="my-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl sm:text-5xl font-mono font-extrabold text-white tracking-tight">
                        {format12Hour(alarm.time).split(' ')[0]}
                      </span>
                      <span className="text-lg font-bold text-emerald-400 font-mono">
                        {format12Hour(alarm.time).split(' ')[1]}
                      </span>
                    </div>
                  </div>

                  {/* Title & Notes */}
                  <h3 className="text-lg font-bold text-white mt-1 group-hover:text-emerald-300 transition-colors">
                    {alarm.title}
                  </h3>
                  {alarm.notes && (
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                      {alarm.notes}
                    </p>
                  )}
                </div>

                {/* Footer Controls & Schedule Tag */}
                <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-2xs font-semibold text-slate-400">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span className="capitalize">{alarm.repeat}</span>
                    <span>•</span>
                    <span className="capitalize">{alarm.sound} sound</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Test Sound Button */}
                    <button
                      onClick={() => handleTestSound(alarm.sound)}
                      className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-slate-300 transition-colors"
                      title="Play Sound Preview"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>

                    {/* Test Trigger Button */}
                    <button
                      onClick={() => handleTriggerTestAlarm(alarm)}
                      className="p-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition-colors"
                      title="Test Trigger Alarm Overlay"
                    >
                      <Play className="w-4 h-4 fill-emerald-400/20" />
                    </button>

                    {/* Edit Button */}
                    <button
                      onClick={() => handleOpenEditModal(alarm)}
                      className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-slate-300 transition-colors"
                      title="Edit Alarm"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    {/* Delete Button */}
                    <button
                      onClick={() => handleDelete(alarm.id)}
                      className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
                      title="Delete Alarm"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 2: SMART FINANCE ALERTS */}
        {activeTab === 'smart_alerts' && (
          <div className="space-y-6">
            {/* Daily Expense Logger Banner */}
            <div className="p-6 rounded-3xl bg-gradient-to-r from-emerald-950/60 via-slate-900 to-slate-950 border border-emerald-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="p-4 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <PlusCircle className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Daily Expense Logging Reminder</h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Never miss recording cash, UPI, or card payments. Set your preferred evening alert time.
                  </p>
                </div>
              </div>
              <button
                onClick={handleOpenAddModal}
                className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
              >
                Set Daily 9:00 PM Alarm
              </button>
            </div>

            {/* Credit Cards Section */}
            <div className="space-y-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-amber-400" />
                Credit Cards (Statement Billing Date & Payment Due Date Alarms)
              </h3>
              {creditCardsWithDue.length === 0 ? (
                <div className="p-8 rounded-2xl bg-slate-900/50 border border-white/5 text-center text-slate-400 text-sm">
                  No credit cards found with statement dates or due dates. Configure card details under <span className="text-emerald-400 font-semibold">Accounts</span>.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {creditCardsWithDue.map((card) => (
                    <div key={card.id} className="p-5 rounded-2xl bg-slate-900 border border-white/10 space-y-3">
                      <div>
                        <h4 className="font-bold text-white text-base">{card.name}</h4>
                        <div className="text-xs space-y-0.5 mt-1">
                          {card.billingCycle && (
                            <p className="text-sky-400 font-semibold">
                              Statement Billing Date: {card.billingCycle}th of month
                            </p>
                          )}
                          {card.dueDate && (
                            <p className="text-amber-400 font-semibold">
                              Payment Due Date: {card.dueDate}th of month (Notify {card.notificationDaysBefore || 3} days prior)
                            </p>
                          )}
                        </div>
                        <p className="text-2xs text-slate-400 mt-1">Balance: ₹{card.balance?.toLocaleString('en-IN')}</p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/10">
                        {card.billingCycle && (
                          <button
                            onClick={() => {
                              addAlarm({
                                title: `${card.name} Statement Generated`,
                                time: '10:00',
                                type: 'bill_due',
                                repeat: 'monthly',
                                dayOfMonth: parseInt(card.billingCycle) || 1,
                                enabled: true,
                                sound: 'chime',
                                vibrate: true,
                                snoozeDurationMinutes: 15,
                                notes: `Check monthly statement for ${card.name}`,
                              });
                              loadData();
                              setActiveTab('alarms');
                            }}
                            className="px-3 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 font-semibold text-xs border border-sky-500/30 transition-colors flex items-center gap-1"
                          >
                            + Billing Date Alarm ({card.billingCycle}th)
                          </button>
                        )}

                        {card.dueDate && (
                          <button
                            onClick={() => {
                              addAlarm({
                                title: `Pay ${card.name} Bill`,
                                time: '10:00',
                                type: 'bill_due',
                                repeat: 'monthly',
                                dayOfMonth: parseInt(card.dueDate) || 1,
                                enabled: true,
                                sound: 'bell',
                                vibrate: true,
                                snoozeDurationMinutes: 15,
                                notes: `Clear credit card bill balance for ${card.name}`,
                              });
                              loadData();
                              setActiveTab('alarms');
                            }}
                            className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 font-semibold text-xs border border-amber-500/30 transition-colors flex items-center gap-1"
                          >
                            + Payment Due Alarm ({card.dueDate}th)
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Active Loans Due Section */}
            <div className="space-y-3 pt-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Landmark className="w-5 h-5 text-blue-400" />
                Active Loans & Mortgage EMI Due Reminders
              </h3>
              {loansWithEMI.length === 0 ? (
                <div className="p-8 rounded-2xl bg-slate-900/50 border border-white/5 text-center text-slate-400 text-sm">
                  No active loans found. Create loans under <span className="text-emerald-400 font-semibold">Loans</span> to set auto EMI alarms.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {loansWithEMI.map((loan) => (
                    <div key={loan.id} className="p-5 rounded-2xl bg-slate-900 border border-white/10 flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-white text-base">{loan.name}</h4>
                        <p className="text-xs text-blue-400 font-semibold mt-0.5">
                          EMI Amount: ₹{loan.emiAmount?.toLocaleString('en-IN')} (Due Day: {loan.emiDueDay || 'Monthly'})
                        </p>
                        <p className="text-2xs text-slate-400">Lender: {loan.lenderName || 'N/A'}</p>
                      </div>
                      <button
                        onClick={() => {
                          addAlarm({
                            title: `Pay ${loan.name} EMI`,
                            time: '09:00',
                            type: 'loan_emi',
                            repeat: 'monthly',
                            dayOfMonth: loan.emiDueDay || 1,
                            enabled: true,
                            sound: 'radar',
                            vibrate: true,
                            snoozeDurationMinutes: 30,
                            notes: `Pay monthly EMI of ₹${loan.emiAmount || 0} for ${loan.name}`,
                          });
                          loadData();
                          setActiveTab('alarms');
                        }}
                        className="px-3.5 py-2 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 font-semibold text-xs border border-blue-500/30 transition-colors"
                      >
                        Create EMI Alarm
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: ALARM HISTORY LOG */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Trigger History & Action Log</h3>
              {logs.length > 0 && (
                <button
                  onClick={() => {
                    clearAlarmLogs();
                    loadData();
                  }}
                  className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Clear Log History
                </button>
              )}
            </div>

            {logs.length === 0 ? (
              <div className="p-12 text-center rounded-3xl bg-slate-900/40 border border-white/5 text-slate-400 text-sm">
                No alarm trigger history logged yet. When alarms ring, your actions will appear here.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-900/60">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white/5 text-slate-400 font-semibold border-b border-white/10">
                    <tr>
                      <th className="p-4">Alarm Title</th>
                      <th className="p-4">Category</th>
                      <th className="p-4">Triggered Time</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Action Taken</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-200">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-white/5 transition-colors">
                        <td className="p-4 font-bold text-white">{log.alarmTitle}</td>
                        <td className="p-4">{getCategoryBadge(log.type)}</td>
                        <td className="p-4 font-mono text-slate-400">
                          {new Date(log.triggeredAt).toLocaleString()}
                        </td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-full text-2xs font-bold uppercase ${
                            log.status === 'completed'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : log.status === 'snoozed'
                              ? 'bg-amber-500/20 text-amber-400'
                              : 'bg-slate-500/20 text-slate-400'
                          }`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="p-4 text-slate-300">{log.actionTaken || 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: SETTINGS */}
        {activeTab === 'settings' && (
          <div className="max-w-2xl bg-slate-900 p-6 sm:p-8 rounded-3xl border border-white/10 space-y-6">
            <h3 className="text-lg font-bold text-white border-b border-white/10 pb-4">
              Alarm Preferences & System Audio
            </h3>

            {/* Master Volume */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-300 flex items-center justify-between">
                <span>Master Sound Volume</span>
                <span className="font-mono text-emerald-400">{Math.round(settings.volume * 100)}%</span>
              </label>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={settings.volume}
                onChange={(e) => {
                  const updated = { ...settings, volume: parseFloat(e.target.value) };
                  setSettings(updated);
                  saveAlarmSettings(updated);
                }}
                className="w-full accent-emerald-500 cursor-pointer"
              />
            </div>

            {/* Sound Preview Tester */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-300">Test Synthesizer Audio Tones</label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {(['chime', 'digital', 'radar', 'gentle', 'bell'] as const).map((snd) => (
                  <button
                    key={snd}
                    onClick={() => handleTestSound(snd)}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-white/5 hover:bg-emerald-500/20 hover:text-emerald-300 text-xs font-semibold border border-white/10 transition-colors capitalize"
                  >
                    <Play className="w-3.5 h-3.5" />
                    {snd}
                  </button>
                ))}
              </div>
            </div>

            {/* Web Push Notification */}
            <div className="pt-4 border-t border-white/10 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-white">Browser Desktop Notifications</h4>
                <p className="text-2xs text-slate-400">Receive pop-up alerts even when app tab is in background.</p>
              </div>
              <button
                onClick={handleRequestNotifications}
                className="px-4 py-2 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 font-semibold text-xs border border-sky-500/30 transition-colors"
              >
                Enable Push Alerts
              </button>
            </div>
          </div>
        )}

        {/* CREATE / EDIT ALARM MODAL */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-lg rounded-3xl bg-slate-900 border border-white/15 p-6 sm:p-8 shadow-2xl space-y-6 text-white">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <h2 className="text-xl font-bold">
                  {editingAlarm ? 'Edit Scheduled Alarm' : 'Create New Alarm'}
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveAlarm} className="space-y-4">
                {/* Time Picker */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Time (24-Hour)</label>
                  <input
                    type="time"
                    value={formData.time}
                    onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                    required
                    className="w-full px-4 py-3 rounded-2xl bg-slate-950 border border-white/10 text-emerald-400 font-mono text-xl font-bold focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Alarm Title */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Alarm Title</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="e.g. Log Evening Expenses"
                    required
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-white text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Alarm Category / Type */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Alarm Category</label>
                    <select
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-white text-xs focus:outline-none"
                    >
                      <option value="daily_expense">Daily Expense</option>
                      <option value="bill_due">Bill / Card Due</option>
                      <option value="loan_emi">Loan EMI</option>
                      <option value="budget_check">Budget Check</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Repeat Frequency</label>
                    <select
                      value={formData.repeat}
                      onChange={(e) => setFormData({ ...formData, repeat: e.target.value as any })}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-white text-xs focus:outline-none"
                    >
                      <option value="daily">Daily</option>
                      <option value="weekdays">Mon - Fri</option>
                      <option value="weekends">Sat - Sun</option>
                      <option value="monthly">Monthly</option>
                      <option value="once">Once</option>
                    </select>
                  </div>
                </div>

                {/* Sound Selector */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Ringtone Sound</label>
                    <div className="flex gap-2">
                      <select
                        value={formData.sound}
                        onChange={(e) => setFormData({ ...formData, sound: e.target.value as any })}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-white text-xs focus:outline-none capitalize"
                      >
                        <option value="chime">Chime</option>
                        <option value="digital">Digital Beep</option>
                        <option value="radar">Radar Pulse</option>
                        <option value="gentle">Gentle Swell</option>
                        <option value="bell">Resonant Bell</option>
                        <option value="none">Silent (Visual only)</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => handleTestSound(formData.sound)}
                        className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white"
                        title="Test Sound"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Snooze Duration</label>
                    <select
                      value={formData.snoozeDurationMinutes}
                      onChange={(e) => setFormData({ ...formData, snoozeDurationMinutes: Number(e.target.value) })}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-white text-xs focus:outline-none"
                    >
                      <option value={5}>5 minutes</option>
                      <option value={10}>10 minutes</option>
                      <option value={15}>15 minutes</option>
                      <option value={30}>30 minutes</option>
                    </select>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Notes & Details</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Add optional instructions or reminders..."
                    rows={2}
                    className="w-full px-4 py-2 rounded-xl bg-slate-950 border border-white/10 text-white text-xs focus:outline-none"
                  />
                </div>

                <div className="pt-4 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20"
                  >
                    {editingAlarm ? 'Save Changes' : 'Create Alarm'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
