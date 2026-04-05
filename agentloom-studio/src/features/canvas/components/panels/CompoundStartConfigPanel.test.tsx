import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CanvasNode } from "../../types";
import {
  buildLoopInputPorts,
  createDefaultLoopStartNodeConfig,
} from "../../types/controlFlow.types";
import { CompoundStartConfigPanel } from "./CompoundStartConfigPanel";

const mocks = vi.hoisted(() => ({
  nodes: [] as CanvasNode[],
  updateNodeData: vi.fn(),
}));

vi.mock("../../stores/canvasStore", () => ({
  useCanvasNodes: () => mocks.nodes,
  useCanvasActions: () => ({
    updateNodeData: mocks.updateNodeData,
  }),
}));

function createLoopParentNode(): CanvasNode {
  return {
    id: "loop-1",
    type: "control",
    position: { x: 0, y: 0 },
    data: {
      label: "循环容器",
      nodeType: "loop",
      category: "control",
      description: "循环容器",
      config: {
        portLabels: {
          "input-0": "旧标签",
        },
      },
      inputPorts: buildLoopInputPorts(["input-0"], {
        "input-0": "旧标签",
      }),
      outputPorts: [],
    },
  };
}

describe("CompoundStartConfigPanel", () => {
  beforeEach(() => {
    mocks.nodes = [createLoopParentNode()];
    mocks.updateNodeData.mockReset();
  });

  it("shows passthrough port editing for loop start nodes", () => {
    render(
      <CompoundStartConfigPanel
        nodeId="start-1"
        nodeType="loop-start"
        parentId="loop-1"
        config={
          createDefaultLoopStartNodeConfig() as unknown as Record<
            string,
            unknown
          >
        }
        onApply={vi.fn()}
      />,
    );

    expect(screen.getByText("固定上下文输出")).toBeInTheDocument();
    expect(screen.getByText("额外透传端口")).toBeInTheDocument();
    expect(screen.getByDisplayValue("旧标签")).toBeInTheDocument();
  });

  it("syncs renamed passthrough ports back to the parent loop and current start node", () => {
    render(
      <CompoundStartConfigPanel
        nodeId="start-1"
        nodeType="loop-start"
        parentId="loop-1"
        config={
          createDefaultLoopStartNodeConfig() as unknown as Record<
            string,
            unknown
          >
        }
        onApply={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByDisplayValue("旧标签"), {
      target: { value: "主人需求" },
    });

    expect(mocks.updateNodeData).toHaveBeenCalledWith(
      "loop-1",
      expect.objectContaining({
        inputPorts: expect.arrayContaining([
          expect.objectContaining({ id: "input-0", label: "主人需求" }),
        ]),
        config: expect.objectContaining({
          portLabels: {
            "input-0": "主人需求",
          },
        }),
      }),
    );

    expect(mocks.updateNodeData).toHaveBeenCalledWith(
      "start-1",
      expect.objectContaining({
        outputPorts: expect.arrayContaining([
          expect.objectContaining({
            id: "input-0",
            label: "主人需求",
            direction: "output",
          }),
        ]),
      }),
    );
  });

  it("can add passthrough ports from the start node panel", async () => {
    const user = userEvent.setup();

    render(
      <CompoundStartConfigPanel
        nodeId="start-1"
        nodeType="loop-start"
        parentId="loop-1"
        config={
          createDefaultLoopStartNodeConfig() as unknown as Record<
            string,
            unknown
          >
        }
        onApply={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "添加透传" }));

    expect(mocks.updateNodeData).toHaveBeenCalledWith(
      "loop-1",
      expect.objectContaining({
        inputPorts: expect.arrayContaining([
          expect.objectContaining({ id: "input-1", label: "输入 2" }),
        ]),
      }),
    );

    expect(mocks.updateNodeData).toHaveBeenCalledWith(
      "start-1",
      expect.objectContaining({
        outputPorts: expect.arrayContaining([
          expect.objectContaining({
            id: "input-1",
            label: "输入 2",
            direction: "output",
          }),
        ]),
      }),
    );
  });
});
