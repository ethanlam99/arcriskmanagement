import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar, Breadcrumb } from '@/components/layout/TopBar';

export function WorkspacePage() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar breadcrumb={<Breadcrumb items={[{ label: t('workspace.title') }]} />} />

      <div className="flex-1 min-h-0 overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}
