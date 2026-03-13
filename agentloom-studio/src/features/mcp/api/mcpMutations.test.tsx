import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mcpKeys } from "./mcpKeys";
import {
  useDeactivateMcpTool,
  useDiscoverMcpTools,
  useImportMcpTools,
  useRediscoverMcpTools,
  useReimportMcpTools,
  useTestMcpConnection,
  useTestSavedMcpConnection,
} from "./mcpMutations";

const postMock = vi.fn();
const toSnakeBodyMock = vi.fn((value) => value);

vi.mock("@/shared/api/client", () => ({
  apiClient: {
    post: (...args: unknown[]) => postMock(...args),
  },
  toSnakeBody: (value: unknown) => toSnakeBodyMock(value),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return {
    queryClient,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

function createDeferredVoid() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolver) => {
    resolve = resolver;
  });

  return { promise, resolve };
}

afterEach(() => {
  postMock.mockReset();
  toSnakeBodyMock.mockClear();
});

describe("mcpMutations", () => {
  it("test posts the connection payload without invalidating tool lists", async () => {
    postMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({
        data: {
          success: true,
          serverInfo: {
            name: "remote-mcp",
            version: "2.0.0",
            protocolVersion: "2025-03-26",
          },
        },
      }),
    });

    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useTestMcpConnection(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          connection: {
            transportType: "streamable_http",
            url: "https://mcp.example.com",
            headers: {
              Authorization: "Bearer demo",
            },
          },
        }),
      ).resolves.toEqual({
        success: true,
        serverInfo: {
          name: "remote-mcp",
          version: "2.0.0",
          protocolVersion: "2025-03-26",
        },
      });
    });

    expect(postMock).toHaveBeenCalledWith("mcp/test", {
      json: {
        connection: {
          transportType: "streamable_http",
          url: "https://mcp.example.com",
          headers: {
            Authorization: "Bearer demo",
          },
        },
      },
    });
    expect(toSnakeBodyMock).toHaveBeenCalledWith({
      connection: {
        transportType: "streamable_http",
        url: "https://mcp.example.com",
        headers: {
          Authorization: "Bearer demo",
        },
      },
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("discover posts the connection payload without invalidating tool lists", async () => {
    postMock.mockReturnValue({
      json: vi
        .fn()
        .mockResolvedValue({ data: { tools: [{ name: "search-files" }] } }),
    });

    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDiscoverMcpTools(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          connection: {
            transportType: "stdio",
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem"],
          },
        }),
      ).resolves.toEqual({ tools: [{ name: "search-files" }] });
    });

    expect(postMock).toHaveBeenCalledWith("mcp/discover", {
      json: {
        connection: {
          transportType: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem"],
        },
      },
    });
    expect(toSnakeBodyMock).toHaveBeenCalledWith({
      connection: {
        transportType: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem"],
      },
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("saved-config test posts only the config id without invalidating tool lists", async () => {
    postMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({
        data: {
          success: true,
          serverInfo: {
            name: "remote-mcp",
            version: "2.0.0",
            protocolVersion: "2025-11-25",
          },
        },
      }),
    });

    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useTestSavedMcpConnection(), {
      wrapper,
    });

    await act(async () => {
      await expect(result.current.mutateAsync("config-1")).resolves.toEqual({
        success: true,
        serverInfo: {
          name: "remote-mcp",
          version: "2.0.0",
          protocolVersion: "2025-11-25",
        },
      });
    });

    expect(postMock).toHaveBeenCalledWith("mcp/configs/config-1/test");
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("import waits for shared MCP list invalidation", async () => {
    postMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({
        data: {
          mcpServerConfigId: "config-1",
          summary: {
            total: 1,
            imported: 1,
            overwritten: 0,
            skipped: 0,
            failed: 0,
          },
          results: [{ toolName: "search-files", status: "imported" }],
        },
      }),
    });

    const { queryClient, wrapper } = createWrapper();
    const invalidateDeferred = createDeferredVoid();
    const invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockReturnValueOnce(invalidateDeferred.promise);

    const { result } = renderHook(() => useImportMcpTools(), { wrapper });

    let settled = false;
    let mutationPromise!: Promise<unknown>;

    await act(async () => {
      mutationPromise = result.current
        .mutateAsync({
          serverName: "Filesystem Server",
          connection: {
            transportType: "stdio",
            command: "npx",
          },
          toolNames: ["search-files"],
          conflictStrategy: "skip",
        })
        .then((value) => {
          settled = true;
          return value;
        });
    });

    expect(postMock).toHaveBeenCalledWith("mcp/import", {
      json: {
        serverName: "Filesystem Server",
        connection: {
          transportType: "stdio",
          command: "npx",
        },
        toolNames: ["search-files"],
        conflictStrategy: "skip",
      },
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: mcpKeys.lists(),
      });
    });

    expect(settled).toBe(false);
    invalidateDeferred.resolve();

    await act(async () => {
      await mutationPromise;
    });
  });

  it("rediscover waits for shared MCP list invalidation", async () => {
    postMock.mockReturnValue({
      json: vi
        .fn()
        .mockResolvedValue({ data: { tools: [{ name: "search-files" }] } }),
    });

    const { queryClient, wrapper } = createWrapper();
    const invalidateDeferred = createDeferredVoid();
    const invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockReturnValueOnce(invalidateDeferred.promise);

    const { result } = renderHook(() => useRediscoverMcpTools(), { wrapper });

    let settled = false;
    let mutationPromise!: Promise<unknown>;

    await act(async () => {
      mutationPromise = result.current.mutateAsync("config-1").then((value) => {
        settled = true;
        return value;
      });
    });

    expect(postMock).toHaveBeenCalledWith("mcp/configs/config-1/rediscover");

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: mcpKeys.lists(),
      });
    });

    expect(settled).toBe(false);
    invalidateDeferred.resolve();

    await act(async () => {
      await mutationPromise;
    });
  });

  it("reimport posts payload and waits for shared MCP list invalidation", async () => {
    postMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({
        data: {
          mcpServerConfigId: "config-1",
          summary: {
            total: 1,
            imported: 0,
            overwritten: 1,
            skipped: 0,
            failed: 0,
          },
          results: [{ toolName: "search-files", status: "overwritten" }],
        },
      }),
    });

    const { queryClient, wrapper } = createWrapper();
    const invalidateDeferred = createDeferredVoid();
    const invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockReturnValueOnce(invalidateDeferred.promise);

    const { result } = renderHook(() => useReimportMcpTools(), { wrapper });

    let settled = false;
    let mutationPromise!: Promise<unknown>;

    await act(async () => {
      mutationPromise = result.current
        .mutateAsync({
          mcpServerConfigId: "config-1",
          toolNames: ["search-files"],
          conflictStrategy: "overwrite",
        })
        .then((value) => {
          settled = true;
          return value;
        });
    });

    expect(postMock).toHaveBeenCalledWith("mcp/configs/config-1/reimport", {
      json: {
        toolNames: ["search-files"],
        conflictStrategy: "overwrite",
      },
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: mcpKeys.lists(),
      });
    });

    expect(settled).toBe(false);
    invalidateDeferred.resolve();

    await act(async () => {
      await mutationPromise;
    });
  });

  it("deactivate waits for shared MCP list invalidation", async () => {
    postMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({
        data: {
          id: "tool-1",
          isActive: false,
        },
      }),
    });

    const { queryClient, wrapper } = createWrapper();
    const invalidateDeferred = createDeferredVoid();
    const invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockReturnValueOnce(invalidateDeferred.promise);

    const { result } = renderHook(() => useDeactivateMcpTool(), { wrapper });

    let settled = false;
    let mutationPromise!: Promise<unknown>;

    await act(async () => {
      mutationPromise = result.current.mutateAsync("tool-1").then((value) => {
        settled = true;
        return value;
      });
    });

    expect(postMock).toHaveBeenCalledWith("mcp/tools/tool-1/deactivate");

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: mcpKeys.lists(),
      });
    });

    expect(settled).toBe(false);
    invalidateDeferred.resolve();

    await act(async () => {
      await mutationPromise;
    });
  });
});
