import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { McpImportDialog } from "./McpImportDialog";

const mocks = vi.hoisted(() => ({
  testMutateAsync: vi.fn(),
  testSavedConfigMutateAsync: vi.fn(),
  discoverMutateAsync: vi.fn(),
  importMutateAsync: vi.fn(),
  rediscoverMutateAsync: vi.fn(),
  reimportMutateAsync: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("../api/mcpMutations", () => ({
  useTestMcpConnection: () => ({
    mutateAsync: mocks.testMutateAsync,
    isPending: false,
  }),
  useTestSavedMcpConnection: () => ({
    mutateAsync: mocks.testSavedConfigMutateAsync,
    isPending: false,
  }),
  useDiscoverMcpTools: () => ({
    mutateAsync: mocks.discoverMutateAsync,
    isPending: false,
  }),
  useImportMcpTools: () => ({
    mutateAsync: mocks.importMutateAsync,
    isPending: false,
  }),
  useRediscoverMcpTools: () => ({
    mutateAsync: mocks.rediscoverMutateAsync,
    isPending: false,
  }),
  useReimportMcpTools: () => ({
    mutateAsync: mocks.reimportMutateAsync,
    isPending: false,
  }),
}));

vi.mock("@/shared/ui/toast", () => ({
  useToast: () => ({ notify: mocks.notify }),
}));

describe("McpImportDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.testMutateAsync.mockResolvedValue({
      success: true,
      serverInfo: {
        name: "filesystem-server",
        version: "1.0.0",
        protocolVersion: "2024-11-05",
      },
    });
    mocks.testSavedConfigMutateAsync.mockResolvedValue({
      success: true,
      serverInfo: {
        name: "filesystem-server",
        version: "1.1.0",
        protocolVersion: "2024-11-05",
      },
    });
    mocks.discoverMutateAsync.mockResolvedValue({
      tools: [
        {
          name: "search-files",
          title: "搜索文件",
          description: "按关键字搜索文件",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
              },
            },
          },
        },
      ],
      serverInfo: {
        name: "filesystem-server",
        version: "1.0.0",
      },
    });
    mocks.importMutateAsync.mockResolvedValue({
      mcpServerConfigId: "config-1",
      summary: {
        total: 1,
        imported: 1,
        overwritten: 0,
        skipped: 0,
        failed: 0,
      },
      results: [
        {
          toolDefinitionId: "tool-1",
          toolName: "search-files",
          status: "imported",
          title: "搜索文件",
        },
      ],
    });
    mocks.rediscoverMutateAsync.mockResolvedValue({
      tools: [
        {
          name: "search-files",
          title: "搜索文件",
          description: "按关键字搜索文件",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
              },
            },
          },
        },
      ],
      serverInfo: {
        name: "filesystem-server",
        version: "1.1.0",
      },
    });
    mocks.reimportMutateAsync.mockResolvedValue({
      mcpServerConfigId: "config-1",
      summary: {
        total: 1,
        imported: 0,
        overwritten: 1,
        skipped: 0,
        failed: 0,
      },
      results: [
        {
          toolDefinitionId: "tool-1",
          toolName: "search-files",
          status: "overwritten",
          title: "搜索文件",
        },
      ],
    });
  });

  it(
    "completes the import flow with explicit test connection, discovery, step-4 selection, and receipt review",
    async () => {
      const user = userEvent.setup();

      render(<McpImportDialog onOpenChange={vi.fn()} open={true} />);

      await user.type(screen.getByLabelText("服务器名称"), "Filesystem Server");
      await user.type(screen.getByLabelText("命令"), "npx");
      await user.type(
        screen.getByLabelText("命令参数"),
        "-y @modelcontextprotocol/server-filesystem",
      );

      await user.click(screen.getByRole("button", { name: "继续测试连接" }));
      expect(screen.getByText("步骤 2 · 测试连接")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "测试连接" }));

      await waitFor(() => {
        expect(mocks.testMutateAsync).toHaveBeenCalledWith({
          connection: {
            transportType: "stdio",
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem"],
            env: undefined,
          },
        });
      });

      expect(screen.getByText("服务器响应正常")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "继续发现工具" }));
      expect(screen.getByText("步骤 3 · 发现工具")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "发现工具" }));

      await waitFor(() => {
        expect(mocks.discoverMutateAsync).toHaveBeenCalledWith({
          connection: {
            transportType: "stdio",
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem"],
            env: undefined,
          },
        });
      });

      expect(screen.getByText("搜索文件")).toBeInTheDocument();
      expect(screen.getByText("按关键字搜索文件")).toBeInTheDocument();
      expect(screen.getByText("查看 inputSchema 摘要")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "继续选择导入" }));
      expect(screen.getByText("步骤 4 · 导入并复核")).toBeInTheDocument();
      expect(screen.getByRole("checkbox", { name: "搜索文件" })).toBeChecked();

      await user.click(screen.getByLabelText("冲突处理策略"));
      await user.click(
        screen.getByRole("option", { name: "跳过已存在工具" }),
      );

      await user.click(screen.getByRole("button", { name: "开始导入" }));

      await waitFor(() => {
        expect(mocks.importMutateAsync).toHaveBeenCalledWith({
          serverName: "Filesystem Server",
          serverDescription: undefined,
          connection: {
            transportType: "stdio",
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem"],
            env: undefined,
          },
          toolNames: ["search-files"],
          conflictStrategy: "skip",
        });
      });

      expect(screen.getByText("导入回执")).toBeInTheDocument();
      expect(screen.getByText("总计处理 1 个")).toBeInTheDocument();
      expect(screen.queryByText("步骤 5 / 5")).not.toBeInTheDocument();
    },
    20_000,
  );

  it("supports reimport mode with saved-config verification and overwrite receipt", async () => {
    const user = userEvent.setup();

    render(
      <McpImportDialog
        mcpServerConfigId="config-1"
        mode="reimport"
        onOpenChange={vi.fn()}
        open={true}
        serverLabel="配置 config-1"
      />,
    );

    expect(screen.queryByLabelText("服务器名称")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "继续测试连接" }));
    await user.click(screen.getByRole("button", { name: "测试连接" }));

    await waitFor(() => {
      expect(mocks.testSavedConfigMutateAsync).toHaveBeenCalledWith("config-1");
    });

    expect(screen.getByText("服务器响应正常")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "继续发现工具" }));
    await user.click(screen.getByRole("button", { name: "发现工具" }));

    await waitFor(() => {
      expect(mocks.rediscoverMutateAsync).toHaveBeenCalledWith("config-1");
    });

    await user.click(screen.getByRole("button", { name: "继续选择导入" }));

    await user.click(screen.getByLabelText("冲突处理策略"));
    await user.click(screen.getByRole("option", { name: "覆盖已存在工具" }));

    await user.click(screen.getByRole("button", { name: "开始重新导入" }));

    await waitFor(() => {
      expect(mocks.reimportMutateAsync).toHaveBeenCalledWith({
        mcpServerConfigId: "config-1",
        toolNames: ["search-files"],
        conflictStrategy: "overwrite",
      });
    });

    expect(screen.getByText("导入回执")).toBeInTheDocument();
    expect(screen.getByText("已覆盖")).toBeInTheDocument();
  });
});
