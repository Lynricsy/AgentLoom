import { describe, it, expect } from 'vitest'
import type { TypeSchema } from '../types/typeSchema'
import type { MappingSuggestion } from '../types'
import {
  levenshteinDistance,
  normalizedLevenshteinSimilarity,
  tokenOverlapSimilarity,
  typeCompatibilityScore,
  generateSuggestions,
  getApplicableSuggestions,
} from './fieldSuggestionEngine'

describe('fieldSuggestionEngine', () => {
  describe('levenshteinDistance', () => {
    it('returns 0 for identical strings', () => {
      expect(levenshteinDistance('hello', 'hello')).toBe(0)
    })

    it('returns length of non-empty string when other is empty', () => {
      expect(levenshteinDistance('', 'abc')).toBe(3)
      expect(levenshteinDistance('abc', '')).toBe(3)
    })

    it('returns 0 for two empty strings', () => {
      expect(levenshteinDistance('', '')).toBe(0)
    })

    it('computes correct distance for single edit', () => {
      expect(levenshteinDistance('cat', 'bat')).toBe(1)
    })

    it('computes correct distance for multiple edits', () => {
      expect(levenshteinDistance('kitten', 'sitting')).toBe(3)
    })

    it('handles completely different strings', () => {
      expect(levenshteinDistance('abc', 'xyz')).toBe(3)
    })
  })

  describe('normalizedLevenshteinSimilarity', () => {
    it('returns 1.0 for identical strings', () => {
      expect(normalizedLevenshteinSimilarity('name', 'name')).toBe(1.0)
    })

    it('returns 1.0 for both empty strings', () => {
      expect(normalizedLevenshteinSimilarity('', '')).toBe(1.0)
    })

    it('returns 0.0 for completely different strings of equal length', () => {
      expect(normalizedLevenshteinSimilarity('abc', 'xyz')).toBe(0)
    })

    it('returns value between 0 and 1 for partially similar strings', () => {
      const sim = normalizedLevenshteinSimilarity('userName', 'user_name')
      expect(sim).toBeGreaterThan(0)
      expect(sim).toBeLessThan(1)
    })
  })

  describe('tokenOverlapSimilarity', () => {
    it('returns 1.0 for identical paths', () => {
      expect(tokenOverlapSimilarity('user_name', 'user_name')).toBe(1.0)
    })

    it('computes Jaccard similarity for overlapping tokens', () => {
      const sim = tokenOverlapSimilarity('user_email', 'email_address')
      expect(sim).toBeGreaterThan(0)
      expect(sim).toBeLessThan(1)
    })

    it('returns 0.0 for no overlapping tokens', () => {
      expect(tokenOverlapSimilarity('foo_bar', 'baz_qux')).toBe(0)
    })

    it('handles camelCase token splitting', () => {
      const sim = tokenOverlapSimilarity('userName', 'user_name')
      expect(sim).toBe(1.0)
    })

    it('returns 0.0 for two empty strings', () => {
      expect(tokenOverlapSimilarity('', '')).toBe(0)
    })
  })

  describe('typeCompatibilityScore', () => {
    const textSchema: TypeSchema = { kind: 'text' }
    const jsonSchema: TypeSchema = { kind: 'json', shape: 'object', properties: {} }

    it('returns 1.0 for exact same type', () => {
      expect(typeCompatibilityScore(textSchema, textSchema)).toBe(1.0)
    })

    it('returns 0.7 for coercible types (text→json)', () => {
      expect(typeCompatibilityScore(textSchema, jsonSchema)).toBe(0.7)
    })

    it('returns 0.0 for incompatible types', () => {
      const imageSchema: TypeSchema = { kind: 'image' }
      const audioSchema: TypeSchema = { kind: 'audio' }
      expect(typeCompatibilityScore(imageSchema, audioSchema)).toBe(0.0)
    })
  })

  describe('generateSuggestions', () => {
    const sourceFields = [
      { path: 'user_name', schema: { kind: 'text' } as TypeSchema, required: false },
      { path: 'user_email', schema: { kind: 'text' } as TypeSchema, required: false },
      { path: 'age', schema: { kind: 'json', shape: 'object', properties: {} } as TypeSchema, required: false },
    ]
    const targetFields = [
      { path: 'name', schema: { kind: 'text' } as TypeSchema, required: true },
      { path: 'email', schema: { kind: 'text' } as TypeSchema, required: false },
    ]

    it('returns suggestions for each target (Top-3 max)', () => {
      const suggestions = generateSuggestions(sourceFields, targetFields)
      const nameMatches = suggestions.filter((s) => s.targetField === 'name')
      expect(nameMatches.length).toBeLessThanOrEqual(3)
    })

    it('assigns confidence levels based on score', () => {
      const suggestions = generateSuggestions(sourceFields, targetFields)
      for (const s of suggestions) {
        if (s.score >= 0.85) expect(s.confidenceLevel).toBe('high')
        else if (s.score >= 0.70) expect(s.confidenceLevel).toBe('medium')
        else expect(s.confidenceLevel).toBe('low')
      }
    })

    it('returns suggestions sorted by score descending per target', () => {
      const suggestions = generateSuggestions(sourceFields, targetFields)
      const byTarget = new Map<string, MappingSuggestion[]>()
      for (const s of suggestions) {
        const arr = byTarget.get(s.targetField) ?? []
        arr.push(s)
        byTarget.set(s.targetField, arr)
      }
      for (const [, group] of byTarget) {
        for (let i = 1; i < group.length; i++) {
          expect(group[i - 1].score).toBeGreaterThanOrEqual(group[i].score)
        }
      }
    })

    it('includes suggestedCoercion when types need coercion', () => {
      const src = [{ path: 'count', schema: { kind: 'text' } as TypeSchema, required: false }]
      const tgt = [{ path: 'count', schema: { kind: 'json', shape: 'object', properties: {} } as TypeSchema, required: false }]
      const suggestions = generateSuggestions(src, tgt)
      const match = suggestions.find((s) => s.sourceField === 'count' && s.targetField === 'count')
      expect(match?.suggestedCoercion).toBeDefined()
    })

    it('returns empty array when no source fields', () => {
      expect(generateSuggestions([], targetFields)).toEqual([])
    })

    it('returns empty array when no target fields', () => {
      expect(generateSuggestions(sourceFields, [])).toEqual([])
    })

    it('score components are within [0, 1]', () => {
      const suggestions = generateSuggestions(sourceFields, targetFields)
      for (const s of suggestions) {
        expect(s.nameScore).toBeGreaterThanOrEqual(0)
        expect(s.nameScore).toBeLessThanOrEqual(1)
        expect(s.semanticScore).toBeGreaterThanOrEqual(0)
        expect(s.semanticScore).toBeLessThanOrEqual(1)
        expect(s.typeScore).toBeGreaterThanOrEqual(0)
        expect(s.typeScore).toBeLessThanOrEqual(1)
        expect(s.score).toBeGreaterThanOrEqual(0)
        expect(s.score).toBeLessThanOrEqual(1)
      }
    })
  })

  describe('getApplicableSuggestions', () => {
    const suggestions: MappingSuggestion[] = [
      {
        sourceField: 'a', targetField: 'b', score: 0.90,
        nameScore: 0.9, semanticScore: 0.9, typeScore: 0.9,
        confidenceLevel: 'high',
      },
      {
        sourceField: 'c', targetField: 'd', score: 0.75,
        nameScore: 0.7, semanticScore: 0.7, typeScore: 0.9,
        confidenceLevel: 'medium',
      },
      {
        sourceField: 'e', targetField: 'f', score: 0.50,
        nameScore: 0.5, semanticScore: 0.3, typeScore: 0.7,
        confidenceLevel: 'low',
      },
    ]

    it('filters to score >= 0.70 only', () => {
      const result = getApplicableSuggestions(suggestions)
      expect(result).toHaveLength(2)
      expect(result.every((s) => s.score >= 0.70)).toBe(true)
    })

    it('returns empty array when no suggestions meet threshold', () => {
      const low: MappingSuggestion[] = [
        {
          sourceField: 'x', targetField: 'y', score: 0.30,
          nameScore: 0.3, semanticScore: 0.3, typeScore: 0.3,
          confidenceLevel: 'low',
        },
      ]
      expect(getApplicableSuggestions(low)).toEqual([])
    })
  })
})
