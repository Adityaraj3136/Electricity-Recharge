import { useState, useRef, useEffect, useCallback } from 'react';
import { useConsumers } from '../hooks/useConsumers';
import { useLang } from '../hooks/useLang';
import { useSettings } from '../hooks/useSettings';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { Select } from '../components/Select';
import { Modal } from '../components/Modal';
import type { Consumer, BalanceDetails } from '../types';
import heroImage from '../assets/hero.jpg';
import {
  Plus, Settings, Zap, MoreVertical, Edit2, Trash2, Search,
  Bolt, Globe, Moon, Sun, Home as HomeIcon, BarChart2, List,
  HelpCircle, Shield, ArrowRight, BookOpen, CreditCard, Hexagon, Activity,
  RefreshCw
} from 'lucide-react';
import { SettingsModal } from '../components/SettingsModal';
import { BalanceModal } from '../components/BalanceModal';
import { HelpModal } from '../components/HelpModal';
import { AboutModal } from '../components/AboutModal';
import { Network } from '@capacitor/network';
import { sanitizeText, sanitizeNumber, sanitizeForScript } from '../utils/sanitize';
import { routePaymentWindowUrl } from '../utils/paymentWindowRouting';
import type { PaymentEntry } from '../utils/sbpdclApi';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { App } from '@capacitor/app';

// ─── Native platform guard ────────────────────────────────────────────────────
const isNative = (): boolean => {
  try { return !!(window as any).Capacitor?.isNativePlatform?.(); } catch { return false; }
};

// ─── Payment window ───────────────────────────────────────────────────────────
const PAYMENT_WINDOW_NAME = 'bijli_payment';

/**
 * Phones and small tablets — a coarse pointer alone would catch touchscreen
 * laptops, which have the room for a popup and should keep getting one.
 */
const isHandheld = (): boolean => {
  try {
    return window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 820;
  } catch {
    return false;
  }
};

/**
 * Open the payment gateway.
 *
 * Desktop gets a sized popup window: the gateway drops to a reduced set of
 * payment options in a narrow viewport, so it is given room on purpose.
 *
 * Handhelds get a plain named tab in the same window instead. Popup features on
 * a phone are either ignored or honoured as a detached window the user has to
 * hunt for in the app switcher to get back from; a tab in the same window stays
 * one back-gesture away from the app.
 *
 * Must be called synchronously from the click that triggered it or the popup
 * blocker stops it — pass '' and navigate the window once the gateway URL
 * arrives.
 */
function openPaymentWindow(url: string): Window | null {
  if (isHandheld()) return window.open(url, PAYMENT_WINDOW_NAME);

  // Roomy enough for the gateway's full desktop layout.
  const width = Math.min(1024, Math.max(900, window.outerWidth - 200));
  const height = Math.min(860, Math.max(700, window.outerHeight - 120));
  const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
  const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);
  return window.open(
    url,
    PAYMENT_WINDOW_NAME,
    `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
  );
}

/**
 * Hand an already-open window to the gateway.
 *
 * Two shapes, because SBPDCL has two: hdfcV2 answers with a URL to open, while
 * bbaroda and easebuzz answer with an action URL plus hidden fields that have
 * to be POSTed. The portal does the same thing in its own createPaytmForm.
 *
 * The form is built with createElement and .value rather than written as an
 * HTML string: field values come from a third party, and assigning them as DOM
 * properties cannot inject markup the way string concatenation could.
 */
function enterGateway(win: Window, entry: PaymentEntry): void {
  if (entry.kind === 'url') {
    win.location.href = entry.url;
    return;
  }

  const doc = win.document;
  doc.open();
  doc.write('<!doctype html><meta charset="utf-8"><title>Opening payment…</title>');
  doc.close();

  const form = doc.createElement('form');
  form.method = 'POST';
  form.action = entry.url;
  for (const [name, value] of Object.entries(entry.fields)) {
    const input = doc.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  doc.body.appendChild(form);
  form.submit();
}

// ─── Avatar colour palette ─────────────────────────────────────────────────
const AVATAR_GRADIENTS = [
  'from-violet-500 to-purple-700',
  'from-indigo-500 to-blue-700',
  'from-rose-500 to-pink-700',
  'from-amber-500 to-orange-600',
  'from-teal-500 to-cyan-600',
  'from-emerald-500 to-green-700',
];
const getAvatarGradient = (name: string) =>
  AVATAR_GRADIENTS[name.charCodeAt(0) % AVATAR_GRADIENTS.length];

// ─── App Logo SVG ─────────────────────────────────────────────────────────
const AppLogo = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
    <path d="M55 15 L25 55 H55 L50 85 L80 45 H50 Z" fill="#FDE047" />
  </svg>
);

let globalSyncPromise: Promise<void> | null = null;
const MIN_RECHARGE_AMOUNT = '100';

// ─── PC Bookmarklet support ───────────────────────────────────────────────────
// The automation script is hosted on GitHub Pages and loaded dynamically by
// bookmarklets so they can run on the SBPDCL portal without CORS restrictions.
const GITHUB_PAGES_SCRIPT_URL = 'https://adityaraj3136.github.io/Electricity-Recharge/sbpdcl-automation.js';

function generateBookmarklet(consumer: Consumer, overrideAmount?: string): string {
  const ca       = sanitizeForScript(consumer.caNumber);
  const mobile   = sanitizeForScript(consumer.mobileNumber   || '');
  const amount   = sanitizeForScript(overrideAmount ?? consumer.preferredAmount ?? '');
  const gateway  = sanitizeForScript(consumer.preferredGateway || 'HDFC');
  const url      = GITHUB_PAGES_SCRIPT_URL;
  // Compact IIFE that dynamically loads the script from GitHub Pages then calls automation
  const code = [
    '(function(){',
    "var s=document.createElement('script');",
    `s.src='${url}?t='+Date.now();`,
    's.onload=function(){',
    "if(typeof window.startSbpdclAutomation==='function'){",
    `window.startSbpdclAutomation({caNumber:'${ca}',mobileNumber:'${mobile}',amount:'${amount}',gateway:'${gateway}'});`,
    "}else{alert('Automation script not ready. Try again in 2 seconds.');}",
    '};',
    "s.onerror=function(){alert('Failed to load automation script. Please check your internet connection.');};",
    'document.head.appendChild(s);',
    '})();',
  ].join('');
  return 'javascript:' + encodeURIComponent(code);
}



// ─── Component ─────────────────────────────────────────────────────────────
export function Home() {
  const { consumers, addConsumer, updateConsumer, deleteConsumer, refresh: refreshConsumers } = useConsumers();
  const { lang, t, toggleLang } = useLang();
  const { settings, updateSettings } = useSettings();

  const [isSyncing, setIsSyncing] = useState(false);
  const [sessionBalances, setSessionBalances] = useState<Record<string, { balance: string, date: string, status: string }>>({});
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingConsumer, setEditingConsumer] = useState<Consumer | null>(null);
  const [name, setName] = useState('');
  const [caNumber, setCaNumber] = useState('');
  const [mobile, setMobile] = useState('');
  const [amount, setAmount] = useState('');
  const [gateway, setGateway] = useState('HDFC');
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('success');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isBalanceOpen, setIsBalanceOpen] = useState(false);
  const [isBalanceLoading, setIsBalanceLoading] = useState(false);
  const [balanceDetails, setBalanceDetails] = useState<BalanceDetails | null>(null);
  const [balanceModalMode, setBalanceModalMode] = useState<'view' | 'recharge'>('view');
  /** Why the last balance fetch failed, so the modal can say so instead of going blank. */
  const [balanceError, setBalanceError] = useState('');
  const [activeConsumer, setActiveConsumer] = useState<Consumer | null>(null);
  const [activeTab, setActiveTab] = useState<'home' | 'meters'>('home');
  const [isRecharging, setIsRecharging] = useState(false);
  // Web-only payment flow. The gateway refuses to be framed (X-Frame-Options),
  // so it runs in a separate window while this modal keeps the user in the app
  // and reports what happens.
  const [payment, setPayment] = useState<{
    consumer: Consumer;
    amount: number;
    url: string;
    /** How to enter the gateway; kept so the "popup blocked" retry can replay
        a form post, which a bare URL cannot express. */
    entry?: PaymentEntry;
    status: 'starting' | 'paying' | 'blocked' | 'checking' | 'done' | 'error';
    error?: string;
    newBalance?: string;
    balanceBefore?: string | null;
    confirmed?: boolean;
  } | null>(null);
  const payWindowRef = useRef<Window | null>(null);


  // Per-field form errors
  const [formErrors, setFormErrors] = useState<{ name?: string; caNumber?: string; mobile?: string; amount?: string }>({});

  // Pull-to-refresh — only active on home tab, not during automation or payment
  const { isPulling, isRefreshing, pullProgress, handleTouchStart, handleTouchMove, handleTouchEnd } = usePullToRefresh({
    enabled: activeTab === 'home' && !isBalanceLoading && !payment,
    onRefresh: useCallback(async () => {
      setSessionBalances({});
      refreshConsumers();
      await new Promise(r => setTimeout(r, 600));
    }, [refreshConsumers]),
  });

  // Background Task Listener to keep fetching alive when minimized — native only
  useEffect(() => {
    if (!isNative()) return;
    const listener = App.addListener('appStateChange', async ({ isActive }) => {
      if (!isActive && globalSyncPromise) {
        try {
          const { BackgroundTask } = await import('@capawesome/capacitor-background-task');
          // Use a wrapper to avoid race condition where taskId is referenced
          // inside the callback before the outer await resolves.
          const taskRef = { id: '' };
          taskRef.id = await BackgroundTask.beforeExit(async () => {
            await globalSyncPromise;
            BackgroundTask.finish({ taskId: taskRef.id });
          });
        } catch (e) {
          // Plugin not available or web
        }
      }
    });
    return () => {
      listener.then(l => l.remove());
    };
  }, []);

  // Auto-sync on first load, on every platform — fetches live balances for all meters.
  // Consumers arrive from storage a render after mount, so this waits for them
  // rather than firing once on an empty list, and the ref keeps it to one run.
  const hasAutoSyncedRef = useRef(false);
  useEffect(() => {
    if (hasAutoSyncedRef.current || consumers.length === 0) return;
    hasAutoSyncedRef.current = true;
    const timer = setTimeout(() => syncAllMeters(), 2000); // let the UI paint first
    return () => clearTimeout(timer);
  }, [consumers]);

  // Periodic background sync every 30 mins
  useEffect(() => {
    const interval = setInterval(() => {
      if (consumers.length > 0 && !isSyncing) syncAllMeters();
    }, 30 * 60 * 1000); // 30 minutes
    return () => clearInterval(interval);
  }, [consumers, isSyncing]);

  // Watch the payment window. It is cross-origin so its contents are unreadable —
  // closing is the only observable signal, and it means the user is done (paid or
  // abandoned), so re-fetch the balance to find out which.
  useEffect(() => {
    if (payment?.status !== 'paying') return;
    const timer = setInterval(async () => {
      const win = payWindowRef.current;
      if (!win || !win.closed) return;
      clearInterval(timer);
      payWindowRef.current = null;
      setPayment(p => (p ? { ...p, status: 'checking' } : p));
      try {
        const { fetchBalanceFromApi } = await import('../utils/sbpdclApi');
        const details = await fetchBalanceFromApi(payment.consumer.caNumber);
        setSessionBalances(prev => ({
          ...prev,
          [payment.consumer.id]: {
            balance: details.availableBalance,
            date: new Date().toLocaleDateString('en-GB'),
            status: details.currentStatus
          }
        }));
        updateConsumer(payment.consumer.id, {
          lastFetchedBalance: details.availableBalance,
          lastFetchedDate: new Date().toLocaleDateString('en-GB'),
          currentStatus: details.currentStatus
        });
        setPayment(p => (p ? {
          ...p,
          status: 'done',
          newBalance: details.availableBalance,
          // A changed balance is the only proof the payment landed.
          confirmed: !!p.balanceBefore && details.availableBalance !== p.balanceBefore,
        } : p));
      } catch {
        // The payment may still have gone through; just cannot confirm it here.
        setPayment(p => (p ? { ...p, status: 'done' } : p));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [payment?.status, payment?.consumer, updateConsumer]);

  // Clear action menu when switching tabs
  useEffect(() => {
    setActionMenuId(null);
  }, [activeTab]);

  // Global click outside to close action menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.action-menu-container') && !target.closest('.action-menu-button')) {
        setActionMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);


  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => setToastMessage(null), 3500);
  };

  /**
   * Fire an immediate local notification if the fetched balance is below ₹100.
   * Only fires on the native Capacitor app where LocalNotifications is available.
   */
  const checkAndNotifyLowBalance = async (details: BalanceDetails, consumerName: string) => {
    // Only notify if user has enabled low balance alerts
    if (!settings.reminderEnabled) return;
    try {
      // Preserve the minus sign so negative (overdrawn) balances are not treated as positive.
      // e.g. "-₹500.00" → "-500" → parseFloat → -500 → correctly < 100 → alert fires.
      const balStr = (details.availableBalance || '').replace(/[^0-9.-]/g, '');
      const bal = parseFloat(balStr);
      if (isNaN(bal) || bal >= 100) return; // Balance is fine (positive & above threshold)

      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const { display: permResult } = await LocalNotifications.checkPermissions();
      if (permResult !== 'granted') {
        const { display } = await LocalNotifications.requestPermissions();
        if (display !== 'granted') return;
      }

      await LocalNotifications.schedule({
        notifications: [{
          id: Math.floor(Math.random() * 90000) + 10000,
          title: '⚠️ Low Balance Alert',
          body: `${consumerName}: ₹${bal.toFixed(0)} remaining. Recharge now to avoid power cut!`,
          channelId: 'bijli_reminder',
          schedule: { at: new Date(Date.now() + 1000) }, // fire in 1 second
          sound: 'default',
          smallIcon: 'ic_stat_icon_config_sample',
          iconColor: '#DC2626',
          actionTypeId: '',
          extra: null,
        }],
      });
    } catch (_) {
      // Silently fail if notifications are not available
    }
  };

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return t.greeting.morning;
    if (h < 18) return t.greeting.afternoon;
    return t.greeting.evening;
  };

  const resetForm = () => {
    setName(''); setCaNumber(''); setMobile('');
    setAmount(''); setGateway('HDFC'); setEditingConsumer(null);
    setFormErrors({});
  };

  const handleSave = () => {
    const errors: { name?: string; caNumber?: string; mobile?: string; amount?: string } = {};
    if (!name.trim()) errors.name = lang === 'en' ? 'Location name is required' : 'स्थान का नाम आवश्यक है';
    if (!caNumber.trim()) errors.caNumber = lang === 'en' ? 'CA Number is required' : 'CA नंबर आवश्यक है';
    if (!mobile.trim()) errors.mobile = lang === 'en' ? 'Mobile number is required for recharge' : 'रिचार्ज के लिए मोबाइल नंबर आवश्यक है';
    
    const cleanAmount = sanitizeNumber(amount);
    if (cleanAmount && parseInt(cleanAmount) < 100) {
      errors.amount = lang === 'en' ? 'Minimum amount is ₹100' : 'न्यूनतम राशि ₹100 है';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});
    const data = {
      name: sanitizeText(name),
      caNumber: sanitizeNumber(caNumber),
      mobileNumber: sanitizeNumber(mobile),
      preferredAmount: cleanAmount, // can be blank
      preferredGateway: gateway as any
    };
    if (editingConsumer) { updateConsumer(editingConsumer.id, data); } else { addConsumer(data); }
    setIsAddOpen(false);
    resetForm();
  };

  const handleDelete = (id: string) => {
    if (window.confirm(t.delete.confirm)) deleteConsumer(id);
    setActionMenuId(null);
  };

  const startSbpdclAutomation = async (consumer: Consumer, finalAmount: string) => {
    const status = await Network.getStatus();
    if (!status.connected) { showToast(t.toast.offline, 'error'); return; }
    
    // Web/PWA: register the recharge order through the API and hand the user
    // straight to the payment page. Everything up to payment is automated; the
    // payment itself is always completed by the user on the gateway.
    import('@capacitor/core').then(async ({ Capacitor }) => {
      if (!Capacitor.isNativePlatform()) {
        // It cannot be an in-page modal: the gateway sends
        // X-Frame-Options: SAMEORIGIN, so any attempt to iframe it is blocked.
        // Opened empty right here — synchronously with the click — and navigated
        // once the gateway URL arrives, or the popup blocker stops it.
        const payWindow = openPaymentWindow('');
        setIsRecharging(true);
        const balanceBefore = consumer.lastFetchedBalance ?? sessionBalances[consumer.id]?.balance ?? null;
        setPayment({ consumer, amount: Number(finalAmount), status: 'starting', url: '', balanceBefore });
        try {
          const { createRechargeOrder } = await import('../utils/sbpdclApi');
          const order = await createRechargeOrder({
            caNumber: consumer.caNumber,
            amount: finalAmount,
            mobileNumber: consumer.mobileNumber,
            gateway: consumer.preferredGateway,
          });
          if (payWindow) {
            enterGateway(payWindow, order.entry);
            payWindowRef.current = payWindow;
          } else {
            // Popup blocked — the modal offers a manual "Open payment window".
            payWindowRef.current = null;
          }
          setPayment({
            consumer,
            amount: order.amount,
            url: order.paymentUrl,
            entry: order.entry,
            status: payWindow ? 'paying' : 'blocked',
            balanceBefore, // carry forward — the outcome check compares against it
          });
        } catch (err) {
          payWindow?.close();
          const message = err instanceof Error ? err.message : 'Could not start the recharge.';
          setPayment({ consumer, amount: Number(finalAmount), url: '', status: 'error', error: message });
        } finally {
          setIsRecharging(false);
        }
        return;
      }

      // Native: register the order through the API, then open the payment page
      // directly. Previously this drove the portal's own form step by step —
      // filling the CA number, searching, picking a gateway, dismissing a confirm
      // dialog — which was slow and broke whenever the portal's markup changed.
      const win = window as any;
      if (!win.cordova?.InAppBrowser) { showToast(t.toast.browserError, 'error'); return; }

      setIsRecharging(true);
      showToast(`${t.toast.rechargeStart} ${consumer.name}...`);

      let entry: PaymentEntry;
      try {
        const { createRechargeOrder } = await import('../utils/sbpdclApi');
        const order = await createRechargeOrder({
          caNumber: consumer.caNumber,
          amount: finalAmount,
          mobileNumber: consumer.mobileNumber,
          gateway: consumer.preferredGateway,
        });
        entry = order.entry;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not start the recharge.';
        showToast(`Error: ${message}`, 'error');
        return;
      } finally {
        setIsRecharging(false);
      }

      {
        // No clearcache/clearsessioncache here: those existed to stop one meter's
        // data bleeding into the next while driving the portal's form. This window
        // only ever shows the gateway, and wiping the session can break the
        // acknowledgement page the gateway redirects back to.
        const browser = win.cordova.InAppBrowser.open(
          entry.kind === 'url' ? entry.url : 'about:blank', '_blank',
          ['location=no','toolbar=yes','toolbarcolor=#2563eb','closebuttoncaption=✕ Close',
           'closebuttoncolor=#ffffff','hideurlbar=yes',
           'zoom=no','hardwareback=yes'].join(',')
        );

        // bbaroda and easebuzz answer with a form to POST rather than a URL, and
        // InAppBrowser can only be handed a URL — so the window opens blank and
        // the form is injected once it is there. JSON.stringify supplies the
        // quoting; the values are third-party data and must not be pasted into
        // the script as bare literals.
        if (entry.kind === 'form') {
          browser.addEventListener('loadstop', function injectOnce(event: any) {
            if (!String(event?.url || '').startsWith('about:blank')) return;
            browser.removeEventListener('loadstop', injectOnce);
            browser.executeScript({ code: `
              (function () {
                var f = document.createElement('form');
                f.method = 'POST';
                f.action = ${JSON.stringify(entry.url)};
                var fields = ${JSON.stringify(entry.fields)};
                Object.keys(fields).forEach(function (k) {
                  var i = document.createElement('input');
                  i.type = 'hidden'; i.name = k; i.value = fields[k];
                  f.appendChild(i);
                });
                document.body.appendChild(f);
                f.submit();
              })();
            ` });
          });
        }

        // Snapshot the balance so the outcome can be reported honestly on exit
        // rather than assuming the payment succeeded.
        const balanceBefore = consumer.lastFetchedBalance ?? sessionBalances[consumer.id]?.balance ?? null;

        // Open UPI payment apps in system browser; keep IAB open for timer/acknowledgement page
        let lastUpiIntentUrl = '';
        let lastUpiIntentAt = 0;
        let autoCloseTimer: any = null;
        let stayRequested = false; // user asked to keep reading the acknowledgement

        const openUpiIntent = (url: string) => {
          const cleanUrl = String(url || '').trim();
          if (!cleanUrl) return;
          // Treat any non-web scheme as an app handoff rather than allow-listing
          // individual UPI apps: the gateway keeps adding them (BHIM, CRED, Amazon
          // Pay, slice…), and an unlisted one would launch natively without ever
          // setting upiWasTriggered — losing the post-payment balance refresh.
          const colonAt = cleanUrl.indexOf(':');
          if (colonAt <= 0) return; // no scheme at all — never a valid app handoff
          const scheme = cleanUrl.slice(0, colonAt).toLowerCase();
          const WEB_SCHEMES = ['http', 'https', 'about', 'data', 'blob', 'javascript', 'file', 'content', 'chrome'];
          // Handled by Android itself and unrelated to payment.
          const NON_PAYMENT_SCHEMES = ['mailto', 'tel', 'sms', 'geo'];
          if (!scheme || WEB_SCHEMES.includes(scheme) || NON_PAYMENT_SCHEMES.includes(scheme)) return;
          const now = Date.now();
          if (cleanUrl === lastUpiIntentUrl && now - lastUpiIntentAt < 1500) return;
          lastUpiIntentUrl = cleanUrl;
          lastUpiIntentAt = now;
          win.cordova.InAppBrowser.open(cleanUrl, '_system');
        };

        // The window now shows nothing but the payment page, so any exit means the
        // user is done — paid or abandoned. Always re-check: it is one cheap API
        // call and it is the only way to tell which happened.
        browser.addEventListener('exit', async () => {
          if (autoCloseTimer) clearTimeout(autoCloseTimer);
          showToast(lang === 'en' ? 'Checking updated balance after payment...' : 'भुगतान के बाद अद्यतन राशि की जाँच की जा रही है...');
          try {
            const { fetchBalanceFromApi } = await import('../utils/sbpdclApi');
            const details = await fetchBalanceFromApi(consumer.caNumber);
            setSessionBalances(prev => ({
              ...prev,
              [consumer.id]: {
                balance: details.availableBalance,
                date: new Date().toLocaleDateString('en-GB'),
                status: details.currentStatus
              }
            }));
            updateConsumer(consumer.id, {
              lastFetchedBalance: details.availableBalance,
              lastFetchedDate: new Date().toLocaleDateString('en-GB'),
              currentStatus: details.currentStatus
            });
            // Only a changed balance proves the payment landed. Anything else is
            // reported as "not confirmed" rather than success or failure — the
            // discom can take a few minutes to credit a genuine payment.
            if (balanceBefore && details.availableBalance !== balanceBefore) {
              showToast(
                lang === 'en'
                  ? `Recharge confirmed — balance is now ${details.availableBalance}`
                  : `रिचार्ज सफल — शेष राशि अब ${details.availableBalance}`,
                'success'
              );
            } else {
              showToast(
                lang === 'en'
                  ? `Balance unchanged (${details.availableBalance}). If you paid, it can take a few minutes.`
                  : `शेष राशि अपरिवर्तित (${details.availableBalance})। भुगतान किया है तो कुछ मिनट लग सकते हैं।`,
                'info'
              );
            }
            checkAndNotifyLowBalance(details, consumer.name);
          } catch {
            showToast(
              lang === 'en'
                ? 'Could not confirm the payment. Please check your balance shortly.'
                : 'भुगतान की पुष्टि नहीं हो सकी। कृपया थोड़ी देर बाद शेष राशि जाँचें।',
              'error'
            );
          }
        });

        browser.addEventListener('loadstart', (event: any) => {
          const url = String(event?.url || '');
          const action = routePaymentWindowUrl(url, {
            countdownRunning: !!autoCloseTimer,
            stayRequested,
          });

          if (action === 'close') {
            if (autoCloseTimer) clearTimeout(autoCloseTimer);
            browser.close();
            return;
          }

          // User tapped the countdown banner to keep reading the acknowledgement.
          if (action === 'stay') {
            if (autoCloseTimer) clearTimeout(autoCloseTimer);
            autoCloseTimer = null;
            stayRequested = true;
            browser.executeScript({ code: `
              var b = document.getElementById('bijli-autoclosetimer');
              if (b) b.parentNode.removeChild(b);
              history.back();
            ` });
            return;
          }

          if (action === 'app-handoff') {
            openUpiIntent(url);
            return;
          }

          // Empty JSON body renders as a blank white page — nothing to read, so
          // close and let the in-app balance check report the real outcome.
          if (action === 'close-blank') {
            if (autoCloseTimer) clearTimeout(autoCloseTimer);
            autoCloseTimer = null;
            setTimeout(() => { try { browser.close(); } catch (_) {} }, 400);
            return;
          }

          // A real acknowledgement page. This is reached after cancellations and
          // failures too, so the countdown must not claim the payment succeeded.
          if (action === 'start-countdown') {
            // Long enough to actually read the bank's acknowledgement.
            let countdown = 20;
            const tick = () => {
              browser.executeScript({ code: `
                (function() {
                  var existing = document.getElementById('bijli-autoclosetimer');
                  if (!existing) {
                    existing = document.createElement('div');
                    existing.id = 'bijli-autoclosetimer';
                    existing.style = 'position:fixed; top:16px; left:50%; transform:translateX(-50%); background:#0f172a; border:2px solid #22c55e; color:white; padding:10px 22px; border-radius:30px; z-index:2147483647; font-weight:bold; box-shadow:0 8px 16px rgba(0,0,0,0.5); font-family:sans-serif; font-size:14px; text-align:center; white-space:nowrap;';
                    document.body.appendChild(existing);
                  }
                  existing.innerHTML = 'Returning to Bijli Recharge in ${countdown}s — tap to stay';
                  existing.style.cursor = 'pointer';
                  existing.onclick = function() { window.location.href = 'https://app.stay.browser/'; };
                })();
              `});
              countdown--;
              if (countdown >= 0) {
                autoCloseTimer = setTimeout(tick, 1000);
              } else {
                autoCloseTimer = null;
                try { browser.close(); } catch(_) {}
              }
            };
            tick();
          }
        });

        browser.addEventListener('loaderror', (event: any) => {
          // Some gateways trigger app intents via unsupported custom schemes,
          // which can fail in WebView before loadstart; recover by opening externally.
          openUpiIntent(String(event?.url || ''));
        });

        browser.addEventListener('loadstop', () => {
          // Floating close button on every page (including the gateway's own
          // sub-pages) so the user can always get back out.
          browser.executeScript({ code: `
            if (!document.getElementById('bijli-float-close')) {
              var btn = document.createElement('div');
              btn.id = 'bijli-float-close';
              btn.innerHTML = '✕ Home';
              btn.style = 'position:fixed; bottom:24px; right:24px; background:#0f172a; border:2px solid #3b82f6; color:white; padding:12px 24px; border-radius:30px; z-index:2147483647; font-weight:bold; box-shadow:0 8px 16px rgba(0,0,0,0.5); font-family:sans-serif; font-size:16px; display:flex; align-items:center; justify-content:center; cursor:pointer; text-transform:uppercase; letter-spacing:0.5px; opacity:0.95;';
              btn.onclick = function() { window.location.href = 'https://app.close.browser/'; };
              document.body.appendChild(btn);
            }
          `});
        });
      }
    });
  };


  const handleRecharge = async (consumer: Consumer) => {
    setActiveConsumer(consumer);
    setBalanceModalMode('recharge');
    await fetchBalanceDetails(consumer);
  };

  const handleCheckBalance = async (consumer: Consumer) => {
    setActiveConsumer(consumer);
    setBalanceModalMode('view');
    await fetchBalanceDetails(consumer);
  };

  const fetchBalanceDetails = async (consumer: Consumer) => {
    const status = await Network.getStatus();
    if (!status.connected) { showToast(t.toast.offline, 'error'); return; }

    // Same path on web and native: the JSON API is reachable from both, so there
    // is no reason to drive a hidden browser on Android any more.
    // The cached balance shows immediately (if any) so the modal is never empty,
    // then is replaced in place once the live value arrives.
    setIsBalanceOpen(true);
    setBalanceError('');
    setBalanceDetails(consumer.lastFetchedBalance ? {
      caNumber:           consumer.caNumber,
      name:               consumer.name,
      division:           '',
      subDivision:        '',
      lastRechargeDate:   consumer.lastFetchedDate  || 'N/A',
      lastRechargeAmount: 'N/A',
      consumerType:       '',
      currentStatus:      consumer.currentStatus    || 'N/A',
      availableBalance:   consumer.lastFetchedBalance,
      amispVendor:        '',
    } : null);
    setIsBalanceLoading(true);

    try {
      const { fetchBalanceFromApi } = await import('../utils/sbpdclApi');
      const details = await fetchBalanceFromApi(consumer.caNumber);
      setBalanceDetails(details);
      setSessionBalances(prev => ({
        ...prev,
        [consumer.id]: {
          balance: details.availableBalance,
          date: new Date().toLocaleDateString('en-GB'),
          status: details.currentStatus
        }
      }));
      updateConsumer(consumer.id, {
        lastFetchedBalance: details.availableBalance,
        lastFetchedDate: new Date().toLocaleDateString('en-GB'),
        currentStatus: details.currentStatus
      });
      checkAndNotifyLowBalance(details, consumer.name);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not fetch balance.';
      // The modal stays open either way: with a cached balance it keeps showing
      // it, and without one it falls through to the "Balance unavailable" state.
      // Closing it on failure would hide the last known balance and leave only
      // a toast to explain why the screen vanished.
      // The reason goes to the modal too — a toast is gone in seconds, and a
      // blank panel with no explanation is what made this look broken.
      setBalanceError(message);
      if (consumer.lastFetchedBalance) {
        showToast(`Showing last saved balance — ${message}`, 'info');
      } else {
        showToast(`Error: ${message}`, 'error');
      }
    } finally {
      setIsBalanceLoading(false);
    }
  };

  // Silent background fetch for the sync loop, on both web and native.
  // Errors are swallowed on purpose: this runs unattended, and one unreachable
  // meter must not abort the rest of the sync.
  const fetchBalanceSilently = async (consumer: Consumer): Promise<void> => {
    try {
      const { fetchBalanceFromApi } = await import('../utils/sbpdclApi');
      const details = await fetchBalanceFromApi(consumer.caNumber);
      setSessionBalances(prev => ({
        ...prev,
        [consumer.id]: {
          balance: details.availableBalance,
          date: new Date().toLocaleDateString('en-GB'),
          status: details.currentStatus
        }
      }));
      updateConsumer(consumer.id, {
        lastFetchedBalance: details.availableBalance,
        lastFetchedDate: new Date().toLocaleDateString('en-GB'),
        currentStatus: details.currentStatus
      });
      checkAndNotifyLowBalance(details, consumer.name);
    } catch {
      // leave the previously cached balance in place
    }
  };

  const syncAllMeters = async () => {
    if (consumers.length === 0 || isSyncing) return;
    setIsSyncing(true);
    showToast('Fetching balances in background...', 'info');
    
    globalSyncPromise = (async () => {
      for (const consumer of consumers) {
        await fetchBalanceSilently(consumer);
      }
    })();
    
    await globalSyncPromise;
    globalSyncPromise = null;
    
    setIsSyncing(false);
    showToast('Fetch complete');
  };

  const handleQuickAction = (actionFn: (consumer: Consumer) => void) => {
    if (consumers.length === 1) {
      actionFn(consumers[0]);
    } else if (consumers.length > 1) {
      setActiveTab('meters');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      showToast(lang === 'en' ? 'Select a meter' : 'एक मीटर चुनें', 'info');
    } else {
      showToast(lang === 'en' ? 'Add a meter first' : 'पहले मीटर जोड़ें', 'error');
    }
  };


  // ─── Shared styles ──────────────────────────────────────────────────────
  const isDark = settings.darkMode;
  const bg = isDark ? 'bg-[#0e1726]' : 'bg-[#f0f5ff]';
  const textPrimary = isDark ? 'text-white' : 'text-gray-900';
  const textSecondary = isDark ? 'text-gray-400' : 'text-gray-500';
  const sectionBg = isDark ? 'bg-[#162033]' : 'bg-white';

  // ─── Quick actions data ─────────────────────────────────────────────────
  const quickActions = [
    { icon: <BookOpen size={22} className="text-blue-600"/>, label: t.home.quickSaveCA, desc: t.home.quickSaveCADesc, color: 'bg-blue-50 dark:bg-blue-900/20', onClick: () => { resetForm(); setIsAddOpen(true); } },
    { icon: <Activity size={22} className="text-purple-600"/>, label: t.home.quickCheckBal, desc: t.home.quickCheckBalDesc, color: 'bg-purple-50 dark:bg-purple-900/20', onClick: () => handleQuickAction(handleCheckBalance) },
    { icon: <CreditCard size={22} className="text-green-600"/>, label: t.home.quickPayUPI, desc: t.home.quickPayUPIDesc, color: 'bg-green-50 dark:bg-green-900/20', onClick: () => handleQuickAction(handleRecharge) },
  ];

  // ─── How it works steps ─────────────────────────────────────────────────
  const howItWorks = [
    { num: 1, icon: <BookOpen size={20} className="text-blue-600"/>, bg: 'bg-blue-100 dark:bg-blue-900/30', title: t.home.step1Title, desc: t.home.step1Desc },
    { num: 2, icon: <Zap size={20} className="text-purple-600"/>, bg: 'bg-purple-100 dark:bg-purple-900/30', title: t.home.step2Title, desc: t.home.step2Desc },
    { num: 3, icon: <CreditCard size={20} className="text-green-600"/>, bg: 'bg-green-100 dark:bg-green-900/30', title: t.home.step3Title, desc: t.home.step3Desc },
  ];

  return (
    <div
      className={`min-h-screen ${bg} font-sans transition-colors duration-300`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      {(isPulling || isRefreshing) && (
        <div
          className="fixed top-0 left-0 right-0 flex items-center justify-center z-50 pointer-events-none"
          style={{ height: `${Math.max(pullProgress * 70, isRefreshing ? 56 : 0)}px`, transition: isRefreshing ? 'none' : 'height 0.1s' }}
        >
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full shadow-lg text-sm font-semibold text-white ${isRefreshing ? 'bg-primary-600' : 'bg-gray-800'} transition-all`}>
            <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} style={{ transform: `rotate(${pullProgress * 360}deg)`, transition: isRefreshing ? 'none' : 'transform 0.1s' }} />
            {isRefreshing ? (lang === 'en' ? 'Refreshing…' : 'ताज़ा हो रहा है…') : (lang === 'en' ? 'Pull to refresh' : 'नीचे खींचें')}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          DESKTOP NAVBAR (hidden on mobile)
      ════════════════════════════════════════════════════════ */}
      <nav className={`hidden md:flex items-center justify-between px-8 py-3 ${sectionBg} shadow-sm border-b ${isDark ? 'border-[#253350]' : 'border-gray-100'} sticky top-0 z-40`}>
        {/* Logo */}
        <div className="flex items-center gap-2">
          <AppLogo className="w-8 h-8 bg-primary-600 rounded-lg shadow-md shadow-primary-500/30" />
          <span className={`font-bold text-lg tracking-tight ${textPrimary}`}>{t.appName}</span>
        </div>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {[
            // Meters is a real view on desktop now, not an anchor, so these
            // switch tabs exactly like the mobile bottom nav does.
            { label: lang === 'en' ? 'Home' : 'होम', active: activeTab === 'home', onClick: () => { setActiveTab('home'); window.scrollTo({ top: 0, behavior: 'smooth' }); } },
            { label: lang === 'en' ? 'Meters' : 'मीटर', active: activeTab === 'meters', onClick: () => { setActiveTab('meters'); window.scrollTo({ top: 0, behavior: 'smooth' }); } },
            { label: lang === 'en' ? 'Help' : 'सहायता', active: false, onClick: () => setIsHelpOpen(true) },
            { label: lang === 'en' ? 'About' : 'के बारे में', active: false, onClick: () => setIsAboutOpen(true) },
          ].map((item) => (
            <button
              key={item.label}
              onClick={item.onClick}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                item.active
                  ? 'text-primary-600 border-b-2 border-primary-600 rounded-none'
                  : `${textSecondary} hover:text-primary-600`
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleLang}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${isDark ? 'border-[#253350] text-gray-300 hover:bg-[#253350]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            <Globe size={14} />
            <span>{lang === 'en' ? 'हिंदी' : 'EN'}</span>
          </button>
          <button
            onClick={() => updateSettings({ darkMode: !settings.darkMode })}
            className={`p-2 rounded-full transition-all ${isDark ? 'bg-[#253350] text-yellow-300 hover:bg-[#2d3e5a]' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-full bg-primary-600 text-white hover:bg-primary-700 transition-all shadow-md shadow-primary-500/30"
          >
            <Settings size={16} />
          </button>
          <button
            onClick={() => { resetForm(); setIsAddOpen(true); }}
            className="p-2 bg-green-500 text-white rounded-full hover:bg-green-600 transition-all shadow-md shadow-green-500/30 active:scale-95"
            title={t.home.addMeter}
          >
            <Plus size={20} strokeWidth={3} />
          </button>
        </div>
      </nav>

      {/* ════════════════════════════════════════════════════════
          MOBILE HEADER
      ════════════════════════════════════════════════════════ */}
      <header className={`md:hidden flex items-center justify-between px-4 py-3 ${sectionBg} border-b ${isDark ? 'border-[#253350]' : 'border-gray-100'} sticky top-0 z-40 ${activeTab === 'meters' ? 'hidden' : ''}`} style={{ paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))' }}>
        <div className="flex items-center gap-2">
          <AppLogo className="w-7 h-7 bg-primary-600 rounded-lg" />
          <span className={`font-bold text-base ${textPrimary}`}>{t.appName}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleLang} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${isDark ? 'border-[#253350] text-gray-300' : 'border-gray-200 text-gray-600'}`}>
            <Globe size={11} />
            {lang === 'en' ? 'हिंदी' : 'EN'}
          </button>
          <button onClick={() => updateSettings({ darkMode: !settings.darkMode })} className={`p-1.5 rounded-full transition-all ${isDark ? 'bg-[#253350] text-yellow-300' : 'bg-gray-100 text-gray-600'}`}>
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <button onClick={() => setIsSettingsOpen(true)} className="p-1.5 rounded-full bg-primary-600 text-white">
            <Settings size={15} />
          </button>
        </div>
      </header>

      {/* ════════════════════════════════════════════════════════
          HERO SECTION
      ════════════════════════════════════════════════════════ */}
      <section className={`relative overflow-hidden ${isDark ? 'bg-[#0e1726]' : 'bg-gradient-to-br from-[#e8f0fe] via-[#f0f5ff] to-[#e8f0fe]'} ${activeTab === 'meters' ? 'hidden' : ''}`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-8 md:py-12 flex flex-col md:flex-row items-center gap-6 md:gap-10">

          {/* Left — text */}
          <div className="flex-1 text-center md:text-left">
            <p className={`text-sm sm:text-base font-medium mb-2 ${isDark ? 'text-blue-400' : 'text-primary-600'}`}>
              {getGreeting()} 👋
            </p>
            <h1 className={`text-3xl sm:text-4xl md:text-5xl font-extrabold leading-tight mb-2 ${textPrimary}`}>
              {lang === 'en' ? (
                <>Smart Bihar Electricity<br /><span className="text-primary-600">Recharge</span></>
              ) : (
                <>स्मार्ट बिहार बिजली<br /><span className="text-primary-600">रिचार्ज</span></>
              )}
            </h1>
            <p className={`text-sm sm:text-base mb-6 ${textSecondary}`}>
              {lang === 'en' ? 'Fast. Secure. Reliable.' : 'बिजली रिचार्ज करना हुआ आसान।'}
            </p>

            {/* Feature badges */}
            <div className="flex justify-center md:justify-start gap-2 sm:gap-3">
              {[
                { icon: <Hexagon size={16} className="text-yellow-500 fill-yellow-500"/>, label: lang === 'en' ? 'Instant' : 'तुरंत', sub: lang === 'en' ? 'Recharge' : 'रिचार्ज' },
                { icon: <Shield size={16} className="text-green-500"/>, label: lang === 'en' ? '100%' : '१००%', sub: lang === 'en' ? 'Secure' : 'सुरक्षित' },
                { icon: <BarChart2 size={16} className="text-blue-500"/>, label: lang === 'en' ? 'Live' : 'लाइव', sub: lang === 'en' ? 'Balance' : 'बैलेंस' },
              ].map((item, i) => (
                <div key={i} className={`flex flex-col sm:flex-row items-center gap-1 sm:gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-2xl border shadow-sm ${isDark ? 'bg-[#1c2a42] border-[#253350]' : 'bg-white border-gray-100'}`}>
                  {item.icon}
                  <div className="text-center sm:text-left">
                    <p className={`text-[11px] sm:text-xs font-bold leading-none ${textPrimary}`}>{item.label}</p>
                    <p className={`text-[9px] sm:text-[10px] leading-none mt-1 sm:mt-0.5 ${textSecondary}`}>{item.sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right — illustration */}
          <div className="flex-shrink-0 w-full md:w-1/2 lg:w-[55%]">
            <img src={heroImage} alt="Bijli Bill Assan" loading="lazy" className="w-full h-auto rounded-3xl rounded-br-none shadow-[0_10px_40px_-10px_rgba(37,99,235,0.3)] object-cover border border-white/20" />
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          MAIN CONTENT
      ════════════════════════════════════════════════════════ */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-6 pb-28 md:pb-10 space-y-8">

        {/* ════ METERS TAB VIEW ════ */}
        {activeTab === 'meters' && (
          <section>
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className={`text-xl font-bold ${textPrimary}`}>{lang === 'en' ? 'My Meters' : 'मेरे मीटर'}</h2>
                <p className={`text-xs mt-0.5 ${textSecondary}`}>
                  {consumers.length} {lang === 'en' ? `meter${consumers.length !== 1 ? 's' : ''} saved` : 'मीटर सेव'}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={syncAllMeters}
                  disabled={isSyncing || consumers.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-semibold rounded-full text-xs active:scale-95 disabled:opacity-50 transition-all"
                >
                  <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
                  {isSyncing ? 'Fetching...' : 'Fetch Balances'}
                </button>
                <button
                onClick={() => { resetForm(); setIsAddOpen(true); }}
                className="p-2 bg-green-500 text-white rounded-full shadow-md shadow-green-500/25 active:scale-95 transition-all hover:bg-green-600"
                title={t.home.addMeter}
              >
                <Plus size={18} strokeWidth={3} />
              </button>
            </div>
          </div>

            {consumers.length === 0 ? (
              <div className={`rounded-2xl border p-8 text-center ${isDark ? 'bg-[#1c2a42] border-[#253350]' : 'bg-white border-gray-100 shadow-sm'}`}>
                <div className="w-16 h-16 bg-primary-50 dark:bg-primary-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Bolt size={28} className="text-primary-600 fill-primary-100" />
                </div>
                <h3 className={`font-bold text-base mb-2 ${textPrimary}`}>{t.home.noMeters}</h3>
                <p className={`text-sm mb-5 ${textSecondary}`}>{t.home.noMetersHint}</p>
                <button
                  onClick={() => { resetForm(); setIsAddOpen(true); }}
                  className="p-4 bg-green-500 text-white rounded-full shadow-lg shadow-green-500/30 active:scale-95 transition-all hover:bg-green-600"
                  title={t.home.addMeter}
                >
                  <Plus size={24} strokeWidth={3} />
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {consumers.map((consumer) => (
                  <div key={consumer.id} className={`rounded-2xl border overflow-hidden shadow-sm ${isDark ? 'bg-[#1c2a42] border-[#253350]' : 'bg-white border-gray-100'}`}>
                    {/* Card top */}
                    <div className={`px-4 pt-4 pb-3 flex items-start justify-between border-b ${isDark ? 'border-[#253350]/60' : 'border-gray-50'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${getAvatarGradient(consumer.name)} flex items-center justify-center text-white font-bold text-xl shadow-md flex-shrink-0`}>
                          {consumer.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h3 className={`font-bold text-base leading-tight capitalize ${textPrimary}`}>{consumer.name}</h3>
                          <p className={`text-xs font-mono tracking-wide mt-0.5 ${textSecondary}`}>CA: {consumer.caNumber}</p>
                          {consumer.mobileNumber && (
                            <p className={`text-xs mt-0.5 ${textSecondary}`}>📱 {consumer.mobileNumber}</p>
                          )}
                          {consumer.preferredAmount && (
                            <span className="inline-block mt-1 text-[10px] font-bold text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/30 border border-primary-100 dark:border-primary-800 rounded-full px-2 py-0.5">
                              ₹{consumer.preferredAmount} default
                            </span>
                          )}
                          {consumer.preferredGateway && (
                            <span className="inline-block mt-1 ml-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800 rounded-full px-2 py-0.5">
                              {consumer.preferredGateway}
                            </span>
                          )}
                          {sessionBalances[consumer.id] && (
                            <div className="mt-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
                              Balance: <span className={sessionBalances[consumer.id].balance.includes('-') ? 'text-red-500' : 'text-green-500'}>{sessionBalances[consumer.id].balance}</span>
                              <span className="text-[10px] text-gray-400 font-normal ml-1">({sessionBalances[consumer.id].date})</span>
                            </div>
                          )}
                        </div>
                      </div>
                      {/* 3-dot menu */}
                      <div className="relative flex-shrink-0">
                        <button
                          onClick={() => setActionMenuId(actionMenuId === consumer.id ? null : consumer.id)}
                          className={`action-menu-button p-2 rounded-full transition-colors ${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-[#253350]' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                        >
                          <MoreVertical size={18} />
                        </button>
                        {actionMenuId === consumer.id && (
                          <div className={`action-menu-container absolute right-0 top-full mt-1 w-44 rounded-xl shadow-xl border py-1.5 z-30 ${isDark ? 'bg-[#1c2a42] border-[#253350]' : 'bg-white border-gray-100'}`}>
                            <button
                              onClick={() => {
                                setEditingConsumer(consumer);
                                setName(consumer.name);
                                setCaNumber(consumer.caNumber);
                                setMobile(consumer.mobileNumber || '');
                                setAmount(consumer.preferredAmount || MIN_RECHARGE_AMOUNT);
                                setGateway(consumer.preferredGateway || 'HDFC');
                                setIsAddOpen(true);
                                setActionMenuId(null);
                              }}
                              className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-2.5 transition-colors ${isDark ? 'text-gray-200 hover:bg-[#253350]' : 'text-gray-700 hover:bg-gray-50'}`}
                            >
                              <Edit2 size={14} /> {t.delete.edit}
                            </button>
                            <button
                              onClick={() => handleDelete(consumer.id)}
                              className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-2.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            >
                              <Trash2 size={14} /> {t.delete.delete}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Action buttons */}
                    <div className="p-3 flex flex-col gap-2">
                      <button
                        onClick={() => handleRecharge(consumer)}
                        disabled={isRecharging}
                        className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl h-11 font-semibold text-sm shadow-md shadow-primary-500/25 active:scale-95 transition-all"
                      >
                        <Zap size={16} className="text-yellow-300 fill-yellow-300" />
                        {isRecharging ? (lang === 'en' ? 'Starting…' : 'शुरू हो रहा है…') : t.home.rechargeNow}
                      </button>
                      <button
                        onClick={() => handleCheckBalance(consumer)}
                        className={`w-full flex items-center justify-center gap-2 rounded-xl h-10 font-semibold text-sm border active:scale-95 transition-all ${isDark ? 'bg-[#1c2a42] border-[#253350] text-primary-400 hover:border-primary-500 hover:text-primary-300 hover:bg-[#253350]' : 'bg-primary-50 border-primary-200 text-primary-700 hover:border-primary-300 hover:text-primary-800 hover:bg-primary-100'}`}
                      >
                        <Search size={14} className="text-primary-500" />
                        {t.home.checkBalance}
                      </button>
                      {!isNative() && (
                        <div className={`mt-2 pt-3 border-t flex flex-col gap-2 ${isDark ? 'border-[#253350]/60' : 'border-gray-100'}`}>
                          <p className={`text-[10px] font-semibold uppercase tracking-wider ${textSecondary}`}>PC Bookmarklet</p>
                          <a 
                            href={generateBookmarklet(consumer)}
                            title="Drag to your bookmarks bar"
                            onClick={(e) => {
                              e.preventDefault();
                              showToast('Drag this button to your browser bookmarks bar! Do not click it here.', 'info');
                            }}
                            className={`w-full flex items-center justify-center gap-2 rounded-lg h-9 text-xs font-semibold border border-dashed transition-all cursor-grab active:cursor-grabbing ${isDark ? 'bg-[#1c2a42] border-[#3b82f6]/50 text-[#3b82f6] hover:bg-[#3b82f6]/10' : 'bg-blue-50/50 border-blue-300 text-blue-600 hover:bg-blue-50'}`}
                          >
                            <Zap size={12} className={isDark ? "text-[#3b82f6]" : "text-blue-500"} />
                            Auto-Recharge {consumer.name.split(' ')[0]}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ════ HOME TAB SECTIONS ════ */}
        <div className={activeTab === 'meters' ? 'hidden' : ''}>

        {/* ── Saved Meters ──────────────────────────────────── */}
        <section id="meters-section" className="scroll-mt-20">
          <div className="flex items-center justify-between mb-4">
            <h2 className={`text-lg font-bold ${textPrimary}`}>{t.home.savedMeters}</h2>
            <div className="flex items-center gap-4">
              <button
                onClick={syncAllMeters}
                disabled={isSyncing || consumers.length === 0}
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-semibold rounded-full text-xs hover:bg-blue-100 disabled:opacity-50 transition-all"
              >
                <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
                {isSyncing ? 'Fetching...' : 'Fetch Balances'}
              </button>
              <button
                onClick={() => { setActiveTab('meters'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className="flex items-center gap-1 text-sm text-primary-600 font-semibold hover:underline"
            >
              {lang === 'en' ? 'View all' : 'सभी देखें'} <ArrowRight size={14}/>
            </button>
            </div>
          </div>

          {consumers.length === 0 ? (
            <div className={`rounded-2xl border p-6 text-center ${isDark ? 'bg-[#1c2a42] border-[#253350]' : 'bg-white border-gray-100 shadow-sm'}`}>
              <div className="w-14 h-14 bg-primary-50 dark:bg-primary-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Bolt size={24} className="text-primary-600 fill-primary-100" />
              </div>
              <h3 className={`font-bold text-base mb-1 ${textPrimary}`}>{t.home.noMeters}</h3>
              <p className={`text-sm mb-4 ${textSecondary}`}>{t.home.noMetersHint}</p>
              <button
                onClick={() => { resetForm(); setIsAddOpen(true); }}
                className="p-4 bg-green-500 text-white rounded-full shadow-lg shadow-green-500/30 active:scale-95 transition-all hover:bg-green-600"
                title={t.home.addMeter}
              >
                <Plus size={24} strokeWidth={3} />
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {consumers.map((consumer) => (
                <div key={consumer.id} className={`rounded-2xl border overflow-hidden shadow-sm hover:shadow-md transition-shadow ${isDark ? 'bg-[#1c2a42] border-[#253350]' : 'bg-white border-gray-100'}`}>
                  {/* Card top */}
                  <div className={`px-4 pt-4 pb-3 flex items-start justify-between border-b ${isDark ? 'border-[#253350]/60' : 'border-gray-50'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${getAvatarGradient(consumer.name)} flex items-center justify-center text-white font-bold text-lg shadow-md flex-shrink-0`}>
                        {consumer.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className={`font-bold text-base leading-tight capitalize ${textPrimary}`}>{consumer.name}</h3>
                        <p className={`text-xs font-medium mt-0.5 ${textSecondary}`}>CA: {consumer.caNumber}</p>
                        {consumer.mobileNumber && (
                          <p className={`text-xs mt-0.5 ${textSecondary}`}>📱 {consumer.mobileNumber}</p>
                        )}
                        {consumer.preferredAmount && (
                          <span className="inline-block mt-1 text-[10px] font-bold text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/30 border border-primary-100 dark:border-primary-800 rounded-full px-2 py-0.5">
                            Default: ₹{consumer.preferredAmount}
                          </span>
                        )}
                        {sessionBalances[consumer.id] && (
                          <div className="mt-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
                            Balance: <span className={sessionBalances[consumer.id].balance.includes('-') ? 'text-red-500' : 'text-green-500'}>{sessionBalances[consumer.id].balance}</span>
                            <span className="text-[10px] text-gray-400 font-normal ml-1">({sessionBalances[consumer.id].date})</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 3-dot menu */}
                    <div className="relative flex-shrink-0">
                      <button
                        onClick={() => setActionMenuId(actionMenuId === consumer.id ? null : consumer.id)}
                        className={`action-menu-button p-1.5 rounded-full transition-colors ${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-[#253350]' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                      >
                        <MoreVertical size={18} />
                      </button>
                      {actionMenuId === consumer.id && (
                        <div className={`action-menu-container absolute right-0 top-full mt-1 w-44 rounded-xl shadow-xl border py-1.5 z-30 ${isDark ? 'bg-[#1c2a42] border-[#253350]' : 'bg-white border-gray-100'}`}>
                          <button
                            onClick={() => { 
                              setEditingConsumer(consumer); 
                              setName(consumer.name);
                              setCaNumber(consumer.caNumber);
                              setMobile(consumer.mobileNumber || '');
                              setAmount(consumer.preferredAmount || '');
                              setGateway(consumer.preferredGateway || 'HDFC');
                              setIsAddOpen(true); 
                              setActionMenuId(null); 
                            }}
                            className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2.5 transition-colors ${isDark ? 'text-gray-200 hover:bg-[#253350]' : 'text-gray-700 hover:bg-gray-50'}`}
                          >
                            <Edit2 size={14} /> {t.delete.edit}
                          </button>
                          <button
                            onClick={() => handleDelete(consumer.id)}
                            className="w-full px-4 py-2 text-left text-sm flex items-center gap-2.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          >
                            <Trash2 size={14} /> {t.delete.delete}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="p-3 flex flex-col gap-2">
                    <button
                      onClick={() => handleRecharge(consumer)}
                        disabled={isRecharging}
                      className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl h-11 font-semibold text-sm shadow-md shadow-primary-500/25 active:scale-95 transition-all"
                    >
                      <Zap size={16} className="text-yellow-300 fill-yellow-300" />
                      {isRecharging ? (lang === 'en' ? 'Starting…' : 'शुरू हो रहा है…') : t.home.rechargeNow}
                    </button>
                    <button
                      onClick={() => handleCheckBalance(consumer)}
                      className={`w-full flex items-center justify-center gap-2 rounded-xl h-10 font-semibold text-sm border active:scale-95 transition-all ${isDark ? 'bg-[#1c2a42] border-[#253350] text-primary-400 hover:border-primary-500 hover:text-primary-300 hover:bg-[#253350]' : 'bg-primary-50 border-primary-200 text-primary-700 hover:border-primary-300 hover:text-primary-800 hover:bg-primary-100'}`}
                    >
                      <Search size={14} className="text-primary-500" />
                      {t.home.checkBalance}
                    </button>
                    {!isNative() && (
                      <div className={`mt-2 pt-3 border-t flex flex-col gap-2 ${isDark ? 'border-[#253350]/60' : 'border-gray-100'}`}>
                        <p className={`text-[10px] font-semibold uppercase tracking-wider ${textSecondary}`}>PC Bookmarklet</p>
                        <a 
                          href={generateBookmarklet(consumer)}
                          title="Drag to your bookmarks bar"
                          onClick={(e) => {
                            e.preventDefault();
                            showToast('Drag this button to your browser bookmarks bar! Do not click it here.', 'info');
                          }}
                          className={`w-full flex items-center justify-center gap-2 rounded-lg h-9 text-xs font-semibold border border-dashed transition-all cursor-grab active:cursor-grabbing ${isDark ? 'bg-[#1c2a42] border-[#3b82f6]/50 text-[#3b82f6] hover:bg-[#3b82f6]/10' : 'bg-blue-50/50 border-blue-300 text-blue-600 hover:bg-blue-50'}`}
                        >
                          <Zap size={12} className={isDark ? "text-[#3b82f6]" : "text-blue-500"} />
                          Auto-Recharge {consumer.name.split(' ')[0]}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              <button
                onClick={() => { resetForm(); setIsAddOpen(true); }}
                className={`hidden md:flex rounded-2xl border-2 border-dashed min-h-[160px] items-center justify-center transition-all ${isDark ? 'border-[#253350] bg-[#1c2a42]/50 hover:border-green-500 hover:bg-[#253350]/50' : 'border-gray-200 bg-gray-50/50 hover:border-green-500 hover:bg-green-50/50'}`}
                title={t.home.addMeter}
              >
                <div className="w-12 h-12 rounded-full bg-green-500 text-white flex items-center justify-center shadow-md">
                  <Plus size={24} strokeWidth={3} />
                </div>
              </button>
            </div>
          )}
        </section>

        {/* ── Quick Actions ──────────────────────────────────── */}
        <section>
          <h2 className={`text-lg font-bold mb-4 ${textPrimary}`}>{lang === 'en' ? 'Quick Actions' : 'त्वरित क्रियाएं'}</h2>
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            {quickActions.map((action, i) => (
              <button
                key={i}
                onClick={action.onClick}
                className={`rounded-2xl border p-4 flex flex-col items-center text-center gap-2 hover:shadow-lg active:scale-95 transition-all duration-150 cursor-pointer select-none ${isDark ? 'bg-[#1c2a42] border-[#253350] hover:border-primary-500/50 hover:bg-[#1e3050]' : 'bg-white border-gray-100 hover:border-primary-200 shadow-sm hover:shadow-primary-100'}`}
              >
                <div className={`w-11 h-11 rounded-xl ${action.color} flex items-center justify-center transition-transform duration-150 group-active:scale-90`}>
                  {action.icon}
                </div>
                <div>
                  <p className={`text-xs font-bold leading-tight ${textPrimary}`}>{action.label}</p>
                  <p className={`text-[10px] leading-tight mt-0.5 ${textSecondary}`}>{action.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────── */}
        <section>
          <h2 className={`text-lg font-bold mb-4 ${textPrimary}`}>{lang === 'en' ? 'How it works' : 'यह कैसे काम करता है'}</h2>
          <div className={`rounded-2xl border p-5 space-y-4 ${isDark ? 'bg-[#1c2a42] border-[#253350]' : 'bg-white border-gray-100 shadow-sm'}`}>
            {howItWorks.map((step, i) => (
              <div key={i}>
                <div className="flex items-start gap-4">
                  {/* Step icon + number */}
                  <div className="relative flex-shrink-0">
                    <div className={`w-12 h-12 rounded-xl ${step.bg} flex items-center justify-center`}>
                      {step.icon}
                    </div>
                    <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-primary-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-sm">
                      {step.num}
                    </span>
                  </div>
                  {/* Text */}
                  <div className="flex-1 pt-1">
                    <p className={`text-sm font-bold leading-tight ${textPrimary}`}>{step.title}</p>
                    <p className={`text-xs mt-1 leading-relaxed ${textSecondary}`}>{step.desc}</p>
                  </div>
                </div>
                {/* Connector line between steps */}
                {i < howItWorks.length - 1 && (
                  <div className="ml-6 mt-1 mb-1 w-px h-4 bg-gray-200 dark:bg-[#253350]" />
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ── Security Banner ───────────────────────────────── */}
        <section className={`rounded-2xl border p-5 flex items-center gap-4 ${isDark ? 'bg-[#162033] border-[#253350]' : 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-100'}`}>
          <div className="w-12 h-12 bg-primary-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary-500/30 flex-shrink-0">
            <Shield size={22} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`font-bold text-sm ${isDark ? 'text-primary-300' : 'text-primary-700'}`}>
              {t.home.securityTitle}
            </p>
            <p className={`text-xs mt-0.5 leading-relaxed ${textSecondary}`}>
              {t.home.securityDesc}
            </p>
          </div>
          <div className={`hidden sm:flex flex-col items-center gap-1 flex-shrink-0 ${isDark ? 'text-[#253350]' : 'text-blue-200'}`}>
            <div className="flex gap-1">
              {[...Array(3)].map((_,i) => <div key={i} className={`w-2 h-6 rounded-full ${isDark ? 'bg-[#253350]' : 'bg-blue-200'}`} style={{height: `${16+i*6}px`}} />)}
            </div>
          </div>
        </section>

        {/* Disclaimer */}
        <p className={`text-[10px] text-center leading-relaxed pb-2 ${textSecondary}`}>
          {t.home.disclaimer}
        </p>
        </div> {/* end home tab wrapper */}
      </main>

      {/* ════════════════════════════════════════════════════════
          DESKTOP FOOTER
      ════════════════════════════════════════════════════════ */}
      <footer className={`hidden md:block border-t py-5 ${isDark ? 'bg-[#0a1120] border-[#253350]' : 'bg-white border-gray-100'}`}>
        <div className="max-w-6xl mx-auto px-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AppLogo className="w-5 h-5 bg-primary-600 rounded-md" />
            <span className={`font-bold text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>{t.appName}</span>
          </div>
          <div className="flex items-center gap-6">
            <button onClick={() => window.scrollTo(0, 0)} className={`text-xs font-medium transition-colors ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}>{lang === 'en' ? 'Home' : 'होम'}</button>
            <button onClick={() => setIsHelpOpen(true)} className={`text-xs font-medium transition-colors ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}>{lang === 'en' ? 'Help' : 'सहायता'}</button>
            <button onClick={() => setIsAboutOpen(true)} className={`text-xs font-medium transition-colors ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}>{lang === 'en' ? 'Privacy' : 'गोपनीयता'}</button>
            <button onClick={() => setIsAboutOpen(true)} className={`text-xs font-medium transition-colors ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}>{lang === 'en' ? 'About' : 'के बारे में'}</button>
          </div>
          <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>© 2026 {t.appName}.</p>
        </div>
      </footer>

      {/* ════════════════════════════════════════════════════════
          MOBILE BOTTOM NAVIGATION
      ════════════════════════════════════════════════════════ */}
      <nav className={`md:hidden fixed bottom-0 left-0 right-0 z-40 border-t ${isDark ? 'bg-[#162033] border-[#253350]' : 'bg-white border-gray-100'} shadow-2xl`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex items-end justify-around px-2 pt-2 pb-2">
          {[
            { icon: <HomeIcon size={22} />, label: lang === 'en' ? 'Home' : 'होम', tab: 'home' as const },
            { icon: <List size={22} />, label: lang === 'en' ? 'Meters' : 'मीटर', tab: 'meters' as const },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => { setActiveTab(item.tab); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className={`flex flex-col items-center gap-1 px-4 py-1 rounded-2xl transition-all ${
                activeTab === item.tab ? 'text-primary-600 font-bold' : `${textSecondary} hover:text-primary-500`
              }`}
            >
              {item.icon}
              <span className="text-[11px] leading-none">{item.label}</span>
            </button>
          ))}

          {/* Floating Add Meter button — visible on Meters tab */}
          {activeTab === 'meters' && (
            <div className="relative -mt-8 flex justify-center">
              <button
                onClick={() => { resetForm(); setIsAddOpen(true); }}
                className="w-16 h-16 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/40 active:scale-90 transition-all border-[6px] border-white dark:border-[#162033] z-50"
                title={lang === 'en' ? 'Add Meter' : 'मीटर जोड़ें'}
              >
                <Plus size={26} strokeWidth={3} />
              </button>
            </div>
          )}
          {activeTab === 'home' && (
            <div className="relative -mt-8 flex justify-center">
              <button
                onClick={() => { resetForm(); setIsAddOpen(true); }}
                className="w-16 h-16 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center shadow-lg shadow-green-500/40 active:scale-90 transition-all border-[6px] border-white dark:border-[#162033] z-50"
                title={t.home.addMeter}
              >
                <Plus size={26} strokeWidth={3} />
              </button>
            </div>
          )}

          {[
            { icon: <HelpCircle size={22} />, label: lang === 'en' ? 'Help' : 'सहायता', onClick: () => setIsHelpOpen(true) },
            { icon: <Settings size={22} />, label: lang === 'en' ? 'Settings' : 'सेटिंग्स', onClick: () => setIsSettingsOpen(true) },
          ].map((item) => (
            <button
              key={item.label}
              onClick={item.onClick}
              className={`flex flex-col items-center gap-1 px-4 py-1 rounded-2xl transition-all ${textSecondary} hover:text-primary-500`}
            >
              {item.icon}
              <span className="text-[11px] leading-none font-medium">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>


      {/* ════════════════════════════════════════════════════════
          PAYMENT MODAL (web only — the gateway cannot be framed)
      ════════════════════════════════════════════════════════ */}
      <Modal
        isOpen={!!payment}
        onClose={() => {
          // Escape, the backdrop and the ✕ all arrive here, so one guard covers
          // every way out.
          //
          // Mid-payment this used to return silently, which read as the app
          // being frozen -- the user pressed Escape and nothing happened, with
          // no reason given. Ask instead, and be honest about what closing
          // does: the payment itself is on the gateway and carries on
          // regardless; what stops is this app watching it and refreshing the
          // balance afterwards.
          if (payment?.status === 'paying' || payment?.status === 'checking') {
            const proceed = window.confirm(
              lang === 'en'
                ? `A payment is still in progress.\n\nClosing this will not cancel it — if you have already paid, the payment still goes through. It only stops the app from tracking it and refreshing your balance.\n\nClose anyway?`
                : `भुगतान अभी चल रहा है।\n\nइसे बंद करने से भुगतान रद्द नहीं होगा — यदि आपने भुगतान कर दिया है तो वह पूरा होगा। बस ऐप उसे ट्रैक करना और बैलेंस अपडेट करना बंद कर देगा।\n\nफिर भी बंद करें?`
            );
            if (!proceed) return;
          }
          payWindowRef.current = null;
          setPayment(null);
        }}
        title={payment?.status === 'done' ? 'Payment Finished' : 'Recharge Payment'}
      >
        {payment && (
          <div className="space-y-4 text-center py-2">
            {(payment.status === 'starting' || payment.status === 'checking') && (
              <>
                <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto" />
                <p className="font-semibold text-gray-900 dark:text-white">
                  {payment.status === 'starting' ? 'Setting up your payment…' : 'Checking your new balance…'}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {payment.status === 'starting'
                    ? `₹${payment.amount} for ${payment.consumer.name}`
                    : 'One moment while we confirm with SBPDCL.'}
                </p>
              </>
            )}

            {payment.status === 'paying' && (
              <>
                <div className="w-14 h-14 bg-primary-50 rounded-full flex items-center justify-center mx-auto">
                  <CreditCard size={26} className="text-primary-600" />
                </div>
                <p className="font-semibold text-gray-900 dark:text-white">Complete your ₹{payment.amount} payment</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  The payment window is open. Banks don't allow their payment pages
                  to run inside another site, so it opens separately.
                </p>
                {/* SBPDCL's return endpoint (PGResponseService) answers with an empty
                    JSON body, so the payment window ends on a blank page whether the
                    payment succeeded or was cancelled. It is cross-origin, so this page
                    cannot detect that and close it — say so, and give a button that does. */}
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  When the bank finishes, that window ends on a blank white page —
                  that's normal. Come back here and tap below.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    // Closing triggers the existing outcome check, which decides
                    // success or failure from the balance rather than assuming.
                    try { payWindowRef.current?.close(); } catch { /* already gone */ }
                  }}
                  className="w-full py-2.5 bg-primary-600 text-white rounded-xl font-semibold text-sm"
                >
                  I've finished — check my balance
                </button>
                <button
                  type="button"
                  onClick={() => payWindowRef.current?.focus()}
                  className="w-full py-2 text-primary-600 font-semibold text-sm"
                >
                  Show payment window
                </button>
              </>
            )}

            {payment.status === 'blocked' && (
              <>
                <div className="w-14 h-14 bg-amber-50 dark:bg-amber-500/15 rounded-full flex items-center justify-center mx-auto">
                  <Shield size={26} className="text-amber-500" />
                </div>
                <p className="font-semibold text-gray-900 dark:text-white">Your browser blocked the payment window</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Allow popups for this site, or open it manually below.</p>
                <button
                  type="button"
                  onClick={() => {
                    const win = openPaymentWindow('');
                    if (win && payment.entry) enterGateway(win, payment.entry);
                    if (win) {
                      payWindowRef.current = win;
                      setPayment(p => (p ? { ...p, status: 'paying' } : p));
                    }
                  }}
                  className="w-full py-2.5 bg-primary-600 text-white rounded-xl font-semibold text-sm"
                >
                  Open payment window
                </button>
              </>
            )}

            {payment.status === 'done' && (
              <>
                {/* Only a changed balance proves the payment went through. A
                    cancelled payment also lands here, so nothing is called
                    successful without evidence. */}
                <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto ${payment.confirmed ? 'bg-green-50 dark:bg-green-500/15' : 'bg-amber-50 dark:bg-amber-500/15'}`}>
                  <Activity size={26} className={payment.confirmed ? 'text-green-600' : 'text-amber-500'} />
                </div>
                <p className="font-semibold text-gray-900 dark:text-white">
                  {payment.confirmed
                    ? `Recharge confirmed — balance is now ${payment.newBalance}`
                    : payment.newBalance
                      ? `Balance unchanged (${payment.newBalance})`
                      : 'Payment window closed'}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {payment.confirmed
                    ? 'Your meter has been credited.'
                    : payment.newBalance
                      ? 'If you completed the payment, it can take a few minutes to be credited. If you cancelled, nothing was charged.'
                      : 'We could not reach SBPDCL to confirm — check your balance again in a moment.'}
                </p>
              </>
            )}

            {payment.status === 'error' && (
              <>
                <div className="w-14 h-14 bg-red-50 dark:bg-red-500/15 rounded-full flex items-center justify-center mx-auto">
                  <Shield size={26} className="text-red-500" />
                </div>
                <p className="font-semibold text-gray-900 dark:text-white">Could not start the recharge</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{payment.error}</p>
              </>
            )}

            {payment.status !== 'paying' && payment.status !== 'checking' && (
              <Button variant="secondary" className="w-full" onClick={() => { payWindowRef.current = null; setPayment(null); }}>
                Close
              </Button>
            )}
          </div>
        )}
      </Modal>

      {/* ════════════════════════════════════════════════════════
          ADD / EDIT MODAL
      ════════════════════════════════════════════════════════ */}
      <Modal isOpen={isAddOpen} onClose={() => { setIsAddOpen(false); resetForm(); }} title={editingConsumer ? t.form.editTitle : t.form.addTitle}>
        <div className="flex flex-col gap-4">
          <div className={`flex items-center gap-3 p-3 rounded-xl border ${isDark ? 'bg-primary-900/30 border-primary-800' : 'bg-gradient-to-r from-primary-50 to-indigo-50 border-primary-100'}`}>
            <AppLogo className="w-9 h-9 bg-primary-600 rounded-xl flex-shrink-0" />
            <div>
              <p className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-primary-300' : 'text-primary-700'}`}>SBPDCL Portal</p>
              <p className={`text-xs leading-tight mt-0.5 ${textSecondary}`}>
                {lang === 'en' ? 'South Bihar Power Distribution Company' : 'दक्षिण बिहार विद्युत वितरण कंपनी'}
              </p>
            </div>
          </div>
          <TextField
            label={t.form.labelName}
            value={name}
            onChange={e => { setName(sanitizeText(e.target.value)); setFormErrors(prev => ({ ...prev, name: undefined })); }}
            placeholder={t.form.placeholderName}
            error={formErrors.name}
          />
          <TextField
            label={t.form.labelCA}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={caNumber}
            onChange={e => { setCaNumber(sanitizeNumber(e.target.value)); setFormErrors(prev => ({ ...prev, caNumber: undefined })); }}
            placeholder={t.form.placeholderCA}
            error={formErrors.caNumber}
          />
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label={t.form.labelMobile}
              type="tel"
              value={mobile}
              onChange={e => { setMobile(sanitizeNumber(e.target.value)); setFormErrors(prev => ({ ...prev, mobile: undefined })); }}
              placeholder={t.form.placeholderMobile}
              error={formErrors.mobile}
            />
            <TextField
              label={t.form.labelAmount}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={amount}
              onChange={e => { setAmount(sanitizeNumber(e.target.value)); setFormErrors(prev => ({ ...prev, amount: undefined })); }}
              placeholder={t.form.placeholderAmount}
              error={formErrors.amount}
            />
          </div>
          <Select label={t.form.labelGateway} value={gateway} onChange={e => setGateway(e.target.value)} options={[
            { value: 'Bank of Baroda', label: 'Bank of Baroda' },
            { value: 'Easebuzz', label: 'Easebuzz' },
            { value: 'HDFC', label: 'HDFC' },
          ]} />
          <div className="pt-1">
            <Button fullWidth onClick={handleSave}>
              {editingConsumer ? t.form.update : t.form.save}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Toast */}
      {toastMessage && (
        <div className={`fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 z-50 max-w-[90vw] ${toastType === 'error' ? 'bg-red-600' : 'bg-gray-900'} text-white`}>
          <span className="text-lg">{toastType === 'error' ? '⚠️' : '⚡'}</span>
          <p className="text-sm font-medium">{toastMessage}</p>
        </div>
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onOpenAbout={() => { setIsSettingsOpen(false); setIsAboutOpen(true); }}
      />

      {/* Help Modal */}
      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />

      {/* About + Privacy */}
      <AboutModal isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} lang={lang} />

      {/* Balance Modal */}
      <BalanceModal
        isOpen={isBalanceOpen}
        onClose={() => { setIsBalanceOpen(false); setBalanceDetails(null); setBalanceError(''); }}
        details={balanceDetails}
        isLoading={isBalanceLoading}
        mode={balanceModalMode}
        defaultAmount={activeConsumer?.preferredAmount || ''}
        caNumber={activeConsumer?.caNumber}
        error={balanceError}
        onRetry={activeConsumer ? () => fetchBalanceDetails(activeConsumer) : undefined}
        isCached={!!(balanceDetails && activeConsumer?.lastFetchedBalance && balanceDetails.availableBalance === activeConsumer.lastFetchedBalance)}
        onRecharge={(amount) => {
          setIsBalanceOpen(false);
          setBalanceDetails(null);
          if (activeConsumer) startSbpdclAutomation(activeConsumer, amount);
        }}
      />

    </div>

  );
}
