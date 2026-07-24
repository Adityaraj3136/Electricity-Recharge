import { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import type { BalanceDetails } from '../types';
import { User, Activity, Calendar, CreditCard, XCircle, CheckCircle, IndianRupee } from 'lucide-react';

interface BalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  details: BalanceDetails | null;
  isLoading: boolean;
  mode?: 'view' | 'recharge';
  defaultAmount?: string;
  onRecharge?: (amount: string) => void;
}

export function BalanceModal({ isOpen, onClose, details, isLoading, mode = 'view', defaultAmount = '', onRecharge }: BalanceModalProps) {
  const [payAmount, setPayAmount] = useState(defaultAmount);

  // Sync default amount when details load or defaultAmount changes
  useEffect(() => {
    if (isOpen) {
      if (defaultAmount) {
        setPayAmount(defaultAmount);
      } else if (details?.availableBalance) {
        // Extract numbers from "₹ 1,234.00"
        const amt = details.availableBalance.replace(/[^0-9.-]+/g, '');
        // If it's negative or zero, don't prefill with it
        if (parseFloat(amt) > 0) {
          setPayAmount(Math.round(parseFloat(amt)).toString());
        }
      }
    } else {
      setPayAmount('');
    }
  }, [isOpen, details, defaultAmount]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={mode === 'recharge' ? "Recharge Details" : "Balance Details"}>
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
          <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mb-4"></div>
          <p className="text-gray-700 font-medium text-lg mb-1">{mode === 'recharge' ? 'Fetching Details...' : 'Fetching Details...'}</p>
          <p className="text-gray-500 text-sm">Please wait while we securely connect to SBPDCL.</p>
        </div>
      ) : details ? (
        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4">
          
          {/* Header Card */}
          <div className="bg-gradient-to-br from-primary-50 to-primary-100 rounded-xl p-4 border border-primary-200 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-primary-200 rounded-full flex items-center justify-center text-primary-700">
                <User size={20} />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-lg leading-tight capitalize">{details.name}</h3>
                <p className="text-xs text-primary-600 font-mono font-medium">CA: {details.caNumber}</p>
              </div>
            </div>
            {(details.division || details.subDivision) && (
              <div className="mt-3 pt-3 border-t border-primary-200/50 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                {details.division && <span className="font-medium">Div: {details.division}</span>}
                {details.subDivision && <span className="font-medium">Sub: {details.subDivision}</span>}
              </div>
            )}
          </div>

          {/* Current Balance & Status */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-gray-500 text-xs mb-1 font-medium uppercase tracking-wider">
                <CreditCard size={14} /> Balance
              </div>
              <div className={`text-xl font-bold ${details.availableBalance.includes('-') ? 'text-red-600' : 'text-green-600'}`}>
                {details.availableBalance || '₹0.00'}
              </div>
            </div>

            <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-gray-500 text-xs mb-1 font-medium uppercase tracking-wider">
                <Activity size={14} /> Status
              </div>
              <div className="flex items-center gap-1.5 text-base font-bold">
                {details.currentStatus.toLowerCase() === 'connected' ? (
                  <><CheckCircle size={18} className="text-green-500" /> <span className="text-gray-900">Connected</span></>
                ) : (
                  <><XCircle size={18} className="text-red-500" /> <span className="text-red-600">{details.currentStatus}</span></>
                )}
              </div>
            </div>
          </div>

          {/* Last Recharge Info */}
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Calendar size={16} className="text-gray-400" /> 
                <span className="font-medium">Last Recharge</span>
              </div>
              <div className="text-right">
                <div className="font-bold text-gray-900">{details.lastRechargeAmount}</div>
                <div className="text-xs text-gray-500 mt-0.5">{details.lastRechargeDate}</div>
              </div>
            </div>
          </div>

          {/* Recharge Section */}
          {mode === 'recharge' && (
            <div className="bg-white border-2 border-primary-100 rounded-xl p-4 shadow-sm space-y-4">
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-2">
                  Amount to Pay
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <IndianRupee size={18} className="text-gray-400" />
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="block w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-lg font-bold text-gray-900 focus:bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all outline-none"
                    placeholder="Enter Amount"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="pt-2 flex gap-3">
            <Button className={mode === 'recharge' ? "flex-1" : "w-full"} onClick={onClose} variant="secondary">
              {mode === 'recharge' ? 'Cancel' : 'Close'}
            </Button>
            {mode === 'recharge' && (
              <Button 
                className="flex-[2]" 
                onClick={() => onRecharge?.(payAmount)} 
                disabled={!payAmount || parseInt(payAmount) <= 0}
              >
                Proceed to Pay
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-8">
          <p className="text-red-500 font-medium">Failed to load details.</p>
          <Button className="mt-4" onClick={onClose} variant="secondary">Close</Button>
        </div>
      )}
    </Modal>
  );
}

