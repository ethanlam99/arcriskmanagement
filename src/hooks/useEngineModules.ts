import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRepository } from '@/data/RepositoryProvider';
import type { EngineModule } from '@/types';

const KEYS = {
  all:    () => ['arc', 'engine_modules'] as const,
  detail: (id: string) => ['arc', 'engine_modules', id] as const,
};

export function useEngineModules(options?: { refetchInterval?: number }) {
  const repo = useRepository();
  return useQuery({
    queryKey: KEYS.all(),
    queryFn:  () => repo.engineModules.list(),
    refetchInterval: options?.refetchInterval,
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
