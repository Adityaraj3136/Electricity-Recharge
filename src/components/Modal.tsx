import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="modal-backdrop fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose} />
      
      <div className="fixed inset-x-0 bottom-0 z-50 transform transition-transform duration-300 ease-out sm:relative sm:max-w-md w-full">
        <div className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-10 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300">
          <div className="px-6 py-5 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center sticky top-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md z-10">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white font-sans">{title}</h2>
            <button 
              onClick={onClose}
              className="p-2 -mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 bg-gray-50 hover:bg-gray-100 dark:bg-[#1c2a42] dark:hover:bg-slate-700 rounded-full transition-colors active:scale-95"
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

