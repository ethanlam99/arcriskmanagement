import type { ReactNode } from 'react';

interface TopBarProps {
  breadcrumb?: ReactNode;
  actions?: ReactNode;
}

export function TopBar({ breadcrumb, actions }: TopBarProps) {
  return (
    <header className="h-12 shrink-0 bg-white border-b border-arc-200 flex items-center justify-between px-5">
      <div className="flex items-center gap-2 text-sm text-arc-500">
        {breadcrumb}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Breadcrumb({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav className="flex items-center gap-1.5">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-arc-200">/</span>}
          <span className={i === items.length - 1 ? 'text-arc-900 font-medium' : 'text-arc-200'}>
            {item.label}
          </span>
        </span>
      ))}
    </nav>
  );
}
