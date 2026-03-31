import {
  useQuery,
  keepPreviousData,
} from '@tanstack/react-query';

import { conversationKeys } from './conversationKeys';
import {
  listConversations,
  type ListConversationsParams,
} from './conversationApi';

export function useConversationList(
  agentId: string,
  params: ListConversationsParams = {},
) {
  return useQuery({
    queryKey: conversationKeys.list(agentId, params as Record<string, unknown>),
    queryFn: () => listConversations(agentId, params),
    placeholderData: keepPreviousData,
    enabled: !!agentId,
  });
}
