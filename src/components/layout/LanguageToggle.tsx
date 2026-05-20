import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { changeLanguage, LANG_LABELS, LANG_SHORT_LABELS, SUPPORTED_LANGS, type Lang } from '@/i18n';

export function LanguageToggle() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
        className="h-7 px-2 inline-flex items-center gap-1 rounded-md text-xs font-medium text-arc-700 hover:bg-arc-100 transition-colors"
      >
        <span>{LANG_SHORT_LABELS[current]}</span>
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-50 min-w-[10rem] bg-white border border-arc-200 rounded-md shadow-card py-1"
        >
          {SUPPORTED_LANGS.map((lang) => (
            <button
              key={lang}
              type="button"
              role="menuitem"
              onClick={() => pick(lang)}
              className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-arc-100 transition-colors ${
                lang === current ? 'text-arc-900 font-medium' : 'text-arc-700'
              }`}
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
