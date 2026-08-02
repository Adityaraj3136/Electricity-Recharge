import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export function Modal({ isOpen, onClose, title, children, maxWidth = 'sm:max-w-md' }: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      // Small delay to allow mount before triggering animation
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      document.body.style.overflow = 'hidden';
      document.body.setAttribute('data-modal-count', String((parseInt(document.body.getAttribute('data-modal-count') || '0', 10)) + 1));
    } else {
      setVisible(false);
      const count = parseInt(document.body.getAttribute('data-modal-count') || '1', 10) - 1;
      document.body.setAttribute('data-modal-count', String(count));
      if (count <= 0) {
        document.body.style.overflow = 'unset';
      }
      // Unmount after animation completes
      const timer = setTimeout(() => setMounted(false), 350);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  /**
   * Escape closes the modal.
   *
   * Bound only while open, and it calls the same onClose the ✕ button does --
   * which matters for the payment modal, whose onClose deliberately refuses to
   * close mid-payment. Escape must not be a way around that guard.
   *
   * keydown on document rather than on the panel: the panel does not hold focus
   * until something inside it is focused, so a listener there would miss the
   * key right after opening.
   */
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    return () => { 
      const count = parseInt(document.body.getAttribute('data-modal-count') || '1', 10) - 1;
      document.body.setAttribute('data-modal-count', String(Math.max(0, count)));
      if (count <= 0) {
        document.body.style.overflow = 'unset';
      }
    };
  }, []);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="modal-backdrop fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 sm:relative ${maxWidth} w-full transition-all duration-350`}
        style={{
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          opacity: visible ? 1 : 0,
        }}
      >
        <div role="dialog" aria-modal="true" className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          <div className="px-6 py-5 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center sticky top-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md z-10">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white font-sans">{title}</h2>
            <button
              onClick={onClose}
              className="p-2 -mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 bg-gray-50 hover:bg-gray-100 dark:bg-[#1c2a42] dark:hover:bg-slate-700 rounded-full transition-all active:scale-90 duration-150"
            >
              <X size={20} />
            </button>
          </div>
          {/* overflow-y-auto stays: no-scrollbar only hides the bar, it does
              not change how the panel scrolls. */}
          <div className="p-6 overflow-y-auto no-scrollbar">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

