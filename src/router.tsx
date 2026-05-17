import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/pages/login/LoginPage';
import { HomePage } from '@/pages/home/HomePage';
import { EngineModulesPage } from '@/pages/engine-modules/EngineModulesPage';
import { EngineModuleDetailPage } from '@/pages/engine-modules/EngineModuleDetailPage';
import { RiskEditsPage } from '@/pages/risk-edits/RiskEditsPage';
import { RiskEditDetailPage } from '@/pages/risk-edits/RiskEditDetailPage';
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
      { index: true,                element: <Navigate to="/home" replace /> },
      { path: 'home',               element: <HomePage /> },
      { path: 'engine-modules',     element: <EngineModulesPage /> },
      { path: 'engine-modules/:id', element: <EngineModuleDetailPage /> },
      { path: 'risk-edits',         element: <RiskEditsPage /> },
      { path: 'risk-edits/:id',     element: <RiskEditDetailPage /> },
      { path: 'changelog',          element: <ChangelogPage /> },
      { path: 'it-handoff-log',     element: <ITHandoffLogPage /> },
      // Legacy redirects
      { path: 'strategy-changes',   element: <Navigate to="/risk-edits" replace /> },
      { path: 'strategy-changes/:id', element: <Navigate to="/risk-edits" replace /> },
      { path: 'preview-changelog',  element: <Navigate to="/changelog" replace /> },
      { path: 'confirmed-changelog',element: <Navigate to="/changelog" replace /> },
      { path: 'audit-log',          element: <Navigate to="/home" replace /> },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/home" replace />,
  },
]);
