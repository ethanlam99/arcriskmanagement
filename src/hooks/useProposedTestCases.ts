import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/data/RepositoryProvider';

export function useProposedTestCases(riskEditId: string) {
  const repo = useRepository();
  return useQuery({
    queryKey: ['arc', 'proposed_test_cases', riskEditId],
    queryFn:  () => repo.proposedTestCases.listForEdit(riskEditId),
    enabled:  !!riskEditId,
  });
}
