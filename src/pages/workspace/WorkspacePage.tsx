import { Outlet } from 'react-router-dom';
import { TopBar, Breadcrumb } from '@/components/layout/TopBar';

export function WorkspacePage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar breadcrumb={<Breadcrumb items={[{ label: 'Workspace' }]} />} />

      <div className="flex-1 min-h-0 overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}
