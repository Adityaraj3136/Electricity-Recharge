import { useRef, useEffect, useState } from 'react';
import type { Consumer, AutomationProgress, AutomationStep } from '../types';
import { automationScript } from '../automation/automation';
import { X, ChevronDown, CheckCircle, Loader2, XCircle, Circle, Copy, Check } from 'lucide-react';

const SBPDCL_URL = 'https://wss.sbpdcl.co.in/cportal/#/guest/secure/searchbill';

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

interface EmbeddedBrowserProps {
  consumer: Consumer;
  onClose: () => void;
}

export function EmbeddedBrowser({ consumer, onClose }: EmbeddedBrowserProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [scriptCopied, setScriptCopied] = useState(false);
  const [progress, setProgress] = useState<AutomationProgress>({
    currentStep: 'Opening website',
    completedSteps: []
  });

  const config = {
    caNumber: consumer.caNumber,
    mobileNumber: consumer.mobileNumber,
    amount: consumer.preferredAmount,
    gateway: consumer.preferredGateway
  };

  const fullScript = automationScript + `\nstartSbpdclAutomation(${JSON.stringify(config)});`;

  // Listen for messages from the iframe (postMessage from automation script)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SBPDCL_PROGRESS') {
        setProgress(p => ({
          currentStep: event.data.step,
          completedSteps: p.currentStep && !p.completedSteps.includes(p.currentStep)
            ? [...p.completedSteps, p.currentStep]
            : p.completedSteps,
          error: undefined
        }));
      } else if (event.data?.type === 'SBPDCL_ERROR') {
        setProgress(p => ({ ...p, error: event.data.error }));
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Try to inject automation script once iframe loads
  const handleIframeLoad = () => {
    setIsLoaded(true);
    setProgress({ currentStep: 'Filling CA Number', completedSteps: ['Opening website'] });

    try {
      const iframe = iframeRef.current;
      if (!iframe) return;

      // Try cross-origin script injection via contentWindow.eval
      // This will throw a SecurityError if site blocks it (SOP)
      const win = iframe.contentWindow as any;
      if (win) {
        win.eval(fullScript);
      }
    } catch {
      // Cross-origin blocked - show manual fallback
      setIframeBlocked(true);
    }
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(fullScript).then(() => {
      setScriptCopied(true);
      setTimeout(() => setScriptCopied(false), 3000);
    });
  };

  const getStepIcon = (step: AutomationStep) => {
    const stepIndex = ALL_STEPS.indexOf(step);
    const currentIndex = ALL_STEPS.indexOf(progress.currentStep);
    const isCompleted = stepIndex < currentIndex || progress.completedSteps.includes(step);
    const isCurrent = step === progress.currentStep && !progress.error;
    const hasError = step === progress.currentStep && !!progress.error;

    if (isCompleted) return <CheckCircle size={16} className="text-green-500 shrink-0" />;
    if (isCurrent) return <Loader2 size={16} className="text-blue-500 animate-spin shrink-0" />;
    if (hasError) return <XCircle size={16} className="text-red-500 shrink-0" />;
    return <Circle size={16} className="text-gray-300 shrink-0" />;
  };

  const getStepColor = (step: AutomationStep) => {
    const stepIndex = ALL_STEPS.indexOf(step);
    const currentIndex = ALL_STEPS.indexOf(progress.currentStep);
    const isCompleted = stepIndex < currentIndex || progress.completedSteps.includes(step);
    const isCurrent = step === progress.currentStep && !progress.error;
    const hasError = step === progress.currentStep && !!progress.error;

    if (isCompleted) return 'text-green-700';
    if (isCurrent) return 'text-blue-700 font-semibold';
    if (hasError) return 'text-red-700';
    return 'text-gray-400';
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900">
      {/* Top Bar */}
      <div className="flex items-center gap-3 px-4 py-3 bg-indigo-700 text-white shrink-0">
        <button
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-indigo-600 transition-colors"
        >
          <X size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{consumer.name} — Recharge</p>
          <p className="text-indigo-200 text-xs truncate">SBPDCL Portal</p>
        </div>
        <button
          onClick={() => setPanelOpen(v => !v)}
          className="flex items-center gap-1 text-xs bg-indigo-600 px-3 py-1.5 rounded-full hover:bg-indigo-500 transition-colors"
        >
          Steps <ChevronDown size={14} className={`transition-transform ${panelOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Progress Panel (collapsible) */}
      {panelOpen && (
        <div className="bg-white border-b border-gray-200 px-4 py-3 shrink-0">
          {iframeBlocked ? (
            // Fallback UI if iframe injection is blocked
            <div>
              <p className="text-xs font-semibold text-amber-700 mb-2">
                ⚠️ Auto-fill blocked by browser security. Copy the script and paste it in the browser console:
              </p>
              <button
                onClick={handleCopyScript}
                className="w-full flex items-center justify-center gap-2 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                {scriptCopied ? <><Check size={16} /> Copied!</> : <><Copy size={16} /> Copy Automation Script</>}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-x-4 gap-y-1.5">
              {ALL_STEPS.map(step => (
                <div key={step} className="flex items-center gap-1.5">
                  {getStepIcon(step)}
                  <span className={`text-xs truncate ${getStepColor(step)}`}>{step}</span>
                </div>
              ))}
            </div>
          )}
          {progress.error && (
            <div className="mt-2 p-2 bg-red-50 rounded-lg text-xs text-red-700">
              <strong>Error:</strong> {progress.error}
            </div>
          )}
          {progress.currentStep === 'Done' && (
            <div className="mt-2 p-2 bg-green-50 rounded-lg text-xs text-green-700 font-medium">
              ✅ Ready for payment! Complete payment below.
            </div>
          )}
        </div>
      )}

      {/* Iframe */}
      <div className="flex-1 relative">
        {!isLoaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 z-10">
            <Loader2 size={32} className="text-indigo-500 animate-spin mb-3" />
            <p className="text-gray-600 text-sm font-medium">Loading SBPDCL Portal…</p>
            <p className="text-gray-400 text-xs mt-1">CA: {consumer.caNumber}</p>
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={SBPDCL_URL}
          className="w-full h-full border-none"
          title="SBPDCL Recharge Portal"
          onLoad={handleIframeLoad}
          onError={() => setIframeBlocked(true)}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation"
        />
      </div>
    </div>
  );
}
