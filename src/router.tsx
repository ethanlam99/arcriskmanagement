import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/pages/login/LoginPage';
import { HomePage } from '@/pages/home/HomePage';
import { EngineModulesPage } from '@/pages/engine-modules/EngineModulesPage';
import { EngineModuleDetailPage } from '@/pages/engine-modules/EngineModuleDetailPage';
import { StrategyChangesPage } from '@/pages/strategy-changes/StrategyChangesPage';
import { StrategyChangeDetailPage } from '@/pages/strategy-change-detail/StrategyChangeDetailPage';
import { ChangelogPage } from '@/pages/changelog/ChangelogPage';
import { ITHandoffLogPage } from '@/pages/it-handoff-log/ITHandoffLogPage';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true,                    element: <Navigate to="/home" replace /> },
      { path: 'home',                   element: <HomePage /> },
      { path: 'engine-modules',         element: <EngineModulesPage /> },
      { path: 'engine-modules/:id',     element: <EngineModuleDetailPage /> },
      { path: 'strategy-changes',       element: <StrategyChangesPage /> },
      { path: 'strategy-changes/:id',   element: <StrategyChangeDetailPage /> },
      { path: 'changelog',              element: <ChangelogPage /> },
      { path: 'it-handoff-log',         element: <ITHandoffLogPage /> },
      // Legacy redirects for old sidebar links
      { path: 'preview-changelog',      element: <Navigate to="/changelog" replace /> },
      { path: 'confirmed-changelog',    element: <Navigate to="/changelog" replace /> },
      { path: 'audit-log',              element: <Navigate to="/home" replace /> },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/home" replace />,
  },
]);
