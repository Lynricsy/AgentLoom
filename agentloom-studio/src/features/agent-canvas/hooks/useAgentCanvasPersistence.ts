import { useCallback } from "react";
import {
  useCompileAgentConfig,
  useSaveAgentCanvas,
} from "@/features/agent";
import {
  useAgentCanvasStore,
  type AgentCanvasState,
} from "../stores/agent-canvas.store";

function normalizeWorkspaceSnapshotId(
  workspaceId: string | null,
): string | null | undefined {
  if (workspaceId === null) {
    return null;
  }

  const normalized = workspaceId.trim();
  return normalized.length > 0 ? normalized : undefined;
}

/** immer 对改动过的字段换新引用：任一持久化字段引用变化即说明保存期间又有编辑 */
function hasEditsSince(
  saved: AgentCanvasState,
  current: AgentCanvasState,
): boolean {
  return (
    saved.nodes !== current.nodes ||
    saved.edges !== current.edges ||
    saved.viewport !== current.viewport ||
    saved.inputSchema !== current.inputSchema ||
    saved.memoryInstanceIds !== current.memoryInstanceIds ||
    saved.globalSandboxConfig !== current.globalSandboxConfig ||
    saved.sandboxLifecycle !== current.sandboxLifecycle ||
    saved.workspaceId !== current.workspaceId
  );
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
      const current = useAgentCanvasStore.getState();
      if (hasEditsSince(state, current)) {
        current.actions.advanceVersion(result.version);
      } else {
        current.actions.acknowledgeSaved(result.version);
      }

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
