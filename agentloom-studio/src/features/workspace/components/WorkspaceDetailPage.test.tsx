import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceDetailPage } from "./WorkspaceDetailPage";
import type {
  Workspace,
  WorkspaceFileNode,
  WorkspaceFilePreview,
} from "../types";

const mocks = vi.hoisted(() => ({
  useWorkspaceDetail: vi.fn(),
  useWorkspaceFileTree: vi.fn(),
  useWorkspaceFilePreview: vi.fn(),
  fetchWorkspaceFileRaw: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("../api/workspaceQueries", () => ({
  useWorkspaceDetail: mocks.useWorkspaceDetail,
  useWorkspaceFileTree: mocks.useWorkspaceFileTree,
  useWorkspaceFilePreview: mocks.useWorkspaceFilePreview,
}));

vi.mock("../api/workspaceApi", () => ({
  fetchWorkspaceFileRaw: mocks.fetchWorkspaceFileRaw,
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

function createWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: "ws-1",
    name: "示例工作区",
    description: "用于预览的测试 workspace",
    storageKey: "tenants/t1/workspaces/ws-1/snapshot.tar",
    sizeBytes: 2048,
    status: "ready",
    config: null,
    sourceKind: "manual",
    isAutoArchived: false,
    createdAt: "2026-04-05T10:00:00.000Z",
    updatedAt: "2026-04-05T10:00:00.000Z",
    ...overrides,
  };
}

function createFileNode(
  overrides: Partial<WorkspaceFileNode> = {},
): WorkspaceFileNode {
  return {
    name: "readme.md",
    type: "file",
    path: "readme.md",
    size: 7,
    ...overrides,
  };
}

function createTextPreview(
  overrides: Partial<WorkspaceFilePreview> = {},
): WorkspaceFilePreview {
  return {
    kind: "text",
    path: "readme.md",
    fileName: "readme.md",
    size: 7,
    mimeType: "text/markdown",
    canDownload: true,
    content: "# hello",
    encoding: "utf-8",
    ...overrides,
  } as WorkspaceFilePreview;
}

function setupPage(options?: {
  workspace?: Workspace | null;
  tree?: WorkspaceFileNode[];
  previews?: Record<string, WorkspaceFilePreview>;
}) {
  const workspace = options?.workspace ?? createWorkspace();
  const tree = options?.tree ?? [];
  const previews = options?.previews ?? {};

  mocks.useWorkspaceDetail.mockReturnValue({
    data: workspace,
    isLoading: false,
    isError: !workspace,
    error: workspace ? null : new Error("not found"),
  });

  mocks.useWorkspaceFileTree.mockReturnValue({
    data: tree,
    isLoading: false,
    isError: false,
    error: null,
  });

  mocks.useWorkspaceFilePreview.mockImplementation(
    (_workspaceId: string, filePath: string | null) => ({
      data: filePath ? (previews[filePath] ?? null) : null,
      isLoading: false,
      isError: false,
      error: null,
    }),
  );
}

describe("WorkspaceDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    Object.defineProperty(globalThis.URL, "createObjectURL", {
      writable: true,
      value: vi.fn(() => "blob:http://localhost/workspace-preview"),
    });
    Object.defineProperty(globalThis.URL, "revokeObjectURL", {
      writable: true,
      value: vi.fn(),
    });
  });

  it("点击文本文件后应显示文本预览", async () => {
    setupPage({
      tree: [
        {
          name: "docs",
          type: "directory",
          path: "docs",
          children: [
            createFileNode({
              name: "readme.md",
              path: "docs/readme.md",
            }),
          ],
        },
      ],
      previews: {
        "docs/readme.md": createTextPreview({
          path: "docs/readme.md",
          fileName: "readme.md",
          content: "# docs hello",
        }),
      },
    });

    render(<WorkspaceDetailPage workspaceId="ws-1" />);

    await userEvent.click(screen.getByText("readme.md"));

    expect(
      await screen.findByTestId("workspace-preview-text"),
    ).toHaveTextContent("# docs hello");
  });

  it("点击 PDF 文件后应加载 PDF 预览", async () => {
    setupPage({
      tree: [createFileNode({ name: "spec.pdf", path: "spec.pdf", size: 12 })],
      previews: {
        "spec.pdf": {
          kind: "pdf",
          path: "spec.pdf",
          fileName: "spec.pdf",
          size: 12,
          mimeType: "application/pdf",
          canDownload: true,
        },
      },
    });
    mocks.fetchWorkspaceFileRaw.mockResolvedValue(
      new Blob(["pdf"], { type: "application/pdf" }),
    );

    render(<WorkspaceDetailPage workspaceId="ws-1" />);

    await userEvent.click(screen.getByText("spec.pdf"));

    await waitFor(() => {
      expect(screen.getByTestId("workspace-preview-pdf")).toBeInTheDocument();
      expect(screen.getByTestId("react-pdf-document")).toBeInTheDocument();
    });

    expect(mocks.fetchWorkspaceFileRaw).toHaveBeenCalledWith(
      "ws-1",
      "spec.pdf",
    );
  });

  it("不支持预览的文件应显示原因并允许下载", async () => {
    setupPage({
      tree: [
        createFileNode({ name: "archive.bin", path: "archive.bin", size: 8 }),
      ],
      previews: {
        "archive.bin": {
          kind: "unsupported",
          path: "archive.bin",
          fileName: "archive.bin",
          size: 8,
          mimeType: "application/octet-stream",
          canDownload: true,
          reason: "该文件类型暂不支持在线预览，可下载后在本地查看",
        },
      },
    });
    mocks.fetchWorkspaceFileRaw.mockResolvedValue(
      new Blob(["bin"], { type: "application/octet-stream" }),
    );

    render(<WorkspaceDetailPage workspaceId="ws-1" />);

    await userEvent.click(screen.getByText("archive.bin"));
    expect(
      await screen.findByTestId("workspace-preview-unsupported"),
    ).toHaveTextContent("该文件类型暂不支持在线预览");

    await userEvent.click(screen.getByRole("button", { name: "下载" }));

    await waitFor(() => {
      expect(mocks.fetchWorkspaceFileRaw).toHaveBeenCalledWith(
        "ws-1",
        "archive.bin",
      );
    });
  });
});
