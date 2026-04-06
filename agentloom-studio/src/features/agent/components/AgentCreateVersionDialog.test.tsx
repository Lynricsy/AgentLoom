import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AgentCreateVersionDialog } from "./AgentCreateVersionDialog";

const mutateAsyncMock = vi.fn();
const notifyMock = vi.fn();

vi.mock("../api/agentMutations", () => ({
  useCreateAgentVersion: () => ({
    mutateAsync: mutateAsyncMock,
    isPending: false,
  }),
}));

vi.mock("@/shared/ui/toast", () => ({
  useToast: () => ({ notify: notifyMock }),
}));

const defaultProps = {
  open: true,
  agentId: "agent-001",
  onOpenChange: vi.fn(),
};

describe("AgentCreateVersionDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("打开时渲染保存版本表单", () => {
    render(<AgentCreateVersionDialog {...defaultProps} />);

    expect(screen.getByTestId("agent-version-label-input")).toBeInTheDocument();
    expect(
      screen.getByTestId("confirm-create-agent-version"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("cancel-create-agent-version"),
    ).toBeInTheDocument();
  });

  it("关闭时不渲染内容", () => {
    render(<AgentCreateVersionDialog {...defaultProps} open={false} />);

    expect(
      screen.queryByTestId("agent-version-label-input"),
    ).not.toBeInTheDocument();
  });

  it("提交时带上标签创建版本", async () => {
    mutateAsyncMock.mockResolvedValueOnce({});

    render(<AgentCreateVersionDialog {...defaultProps} />);

    fireEvent.change(screen.getByTestId("agent-version-label-input"), {
      target: { value: "顶部工具栏版本" },
    });
    fireEvent.click(screen.getByTestId("confirm-create-agent-version"));

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        label: "顶部工具栏版本",
      });
    });

    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "版本已保存" }),
    );
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("前置校验返回 false 时不创建版本", async () => {
    const onBeforeCreateVersion = vi.fn().mockResolvedValue(false);

    render(
      <AgentCreateVersionDialog
        {...defaultProps}
        onBeforeCreateVersion={onBeforeCreateVersion}
      />,
    );

    fireEvent.click(screen.getByTestId("confirm-create-agent-version"));

    await waitFor(() => {
      expect(onBeforeCreateVersion).toHaveBeenCalled();
    });
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });
});
