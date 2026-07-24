import { useState, useEffect } from 'react';
import { Home } from './pages/Home';
import { useSettings } from './hooks/useSettings';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';
import { Lock } from 'lucide-react';

function App() {
  const { settings } = useSettings();
  const [isUnlocked, setIsUnlocked] = useState(!settings.biometricLock);

  // Initialize Dark Mode
  useEffect(() => {
    if (settings.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings.darkMode]);

  // Handle Biometric Lock
  useEffect(() => {
    if (settings.biometricLock && !isUnlocked) {
      const authenticate = async () => {
        try {
          const result = await NativeBiometric.isAvailable();
          if (!result.isAvailable) {
            // If biometrics not available on device, just unlock
            setIsUnlocked(true);
            return;
          }
          await NativeBiometric.verifyIdentity({
            reason: "For easy log in",
            title: "Log in",
            subtitle: "Use your biometric to log in",
            description: "Please authenticate to access Bijli Recharge",
          });
          setIsUnlocked(true);
        } catch (error) {
          console.error("Biometric failed", error);
          // Don't set unlocked, forcing user to try again or use PIN
        }
      };
      authenticate();
    }
  }, [settings.biometricLock, isUnlocked]);

  const retryUnlock = async () => {
    try {
      await NativeBiometric.verifyIdentity({
        reason: "For easy log in",
        title: "Log in",
        subtitle: "Use your biometric to log in",
        description: "Please authenticate to access Bijli Recharge",
      });
      setIsUnlocked(true);
    } catch (error) {
      console.error("Retry biometric failed", error);
    }
  };

  if (settings.biometricLock && !isUnlocked) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center pt-safe">
        <div className="w-20 h-20 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center mb-6">
          <Lock className="w-10 h-10 text-primary-600 dark:text-primary-400" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">App Locked</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8">
          Please authenticate to access your saved meters.
        </p>
        <button
          onClick={retryUnlock}
          className="px-6 py-3 bg-primary-600 text-white rounded-xl font-medium active:scale-95 transition-all"
        >
          Unlock App
        </button>
      </div>
    );
  }

  return (
    <div className="antialiased min-h-screen max-w-[100vw] overflow-x-hidden">
      <Home />
    </div>
  );
}

export default App;
