import type { CompatibilityLabel, ConfidenceLevel, MappingSuggestion, TypeCoercionConfig } from '../types'
import type { PortDataType, TypeSchema } from '../types/typeSchema'
import { getAvailableStrategies, isCoercible } from './coercionStrategies'

export interface SuggestionField {
  path: string
  schema: TypeSchema
  required: boolean
}

const NAME_WEIGHT = 0.4
const SEMANTIC_WEIGHT = 0.3
const TYPE_WEIGHT = 0.3
const TOP_N = 3
const APPLICABLE_THRESHOLD = 0.70

const SCHEMA_TYPE_LABELS: Record<Exclude<PortDataType, 'json'>, string> = {
  model: '模型',
  text: '文本',
  image: '图像',
  audio: '音频',
  tool: '工具',
  sandbox: '沙箱',
  knowledge: '知识',
  skill: '技能',
  agent: 'Agent',
}

function toCodePoints(value: string): string[] {
  return Array.from(value.normalize('NFC'))
}

function getDefaultParamsForStrategy(
  strategy: TypeCoercionConfig['strategy'],
): Record<string, unknown> | undefined {
  if (strategy === 'toFixed') return { precision: 2 }
  if (strategy === 'join') return { separator: ',' }
  return undefined
}

function getSchemaDescriptor(schema: TypeSchema): string {
  if (schema.kind !== 'json') return schema.kind
  return `json:${schema.shape}`
}

export function getSchemaTypeLabel(schema: TypeSchema): string {
  if (schema.kind !== 'json') return SCHEMA_TYPE_LABELS[schema.kind]
  return schema.shape === 'object' ? '对象' : '数组'
}

export function levenshteinDistance(a: string, b: string): number {
  const left = toCodePoints(a)
  const right = toCodePoints(b)
  const m = left.length
  const n = right.length
  if (m === 0) return n
  if (n === 0) return m

  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i)

  for (let i = 1; i <= m; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= n; j++) {
      const temp = dp[j]
      if (left[i - 1] === right[j - 1]) {
        dp[j] = prev!
      } else {
        dp[j] = 1 + Math.min(prev!, dp[j]!, dp[j - 1]!)
      }
      prev = temp
    }
  }
  return dp[n]!
}

export function normalizedLevenshteinSimilarity(a: string, b: string): number {
  const left = toCodePoints(a)
  const right = toCodePoints(b)
  if (left.length === 0 && right.length === 0) return 1.0
  const maxLen = Math.max(left.length, right.length)
  return 1 - levenshteinDistance(a, b) / maxLen
}

function splitTokens(value: string): string[] {
  const expanded = value
    .normalize('NFKC')
    .replace(/([\p{Ll}\p{Nd}])([\p{Lu}])/gu, '$1_$2')
  const matches = expanded.match(/[\p{L}\p{N}]+/gu)
  return matches ? matches.map((t) => t.toLowerCase()) : []
}

export function tokenOverlapSimilarity(a: string, b: string): number {
  const tokensA = splitTokens(a)
  const tokensB = splitTokens(b)
  if (tokensA.length === 0 && tokensB.length === 0) return 0
  const setA = new Set(tokensA)
  const setB = new Set(tokensB)
  let intersection = 0
  for (const t of setA) {
    if (setB.has(t)) intersection++
  }
  const union = new Set([...tokensA, ...tokensB]).size
  return union === 0 ? 0 : intersection / union
}

function getSchemaKind(schema: TypeSchema): PortDataType {
  return schema.kind as PortDataType
}

export function typeCompatibilityScore(
  sourceSchema: TypeSchema,
  targetSchema: TypeSchema,
): number {
  const compatibilityLabel = getCompatibilityLabel(sourceSchema, targetSchema)
  if (compatibilityLabel === 'exact') return 1.0
  if (compatibilityLabel === 'coercible') return 0.7
  return 0.0
}

export function getCompatibilityLabel(
  sourceSchema: TypeSchema,
  targetSchema: TypeSchema,
): CompatibilityLabel {
  if (getSchemaDescriptor(sourceSchema) === getSchemaDescriptor(targetSchema)) {
    return 'exact'
  }

  const sourceKind = getSchemaKind(sourceSchema)
  const targetKind = getSchemaKind(targetSchema)

  if (sourceKind === targetKind) {
    return sourceKind === 'json' ? 'incompatible' : 'exact'
  }
  if (isCoercible(sourceKind, targetKind)) return 'coercible'
  return 'incompatible'
}

function getConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= 0.85) return 'high'
  if (score >= 0.70) return 'medium'
  return 'low'
}

export function getSuggestedCoercionConfig(
  sourceSchema: TypeSchema,
  targetSchema: TypeSchema,
): TypeCoercionConfig | undefined {
  const compatibilityLabel = getCompatibilityLabel(sourceSchema, targetSchema)
  if (compatibilityLabel !== 'coercible') return undefined

  const sourceKind = getSchemaKind(sourceSchema)
  const targetKind = getSchemaKind(targetSchema)
  const strategies = getAvailableStrategies(sourceKind, targetKind)
  if (strategies.length === 0) return undefined

  const preferredStrategy = (() => {
    if (sourceKind === 'text' && targetKind === 'json') {
      return strategies.find((strategy) => strategy === 'JSON.parse') ?? strategies[0]
    }

    if (sourceKind === 'json' && targetKind === 'text') {
      if (sourceSchema.kind === 'json' && sourceSchema.shape === 'array') {
        return (
          strategies.find((strategy) => strategy === 'join') ??
          strategies.find((strategy) => strategy === 'JSON.stringify') ??
          strategies[0]
        )
      }

      return (
        strategies.find((strategy) => strategy === 'JSON.stringify') ??
        strategies.find((strategy) => strategy === 'toString') ??
        strategies[0]
      )
    }

    return strategies[0]
  })()

  if (!preferredStrategy) return undefined

  const defaultParams = getDefaultParamsForStrategy(preferredStrategy)
  return {
    strategy: preferredStrategy,
    ...(defaultParams ? { params: defaultParams } : {}),
  }
}

export function generateSuggestions(
  sourceFields: SuggestionField[],
  targetFields: SuggestionField[],
): MappingSuggestion[] {
  if (sourceFields.length === 0 || targetFields.length === 0) return []

  const result: MappingSuggestion[] = []

  for (const target of targetFields) {
    const candidates: MappingSuggestion[] = []
    const targetLeaf = target.path.split('.').pop() ?? target.path

    for (const source of sourceFields) {
      const sourceLeaf = source.path.split('.').pop() ?? source.path
      const nameScore = normalizedLevenshteinSimilarity(
        sourceLeaf.toLowerCase(),
        targetLeaf.toLowerCase(),
      )
      const semanticScore = tokenOverlapSimilarity(source.path, target.path)
      const typeScore = typeCompatibilityScore(source.schema, target.schema)

      const score =
        NAME_WEIGHT * nameScore +
        SEMANTIC_WEIGHT * semanticScore +
        TYPE_WEIGHT * typeScore

      const suggestedCoercion = getSuggestedCoercionConfig(source.schema, target.schema)
      const compatLabel = getCompatibilityLabel(source.schema, target.schema)

      candidates.push({
        sourceField: source.path,
        targetField: target.path,
        sourceTypeLabel: getSchemaTypeLabel(source.schema),
        targetTypeLabel: getSchemaTypeLabel(target.schema),
        score: Math.round(score * 100) / 100,
        nameScore: Math.round(nameScore * 100) / 100,
        semanticScore: Math.round(semanticScore * 100) / 100,
        typeScore: Math.round(typeScore * 100) / 100,
        confidenceLevel: getConfidenceLevel(score),
        compatibilityLabel: compatLabel,
        suggestedCoercion,
      })
    }

    candidates.sort((a, b) => b.score - a.score)
    result.push(...candidates.slice(0, TOP_N))
  }

  return result
}

export function getApplicableSuggestions(
  suggestions: MappingSuggestion[],
): MappingSuggestion[] {
  return suggestions.filter((s) => s.score >= APPLICABLE_THRESHOLD)
}
