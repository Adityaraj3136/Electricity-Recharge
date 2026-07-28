import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Detect if already installed (running as PWA / standalone)
const isInstalledPWA = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.matchMedia('(display-mode: minimal-ui)').matches ||
  (window.navigator as any).standalone === true;

// Detect if running inside Capacitor native app
const isNativeApp = () => {
  try { return !!(window as any).Capacitor?.isNativePlatform?.(); } catch { return false; }
};

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Don't show if already installed or in native app
    if (isInstalledPWA() || isNativeApp()) return;
    // Don't show if user dismissed in last 7 days
    const dismissed = localStorage.getItem('pwa_prompt_dismissed');
    if (dismissed && Date.now() - parseInt(dismissed) < 7 * 24 * 60 * 60 * 1000) return;

    // iOS doesn't fire beforeinstallprompt — show manual instructions instead
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;
    if (ios) {
      setIsIOS(true);
      setTimeout(() => setShow(true), 3000); // delay so app loads first
      return;
    }

    // Android / Chrome: listen for the install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setTimeout(() => setShow(true), 3000);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setShow(false);
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem('pwa_prompt_dismissed', Date.now().toString());
  };

  if (!show) return null;

  return (
    <div
      className="fixed bottom-[72px] left-4 right-4 z-[9999] animate-in slide-in-from-bottom-4 duration-300"
      role="alert"
      aria-label="Install app prompt"
    >
      <div className="bg-[#0f172a] border border-blue-500/40 rounded-2xl p-4 shadow-2xl shadow-blue-900/40 flex items-start gap-3">
        {/* Icon */}
        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
          <Download size={18} className="text-white" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm leading-tight">
            {isIOS ? 'Add Bijli to Home Screen' : 'Install Bijli Recharge'}
          </p>
          <p className="text-slate-400 text-xs mt-0.5 leading-snug">
            {isIOS
              ? "Tap the Share button ↑ then \"Add to Home Screen\""
              : 'Get the full app experience — works offline too'}
          </p>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {!isIOS && (
            <button
              id="pwa-install-btn"
              onClick={handleInstall}
              className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg active:scale-95 transition-transform"
            >
              Install
            </button>
          )}
          <button
            id="pwa-dismiss-btn"
            onClick={handleDismiss}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-700/60 text-slate-400 active:scale-95 transition-transform"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
