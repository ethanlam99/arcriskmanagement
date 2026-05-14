import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRepository } from '@/data/RepositoryProvider';
import type { EngineModule } from '@/types';

const KEYS = {
  all:    () => ['aegis', 'engine_modules'] as const,
  detail: (id: string) => ['aegis', 'engine_modules', id] as const,
};

export function useEngineModules() {
  const repo = useRepository();
  return useQuery({
    queryKey: KEYS.all(),
    queryFn:  () => repo.engineModules.list(),
  });
}

export function useEngineModule(id: string) {
  const repo = useRepository();
  return useQuery({
    queryKey: KEYS.detail(id),
    queryFn:  () => repo.engineModules.get(id),
    enabled:  !!id,
  });
}

export function useUpdateEngineModule() {
  const repo = useRepository();
  const qc   = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<EngineModule> }) =>
      repo.engineModules.update(id, input),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: KEYS.all() });
      qc.setQueryData(KEYS.detail(updated.id), updated);
    },
  });
}
