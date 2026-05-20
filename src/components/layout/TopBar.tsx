import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavHistory } from './NavHistoryProvider';
import { LanguageToggle } from './LanguageToggle';
import { ThemeToggle } from './ThemeToggle';

interface TopBarProps {
  breadcrumb?: ReactNode;
  actions?: ReactNode;
}

export function TopBar({ breadcrumb, actions }: TopBarProps) {
  const { canGoBack, canGoForward, goBack, goForward } = useNavHistory();
  const { t } = useTranslation();

  return (
    <header className="h-12 shrink-0 bg-white border-b border-arc-200 flex items-center justify-between px-5">
      <div className="flex items-center gap-3 text-sm text-arc-500">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={goBack}
            disabled={!canGoBack}
            aria-label={t('nav.back')}
            title={t('nav.back')}
            className="w-7 h-7 flex items-center justify-center rounded-md text-arc-500 hover:bg-arc-100 hover:text-arc-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={goForward}
            disabled={!canGoForward}
            aria-label={t('nav.forward')}
            title={t('nav.forward')}
            className="w-7 h-7 flex items-center justify-center rounded-md text-arc-500 hover:bg-arc-100 hover:text-arc-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        {breadcrumb}
      </div>
      <div className="flex items-center gap-2">
        {actions}
        <LanguageToggle />
        <ThemeToggle />
      </div>
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
