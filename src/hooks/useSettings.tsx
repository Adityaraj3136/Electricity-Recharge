import React, { createContext, useContext, useState, useEffect } from 'react';

export interface AppSettings {
  darkMode: boolean;
  biometricLock: boolean;
  reminderEnabled: boolean;
  reminderDay: number;
  fontSize: 'small' | 'medium' | 'large';
}

const defaultSettings: AppSettings = {
  darkMode: false,
  biometricLock: false,
  reminderEnabled: false,
  reminderDay: 1,
  fontSize: 'medium',
};

// Single canonical key — migrates from old 'app_settings' key if needed
const SETTINGS_KEY = 'sbpdcl_settings';

function loadSettings(): AppSettings {
  try {
    // Migrate from the old key name used in a prior version
    const old = localStorage.getItem('app_settings');
    if (old) {
      const parsed = JSON.parse(old);
      localStorage.setItem(SETTINGS_KEY, old);
      localStorage.removeItem('app_settings');
      return { ...defaultSettings, ...parsed };
    }

    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      return { ...defaultSettings, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.warn('Failed to load settings:', e);
  }
  return defaultSettings;
}

function applyDarkMode(enabled: boolean) {
  if (enabled) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

function applyFontSize(size: 'small' | 'medium' | 'large') {
  const sizeMap = {
    small: '14px',
    medium: '16px',
    large: '18px'
  };
  document.documentElement.style.fontSize = sizeMap[size] || '16px';
}

// Apply immediately on module load (before React mounts) to avoid flash
const initialSettings = loadSettings();
applyDarkMode(initialSettings.darkMode);
applyFontSize(initialSettings.fontSize);

interface SettingsContextValue {
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  // Keep <html> class in sync whenever darkMode changes
  useEffect(() => {
    applyDarkMode(settings.darkMode);
  }, [settings.darkMode]);

  // Keep <html> font-size in sync whenever fontSize changes
  useEffect(() => {
    applyFontSize(settings.fontSize);
  }, [settings.fontSize]);

  const updateSettings = (updates: Partial<AppSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...updates };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      return next;
    });
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
