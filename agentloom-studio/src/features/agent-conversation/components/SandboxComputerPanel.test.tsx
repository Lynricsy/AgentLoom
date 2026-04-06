import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ToolCallData } from "@/shared/components/tool-renderers/types";
import { SandboxComputerPanel } from "./SandboxComputerPanel";

const {
  useConversationSandboxProcessesMock,
  useConversationSandboxStatsMock,
} = vi.hoisted(() => ({
  useConversationSandboxProcessesMock: vi.fn(),
  useConversationSandboxStatsMock: vi.fn(),
}));

vi.mock("../api/conversationQueries", () => ({
  useConversationSandboxProcesses: (...args: unknown[]) =>
    useConversationSandboxProcessesMock(...args),
  useConversationSandboxStats: (...args: unknown[]) =>
    useConversationSandboxStatsMock(...args),
}));

describe("SandboxComputerPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useConversationSandboxStatsMock.mockReturnValue({
      data: {
        cpuPercent: 18.4,
        memoryUsageMb: 128,
        memoryLimitMb: 512,
        diskUsage: 0,
        diskTotal: 2 * 1024 * 1024 * 1024,
      },
    });
    useConversationSandboxProcessesMock.mockReturnValue({
      data: [
        {
          pid: 1,
          cpuPercent: 18.4,
          memoryPercent: 6.2,
          state: "Ss",
          elapsed: "12:34",
          executable: "node",
          command: "node dist/server.js",
        },
        {
          pid: 22,
          cpuPercent: 0.5,
          memoryPercent: 1.1,
          state: "Sl",
          elapsed: "00:03",
          executable: "bash",
          command: "bash -lc pnpm test",
        },
      ],
      isLoading: false,
    });
  });

  it("应显示会话沙箱的实际 CPU、内存、磁盘与真实进程表", () => {
    render(
      <SandboxComputerPanel
        conversationId="conv-1"
        agentName="测试 Agent"
        terminalEntries={[]}
        fileChanges={[]}
        sandboxStatus="running"
      />,
    );

    expect(screen.getAllByText("18.4%").length).toBeGreaterThan(0);
    expect(screen.getByText("128 MB / 512 MB")).toBeInTheDocument();
    expect(screen.getByText("0 B / 2.0 GB")).toBeInTheDocument();
    expect(screen.getByTestId("sandbox-process-table")).toBeInTheDocument();
    expect(screen.getByTestId("sandbox-process-row-1")).toBeInTheDocument();
    expect(screen.getByText("node")).toBeInTheDocument();
    expect(screen.getByText("bash -lc pnpm test")).toBeInTheDocument();
    expect(screen.getAllByText("休眠").length).toBeGreaterThan(0);
    expect(screen.getByText("Ss")).toBeInTheDocument();
  });

  it("拿不到真实进程快照时应退回最近活动摘要", () => {
    useConversationSandboxProcessesMock.mockReturnValue({
      data: null,
      isLoading: false,
    });

    render(
      <SandboxComputerPanel
        conversationId={null}
        agentName="测试 Agent"
        terminalEntries={[
          {
            id: "term-1",
            sessionId: "pty-1",
            command: "npm run dev",
            output: "server listening on 3000",
            timestamp: 200,
          },
        ]}
        fileChanges={[]}
        sandboxStatus="running"
      />,
    );

    expect(screen.getByTestId("sandbox-process-fallback")).toBeInTheDocument();
    expect(screen.getByText("终端会话 1")).toBeInTheDocument();
    expect(screen.getByText("PTY pty-1")).toBeInTheDocument();
    expect(screen.getByText("npm run dev")).toBeInTheDocument();
    expect(screen.getByText("server listening on 3000")).toBeInTheDocument();
  });

  it("有活跃工具调用时应自动切到工具标签", () => {
    const activeToolCall: ToolCallData = {
      id: "tool-1",
      tool: "bash",
      status: "awaiting_permission",
      error: "",
    };

    render(
      <SandboxComputerPanel
        conversationId="conv-1"
        agentName="测试 Agent"
        terminalEntries={[]}
        fileChanges={[
          {
            path: "workspace/a.txt",
            changeType: "created",
          },
        ]}
        sandboxStatus="running"
        activeToolCall={activeToolCall}
      />,
    );

    expect(screen.getByText("bash")).toBeInTheDocument();
    expect(screen.getByText("执行中")).toBeInTheDocument();
    expect(screen.getByText("文件变更")).toBeInTheDocument();
    expect(screen.getByText("工具")).toBeInTheDocument();
  });
});
