import type { Edge } from '@xyflow/react'
import {
  createDefaultEdgeData,
  type CanvasEdgeData,
  type CanvasNode,
  type FieldMapping,
} from '../types'
import type { PortDefinition } from '../types/nodeTypeRegistry'
import type { PortDataType } from '../types/typeSchema'
import type { TypeEngineCompatibilityResult } from './typeEngine/contracts'
import { flattenSchemaFields } from './typeEngine/fallback'
import { getTypeEngineService } from './typeEngine/service'
import { cloneTypeSchema, getPortContractSignature } from './typeEngine/serialize'

interface ResolvedPortRef {
  node: CanvasNode
  port: PortDefinition
}

export interface EvaluatedConnection {
  edgeData: CanvasEdgeData
  compatible: boolean
}

export interface ConnectionLike {
  id?: string
  source?: string | null
  sourceHandle?: string | null
  target?: string | null
  targetHandle?: string | null
}

function buildIncompatibleEdgeData(reasonKey: string): CanvasEdgeData {
  return {
    ...createDefaultEdgeData(),
    rawCompatibilityLevel: 'INCOMPATIBLE',
    visualLevel: 'error',
    reasonKey,
  }
}

function createIncompatibleResult(reasonKey: string): EvaluatedConnection {
  return {
    compatible: false,
    edgeData: buildIncompatibleEdgeData(reasonKey),
  }
}

function isSameConnection(edge: Edge, connection: ConnectionLike): boolean {
  return (
    edge.id != null
    && connection.id != null
    && edge.id === connection.id
  )
}

function normalizePath(portId: string, path: string): string {
  if (!path) {
    return portId
  }

  if (path.startsWith('[]')) {
    return `${portId}${path}`
  }

  if (path.startsWith(`${portId}.`) || path === portId) {
    return path
  }

  return `${portId}.${path}`
}

function mapVisualLevel(level: CanvasEdgeData['rawCompatibilityLevel']): CanvasEdgeData['visualLevel'] {
  switch (level) {
    case 'EXACT':
      return 'L0'
    case 'TRANSFORM':
    case 'PARTIAL':
      return 'L1'
    case 'INCOMPATIBLE':
      return 'error'
  }
}

function sanitizeMetadata(
  metadata: TypeEngineCompatibilityResult['metadata'],
): CanvasEdgeData['metadata'] {
  return {
    matchedRatio:
      typeof metadata.matchedRatio === 'number' ? metadata.matchedRatio : undefined,
    matchedRequiredCount:
      typeof metadata.matchedRequiredCount === 'number'
        ? metadata.matchedRequiredCount
        : undefined,
    totalRequiredCount:
      typeof metadata.totalRequiredCount === 'number'
        ? metadata.totalRequiredCount
        : undefined,
    unmappedRequiredCount:
      typeof metadata.unmappedRequiredCount === 'number'
        ? metadata.unmappedRequiredCount
        : undefined,
  }
}

function buildMappingSummary(
  mappings: FieldMapping[],
  missingFields: CanvasEdgeData['missingFields'],
): CanvasEdgeData['mappingSummary'] {
  return {
    autoMatchedCount: mappings.filter((mapping) => mapping.autoRecommended).length,
    manualCount: mappings.filter((mapping) => !mapping.autoRecommended).length,
    requiredUnmappedCount: missingFields.filter(
      (field) => field.required && !mappings.some((mapping) => mapping.targetField === field.path),
    ).length,
  }
}

export function adaptCompatibilityToEdgeData(
  result: TypeEngineCompatibilityResult,
  sourcePort: PortDefinition,
  targetPort: PortDefinition,
): CanvasEdgeData {
  const missingFields = result.missingFields.map((field) => ({
    ...field,
    path: normalizePath(targetPort.id, field.path),
    expectedType: cloneTypeSchema(field.expectedType),
  }))

  const candidateMappings = result.candidateMappings.map((mapping) => ({
    ...mapping,
    sourcePath: normalizePath(sourcePort.id, mapping.sourcePath),
    targetPath: normalizePath(targetPort.id, mapping.targetPath),
  }))

  const fieldMapping: FieldMapping[] = []

  return {
    ...createDefaultEdgeData(),
    rawCompatibilityLevel: result.level,
    visualLevel: mapVisualLevel(result.level),
    reasonKey: result.reason,
    transformFn: result.transformFn,
    missingFields,
    candidateMappings,
    fieldMapping,
    metadata: sanitizeMetadata(result.metadata),
    mappingSummary: buildMappingSummary(fieldMapping, missingFields),
  }
}

function getPortFieldPaths(port: PortDefinition): Set<string> {
  return new Set(
    flattenSchemaFields(port.id, port.schema, port.required).map((field) => field.path),
  )
}

export function mergeEdgeDataWithStoredMappings(
  sourcePort: PortDefinition,
  targetPort: PortDefinition,
  nextEdgeData: CanvasEdgeData,
  previousEdgeData: CanvasEdgeData | null | undefined,
): CanvasEdgeData {
  if (nextEdgeData.rawCompatibilityLevel !== 'PARTIAL') {
    return {
      ...nextEdgeData,
      fieldMapping: [],
      mappingSummary: buildMappingSummary([], nextEdgeData.missingFields),
    }
  }

  const validSourceFields = getPortFieldPaths(sourcePort)
  const validTargetFields = getPortFieldPaths(targetPort)
  const fieldMapping = (previousEdgeData?.fieldMapping ?? []).filter(
    (mapping) =>
      validSourceFields.has(mapping.sourceField) && validTargetFields.has(mapping.targetField),
  )

  return {
    ...nextEdgeData,
    fieldMapping,
    mappingSummary: buildMappingSummary(fieldMapping, nextEdgeData.missingFields),
  }
}

export function resolveConnectionPorts(
  nodes: CanvasNode[],
  connection: ConnectionLike,
): { source: ResolvedPortRef; target: ResolvedPortRef } | null {
  if (!connection.source || !connection.sourceHandle || !connection.target || !connection.targetHandle) {
    return null
  }

  const sourceNode = nodes.find((node) => node.id === connection.source)
  const targetNode = nodes.find((node) => node.id === connection.target)
  if (!sourceNode || !targetNode) {
    return null
  }

  const sourcePort = sourceNode.data.outputPorts.find((port) => port.id === connection.sourceHandle)
  const targetPort = targetNode.data.inputPorts.find((port) => port.id === connection.targetHandle)
  if (!sourcePort || !targetPort) {
    return null
  }

  return {
    source: { node: sourceNode, port: sourcePort },
    target: { node: targetNode, port: targetPort },
  }
}

function runSynchronousGuards(
  nodes: CanvasNode[],
  connection: ConnectionLike,
  edges: Edge[],
): { resolved: { source: ResolvedPortRef; target: ResolvedPortRef } } | { rejected: EvaluatedConnection } {
  const resolved = resolveConnectionPorts(nodes, connection)
  if (!resolved) {
    return { rejected: createIncompatibleResult('连接端口不存在') }
  }

  const { source, target } = resolved

  if (source.node.id === target.node.id) {
    return { rejected: createIncompatibleResult('节点不能连接到自身') }
  }

  if (target.port.maxConnections !== null) {
    const existingCount = edges.filter(
      (edge) =>
        edge.target === connection.target
        && edge.targetHandle === connection.targetHandle
        && !isSameConnection(edge, connection),
    ).length

    if (existingCount >= target.port.maxConnections) {
      return {
        rejected: createIncompatibleResult(`端口已达到最大连接数 (${target.port.maxConnections})`),
      }
    }
  }

  return { resolved }
}

export function getCachedConnectionEvaluation(
  nodes: CanvasNode[],
  connection: ConnectionLike | Pick<Edge, 'id' | 'source' | 'sourceHandle' | 'target' | 'targetHandle'>,
  edges: Edge[] = [],
): EvaluatedConnection | null {
  const guarded = runSynchronousGuards(nodes, connection, edges)
  if ('rejected' in guarded) {
    return guarded.rejected
  }

  const { source, target } = guarded.resolved
  const cachedResult = getTypeEngineService().getCachedCompatibility(source.port, target.port)
  if (!cachedResult) {
    return null
  }

  const edgeData = adaptCompatibilityToEdgeData(cachedResult, source.port, target.port)
  return {
    compatible: cachedResult.level !== 'INCOMPATIBLE',
    edgeData,
  }
}

export async function evaluateConnection(
  nodes: CanvasNode[],
  connection: ConnectionLike | Pick<Edge, 'id' | 'source' | 'sourceHandle' | 'target' | 'targetHandle'>,
  edges: Edge[] = [],
): Promise<EvaluatedConnection> {
  const guarded = runSynchronousGuards(nodes, connection, edges)
  if ('rejected' in guarded) {
    return guarded.rejected
  }

  const { source, target } = guarded.resolved
  const sourceSignature = getPortContractSignature(source.port)
  const targetSignature = getPortContractSignature(target.port)
  const result = await getTypeEngineService().evaluateCompatibility(source.port, target.port, {
    sourceNodeId: source.node.id,
    sourcePortId: source.port.id,
    targetNodeId: target.node.id,
    targetPortId: target.port.id,
    sourceSignature,
    targetSignature,
  })

  return {
    compatible: result.level !== 'INCOMPATIBLE',
    edgeData: adaptCompatibilityToEdgeData(result, source.port, target.port),
  }
}

// 已知的端口类型变换对（与 WASM Rust 端 + JS fallback 保持一致）
const SYNC_TRANSFORM_PAIRS: ReadonlySet<string> = new Set([
  'text->json',
  'json->text',
  'skill->text',
])

/**
 * 同步端口 dataType 级别兼容性检查。
 * 用于 ReactFlow 的 isValidConnection 同步回调，在 WASM 缓存未命中时
 * 提供即时的跨类型拦截，避免不兼容连接获得"有效"视觉反馈。
 */
export function arePortDataTypesCompatible(
  sourceType: PortDataType,
  targetType: PortDataType,
): boolean {
  if (sourceType === targetType) {
    return true
  }

  return SYNC_TRANSFORM_PAIRS.has(`${sourceType}->${targetType}`)
}
