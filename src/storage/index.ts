import type { Consumer, AppSettings } from '../types';

const CONSUMERS_KEY = 'sbpdcl_consumers';
const SETTINGS_KEY = 'sbpdcl_settings';

export const storage = {
  getConsumers: (): Consumer[] => {
    try {
      const data = localStorage.getItem(CONSUMERS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Failed to parse consumers from local storage', e);
      return [];
    }
  },
  
  saveConsumers: (consumers: Consumer[]): void => {
    localStorage.setItem(CONSUMERS_KEY, JSON.stringify(consumers));
  },
  
  addConsumer: (consumer: Omit<Consumer, 'id'>): Consumer => {
    const consumers = storage.getConsumers();
    const newConsumer = { ...consumer, id: crypto.randomUUID() };
    storage.saveConsumers([...consumers, newConsumer]);
    return newConsumer;
  },
  
  updateConsumer: (id: string, updates: Partial<Consumer>): void => {
    const consumers = storage.getConsumers();
    const index = consumers.findIndex(c => c.id === id);
    if (index !== -1) {
      consumers[index] = { ...consumers[index], ...updates };
      storage.saveConsumers(consumers);
    }
  },
  
  deleteConsumer: (id: string): void => {
    const consumers = storage.getConsumers();
    storage.saveConsumers(consumers.filter(c => c.id !== id));
  },

  getSettings: (): AppSettings => {
    const defaultSettings: AppSettings = { darkMode: false };
    try {
      const data = localStorage.getItem(SETTINGS_KEY);
      return data ? { ...defaultSettings, ...JSON.parse(data) } : defaultSettings;
    } catch (e) {
      console.error('Failed to parse settings', e);
      return defaultSettings;
    }
  },

  saveSettings: (settings: Partial<AppSettings>): void => {
    const current = storage.getSettings();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...current, ...settings }));
  }
};
