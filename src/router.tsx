import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/pages/login/LoginPage';
import { HomePage } from '@/pages/home/HomePage';
import { EngineModulesPage } from '@/pages/engine-modules/EngineModulesPage';
import { StrategyChangesPage } from '@/pages/strategy-changes/StrategyChangesPage';
import { StrategyChangeDetailPage } from '@/pages/strategy-change-detail/StrategyChangeDetailPage';

function ComingSoon({ name }: { name: string }) {
  return (
    <div className="flex flex-col h-full items-center justify-center gap-3 text-aegis-200">
      <p className="text-sm font-medium text-aegis-900">{name}</p>
      <p className="text-xs">Coming in the next build round.</p>
    </div>
  );
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/home" replace /> },
      { path: 'home',              element: <HomePage /> },
      { path: 'engine-modules',   element: <EngineModulesPage /> },
      { path: 'strategy-changes', element: <StrategyChangesPage /> },
      { path: 'strategy-changes/:id', element: <StrategyChangeDetailPage /> },
      { path: 'preview-changelog',    element: <ComingSoon name="Preview Changelog" /> },
      { path: 'confirmed-changelog',  element: <ComingSoon name="Confirmed Changelog" /> },
      { path: 'it-handoff-log',       element: <ComingSoon name="IT Handoff Log" /> },
      { path: 'audit-log',            element: <ComingSoon name="Audit Log" /> },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/home" replace />,
  },
]);
