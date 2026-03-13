import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMcpTools } from "./mcpToolQueries";

const mcpFeatureMock = vi.hoisted(() => ({
  useMcpTools: vi.fn(),
}));

vi.mock("@/features/mcp", () => ({
  fetchMcpTools: vi.fn(),
  useMcpTools: mcpFeatureMock.useMcpTools,
}));

describe("canvas mcpToolQueries compatibility layer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates default source to the shared MCP hook", () => {
    const sharedResult = { data: [{ id: "tool-1" }] };
    mcpFeatureMock.useMcpTools.mockReturnValue(sharedResult);

    expect(useMcpTools()).toBe(sharedResult);
    expect(mcpFeatureMock.useMcpTools).toHaveBeenCalledWith("mcp");
  });

  it("delegates explicit source values to the shared MCP hook", () => {
    const sharedResult = { data: [{ id: "tool-2" }] };
    mcpFeatureMock.useMcpTools.mockReturnValue(sharedResult);

    expect(useMcpTools("custom")).toBe(sharedResult);
    expect(mcpFeatureMock.useMcpTools).toHaveBeenCalledWith("custom");
  });
});
