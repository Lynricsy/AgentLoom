import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AgentVersionToolbar } from "./AgentVersionToolbar";

const defaultProps = {
  agentStatus: "draft" as const,
  isCanvasDirty: true,
  isCanvasSaving: false,
  onSaveCanvas: vi.fn(),
  onOpenCreateVersion: vi.fn(),
  onOpenVersionHistory: vi.fn(),
  onOpenPublish: vi.fn(),
};

describe("AgentVersionToolbar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("草稿状态显示草稿徽章", () => {
    render(<AgentVersionToolbar {...defaultProps} agentStatus="draft" />);

    expect(screen.getByTestId("agent-status-badge")).toHaveTextContent("草稿");
  });

  it("已发布状态显示已发布徽章", () => {
    render(<AgentVersionToolbar {...defaultProps} agentStatus="published" />);

    expect(screen.getByTestId("agent-status-badge")).toHaveTextContent(
      "已发布",
    );
  });

  it("已归档状态只保留历史记录按钮", () => {
    render(<AgentVersionToolbar {...defaultProps} agentStatus="archived" />);

    expect(
      screen.queryByTestId("btn-save-agent-canvas"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("btn-create-agent-version"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("btn-agent-version-history")).toBeInTheDocument();
    expect(screen.queryByTestId("btn-publish-agent")).not.toBeInTheDocument();
  });

  it("未传 onShare 时不显示分享按钮", () => {
    render(<AgentVersionToolbar {...defaultProps} />);

    expect(screen.queryByTestId("btn-share-agent")).not.toBeInTheDocument();
  });

  it("传入 onShare 时显示分享按钮并可触发", () => {
    const onShare = vi.fn();
    render(<AgentVersionToolbar {...defaultProps} onShare={onShare} />);

    fireEvent.click(screen.getByTestId("btn-share-agent"));
    expect(onShare).toHaveBeenCalled();
  });

  it("画布未改动时保存画布按钮禁用", () => {
    render(<AgentVersionToolbar {...defaultProps} isCanvasDirty={false} />);

    expect(screen.getByTestId("btn-save-agent-canvas")).toBeDisabled();
  });

  it("点击按钮会触发对应回调", () => {
    render(<AgentVersionToolbar {...defaultProps} />);

    fireEvent.click(screen.getByTestId("btn-save-agent-canvas"));
    fireEvent.click(screen.getByTestId("btn-create-agent-version"));
    fireEvent.click(screen.getByTestId("btn-agent-version-history"));
    fireEvent.click(screen.getByTestId("btn-publish-agent"));

    expect(defaultProps.onSaveCanvas).toHaveBeenCalled();
    expect(defaultProps.onOpenCreateVersion).toHaveBeenCalled();
    expect(defaultProps.onOpenVersionHistory).toHaveBeenCalled();
    expect(defaultProps.onOpenPublish).toHaveBeenCalledWith();
  });
});
