import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/pages/login/LoginPage';
import { ChangePasswordPage } from '@/pages/change-password/ChangePasswordPage';
import { OverviewPage } from '@/pages/overview/OverviewPage';
import { EngineModuleDetailPage } from '@/pages/engine-modules/EngineModuleDetailPage';
import { RiskEditsPage } from '@/pages/risk-edits/RiskEditsPage';
import { WorkspacePage } from '@/pages/workspace/WorkspacePage';
import { DraftQueueWorkspacePage } from '@/pages/workspace/DraftQueueWorkspacePage';
import { UatWorkspacePage } from '@/pages/workspace/UatWorkspacePage';
import { QaWorkspacePage } from '@/pages/workspace/QaWorkspacePage';
import { ChangelogPage } from '@/pages/changelog/ChangelogPage';
import { ITHandoffLogPage } from '@/pages/it-handoff-log/ITHandoffLogPage';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/change-password',
    element: <ChangePasswordPage />,
  },
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true,                   element: <Navigate to="/overview" replace /> },
      { path: 'overview',              element: <OverviewPage /> },
      { path: 'engine-modules/:id',    element: <EngineModuleDetailPage /> },
      { path: 'risk-edits',            element: <RiskEditsPage /> },
      {
        path: 'workspace',
        element: <WorkspacePage />,
        children: [
          { index: true,               element: <Navigate to="draft-queue" replace /> },
          { path: 'draft-queue',       element: <DraftQueueWorkspacePage /> },
          { path: 'uat',               element: <UatWorkspacePage /> },
          { path: 'qa',                element: <QaWorkspacePage /> },
        ],
      },
      { path: 'changelog',             element: <ChangelogPage /> },
      { path: 'it-handoff-log',        element: <ITHandoffLogPage /> },
      // Legacy redirects
      { path: 'home',                    element: <Navigate to="/overview" replace /> },
      { path: 'engine-modules',          element: <Navigate to="/overview" replace /> },
      { path: 'strategy-changes',        element: <Navigate to="/risk-edits" replace /> },
      { path: 'strategy-changes/:id',    element: <Navigate to="/risk-edits" replace /> },
      { path: 'preview-changelog',       element: <Navigate to="/changelog" replace /> },
      { path: 'confirmed-changelog',     element: <Navigate to="/changelog" replace /> },
      { path: 'audit-log',               element: <Navigate to="/overview" replace /> },
      // Old per-edit detail route — now directs to the workspace
      { path: 'risk-edits/:id',          element: <Navigate to="/workspace/draft-queue" replace /> },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/overview" replace /> ,
  },
]);
