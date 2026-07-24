import { useRef, useEffect } from 'react';
import { Modal } from './Modal';
import { useConsumers } from '../hooks/useConsumers';
import { useSettings } from '../hooks/useSettings';
import { storage } from '../storage';
import { Download, Upload, Moon, Sun, Info, Shield, ChevronRight, Lock, Bell, BellOff } from 'lucide-react';
import { LocalNotifications } from '@capacitor/local-notifications';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { consumers, refresh } = useConsumers();
  const { settings, updateSettings } = useSettings();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Ask for notification permissions on open if reminders are enabled
  useEffect(() => {
    if (isOpen && settings.reminderEnabled) {
      LocalNotifications.requestPermissions();
    }
  }, [isOpen, settings.reminderEnabled]);

  const toggleDarkMode = () => {
    updateSettings({ darkMode: !settings.darkMode });
  };

  const toggleBiometric = async () => {
    const newValue = !settings.biometricLock;
    if (newValue) {
      try {
        const result = await NativeBiometric.isAvailable();
        if (!result.isAvailable) {
          alert('Biometric authentication is not available on this device.');
          return;
        }
        await NativeBiometric.verifyIdentity({
          reason: "Verify to enable app lock",
          title: "Enable App Lock",
        });
        updateSettings({ biometricLock: true });
      } catch (error) {
        alert('Failed to enable biometric lock.');
      }
    } else {
      updateSettings({ biometricLock: false });
    }
  };

  const toggleReminder = async () => {
    const newValue = !settings.reminderEnabled;
    updateSettings({ reminderEnabled: newValue });
    
    if (newValue) {
      await LocalNotifications.requestPermissions();
      scheduleReminder(settings.reminderDay);
    } else {
      await LocalNotifications.cancel({ notifications: [{ id: 1 }] });
    }
  };

  const changeReminderDay = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const day = parseInt(e.target.value, 10);
    updateSettings({ reminderDay: day });
    if (settings.reminderEnabled) {
      scheduleReminder(day);
    }
  };

  const scheduleReminder = async (day: number) => {
    await LocalNotifications.cancel({ notifications: [{ id: 1 }] });
    await LocalNotifications.schedule({
      notifications: [
        {
          title: "Electricity Recharge Reminder",
          body: "Don't forget to check your balance or recharge your saved meters!",
          id: 1,
          schedule: { 
            on: { day: day, hour: 10, minute: 0 },
            allowWhileIdle: true 
          },
        }
      ]
    });
  };

  const handleExport = () => {
    const dataStr = JSON.stringify(consumers, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const exportFileDefaultName = 'sbpdcl_family_recharge_backup.json';
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
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
          alert('Backup restored successfully!');
        } else {
          alert('Invalid backup format');
        }
      } catch (e) {
        alert('Error parsing backup file');
      }
    };
    reader.readAsText(file);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Settings">
      <div className="space-y-6 pt-2">
        
        {/* Appearance */}
        <section>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Appearance & Security</h3>
          <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-2 space-y-1">
            <button 
              onClick={toggleDarkMode}
              className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            >
              <div className="flex items-center gap-3 text-gray-700 dark:text-gray-200">
                {settings.darkMode ? <Moon size={20} /> : <Sun size={20} />}
                <span className="font-medium">Dark Mode</span>
              </div>
              <div className={`w-12 h-6 rounded-full transition-colors flex items-center p-1 ${settings.darkMode ? 'bg-primary-600' : 'bg-gray-300 dark:bg-slate-600'}`}>
                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings.darkMode ? 'translate-x-6' : 'translate-x-0'}`} />
              </div>
            </button>

            <button 
              onClick={toggleBiometric}
              className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            >
              <div className="flex items-center gap-3 text-gray-700 dark:text-gray-200">
                <Lock size={20} />
                <span className="font-medium">Biometric App Lock</span>
              </div>
              <div className={`w-12 h-6 rounded-full transition-colors flex items-center p-1 ${settings.biometricLock ? 'bg-primary-600' : 'bg-gray-300 dark:bg-slate-600'}`}>
                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings.biometricLock ? 'translate-x-6' : 'translate-x-0'}`} />
              </div>
            </button>
          </div>
        </section>

        {/* Reminders */}
        <section>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Reminders</h3>
          <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-2 space-y-2">
            <button 
              onClick={toggleReminder}
              className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            >
              <div className="flex items-center gap-3 text-gray-700 dark:text-gray-200">
                {settings.reminderEnabled ? <Bell size={20} /> : <BellOff size={20} />}
                <span className="font-medium">Monthly Reminder</span>
              </div>
              <div className={`w-12 h-6 rounded-full transition-colors flex items-center p-1 ${settings.reminderEnabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-slate-600'}`}>
                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings.reminderEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
              </div>
            </button>

            {settings.reminderEnabled && (
              <div className="px-3 pb-3 flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Remind me on day:</span>
                <select 
                  value={settings.reminderDay}
                  onChange={changeReminderDay}
                  className="bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-gray-200 rounded-lg p-2 text-sm outline-none"
                >
                  {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
                    <option key={day} value={day}>{day}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </section>

        {/* Data & Backup */}
        <section>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Data & Backup</h3>
          <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-2 space-y-1">
            <button 
              onClick={handleExport}
              className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            >
              <div className="flex items-center gap-3 text-gray-700 dark:text-gray-200">
                <Download size={20} />
                <span className="font-medium">Export JSON Backup</span>
              </div>
              <ChevronRight size={18} className="text-gray-400" />
            </button>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            >
              <div className="flex items-center gap-3 text-gray-700 dark:text-gray-200">
                <Upload size={20} />
                <span className="font-medium">Restore JSON Backup</span>
              </div>
              <ChevronRight size={18} className="text-gray-400" />
            </button>
            <input 
              type="file" 
              accept=".json" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleImport}
            />
          </div>
        </section>

        {/* About & Security */}
        <section>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">About App</h3>
          <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-4 text-sm text-gray-600 dark:text-gray-400 space-y-4">
            <div className="flex gap-3">
              <Shield className="text-green-600 shrink-0" size={20} />
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-200">100% Secure & Private</p>
                <p className="mt-1">This app never asks for or stores payment details, UPI PIN, Card numbers, or Passwords. It only stores your consumer number and name locally on this device.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Info className="text-blue-600 shrink-0" size={20} />
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-200">How Automation Works</p>
                <p className="mt-1">The app loads the official SBPDCL website and autofills your saved details to save you time. Payments are completely handled by the official gateway.</p>
              </div>
            </div>
          </div>
        </section>

      </div>
    </Modal>
  );
}
