import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/data/RepositoryProvider';
import { proposeCoverageCritique } from '@/integrations/testCaseProposer';
import type { RiskEdit } from '@/types';

export function useProposedTestCases(riskEditId: string) {
  const repo = useRepository();
  return useQuery({
    queryKey: ['arc', 'proposed_test_cases', riskEditId],
    queryFn:  () => repo.proposedTestCases.listForEdit(riskEditId),
    enabled:  !!riskEditId,
  });
}

// v0.4.3 Line 4 — AI "cases you might miss" critique. Advisory, recomputed per edit;
// no persistence. `enabled` lets callers defer the work until the panel is open.
export function useCoverageCritique(edit: RiskEdit | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['arc', 'coverage_critique', edit?.id],
    queryFn:  () => proposeCoverageCritique(edit as RiskEdit),
    enabled:  !!edit && enabled,
    staleTime: Infinity,   // fixtures are deterministic — no need to refetch
  });
}
