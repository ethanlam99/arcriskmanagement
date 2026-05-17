import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRepository } from '@/data/RepositoryProvider';
import type { Packet, PacketEdit } from '@/types';

export function useITHandoffPackets() {
  const repo = useRepository();
  return useQuery({
    queryKey: ['arc', 'it_handoff_packets'],
    queryFn: async () => {
      const packets = await repo.itHandoffPackets.list();
      return packets.sort((a, b) => b.sent_at.localeCompare(a.sent_at));
    },
  });
}

export function useInvalidateITHandoffPackets() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['arc', 'it_handoff_packets'] });
}

// ── Packet hooks (v0.3) ───────────────────────────────────────────────────────

export function usePackets(filters?: Partial<Packet>) {
  const repo = useRepository();
  return useQuery({
    queryKey: ['arc', 'packets', filters],
    queryFn: () => repo.packets.list(filters as Record<string, unknown>),
  });
}

export function usePacket(id: string) {
  const repo = useRepository();
  return useQuery({
    queryKey: ['arc', 'packets', id],
    queryFn: () => repo.packets.get(id),
    enabled: !!id,
  });
}

export function usePacketEdits(packetId: string) {
  const repo = useRepository();
  return useQuery({
    queryKey: ['arc', 'packet_edits', packetId],
    queryFn: () => repo.packets.getEditsForPacket(packetId),
    enabled: !!packetId,
  });
}

export function useAllPacketEdits() {
  const repo = useRepository();
  return useQuery({
    queryKey: ['arc', 'packet_edits', 'all'],
    queryFn: () => repo.packetEdits.list(),
  });
}

export function useCreatePacket() {
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      name,
      description,
      createdBy,
      riskEditIds,
    }: {
      name: string;
      description?: string;
      createdBy: string;
      riskEditIds: string[];
    }) => {
      const packet = await repo.packets.create({
        name,
        description,
        status: 'proposed',
        created_by: createdBy,
      } as Omit<Packet, 'id' | 'created_at'>);
      const edges = await repo.packets.addEditsToPacket(packet.id, riskEditIds, createdBy);
      return { packet, edges };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['arc', 'packets'] });
      qc.invalidateQueries({ queryKey: ['arc', 'packet_edits'] });
    },
  });
}

export function useUpdatePacketStatus() {
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (update: { id: string } & Partial<Packet>) => {
      const { id, ...rest } = update;
      return repo.packets.update(id, rest);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['arc', 'packets'] });
      qc.invalidateQueries({ queryKey: ['arc', 'packet_edits'] });
    },
  });
}

export function useInvalidatePackets() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['arc', 'packets'] });
    qc.invalidateQueries({ queryKey: ['arc', 'packet_edits'] });
  };
}
