import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { changeLanguage, LANG_LABELS, LANG_SHORT_LABELS, SUPPORTED_LANGS, type Lang } from '@/i18n';

export function LanguageToggle({ variant = 'light' }: { variant?: 'light' | 'dark' }) {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const dark = variant === 'dark';
  const triggerCls = dark
    ? 'text-arc-200 hover:bg-white/10'
    : 'text-arc-700 dark:text-arc-dark-700 hover:bg-arc-100 dark:hover:bg-arc-dark-50';
  const menuCls = dark
    ? 'bg-arc-900/90 backdrop-blur-xl border-white/10'
    : 'bg-white dark:bg-arc-dark-100 border-arc-200 dark:border-arc-dark-200 shadow-card';
  const itemCls = (isCurrent: boolean) =>
    dark
      ? `${isCurrent ? 'text-white font-medium' : 'text-arc-200'} hover:bg-white/10`
      : `${isCurrent ? 'text-arc-900 dark:text-arc-dark-700 font-medium' : 'text-arc-700 dark:text-arc-dark-700'} hover:bg-arc-100 dark:hover:bg-arc-dark-50`;

  const current = (SUPPORTED_LANGS as readonly string[]).includes(i18n.language)
    ? (i18n.language as Lang)
    : 'en';

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function pick(lang: Lang) {
    changeLanguage(lang);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`h-7 px-2 inline-flex items-center gap-1 rounded-md text-xs font-medium transition-colors ${triggerCls}`}
      >
        <span>{LANG_SHORT_LABELS[current]}</span>
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute right-0 top-full mt-1 z-50 min-w-[10rem] border rounded-md py-1 ${menuCls}`}
        >
          {SUPPORTED_LANGS.map((lang) => (
            <button
              key={lang}
              type="button"
              role="menuitem"
              onClick={() => pick(lang)}
              className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between transition-colors ${itemCls(lang === current)}`}
            >
              <span>{LANG_LABELS[lang]}</span>
              {lang === current && <span className="text-forest-500">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
