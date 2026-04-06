import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ToolCallData } from "@/shared/components/tool-renderers/types";
import { SandboxComputerPanel } from "./SandboxComputerPanel";

vi.mock("../api/conversationQueries", () => ({
  useConversationSandboxStats: vi.fn(() => ({
    data: {
      cpuPercent: 18.4,
      memoryUsageMb: 128,
      memoryLimitMb: 512,
      diskUsage: 0,
      diskTotal: 2 * 1024 * 1024 * 1024,
    },
  })),
}));

describe("SandboxComputerPanel", () => {
  it("应显示会话沙箱的实际 CPU、内存和磁盘值", () => {
    render(
      <SandboxComputerPanel
        conversationId="conv-1"
        agentName="测试 Agent"
        terminalEntries={[]}
        fileChanges={[]}
        sandboxStatus="running"
      />,
    );

    expect(screen.getByText("18.4%")).toBeInTheDocument();
    expect(screen.getByText("128 MB / 512 MB")).toBeInTheDocument();
    expect(screen.getByText("0 B / 2.0 GB")).toBeInTheDocument();
    expect(screen.getByText("进程")).toBeInTheDocument();
  });

  it("应将终端活动重组为进程卡片", () => {
    render(
      <SandboxComputerPanel
        conversationId="conv-1"
        agentName="测试 Agent"
        terminalEntries={[
          {
            id: "term-1",
            sessionId: "pty-1",
            command: "npm run dev",
            output: "starting dev server",
            timestamp: 100,
          },
          {
            id: "term-2",
            sessionId: "pty-1",
            output: "server listening on 3000",
            timestamp: 200,
          },
          {
            id: "term-3",
            sessionId: "pty-2",
            command: "pnpm test",
            output: "2 passed",
            timestamp: 150,
          },
        ]}
        fileChanges={[]}
        sandboxStatus="running"
      />,
    );

    expect(screen.getByText("终端会话 1")).toBeInTheDocument();
    expect(screen.getByText("PTY pty-1")).toBeInTheDocument();
    expect(screen.getByText("npm run dev")).toBeInTheDocument();
    expect(screen.getByText("server listening on 3000")).toBeInTheDocument();
    expect(screen.getByText("输出 2 条")).toBeInTheDocument();
    expect(screen.getByText("活跃")).toBeInTheDocument();
  });

  it("应在进程页展示当前工具调用，同时保留工具和文件变更标签", async () => {
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

    await userEvent.click(screen.getByText("进程"));

    expect(screen.getByText("bash")).toBeInTheDocument();
    expect(screen.getByText("当前前台工具调用")).toBeInTheDocument();
    expect(screen.getByText("待授权")).toBeInTheDocument();
    expect(screen.getByText("工具详情见“工具”标签页")).toBeInTheDocument();
    expect(screen.getByText("文件变更")).toBeInTheDocument();
    expect(screen.getByText("工具")).toBeInTheDocument();
  });
});
