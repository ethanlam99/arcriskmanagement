import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { Sidebar } from './Sidebar';
import { NavHistoryProvider } from './NavHistoryProvider';

export function AppShell() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <NavHistoryProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-arc-100">
        <Sidebar />
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <Outlet />
        </main>
      </div>
    </NavHistoryProvider>
  );
}
