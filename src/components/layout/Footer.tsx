import { useTranslation } from 'react-i18next';

export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="shrink-0 border-t border-arc-200 bg-arc-100 px-4 py-1.5 text-right">
      <p className="text-[10px] text-arc-500 italic">{t('app.footer_credit')}</p>
    </footer>
  );
}
