import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      // Small delay to allow mount before triggering animation
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      document.body.style.overflow = 'hidden';
    } else {
      setVisible(false);
      document.body.style.overflow = 'unset';
      // Unmount after animation completes
      const timer = setTimeout(() => setMounted(false), 350);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    return () => { document.body.style.overflow = 'unset'; };
  }, []);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="fixed inset-x-0 bottom-0 z-50 sm:relative sm:max-w-md w-full transition-all duration-350"
        style={{
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          opacity: visible ? 1 : 0,
        }}
      >
        <div className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          <div className="px-6 py-5 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center sticky top-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md z-10">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white font-sans">{title}</h2>
            <button
              onClick={onClose}
              className="p-2 -mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 bg-gray-50 hover:bg-gray-100 dark:bg-[#1c2a42] dark:hover:bg-slate-700 rounded-full transition-all active:scale-90 duration-150"
            >
              <X size={20} />
            </button>
          </div>
          <div className="p-6 overflow-y-auto">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

