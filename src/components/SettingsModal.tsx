import { useRef, useEffect, useState } from 'react';
import { Modal } from './Modal';
import { useConsumers } from '../hooks/useConsumers';
import { useSettings } from '../hooks/useSettings';
import { storage } from '../storage';
import {
  Download, Upload, Moon, Sun, Info, Shield,
  ChevronRight, Lock, Bell, BellOff, AlertTriangle, CheckCircle2
} from 'lucide-react';
import { LocalNotifications } from '@capacitor/local-notifications';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const isNative = (): boolean => {
  try {
    return !!(window as any).Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
};

/**
 * Sets up the notification channel required by Android 8+ (API 26+).
 * Safe to call multiple times — Android ignores duplicate creates.
 */
async function ensureNotificationChannel() {
  try {
    await LocalNotifications.createChannel({
      id: 'bijli_reminder',
      name: 'Low Balance Reminder',
      description: 'Low balance reminder notifications',
      importance: 4,          // HIGH — shows heads-up, makes sound
      visibility: 1,          // PUBLIC
      sound: 'default',
      vibration: true,
      lights: true,
      lightColor: '#2563EB',
    });
  } catch (e) {
    // Channel creation not supported on web / old Android — ignore
    console.warn('Could not create notification channel:', e);
  }
}

/**
 * Requests POST_NOTIFICATIONS permission (Android 13+ / API 33+).
 * On older Android the plugin resolves immediately with 'granted'.
 * Returns true if the app can post notifications.
 */
async function requestNotificationPermission(): Promise<boolean> {
  try {
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') return true;

    const result = await LocalNotifications.requestPermissions();
    return result.display === 'granted';
  } catch (e) {
    console.warn('Notification permission error:', e);
    return false;
  }
}

/**
 * Schedule a monthly reminder on a given day of the month at 10:00 AM.
 * Cancels any existing reminder first.
 */
async function scheduleMonthlyReminder(day: number) {
  // Cancel previous
  try { await LocalNotifications.cancel({ notifications: [{ id: 101 }] }); } catch (_) {}

  const now = new Date();
  // Next occurrence of 'day' at 10:00 AM
  const next = new Date(now.getFullYear(), now.getMonth(), day, 10, 0, 0, 0);
  // If that date is already past, move to next month
  if (next <= now) {
    next.setMonth(next.getMonth() + 1);
  }

  await LocalNotifications.schedule({
    notifications: [
      {
        id: 101,
        title: '⚡ Low Balance Reminder',
        body: "Your electricity balance might be low. Don't forget to check and recharge today!",
        channelId: 'bijli_reminder',   // Android 8+ channel
        schedule: {
          at: next,                    // Exact date-time — works Android 10-16
          repeats: true,               // Repeat monthly
          every: 'month',
          allowWhileIdle: true,        // Deliver even in Doze mode
        },
        sound: 'default',
        smallIcon: 'ic_stat_icon_config_sample', // use default Capacitor icon
        iconColor: '#2563EB',
        actionTypeId: '',
        extra: null,
      },
    ],
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type NotifStatus = 'idle' | 'requesting' | 'granted' | 'denied';

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { consumers, refresh } = useConsumers();
  const { settings, updateSettings } = useSettings();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [notifStatus, setNotifStatus] = useState<NotifStatus>('idle');
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  // Check current permission state when the modal opens
  useEffect(() => {
    if (!isOpen || !isNative()) return;
    LocalNotifications.checkPermissions()
      .then(r => setNotifStatus(r.display === 'granted' ? 'granted' : 'idle'))
      .catch(() => {});
  }, [isOpen]);

  // ── Dark Mode ──────────────────────────────────────────────────────────────
  const toggleDarkMode = () => updateSettings({ darkMode: !settings.darkMode });

  // ── Biometric ─────────────────────────────────────────────────────────────
  const toggleBiometric = async () => {
    if (!settings.biometricLock) {
      try {
        const { isAvailable } = await NativeBiometric.isAvailable();
        if (!isAvailable) {
          alert('Biometric authentication is not available on this device.');
          return;
        }
        await NativeBiometric.verifyIdentity({
          reason: 'Verify to enable App Lock',
          title: 'Enable App Lock',
          useFallback: true,
        });
        updateSettings({ biometricLock: true });
      } catch {
        alert('Failed to enable biometric lock.');
      }
    } else {
      updateSettings({ biometricLock: false });
    }
  };

  // ── Monthly Reminder ───────────────────────────────────────────────────────
  const toggleReminder = async () => {
    setScheduleError(null);

    if (settings.reminderEnabled) {
      // Turn OFF
      try { await LocalNotifications.cancel({ notifications: [{ id: 101 }] }); } catch (_) {}
      updateSettings({ reminderEnabled: false });
      setNotifStatus('idle');
      return;
    }

    // Turn ON — request permission first
    if (isNative()) {
      setNotifStatus('requesting');
      const granted = await requestNotificationPermission();

      if (!granted) {
        setNotifStatus('denied');
        setScheduleError(
          'Notification permission denied. Please enable notifications for Bijli Recharge in your device Settings → Apps → Bijli Recharge → Notifications.'
        );
        return;
      }
      setNotifStatus('granted');
    }

    try {
      await ensureNotificationChannel();
      await scheduleMonthlyReminder(settings.reminderDay);
      updateSettings({ reminderEnabled: true });
    } catch (err: any) {
      console.error('Schedule failed:', err);
      setScheduleError(
        'Could not schedule the reminder. Please check that Bijli Recharge has permission to schedule exact alarms in your device Settings → Apps → Special App Access → Alarms & Reminders.'
      );
    }
  };

  const changeReminderDay = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const day = parseInt(e.target.value, 10);
    updateSettings({ reminderDay: day });
    setScheduleError(null);
    if (settings.reminderEnabled) {
      try {
        await scheduleMonthlyReminder(day);
      } catch (err: any) {
        setScheduleError('Failed to update reminder. Try toggling it off and on again.');
      }
    }
  };

  // ── Data Backup ────────────────────────────────────────────────────────────
  const handleExport = () => {
    const dataStr = JSON.stringify(consumers, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const a = document.createElement('a');
    a.setAttribute('href', dataUri);
    a.setAttribute('download', 'bijli_recharge_backup.json');
    a.click();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (Array.isArray(json)) {
          storage.saveConsumers(json);
          refresh();
          alert('✅ Backup restored successfully!');
        } else {
          alert('❌ Invalid backup format.');
        }
      } catch {
        alert('❌ Error reading backup file.');
      }
    };
    reader.readAsText(file);
  };

  // ─── Toggle Component ──────────────────────────────────────────────────────
  const Toggle = ({ active }: { active: boolean }) => (
    <div className={`w-12 h-6 rounded-full transition-colors duration-200 flex items-center p-1 ${active ? 'bg-primary-600' : 'bg-gray-300 dark:bg-[#253350]'}`}>
      <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${active ? 'translate-x-6' : 'translate-x-0'}`} />
    </div>
  );

  const RowBtn = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-[#253350] transition-colors text-left"
    >
      {children}
    </button>
  );

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Settings">
      <div className="space-y-6 pt-2">

        {/* ── Appearance & Security ─────────────────────── */}
        <section>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            Appearance &amp; Security
          </h3>
          <div className="bg-gray-50 dark:bg-[#1c2a42] rounded-xl p-2 space-y-1">
            <RowBtn onClick={toggleDarkMode}>
              <div className="flex items-center gap-3 text-gray-700 dark:text-gray-200">
                {settings.darkMode ? <Moon size={20} /> : <Sun size={20} />}
                <div>
                  <span className="font-medium block">Dark Mode</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {settings.darkMode ? 'Currently on' : 'Currently off'}
                  </span>
                </div>
              </div>
              <Toggle active={settings.darkMode} />
            </RowBtn>

            {isNative() && (
              <RowBtn onClick={toggleBiometric}>
                <div className="flex items-center gap-3 text-gray-700 dark:text-gray-200">
                  <Lock size={20} />
                  <div>
                    <span className="font-medium block">Biometric App Lock</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">Fingerprint / Face unlock</span>
                  </div>
                </div>
                <Toggle active={settings.biometricLock} />
              </RowBtn>
            )}
          </div>
        </section>

        {/* ── Reminders ─────────────────────────────────── */}
        <section>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            Reminders
          </h3>
          <div className="bg-gray-50 dark:bg-[#1c2a42] rounded-xl p-2 space-y-2">
            <RowBtn onClick={toggleReminder}>
              <div className="flex items-center gap-3 text-gray-700 dark:text-gray-200">
                {settings.reminderEnabled ? <Bell size={20} className="text-primary-500" /> : <BellOff size={20} />}
                <div>
                  <span className="font-medium block">Low Balance Reminder</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {settings.reminderEnabled
                      ? `Scheduled on day ${settings.reminderDay} of each month`
                      : 'Remind me when balance is low'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {notifStatus === 'requesting' && (
                  <span className="text-xs text-yellow-500 font-medium">Requesting…</span>
                )}
                {notifStatus === 'denied' && (
                  <AlertTriangle size={16} className="text-red-500" />
                )}
                {notifStatus === 'granted' && settings.reminderEnabled && (
                  <CheckCircle2 size={16} className="text-green-500" />
                )}
                <Toggle active={settings.reminderEnabled} />
              </div>
            </RowBtn>

            {/* Permission denied warning */}
            {scheduleError && (
              <div className="mx-3 mb-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-xs text-red-700 dark:text-red-300 leading-relaxed">{scheduleError}</p>
              </div>
            )}

            {/* Day picker */}
            {settings.reminderEnabled && (
              <div className="px-3 pb-3">
                <div className="flex items-center justify-between py-2">
                  <div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200 block">Remind me on day:</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">of every month at 10:00 AM</span>
                  </div>
                  <select
                    value={settings.reminderDay}
                    onChange={changeReminderDay}
                    className="bg-white dark:bg-[#253350] border border-gray-200 dark:border-[#253350] text-gray-700 dark:text-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer"
                  >
                    {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
                      <option key={day} value={day}>{day}{
                        day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'
                      }</option>
                    ))}
                  </select>
                </div>

                {/* Info box */}
                <div className="mt-2 p-3 bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800 rounded-lg">
                  <p className="text-xs text-primary-700 dark:text-primary-300 leading-relaxed">
                    📅 You will receive a notification on the <strong>{settings.reminderDay}{
                      settings.reminderDay === 1 ? 'st' :
                      settings.reminderDay === 2 ? 'nd' :
                      settings.reminderDay === 3 ? 'rd' : 'th'
                    }</strong> of every month at <strong>10:00 AM</strong> reminding you to check your balance or recharge.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Data & Backup ─────────────────────────────── */}
        <section>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            Data &amp; Backup
          </h3>
          <div className="bg-gray-50 dark:bg-[#1c2a42] rounded-xl p-2 space-y-1">
            <RowBtn onClick={handleExport}>
              <div className="flex items-center gap-3 text-gray-700 dark:text-gray-200">
                <Download size={20} />
                <span className="font-medium">Export JSON Backup</span>
              </div>
              <ChevronRight size={18} className="text-gray-400" />
            </RowBtn>
            <RowBtn onClick={() => fileInputRef.current?.click()}>
              <div className="flex items-center gap-3 text-gray-700 dark:text-gray-200">
                <Upload size={20} />
                <span className="font-medium">Restore JSON Backup</span>
              </div>
              <ChevronRight size={18} className="text-gray-400" />
            </RowBtn>
            <input
              type="file"
              accept=".json"
              className="hidden"
              ref={fileInputRef}
              onChange={handleImport}
            />
          </div>
        </section>

        {/* ── About ─────────────────────────────────────── */}
        <section>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            About App
          </h3>
          <div className="bg-gray-50 dark:bg-[#1c2a42] rounded-xl p-4 text-sm text-gray-600 dark:text-gray-400 space-y-4">
            <div className="flex gap-3">
              <Shield className="text-green-600 shrink-0" size={20} />
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-200">100% Secure &amp; Private</p>
                <p className="mt-1">This app never stores payment details, UPI PIN, card numbers, or passwords. Only your consumer number and name are saved locally on your device.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Info className="text-blue-600 shrink-0" size={20} />
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-200">How Automation Works</p>
                <p className="mt-1">The app opens the official SBPDCL website and autofills your saved details to save time. Payments are handled entirely by the official gateway.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Updates ─────────────────────────────────────── */}
        <section>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            App Updates
          </h3>
          <div className="bg-gray-50 dark:bg-[#1c2a42] rounded-xl p-2">
            <RowBtn onClick={() => window.open('https://github.com/Adityaraj3136/Electricity-Recharge/releases/latest', '_blank')}>
              <div className="flex items-center gap-3 text-gray-700 dark:text-gray-200">
                <Download size={20} className="text-primary-500" />
                <div>
                  <span className="font-medium block">Check for Updates</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">Download the latest APK version</span>
                </div>
              </div>
              <ChevronRight size={18} className="text-gray-400" />
            </RowBtn>
          </div>
        </section>

        {/* Version */}
        <p className="text-center text-xs text-gray-400 dark:text-gray-600 pb-2">
          Bijli Recharge v1.1 — Not an official SBPDCL app
        </p>

      </div>
    </Modal>
  );
}
