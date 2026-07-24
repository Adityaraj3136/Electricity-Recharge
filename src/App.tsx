import { useState, useEffect } from 'react';
import { Home } from './pages/Home';
import { SettingsProvider, useSettings } from './hooks/useSettings';
import { Lock } from 'lucide-react';

// Detect if running inside the native Capacitor app
const isNative = () => {
  try {
    return !!(window as any).Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
};

function AppInner() {
  const { settings } = useSettings();
  const [isUnlocked, setIsUnlocked] = useState(true); // default open; locked below if enabled

  // Trigger biometric auth on mount — only on native & when enabled
  useEffect(() => {
    if (!settings.biometricLock || !isNative()) return;

    setIsUnlocked(false);

    import('@capgo/capacitor-native-biometric').then(({ NativeBiometric }) => {
      NativeBiometric.isAvailable().then(({ isAvailable }) => {
        if (!isAvailable) { setIsUnlocked(true); return; }
        NativeBiometric.verifyIdentity({
          reason: 'For easy log in',
          title: 'Log in',
          subtitle: 'Use your biometric to log in',
          description: 'Please authenticate to access Bijli Recharge',
        }).then(() => setIsUnlocked(true))
          .catch(() => {}); // Stay locked
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  const retryUnlock = () => {
    import('@capgo/capacitor-native-biometric').then(({ NativeBiometric }) => {
      NativeBiometric.verifyIdentity({
        reason: 'For easy log in',
        title: 'Log in',
      }).then(() => setIsUnlocked(true)).catch(() => {});
    });
  };

  if (settings.biometricLock && isNative() && !isUnlocked) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center mb-6">
          <Lock className="w-10 h-10 text-primary-600 dark:text-primary-400" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">App Locked</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8">
          Authenticate to access your saved meters.
        </p>
        <button
          onClick={retryUnlock}
          className="px-6 py-3 bg-primary-600 text-white rounded-xl font-semibold active:scale-95 transition-all shadow-lg shadow-primary-500/30"
        >
          Unlock App
        </button>
      </div>
    );
  }

  return (
    <div className="antialiased min-h-screen max-w-[100vw] overflow-x-hidden bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      <Home />
    </div>
  );
}

function App() {
  return (
    <SettingsProvider>
      <AppInner />
    </SettingsProvider>
  );
}

export default App;
