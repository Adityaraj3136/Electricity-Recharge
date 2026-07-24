import React, { useId } from 'react';
import { cn } from '../utils/cn';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: { value: string; label: string }[];
  error?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, error, className, id, ...props }, ref) => {
    const defaultId = useId();
    const selectId = id || defaultId;

    return (
      <div className="w-full">
        <label htmlFor={selectId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 ml-1">
          {label}
        </label>
        <div className="relative">
          <select
            id={selectId}
            ref={ref}
            className={cn(
              "w-full h-12 pl-4 pr-10 bg-gray-50 dark:bg-[#1c2a42] border border-gray-200 dark:border-[#253350] rounded-xl appearance-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all dark:text-white",
              error && "border-red-500 dark:border-red-500 focus:ring-red-500 bg-red-50 dark:bg-red-900/20",
              className
            )}
            {...props}
          >
            <option value="" disabled>Select an option</option>
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-500">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        {error && (
          <p className="mt-1.5 text-sm text-red-600 ml-1">{error}</p>
        )}
      </div>
    );
  }
);
Select.displayName = 'Select';

