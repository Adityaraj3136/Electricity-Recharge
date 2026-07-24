import { useState } from 'react';
import { useConsumers } from '../hooks/useConsumers';
import { Button } from '../components/Button';
import { FAB } from '../components/FAB';
import { TextField } from '../components/TextField';
import { Select } from '../components/Select';
import { Modal } from '../components/Modal';
import type { Consumer, BalanceDetails } from '../types';
import { Plus, Settings, Zap, MoreVertical, Edit2, Trash2, Search } from 'lucide-react';
import { SettingsModal } from '../components/SettingsModal';
import { BalanceModal } from '../components/BalanceModal';
import { automationScript } from '../automation/automation';

export function Home() {
  const { consumers, addConsumer, updateConsumer, deleteConsumer } = useConsumers();
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

  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Balance Check State
  const [isBalanceOpen, setIsBalanceOpen] = useState(false);
  const [isBalanceLoading, setIsBalanceLoading] = useState(false);
  const [balanceDetails, setBalanceDetails] = useState<BalanceDetails | null>(null);

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

  const openEdit = (consumer: Consumer) => {
    setEditingConsumer(consumer);
    setName(consumer.name);
    setCaNumber(consumer.caNumber);
    setMobile(consumer.mobileNumber || '');
    setAmount(consumer.preferredAmount || '');
    setGateway(consumer.preferredGateway || '');
    setActionMenuId(null);
    setIsAddOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm("Delete this consumer?")) {
      deleteConsumer(id);
    }
    setActionMenuId(null);
  };

  const handleRecharge = (consumer: Consumer) => {
    import('@capacitor/core').then(({ Capacitor }) => {
      if (Capacitor.isNativePlatform()) {
        setToastMessage(`Starting automated recharge for ${consumer.name}...`);
        setTimeout(() => setToastMessage(null), 3000);

        // Type safety workaround for cordova plugins
        const win = window as any;
        if (win.cordova && win.cordova.InAppBrowser) {
          const browser = win.cordova.InAppBrowser.open(
            'https://wss.sbpdcl.co.in/cportal/#/guest/secure/searchbill',
            '_blank',
            [
              'location=no',           // ← hides the URL bar completely
              'toolbar=yes',           // keep toolbar for close button
              'toolbarcolor=#3730a3',  // branded purple toolbar
              'closebuttoncaption=✕ Close',
              'closebuttoncolor=#ffffff',
              'navigationbuttoncolor=#ffffff',
              'hidenavigationbuttons=yes', // hide back/forward (prevent navigation)
              'hideurlbar=yes',        // extra safety for some Android builds
              'zoom=no',               // prevent zoom (layout inspection)
              'clearcache=yes',
              'clearsessioncache=yes',
              'hardwareback=yes',
              'allowInlineMediaPlayback=no',
            ].join(',')
          );
          
          browser.addEventListener('loadstop', () => {
            const script = `
              setTimeout(() => {
                const input = document.querySelector('input[formcontrolname="accno"]') || document.querySelector('input[id^="mat-input"]');
                if (input) {
                  input.value = '${consumer.caNumber}';
                  input.dispatchEvent(new Event('input', { bubbles: true }));
                  input.dispatchEvent(new Event('change', { bubbles: true }));
                  
                  setTimeout(() => {
                    const btn = document.querySelector('button[type="submit"]') || Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Search'));
                    if (btn) btn.click();
                  }, 800);
                }
              }, 1500);
            `;
            browser.executeScript({ code: script });
          });
        } else {
           // Fallback if plugin isn't ready
           window.open('https://wss.sbpdcl.co.in/cportal/#/guest/secure/searchbill', '_blank');
        }
      } else {
        // Web Flow: Open portal immediately & Copy CA Number
        window.open('https://wss.sbpdcl.co.in/cportal/#/guest/secure/searchbill', '_blank');
        
        navigator.clipboard.writeText(consumer.caNumber).then(() => {
          setToastMessage(`CA Number copied! Please paste it on the website.`);
          setTimeout(() => setToastMessage(null), 4000);
        }).catch(err => {
          console.error('Failed to copy', err);
          alert('Could not copy automatically. Your CA Number is: ' + consumer.caNumber);
        });
      }
    });
  };

  const handleCheckBalance = (consumer: Consumer) => {
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
                setToastMessage(`Error: ${data.error}`);
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
            setTimeout(() => {
               browser.executeScript({ code: runFetch });
            }, 500);
          });
        } else {
          setToastMessage('InAppBrowser plugin is not available.');
          setIsBalanceOpen(false);
        }
      } else {
        setToastMessage('Check Balance is only available in the mobile app.');
        setTimeout(() => setToastMessage(null), 3000);
      }
    });
  };
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#f8f9fa] pb-24 font-sans">
      {/* Header */}
      <header className="hero-mesh text-white pt-14 pb-8 px-6 rounded-b-[2.5rem] shadow-[0_10px_40px_rgba(124,58,237,0.2)] relative overflow-hidden">
        {/* Decorative background glow circles */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary-400/20 rounded-full blur-2xl -ml-12 -mb-12 pointer-events-none"></div>
        
        <div className="relative z-10 flex justify-between items-center mb-6">
          <div>
            <p className="text-primary-100 font-medium text-sm tracking-wide uppercase mb-1">{getGreeting()}</p>
            <h1 className="text-3xl font-bold tracking-tight">Family Recharge</h1>
          </div>
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-3 bg-white/10 backdrop-blur-md hover:bg-white/20 rounded-full transition-all active:scale-95"
          >
            <Settings size={22} className="text-white" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-5 pt-8 max-w-md mx-auto w-full relative z-10 -mt-6">
        <h2 className="text-lg font-bold text-gray-800 mb-5 px-2">Your Consumers</h2>
        
        {/* Removed copied UI block */}

        <div className="space-y-4">
          {consumers.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Zap className="text-primary-600" size={32} />
              </div>
              <p className="text-gray-500 font-medium mb-1">No consumers added yet</p>
              <p className="text-gray-400 text-sm">Tap the + button to add your family members.</p>
            </div>
          ) : (
            consumers.map(consumer => (
              <div key={consumer.id} className="glass-card relative group interactive-scale overflow-hidden">
                <div className="p-5 pb-4 flex items-center justify-between border-b border-gray-100/50">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full premium-gradient p-[2px]">
                      <div className="w-full h-full bg-white rounded-full flex items-center justify-center text-primary-600 font-bold text-lg">
                        {consumer.name.charAt(0).toUpperCase()}
                      </div>
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-[17px]">{consumer.name}</h3>
                      <p className="text-sm text-gray-500 font-mono mt-0.5 tracking-wide">CA: {consumer.caNumber}</p>
                    </div>
                  </div>
                  
                  <div className="relative">
                    <button 
                      onClick={() => setActionMenuId(actionMenuId === consumer.id ? null : consumer.id)}
                      className="p-2 text-gray-400 hover:text-primary-600 rounded-full hover:bg-primary-50 transition-colors active:scale-90"
                    >
                      <MoreVertical size={20} />
                    </button>
                    
                    {actionMenuId === consumer.id && (
                      <div className="absolute right-0 top-full mt-1 w-36 bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-white/50 py-2 z-20 animate-in fade-in zoom-in-95 origin-top-right">
                        <button 
                          onClick={() => openEdit(consumer)}
                          className="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-primary-600 flex items-center gap-3 transition-colors"
                        >
                          <Edit2 size={16} /> Edit
                        </button>
                        <button 
                          onClick={() => handleDelete(consumer.id)}
                          className="w-full text-left px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors"
                        >
                          <Trash2 size={16} /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="px-5 py-4 flex flex-col gap-3 bg-gradient-to-b from-transparent to-white/40">
                  <Button 
                    fullWidth 
                    onClick={() => handleRecharge(consumer)}
                    className="gap-2 shadow-primary-500/20"
                  >
                    <Zap size={18} className="text-yellow-300 fill-yellow-300" />
                    Recharge Now
                  </Button>
                  <Button 
                    fullWidth 
                    variant="secondary"
                    onClick={() => handleCheckBalance(consumer)}
                    className="gap-2 font-medium"
                  >
                    <Search size={18} className="text-primary-500" />
                    Check Balance
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {/* Add Button */}
      <FAB 
        icon={<Plus size={24} />} 
        onClick={() => {
          resetForm();
          setIsAddOpen(true);
        }} 
      />

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title={editingConsumer ? "Edit Consumer" : "Add Consumer"}
      >
        <div className="space-y-4">
          <TextField 
            label="Name (e.g. Home, Shop, Parents)" 
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Home"
          />
          <TextField 
            label="CA Number" 
            type="number"
            value={caNumber}
            onChange={e => setCaNumber(e.target.value)}
            placeholder="23330014306"
          />
          <TextField 
            label="Default Mobile Number (Optional)" 
            type="tel"
            value={mobile}
            onChange={e => setMobile(e.target.value)}
            placeholder="9999999999"
          />
          <TextField 
            label="Default Amount (Optional)" 
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="1000"
          />
          <Select 
            label="Preferred Gateway (Optional)"
            value={gateway}
            onChange={e => setGateway(e.target.value)}
            options={[
              { value: 'Bank of Baroda', label: 'Bank of Baroda' },
              { value: 'Easebuzz', label: 'Easebuzz' },
              { value: 'HDFC', label: 'HDFC' }
            ]}
          />
          <div className="pt-4">
            <Button fullWidth onClick={handleSave} disabled={!name || !caNumber}>
              {editingConsumer ? "Save Changes" : "Add Consumer"}
            </Button>
          </div>
        </div>
      </Modal>
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 z-50 animate-in fade-in slide-in-from-bottom-5">
          <Zap size={20} className="text-yellow-400" />
          <p className="text-sm font-medium">{toastMessage}</p>
        </div>
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Balance Details Modal */}
      <BalanceModal
        isOpen={isBalanceOpen}
        onClose={() => {
          setIsBalanceOpen(false);
          setBalanceDetails(null);
        }}
        details={balanceDetails}
        isLoading={isBalanceLoading}
      />
    </div>
  );
}
