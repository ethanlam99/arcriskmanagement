import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRepository } from '@/data/RepositoryProvider';

export function useITHandoffPackets() {
  const repo = useRepository();
  return useQuery({
    queryKey: ['aegis', 'it_handoff_packets'],
    queryFn: async () => {
      const packets = await repo.itHandoffPackets.list();
      return packets.sort((a, b) => b.sent_at.localeCompare(a.sent_at));
    },
  });
}

export function useInvalidateITHandoffPackets() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['aegis', 'it_handoff_packets'] });
}
