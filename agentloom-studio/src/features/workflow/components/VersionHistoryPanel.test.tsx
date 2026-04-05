import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  VersionListResponse,
  WorkflowVersion,
} from "@/features/workflow/types";

import { VersionHistoryPanel } from "./VersionHistoryPanel";

const mutateAsyncMock = vi.fn();
const notifyMock = vi.fn();

let versionPages: Record<number, VersionListResponse>;
let versionsLoading = false;
let versionsFetching = false;
let requestedPages: number[] = [];

vi.mock("../api/versionQueries", () => ({
  useWorkflowVersions: (
    _workflowId: string,
    filters: { page?: number; pageSize?: number } = {},
  ) => {
    const page = filters.page ?? 1;
    requestedPages.push(page);

    return {
      data: versionsLoading ? undefined : versionPages[page],
      isLoading: versionsLoading,
      isFetching: versionsFetching,
    };
  },
}));

vi.mock("../api/versionMutations", () => ({
  useRollbackVersion: () => ({
    mutateAsync: mutateAsyncMock,
    isPending: false,
  }),
}));

vi.mock("@/shared/ui/toast", () => ({
  useToast: () => ({ notify: notifyMock }),
}));

vi.mock("@/features/canvas/lib/formatRelativeTime", () => ({
  formatRelativeTime: () => "1 小时前",
}));

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

function makePage(
  data: WorkflowVersion[],
  page: number,
  total: number,
  pageSize = 20,
): VersionListResponse {
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

const defaultProps = {
  open: true,
  workflowId: "wf-001",
  workflowStatus: "draft" as const,
  onClose: vi.fn(),
  onPublish: vi.fn(),
};

describe("VersionHistoryPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestedPages = [];
    versionsLoading = false;
    versionsFetching = false;
    versionPages = {
      1: makePage([], 1, 0),
    };
  });

  it("关闭时面板被移出视口", () => {
    render(<VersionHistoryPanel {...defaultProps} open={false} />);

    const panel = screen.getByTestId("version-history-panel");
    expect(panel.className).toContain("translate-x-full");
  });

  it("打开时面板可见", () => {
    render(<VersionHistoryPanel {...defaultProps} open={true} />);

    const panel = screen.getByTestId("version-history-panel");
    expect(panel.className).toContain("translate-x-0");
  });

  it("加载时显示骨架屏", () => {
    versionsLoading = true;

    render(<VersionHistoryPanel {...defaultProps} />);

    expect(
      screen.getAllByTestId("version-item-skeleton").length,
    ).toBeGreaterThan(0);
  });

  it("无版本时显示新的空状态文案", () => {
    render(<VersionHistoryPanel {...defaultProps} />);

    expect(screen.getByTestId("version-list-empty")).toBeInTheDocument();
    expect(screen.getByText("暂无发布记录或快照")).toBeInTheDocument();
    expect(
      screen.getByText("保存快照或发布当前画布后，会在这里展示历史记录"),
    ).toBeInTheDocument();
  });

  it("渲染版本列表并显示创建者", () => {
    versionPages = {
      1: makePage(
        [
          makeVersion({
            id: "ver-002",
            versionNumber: 2,
            label: "稳定版本",
            createdBy: "owner-002",
          }),
          makeVersion({ id: "ver-001", versionNumber: 1 }),
        ],
        1,
        2,
      ),
    };

    render(<VersionHistoryPanel {...defaultProps} />);

    expect(screen.getByTestId("version-item-2")).toBeInTheDocument();
    expect(screen.getByTestId("version-item-1")).toBeInTheDocument();
    expect(screen.getByText("稳定版本")).toBeInTheDocument();
    expect(screen.getByTestId("version-created-by-2")).toHaveTextContent(
      "owner-002",
    );
  });

  it("关闭后重新打开时会重新同步缓存中的第一页版本", async () => {
    versionPages = {
      1: makePage(
        [
          makeVersion({ id: "ver-002", versionNumber: 2, label: "bark" }),
          makeVersion({
            id: "ver-001",
            versionNumber: 1,
            publishedAt: "2024-01-01T00:00:00Z",
          }),
        ],
        1,
        2,
      ),
    };

    const { rerender } = render(
      <VersionHistoryPanel {...defaultProps} open={false} />,
    );

    expect(screen.queryByTestId("version-item-2")).not.toBeInTheDocument();

    rerender(<VersionHistoryPanel {...defaultProps} open={true} />);

    await waitFor(() => {
      expect(screen.getByTestId("version-item-2")).toBeInTheDocument();
    });

    expect(screen.getByTestId("version-item-1")).toBeInTheDocument();
    expect(screen.queryByTestId("version-list-empty")).not.toBeInTheDocument();
  });

  it("当第一页 query 数据原地更新时，仍应优先渲染最新列表而不是保留空态", async () => {
    const cachedFirstPage = makePage([], 1, 0);
    versionPages = {
      1: cachedFirstPage,
    };

    const { rerender } = render(<VersionHistoryPanel {...defaultProps} />);
    expect(screen.getByTestId("version-list-empty")).toBeInTheDocument();

    cachedFirstPage.data = [
      makeVersion({
        id: "ver-001",
        versionNumber: 1,
        publishedAt: "2024-01-01T00:00:00Z",
      }),
    ];
    cachedFirstPage.meta.total = 1;
    cachedFirstPage.meta.totalPages = 1;

    rerender(
      <VersionHistoryPanel {...defaultProps} workflowStatus="published" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("version-item-1")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("version-list-empty")).not.toBeInTheDocument();
  });

  it("已发布版本显示发布标签", () => {
    versionPages = {
      1: makePage(
        [
          makeVersion({
            id: "ver-001",
            versionNumber: 1,
            publishedAt: "2024-01-01T00:00:00Z",
          }),
        ],
        1,
        1,
      ),
    };

    render(<VersionHistoryPanel {...defaultProps} />);

    expect(screen.getByText("当前发布")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
  });

  it("已归档版本显示归档标签", () => {
    versionPages = {
      1: makePage(
        [
          makeVersion({
            id: "ver-001",
            versionNumber: 1,
            archivedAt: "2024-01-01T00:00:00Z",
          }),
        ],
        1,
        1,
      ),
    };

    render(<VersionHistoryPanel {...defaultProps} />);

    expect(screen.getByText("已归档")).toBeInTheDocument();
  });

  it("点击发布按钮调用页面级 onPublish", () => {
    versionPages = {
      1: makePage([makeVersion({ id: "ver-001", versionNumber: 1 })], 1, 1),
    };

    render(<VersionHistoryPanel {...defaultProps} />);
    fireEvent.click(screen.getByTestId("publish-version-1"));

    expect(defaultProps.onPublish).toHaveBeenCalledWith("ver-001");
  });

  describe("回滚", () => {
    beforeEach(() => {
      versionPages = {
        1: makePage(
          [
            makeVersion({ id: "ver-001", versionNumber: 2 }),
            makeVersion({ id: "ver-002", versionNumber: 1 }),
          ],
          1,
          2,
        ),
      };
    });

    it("点击回滚按钮显示确认提示", () => {
      render(<VersionHistoryPanel {...defaultProps} />);

      fireEvent.click(screen.getByTestId("rollback-version-2"));
      expect(screen.getByTestId("rollback-confirm")).toBeInTheDocument();
    });

    it("确认回滚调用 mutateAsync", async () => {
      mutateAsyncMock.mockResolvedValueOnce({});

      render(<VersionHistoryPanel {...defaultProps} />);

      fireEvent.click(screen.getByTestId("rollback-version-2"));
      fireEvent.click(screen.getByTestId("confirm-rollback"));

      await waitFor(() => {
        expect(mutateAsyncMock).toHaveBeenCalledWith("ver-001");
      });
    });

    it("取消回滚隐藏确认提示", () => {
      render(<VersionHistoryPanel {...defaultProps} />);

      fireEvent.click(screen.getByTestId("rollback-version-2"));
      expect(screen.getByTestId("rollback-confirm")).toBeInTheDocument();

      fireEvent.click(screen.getByTestId("cancel-rollback"));
      expect(screen.queryByTestId("rollback-confirm")).not.toBeInTheDocument();
    });
  });

  it("滚动到底部时加载下一页并累积版本", async () => {
    versionPages = {
      1: makePage([makeVersion({ id: "ver-002", versionNumber: 2 })], 1, 2, 1),
      2: makePage([makeVersion({ id: "ver-001", versionNumber: 1 })], 2, 2, 1),
    };

    render(<VersionHistoryPanel {...defaultProps} />);

    const list = screen.getByTestId("version-list");
    Object.defineProperty(list, "scrollHeight", {
      configurable: true,
      value: 600,
    });
    Object.defineProperty(list, "clientHeight", {
      configurable: true,
      value: 200,
    });
    Object.defineProperty(list, "scrollTop", {
      configurable: true,
      value: 340,
      writable: true,
    });

    fireEvent.scroll(list);

    await waitFor(() => {
      expect(requestedPages).toContain(2);
    });

    await waitFor(() => {
      expect(screen.getByTestId("version-item-1")).toBeInTheDocument();
    });

    expect(screen.getByText("已加载 2/2 条记录")).toBeInTheDocument();
    expect(screen.getByText("已加载全部版本")).toBeInTheDocument();
  });

  it("归档工作流隐藏操作按钮", () => {
    versionPages = {
      1: makePage([makeVersion({ id: "ver-001", versionNumber: 1 })], 1, 1),
    };

    render(<VersionHistoryPanel {...defaultProps} workflowStatus="archived" />);

    expect(screen.queryByTestId("rollback-version-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("publish-version-1")).not.toBeInTheDocument();
  });

  it("点击关闭按钮调用 onClose", () => {
    render(<VersionHistoryPanel {...defaultProps} />);

    fireEvent.click(screen.getByTestId("close-version-history"));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});
