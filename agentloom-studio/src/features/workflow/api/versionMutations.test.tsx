import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WorkflowVersion } from "../types";

import { versionKeys } from "./versionKeys";
import { workflowKeys } from "./workflowKeys";
import {
  useArchiveWorkflow,
  useCreateVersion,
  usePublishWorkflow,
  useRollbackVersion,
} from "./versionMutations";

const postMock = vi.fn();
const toSnakeBodyMock = vi.fn((value) => value);

vi.mock("../../../shared/api/client", () => ({
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

function makeVersion(
  overrides: Partial<WorkflowVersion> = {},
): WorkflowVersion {
  return {
    id: "ver-001",
    workflowDefinitionId: "wf-001",
    versionNumber: 1,
    label: null,
    snapshot: {
      nodes: [],
      edges: [],
      viewport: null,
      metadata: { nodeCount: 0, edgeCount: 0, createdFromVersion: 1 },
    },
    publishedAt: null,
    archivedAt: null,
    createdBy: "user-001",
    createdAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function createDeferredVoid() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolver) => {
    resolve = resolver;
  });

  return { promise, resolve };
}

function makePage(
  data: WorkflowVersion[],
  page: number,
  total: number,
  pageSize = 20,
) {
  return {
    data,
    meta: {
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

afterEach(() => {
  postMock.mockReset();
  toSnakeBodyMock.mockClear();
});

describe("versionMutations", () => {
  it("createVersion 会提交 snake body 并等待列表失效完成", async () => {
    const version = makeVersion({ label: "v1" });
    postMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({ data: version }),
    });

    const { queryClient, wrapper } = createWrapper();
    queryClient.setQueryData(
      versionKeys.list("wf-001", { page: 1, pageSize: 20 }),
      makePage([], 1, 0),
    );
    const invalidateDeferred = createDeferredVoid();
    const invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockReturnValueOnce(invalidateDeferred.promise);

    const { result } = renderHook(() => useCreateVersion("wf-001"), {
      wrapper,
    });

    let settled = false;
    let mutationPromise!: Promise<WorkflowVersion>;

    await act(async () => {
      mutationPromise = result.current
        .mutateAsync({ label: "v1" })
        .then((value) => {
          settled = true;
          return value;
        });
    });

    expect(postMock).toHaveBeenCalledWith(
      "workflow-definitions/wf-001/versions",
      {
        json: { label: "v1" },
      },
    );
    expect(toSnakeBodyMock).toHaveBeenCalledWith({ label: "v1" });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: versionKeys.lists("wf-001"),
      });
    });

    expect(
      queryClient.getQueryData(
        versionKeys.list("wf-001", { page: 1, pageSize: 20 }),
      ),
    ).toEqual(makePage([version], 1, 1));

    expect(settled).toBe(false);
    invalidateDeferred.resolve();

    await act(async () => {
      await mutationPromise;
    });
  });

  it("rollback 会等待 workflow detail 与 version all 的失效", async () => {
    const version = makeVersion({ id: "ver-002", versionNumber: 2 });
    postMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({ data: version }),
    });

    const { queryClient, wrapper } = createWrapper();
    const firstInvalidate = createDeferredVoid();
    const secondInvalidate = createDeferredVoid();
    const invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockReturnValueOnce(firstInvalidate.promise)
      .mockReturnValueOnce(secondInvalidate.promise);

    const { result } = renderHook(() => useRollbackVersion("wf-001"), {
      wrapper,
    });

    let settled = false;
    let mutationPromise!: Promise<WorkflowVersion>;

    await act(async () => {
      mutationPromise = result.current.mutateAsync("ver-002").then((value) => {
        settled = true;
        return value;
      });
    });

    expect(postMock).toHaveBeenCalledWith(
      "workflow-definitions/wf-001/versions/ver-002/rollback",
    );

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenNthCalledWith(1, {
        queryKey: workflowKeys.detail("wf-001"),
      });
      expect(invalidateSpy).toHaveBeenNthCalledWith(2, {
        queryKey: versionKeys.all("wf-001"),
      });
    });

    expect(settled).toBe(false);
    firstInvalidate.resolve();
    secondInvalidate.resolve();

    await act(async () => {
      await mutationPromise;
    });
  });

  it("publish 会提交 releaseNotes 并等待所有失效完成", async () => {
    const version = makeVersion({
      id: "ver-003",
      versionNumber: 3,
      label: "发布版",
    });
    const publishResponse = {
      data: version,
      warnings: [
        {
          code: "TYPE_MISMATCH_WARNING",
          sourceNodeId: "node-a",
          targetNodeId: "node-b",
          sourcePort: { name: "output", dataType: "text" },
          targetPort: { name: "input", dataType: "json" },
          message: "潜在类型不兼容",
        },
      ],
    };
    postMock.mockReturnValue({
      json: vi.fn().mockResolvedValue(publishResponse),
    });

    const { queryClient, wrapper } = createWrapper();
    queryClient.setQueryData(
      versionKeys.list("wf-001", { page: 1, pageSize: 20 }),
      makePage([], 1, 0),
    );
    const firstInvalidate = createDeferredVoid();
    const secondInvalidate = createDeferredVoid();
    const invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockReturnValueOnce(firstInvalidate.promise)
      .mockReturnValueOnce(secondInvalidate.promise);

    const { result } = renderHook(() => usePublishWorkflow("wf-001"), {
      wrapper,
    });

    let settled = false;
    let mutationPromise!: Promise<unknown>;

    await act(async () => {
      mutationPromise = result.current
        .mutateAsync({
          label: "发布版",
          releaseNotes: "补充发布说明",
          versionId: "ver-003",
        })
        .then((value) => {
          settled = true;
          return value;
        });
    });

    expect(postMock).toHaveBeenCalledWith(
      "workflow-definitions/wf-001/publish",
      {
        json: {
          label: "发布版",
          releaseNotes: "补充发布说明",
          versionId: "ver-003",
        },
      },
    );
    expect(toSnakeBodyMock).toHaveBeenCalledWith({
      label: "发布版",
      releaseNotes: "补充发布说明",
      versionId: "ver-003",
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenNthCalledWith(1, {
        queryKey: workflowKeys.detail("wf-001"),
      });
      expect(invalidateSpy).toHaveBeenNthCalledWith(2, {
        queryKey: versionKeys.all("wf-001"),
      });
    });

    expect(
      queryClient.getQueryData(
        versionKeys.list("wf-001", { page: 1, pageSize: 20 }),
      ),
    ).toEqual(makePage([version], 1, 1));

    expect(settled).toBe(false);
    firstInvalidate.resolve();
    secondInvalidate.resolve();

    await act(async () => {
      await expect(mutationPromise).resolves.toEqual(publishResponse);
    });
  });

  it("archive 会等待所有失效完成", async () => {
    postMock.mockResolvedValue(undefined);

    const { queryClient, wrapper } = createWrapper();
    const firstInvalidate = createDeferredVoid();
    const secondInvalidate = createDeferredVoid();
    const invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockReturnValueOnce(firstInvalidate.promise)
      .mockReturnValueOnce(secondInvalidate.promise);

    const { result } = renderHook(() => useArchiveWorkflow("wf-001"), {
      wrapper,
    });

    let settled = false;
    let mutationPromise!: Promise<void>;

    await act(async () => {
      mutationPromise = result.current.mutateAsync().then(() => {
        settled = true;
      });
    });

    expect(postMock).toHaveBeenCalledWith(
      "workflow-definitions/wf-001/archive",
    );

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenNthCalledWith(1, {
        queryKey: workflowKeys.detail("wf-001"),
      });
      expect(invalidateSpy).toHaveBeenNthCalledWith(2, {
        queryKey: versionKeys.all("wf-001"),
      });
    });

    expect(settled).toBe(false);
    firstInvalidate.resolve();
    secondInvalidate.resolve();

    await act(async () => {
      await mutationPromise;
    });
  });
});
