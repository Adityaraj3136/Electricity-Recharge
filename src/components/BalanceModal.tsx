import { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import type { BalanceDetails } from '../types';
import { User, Activity, Calendar, CreditCard, XCircle, CheckCircle, IndianRupee, ExternalLink, Clock, RefreshCw } from 'lucide-react';

interface BalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  details: BalanceDetails | null;
  isLoading: boolean;
  mode?: 'view' | 'recharge';
  defaultAmount?: string;
  onRecharge?: (amount: string) => void;
  /** When true, data is from local cache (PWA mode) — show a "cached" notice */
  isCached?: boolean;
  /** CA number used to build the portal deep-link */
  caNumber?: string;
  /** Why the fetch failed, shown verbatim so the user knows what went wrong. */
  error?: string;
  /** Re-runs the fetch without making the user close and reopen the modal. */
  onRetry?: () => void;
}

export function BalanceModal({
  isOpen, onClose, details, isLoading,
  mode = 'view', defaultAmount = '', onRecharge,
  isCached = false, error = '', onRetry
}: BalanceModalProps) {
  const [payAmount, setPayAmount] = useState('');
  const [amountError, setAmountError] = useState('');

  // Reset field when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setPayAmount(defaultAmount || '');
      setAmountError('');
    } else {
      setPayAmount('');
      setAmountError('');
    }
  }, [isOpen, details, defaultAmount]);

  const handleAmountChange = (val: string) => {
    const digits = val.replace(/[^0-9]/g, '');
    setPayAmount(digits);
    if (!digits) {
      setAmountError('Please enter an amount');
    } else if (parseInt(digits) < 100) {
      setAmountError('Minimum recharge amount is ₹100');
    } else {
      setAmountError('');
    }
  };

  const isAmountValid = !!payAmount && parseInt(payAmount) >= 100;

  const portalUrl = `https://wss.sbpdcl.co.in/cportal/#/guest/secure/searchbill`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={mode === 'recharge' ? 'Recharge Details' : 'Balance Details'}>
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
          <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mb-4"></div>
          <p className="text-gray-700 font-medium text-lg mb-1">Fetching Details...</p>
          <p className="text-gray-500 text-sm">Please wait while we securely connect to SBPDCL.</p>
        </div>
      ) : details ? (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">

          {/* ── Cached-data notice (PWA only) ── */}
          {isCached && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-amber-700 text-xs font-medium">
              <Clock size={13} className="flex-shrink-0" />
              Last saved balance — may not reflect latest recharge
            </div>
          )}

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
              {/* An empty balance means the meter has not reported, which is not
                  the same as a balance of zero — showing ₹0.00 there would read
                  as an empty meter and prompt a needless recharge. Overdrawn
                  meters report negatives, hence the leading "-" check. */}
              <div className={`text-xl font-bold ${
                !details.availableBalance ? 'text-gray-400 text-base'
                  : details.availableBalance.startsWith('-') ? 'text-red-600'
                  : 'text-green-600'
              }`}>
                {details.availableBalance || 'Not reported yet'}
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
          {details.lastRechargeDate !== 'N/A' && (
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
          )}

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
                    onChange={(e) => handleAmountChange(e.target.value)}
                    className={`block w-full pl-10 pr-4 py-3 bg-gray-50 border rounded-xl text-lg font-bold text-gray-900 focus:bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all outline-none ${
                      amountError ? 'border-red-400 focus:ring-red-400 focus:border-red-400' : 'border-gray-200'
                    }`}
                    placeholder="Enter amount (min ₹100)"
                  />
                </div>
                {amountError && (
                  <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                    <span>⚠️</span> {amountError}
                  </p>
                )}
                {!amountError && payAmount && (
                  <p className="text-xs text-green-600 mt-1.5">✓ Amount looks good</p>
                )}
              </div>
            </div>
          )}

          <div className="pt-2 flex gap-3">
            <Button className={mode === 'recharge' ? 'flex-1' : 'w-full'} onClick={onClose} variant="secondary">
              {mode === 'recharge' ? 'Cancel' : 'Close'}
            </Button>
            {mode === 'recharge' && (
              <Button
                className="flex-[2]"
                onClick={() => onRecharge?.(payAmount)}
                disabled={!isAmountValid}
              >
                Proceed to Pay
              </Button>
            )}
          </div>
        </div>
      ) : (
        /* Balance unavailable — fetch failed and nothing was saved earlier.
           The specific reason is shown rather than a generic line: "the meter
           has not reported yet" and "SBPDCL took too long to respond" call for
           different reactions, and a bare blank panel reads as a broken app. */
        <div className="text-center py-8 px-4">
          <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock size={26} className="text-amber-500" />
          </div>
          <p className="font-semibold text-gray-900 mb-1">Balance unavailable</p>
          <p className="text-gray-600 text-sm mb-1.5">
            {error || 'Could not reach SBPDCL just now.'}
          </p>
          <p className="text-gray-500 text-sm mb-5">
            Please try again in a few minutes, or check the portal directly.
          </p>
          {onRetry && (
            <Button onClick={onRetry} className="w-full mb-3">
              <RefreshCw size={15} /> Try Again
            </Button>
          )}
          <a
            href={portalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-xl font-semibold text-sm shadow-lg shadow-primary-500/30"
          >
            Check on SBPDCL Portal <ExternalLink size={14} />
          </a>
          <div className="mt-4">
            <Button onClick={onClose} variant="secondary" className="w-full">Close</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
