import type { ConfidenceLevel, MappingSuggestion, TypeCoercionConfig } from '../types'
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

export function levenshteinDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m

  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i)

  for (let i = 1; i <= m; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= n; j++) {
      const temp = dp[j]
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev
      } else {
        dp[j] = 1 + Math.min(prev, dp[j], dp[j - 1])
      }
      prev = temp
    }
  }
  return dp[n]
}

export function normalizedLevenshteinSimilarity(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1.0
  const maxLen = Math.max(a.length, b.length)
  return 1 - levenshteinDistance(a, b) / maxLen
}

function splitTokens(value: string): string[] {
  const expanded = value.replace(/([a-z])([A-Z])/g, '$1_$2')
  const matches = expanded.match(/[A-Za-z0-9]+/g)
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
  const sourceKind = getSchemaKind(sourceSchema)
  const targetKind = getSchemaKind(targetSchema)
  if (sourceKind === targetKind) return 1.0
  if (isCoercible(sourceKind, targetKind)) return 0.7
  return 0.0
}

function getConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= 0.85) return 'high'
  if (score >= 0.70) return 'medium'
  return 'low'
}

function buildCoercionSuggestion(
  sourceSchema: TypeSchema,
  targetSchema: TypeSchema,
): TypeCoercionConfig | undefined {
  const sourceKind = getSchemaKind(sourceSchema)
  const targetKind = getSchemaKind(targetSchema)
  if (sourceKind === targetKind) return undefined
  const strategies = getAvailableStrategies(sourceKind, targetKind)
  if (strategies.length === 0) return undefined
  return { strategy: strategies[0] }
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

      const suggestedCoercion = buildCoercionSuggestion(source.schema, target.schema)

      candidates.push({
        sourceField: source.path,
        targetField: target.path,
        score: Math.round(score * 100) / 100,
        nameScore: Math.round(nameScore * 100) / 100,
        semanticScore: Math.round(semanticScore * 100) / 100,
        typeScore: Math.round(typeScore * 100) / 100,
        confidenceLevel: getConfidenceLevel(score),
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
