import { useState } from 'react';

export interface AppSettings {
  darkMode: boolean;
  biometricLock: boolean;
  reminderEnabled: boolean;
  reminderDay: number; // 1 to 28
}

const defaultSettings: AppSettings = {
  darkMode: false,
  biometricLock: false,
  reminderEnabled: false,
  reminderDay: 1,
};

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const stored = localStorage.getItem('app_settings');
      if (stored) {
        return { ...defaultSettings, ...JSON.parse(stored) };
      }
    } catch (e) {}
    return defaultSettings;
  });

  const updateSettings = (updates: Partial<AppSettings>) => {
    setSettings(prev => {
      const newSettings = { ...prev, ...updates };
      localStorage.setItem('app_settings', JSON.stringify(newSettings));
      return newSettings;
    });
  };

  return { settings, updateSettings };
}
