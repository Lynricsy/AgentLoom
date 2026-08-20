import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentVersion } from "../types";

import { AgentVersionHistoryPanel } from "./AgentVersionHistoryPanel";

let versionPages: Record<
  number,
  {
    data: AgentVersion[];
    meta: { total: number; page: number; pageSize: number; totalPages: number };
  }
>;
let versionsLoading = false;
let versionsFetching = false;

vi.mock("../api/agentQueries", () => ({
  useAgentVersions: (
    _agentId: string,
    filters: { page?: number; pageSize?: number } = {},
  ) => {
    const page = filters.page ?? 1;

    return {
      data: versionsLoading ? undefined : versionPages[page],
      isLoading: versionsLoading,
      isFetching: versionsFetching,
    };
  },
}));

vi.mock("@/features/canvas", () => ({
  formatRelativeTime: () => "1 小时前",
}));

function makeVersion(overrides: Partial<AgentVersion> = {}): AgentVersion {
  return {
    id: "ver-001",
    agentDefinitionId: "agent-001",
    tenantId: "tenant-001",
    versionNumber: 1,
    label: null,
    snapshot: {
      nodes: [],
      edges: [],
      viewport: null,
      metadata: {
        nodeCount: 0,
        edgeCount: 0,
        createdFromVersion: 1,
      },
    },
    publishedAt: null,
    archivedAt: null,
    createdBy: "user-001",
    createdAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function makePage(
  data: AgentVersion[],
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

const defaultProps = {
  open: true,
  agentId: "agent-001",
  agentStatus: "draft" as const,
  onClose: vi.fn(),
  onPublish: vi.fn(),
};

describe("AgentVersionHistoryPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    versionsLoading = false;
    versionsFetching = false;
    versionPages = {
      1: makePage([], 1, 0),
    };
  });

  it("关闭时面板被移出视口", () => {
    render(<AgentVersionHistoryPanel {...defaultProps} open={false} />);

    expect(
      screen.getByTestId("agent-version-history-panel").className,
    ).toContain("translate-x-full");
  });

  it("无版本时显示空状态", () => {
    render(<AgentVersionHistoryPanel {...defaultProps} />);

    expect(screen.getByTestId("agent-version-list-empty")).toBeInTheDocument();
    expect(screen.getByText("暂无版本记录")).toBeInTheDocument();
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

    render(<AgentVersionHistoryPanel {...defaultProps} />);

    expect(screen.getByTestId("agent-version-item-2")).toBeInTheDocument();
    expect(screen.getByText("稳定版本")).toBeInTheDocument();
    expect(screen.getByTestId("agent-version-created-by-2")).toHaveTextContent(
      "owner-002",
    );
  });

  it("点击发布按钮会调用 onPublish", () => {
    versionPages = {
      1: makePage(
        [
          makeVersion({
            id: "ver-002",
            versionNumber: 2,
          }),
        ],
        1,
        1,
      ),
    };

    render(<AgentVersionHistoryPanel {...defaultProps} />);

    fireEvent.click(screen.getByTestId("publish-agent-version-2"));
    expect(defaultProps.onPublish).toHaveBeenCalledWith("ver-002");
  });

  it("当前已发布版本不显示发布按钮", () => {
    versionPages = {
      1: makePage(
        [
          makeVersion({
            id: "ver-002",
            versionNumber: 2,
            publishedAt: "2024-01-01T00:00:00Z",
          }),
        ],
        1,
        1,
      ),
    };

    render(<AgentVersionHistoryPanel {...defaultProps} />);

    expect(
      screen.queryByTestId("publish-agent-version-2"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("当前发布")).toBeInTheDocument();
  });
});
