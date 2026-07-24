
import { Modal } from './Modal';
import { Check, Loader2, XCircle } from 'lucide-react';
import type { AutomationStep, AutomationProgress } from '../types';

interface RechargeProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  progress: AutomationProgress;
}

const ALL_STEPS: AutomationStep[] = [
  'Opening website',
  'Filling CA Number',
  'Searching',
  'Loading consumer',
  'Filling mobile',
  'Selecting amount',
  'Selecting gateway',
  'Opening payment',
  'Done'
];

export function RechargeProgressModal({ isOpen, onClose, progress }: RechargeProgressModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Recharge Progress">
      <div className="space-y-4 pt-2">
        {ALL_STEPS.map((step) => {
          const isCompleted = progress.completedSteps.includes(step) || 
            ALL_STEPS.indexOf(step) < ALL_STEPS.indexOf(progress.currentStep);
          const isCurrent = progress.currentStep === step && !progress.error;
          const isError = progress.currentStep === step && progress.error;

          return (
            <div key={step} className="flex items-center gap-3">
              <div className="w-6 h-6 flex items-center justify-center shrink-0">
                {isCompleted ? (
                  <Check size={20} className="text-green-500" />
                ) : isCurrent ? (
                  <Loader2 size={20} className="text-blue-500 animate-spin" />
                ) : isError ? (
                  <XCircle size={20} className="text-red-500" />
                ) : (
                  <div className="w-2 h-2 rounded-full bg-gray-200" />
                )}
              </div>
              <span className={`text-sm font-medium ${
                isCompleted ? 'text-green-700' : 
                isCurrent ? 'text-blue-700' : 
                isError ? 'text-red-700' : 
                'text-gray-400'
              }`}>
                {step}
              </span>
            </div>
          );
        })}

        {progress.error && (
          <div className="mt-6 p-4 bg-red-50 border border-red-100 rounded-xl">
            <h4 className="text-red-800 font-semibold mb-1">Automation Error</h4>
            <p className="text-red-600 text-sm">{progress.error}</p>
            <p className="text-gray-500 text-xs mt-2">
              You can complete the payment manually in the opened tab.
            </p>
          </div>
        )}
        
        {progress.currentStep === 'Done' && (
          <div className="mt-6 p-4 bg-green-50 border border-green-100 rounded-xl">
            <h4 className="text-green-800 font-semibold mb-1">Ready for Payment</h4>
            <p className="text-green-600 text-sm">
              Please switch to the opened SBPDCL tab to securely enter your payment details.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
