import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RepositoryProvider } from '@/data/RepositoryProvider';
import { AuthProvider } from '@/auth/AuthProvider';
import { router } from './router';
import '@/i18n';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: false,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RepositoryProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </RepositoryProvider>
    </QueryClientProvider>
  );
}
