import React, { useId } from 'react';
import { cn } from '../utils/cn';

interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, error, className, id, ...props }, ref) => {
    const defaultId = useId();
    const inputId = id || defaultId;

    return (
      <div className="w-full">
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 ml-1">
          {label}
        </label>
        <input
          id={inputId}
          ref={ref}
          className={cn(
            "w-full h-12 px-4 bg-gray-50 dark:bg-[#1c2a42] border border-gray-200 dark:border-[#253350] rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all placeholder:text-gray-400 dark:text-white",
            error && "border-red-500 dark:border-red-500 focus:ring-red-500 bg-red-50 dark:bg-red-900/20",
            className
          )}
          {...props}
        />
        {error && (
          <p className="mt-1.5 text-sm text-red-600 ml-1">{error}</p>
        )}
      </div>
    );
  }
);
TextField.displayName = 'TextField';

