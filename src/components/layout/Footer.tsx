import { useTranslation } from 'react-i18next';

export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="shrink-0 border-t border-arc-200 dark:border-arc-dark-200 bg-arc-100 dark:bg-arc-dark-100 px-4 py-1.5 text-right">
      <p className="text-[10px] text-arc-500 dark:text-arc-dark-500 italic">{t('app.footer_credit')}</p>
    </footer>
  );
}
