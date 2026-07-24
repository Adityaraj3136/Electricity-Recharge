import { useRef, useState } from 'react';
import { Modal } from './Modal';
import { useConsumers } from '../hooks/useConsumers';
import { storage } from '../storage';
import { Download, Upload, Moon, Sun, Info, Shield, ChevronRight } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { consumers, refresh } = useConsumers();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDark, setIsDark] = useState(storage.getSettings().darkMode);

  const toggleDarkMode = () => {
    const newMode = !isDark;
    setIsDark(newMode);
    storage.saveSettings({ darkMode: newMode });
    if (newMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
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
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Appearance</h3>
          <div className="bg-gray-50 rounded-xl p-2">
            <button 
              onClick={toggleDarkMode}
              className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-3 text-gray-700">
                {isDark ? <Moon size={20} /> : <Sun size={20} />}
                <span className="font-medium">Dark Mode</span>
              </div>
              <div className={`w-12 h-6 rounded-full transition-colors flex items-center p-1 ${isDark ? 'bg-primary-600' : 'bg-gray-300'}`}>
                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${isDark ? 'translate-x-6' : 'translate-x-0'}`} />
              </div>
            </button>
          </div>
        </section>

        {/* Data & Backup */}
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Data & Backup</h3>
          <div className="bg-gray-50 rounded-xl p-2 space-y-1">
            <button 
              onClick={handleExport}
              className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-3 text-gray-700">
                <Download size={20} />
                <span className="font-medium">Export JSON Backup</span>
              </div>
              <ChevronRight size={18} className="text-gray-400" />
            </button>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-3 text-gray-700">
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
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">About App</h3>
          <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600 space-y-4">
            <div className="flex gap-3">
              <Shield className="text-green-600 shrink-0" size={20} />
              <div>
                <p className="font-medium text-gray-900">100% Secure & Private</p>
                <p className="mt-1">This app never asks for or stores payment details, UPI PIN, Card numbers, or Passwords. It only stores your consumer number and name locally on this device.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Info className="text-blue-600 shrink-0" size={20} />
              <div>
                <p className="font-medium text-gray-900">How Automation Works</p>
                <p className="mt-1">Since web browsers don't allow one tab to control another (for security), you must paste the generated automation script into the target website's console, or use a tool like Tampermonkey to automate it seamlessly.</p>
              </div>
            </div>
          </div>
        </section>

      </div>
    </Modal>
  );
}
