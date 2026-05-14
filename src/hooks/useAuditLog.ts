import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/data/RepositoryProvider';

const KEYS = {
  all:      () => ['aegis', 'audit_log'] as const,
  byEntity: (type: string, id: string) => ['aegis', 'audit_log', type, id] as const,
};

export function useAuditLog(filters?: {
  entity_type?: string;
  entity_id?: string;
  actor_id?: string;
}) {
  const repo = useRepository();
  return useQuery({
    queryKey: filters?.entity_id
      ? KEYS.byEntity(filters.entity_type ?? '', filters.entity_id)
      : [...KEYS.all(), filters],
    queryFn: () => repo.auditLog.list(filters),
  });
}
