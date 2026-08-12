'use client';

import React, { useEffect, useState } from 'react';
import { FinanceAlarm, getStoredAlarms, getAlarmSettings } from '@/lib/alarmStorage';
import { triggerSystemNotification } from '@/lib/alarmSound';
import AlarmAlertModal from './AlarmAlertModal';

export default function AlarmListener() {
  const [activeTriggeredAlarm, setActiveTriggeredAlarm] = useState<FinanceAlarm | null>(null);

  useEffect(() => {
    const checkAlarms = () => {
      const settings = getAlarmSettings();
      if (!settings.masterEnabled) return;

      const alarms = getStoredAlarms();
      const now = new Date();
      const currentHours = String(now.getHours()).padStart(2, '0');
      const currentMinutes = String(now.getMinutes()).padStart(2, '0');
      const currentTimeStr = `${currentHours}:${currentMinutes}`;
      const todayISO = now.toISOString().split('T')[0]; // "YYYY-MM-DD"

      for (const alarm of alarms) {
        if (!alarm.enabled) continue;

        // Check if snoozed
        if (alarm.snoozedUntil) {
          const snoozedTime = new Date(alarm.snoozedUntil);
          if (now >= snoozedTime) {
            triggerAlarm(alarm);
            break;
          }
        }

        // Match scheduled HH:MM time
        if (alarm.time === currentTimeStr) {
          // Check if already triggered today (unless snoozed)
          if (alarm.lastTriggered && alarm.lastTriggered.startsWith(todayISO)) {
            continue;
          }

          // Check day frequency conditions
          const dayOfWeek = now.getDay(); // 0 = Sun, 6 = Sat
          const dayOfMonth = now.getDate();

          if (alarm.repeat === 'weekdays' && (dayOfWeek === 0 || dayOfWeek === 6)) {
            continue;
          }
          if (alarm.repeat === 'weekends' && (dayOfWeek !== 0 && dayOfWeek !== 6)) {
            continue;
          }
          if (alarm.repeat === 'monthly' && alarm.dayOfMonth && alarm.dayOfMonth !== dayOfMonth) {
            continue;
          }
          if (alarm.daysOfWeek && alarm.daysOfWeek.length > 0 && !alarm.daysOfWeek.includes(dayOfWeek)) {
            continue;
          }

          triggerAlarm(alarm);
          break;
        }
      }
    };

    const triggerAlarm = (alarm: FinanceAlarm) => {
      setActiveTriggeredAlarm(alarm);
      const settings = getAlarmSettings();
      if (settings.webNotificationsEnabled) {
        triggerSystemNotification(
          `⏰ ${alarm.title}`,
          alarm.notes || `Scheduled alarm at ${alarm.time}`
        );
      }
    };

    // Run check immediately on mount
    checkAlarms();

    // Interval check every 30 seconds
    const intervalId = setInterval(checkAlarms, 30000);

    // Also listen to custom test event
    const handleTestTrigger = (e: CustomEvent<FinanceAlarm>) => {
      if (e.detail) {
        setActiveTriggeredAlarm(e.detail);
      }
    };

    window.addEventListener('wealthiq_trigger_test_alarm' as any, handleTestTrigger);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('wealthiq_trigger_test_alarm' as any, handleTestTrigger);
    };
  }, []);

  return (
    <AlarmAlertModal
      alarm={activeTriggeredAlarm}
      onClose={() => setActiveTriggeredAlarm(null)}
    />
  );
}
