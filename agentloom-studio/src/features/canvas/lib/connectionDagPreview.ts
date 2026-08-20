import type { Connection } from '@xyflow/react'
import {
  validateDag,
  type DagValidationError,
  type DagValidationWarning,
} from './dagValidator'
import type { CanvasEdge, CanvasEdgeData, CanvasNode } from '../types'

export interface DagValidationPreview {
  blockingError: DagValidationError | null
  warnings: DagValidationWarning[]
  tentativeEdge: CanvasEdge | null
}

function buildTentativeEdge(
  connection: Connection | CanvasEdge,
  edgeData: CanvasEdgeData,
): CanvasEdge | null {
  if (!connection.source || !connection.target) {
    return null
  }

  return {
    id: '__tentative__',
    type: 'smart',
    source: connection.source,
    target: connection.target,
    sourceHandle: connection.sourceHandle ?? undefined,
    targetHandle: connection.targetHandle ?? undefined,
    data: edgeData,
  }
}

function normalizeHandle(handle: string | null | undefined): string | null {
  return handle ?? null
}

function isDuplicateConnection(
  connection: Connection | CanvasEdge,
  edges: CanvasEdge[],
): boolean {
  return edges.some(
    (edge) =>
      edge.source === connection.source &&
      edge.target === connection.target &&
      normalizeHandle(edge.sourceHandle) ===
        normalizeHandle(connection.sourceHandle) &&
      normalizeHandle(edge.targetHandle) ===
        normalizeHandle(connection.targetHandle),
  )
}

export function previewDagValidation(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  connection: Connection | CanvasEdge,
  edgeData: CanvasEdgeData,
): DagValidationPreview {
  const tentativeEdge = buildTentativeEdge(connection, edgeData)
  if (!tentativeEdge || isDuplicateConnection(connection, edges)) {
    return {
      blockingError: null,
      warnings: [],
      tentativeEdge: null,
    }
  }

  const validation = validateDag(nodes, [...edges, tentativeEdge])
  const blockingError =
    validation.errors.find((error) => error.type === 'cycle') ??
    validation.errors[0] ??
    null

  return {
    blockingError,
    warnings: validation.warnings,
    tentativeEdge,
  }
}
