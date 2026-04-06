import { useMutation, useQueryClient } from "@tanstack/react-query";

import { conversationKeys } from "./conversationKeys";
import {
  generateConversationTitle,
  updateConversation,
  deleteConversation,
  startConversation,
  type StartConversationPayload,
} from "./conversationApi";

export function useGenerateTitle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["conversation", "generate-title"],
    mutationFn: (conversationId: string) =>
      generateConversationTitle(conversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: conversationKeys.lists(),
      });
    },
    gcTime: 0,
  });
}

export function useStartConversation(agentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["conversation", "start", agentId],
    mutationFn: (payload: StartConversationPayload) =>
      startConversation(agentId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: conversationKeys.list(agentId),
      });
    },
    gcTime: 0,
  });
}

export function useUpdateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["conversation", "update"],
    mutationFn: ({
      conversationId,
      payload,
    }: {
      conversationId: string;
      payload: { title?: string };
    }) => updateConversation(conversationId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: conversationKeys.lists(),
      });
    },
    gcTime: 0,
  });
}

export function useDeleteConversation(agentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["conversation", "delete"],
    mutationFn: (conversationId: string) => deleteConversation(conversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: conversationKeys.list(agentId),
      });
    },
    gcTime: 0,
  });
}
