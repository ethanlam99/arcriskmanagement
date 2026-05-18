import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRepository } from '@/data/RepositoryProvider';
import type { RiskEdit, RiskEditStage, RiskEditVersion } from '@/types';

const KEYS = {
  all:      () => ['arc', 'risk_edits'] as const,
  detail:   (id: string) => ['arc', 'risk_edits', id] as const,
  versions: (id: string) => ['arc', 'risk_edit_versions', id] as const,
};

export function useRiskEdits(
  filters?: Partial<RiskEdit>,
  options?: { refetchInterval?: number },
) {
  const repo = useRepository();
  return useQuery({
    queryKey: [...KEYS.all(), filters],
    queryFn:  () => repo.riskEdits.list(filters as Record<string, unknown>),
    refetchInterval: options?.refetchInterval,
  });
}

export function useRiskEdit(id: string) {
  const repo = useRepository();
  return useQuery({
    queryKey: KEYS.detail(id),
    queryFn:  () => repo.riskEdits.get(id),
    enabled:  !!id,
  });
}

export function useRiskEditVersions(riskEditId: string) {
  const repo = useRepository();
  return useQuery({
    queryKey: KEYS.versions(riskEditId),
    queryFn:  async () => {
      const all = await repo.riskEditVersions.list();
      return all
        .filter((v) => v.risk_edit_id === riskEditId)
        .sort((a, b) => b.version_number - a.version_number);
    },
    enabled: !!riskEditId,
  });
}

export function useCreateRiskEdit() {
  const repo = useRepository();
  const qc   = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<RiskEdit, 'id' | 'created_at' | 'edit_id_display'>) =>
      repo.riskEdits.create(input as Omit<RiskEdit, 'id' | 'created_at'>),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all() }),
  });
}

export function useUpdateRiskEditStage() {
  const repo = useRepository();
  const qc   = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      stage,
      actorId,
      fromStage,
      extraPayload,
    }: {
      id: string;
      stage: RiskEditStage;
      actorId: string;
      fromStage: RiskEditStage;
      extraPayload?: Record<string, unknown>;
    }) =>
      Promise.all([
        repo.riskEdits.update(id, { current_stage: stage }),
        repo.auditLog.append({
          actor_id:     actorId,
          action:       'risk_edit.stage_transition',
          entity_type:  'risk_edit',
          entity_id:    id,
          payload_json: { from: fromStage, to: stage, ...extraPayload },
        }),
      ]).then(([edit]) => edit),
    onSuccess: (edit) => {
      qc.invalidateQueries({ queryKey: KEYS.all() });
      qc.setQueryData(KEYS.detail(edit.id), edit);
    },
  });
}

export function useCreateVersion() {
  const repo = useRepository();
  const qc   = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<RiskEditVersion, 'id' | 'created_at'>) =>
      Promise.all([
        repo.riskEditVersions.create(input),
        repo.auditLog.append({
          actor_id:     input.author_id,
          action:       'risk_edit_version.created',
          entity_type:  'risk_edit_version',
          entity_id:    'pending',
          payload_json: {
            version_number: input.version_number,
            source:         input.source,
            risk_edit_id:   input.risk_edit_id,
          },
        }),
      ]).then(([v]) => v),
    onSuccess: (v) => {
      qc.invalidateQueries({ queryKey: KEYS.versions(v.risk_edit_id) });
    },
  });
}
