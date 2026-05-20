import { forwardRef, type SelectHTMLAttributes } from 'react';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className = '', children, ...props }, ref) => (
    <select
      ref={ref}
      className={`h-9 w-full rounded-lg border border-arc-200 dark:border-arc-dark-200 bg-white dark:bg-arc-dark-100 px-3 py-2 text-sm text-arc-900 dark:text-arc-dark-700 focus:outline-none focus:ring-2 focus:ring-arc-500 focus:border-transparent disabled:opacity-50 disabled:bg-arc-100 transition-colors appearance-none cursor-pointer ${className}`}
      {...props}
    >
      {children}
    </select>
  )
);
Select.displayName = 'Select';
