import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToolLibraryPage } from "./ToolLibraryPage";

const mocks = vi.hoisted(() => ({
  useMcpTools: vi.fn(),
  rediscoverMutateAsync: vi.fn(),
  deactivateMutateAsync: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("../api/mcpQueries", () => ({
  useMcpTools: mocks.useMcpTools,
}));

vi.mock("../api/mcpMutations", () => ({
  useRediscoverMcpTools: () => ({
    mutateAsync: mocks.rediscoverMutateAsync,
    isPending: false,
  }),
  useDeactivateMcpTool: () => ({
    mutateAsync: mocks.deactivateMutateAsync,
    isPending: false,
  }),
}));

vi.mock("./McpImportDialog", () => ({
  McpImportDialog: ({
    open,
    mode,
    mcpServerConfigId,
    serverLabel,
  }: {
    open: boolean;
    mode?: "import" | "reimport";
    mcpServerConfigId?: string;
    serverLabel?: string;
  }) =>
    open ? (
      <div data-testid="mcp-import-dialog">{`${mode ?? "import"}:${mcpServerConfigId ?? "new"}:${serverLabel ?? "none"}`}</div>
    ) : null,
}));

vi.mock("@/shared/ui/toast", () => ({
  useToast: () => ({ notify: mocks.notify }),
}));

const mockTools = [
  {
    id: "tool-1",
    name: "search-files",
    title: "搜索文件",
    description: "按关键字搜索文件",
    inputSchema: { type: "object" },
    outputSchema: null,
    portMappingMetadata: {
      inputs: [{ name: "query", dataType: "text" }],
      outputs: [{ name: "result", dataType: "tool" }],
    },
    source: "mcp" as const,
    mcpServerConfigId: "config-1",
    isActive: true,
    annotations: { category: "filesystem" },
    importedAt: "2026-03-12T09:30:00.000Z",
    createdAt: "2026-03-12T09:30:00.000Z",
    updatedAt: "2026-03-12T10:00:00.000Z",
  },
];

describe("ToolLibraryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rediscoverMutateAsync.mockResolvedValue({
      tools: [{ name: "search-files" }],
      serverInfo: { name: "filesystem-server", version: "1.0.0" },
    });
    mocks.deactivateMutateAsync.mockResolvedValue({
      id: "tool-1",
      isActive: false,
    });
    mocks.useMcpTools.mockReturnValue({
      data: mockTools,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it("shows loading, error, and empty states from the shared MCP query", () => {
    mocks.useMcpTools.mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    });

    const { rerender } = render(<ToolLibraryPage />);
    expect(screen.getByText("加载工具中…")).toBeInTheDocument();

    mocks.useMcpTools.mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      error: new Error("网络错误"),
      refetch: vi.fn(),
    });

    rerender(<ToolLibraryPage />);
    expect(screen.getByText("工具库加载失败")).toBeInTheDocument();
    expect(screen.getByText("网络错误")).toBeInTheDocument();

    mocks.useMcpTools.mockReturnValueOnce({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    rerender(<ToolLibraryPage />);
    expect(screen.getByText("还没有导入任何 MCP 工具")).toBeInTheDocument();
  });

  it("renders richer management metadata and opens the import dialog", async () => {
    const user = userEvent.setup();
    render(<ToolLibraryPage />);

    expect(screen.getByText("工具库")).toBeInTheDocument();
    expect(screen.getByText("工具总数")).toBeInTheDocument();
    expect(screen.getAllByText("关联配置").length).toBeGreaterThan(0);
    expect(screen.getByText("来源 MCP")).toBeInTheDocument();
    expect(screen.getByText("已启用")).toBeInTheDocument();
    expect(screen.getByText("config-1")).toBeInTheDocument();
    expect(screen.getByText("输入 1")).toBeInTheDocument();
    expect(screen.getByText("输出 1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "导入 MCP 工具" }));

    expect(screen.getByTestId("mcp-import-dialog")).toHaveTextContent(
      "import:new:none",
    );
  });

  it("supports rediscover, reimport, and deactivate actions from the tool library page", async () => {
    const user = userEvent.setup();
    render(<ToolLibraryPage />);

    await user.click(screen.getByRole("button", { name: "重新发现工具" }));

    await waitFor(() => {
      expect(mocks.rediscoverMutateAsync).toHaveBeenCalledWith("config-1");
    });

    await user.click(screen.getByRole("button", { name: "重新导入工具" }));
    expect(screen.getByTestId("mcp-import-dialog")).toHaveTextContent(
      "reimport:config-1:配置 config-1",
    );

    await user.click(screen.getByRole("button", { name: "停用 搜索文件" }));
    expect(
      screen.getByRole("dialog", { name: "停用 MCP 工具" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "确认停用" }));

    await waitFor(() => {
      expect(mocks.deactivateMutateAsync).toHaveBeenCalledWith("tool-1");
    });
  });
});
