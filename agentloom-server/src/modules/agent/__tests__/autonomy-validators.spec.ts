import { describe, it, expect } from 'vitest'
import {
  validateAutonomyConfig,
  validateAnnotation,
  validateResolutionResult,
} from '../autonomy.validators'
import { DEFAULT_AUTONOMY_CONFIG } from '../dto/autonomy.dto'

describe('autonomy.validators', () => {
  describe('validateAutonomyConfig', () => {
    it('合法配置应返回空错误数组', () => {
      expect(validateAutonomyConfig(DEFAULT_AUTONOMY_CONFIG)).toEqual([])
    })

    it('非对象值应返回错误', () => {
      const errors = validateAutonomyConfig(null)
      expect(errors.length).toBeGreaterThan(0)
    })

    it('无效 mode 应返回错误', () => {
      const errors = validateAutonomyConfig({
        ...DEFAULT_AUTONOMY_CONFIG,
        mode: 'INVALID',
      })
      expect(errors.some((e) => e.includes('mode'))).toBe(true)
    })

    it('超出范围的 confirmationThreshold 应返回错误', () => {
      const errors = validateAutonomyConfig({
        ...DEFAULT_AUTONOMY_CONFIG,
        confirmationThreshold: 1.5,
      })
      expect(errors.some((e) => e.includes('confirmationThreshold'))).toBe(true)
    })
  })

  describe('validateAnnotation', () => {
    it('合法注解应返回空错误数组', () => {
      const valid = {
        fieldPath: 'query',
        source: 'user',
        confidence: 1.0,
        requiresConfirmation: false,
        resolvedValueSummary: 'hello',
      }
      expect(validateAnnotation(valid)).toEqual([])
    })

    it('无效 source 应返回错误', () => {
      const invalid = {
        fieldPath: 'query',
        source: 'magic',
        confidence: 1.0,
        requiresConfirmation: false,
        resolvedValueSummary: 'hello',
      }
      const errors = validateAnnotation(invalid)
      expect(errors.some((e) => e.includes('source'))).toBe(true)
    })
  })

  describe('validateResolutionResult', () => {
    it('合法结果应返回空错误数组', () => {
      const valid = {
        resolvedInputs: { query: 'hello' },
        pendingConfirmations: [],
        annotations: [
          {
            fieldPath: 'query',
            source: 'user',
            confidence: 1.0,
            requiresConfirmation: false,
            resolvedValueSummary: 'hello',
          },
        ],
      }
      expect(validateResolutionResult(valid)).toEqual([])
    })

    it('缺少必要字段应返回错误', () => {
      const errors = validateResolutionResult({})
      expect(errors.length).toBeGreaterThan(0)
    })
  })
})
