import { useCallback } from 'react'
import type { Connection } from '@xyflow/react'
import { useToast } from '@/shared/ui/toast'
import { previewDagValidation } from '../lib/connectionDagPreview'
import {
  arePortDataTypesCompatible,
  evaluateConnection,
  getCachedConnectionEvaluation,
  resolveConnectionPorts,
} from '../lib/connectionCompatibility'
import {
  createDefaultEdgeData,
  type CanvasEdge,
  type CanvasEdgeData,
  type CanvasNode,
} from '../types'

const COMPATIBILITY_REASON_LABELS: Record<string, string> = {
  type_mismatch_no_transform: '当前端口类型不兼容，且没有可用转换',
  shape_mismatch: '数据结构不兼容',
  array_cardinality_mismatch: '数组长度约束不兼容',
  scalar_schema_mismatch: '字段类型不兼容',
}

export interface UseConnectionValidationOptions {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  isEditingDisabled: boolean
  createConnection: (connection: Connection, edgeData: CanvasEdgeData) => void
}

export interface UseConnectionValidationResult {
  onConnect: (connection: Connection) => Promise<void>
  isValidConnection: (connectionOrEdge: Connection | CanvasEdge) => boolean
}

/**
 * 落边前的兼容性与 DAG 校验。
 * `isValidConnection` 只做同步 guard（cache + dataType），`onConnect` 才 await 最终兼容性。
 */
export function useConnectionValidation({
  nodes,
  edges,
  isEditingDisabled,
  createConnection,
}: UseConnectionValidationOptions): UseConnectionValidationResult {
  const { notify } = useToast()

  const onConnect = useCallback(
    async (connection: Connection) => {
      if (isEditingDisabled) {
        return
      }

      const evaluated = await evaluateConnection(nodes, connection, edges)
      if (!evaluated.compatible) {
        const reasonKey = evaluated.edgeData.reasonKey
        notify({
          description: `无法创建连接：${reasonKey ? (COMPATIBILITY_REASON_LABELS[reasonKey] ?? reasonKey) : '未知原因'}`,
          variant: 'error',
        })
        return
      }

      const validationPreview = previewDagValidation(
        nodes,
        edges,
        connection,
        evaluated.edgeData,
      )
      if (!validationPreview.tentativeEdge) {
        return
      }

      if (validationPreview.blockingError) {
        if (validationPreview.blockingError.type === 'cycle') {
          console.warn('检测到循环依赖，已阻止创建连接', {
            connection,
            error: validationPreview.blockingError,
          })
          notify({
            description: '无法创建连接：检测到循环依赖',
            variant: 'error',
          })
          return
        }

        notify({
          description: validationPreview.blockingError.message,
          variant: 'error',
        })
        return
      }

      createConnection(connection, evaluated.edgeData)

      for (const warn of validationPreview.warnings) {
        notify({ description: warn.message, variant: 'warning' })
      }
    },
    [createConnection, edges, isEditingDisabled, nodes, notify],
  )

  const isValidConnection = useCallback(
    (connectionOrEdge: Connection | CanvasEdge) => {
      if (isEditingDisabled) {
        return false
      }

      const cachedEvaluation = getCachedConnectionEvaluation(
        nodes,
        connectionOrEdge,
        edges,
      )
      if (cachedEvaluation && !cachedEvaluation.compatible) {
        return false
      }

      // 缓存未命中时，同步检查端口 dataType 兼容性
      if (!cachedEvaluation) {
        const resolved = resolveConnectionPorts(nodes, connectionOrEdge)
        if (
          resolved &&
          !arePortDataTypesCompatible(
            resolved.source.port.dataType,
            resolved.target.port.dataType,
          )
        ) {
          return false
        }
      }

      const validationPreview = previewDagValidation(
        nodes,
        edges,
        connectionOrEdge,
        cachedEvaluation?.edgeData ?? createDefaultEdgeData(),
      )

      return validationPreview.blockingError === null
    },
    [edges, isEditingDisabled, nodes],
  )

  return { onConnect, isValidConnection }
}
