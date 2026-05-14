import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';

const inputBase =
  'w-full rounded-lg border border-aegis-200 bg-white px-3 py-2 text-sm text-aegis-900 placeholder:text-aegis-200 focus:outline-none focus:ring-2 focus:ring-aegis-500 focus:border-transparent disabled:opacity-50 disabled:bg-aegis-50 transition-colors';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref) => (
    <input ref={ref} className={`${inputBase} h-9 ${className}`} {...props} />
  )
);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = '', ...props }, ref) => (
    <textarea ref={ref} className={`${inputBase} resize-none ${className}`} {...props} />
  )
);
Textarea.displayName = 'Textarea';

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}

export function Label({ className = '', children, ...props }: LabelProps) {
  return (
    <label className={`block text-xs font-medium text-aegis-700 mb-1 ${className}`} {...props}>
      {children}
    </label>
  );
}

export function FormField({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
