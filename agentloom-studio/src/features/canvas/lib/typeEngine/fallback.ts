import { PORT_DATA_TYPE_TRANSFORM_RULES } from '@agentloom/contracts'
import type { PortDefinition } from '../../types/nodeTypeRegistry'
import type { TypeSchema } from '../../types/typeSchema'
import type {
  CandidateFieldMapping,
  MissingFieldInfo,
} from '../../types'
import { cloneTypeSchema, stableStringify } from './serialize'
import type {
  TypeEngineCompatibilityMetadata,
  TypeEngineCompatibilityResult,
} from './contracts'

interface FlatSchemaField {
  path: string
  normalizedPath: string
  normalizedLeafKey: string
  schema: TypeSchema
  required: boolean
}

interface ComparisonState {
  matchedUnits: number
  totalUnits: number
  missingFields: MissingFieldInfo[]
  candidateMappings: CandidateFieldMapping[]
  conflictPath: string | null
  reason: string | null
  transformFn: string | null
  transformUsed: boolean
}

interface TransformRule {
  sourceKind: PortDefinition['dataType']
  targetKind: PortDefinition['dataType']
  reason: string
  transformFn: string
}

// 从 contracts 的 canonical 表派生（权威来源是 type-engine 的 Rust checker）。
// fallback 是 WASM 不可用时的降级实现，规则必须与 WASM 完全一致，
// 否则同一条边在两条求值路径下会给出不同结论。
const TRANSFORM_RULES: TransformRule[] = PORT_DATA_TYPE_TRANSFORM_RULES.map(
  (rule) => ({
    sourceKind: rule.sourceKind,
    targetKind: rule.targetKind,
    reason: rule.reasonKey,
    transformFn: rule.transformFn,
  }),
)

function normalizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
}

function lastSegment(path: string): string {
  const segments = path.split('.')
  return segments.at(-1) ?? path
}

function joinPath(base: string, segment: string): string {
  return base ? `${base}.${segment}` : segment
}

function joinArrayPath(base: string): string {
  return base ? `${base}[]` : '[]'
}

function conflictPath(path: string): string {
  return path ? `root.${path}` : 'root'
}

function kindConflictPath(path: string): string {
  return `${conflictPath(path)}.kind`
}

function shapeConflictPath(path: string): string {
  return `${conflictPath(path)}.shape`
}

function countUnits(schema: TypeSchema): number {
  if (schema.kind !== 'json') {
    return 1
  }

  if (schema.shape === 'array') {
    return Math.max(1, countUnits(schema.items))
  }

  const values = Object.values(schema.properties)
  if (values.length === 0) {
    return 1
  }

  return Math.max(
    1,
    values.reduce((total, value) => total + countUnits(value), 0),
  )
}

function collectSourcePaths(schema: TypeSchema, path = ''): string[] {
  if (schema.kind !== 'json') {
    return path ? [path] : []
  }

  if (schema.shape === 'array') {
    const childPath = joinArrayPath(path)
    return [childPath, ...collectSourcePaths(schema.items, childPath)]
  }

  return Object.entries(schema.properties).flatMap(([fieldName, childSchema]) => {
    const childPath = joinPath(path, fieldName)
    return [childPath, ...collectSourcePaths(childSchema, childPath)]
  })
}

function splitTokens(value: string): string[] {
  const matches = value.match(/[A-Za-z0-9]+/g)
  return matches && matches.length > 0 ? matches : [value]
}

function tokenOverlap(left: string, right: string): number {
  const leftTokens = splitTokens(left)
  const rightTokens = splitTokens(right)
  const matches = leftTokens.filter((token) => rightTokens.includes(token)).length
  if (matches === 0) {
    return 0
  }

  return matches / Math.max(leftTokens.length, rightTokens.length)
}

function fieldSimilarity(sourcePath: string, targetPath: string): number {
  const normalizedSource = normalizeSegment(lastSegment(sourcePath))
  const normalizedTarget = normalizeSegment(lastSegment(targetPath))

  if (!normalizedSource || !normalizedTarget) {
    return 0
  }

  if (sourcePath === targetPath) {
    return 1
  }

  if (normalizedSource === normalizedTarget) {
    return 0.95
  }

  if (
    normalizedSource.includes(normalizedTarget)
    || normalizedTarget.includes(normalizedSource)
  ) {
    return 0.8
  }

  return tokenOverlap(normalizedSource, normalizedTarget)
}

function buildCandidateMappings(
  sourcePaths: string[],
  missingFields: MissingFieldInfo[],
): CandidateFieldMapping[] {
  const candidates = missingFields.flatMap((missingField) =>
    sourcePaths
      .map((sourcePath) => {
        const confidence = fieldSimilarity(sourcePath, missingField.path)
        if (confidence < 0.55) {
          return null
        }

        return {
          sourcePath,
          targetPath: missingField.path,
          confidence,
          autoRecommended: confidence >= 0.85,
        } satisfies CandidateFieldMapping
      })
      .filter((candidate): candidate is CandidateFieldMapping => candidate !== null),
  )

  return candidates
    .sort((left, right) => {
      if (right.confidence !== left.confidence) {
        return right.confidence - left.confidence
      }

      if (left.targetPath !== right.targetPath) {
        return left.targetPath.localeCompare(right.targetPath)
      }

      return left.sourcePath.localeCompare(right.sourcePath)
    })
    .filter((candidate, index, items) => {
      return (
        index === 0
        || candidate.sourcePath !== items[index - 1]?.sourcePath
        || candidate.targetPath !== items[index - 1]?.targetPath
      )
    })
    .slice(0, 6)
}

function exactState(totalUnits: number): ComparisonState {
  return {
    matchedUnits: totalUnits,
    totalUnits,
    missingFields: [],
    candidateMappings: [],
    conflictPath: null,
    reason: null,
    transformFn: null,
    transformUsed: false,
  }
}

function transformState(reason: string, transformFn: string, totalUnits: number): ComparisonState {
  return {
    matchedUnits: totalUnits,
    totalUnits,
    missingFields: [],
    candidateMappings: [],
    conflictPath: null,
    reason,
    transformFn,
    transformUsed: true,
  }
}

function incompatibleState(
  reason: string,
  conflict: string | null,
  totalUnits: number,
): ComparisonState {
  return {
    matchedUnits: 0,
    totalUnits,
    missingFields: [],
    candidateMappings: [],
    conflictPath: conflict,
    reason,
    transformFn: null,
    transformUsed: false,
  }
}

function mergeComparisonState(base: ComparisonState, child: ComparisonState): ComparisonState {
  return {
    matchedUnits: base.matchedUnits + child.matchedUnits,
    totalUnits: base.totalUnits,
    missingFields: [...base.missingFields, ...child.missingFields],
    candidateMappings: [...base.candidateMappings, ...child.candidateMappings],
    conflictPath: base.conflictPath ?? child.conflictPath,
    reason: base.reason ?? child.reason,
    transformFn: base.transformFn ?? child.transformFn,
    transformUsed: base.transformUsed || child.transformUsed,
  }
}

function createEmptyState(totalUnits: number): ComparisonState {
  return {
    matchedUnits: 0,
    totalUnits,
    missingFields: [],
    candidateMappings: [],
    conflictPath: null,
    reason: null,
    transformFn: null,
    transformUsed: false,
  }
}

function compareScalar(source: TypeSchema, target: TypeSchema, path: string): ComparisonState {
  if (stableStringify(source) === stableStringify(target)) {
    return exactState(1)
  }

  return incompatibleState('scalar_schema_mismatch', conflictPath(path), 1)
}

function compareArray(source: TypeSchema, target: TypeSchema, path: string): ComparisonState {
  if (source.kind !== 'json' || target.kind !== 'json' || source.shape !== 'array' || target.shape !== 'array') {
    return incompatibleState('shape_mismatch', shapeConflictPath(path), countUnits(target))
  }

  if (source.minItems != null && target.minItems != null && source.minItems < target.minItems) {
    return incompatibleState(
      'array_cardinality_mismatch',
      `${conflictPath(path)}.minItems`,
      countUnits(target),
    )
  }

  if (source.maxItems != null && target.maxItems != null && source.maxItems > target.maxItems) {
    return incompatibleState(
      'array_cardinality_mismatch',
      `${conflictPath(path)}.maxItems`,
      countUnits(target),
    )
  }

  return compareSchema(source.items, target.items, joinArrayPath(path))
}

function compareObject(source: TypeSchema, target: TypeSchema, path: string): ComparisonState {
  if (source.kind !== 'json' || target.kind !== 'json' || source.shape !== 'object' || target.shape !== 'object') {
    return incompatibleState('shape_mismatch', shapeConflictPath(path), countUnits(target))
  }

  const nextState = Object.entries(target.properties).reduce<ComparisonState>(
    (state, [fieldName, targetSchema]) => {
      const childPath = joinPath(path, fieldName)
      const sourceSchema = source.properties[fieldName]
      const required = (target.required ?? []).includes(fieldName)

      if (!sourceSchema) {
        return {
          ...state,
          missingFields: [
            ...state.missingFields,
            {
              path: childPath,
              expectedType: cloneTypeSchema(targetSchema),
              required,
            },
          ],
        }
      }

      return mergeComparisonState(state, compareSchema(sourceSchema, targetSchema, childPath))
    },
    createEmptyState(countUnits(target)),
  )

  if (nextState.missingFields.length === 0) {
    return nextState
  }

  return {
    ...nextState,
    candidateMappings: buildCandidateMappings(
      collectSourcePaths(source, path),
      nextState.missingFields,
    ),
  }
}

function compareSchema(source: TypeSchema, target: TypeSchema, path: string): ComparisonState {
  if (source.kind !== target.kind) {
    const transformRule = TRANSFORM_RULES.find(
      (rule) => rule.sourceKind === source.kind && rule.targetKind === target.kind,
    )

    if (transformRule) {
      return transformState(
        transformRule.reason,
        transformRule.transformFn,
        countUnits(target),
      )
    }

    return incompatibleState(
      'type_mismatch_no_transform',
      kindConflictPath(path),
      countUnits(target),
    )
  }

  if (source.kind !== 'json' || target.kind !== 'json') {
    return compareScalar(source, target, path)
  }

  if (source.shape !== target.shape) {
    return incompatibleState('shape_mismatch', shapeConflictPath(path), countUnits(target))
  }

  if (source.shape === 'array' && target.shape === 'array') {
    return compareArray(source, target, path)
  }

  return compareObject(source, target, path)
}

function toCompatibilityResult(state: ComparisonState): TypeEngineCompatibilityResult {
  const totalUnits = Math.max(1, state.totalUnits)
  const unmatchedUnits = Math.max(0, totalUnits - state.matchedUnits)
  const metadata: TypeEngineCompatibilityMetadata = {}

  if (state.missingFields.length === 0 && unmatchedUnits === 0) {
    if (state.transformUsed) {
      metadata.matchedRatio = 1
      return {
        level: 'TRANSFORM',
        reason: state.reason,
        missingFields: [],
        candidateMappings: [],
        conflictPath: null,
        transformFn: state.transformFn,
        metadata,
      }
    }

    return {
      level: 'EXACT',
      reason: null,
      missingFields: [],
      candidateMappings: [],
      conflictPath: null,
      transformFn: null,
      metadata,
    }
  }

  if (state.matchedUnits === 0 && state.missingFields.length === 0) {
    return {
      level: 'INCOMPATIBLE',
      reason: state.reason ?? 'type_mismatch_no_transform',
      missingFields: [],
      candidateMappings: [],
      conflictPath: state.conflictPath,
      transformFn: null,
      metadata,
    }
  }

  metadata.matchedRatio = state.matchedUnits / totalUnits
  metadata.matchedRequiredCount = state.matchedUnits
  metadata.totalRequiredCount = totalUnits
  metadata.unmappedRequiredCount = unmatchedUnits

  return {
    level: 'PARTIAL',
    reason: 'partial_field_match',
    missingFields: state.missingFields,
    candidateMappings: state.candidateMappings,
    conflictPath: null,
    transformFn: null,
    metadata,
  }
}

export function evaluateCompatibilityFallback(
  source: PortDefinition,
  target: PortDefinition,
): TypeEngineCompatibilityResult {
  return toCompatibilityResult(compareSchema(source.schema, target.schema, ''))
}

export function flattenSchemaFields(prefix: string, schema: TypeSchema, required = false): FlatSchemaField[] {
  if (schema.kind === 'json' && schema.shape === 'object') {
    return Object.entries(schema.properties).flatMap(([key, value]) => {
      const nextRequired = (schema.required ?? []).includes(key)
      return flattenSchemaFields(joinPath(prefix, key), value, nextRequired)
    })
  }

  const leaf = lastSegment(prefix)
  return [
    {
      path: prefix,
      normalizedPath: normalizeSegment(prefix),
      normalizedLeafKey: normalizeSegment(leaf),
      schema,
      required,
    },
  ]
}
