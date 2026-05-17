import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRepository } from '@/data/RepositoryProvider';
import type { ChatMessageEntity } from '@/types';

export function useChatMessages(riskEditId: string) {
  const repo = useRepository();
  return useQuery({
    queryKey: ['arc', 'chat_messages', riskEditId],
    queryFn: () => repo.chatMessages.listByChange(riskEditId),
    enabled: !!riskEditId,
  });
}

export function useAppendChatMessage() {
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<ChatMessageEntity, 'id'>) => repo.chatMessages.append(input),
    onSuccess: (msg) => {
      qc.invalidateQueries({ queryKey: ['arc', 'chat_messages', msg.risk_edit_id] });
    },
  });
}
