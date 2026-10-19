import { createContext } from 'react'

/**
 * SmartEdge 的编辑动作由所在画布注入：工作流画布与 Agent 画布各有自己的 store，
 * 边组件不得直接绑定某一个 store。
 * 未提供（只读预览）时不渲染删除按钮；未提供 `openFieldMapping`（Agent 画布无字段映射）时
 * 标签只展示兼容性摘要，不作为按钮。
 */
export interface SmartEdgeActions {
  removeEdge: (edgeId: string) => void
  openFieldMapping?: (edgeId: string) => void
}

export const SmartEdgeActionsContext = createContext<SmartEdgeActions | null>(
  null,
)
