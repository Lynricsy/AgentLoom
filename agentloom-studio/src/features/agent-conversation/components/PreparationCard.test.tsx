import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PreparationCard } from "./PreparationCard";

describe("PreparationCard", () => {
  it("无沙箱运行态不展示沙箱启动步骤", () => {
    render(
      <PreparationCard
        phase="running"
        startTime={Date.now()}
        sandboxReused={false}
        showSandboxPhase={false}
        error={null}
        failedPhase={null}
      />,
    );

    expect(screen.queryByText("沙箱启动中")).not.toBeInTheDocument();
    expect(screen.getByText("Agent 初始化")).toBeInTheDocument();
  });

  it("有沙箱运行态展示沙箱启动步骤", () => {
    render(
      <PreparationCard
        phase="running"
        startTime={Date.now()}
        sandboxReused={false}
        showSandboxPhase
        error={null}
        failedPhase={null}
      />,
    );

    expect(screen.getByText("沙箱启动中")).toBeInTheDocument();
  });
});
