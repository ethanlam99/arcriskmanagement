import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRepository } from '@/data/RepositoryProvider';
import type { StrategyChange, StrategyChangeStage, StrategyChangeVersion } from '@/types';

const KEYS = {
  all:      () => ['aegis', 'strategy_changes'] as const,
  detail:   (id: string) => ['aegis', 'strategy_changes', id] as const,
  versions: (id: string) => ['aegis', 'strategy_change_versions', id] as const,
};

export function useStrategyChanges(filters?: Partial<StrategyChange>) {
  const repo = useRepository();
  return useQuery({
    queryKey: [...KEYS.all(), filters],
    queryFn:  () => repo.strategyChanges.list(filters as Record<string, unknown>),
  });
}

export function useStrategyChange(id: string) {
  const repo = useRepository();
  return useQuery({
    queryKey: KEYS.detail(id),
    queryFn:  () => repo.strategyChanges.get(id),
    enabled:  !!id,
  });
}

export function useStrategyChangeVersions(strategyChangeId: string) {
  const repo = useRepository();
  return useQuery({
    queryKey: KEYS.versions(strategyChangeId),
    queryFn:  async () => {
      const all = await repo.strategyChangeVersions.list();
      return all
        .filter((v) => v.strategy_change_id === strategyChangeId)
        .sort((a, b) => b.version_number - a.version_number);
    },
    enabled: !!strategyChangeId,
  });
}

export function useCreateStrategyChange() {
  const repo = useRepository();
  const qc   = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<StrategyChange, 'id' | 'created_at'>) =>
      repo.strategyChanges.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all() }),
  });
}

export function useUpdateStrategyChangeStage() {
  const repo = useRepository();
  const qc   = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      stage,
      actorId,
      fromStage,
    }: {
      id: string;
      stage: StrategyChangeStage;
      actorId: string;
      fromStage: StrategyChangeStage;
    }) =>
      Promise.all([
        repo.strategyChanges.update(id, { current_stage: stage }),
        repo.auditLog.append({
          actor_id:     actorId,
          action:       'strategy_change.stage_transition',
          entity_type:  'strategy_change',
          entity_id:    id,
          payload_json: { from: fromStage, to: stage },
        }),
      ]).then(([sc]) => sc),
    onSuccess: (sc) => {
      qc.invalidateQueries({ queryKey: KEYS.all() });
      qc.setQueryData(KEYS.detail(sc.id), sc);
    },
  });
}

export function useCreateVersion() {
  const repo = useRepository();
  const qc   = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<StrategyChangeVersion, 'id' | 'created_at'>) =>
      Promise.all([
        repo.strategyChangeVersions.create(input),
        repo.auditLog.append({
          actor_id:     input.author_id,
          action:       'strategy_change_version.created',
          entity_type:  'strategy_change_version',
          entity_id:    'pending',
          payload_json: {
            version_number: input.version_number,
            source:         input.source,
            strategy_change_id: input.strategy_change_id,
          },
        }),
      ]).then(([v]) => v),
    onSuccess: (v) => {
      qc.invalidateQueries({ queryKey: KEYS.versions(v.strategy_change_id) });
    },
  });
}
