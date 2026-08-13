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
 * 存在该 context 时，画布节点必须与编辑器全局状态（canvasStore / executionStore /
 * 受保护的服务端查询）完全隔离：预览既可能出现在匿名公开页，也可能与编辑器同页共存。
 */
export const PreviewModeContext =
  createContext<PreviewModeContextValue | null>(null);

export function usePreviewMode(): PreviewModeContextValue | null {
  return useContext(PreviewModeContext);
}
