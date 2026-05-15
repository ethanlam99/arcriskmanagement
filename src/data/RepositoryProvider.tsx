import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Repository } from './repository';
import { createLocalRepository } from './localRepository';
import { initItHandoff } from '@/integrations/itHandoff';

const RepositoryContext = createContext<Repository | null>(null);

// Phase 2: swap createLocalRepository() for createSupabaseRepository() here.
export function RepositoryProvider({ children }: { children: ReactNode }) {
  const repo = useMemo(() => {
    const r = createLocalRepository();
    initItHandoff(r);
    return r;
  }, []);
  return (
    <RepositoryContext.Provider value={repo}>
      {children}
    </RepositoryContext.Provider>
  );
}

export function useRepository(): Repository {
  const ctx = useContext(RepositoryContext);
  if (!ctx) throw new Error('useRepository must be used inside <RepositoryProvider>');
  return ctx;
}
