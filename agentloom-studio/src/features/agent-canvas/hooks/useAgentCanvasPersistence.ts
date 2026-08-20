import { useCallback } from "react";
import {
  useCompileAgentConfig,
  useSaveAgentCanvas,
} from "@/features/agent/api/agentMutations";
import { useAgentCanvasStore } from "../stores/agent-canvas.store";

function normalizeWorkspaceSnapshotId(
  workspaceId: string | null,
): string | null | undefined {
  if (workspaceId === null) {
    return null;
  }

  const normalized = workspaceId.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function useAgentCanvasPersistence(agentId: string) {
  const saveMutation = useSaveAgentCanvas(agentId);
  const compileMutation = useCompileAgentConfig(agentId);

  const compileConfig = useCallback(async () => {
    const { actions } = useAgentCanvasStore.getState();
    actions.beginCompiling();

    try {
      await compileMutation.mutateAsync();
      actions.acknowledgeCompiled();
    } catch (error) {
      actions.failCompiling();
      throw error;
    }
  }, [compileMutation]);

  const saveCanvas = useCallback(async () => {
    const state = useAgentCanvasStore.getState();
    if (state.agentId !== agentId) {
      return;
    }

    const workspaceSnapshotId = normalizeWorkspaceSnapshotId(state.workspaceId);
    state.actions.beginSaving();

    try {
      const result = await saveMutation.mutateAsync({
        canvasNodes: state.nodes,
        canvasEdges: state.edges,
        canvasViewport: state.viewport,
        inputSchema: state.inputSchema,
        memoryInstanceIds: state.memoryInstanceIds,
        ...(state.runtimeMode === "sandbox"
          ? {
              globalSandboxConfig: state.globalSandboxConfig,
              sandboxLifecycle: state.sandboxLifecycle,
              ...(workspaceSnapshotId === undefined
                ? {}
                : { workspaceSnapshotId }),
            }
          : { workspaceSnapshotId: null }),
      });
      state.actions.acknowledgeSaved(result.version);

      void compileConfig().catch((error: unknown) => {
        console.warn(
          "[AgentCanvas] 自动编译失败（保存已成功）:",
          error,
        );
      });
    } catch (error) {
      state.actions.failSaving();
      throw error;
    }
  }, [agentId, compileConfig, saveMutation]);

  return { saveCanvas, compileConfig };
}
