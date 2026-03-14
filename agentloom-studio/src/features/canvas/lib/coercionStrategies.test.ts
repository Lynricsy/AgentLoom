import { describe, it, expect } from 'vitest'
import {
  getAvailableStrategies,
  isCoercible,
  getStrategyLabel,
  COERCION_REGISTRY,
} from './coercionStrategies'

describe('coercionStrategies', () => {
  describe('COERCION_REGISTRY', () => {
    it('should be a Map with expected source→target pairs', () => {
      expect(COERCION_REGISTRY).toBeInstanceOf(Map)
      expect(COERCION_REGISTRY.size).toBeGreaterThan(0)
    })
  })

  describe('getAvailableStrategies', () => {
    it('returns parseInt/parseFloat/Number for text→json (string→number)', () => {
      const strategies = getAvailableStrategies('text', 'json')
      expect(strategies).toEqual(
        expect.arrayContaining(['parseInt', 'parseFloat', 'Number']),
      )
    })

    it('returns toString/toFixed for json→text (number→string)', () => {
      const strategies = getAvailableStrategies('json', 'text')
      expect(strategies).toEqual(
        expect.arrayContaining(['toString', 'toFixed']),
      )
    })

    it('returns JSON.stringify for json→text (object→string)', () => {
      const strategies = getAvailableStrategies('json', 'text')
      expect(strategies).toContain('JSON.stringify')
    })

    it('returns JSON.parse for text→json (string→object)', () => {
      const strategies = getAvailableStrategies('text', 'json')
      expect(strategies).toContain('JSON.parse')
    })

    it('returns first/last/join for json→text (array→single)', () => {
      const strategies = getAvailableStrategies('json', 'text')
      expect(strategies).toEqual(
        expect.arrayContaining(['first', 'last', 'join']),
      )
    })

    it('returns empty array for same types (text→text)', () => {
      expect(getAvailableStrategies('text', 'text')).toEqual([])
    })

    it('returns empty array for incompatible types (image→audio)', () => {
      expect(getAvailableStrategies('image', 'audio')).toEqual([])
    })

    it('returns empty array for non-coercible types (model→text)', () => {
      expect(getAvailableStrategies('model', 'text')).toEqual([])
    })
  })

  describe('isCoercible', () => {
    it('returns true for text→json', () => {
      expect(isCoercible('text', 'json')).toBe(true)
    })

    it('returns true for json→text', () => {
      expect(isCoercible('json', 'text')).toBe(true)
    })

    it('returns false for same type', () => {
      expect(isCoercible('text', 'text')).toBe(false)
    })

    it('returns false for incompatible types', () => {
      expect(isCoercible('image', 'audio')).toBe(false)
    })

    it('returns false for model→json', () => {
      expect(isCoercible('model', 'json')).toBe(false)
    })
  })

  describe('getStrategyLabel', () => {
    it('returns human-readable label for parseInt', () => {
      expect(getStrategyLabel('parseInt')).toBe('Parse Integer')
    })

    it('returns human-readable label for parseFloat', () => {
      expect(getStrategyLabel('parseFloat')).toBe('Parse Float')
    })

    it('returns human-readable label for Number', () => {
      expect(getStrategyLabel('Number')).toBe('To Number')
    })

    it('returns human-readable label for toString', () => {
      expect(getStrategyLabel('toString')).toBe('To String')
    })

    it('returns human-readable label for toFixed', () => {
      expect(getStrategyLabel('toFixed')).toBe('Fixed Decimal')
    })

    it('returns human-readable label for JSON.stringify', () => {
      expect(getStrategyLabel('JSON.stringify')).toBe('JSON Stringify')
    })

    it('returns human-readable label for JSON.parse', () => {
      expect(getStrategyLabel('JSON.parse')).toBe('JSON Parse')
    })

    it('returns human-readable label for first', () => {
      expect(getStrategyLabel('first')).toBe('First Element')
    })

    it('returns human-readable label for last', () => {
      expect(getStrategyLabel('last')).toBe('Last Element')
    })

    it('returns human-readable label for join', () => {
      expect(getStrategyLabel('join')).toBe('Join Array')
    })
  })
})
