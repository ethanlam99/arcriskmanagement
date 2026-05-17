import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRepository } from '@/data/RepositoryProvider';

export function useLatestUatRun(riskEditId: string) {
  const repo = useRepository();
  return useQuery({
    queryKey: ['arc', 'uat_runs', riskEditId],
    queryFn: async () => {
      const all = await repo.uatRuns.list();
      return (
        all
          .filter((r) => r.risk_edit_id === riskEditId)
          .sort((a, b) => b.started_at.localeCompare(a.started_at))[0] ?? null
      );
    },
    enabled: !!riskEditId,
  });
}

export function useAllUatRuns() {
  const repo = useRepository();
  return useQuery({
    queryKey: ['arc', 'uat_runs', 'all'],
    queryFn: () => repo.uatRuns.list(),
  });
}

export function useUatReviewsForRun(uatRunId: string) {
  const repo = useRepository();
  return useQuery({
    queryKey: ['arc', 'uat_reviews', uatRunId],
    queryFn: async () => {
      const all = await repo.uatReviews.list();
      return all.filter((r) => r.uat_run_id === uatRunId);
    },
    enabled: !!uatRunId,
  });
}

export function useLatestRejectedReview(riskEditId: string) {
  const repo = useRepository();
  return useQuery({
    queryKey: ['arc', 'uat_reviews', 'rejected', riskEditId],
    queryFn: async () => {
      const runs = await repo.uatRuns.list();
      const editRuns = runs.filter((r) => r.risk_edit_id === riskEditId);
      if (editRuns.length === 0) return null;

      const reviews = await repo.uatReviews.list();
      const rejected = reviews
        .filter(
          (rev) =>
            rev.final_verdict === 'rejected' &&
            editRuns.some((r) => r.id === rev.uat_run_id)
        )
        .sort((a, b) => b.decided_at.localeCompare(a.decided_at));

      return rejected[0] ?? null;
    },
    enabled: !!riskEditId,
  });
}

export function useInvalidateUatRuns() {
  const qc = useQueryClient();
  return (riskEditId: string) => {
    qc.invalidateQueries({ queryKey: ['arc', 'uat_runs', riskEditId] });
    qc.invalidateQueries({ queryKey: ['arc', 'uat_runs', 'all'] });
  };
}
