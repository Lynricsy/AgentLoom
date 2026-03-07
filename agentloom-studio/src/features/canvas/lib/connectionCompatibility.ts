/**
 * 本地连线兼容性启发式评估器（Story 2.5 fallback）。
 *
 * TODO(Story-2.4a): 当 Story 2.4a 实现 runtime TypeEngine compatibility provider 后，
 * 此模块中的 evaluateConnection / resolveConnectionPorts 应替换为 2.4a 提供的
 * WASM-backed 兼容性判定。当前本地实现仅基于 dataType + schema 结构比较，
 * 足以驱动 2.5 的全部 UI 渲染，但不具备 TypeEngine 的完整语义推断能力。
 */
import type { Edge } from '@xyflow/react'
import { createDefaultEdgeData, type CanvasEdgeData, type CanvasNode } from '../types'
import type { PortDefinition } from '../types/nodeTypeRegistry'
import type { TypeSchema } from '../types/typeSchema'

interface FlatSchemaField {
  path: string
  normalizedPath: string
  leafKey: string
  normalizedLeafKey: string
  schema: TypeSchema
  required: boolean
}

interface ResolvedPortRef {
  node: CanvasNode
  port: PortDefinition
}

export interface EvaluatedConnection {
  edgeData: CanvasEdgeData
  compatible: boolean
}

export interface ConnectionLike {
  source?: string | null
  sourceHandle?: string | null
  target?: string | null
  targetHandle?: string | null
}

function normalizeKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
}

function toComparablePath(path: string): string {
  const [, ...segments] = path.split('.')
  return normalizeKey(segments.join('.'))
}

function schemasExactlyMatch(source: TypeSchema, target: TypeSchema): boolean {
  if (source.kind !== target.kind) {
    return false
  }

  if (source.kind !== 'json' || target.kind !== 'json') {
    return true
  }

  if (source.shape !== target.shape) {
    return false
  }

  if (source.shape === 'array' && target.shape === 'array') {
    return schemasExactlyMatch(source.items, target.items)
  }

  if (source.shape === 'object' && target.shape === 'object') {
    const sourceKeys = Object.keys(source.properties).sort()
    const targetKeys = Object.keys(target.properties).sort()
    if (sourceKeys.length !== targetKeys.length) {
      return false
    }

    for (const key of sourceKeys) {
      const sourceProperty = source.properties[key]
      const targetProperty = target.properties[key]
      if (!sourceProperty || !targetProperty) {
        return false
      }
      if (!schemasExactlyMatch(sourceProperty, targetProperty)) {
        return false
      }
    }

    const sourceRequired = [...(source.required ?? [])].sort()
    const targetRequired = [...(target.required ?? [])].sort()
    return sourceRequired.join('|') === targetRequired.join('|')
  }

  return false
}

function flattenSchemaFields(
  prefix: string,
  schema: TypeSchema,
  required = false,
): FlatSchemaField[] {
  if (schema.kind === 'json' && schema.shape === 'object') {
    return Object.entries(schema.properties).flatMap(([key, value]) => {
      const path = `${prefix}.${key}`
      const nextRequired = (schema.required ?? []).includes(key)
      return flattenSchemaFields(path, value, nextRequired)
    })
  }

  const leafKey = prefix.split('.').at(-1) ?? prefix
  return [
    {
      path: prefix,
      normalizedPath: toComparablePath(prefix),
      leafKey,
      normalizedLeafKey: normalizeKey(leafKey),
      schema,
      required,
    },
  ]
}

function flattenPortFields(port: PortDefinition): FlatSchemaField[] {
  return flattenSchemaFields(port.id, port.schema, port.required)
}

function findBestSourceField(
  targetField: FlatSchemaField,
  sourceFields: FlatSchemaField[],
): FlatSchemaField | null {
  const exactPath = sourceFields.find(
    (field) =>
      field.normalizedPath === targetField.normalizedPath &&
      field.schema.kind === targetField.schema.kind,
  )
  if (exactPath) {
    return exactPath
  }

  const exactLeaf = sourceFields.find(
    (field) =>
      field.normalizedLeafKey === targetField.normalizedLeafKey &&
      field.schema.kind === targetField.schema.kind,
  )
  if (exactLeaf) {
    return exactLeaf
  }

  return null
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

export function evaluateConnection(
  nodes: CanvasNode[],
  connection: ConnectionLike | Pick<Edge, 'source' | 'sourceHandle' | 'target' | 'targetHandle'>,
): EvaluatedConnection {
  const resolved = resolveConnectionPorts(nodes, connection)
  const base = createDefaultEdgeData()

  if (!resolved) {
    return {
      compatible: false,
      edgeData: {
        ...base,
        rawCompatibilityLevel: 'INCOMPATIBLE',
        visualLevel: 'error',
        reasonKey: '连接端口不存在',
      },
    }
  }

  const { source, target } = resolved

  if (source.node.id === target.node.id) {
    return {
      compatible: false,
      edgeData: {
        ...base,
        rawCompatibilityLevel: 'INCOMPATIBLE',
        visualLevel: 'error',
        reasonKey: '节点不能连接到自身',
      },
    }
  }

  if (source.port.dataType !== target.port.dataType) {
    return {
      compatible: false,
      edgeData: {
        ...base,
        rawCompatibilityLevel: 'INCOMPATIBLE',
        visualLevel: 'error',
        reasonKey: `${source.port.dataType} → ${target.port.dataType}`,
      },
    }
  }

  if (schemasExactlyMatch(source.port.schema, target.port.schema)) {
    return {
      compatible: true,
      edgeData: {
        ...base,
        metadata: {
          matchedRequiredCount: 0,
          totalRequiredCount: 0,
          unmappedRequiredCount: 0,
        },
      },
    }
  }

  if (source.port.dataType !== 'json' || target.port.dataType !== 'json') {
    return {
      compatible: false,
      edgeData: {
        ...base,
        rawCompatibilityLevel: 'INCOMPATIBLE',
        visualLevel: 'error',
        reasonKey: `${source.port.dataType} → ${target.port.dataType}`,
      },
    }
  }

  const sourceFields = flattenPortFields(source.port)
  const targetFields = flattenPortFields(target.port)
  const candidateMappings = targetFields
    .map((targetField) => {
      const bestSource = findBestSourceField(targetField, sourceFields)
      if (!bestSource) {
        return null
      }

      const exactLeafMatch = bestSource.normalizedLeafKey === targetField.normalizedLeafKey
      const exactPathMatch = bestSource.normalizedPath === targetField.normalizedPath

      return {
        sourcePath: bestSource.path,
        targetPath: targetField.path,
        confidence: exactPathMatch ? 0.98 : exactLeafMatch ? 0.92 : 0.6,
        autoRecommended: exactPathMatch || exactLeafMatch,
      }
    })
    .filter((mapping): mapping is NonNullable<typeof mapping> => mapping !== null)

  const requiredTargets = targetFields.filter((field) => field.required)
  const autoMatchedRequired = requiredTargets.filter((field) =>
    candidateMappings.some(
      (mapping) => mapping.autoRecommended && mapping.targetPath === field.path,
    ),
  ).length

  const missingFields = requiredTargets
    .filter(
      (field) => !candidateMappings.some((mapping) => mapping.targetPath === field.path),
    )
    .map((field) => ({
      path: field.path,
      expectedType: field.schema,
      required: true,
    }))

  return {
    compatible: true,
    edgeData: {
      ...base,
      rawCompatibilityLevel: 'PARTIAL',
      visualLevel: 'L1',
      reasonKey: '需要字段映射',
      candidateMappings,
      missingFields,
      metadata: {
        matchedRequiredCount: autoMatchedRequired,
        totalRequiredCount: requiredTargets.length,
        unmappedRequiredCount: missingFields.length,
      },
      mappingSummary: {
        autoMatchedCount: 0,
        manualCount: 0,
        requiredUnmappedCount: missingFields.length,
      },
    },
  }
}
