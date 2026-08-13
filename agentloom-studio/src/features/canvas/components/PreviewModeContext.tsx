import { createContext, useContext } from "react";
import type { Edge } from "@xyflow/react";
import type { LevelOfDetail } from "../hooks/useLevelOfDetail";

export interface PreviewModeContextValue {
  /** 预览图的归一化 edges，代替编辑器 canvasStore.edges */
  edges: Edge[];
  /** 非 null 时强制节点 LOD，忽略 zoom */
  lodOverride: LevelOfDetail | null;
}

/**
 * 预览态上下文
 *
 * 存在该 context 时，画布节点不得让编辑器全局状态（canvasStore / executionStore）
 * 影响渲染，也不得写回这些 store，受保护的服务端查询更不能发出：预览既可能出现在
 * 匿名公开页，也可能与编辑器同页共存，且两侧节点 id 相同。
 *
 * 注意机制差异：查询靠 `enabled: false` 真正不请求，而 store 订阅仍会无条件调用
 * （React hook 顺序不能有条件分支），消费方只是丢弃结果或不渲染对应部件。
 */
export const PreviewModeContext =
  createContext<PreviewModeContextValue | null>(null);

export function usePreviewMode(): PreviewModeContextValue | null {
  return useContext(PreviewModeContext);
}
