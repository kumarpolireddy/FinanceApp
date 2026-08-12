'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  Clock,
  CheckCircle2,
  X,
  Volume2,
  VolumeX,
  AlertTriangle,
  PlusCircle,
  CreditCard,
  Landmark,
  ShieldAlert,
  RotateCcw,
} from 'lucide-react';
import { FinanceAlarm, addAlarmLog, getAlarmSettings, updateAlarm } from '@/lib/alarmStorage';
import { stopAlarmRingtone, startAlarmRingtone } from '@/lib/alarmSound';

interface AlarmAlertModalProps {
  alarm: FinanceAlarm | null;
  onClose: () => void;
}

export default function AlarmAlertModal({ alarm, onClose }: AlarmAlertModalProps) {
  const router = useRouter();
  const [muted, setMuted] = useState(false);
  const [snoozeMinutes, setSnoozeMinutes] = useState(10);

  useEffect(() => {
    if (alarm) {
      const settings = getAlarmSettings();
      if (settings.soundEnabled && alarm.sound !== 'none' && !muted) {
        startAlarmRingtone(alarm.sound, settings.volume);
      }
      setSnoozeMinutes(alarm.snoozeDurationMinutes || 10);
    }
    return () => {
      stopAlarmRingtone();
    };
  }, [alarm]);

  if (!alarm) return null;

  const handleToggleMute = () => {
    if (muted) {
      const settings = getAlarmSettings();
      startAlarmRingtone(alarm.sound, settings.volume);
      setMuted(false);
    } else {
      stopAlarmRingtone();
      setMuted(true);
    }
  };

  const handleDismiss = () => {
    stopAlarmRingtone();
    addAlarmLog({
      alarmId: alarm.id,
      alarmTitle: alarm.title,
      type: alarm.type,
      triggeredAt: new Date().toISOString(),
      status: 'dismissed',
      actionTaken: 'User dismissed alarm',
    });
    // Clear snoozedUntil if any
    updateAlarm(alarm.id, { snoozedUntil: undefined, lastTriggered: new Date().toISOString() });
    onClose();
  };

  const handleSnooze = () => {
    stopAlarmRingtone();
    const snoozedTime = new Date(Date.now() + snoozeMinutes * 60 * 1000).toISOString();
    updateAlarm(alarm.id, { snoozedUntil: snoozedTime });
    addAlarmLog({
      alarmId: alarm.id,
      alarmTitle: alarm.title,
      type: alarm.type,
      triggeredAt: new Date().toISOString(),
      status: 'snoozed',
      actionTaken: `Snoozed for ${snoozeMinutes} mins`,
    });
    onClose();
  };

  const handleAction = () => {
    stopAlarmRingtone();
    addAlarmLog({
      alarmId: alarm.id,
      alarmTitle: alarm.title,
      type: alarm.type,
      triggeredAt: new Date().toISOString(),
      status: 'completed',
      actionTaken: 'Followed action link',
    });
    updateAlarm(alarm.id, { snoozedUntil: undefined, lastTriggered: new Date().toISOString() });
    onClose();

    if (alarm.type === 'daily_expense') {
      router.push('/add-expense');
    } else if (alarm.type === 'bill_due') {
      router.push('/accounts');
    } else if (alarm.type === 'loan_emi') {
      router.push('/loans');
    } else if (alarm.type === 'budget_check') {
      router.push('/budgets');
    } else {
      router.push('/transactions');
    }
  };

  const getIcon = () => {
    switch (alarm.type) {
      case 'daily_expense':
        return <PlusCircle className="w-10 h-10 text-emerald-400" />;
      case 'bill_due':
        return <CreditCard className="w-10 h-10 text-amber-400" />;
      case 'loan_emi':
        return <Landmark className="w-10 h-10 text-blue-400" />;
      case 'budget_check':
        return <ShieldAlert className="w-10 h-10 text-purple-400" />;
      default:
        return <Bell className="w-10 h-10 text-sky-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/20 bg-gradient-to-b from-slate-900/90 via-slate-900/95 to-slate-950 p-6 sm:p-8 shadow-2xl shadow-emerald-500/10 text-white">
        {/* Animated Glow Halo */}
        <div className="absolute -top-24 -left-24 w-60 h-60 bg-emerald-500/20 rounded-full blur-3xl animate-pulse pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-60 h-60 bg-sky-500/20 rounded-full blur-3xl animate-pulse pointer-events-none" />

        {/* Top Header Controls */}
        <div className="flex items-center justify-between mb-6">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-white/10 text-white/90 border border-white/10">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            Alarm Triggered
          </span>

          <button
            onClick={handleToggleMute}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            title={muted ? 'Unmute sound' : 'Mute sound'}
          >
            {muted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5 text-emerald-400 animate-bounce" />}
          </button>
        </div>

        {/* Main Alarm Visual & Details */}
        <div className="flex flex-col items-center text-center my-4">
          <div className="p-4 mb-4 rounded-2xl bg-white/10 border border-white/15 shadow-inner">
            {getIcon()}
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-2">
            {alarm.title}
          </h2>

          <div className="flex items-center gap-2 text-3xl sm:text-4xl font-mono font-bold text-emerald-400 my-2">
            <Clock className="w-7 h-7" />
            {alarm.time}
          </div>

          {alarm.notes && (
            <p className="text-sm text-slate-300 max-w-sm mt-2 leading-relaxed bg-white/5 px-4 py-2 rounded-xl border border-white/10">
              {alarm.notes}
            </p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="mt-8 space-y-3">
          <button
            onClick={handleAction}
            className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-base shadow-lg shadow-emerald-500/25 transition-all transform active:scale-95"
          >
            <CheckCircle2 className="w-5 h-5" />
            Take Action Now
          </button>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center rounded-2xl bg-white/10 border border-white/15 p-1">
              <select
                value={snoozeMinutes}
                onChange={(e) => setSnoozeMinutes(Number(e.target.value))}
                className="w-1/2 bg-transparent text-xs text-center font-medium text-white focus:outline-none cursor-pointer"
              >
                <option value={5} className="bg-slate-900 text-white">5m</option>
                <option value={10} className="bg-slate-900 text-white">10m</option>
                <option value={15} className="bg-slate-900 text-white">15m</option>
                <option value={30} className="bg-slate-900 text-white">30m</option>
              </select>
              <button
                onClick={handleSnooze}
                className="w-1/2 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold text-xs transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Snooze
              </button>
            </div>

            <button
              onClick={handleDismiss}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-medium text-sm border border-white/10 transition-colors"
            >
              <X className="w-4 h-4 text-slate-400" />
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
