import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { useRepository } from '@/data/RepositoryProvider';
import { resetToSeedData } from '@/data/localRepository';
import { UserAvatar } from '@/components/shared/UserAvatar';
import { Logo } from '@/components/shared/Logo';
import { useQueryClient } from '@tanstack/react-query';
import { ConfirmModal } from '@/components/shared/ConfirmModal';
import type { UserRole } from '@/types';

// Roles an admin can preview the platform as (demo affordance).
const VIEW_AS_ROLES: UserRole[] = [
  'risk_analyst', 'risk_lead', 'tester', 'testing_lead', 'it_team', 'admin',
];

interface NavItem {
  to: string;
  labelKey: string;
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
  labelKey: 'nav.overview',
  icon: <NavIcon d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />,
};

const RISK_EDITS_ITEM: NavItem = {
  to: '/risk-edits',
  labelKey: 'nav.risk_edits',
  icon: <NavIcon d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />,
};

const WORKSPACE_ICON = (
  <NavIcon d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
);

const WORKSPACE_CHILDREN: { to: string; labelKey: string }[] = [
  { to: '/workspace/draft-queue', labelKey: 'nav.workspace_draft_queue' },
  { to: '/workspace/uat',         labelKey: 'nav.workspace_uat' },
  { to: '/workspace/qa',          labelKey: 'nav.workspace_qa' },
];

const BOTTOM_ITEMS: NavItem[] = [
  {
    to: '/changelog',
    labelKey: 'nav.changelog',
    icon: <NavIcon d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />,
  },
  {
    to: '/it-handoff-log',
    labelKey: 'nav.it_handoff',
    icon: <NavIcon d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />,
  },
];

const linkBase =
  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors';
const linkInactive = 'text-arc-200 dark:text-arc-dark-300 hover:bg-arc-700 dark:hover:bg-arc-dark-200 hover:text-white';
const linkActive   = 'bg-forest-500 dark:bg-forest-dark-500 text-white';

function PrimaryNavLink({ item }: { item: NavItem }) {
  const { t } = useTranslation();
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) => `${linkBase} ${isActive ? linkActive : linkInactive}`}
    >
      {item.icon}
      {t(item.labelKey)}
    </NavLink>
  );
}

function WorkspaceNav() {
  const { t } = useTranslation();
  const location = useLocation();
  const isOnWorkspace = location.pathname.startsWith('/workspace');
  const [open, setOpen] = useState(isOnWorkspace);

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
          {t('nav.workspace')}
        </span>
        <svg
          className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="flex flex-col gap-0.5 ml-6 pl-3 border-l border-arc-700 dark:border-arc-dark-200">
          {WORKSPACE_CHILDREN.map((c) => (
            <NavLink
              key={c.to}
              to={c.to}
              className={({ isActive }) =>
                `${linkBase} text-xs py-1.5 ${isActive ? linkActive : linkInactive}`
              }
            >
              {t(c.labelKey)}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const { t } = useTranslation();
  const { currentUser, signOut, canViewAs, viewAsRole, setViewAsRole } = useAuth();
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
      <aside className="w-64 shrink-0 bg-arc-900 dark:bg-arc-dark-900 flex flex-col h-full">
        {/* Logo */}
        <Link
          to="/overview"
          className="block px-4 py-5 border-b border-arc-700 dark:border-arc-dark-200 hover:bg-arc-800 dark:hover:bg-arc-dark-200 transition-colors"
          aria-label={t('app.logo_back_to_overview')}
        >
          <div className="flex items-center gap-3">
            <Logo size="md" variant="light" />
            <div>
              <span className="text-white font-semibold text-sm tracking-wide block">
                {t('app.name')}
              </span>
              <span className="text-arc-200 dark:text-arc-dark-300 text-xs leading-tight">{t('app.tagline')}</span>
            </div>
          </div>
        </Link>

        {/* Primary nav */}
        <nav className="flex-1 px-2 py-3 flex flex-col gap-0.5 overflow-y-auto">
          <PrimaryNavLink item={OVERVIEW_ITEM} />
          <WorkspaceNav />
          <PrimaryNavLink item={RISK_EDITS_ITEM} />

          <div className="mt-4 mb-1 px-3">
            <span className="text-xs text-arc-200 dark:text-arc-dark-300 uppercase tracking-wider font-medium">
              {t('nav.reports')}
            </span>
          </div>

          {BOTTOM_ITEMS.map((item) => (
            <PrimaryNavLink key={item.to} item={item} />
          ))}
        </nav>

        {/* Footer — user + actions */}
        <div className="border-t border-arc-700 dark:border-arc-dark-200 px-3 py-3 flex flex-col gap-2">
          {currentUser?.role === 'admin' && (
            <button
              onClick={() => setShowResetModal(true)}
              className="w-full text-left flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-amber-300 hover:bg-arc-700 dark:hover:bg-arc-dark-200 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {t('nav.reset_demo')}
            </button>
          )}

          {canViewAs && (
            <div className="px-1">
              <label htmlFor="view-as" className="block text-[10px] uppercase tracking-wider text-arc-200 dark:text-arc-dark-300 font-medium mb-1">
                {t('view_as.label')}
              </label>
              <select
                id="view-as"
                value={viewAsRole ?? ''}
                onChange={(e) => setViewAsRole(e.target.value ? (e.target.value as UserRole) : null)}
                className="w-full rounded-lg bg-arc-800 dark:bg-arc-dark-200 text-white text-xs px-2 py-1.5 border border-arc-700 dark:border-arc-dark-300 focus:outline-none focus:ring-1 focus:ring-forest-dark-600"
              >
                <option value="">{t('view_as.as_self')}</option>
                {VIEW_AS_ROLES.map((r) => (
                  <option key={r} value={r}>{t(`role.${r}`)}</option>
                ))}
              </select>
            </div>
          )}

          {currentUser && (
            <div className="flex items-center gap-2.5 px-1">
              <UserAvatar seed={currentUser.avatar_seed} name={currentUser.name} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-medium truncate">{currentUser.name}</p>
                <p className="text-arc-200 dark:text-arc-dark-300 text-xs truncate">{t(`role.${currentUser.role}`)}</p>
              </div>
              <button
                onClick={handleSignOut}
                title={t('nav.sign_out')}
                aria-label={t('nav.sign_out')}
                className="text-arc-200 dark:text-arc-dark-300 hover:text-white transition-colors"
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
          title={t('nav.reset_demo_modal_title')}
          description={t('nav.reset_demo_modal_desc')}
          confirmLabel={t('nav.reset_demo_confirm')}
          variant="destructive"
          onConfirm={handleReset}
          onCancel={() => setShowResetModal(false)}
        />
      )}
    </>
  );
}
