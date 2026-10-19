import { useEffect, useRef } from "react";
import { shallow } from "zustand/shallow";
import { AUTOSAVE_DEBOUNCE_MS } from "@/features/canvas";
import { useAgentCanvasStore } from "../stores/agent-canvas.store";

export interface UseAgentCanvasAutoSaveOptions {
  /** 小屏只读等不可编辑场景传 false */
  enabled: boolean;
  /** 与「保存画布」同一保存路径（useAgentCanvasPersistence.saveCanvas） */
  saveCanvas: () => Promise<void>;
  onError: (error: unknown) => void;
}

/**
 * Agent 画布自动保存：与工作流画布 useAutoSave 相同的防抖语义（VITE_AUTOSAVE_DEBOUNCE_MS），
 * 有未保存修改且内容变化后防抖保存。
 * - 保存进行中的编辑不立即排期；保存返回后若仍有未保存修改（advanceVersion 推进了版本），再排一次。
 * - 保存失败不自动重试，避免失败提示刷屏；下一次编辑会重新排期。
 * - enabled 关闭期间（如离开确认框打开）不保存；重新开启时已有未保存修改则立即排期。
 */
export function useAgentCanvasAutoSave(
  agentId: string,
  { enabled, saveCanvas, onError }: UseAgentCanvasAutoSaveOptions,
) {
  const saveCanvasRef = useRef(saveCanvas);
  const onErrorRef = useRef(onError);
  saveCanvasRef.current = saveCanvas;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;

    const scheduleSave = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const state = useAgentCanvasStore.getState();
        // 手动保存可能已在途或已完成：在途时由其返回后的状态变化重新排期
        if (state.agentId !== agentId || !state.isDirty || state.isSaving) {
          return;
        }
        void saveCanvasRef.current().catch((error: unknown) => {
          onErrorRef.current(error);
        });
      }, AUTOSAVE_DEBOUNCE_MS);
    };

    const unsubscribe = useAgentCanvasStore.subscribe(
      (state) => ({
        agentId: state.agentId,
        isDirty: state.isDirty,
        isSaving: state.isSaving,
        version: state.version,
        nodes: state.nodes,
        edges: state.edges,
        viewport: state.viewport,
        inputSchema: state.inputSchema,
        memoryInstanceIds: state.memoryInstanceIds,
        globalSandboxConfig: state.globalSandboxConfig,
        sandboxLifecycle: state.sandboxLifecycle,
        workspaceId: state.workspaceId,
      }),
      (current, prev) => {
        if (current.agentId !== agentId || !current.isDirty || current.isSaving) {
          return;
        }

        const savedWithPendingEdits =
          prev.isSaving && current.version !== prev.version;
        const edited =
          current.agentId !== prev.agentId ||
          current.isDirty !== prev.isDirty ||
          current.nodes !== prev.nodes ||
          current.edges !== prev.edges ||
          current.viewport !== prev.viewport ||
          current.inputSchema !== prev.inputSchema ||
          current.memoryInstanceIds !== prev.memoryInstanceIds ||
          current.globalSandboxConfig !== prev.globalSandboxConfig ||
          current.sandboxLifecycle !== prev.sandboxLifecycle ||
          current.workspaceId !== prev.workspaceId;
        if (!edited && !savedWithPendingEdits) {
          return;
        }

        scheduleSave();
      },
      { equalityFn: shallow },
    );

    const initial = useAgentCanvasStore.getState();
    if (initial.agentId === agentId && initial.isDirty && !initial.isSaving) {
      scheduleSave();
    }

    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [agentId, enabled]);
}
