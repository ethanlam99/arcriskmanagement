import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRepository } from '@/data/RepositoryProvider';

export function useLatestUatRun(strategyChangeId: string) {
  const repo = useRepository();
  return useQuery({
    queryKey: ['aegis', 'uat_runs', strategyChangeId],
    queryFn: async () => {
      const all = await repo.uatRuns.list();
      return (
        all
          .filter((r) => r.strategy_change_id === strategyChangeId)
          .sort((a, b) => b.started_at.localeCompare(a.started_at))[0] ?? null
      );
    },
    enabled: !!strategyChangeId,
  });
}

export function useAllUatRuns() {
  const repo = useRepository();
  return useQuery({
    queryKey: ['aegis', 'uat_runs', 'all'],
    queryFn: () => repo.uatRuns.list(),
  });
}

export function useUatReviewsForRun(uatRunId: string) {
  const repo = useRepository();
  return useQuery({
    queryKey: ['aegis', 'uat_reviews', uatRunId],
    queryFn: async () => {
      const all = await repo.uatReviews.list();
      return all.filter((r) => r.uat_run_id === uatRunId);
    },
    enabled: !!uatRunId,
  });
}

export function useLatestRejectedReview(strategyChangeId: string) {
  const repo = useRepository();
  return useQuery({
    queryKey: ['aegis', 'uat_reviews', 'rejected', strategyChangeId],
    queryFn: async () => {
      const runs = await repo.uatRuns.list();
      const changeRuns = runs.filter((r) => r.strategy_change_id === strategyChangeId);
      if (changeRuns.length === 0) return null;

      const reviews = await repo.uatReviews.list();
      const rejected = reviews
        .filter(
          (rev) =>
            rev.final_verdict === 'rejected' &&
            changeRuns.some((r) => r.id === rev.uat_run_id)
        )
        .sort((a, b) => b.decided_at.localeCompare(a.decided_at));

      return rejected[0] ?? null;
    },
    enabled: !!strategyChangeId,
  });
}

export function useInvalidateUatRuns() {
  const qc = useQueryClient();
  return (strategyChangeId: string) => {
    qc.invalidateQueries({ queryKey: ['aegis', 'uat_runs', strategyChangeId] });
    qc.invalidateQueries({ queryKey: ['aegis', 'uat_runs', 'all'] });
  };
}
