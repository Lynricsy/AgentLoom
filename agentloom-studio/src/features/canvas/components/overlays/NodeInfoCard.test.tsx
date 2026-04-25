import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCanvasStore } from "../../stores/canvasStore";
import type { CanvasNode } from "../../types";
import {
  clonePortDefinitions,
  getNodeTypeConfig,
} from "../../types/nodeTypeRegistry";
import { NodeInfoCard } from "./NodeInfoCard";

const getNodeMock = vi.fn();

vi.mock("@xyflow/react", () => ({
  useReactFlow: () => ({ getNode: getNodeMock }),
  useViewport: () => ({ x: 10, y: 5, zoom: 2 }),
}));

function createNode(): CanvasNode {
  const config = getNodeTypeConfig("agent");

  return {
    id: "node-1",
    type: config.category,
    position: { x: 40, y: 20 },
    measured: { width: 150, height: 80 },
    data: {
      label: "分析 Agent",
      nodeType: config.type,
      category: config.category,
      description: config.description,
      config: {},
      inputPorts: clonePortDefinitions(config.inputPorts),
      outputPorts: clonePortDefinitions(config.outputPorts),
    },
  };
}

function createUnknownNode(): CanvasNode {
  return {
    id: "node-legacy",
    type: "tool",
    position: { x: 10, y: 10 },
    measured: { width: 120, height: 60 },
    data: {
      label: "Legacy Node",
      nodeType: "legacy-node" as CanvasNode["data"]["nodeType"],
      category: "tool",
      description: "历史节点",
      config: {},
      inputPorts: [],
      outputPorts: [],
    },
  };
}

describe("NodeInfoCard", () => {
  beforeEach(() => {
    useCanvasStore.getState().actions.reset();
    getNodeMock.mockReset();
  });

  it("未悬浮节点时不渲染卡片", () => {
    render(<NodeInfoCard />);

    expect(screen.queryByTestId("node-info-card")).not.toBeInTheDocument();
  });

  it("渲染图标、节点名、类型、端口摘要和定位偏移", () => {
    useCanvasStore.getState().actions.setHoveredNodeId("node-1");
    getNodeMock.mockReturnValue(createNode());

    render(<NodeInfoCard />);

    const card = screen.getByTestId("node-info-card");
    expect(card.getAttribute("style")).toContain("translate(402px, 37px)");
    expect(screen.getByTestId("node-info-card-icon")).toBeInTheDocument();
    expect(screen.getByText("分析 Agent")).toBeInTheDocument();
    expect(screen.getAllByText("Agent")).toHaveLength(2);
    expect(screen.getByText("9 输入, 3 输出")).toBeInTheDocument();
    expect(screen.getByText("空闲")).toBeInTheDocument();
  });

  it("未知节点类型时应降级显示而不是抛错", () => {
    useCanvasStore.getState().actions.setHoveredNodeId("node-legacy");
    getNodeMock.mockReturnValue(createUnknownNode());

    render(<NodeInfoCard />);

    expect(screen.getByText("Legacy Node")).toBeInTheDocument();
    expect(screen.getByText("未知节点类型")).toBeInTheDocument();
    expect(screen.getByText("0 输入, 0 输出")).toBeInTheDocument();
  });
});
