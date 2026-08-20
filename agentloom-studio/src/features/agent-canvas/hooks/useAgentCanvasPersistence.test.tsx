import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAgentCanvasStore } from "../stores/agent-canvas.store";
import { useAgentCanvasPersistence } from "./useAgentCanvasPersistence";

const { saveMutateAsync, compileMutateAsync } = vi.hoisted(() => ({
  saveMutateAsync: vi.fn(),
  compileMutateAsync: vi.fn(),
}));

vi.mock("@/features/agent/api/agentMutations", () => ({
  useSaveAgentCanvas: () => ({ mutateAsync: saveMutateAsync }),
  useCompileAgentConfig: () => ({ mutateAsync: compileMutateAsync }),
}));

describe("useAgentCanvasPersistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAgentCanvasStore.getState().actions.reset();
    saveMutateAsync.mockResolvedValue({ version: 4 });
    compileMutateAsync.mockResolvedValue(undefined);
  });

  it("sends the draft through agent mutations and applies only mutation acknowledgements", async () => {
    useAgentCanvasStore.setState({
      agentId: "agent-1",
      version: 3,
      isDirty: true,
      workspaceId: null,
    });
    const { result } = renderHook(() => useAgentCanvasPersistence("agent-1"));

    await act(async () => {
      await result.current.saveCanvas();
    });

    expect(saveMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        canvasNodes: useAgentCanvasStore.getState().nodes,
        canvasEdges: useAgentCanvasStore.getState().edges,
        canvasViewport: useAgentCanvasStore.getState().viewport,
        workspaceSnapshotId: null,
      }),
    );
    expect(useAgentCanvasStore.getState().version).toBe(4);
    expect(useAgentCanvasStore.getState().isDirty).toBe(false);
    await waitFor(() => expect(compileMutateAsync).toHaveBeenCalledTimes(1));
  });

  it("clears saving state when the mutation fails", async () => {
    saveMutateAsync.mockRejectedValue(new Error("save failed"));
    useAgentCanvasStore.setState({ agentId: "agent-1", isDirty: true });
    const { result } = renderHook(() => useAgentCanvasPersistence("agent-1"));

    await act(async () => {
      await expect(result.current.saveCanvas()).rejects.toThrow("save failed");
    });

    expect(useAgentCanvasStore.getState().isSaving).toBe(false);
    expect(useAgentCanvasStore.getState().isDirty).toBe(true);
    expect(compileMutateAsync).not.toHaveBeenCalled();
  });
});
