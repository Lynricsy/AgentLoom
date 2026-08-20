import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  compileAgentConfig,
  createAgent,
  createAgentVersion,
  deleteAgent,
  publishAgent,
  saveAgentCanvas,
  updateAgent,
} from "./agentDefinitionApi";
import type {
  CreateAgentPayload,
  CreateAgentVersionPayload,
  PublishAgentPayload,
  SaveAgentCanvasPayload,
  UpdateAgentPayload,
} from "./agentDefinitionApi";
import { agentKeys, agentVersionKeys } from "./agentKeys";

export function useCreateAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["agent", "create"],
    mutationFn: (payload: CreateAgentPayload) => createAgent(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.lists() });
    },
    gcTime: 0,
  });
}

export function useUpdateAgent(agentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["agent", "update", agentId],
    mutationFn: (payload: UpdateAgentPayload) => updateAgent(agentId, payload),
    onSuccess: (data) => {
      queryClient.setQueryData(agentKeys.detail(agentId), data);
      queryClient.invalidateQueries({ queryKey: agentKeys.lists() });
    },
    gcTime: 0,
  });
}
export function useSaveAgentCanvas(agentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["agent", "saveCanvas", agentId],
    mutationFn: (payload: SaveAgentCanvasPayload) =>
      saveAgentCanvas(agentId, payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: agentKeys.detail(agentId) }),
        queryClient.invalidateQueries({ queryKey: agentKeys.lists() }),
      ]);
    },
    gcTime: 0,
  });
}

export function useCompileAgentConfig(agentId: string) {
  return useMutation({
    mutationKey: ["agent", "compile", agentId],
    mutationFn: () => compileAgentConfig(agentId),
    gcTime: 0,
  });
}


export function useDeleteAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["agent", "delete"],
    mutationFn: (agentId: string) => deleteAgent(agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.lists() });
    },
    gcTime: 0,
  });
}

export function useCreateAgentVersion(agentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["agent", "createVersion", agentId],
    mutationFn: (payload: CreateAgentVersionPayload) =>
      createAgentVersion(agentId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: agentVersionKeys.lists(agentId),
      });
    },
    gcTime: 0,
  });
}

export function usePublishAgent(agentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["agent", "publish", agentId],
    mutationFn: (payload: PublishAgentPayload) =>
      publishAgent(agentId, payload),
    onSuccess: async (data) => {
      queryClient.setQueryData(agentKeys.detail(agentId), data);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: agentKeys.detail(agentId),
        }),
        queryClient.invalidateQueries({
          queryKey: agentKeys.lists(),
        }),
        queryClient.invalidateQueries({
          queryKey: agentVersionKeys.all(agentId),
        }),
      ]);
    },
    gcTime: 0,
  });
}
