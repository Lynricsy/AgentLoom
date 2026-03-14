import { describe, expect, it } from 'vitest'
import type { TypeSchema } from '../types/typeSchema'
import type { MappingSuggestion } from '../types'
import {
  generateSuggestions,
  getApplicableSuggestions,
  getCompatibilityLabel,
  getSuggestedCoercionConfig,
  levenshteinDistance,
  normalizedLevenshteinSimilarity,
  tokenOverlapSimilarity,
  typeCompatibilityScore,
} from './fieldSuggestionEngine'

const textSchema = (): TypeSchema => ({ kind: 'text' })

const imageSchema = (): TypeSchema => ({ kind: 'image' })

const objectSchema = (properties: Record<string, TypeSchema> = { value: textSchema() }): TypeSchema => ({
  kind: 'json',
  shape: 'object',
  properties,
})

const arraySchema = (items: TypeSchema = textSchema()): TypeSchema => ({
  kind: 'json',
  shape: 'array',
  items,
})

describe('fieldSuggestionEngine', () => {
  describe('levenshteinDistance', () => {
    it('returns 0 for identical strings', () => {
      expect(levenshteinDistance('hello', 'hello')).toBe(0)
    })

    it('uses Unicode code points instead of UTF-16 code units', () => {
      expect(levenshteinDistance('cafe\u0301', 'café')).toBe(0)
    })

    it('returns string length when one side is empty', () => {
      expect(levenshteinDistance('', '字段')).toBe(2)
      expect(levenshteinDistance('abc', '')).toBe(3)
    })
  })

  describe('normalizedLevenshteinSimilarity', () => {
    it('returns 1.0 for identical strings', () => {
      expect(normalizedLevenshteinSimilarity('name', 'name')).toBe(1)
    })

    it('normalizes canonical-equivalent Unicode strings', () => {
      expect(normalizedLevenshteinSimilarity('cafe\u0301', 'café')).toBe(1)
    })
  })

  describe('tokenOverlapSimilarity', () => {
    it('handles ASCII and Unicode camelCase token splitting', () => {
      expect(tokenOverlapSimilarity('caféName', 'café_name')).toBe(1)
    })

    it('returns 0 when there is no overlap', () => {
      expect(tokenOverlapSimilarity('avatar_image', 'audio_wave')).toBe(0)
    })
  })

  describe('getCompatibilityLabel', () => {
    it('treats matching scalar or matching JSON shapes as exact', () => {
      expect(getCompatibilityLabel(textSchema(), textSchema())).toBe('exact')
      expect(getCompatibilityLabel(objectSchema(), objectSchema())).toBe('exact')
      expect(getCompatibilityLabel(arraySchema(), arraySchema())).toBe('exact')
    })

    it('treats text↔json as coercible', () => {
      expect(getCompatibilityLabel(textSchema(), objectSchema())).toBe('coercible')
      expect(getCompatibilityLabel(arraySchema(), textSchema())).toBe('coercible')
    })

    it('treats JSON object and JSON array as incompatible', () => {
      expect(getCompatibilityLabel(objectSchema(), arraySchema())).toBe('incompatible')
    })

    it('returns incompatible for unrelated kinds', () => {
      expect(getCompatibilityLabel(imageSchema(), textSchema())).toBe('incompatible')
    })
  })

  describe('typeCompatibilityScore', () => {
    it('maps compatibility labels to scores', () => {
      expect(typeCompatibilityScore(textSchema(), textSchema())).toBe(1)
      expect(typeCompatibilityScore(textSchema(), objectSchema())).toBe(0.7)
      expect(typeCompatibilityScore(objectSchema(), arraySchema())).toBe(0)
    })
  })

  describe('getSuggestedCoercionConfig', () => {
    it('prefers JSON.parse for text → object', () => {
      expect(getSuggestedCoercionConfig(textSchema(), objectSchema())).toEqual({
        strategy: 'JSON.parse',
      })
    })

    it('prefers join for array → text with default separator', () => {
      expect(getSuggestedCoercionConfig(arraySchema(), textSchema())).toEqual({
        strategy: 'join',
        params: { separator: ',' },
      })
    })

    it('prefers JSON.stringify for object → text', () => {
      expect(getSuggestedCoercionConfig(objectSchema(), textSchema())).toEqual({
        strategy: 'JSON.stringify',
      })
    })

    it('returns undefined for incompatible types', () => {
      expect(getSuggestedCoercionConfig(imageSchema(), textSchema())).toBeUndefined()
    })
  })

  describe('generateSuggestions', () => {
    const sourceFields = [
      { path: 'profile.caféName', schema: textSchema(), required: false },
      { path: 'payload', schema: objectSchema(), required: false },
      { path: 'items', schema: arraySchema(), required: false },
    ]

    const targetFields = [
      { path: 'profile.café_name', schema: textSchema(), required: true },
      { path: 'payload', schema: objectSchema(), required: false },
      { path: 'summary', schema: textSchema(), required: false },
    ]

    it('returns at most top 3 suggestions per target', () => {
      const suggestions = generateSuggestions(sourceFields, targetFields)
      const groupedByTarget = new Map<string, MappingSuggestion[]>()

      for (const suggestion of suggestions) {
        const current = groupedByTarget.get(suggestion.targetField) ?? []
        current.push(suggestion)
        groupedByTarget.set(suggestion.targetField, current)
      }

      for (const group of groupedByTarget.values()) {
        expect(group).toHaveLength(Math.min(group.length, 3))
      }
    })

    it('includes human-readable type labels and schema-aware compatibility', () => {
      const suggestions = generateSuggestions(sourceFields, targetFields)
      const payloadMatch = suggestions.find(
        (suggestion) => suggestion.sourceField === 'payload' && suggestion.targetField === 'payload',
      )

      expect(payloadMatch).toMatchObject({
        sourceTypeLabel: '对象',
        targetTypeLabel: '对象',
        compatibilityLabel: 'exact',
      })
    })

    it('emits suggested coercion for coercible pairs', () => {
      const suggestions = generateSuggestions(sourceFields, targetFields)
      const summaryMatch = suggestions.find(
        (suggestion) => suggestion.sourceField === 'items' && suggestion.targetField === 'summary',
      )

      expect(summaryMatch).toMatchObject({
        sourceTypeLabel: '数组',
        targetTypeLabel: '文本',
        compatibilityLabel: 'coercible',
        suggestedCoercion: {
          strategy: 'join',
          params: { separator: ',' },
        },
      })
    })

    it('keeps Unicode names comparable in generated results', () => {
      const suggestions = generateSuggestions(sourceFields, targetFields)
      const unicodeMatch = suggestions.find(
        (suggestion) =>
          suggestion.sourceField === 'profile.caféName' &&
          suggestion.targetField === 'profile.café_name',
      )

      expect(unicodeMatch?.nameScore).toBeGreaterThan(0.7)
      expect(unicodeMatch?.confidenceLevel).not.toBe('low')
    })
  })

  describe('getApplicableSuggestions', () => {
    it('filters suggestions to the applicable threshold', () => {
      const suggestions: MappingSuggestion[] = [
        {
          sourceField: 'a',
          targetField: 'b',
          sourceTypeLabel: '文本',
          targetTypeLabel: '文本',
          score: 0.9,
          nameScore: 0.9,
          semanticScore: 0.9,
          typeScore: 1,
          confidenceLevel: 'high',
          compatibilityLabel: 'exact',
        },
        {
          sourceField: 'c',
          targetField: 'd',
          sourceTypeLabel: '图像',
          targetTypeLabel: '文本',
          score: 0.69,
          nameScore: 1,
          semanticScore: 1,
          typeScore: 0,
          confidenceLevel: 'low',
          compatibilityLabel: 'incompatible',
        },
      ]

      expect(getApplicableSuggestions(suggestions)).toEqual([suggestions[0]!])
    })
  })
})
