import { useState } from 'react';
import { useConsumers } from '../hooks/useConsumers';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { FAB } from '../components/FAB';
import { TextField } from '../components/TextField';
import { Select } from '../components/Select';
import { Modal } from '../components/Modal';
import type { Consumer } from '../types';
import { Plus, Settings, Zap, MoreVertical, Edit2, Trash2 } from 'lucide-react';
// Removed unused automationScript import
import { SettingsModal } from '../components/SettingsModal';

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

  // Progress Modal State (removed, now handled by EmbeddedBrowser)
  // const [isProgressOpen, setIsProgressOpen] = useState(false);
  // const [progress, setProgress] = useState<AutomationProgress>({
  //   currentStep: 'Opening website',
  //   completedSteps: []
  // });


  // Removed message listener – progress now handled inside EmbeddedBrowser

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

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <header className="bg-primary-600 text-white pt-12 pb-6 px-6 rounded-b-3xl shadow-md">
        <div className="flex justify-between items-center mb-2">
          <h1 className="text-2xl font-bold tracking-tight">SBPDCL</h1>
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 hover:bg-primary-700 rounded-full transition-colors"
          >
            <Settings size={24} />
          </button>
        </div>
        <p className="text-primary-100 font-medium">Family Recharge</p>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-4 pt-6 max-w-md mx-auto w-full">
        <h2 className="text-lg font-semibold text-gray-800 mb-4 px-2">Select Consumer</h2>
        
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
              <Card key={consumer.id} className="relative group">
                <div className="p-5 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-primary-50 rounded-full flex items-center justify-center text-primary-600 font-bold text-lg">
                      {consumer.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{consumer.name}</h3>
                      <p className="text-sm text-gray-500 font-mono mt-0.5">CA: {consumer.caNumber}</p>
                    </div>
                  </div>
                  
                  <div className="relative">
                    <button 
                      onClick={() => setActionMenuId(actionMenuId === consumer.id ? null : consumer.id)}
                      className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
                    >
                      <MoreVertical size={20} />
                    </button>
                    
                    {actionMenuId === consumer.id && (
                      <div className="absolute right-0 top-full mt-1 w-32 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-10 animate-in fade-in zoom-in-95">
                        <button 
                          onClick={() => openEdit(consumer)}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                        >
                          <Edit2 size={14} /> Edit
                        </button>
                        <button 
                          onClick={() => handleDelete(consumer.id)}
                          className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="px-5 pb-5 pt-2">
                  <Button 
                    fullWidth 
                    onClick={() => handleRecharge(consumer)}
                    className="gap-2"
                  >
                    <Zap size={18} />
                    Recharge Now
                  </Button>
                </div>
              </Card>
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

// Removed Progress Modal – EmbeddedBrowser shows its own progress UI

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
    </div>
  );
}
