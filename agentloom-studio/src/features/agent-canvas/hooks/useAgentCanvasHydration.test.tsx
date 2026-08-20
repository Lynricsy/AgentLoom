import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentDefinition } from "@/features/agent/types";
import { agentKeys } from "@/features/agent/api/agentKeys";
import { useAgentCanvasStore } from "../stores/agent-canvas.store";
import { useAgentCanvasHydration } from "./useAgentCanvasHydration";

const { getAgentMock } = vi.hoisted(() => ({ getAgentMock: vi.fn() }));

vi.mock("@/features/agent/api/agentDefinitionApi", () => ({
  getAgent: getAgentMock,
}));

const snapshot: AgentDefinition = {
  id: "agent-1",
  tenantId: "tenant-1",
  name: "Cached Agent",
  slug: "cached-agent",
  description: null,
  icon: null,
  runtimeMode: "sandbox",
  status: "draft",
  version: 2,
  publishedVersionId: null,
  createdBy: "user-1",
  updatedBy: "user-1",
  createdAt: "2026-08-20T00:00:00.000Z",
  updatedAt: "2026-08-20T00:00:00.000Z",
  resourceSourceKind: "manual",
  systemPrompt: null,
  nodes: [],
  edges: [],
  viewport: null,
  sandboxConfig: { cpu: 1, memory: 512, disk: 1, timeout: 0 },
  workspaceSnapshotId: null,
  inputSchema: null,
  memoryInstanceIds: [],
  sandboxLifecycle: "session",
};

describe("useAgentCanvasHydration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAgentCanvasStore.getState().actions.reset();
  });

  it("hydrates the draft from the same snapshot held by agentKeys.detail", async () => {
    getAgentMock.mockResolvedValue(snapshot);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    renderHook(() => useAgentCanvasHydration("agent-1"), { wrapper });

    await waitFor(() => {
      expect(useAgentCanvasStore.getState().agentId).toBe("agent-1");
    });

    expect(queryClient.getQueryData(agentKeys.detail("agent-1"))).toBe(snapshot);
    expect(useAgentCanvasStore.getState().agentName).toBe(snapshot.name);
    expect(getAgentMock).toHaveBeenCalledTimes(1);
  });
});
