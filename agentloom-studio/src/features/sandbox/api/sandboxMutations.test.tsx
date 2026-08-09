import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useStartSandbox } from "./sandboxMutations";
import { sandboxKeys } from "./sandboxKeys";
import type { SandboxListResponse, SandboxSession } from "../types";

const {
  createSandboxMock,
  stopSandboxMock,
  startSandboxMock,
  deleteSandboxMock,
} = vi.hoisted(() => ({
  createSandboxMock: vi.fn(),
  stopSandboxMock: vi.fn(),
  startSandboxMock: vi.fn(),
  deleteSandboxMock: vi.fn(),
}));

vi.mock("./sandboxApi", () => ({
  createSandbox: createSandboxMock,
  stopSandbox: stopSandboxMock,
  startSandbox: startSandboxMock,
  deleteSandbox: deleteSandboxMock,
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return {
    queryClient,
    Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );
    },
  };
}

function makeSession(overrides: Partial<SandboxSession> = {}): SandboxSession {
  return {
    id: "session-1",
    executionId: null,
    agentConversationId: null,
    sandboxNodeId: null,
    status: "stopped",
    config: {
      name: "Persistent Sandbox",
      cpu: 2,
      memory: 2048,
      disk: 20,
      timeout: 24,
      lifecycleMode: "persistent",
    },
    bindingType: "resource",
    workspacePath: "/workspace/",
    startedAt: "2025-01-01T00:00:00.000Z",
    stoppedAt: "2025-01-02T00:00:00.000Z",
    createdAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeListResponse(sessions: SandboxSession[]): SandboxListResponse {
  return {
    data: sessions,
    meta: {
      page: 1,
      pageSize: 20,
      total: sessions.length,
      totalPages: sessions.length > 0 ? 1 : 0,
    },
  };
}

describe("useStartSandbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("资源页启动沙箱时会先乐观切到 creating，并显式刷新活动列表", async () => {
    const stoppedSession = makeSession();
    const creatingSession = makeSession({
      status: "creating",
      startedAt: null,
      stoppedAt: null,
    });
    const params = {
      page: 1,
      pageSize: 20,
      bindingType: "resource" as const,
    };

    let resolveStart: ((value: SandboxSession) => void) | undefined;
    startSandboxMock.mockImplementation(
      () =>
        new Promise<SandboxSession>((resolve) => {
          resolveStart = resolve;
        }),
    );

    const { queryClient, Wrapper } = createWrapper();
    queryClient.setQueryData(
      sandboxKeys.list(params),
      makeListResponse([stoppedSession]),
    );
    queryClient.setQueryData(sandboxKeys.persistent(), [stoppedSession]);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const refetchSpy = vi.spyOn(queryClient, "refetchQueries");

    const { result } = renderHook(() => useStartSandbox(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate(stoppedSession.id);
    });

    await waitFor(() => {
      expect(
        queryClient.getQueryData<SandboxListResponse>(sandboxKeys.list(params))
          ?.data[0]?.status,
      ).toBe("creating");
    });
    expect(
      queryClient.getQueryData<SandboxSession[]>(sandboxKeys.persistent())?.[0]
        ?.status,
    ).toBe("creating");

    await act(async () => {
      resolveStart?.(creatingSession);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: sandboxKeys.lists(),
      });
    });

    expect(refetchSpy).toHaveBeenCalledWith({
      queryKey: sandboxKeys.lists(),
      type: "active",
    });
    expect(refetchSpy).toHaveBeenCalledWith({
      queryKey: sandboxKeys.persistent(),
      type: "active",
    });
    expect(refetchSpy).toHaveBeenCalledWith({
      queryKey: sandboxKeys.stats(stoppedSession.id),
      type: "active",
    });

    expect(
      queryClient.getQueryData<SandboxListResponse>(sandboxKeys.list(params))
        ?.data[0],
    ).toMatchObject({
      id: stoppedSession.id,
      status: "creating",
      startedAt: null,
      stoppedAt: null,
    });
  });
});
