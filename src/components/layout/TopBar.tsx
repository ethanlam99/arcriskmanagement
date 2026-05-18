import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavHistory } from './NavHistoryProvider';

interface TopBarProps {
  breadcrumb?: ReactNode;
  actions?: ReactNode;
}

export function TopBar({ breadcrumb, actions }: TopBarProps) {
  const { canGoBack, canGoForward, goBack, goForward } = useNavHistory();

  return (
    <header className="h-12 shrink-0 bg-white border-b border-arc-200 flex items-center justify-between px-5">
      <div className="flex items-center gap-3 text-sm text-arc-500">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={goBack}
            disabled={!canGoBack}
            aria-label="Go back"
            title="Back"
            className="w-7 h-7 flex items-center justify-center rounded-md text-arc-500 hover:bg-arc-100 hover:text-arc-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={goForward}
            disabled={!canGoForward}
            aria-label="Go forward"
            title="Forward"
            className="w-7 h-7 flex items-center justify-center rounded-md text-arc-500 hover:bg-arc-100 hover:text-arc-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
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
          {i > 0 && <span className="text-arc-500">/</span>}
          <span className={i === items.length - 1 ? 'text-arc-900 font-medium' : 'text-arc-500'}>
            {item.label}
          </span>
        </span>
      ))}
    </nav>
  );
}
