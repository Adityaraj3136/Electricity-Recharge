import { useRef, useEffect, useState } from 'react';
import { Modal } from './Modal';
import { useConsumers } from '../hooks/useConsumers';
import { useSettings } from '../hooks/useSettings';
import { storage } from '../storage';
import {
  Download, Upload, Moon, Sun, Info, Shield,
  ChevronRight, Lock, Bell, BellOff, AlertTriangle, CheckCircle2, Type
} from 'lucide-react';
import { useLang } from '../hooks/useLang';
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



// ─── Component ────────────────────────────────────────────────────────────────

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type NotifStatus = 'idle' | 'requesting' | 'granted' | 'denied';

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { consumers, refresh } = useConsumers();
  const { settings, updateSettings } = useSettings();
  const { t } = useLang();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [notifStatus, setNotifStatus] = useState<NotifStatus>('idle');
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [showContactModal, setShowContactModal] = useState(false);

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

  // ── Low Balance Alert Toggle ──────────────────────────────────────────────
  const toggleReminder = async () => {
    setScheduleError(null);

    if (settings.reminderEnabled) {
      updateSettings({ reminderEnabled: false });
      setNotifStatus('idle');
      return;
    }

    // Turn ON — request notification permission first (needed to send alerts)
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
      // Ensure notification channel exists
      try { await ensureNotificationChannel(); } catch (_) {}
    }

    updateSettings({ reminderEnabled: true });
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

  // ── Contact Developer ──────────────────────────────────────────────────────
  const openContact = () => {
    const url = 'https://adityaraj3136.github.io/contact/';
    if (isNative()) {
      const win = window as any;
      if (win.cordova?.InAppBrowser) {
        const browser = win.cordova.InAppBrowser.open(url, '_blank', 'location=no,zoom=no');
        
        browser.addEventListener('loadstart', (event: any) => {
          const navUrl = event.url || '';
          if (navUrl.startsWith('app://home') || navUrl.startsWith('app%3A//home')) {
            browser.close();
          }
        });

        browser.addEventListener('loadstop', () => {
          browser.executeScript({ code: `
            (function() {
              if (document.getElementById('br-home-fab')) return;
              const fab = document.createElement('div');
              fab.id = 'br-home-fab';
              fab.innerHTML = '\\u2190 Home';
              fab.style.cssText = [
                'position:fixed',
                'bottom:24px',
                'right:20px',
                'background:#2563eb',
                'color:white',
                'padding:14px 22px',
                'border-radius:32px',
                'font-family:sans-serif',
                'font-weight:bold',
                'font-size:15px',
                'box-shadow:0 6px 20px rgba(37,99,235,0.5)',
                'z-index:2147483647',
                'cursor:pointer',
                'border:none',
                'outline:none',
                '-webkit-tap-highlight-color:transparent',
                'user-select:none',
              ].join(';');
              fab.onclick = function() {
                window.location.href = 'app://home';
              };
              document.body.appendChild(fab);
            })();
          `});
        });
      }
    } else {
      setShowContactModal(true);
    }
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
    <>
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

            <div className="flex items-center justify-between p-3 rounded-lg">
              <div className="flex items-center gap-3 text-gray-700 dark:text-gray-200">
                <Type size={20} />
                <span className="font-medium">{t.settings?.fontSize || 'Font Size'}</span>
              </div>
              <div className="flex bg-gray-200 dark:bg-[#0e1726] rounded-lg p-1 gap-1">
                {(['small', 'medium', 'large'] as const).map(size => (
                  <button
                    key={size}
                    onClick={() => updateSettings({ fontSize: size })}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${settings.fontSize === size ? 'bg-white dark:bg-[#253350] text-primary-600 dark:text-primary-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                  >
                    {size === 'small' ? t.settings?.fontSmall || 'Small' : size === 'medium' ? t.settings?.fontMedium || 'Medium' : t.settings?.fontLarge || 'Large'}
                  </button>
                ))}
              </div>
            </div>


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
            Alerts & Reminders
          </h3>
          <div className="bg-gray-50 dark:bg-[#1c2a42] rounded-xl p-2 space-y-2">
            <RowBtn onClick={toggleReminder}>
              <div className="flex items-center gap-3 text-gray-700 dark:text-gray-200">
                {settings.reminderEnabled ? <Bell size={20} className="text-primary-500" /> : <BellOff size={20} />}
                <div>
                  <span className="font-medium block">Low Balance Alert</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {settings.reminderEnabled
                      ? 'Alerts when balance is below ₹100'
                      : 'Notify me when balance is low'}
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

            {/* Info box */}
            {settings.reminderEnabled && (
              <div className="mx-3 pb-3">
                <div className="p-3 bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800 rounded-lg">
                  <p className="text-xs text-primary-700 dark:text-primary-300 leading-relaxed">
                    ⚡ Whenever you <strong>check your balance</strong>, the app will automatically send an alert if any meter's balance drops below <strong>₹100</strong>.
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
          <div className="bg-gray-50 dark:bg-[#1c2a42] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-gray-700 dark:text-gray-200">
                <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                  <Download size={18} className="text-primary-600" />
                </div>
                <div>
                  <span className="font-medium block text-sm">Current Version</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">Bijli Recharge v1.2</span>
                </div>
              </div>
              <span className="text-xs font-semibold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2.5 py-1 rounded-full border border-green-200 dark:border-green-800">
                Up to date
              </span>
            </div>
            <button
              onClick={openContact}
              className="w-full mt-2 py-2.5 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-lg text-sm font-semibold hover:bg-primary-200 dark:hover:bg-primary-800/40 transition-colors"
            >
              Contact Developer for Updates
            </button>
          </div>
        </section>

        {/* Version */}
        <p className="text-center text-xs text-gray-400 dark:text-gray-600 pb-2">
          Bijli Recharge v1.2 — Not an official SBPDCL app
        </p>

      </div>
    </Modal>

    {showContactModal && !isNative() && (
      <Modal 
        isOpen={showContactModal} 
        onClose={() => setShowContactModal(false)} 
        title="Contact Developer"
        maxWidth="sm:max-w-4xl"
      >
        <div className="w-full h-[60vh] -mx-6 -mb-6 mt-[-10px]">
          <iframe 
            src="https://adityaraj3136.github.io/contact/" 
            className="w-full h-full border-0 bg-white dark:bg-slate-900"
            title="Contact Developer"
          />
        </div>
      </Modal>
    )}
    </>
  );
}
