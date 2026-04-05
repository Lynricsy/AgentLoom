import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchAllWorkspaces,
  fetchWorkspaceFilePreview,
  fetchWorkspaceFileRaw,
  fetchWorkspaceFileTree,
  fetchWorkspaces,
} from "./workspaceApi";

const mocks = vi.hoisted(() => {
  const jsonMock = vi.fn();
  const blobMock = vi.fn();
  const getMock = vi.fn(() => ({ json: jsonMock, blob: blobMock }));

  return {
    getMock,
    jsonMock,
    blobMock,
  };
});

vi.mock("@/shared/api/client", () => ({
  apiClient: {
    get: mocks.getMock,
  },
}));

describe("workspaceApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetchWorkspaces 应透传 includeAutoArchived 参数", async () => {
    mocks.jsonMock.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    });

    await fetchWorkspaces({
      page: 2,
      pageSize: 50,
      search: "archive",
      includeAutoArchived: true,
    });

    expect(mocks.getMock).toHaveBeenCalledWith("workspaces", {
      searchParams: {
        page: 2,
        pageSize: 50,
        search: "archive",
        includeAutoArchived: "true",
      },
    });
  });

  it("fetchAllWorkspaces 默认应隐藏执行归档快照", async () => {
    mocks.jsonMock.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
    });

    await expect(fetchAllWorkspaces()).resolves.toEqual([]);

    expect(mocks.getMock).toHaveBeenCalledWith("workspaces", {
      searchParams: {
        page: 1,
        pageSize: 100,
        includeAutoArchived: "false",
      },
    });
  });

  it("fetchWorkspaceFileTree 应请求 tree 接口", async () => {
    mocks.jsonMock.mockResolvedValue({
      data: [{ name: "docs", type: "directory", path: "docs", children: [] }],
    });

    await expect(fetchWorkspaceFileTree("ws-1")).resolves.toEqual([
      { name: "docs", type: "directory", path: "docs", children: [] },
    ]);

    expect(mocks.getMock).toHaveBeenCalledWith("workspaces/ws-1/tree");
  });

  it("fetchWorkspaceFilePreview 应编码嵌套路径并请求 preview 接口", async () => {
    mocks.jsonMock.mockResolvedValue({
      data: {
        kind: "text",
        path: "docs/read me.md",
        fileName: "read me.md",
        size: 10,
        mimeType: "text/markdown",
        canDownload: true,
        content: "# hello",
        encoding: "utf-8",
      },
    });

    await fetchWorkspaceFilePreview("ws-1", "docs/read me.md");

    expect(mocks.getMock).toHaveBeenCalledWith(
      "workspaces/ws-1/preview/docs/read%20me.md",
    );
  });

  it("fetchWorkspaceFileRaw 应返回 blob", async () => {
    const blob = new Blob(["pdf"], { type: "application/pdf" });
    mocks.blobMock.mockResolvedValue(blob);

    await expect(fetchWorkspaceFileRaw("ws-1", "spec.pdf")).resolves.toBe(blob);

    expect(mocks.getMock).toHaveBeenCalledWith("workspaces/ws-1/raw/spec.pdf");
  });
});
