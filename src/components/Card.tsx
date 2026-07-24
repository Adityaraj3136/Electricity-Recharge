import React from 'react';
import { cn } from '../utils/cn';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function Card({ className, children, ...props }: CardProps) {
  return (
    <div 
      className={cn("bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden", className)}
      {...props}
    >
      {children}
    </div>
  );
}

