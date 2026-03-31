import { useCallback, useEffect, useRef } from 'react'
import type { OnConnectStartParams } from '@xyflow/react'
import { arePortDataTypesCompatible } from '../lib/connectionCompatibility'
import type { PortDataType } from '../types/typeSchema'

/**
 * 拖连线时用于端口高亮的 CSS 类名。
 * 与 WorkflowCanvas / index.css 中定义的类名保持一致。
 */
const HANDLE_SELECTOR = '[data-node-id][data-port-id][data-port-direction]'
const SOURCE_CLASS = 'typed-port--connect-source'
const COMPATIBLE_CLASS = 'typed-port--connect-compatible'
const INCOMPATIBLE_CLASS = 'connection-overlay-port-dimmed'

function escapeSelectorValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function getHandleElement(
  root: HTMLElement,
  nodeId: string,
  portId: string,
  direction: 'input' | 'output',
): HTMLElement | null {
  return root.querySelector<HTMLElement>(
    `${HANDLE_SELECTOR}[data-node-id="${escapeSelectorValue(nodeId)}"][data-port-id="${escapeSelectorValue(portId)}"][data-port-direction="${direction}"]`,
  )
}

function clearConnectionClasses(root: HTMLElement) {
  root
    .querySelectorAll<HTMLElement>(
      `.${SOURCE_CLASS}, .${COMPATIBLE_CLASS}, .${INCOMPATIBLE_CLASS}`,
    )
    .forEach((element) => {
      element.classList.remove(SOURCE_CLASS, COMPATIBLE_CLASS, INCOMPATIBLE_CLASS)
    })
}

interface PortInfo {
  nodeId: string
  portId: string
  dataType: PortDataType
}

/**
 * 从 DOM 中读取所有端口信息，用于连接兼容性预评估。
 */
function collectTargetPorts(
  root: HTMLElement,
  sourceNodeId: string,
  targetDirection: 'input' | 'output',
): PortInfo[] {
  const targets: PortInfo[] = []
  root
    .querySelectorAll<HTMLElement>(
      `${HANDLE_SELECTOR}[data-port-direction="${targetDirection}"]`,
    )
    .forEach((element) => {
      const nodeId = element.dataset.nodeId
      const portId = element.dataset.portId
      const portType = element.dataset.portType as PortDataType | undefined
      if (!nodeId || !portId || !portType || nodeId === sourceNodeId) {
        return
      }
      targets.push({ nodeId, portId, dataType: portType })
    })
  return targets
}

export interface UseConnectionPreviewOptions {
  /** ReactFlow 容器的 ref */
  containerRef: React.RefObject<HTMLDivElement | null>
  /** 是否为只读模式（只读时不启用预览） */
  isReadOnly?: boolean
}

export interface UseConnectionPreviewReturn {
  onConnectStart: (event: MouseEvent | TouchEvent, params: OnConnectStartParams) => void
  onConnectEnd: () => void
}

/**
 * 共享 hook: 拖连线时给兼容/不兼容端口添加 CSS 高亮类。
 *
 * 仅使用同步的 `arePortDataTypesCompatible()` 做 dataType 级别评估，
 * 不涉及异步 WASM TypeEngine 深度检查。
 *
 * Workflow 画布和 Agent 画布均可使用。
 */
export function useConnectionPreview({
  containerRef,
  isReadOnly = false,
}: UseConnectionPreviewOptions): UseConnectionPreviewReturn {
  const sessionRef = useRef(0)

  // 组件卸载时清理残留 CSS 类
  useEffect(() => {
    const root = containerRef.current
    return () => {
      if (root) {
        clearConnectionClasses(root)
      }
    }
  }, [containerRef])

  const onConnectStart = useCallback(
    (_event: MouseEvent | TouchEvent, params: OnConnectStartParams) => {
      if (isReadOnly) {
        return
      }

      // 仅处理从输出端口拖出的连接（source handle）
      if (params.handleType !== 'source' || !params.nodeId || !params.handleId) {
        return
      }

      const sourceNodeId = params.nodeId
      const sourceHandleId = params.handleId
      sessionRef.current += 1

      const root = containerRef.current
      if (!root) {
        return
      }

      // 获取源端口元素并读取其 dataType
      const sourceElement = getHandleElement(root, sourceNodeId, sourceHandleId, 'output')
      if (!sourceElement) {
        return
      }

      const sourcePortType = sourceElement.dataset.portType as PortDataType | undefined
      if (!sourcePortType) {
        return
      }

      // 先清理之前残留的 CSS 类
      clearConnectionClasses(root)

      // 标记源端口
      sourceElement.classList.add(SOURCE_CLASS)

      // 遍历所有输入端口，分兼容/不兼容标记
      const targets = collectTargetPorts(root, sourceNodeId, 'input')
      for (const target of targets) {
        const element = getHandleElement(root, target.nodeId, target.portId, 'input')
        if (!element) {
          continue
        }

        if (arePortDataTypesCompatible(sourcePortType, target.dataType)) {
          element.classList.add(COMPATIBLE_CLASS)
        } else {
          element.classList.add(INCOMPATIBLE_CLASS)
        }
      }
    },
    [containerRef, isReadOnly],
  )

  const onConnectEnd = useCallback(() => {
    sessionRef.current += 1
    const root = containerRef.current
    if (root) {
      clearConnectionClasses(root)
    }
  }, [containerRef])

  return { onConnectStart, onConnectEnd }
}
