import React from 'react';
import { cn } from '../utils/cn';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', fullWidth, children, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center rounded-xl font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none active:scale-95';
    
    const variants = {
      primary: 'premium-gradient text-white shadow-lg shadow-primary-500/30 hover:shadow-primary-500/50 hover:brightness-110',
      secondary: 'bg-white/80 text-primary-700 shadow-sm border border-primary-100 hover:bg-white backdrop-blur-sm',
      danger: 'bg-red-500 text-white shadow-lg shadow-red-500/30 hover:bg-red-600',
      ghost: 'bg-transparent text-gray-700 hover:bg-gray-100/80',
    };
    
    const sizes = {
      sm: 'h-9 px-4 text-sm',
      md: 'h-12 px-6 text-base font-semibold',
      lg: 'h-14 px-8 text-lg font-bold',
    };
    
    return (
      <button
        ref={ref}
        className={cn(
          baseStyles,
          variants[variant],
          sizes[size],
          fullWidth && 'w-full',
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';
