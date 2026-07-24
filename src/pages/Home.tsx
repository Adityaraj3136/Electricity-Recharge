import { useState } from 'react';
import { useConsumers } from '../hooks/useConsumers';
import { useLang } from '../hooks/useLang';
import { Button } from '../components/Button';
import { FAB } from '../components/FAB';
import { TextField } from '../components/TextField';
import { Select } from '../components/Select';
import { Modal } from '../components/Modal';
import type { Consumer, BalanceDetails } from '../types';
import { Plus, Settings, Zap, MoreVertical, Edit2, Trash2, Search, Wifi, Bolt, ChevronRight, Globe } from 'lucide-react';
import { SettingsModal } from '../components/SettingsModal';
import { BalanceModal } from '../components/BalanceModal';
import { automationScript } from '../automation/automation';
import { Network } from '@capacitor/network';

export function Home() {
  const { consumers, addConsumer, updateConsumer, deleteConsumer } = useConsumers();
  const { lang, t, toggleLang } = useLang();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingConsumer, setEditingConsumer] = useState<Consumer | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [caNumber, setCaNumber] = useState('');
  const [mobile, setMobile] = useState('');
  const [amount, setAmount] = useState('');
  const [gateway, setGateway] = useState('');

  // Action Menu State
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);

  // Toast State
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Balance Check State
  const [isBalanceOpen, setIsBalanceOpen] = useState(false);
  const [isBalanceLoading, setIsBalanceLoading] = useState(false);
  const [balanceDetails, setBalanceDetails] = useState<BalanceDetails | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t.greeting.morning;
    if (hour < 18) return t.greeting.afternoon;
    return t.greeting.evening;
  };

  const resetForm = () => {
    setName('');
    setCaNumber('');
    setMobile('');
    setAmount('');
    setGateway('');
    setEditingConsumer(null);
  };

  const handleSave = () => {
    if (!name || !caNumber) return;
    const consumerData = {
      name,
      caNumber,
      mobileNumber: mobile,
      preferredAmount: amount,
      preferredGateway: gateway as any,
    };
    if (editingConsumer) {
      updateConsumer(editingConsumer.id, consumerData);
    } else {
      addConsumer(consumerData);
    }
    setIsAddOpen(false);
    resetForm();
  };


  const handleDelete = (id: string) => {
    if (window.confirm(t.delete.confirm)) {
      deleteConsumer(id);
    }
    setActionMenuId(null);
  };

  const handleRecharge = async (consumer: Consumer) => {
    const status = await Network.getStatus();
    if (!status.connected) {
      showToast(t.toast.offline, 'error');
      return;
    }

    import('@capacitor/core').then(({ Capacitor }) => {
      if (Capacitor.isNativePlatform()) {
        showToast(`${t.toast.rechargeStart} ${consumer.name}...`);
        const win = window as any;
        if (win.cordova && win.cordova.InAppBrowser) {
          const browser = win.cordova.InAppBrowser.open(
            'https://wss.sbpdcl.co.in/cportal/#/guest/secure/searchbill',
            '_blank',
            [
              'location=no',
              'toolbar=yes',
              'toolbarcolor=#7c3aed',
              'closebuttoncaption=✕ Close',
              'closebuttoncolor=#ffffff',
              'hidenavigationbuttons=yes',
              'hideurlbar=yes',
              'zoom=no',
              'clearcache=yes',
              'clearsessioncache=yes',
              'hardwareback=yes',
            ].join(',')
          );
          browser.addEventListener('loadstop', () => {
            browser.executeScript({ code: automationScript });
            const runAuto = `
              setTimeout(() => {
                if (typeof window.runSbpdclAutomation === 'function') {
                  window.runSbpdclAutomation('${consumer.caNumber}', '${consumer.mobileNumber || ''}', '${consumer.preferredAmount || ''}');
                }
              }, 1500);
            `;
            setTimeout(() => browser.executeScript({ code: runAuto }), 500);
          });
        } else {
          window.open('https://wss.sbpdcl.co.in/cportal/#/guest/secure/searchbill', '_blank');
        }
      } else {
        window.open('https://wss.sbpdcl.co.in/cportal/#/guest/secure/searchbill', '_blank');
        navigator.clipboard.writeText(consumer.caNumber).then(() => {
          showToast(t.toast.copyCA);
        }).catch(() => {
          alert('CA Number: ' + consumer.caNumber);
        });
      }
    });
  };

  const handleCheckBalance = async (consumer: Consumer) => {
    const status = await Network.getStatus();
    if (!status.connected) {
      showToast(t.toast.offline, 'error');
      return;
    }

    import('@capacitor/core').then(({ Capacitor }) => {
      if (Capacitor.isNativePlatform()) {
        setIsBalanceOpen(true);
        setIsBalanceLoading(true);
        setBalanceDetails(null);
        const win = window as any;
        if (win.cordova && win.cordova.InAppBrowser) {
          const browser = win.cordova.InAppBrowser.open(
            'https://wss.sbpdcl.co.in/cportal/#/guest/secure/searchbill',
            '_blank',
            'hidden=yes,location=no,clearcache=yes,clearsessioncache=yes'
          );
          const messageListener = (event: any) => {
            try {
              const data = JSON.parse(event.data);
              if (data.type === 'BALANCE_DETAILS') {
                setBalanceDetails(data.details);
                setIsBalanceLoading(false);
                browser.close();
              } else if (data.type === 'BALANCE_ERROR') {
                showToast(`Error: ${data.error}`, 'error');
                setIsBalanceOpen(false);
                browser.close();
              }
            } catch (e) {}
          };
          browser.addEventListener('message', messageListener);
          browser.addEventListener('loadstop', () => {
            browser.executeScript({ code: automationScript });
            const runFetch = `
              setTimeout(() => {
                if (typeof window.fetchSbpdclBalance === 'function') {
                  window.fetchSbpdclBalance('${consumer.caNumber}');
                }
              }, 1500);
            `;
            setTimeout(() => browser.executeScript({ code: runFetch }), 500);
          });
        } else {
          showToast(t.toast.browserError, 'error');
          setIsBalanceOpen(false);
        }
      } else {
        showToast(t.toast.balanceOnly, 'error');
      }
    });
  };

  // Avatar background colors based on first letter
  const avatarColors = [
    'from-violet-500 to-purple-700',
    'from-indigo-500 to-blue-700',
    'from-rose-500 to-pink-700',
    'from-amber-500 to-orange-600',
    'from-teal-500 to-cyan-600',
    'from-emerald-500 to-green-700',
  ];
  const getAvatarColor = (name: string) => {
    const i = name.charCodeAt(0) % avatarColors.length;
    return avatarColors[i];
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 font-sans">

      {/* ─── HERO HEADER ─── */}
      <header className="relative overflow-hidden hero-mesh text-white pt-safe">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-10 -right-10 w-56 h-56 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute top-8 right-16 w-20 h-20 rounded-full bg-purple-300/20 blur-2xl" />
          <div className="absolute -bottom-8 -left-8 w-40 h-40 rounded-full bg-indigo-400/20 blur-2xl" />
        </div>

        <div className="relative z-10 px-5 pt-12 pb-6 max-w-lg mx-auto w-full">
          {/* Top bar */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              {/* Logo pill */}
              <div className="flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-2xl px-3 py-1.5">
                <Bolt size={18} className="text-yellow-300 fill-yellow-300" />
                <span className="text-white font-bold text-base tracking-tight">{t.appName}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Language toggle */}
              <button
                onClick={toggleLang}
                className="flex items-center gap-1.5 bg-white/15 backdrop-blur-sm hover:bg-white/25 rounded-full px-3 py-1.5 transition-all active:scale-95"
                aria-label="Toggle language"
              >
                <Globe size={14} className="text-white/80" />
                <span className="text-white text-xs font-semibold tracking-wider uppercase">
                  {lang === 'en' ? 'हिंदी' : 'EN'}
                </span>
              </button>
              {/* Settings */}
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="p-2.5 bg-white/15 backdrop-blur-sm hover:bg-white/25 rounded-full transition-all active:scale-95"
              >
                <Settings size={18} className="text-white" />
              </button>
            </div>
          </div>

          {/* Greeting */}
          <div className="mb-6">
            <p className="text-purple-200 text-sm font-medium tracking-widest uppercase">{getGreeting()}</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mt-0.5 leading-tight">
              {t.appTagline}
            </h1>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: <Bolt size={16} className="text-yellow-300 fill-yellow-300" />, label: lang === 'en' ? 'Instant' : 'तुरंत', value: lang === 'en' ? 'Recharge' : 'रिचार्ज' },
              { icon: <Wifi size={16} className="text-cyan-300" />, label: lang === 'en' ? '100%' : '१००%', value: lang === 'en' ? 'Secure' : 'सुरक्षित' },
              { icon: <Search size={16} className="text-green-300" />, label: lang === 'en' ? 'Live' : 'लाइव', value: lang === 'en' ? 'Balance' : 'बैलेंस' },
            ].map((stat, i) => (
              <div key={i} className="bg-white/10 backdrop-blur-sm rounded-2xl px-3 py-2.5 flex flex-col items-center text-center gap-1">
                {stat.icon}
                <span className="text-white font-bold text-sm leading-none">{stat.label}</span>
                <span className="text-purple-200 text-xs leading-none">{stat.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Curved bottom edge */}
        <div className="h-6 bg-slate-50 rounded-t-[2rem] -mb-px relative z-10" />
      </header>

      {/* ─── MAIN CONTENT ─── */}
      <main className="flex-1 px-4 sm:px-5 pt-2 pb-28 max-w-lg mx-auto w-full">

        {/* How it works — only when no consumers */}
        {consumers.length === 0 && (
          <section className="mb-6">
            <h2 className="text-base font-bold text-gray-700 mb-3">{t.home.statsTitle}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { num: '1', title: t.home.step1Title, desc: t.home.step1Desc, color: 'bg-violet-50 border-violet-100' },
                { num: '2', title: t.home.step2Title, desc: t.home.step2Desc, color: 'bg-indigo-50 border-indigo-100' },
                { num: '3', title: t.home.step3Title, desc: t.home.step3Desc, color: 'bg-emerald-50 border-emerald-100' },
              ].map((step) => (
                <div key={step.num} className={`rounded-2xl border p-4 ${step.color}`}>
                  <div className="w-7 h-7 premium-gradient rounded-full flex items-center justify-center text-white font-bold text-sm mb-2">
                    {step.num}
                  </div>
                  <h3 className="font-semibold text-gray-900 text-sm mb-1">{step.title}</h3>
                  <p className="text-gray-500 text-xs leading-relaxed">{step.desc}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Saved Meters Section */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-gray-800">{t.home.savedMeters}</h2>
            <span className="text-xs text-gray-400 font-medium bg-gray-100 rounded-full px-2.5 py-1">
              {consumers.length} {lang === 'en' ? 'saved' : 'सहेजे'}
            </span>
          </div>

          {consumers.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-xl p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary-50 dark:bg-primary-900/20 rounded-bl-full -z-10" />
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t.home.noMeters}</h2>
              <p className="text-gray-500 dark:text-gray-400 leading-relaxed text-sm">
                {t.home.noMetersHint}
              </p>
              <button
                onClick={() => { resetForm(); setIsAddOpen(true); }}
                className="mt-5 inline-flex items-center gap-2 premium-gradient text-white rounded-full px-5 py-2.5 font-semibold text-sm shadow-lg shadow-primary-500/30 active:scale-95 transition-all"
              >
                <Plus size={18} />
                {t.home.addMeter}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {consumers.map((consumer) => (
                <div key={consumer.id} className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden group relative">
                  {/* Card header */}
                  <div className="p-4 sm:p-5 pb-3 sm:pb-4 flex items-center justify-between border-b border-gray-100 dark:border-slate-700/50">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Avatar */}
                      <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl ${getAvatarColor(consumer.name)} flex items-center justify-center text-white font-bold text-xl flex-shrink-0 shadow-md`}>
                        {consumer.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-gray-900 dark:text-white text-base sm:text-[17px] truncate">{consumer.name}</h3>
                        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-mono tracking-wide">CA: {consumer.caNumber}</p>
                        {consumer.mobileNumber && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">📱 {consumer.mobileNumber}</p>
                        )}
                      </div>
                    </div>

                    {/* Amount badge + menu */}
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      {consumer.preferredAmount && (
                        <span className="hidden sm:block text-xs font-bold text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/30 border border-primary-100 dark:border-primary-800 rounded-full px-2.5 py-1">
                          ₹{consumer.preferredAmount}
                        </span>
                      )}
                      <div className="relative">
                        <button
                          onClick={() => setActionMenuId(actionMenuId === consumer.id ? null : consumer.id)}
                          className="p-2 -mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                        >
                          <MoreVertical size={20} />
                        </button>
                        {actionMenuId === consumer.id && (
                          <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-100 dark:border-slate-700 py-2 z-20 animate-in fade-in zoom-in duration-200">
                            <button
                              onClick={() => {
                                setEditingConsumer(consumer);
                                setIsAddOpen(true);
                                setActionMenuId(null);
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-3 transition-colors"
                            >
                              <Edit2 size={15} /> {t.delete.edit}
                            </button>
                            <button
                              onClick={() => handleDelete(consumer.id)}
                              className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3 transition-colors"
                            >
                              <Trash2 size={15} /> {t.delete.delete}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Mobile amount badge */}
                  {consumer.preferredAmount && (
                    <div className="sm:hidden px-4 pb-1">
                      <span className="text-xs font-bold text-primary-700 bg-primary-50 border border-primary-100 rounded-full px-2.5 py-0.5">
                        Default: ₹{consumer.preferredAmount}
                      </span>
                    </div>
                  )}

                  {/* Divider */}
                  <div className="mx-4 h-px bg-gradient-to-r from-transparent via-gray-200 dark:via-slate-700 to-transparent" />

                  {/* Action buttons */}
                  <div className="p-3 sm:p-4 grid grid-cols-2 gap-2.5">
                    <button
                      onClick={() => handleRecharge(consumer)}
                      className="flex items-center justify-center gap-2 premium-gradient text-white rounded-xl h-11 sm:h-12 font-semibold text-sm shadow-md shadow-primary-500/25 hover:brightness-110 active:scale-95 transition-all"
                    >
                      <Zap size={16} className="text-yellow-300 fill-yellow-300" />
                      {t.home.rechargeNow}
                    </button>
                    <button
                      onClick={() => handleCheckBalance(consumer)}
                      className="flex items-center justify-center gap-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-200 rounded-xl h-11 sm:h-12 font-semibold text-sm hover:border-primary-300 dark:hover:border-primary-500 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-slate-700 active:scale-95 transition-all"
                    >
                      <Search size={15} className="text-primary-500" />
                      {t.home.checkBalance}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* How it works — when there ARE consumers, shown at bottom */}
        {consumers.length > 0 && (
          <section className="mt-6 mb-2">
            <div className="glass-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300">{t.home.statsTitle}</h2>
                <ChevronRight size={16} className="text-gray-400" />
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { icon: '⚡', label: t.home.step1Title },
                  { icon: '🤖', label: t.home.step2Title },
                  { icon: '📱', label: t.home.step3Title },
                ].map((step, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <span className="text-xl">{step.icon}</span>
                    <span className="text-xs text-gray-600 dark:text-gray-400 font-medium leading-tight">{step.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
        {/* Disclaimer */}
        <div className="mt-8 mb-6 px-2">
          <p className="text-[11px] text-gray-400 text-center leading-relaxed font-medium">
            {t.home.disclaimer}
          </p>
        </div>
      </main>

      {/* ─── FAB ─── */}
      <FAB
        icon={<Plus size={24} />}
        onClick={() => { resetForm(); setIsAddOpen(true); }}
      />

      {/* ─── ADD / EDIT MODAL ─── */}
      <Modal
        isOpen={isAddOpen}
        onClose={() => { setIsAddOpen(false); resetForm(); }}
        title={editingConsumer ? t.form.editTitle : t.form.addTitle}
      >
        <div className="flex flex-col gap-4">
          {/* Form intro */}
          <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-primary-50 to-indigo-50 rounded-xl border border-primary-100">
            <div className="w-9 h-9 premium-gradient rounded-xl flex items-center justify-center flex-shrink-0">
              <Bolt size={18} className="text-yellow-300 fill-yellow-300" />
            </div>
            <div>
              <p className="text-xs font-semibold text-primary-700 uppercase tracking-wide">SBPDCL Portal</p>
              <p className="text-xs text-gray-500 leading-tight mt-0.5">
                {lang === 'en'
                  ? 'South Bihar Power Distribution Company'
                  : 'दक्षिण बिहार विद्युत वितरण कंपनी'}
              </p>
            </div>
          </div>

          <TextField
            label={t.form.labelName}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t.form.placeholderName}
          />
          <TextField
            label={t.form.labelCA}
            type="number"
            value={caNumber}
            onChange={e => setCaNumber(e.target.value)}
            placeholder={t.form.placeholderCA}
          />

          {/* 2-col for mobile/amount */}
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label={t.form.labelMobile}
              type="tel"
              value={mobile}
              onChange={e => setMobile(e.target.value)}
              placeholder={t.form.placeholderMobile}
            />
            <TextField
              label={t.form.labelAmount}
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder={t.form.placeholderAmount}
            />
          </div>

          <Select
            label={t.form.labelGateway}
            value={gateway}
            onChange={e => setGateway(e.target.value)}
            options={[
              { value: 'Bank of Baroda', label: 'Bank of Baroda' },
              { value: 'Easebuzz', label: 'Easebuzz' },
              { value: 'HDFC', label: 'HDFC' },
            ]}
          />

          <div className="pt-2">
            <Button fullWidth onClick={handleSave} disabled={!name || !caNumber}>
              {editingConsumer ? t.form.update : t.form.save}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ─── TOAST ─── */}
      {toastMessage && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 z-50 animate-in fade-in slide-in-from-bottom-5 max-w-[90vw] ${
          toastType === 'error'
            ? 'bg-red-600 text-white'
            : 'bg-gray-900 text-white'
        }`}>
          <span className="text-lg">{toastType === 'error' ? '⚠️' : '⚡'}</span>
          <p className="text-sm font-medium">{toastMessage}</p>
        </div>
      )}

      {/* ─── SETTINGS MODAL ─── */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* ─── BALANCE MODAL ─── */}
      <BalanceModal
        isOpen={isBalanceOpen}
        onClose={() => { setIsBalanceOpen(false); setBalanceDetails(null); }}
        details={balanceDetails}
        isLoading={isBalanceLoading}
      />
    </div>
  );
}
