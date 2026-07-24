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
  HelpCircle, User, Shield, ArrowRight, BookOpen, CreditCard, Hexagon, Activity,
  RefreshCw
} from 'lucide-react';
import { SettingsModal } from '../components/SettingsModal';
import { BalanceModal } from '../components/BalanceModal';
import { HelpModal } from '../components/HelpModal';
import { automationScript } from '../automation/automation';
import { Network } from '@capacitor/network';
import { sanitizeText, sanitizeNumber } from '../utils/sanitize';
import { usePullToRefresh } from '../hooks/usePullToRefresh';

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



// ─── Component ─────────────────────────────────────────────────────────────
export function Home() {
  const { consumers, addConsumer, updateConsumer, deleteConsumer, refresh: refreshConsumers } = useConsumers();
  const { lang, t, toggleLang } = useLang();
  const { settings, updateSettings } = useSettings();

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
  const [isBalanceOpen, setIsBalanceOpen] = useState(false);
  const [isBalanceLoading, setIsBalanceLoading] = useState(false);
  const [balanceDetails, setBalanceDetails] = useState<BalanceDetails | null>(null);
  const [balanceModalMode, setBalanceModalMode] = useState<'view' | 'recharge'>('view');
  const [activeConsumer, setActiveConsumer] = useState<Consumer | null>(null);
  const [activeTab, setActiveTab] = useState<'home' | 'meters'>('home');
  const [iframeConsumer, setIframeConsumer] = useState<Consumer | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Per-field form errors
  const [formErrors, setFormErrors] = useState<{ name?: string; caNumber?: string; mobile?: string }>({});

  // Pull-to-refresh — only active on home tab, not during automation or payment
  const isAutomating = !!iframeConsumer;
  const { isPulling, isRefreshing, pullProgress, handleTouchStart, handleTouchMove, handleTouchEnd } = usePullToRefresh({
    enabled: activeTab === 'home' && !isAutomating && !isBalanceLoading,
    onRefresh: useCallback(async () => {
      refreshConsumers();
      await new Promise(r => setTimeout(r, 600));
    }, [refreshConsumers]),
  });

  // Inject automation into desktop iframe when consumer is set
  useEffect(() => {
    if (!iframeConsumer) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    let injected = false;
    const handleLoad = () => {
      if (injected) return;
      setTimeout(() => {
        try {
          const iframeWin = iframe.contentWindow as any;
          if (!iframeWin) return;
          injected = true;
          const scriptEl = iframeWin.document.createElement('script');
          const rawScript = automationScript
            .replace('export const automationScript = `', '')
            .replace(/`;\s*$/, '');
          scriptEl.textContent = rawScript;
          iframeWin.document.head.appendChild(scriptEl);
          setTimeout(() => {
            if (typeof iframeWin.startSbpdclAutomation === 'function') {
              iframeWin.startSbpdclAutomation({
                caNumber: iframeConsumer.caNumber,
                mobileNumber: iframeConsumer.mobileNumber || '',
                amount: iframeConsumer.preferredAmount || '',
                gateway: iframeConsumer.preferredGateway || ''
              });
            }
          }, 1500);
        } catch (e) {
          // Cross-origin block in standard desktop browsers. 
          // We cannot inject scripts into a cross-origin iframe.
          // Fall back to keeping the iframe open and copying CA to clipboard.
          navigator.clipboard.writeText(iframeConsumer.caNumber)
            .then(() => showToast('CA Number copied! Desktop browsers block auto-fill for security. Please paste manually.', 'success'))
            .catch(() => showToast('Desktop browsers block auto-fill for security. Please enter manually.', 'error'));
        }
      }, 3000);
    };
    iframe.addEventListener('load', handleLoad);
    return () => iframe.removeEventListener('load', handleLoad);
  }, [iframeConsumer]);


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
      const balStr = (details.availableBalance || '').replace(/[^0-9.]/g, '');
      const bal = parseFloat(balStr);
      if (isNaN(bal) || bal >= 100) return; // Balance is fine

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
    const errors: { name?: string; caNumber?: string; mobile?: string } = {};
    if (!name.trim()) errors.name = lang === 'en' ? 'Location name is required' : 'स्थान का नाम आवश्यक है';
    if (!caNumber.trim()) errors.caNumber = lang === 'en' ? 'CA Number is required' : 'CA नंबर आवश्यक है';
    if (!mobile.trim()) errors.mobile = lang === 'en' ? 'Mobile number is required for recharge' : 'रिचार्ज के लिए मोबाइल नंबर आवश्यक है';
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});
    const data = { name: sanitizeText(name), caNumber: sanitizeNumber(caNumber), mobileNumber: sanitizeNumber(mobile), preferredAmount: sanitizeNumber(amount), preferredGateway: gateway as any };
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
    
    // Fallback to desktop iframe if not native
    import('@capacitor/core').then(({ Capacitor }) => {
      if (!Capacitor.isNativePlatform()) {
        const tempConsumer = { ...consumer, preferredAmount: finalAmount };
        setIframeConsumer(tempConsumer);
        return;
      }

      showToast(`${t.toast.rechargeStart} ${consumer.name}...`);
      const win = window as any;
      if (win.cordova?.InAppBrowser) {
        const browser = win.cordova.InAppBrowser.open(
          'https://wss.sbpdcl.co.in/cportal/#/guest/secure/searchbill', '_blank',
          ['location=no','toolbar=yes','toolbarcolor=#2563eb','closebuttoncaption=✕ Close',
           'closebuttoncolor=#ffffff','hidenavigationbuttons=yes','hideurlbar=yes',
           'zoom=no','clearcache=yes','clearsessioncache=yes','hardwareback=yes','beforeload=yes'].join(',')
        );
        
        browser.addEventListener('message', (event: any) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'CLOSE_BROWSER') {
              browser.close();
            }
          } catch (e) {}
        });

        browser.addEventListener('beforeload', (event: any, callback: any) => {
          const url = event.url || '';
          
          // Intercept app://home URL from the FAB button
          if (url.startsWith('app://home') || url.startsWith('app%3A//home')) {
            browser.close();
            return;
          }

          const isUpiIntent = url.startsWith('upi://') || url.startsWith('intent://') || 
                              url.startsWith('paytmmp://') || url.startsWith('phonepe://') || 
                              url.startsWith('tez://') || url.startsWith('gpay://');
          if (isUpiIntent) {
            browser.close();
            win.cordova.InAppBrowser.open(url, '_system');
          } else if (callback) {
            callback(url);
          }
        });

        let scriptInjected = false;
        browser.addEventListener('loadstop', () => {
          // Inject persistent floating Home FAB on every page load
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
                'touch-action:manipulation'
              ].join(';');
              fab.addEventListener('touchend', function(e) {
                e.preventDefault();
                window.location.href = 'app://home';
              }, { passive: false });
              fab.addEventListener('click', function(e) {
                e.preventDefault();
                window.location.href = 'app://home';
              });
              document.body.appendChild(fab);
            })();
          `});

          if (scriptInjected) return;
          scriptInjected = true;
          browser.executeScript({ code: automationScript });
          setTimeout(() => browser.executeScript({ code: `setTimeout(()=>{ if(typeof window.startSbpdclAutomation==='function') window.startSbpdclAutomation({caNumber: '${consumer.caNumber}', mobileNumber: '${consumer.mobileNumber || ''}', amount: '${finalAmount}', gateway: '${consumer.preferredGateway || ''}'}); },1500);` }), 500);
        });
      } else { window.open('https://wss.sbpdcl.co.in/cportal/#/guest/secure/searchbill', '_blank'); }
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
    import('@capacitor/core').then(({ Capacitor }) => {
      if (Capacitor.isNativePlatform()) {
        setIsBalanceOpen(true); setIsBalanceLoading(true); setBalanceDetails(null);
        const win = window as any;
        if (win.cordova?.InAppBrowser) {
          const browser = win.cordova.InAppBrowser.open(
            'https://wss.sbpdcl.co.in/cportal/#/guest/secure/searchbill',
            '_blank',
            'hidden=yes,location=no,clearcache=yes,clearsessioncache=yes'
          );

          let pollInterval: any;
          let done = false;

          const finish = (success: boolean, details?: any, errMsg?: string) => {
            if (done) return;
            done = true;
            if (pollInterval) clearInterval(pollInterval);
            browser.close();
            if (success) {
              setBalanceDetails(details);
              setIsBalanceLoading(false);
            } else {
              showToast(`Error: ${errMsg}`, 'error');
              setIsBalanceOpen(false);
              setIsBalanceLoading(false);
            }
          };

          // Listen for postMessage from automation script
          browser.addEventListener('message', (event: any) => {
            try {
              const data = JSON.parse(event.data);
              if (data.type === 'BALANCE_DETAILS') {
                finish(true, data.details);
                checkAndNotifyLowBalance(data.details, consumer.name);
              }
              else if (data.type === 'BALANCE_ERROR') finish(false, null, data.error);
              else if (data.type === 'CLOSE_BROWSER') finish(false, null, 'Closed');
            } catch (e) {}
          });

          let lastInjectedUrl = '';
          browser.addEventListener('loadstop', (event: any) => {
            const url = (event.url || '') as string;
            // Deduplicate: don't inject twice for the same URL
            if (url === lastInjectedUrl) return;
            // Only inject on the SBPDCL website (not on payment gateway pages)
            if (!url.includes('sbpdcl.co.in') && !url.includes('cportal')) return;
            lastInjectedUrl = url;

            // Wait 3s for Angular to fully render the search form before injecting
            setTimeout(() => {
              if (done) return;
              browser.executeScript({ code: automationScript });
              setTimeout(() => {
                if (done) return;
                browser.executeScript({
                  code: `(function(){
                    if(typeof window.fetchSbpdclBalance==='function'){
                      window.fetchSbpdclBalance('${consumer.caNumber}');
                    } else {
                      window.__balanceError = 'Script not loaded';
                    }
                  })();`
                });

                // Polling fallback every 2s
                if (pollInterval) clearInterval(pollInterval);
                pollInterval = setInterval(() => {
                  if (done) return;
                  browser.executeScript(
                    { code: `JSON.stringify({ result: window.__balanceResult || null, error: window.__balanceError || null })` },
                    (res: any) => {
                      if (done) return;
                      try {
                        const data = JSON.parse(res?.[0] || '{}');
                        if (data.result) {
                          finish(true, data.result);
                          checkAndNotifyLowBalance(data.result, consumer.name);
                        }
                        else if (data.error) finish(false, null, data.error);
                      } catch (e) {}
                    }
                  );
                }, 2000);
              }, 1500);
            }, 3000);
          });

          browser.addEventListener('exit', () => {
            if (pollInterval) clearInterval(pollInterval);
            if (!done) { done = true; setIsBalanceLoading(false); setIsBalanceOpen(false); }
          });
      } else { showToast(t.toast.browserError, 'error'); setIsBalanceOpen(false); }
      } else { showToast(t.toast.balanceOnly, 'error'); }
    });
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
            { label: lang === 'en' ? 'Home' : 'होम', active: true, onClick: () => {} },
            { label: lang === 'en' ? 'Help' : 'सहायता', active: false, onClick: () => setIsHelpOpen(true) },
            { label: lang === 'en' ? 'About' : 'के बारे में', active: false, onClick: () => showToast(lang === 'en' ? 'Coming soon!' : 'जल्द आ रहा है!', 'success') },
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
      <section className={`relative overflow-hidden ${isDark ? 'bg-[#0e1726]' : 'bg-gradient-to-br from-[#e8f0fe] via-[#f0f5ff] to-[#e8f0fe]'} ${activeTab === 'meters' ? 'hidden md:block' : ''}`}>
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

        {/* ════ METERS TAB VIEW (mobile only) ════ */}
        {activeTab === 'meters' && (
          <section className="md:hidden">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className={`text-xl font-bold ${textPrimary}`}>{lang === 'en' ? 'My Meters' : 'मेरे मीटर'}</h2>
                <p className={`text-xs mt-0.5 ${textSecondary}`}>
                  {consumers.length} {lang === 'en' ? `meter${consumers.length !== 1 ? 's' : ''} saved` : 'मीटर सेव'}
                </p>
              </div>
              <button
                onClick={() => { resetForm(); setIsAddOpen(true); }}
                className="p-2 bg-green-500 text-white rounded-full shadow-md shadow-green-500/25 active:scale-95 transition-all hover:bg-green-600"
                title={t.home.addMeter}
              >
                <Plus size={18} strokeWidth={3} />
              </button>
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
                        </div>
                      </div>
                      {/* 3-dot menu */}
                      <div className="relative flex-shrink-0">
                        <button
                          onClick={() => setActionMenuId(actionMenuId === consumer.id ? null : consumer.id)}
                          className={`p-2 rounded-full transition-colors ${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-[#253350]' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                        >
                          <MoreVertical size={18} />
                        </button>
                        {actionMenuId === consumer.id && (
                          <div className={`absolute right-0 top-full mt-1 w-44 rounded-xl shadow-xl border py-1.5 z-30 ${isDark ? 'bg-[#1c2a42] border-[#253350]' : 'bg-white border-gray-100'}`}>
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
                        className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl h-11 font-semibold text-sm shadow-md shadow-primary-500/25 active:scale-95 transition-all"
                      >
                        <Zap size={16} className="text-yellow-300 fill-yellow-300" />
                        {t.home.rechargeNow}
                      </button>
                      <button
                        onClick={() => handleCheckBalance(consumer)}
                        className={`w-full flex items-center justify-center gap-2 rounded-xl h-10 font-semibold text-sm border active:scale-95 transition-all ${isDark ? 'bg-[#1c2a42] border-[#253350] text-primary-400 hover:border-primary-500 hover:text-primary-300 hover:bg-[#253350]' : 'bg-primary-50 border-primary-200 text-primary-700 hover:border-primary-300 hover:text-primary-800 hover:bg-primary-100'}`}
                      >
                        <Search size={14} className="text-primary-500" />
                        {t.home.checkBalance}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ════ HOME TAB SECTIONS (always on desktop, conditional on mobile) ════ */}
        <div className={activeTab === 'meters' ? 'hidden md:block' : ''}>

        {/* ── Saved Meters ──────────────────────────────────── */}
        <section id="meters-section">
          <div className="flex items-center justify-between mb-4">
            <h2 className={`text-lg font-bold ${textPrimary}`}>{t.home.savedMeters}</h2>
            <button
              onClick={() => { setActiveTab('meters'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className="flex items-center gap-1 text-sm text-primary-600 font-semibold hover:underline"
            >
              {lang === 'en' ? 'View all' : 'सभी देखें'} <ArrowRight size={14}/>
            </button>
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
                      </div>
                    </div>

                    {/* 3-dot menu */}
                    <div className="relative flex-shrink-0">
                      <button
                        onClick={() => setActionMenuId(actionMenuId === consumer.id ? null : consumer.id)}
                        className={`p-1.5 rounded-full transition-colors ${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-[#253350]' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                      >
                        <MoreVertical size={18} />
                      </button>
                      {actionMenuId === consumer.id && (
                        <div className={`absolute right-0 top-full mt-1 w-44 rounded-xl shadow-xl border py-1.5 z-30 ${isDark ? 'bg-[#1c2a42] border-[#253350]' : 'bg-white border-gray-100'}`}>
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
                      className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl h-11 font-semibold text-sm shadow-md shadow-primary-500/25 active:scale-95 transition-all"
                    >
                      <Zap size={16} className="text-yellow-300 fill-yellow-300" />
                      {t.home.rechargeNow}
                    </button>
                    <button
                      onClick={() => handleCheckBalance(consumer)}
                      className={`w-full flex items-center justify-center gap-2 rounded-xl h-10 font-semibold text-sm border active:scale-95 transition-all ${isDark ? 'bg-[#1c2a42] border-[#253350] text-primary-400 hover:border-primary-500 hover:text-primary-300 hover:bg-[#253350]' : 'bg-primary-50 border-primary-200 text-primary-700 hover:border-primary-300 hover:text-primary-800 hover:bg-primary-100'}`}
                    >
                      <Search size={14} className="text-primary-500" />
                      {t.home.checkBalance}
                    </button>
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
            <button onClick={() => showToast(lang === 'en' ? 'Coming soon!' : 'जल्द आ रहा है!')} className={`text-xs font-medium transition-colors ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}>{lang === 'en' ? 'Privacy' : 'गोपनीयता'}</button>
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
            { icon: <User size={22} />, label: lang === 'en' ? 'Profile' : 'प्रोफ़ाइल', onClick: () => setIsSettingsOpen(true) },
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
              onChange={e => setAmount(sanitizeNumber(e.target.value))}
              placeholder={t.form.placeholderAmount}
            />
          </div>
          <Select label={t.form.labelGateway} value={gateway} onChange={e => setGateway(e.target.value)} options={[
            { value: 'Bank of Baroda', label: 'Bank of Baroda' },
            { value: 'Federal Bank', label: 'Federal Bank' },
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
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      {/* Help Modal */}
      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />

      {/* Balance Modal */}
      <BalanceModal
        isOpen={isBalanceOpen}
        onClose={() => { setIsBalanceOpen(false); setBalanceDetails(null); }}
        details={balanceDetails}
        isLoading={isBalanceLoading}
        mode={balanceModalMode}
        defaultAmount={activeConsumer?.preferredAmount || ''}
        onRecharge={(amount) => {
          setIsBalanceOpen(false);
          setBalanceDetails(null);
          if (activeConsumer) startSbpdclAutomation(activeConsumer, amount);
        }}
      />

      {/* ════ DESKTOP IFRAME MODAL ════ */}
      {iframeConsumer && (
        <div className="fixed inset-0 z-[9999] flex flex-col bg-black/70 backdrop-blur-sm" style={{ animation: 'fadeIn 0.2s ease' }}>
          {/* Top bar */}
          <div className="flex items-center justify-between px-4 py-3 bg-[#1e293b] border-b border-[#334155] flex-shrink-0">
            <div className="flex items-center gap-3">
              <AppLogo className="w-7 h-7 bg-primary-600 rounded-lg flex-shrink-0" />
              <div>
                <p className="text-white font-semibold text-sm leading-tight">
                  <span className="capitalize">{iframeConsumer.name}</span> — Recharge
                </p>
                <p className="text-slate-400 text-xs font-mono">CA: {iframeConsumer.caNumber}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-900/40 border border-emerald-700/40 px-3 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block"></span>
                Automation running
              </span>
              <button
                onClick={() => setIframeConsumer(null)}
                className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded-lg transition-colors"
              >
                ✕ Close
              </button>
            </div>
          </div>

          {/* Info banner */}
          <div className="bg-primary-900/60 border-b border-primary-700/40 px-4 py-2 flex items-center gap-2 text-xs text-primary-200 flex-shrink-0">
            <Zap size={12} className="text-yellow-400 flex-shrink-0" />
            Automation will fill your CA number, select gateway <strong className="text-white">{iframeConsumer.preferredGateway || 'auto'}</strong>, enter amount <strong className="text-white">{iframeConsumer.preferredAmount ? `₹${iframeConsumer.preferredAmount}` : '(manual)'}</strong>, and open UPI payment.
          </div>

          {/* iFrame */}
          <iframe
            ref={iframeRef}
            key={iframeConsumer.id}
            src="https://wss.sbpdcl.co.in/cportal/#/guest/secure/searchbill"
            className="flex-1 w-full border-0 bg-white"
            title="SBPDCL Payment Portal"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation"
          />
        </div>
      )}
    </div>

  );
}
