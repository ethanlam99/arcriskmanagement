import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { useRepository } from '@/data/RepositoryProvider';
import { resetToSeedData } from '@/data/localRepository';
import { UserAvatar } from '@/components/shared/UserAvatar';
import { useQueryClient } from '@tanstack/react-query';
import { ConfirmModal } from '@/components/shared/ConfirmModal';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
}

function NavIcon({ d }: { d: string }) {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

const OVERVIEW_ITEM: NavItem = {
  to: '/overview',
  label: 'Overview',
  icon: <NavIcon d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />,
};

const RISK_EDITS_ITEM: NavItem = {
  to: '/risk-edits',
  label: 'Risk Edits',
  icon: <NavIcon d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />,
};

const WORKSPACE_ICON = (
  <NavIcon d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
);

const WORKSPACE_CHILDREN: { to: string; label: string }[] = [
  { to: '/workspace/draft-queue', label: 'Draft & Queue' },
  { to: '/workspace/uat',         label: 'UAT' },
  { to: '/workspace/qa',          label: 'QA Review' },
];

const BOTTOM_ITEMS: NavItem[] = [
  {
    to: '/changelog',
    label: 'Changelog',
    icon: <NavIcon d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />,
  },
  {
    to: '/it-handoff-log',
    label: 'IT Handoff',
    icon: <NavIcon d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />,
  },
];

const linkBase =
  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors';
const linkInactive = 'text-arc-200 hover:bg-arc-700 hover:text-white';
const linkActive   = 'bg-forest-500 text-white';

function PrimaryNavLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) => `${linkBase} ${isActive ? linkActive : linkInactive}`}
    >
      {item.icon}
      {item.label}
    </NavLink>
  );
}

function WorkspaceNav() {
  const location = useLocation();
  const isOnWorkspace = location.pathname.startsWith('/workspace');
  const [open, setOpen] = useState(isOnWorkspace);

  // Sync dropdown to route: auto-open on /workspace/*, auto-close when leaving.
  // User's local toggle persists until the next navigation event.
  useEffect(() => {
    setOpen(isOnWorkspace);
  }, [location.pathname, isOnWorkspace]);

  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`${linkBase} ${isOnWorkspace ? linkActive : linkInactive} w-full justify-between`}
      >
        <span className="flex items-center gap-2.5">
          {WORKSPACE_ICON}
          Workspace
        </span>
        <svg
          className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="flex flex-col gap-0.5 ml-6 pl-3 border-l border-arc-700">
          {WORKSPACE_CHILDREN.map((c) => (
            <NavLink
              key={c.to}
              to={c.to}
              className={({ isActive }) =>
                `${linkBase} text-xs py-1.5 ${isActive ? linkActive : linkInactive}`
              }
            >
              {c.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const { currentUser, signOut } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showResetModal, setShowResetModal] = useState(false);

  function handleSignOut() {
    signOut();
    navigate('/login');
  }

  function handleReset() {
    resetToSeedData();
    qc.invalidateQueries();
    setShowResetModal(false);
  }

  return (
    <>
      <aside className="w-56 shrink-0 bg-arc-900 flex flex-col h-full">
        {/* Logo */}
        <div className="px-4 py-5 border-b border-arc-700">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-arc-500 rounded-lg flex items-center justify-center">
              <span className="text-white text-xs font-bold">A</span>
            </div>
            <span className="text-white font-semibold text-sm tracking-wide">ARC</span>
          </div>
          <p className="text-arc-200 text-xs mt-1 leading-tight">AI Risk Control</p>
        </div>

        {/* Primary nav */}
        <nav className="flex-1 px-2 py-3 flex flex-col gap-0.5 overflow-y-auto">
          <PrimaryNavLink item={OVERVIEW_ITEM} />
          <WorkspaceNav />
          <PrimaryNavLink item={RISK_EDITS_ITEM} />

          <div className="mt-4 mb-1 px-3">
            <span className="text-xs text-arc-200 uppercase tracking-wider font-medium">Reports</span>
          </div>

          {BOTTOM_ITEMS.map((item) => (
            <PrimaryNavLink key={item.to} item={item} />
          ))}
        </nav>

        {/* Footer — user + actions */}
        <div className="border-t border-arc-700 px-3 py-3 flex flex-col gap-2">
          {currentUser?.role === 'admin' && (
            <button
              onClick={() => setShowResetModal(true)}
              className="w-full text-left flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-amber-300 hover:bg-arc-700 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Reset Demo Data
            </button>
          )}

          {currentUser && (
            <div className="flex items-center gap-2.5 px-1">
              <UserAvatar seed={currentUser.avatar_seed} name={currentUser.name} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-medium truncate">{currentUser.name}</p>
                <p className="text-arc-200 text-xs truncate capitalize">{currentUser.role.replace('_', ' ')}</p>
              </div>
              <button
                onClick={handleSignOut}
                title="Sign out"
                className="text-arc-200 hover:text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </aside>

      {showResetModal && (
        <ConfirmModal
          title="Reset Demo Data"
          description="This will clear all localStorage data and reseed from fixture. All unsaved changes will be lost."
          confirmLabel="Reset"
          variant="destructive"
          onConfirm={handleReset}
          onCancel={() => setShowResetModal(false)}
        />
      )}
    </>
  );
}
