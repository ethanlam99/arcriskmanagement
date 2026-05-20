import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { Sidebar } from './Sidebar';
import { Footer } from './Footer';
import { NavHistoryProvider } from './NavHistoryProvider';

export function AppShell() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <NavHistoryProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-arc-100 dark:bg-arc-dark-100">
        <Sidebar />
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0 overflow-hidden">
            <Outlet />
          </div>
          <Footer />
        </main>
      </div>
    </NavHistoryProvider>
  );
}
