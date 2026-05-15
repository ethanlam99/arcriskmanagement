import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRepository } from '@/data/RepositoryProvider';
import type { ChatMessageEntity } from '@/types';

export function useChatMessages(strategyChangeId: string) {
  const repo = useRepository();
  return useQuery({
    queryKey: ['aegis', 'chat_messages', strategyChangeId],
    queryFn: () => repo.chatMessages.listByChange(strategyChangeId),
    enabled: !!strategyChangeId,
  });
}

export function useAppendChatMessage() {
  const repo = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<ChatMessageEntity, 'id'>) => repo.chatMessages.append(input),
    onSuccess: (msg) => {
      qc.invalidateQueries({ queryKey: ['aegis', 'chat_messages', msg.strategy_change_id] });
    },
  });
}
