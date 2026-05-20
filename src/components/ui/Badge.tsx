export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'live';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const styles: Record<BadgeVariant, string> = {
  default: 'bg-arc-100 dark:bg-arc-dark-100 text-arc-700 dark:text-arc-dark-700',
  success: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50',
  warning: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50',
  danger:  'bg-rose-50 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50',
  info:    'bg-arc-100 dark:bg-arc-dark-100 text-arc-700 dark:text-arc-dark-700 border border-arc-200 dark:border-arc-dark-200',
  neutral: 'bg-zinc-100 text-zinc-600 border border-zinc-200',
  live:    'bg-forest-50 dark:bg-forest-dark-700/20 text-forest-700 dark:text-forest-dark-700 border border-forest-100 dark:border-forest-dark-700 font-semibold',
};

export function Badge({ variant = 'default', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
