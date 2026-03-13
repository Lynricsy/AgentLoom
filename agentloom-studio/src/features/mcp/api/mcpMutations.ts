import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  deactivateMcpTool,
  discoverMcpTools,
  importMcpTools,
  rediscoverMcpTools,
  reimportMcpTools,
  testMcpConnection,
  testSavedMcpConnection,
} from "./mcpApi";
import { mcpKeys } from "./mcpKeys";
import type {
  DiscoverMcpToolsPayload,
  ImportMcpToolsPayload,
  ReimportMcpToolsPayload,
  TestMcpConnectionPayload,
} from "../types";

export function useTestMcpConnection() {
  return useMutation({
    mutationKey: [...mcpKeys.all, "test"],
    gcTime: 0,
    mutationFn: (payload: TestMcpConnectionPayload) =>
      testMcpConnection(payload),
  });
}

export function useTestSavedMcpConnection() {
  return useMutation({
    mutationKey: [...mcpKeys.all, "test-saved-config"],
    gcTime: 0,
    mutationFn: (mcpServerConfigId: string) =>
      testSavedMcpConnection(mcpServerConfigId),
  });
}

export function useDiscoverMcpTools() {
  return useMutation({
    mutationKey: [...mcpKeys.all, "discover"],
    gcTime: 0,
    mutationFn: (payload: DiscoverMcpToolsPayload) => discoverMcpTools(payload),
  });
}

export function useImportMcpTools() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...mcpKeys.all, "import"],
    gcTime: 0,
    mutationFn: (payload: ImportMcpToolsPayload) => importMcpTools(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: mcpKeys.lists() });
    },
  });
}

export function useRediscoverMcpTools() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...mcpKeys.all, "rediscover"],
    gcTime: 0,
    mutationFn: (mcpServerConfigId: string) =>
      rediscoverMcpTools(mcpServerConfigId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: mcpKeys.lists() });
    },
  });
}

export function useReimportMcpTools() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...mcpKeys.all, "reimport"],
    gcTime: 0,
    mutationFn: (payload: ReimportMcpToolsPayload) => reimportMcpTools(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: mcpKeys.lists() });
    },
  });
}

export function useDeactivateMcpTool() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...mcpKeys.all, "deactivate"],
    gcTime: 0,
    mutationFn: (toolDefinitionId: string) =>
      deactivateMcpTool(toolDefinitionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: mcpKeys.lists() });
    },
  });
}
