import React from 'react';
import { cn } from '../utils/cn';

interface FABProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
}

export function FAB({ className, icon, ...props }: FABProps) {
  return (
    <button
      className={cn(
        "fixed bottom-6 right-6 w-14 h-14 bg-primary-600 text-white rounded-2xl shadow-lg hover:bg-primary-700 transition-colors flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 active:scale-95 z-40",
        className
      )}
      {...props}
    >
      {icon}
    </button>
  );
}

