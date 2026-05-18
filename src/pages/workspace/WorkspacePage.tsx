import { NavLink, Outlet } from 'react-router-dom';
import { TopBar, Breadcrumb } from '@/components/layout/TopBar';

const TABS = [
  { to: '/workspace/draft-queue', label: 'Draft & Queue' },
  { to: '/workspace/uat',         label: 'UAT' },
  { to: '/workspace/qa',          label: 'QA Review' },
];

export function WorkspacePage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar breadcrumb={<Breadcrumb items={[{ label: 'Workspace' }]} />} />

      {/* Sub-tab nav — sits flush under the TopBar */}
      <div className="bg-white border-b border-arc-200 shrink-0 flex items-end px-6">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                isActive
                  ? 'border-arc-500 text-arc-900'
                  : 'border-transparent text-arc-300 hover:text-arc-500'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}
