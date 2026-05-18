import { type ButtonHTMLAttributes, forwardRef } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type Size    = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const base =
  'inline-flex items-center justify-center gap-2 font-medium rounded-full transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';

const variants: Record<Variant, string> = {
  primary:     'bg-arc-900 text-white hover:bg-forest-600 active:bg-arc-800',
  secondary:   'border border-arc-700 text-arc-700 bg-white hover:bg-arc-100 hover:border-arc-900 active:bg-arc-200',
  ghost:       'text-arc-700 hover:bg-arc-100 active:bg-arc-200',
  destructive: 'bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800',
};

const sizes: Record<Size, string> = {
  sm: 'h-7 px-3 text-xs',
  md: 'h-9 px-4 text-sm',
  lg: 'h-11 px-6 text-sm',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, children, className = '', ...props }, ref) => (
    <button
      ref={ref}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      )}
      {children}
    </button>
  )
);
Button.displayName = 'Button';
