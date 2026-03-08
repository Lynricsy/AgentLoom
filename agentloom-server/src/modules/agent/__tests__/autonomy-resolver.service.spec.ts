import { describe, it, expect, beforeEach } from 'vitest'
import {
  AutonomyResolverService,
  type InputContext,
} from '../autonomy-resolver.service'
import type { AutonomyConfig } from '../dto/autonomy.dto'
import { DEFAULT_AUTONOMY_CONFIG } from '../dto/autonomy.dto'

describe('AutonomyResolverService', () => {
  let service: AutonomyResolverService

  beforeEach(() => {
    service = new AutonomyResolverService()
  })

  describe('findMissingFields', () => {
    it('应识别 undefined 字段为缺失', () => {
      const context: InputContext = {
        requiredFields: ['query', 'model'],
        providedInputs: { query: 'hello' },
      }
      expect(service.findMissingFields(context)).toEqual(['model'])
    })

    it('应识别 null 字段为缺失', () => {
      const context: InputContext = {
        requiredFields: ['query'],
        providedInputs: { query: null },
      }
      expect(service.findMissingFields(context)).toEqual(['query'])
    })

    it('应返回空数组当所有字段已提供', () => {
      const context: InputContext = {
        requiredFields: ['query', 'model'],
        providedInputs: { query: 'hello', model: 'gpt-4' },
      }
      expect(service.findMissingFields(context)).toEqual([])
    })
  })

  describe('MANUAL_CONFIRM 模式', () => {
    const config: AutonomyConfig = {
      ...DEFAULT_AUTONOMY_CONFIG,
      mode: 'MANUAL_CONFIRM',
    }

    it('应将所有缺失字段放入 pendingConfirmations', () => {
      const context: InputContext = {
        requiredFields: ['query', 'model'],
        providedInputs: { query: 'hello' },
      }
      const result = service.resolveInputs(config, context)

      expect(result.pendingConfirmations).toHaveLength(1)
      expect(result.pendingConfirmations[0].fieldPath).toBe('model')
      expect(result.resolvedInputs).toEqual({ query: 'hello' })
    })

    it('应为已提供字段生成 user 来源注解', () => {
      const context: InputContext = {
        requiredFields: ['query'],
        providedInputs: { query: 'hello' },
      }
      const result = service.resolveInputs(config, context)

      expect(result.annotations).toHaveLength(1)
      expect(result.annotations[0]).toMatchObject({
        fieldPath: 'query',
        source: 'user',
        confidence: 1.0,
        requiresConfirmation: false,
      })
    })

    it('无缺失字段时应返回空 pendingConfirmations', () => {
      const context: InputContext = {
        requiredFields: ['query'],
        providedInputs: { query: 'hello' },
      }
      const result = service.resolveInputs(config, context)

      expect(result.pendingConfirmations).toHaveLength(0)
    })
  })

  describe('RULE_BASED 模式', () => {
    const config: AutonomyConfig = {
      ...DEFAULT_AUTONOMY_CONFIG,
      mode: 'RULE_BASED',
      allowedInferenceFields: ['model'],
    }

    it('应使用默认值自动填充白名单字段', () => {
      const context: InputContext = {
        requiredFields: ['query', 'model'],
        providedInputs: { query: 'hello' },
        fieldDefaults: { model: 'gpt-4' },
      }
      const result = service.resolveInputs(config, context)

      expect(result.resolvedInputs.model).toBe('gpt-4')
      expect(result.pendingConfirmations).toHaveLength(0)
    })

    it('应为规则填充的字段生成 rule 注解', () => {
      const context: InputContext = {
        requiredFields: ['model'],
        providedInputs: {},
        fieldDefaults: { model: 'gpt-4' },
      }
      const result = service.resolveInputs(config, context)

      const annotation = result.annotations.find(
        (a) => a.fieldPath === 'model',
      )
      expect(annotation).toMatchObject({
        source: 'rule',
        confidence: 1.0,
        requiresConfirmation: false,
      })
    })

    it('不在白名单中的字段应进入 pendingConfirmations', () => {
      const context: InputContext = {
        requiredFields: ['query', 'model', 'temperature'],
        providedInputs: { query: 'hello' },
        fieldDefaults: { model: 'gpt-4', temperature: 0.7 },
      }
      const result = service.resolveInputs(config, context)

      expect(result.resolvedInputs.model).toBe('gpt-4')
      expect(result.pendingConfirmations).toHaveLength(1)
      expect(result.pendingConfirmations[0].fieldPath).toBe('temperature')
    })

    it('白名单字段无默认值时应进入 pendingConfirmations', () => {
      const context: InputContext = {
        requiredFields: ['model'],
        providedInputs: {},
      }
      const result = service.resolveInputs(config, context)

      expect(result.pendingConfirmations).toHaveLength(1)
      expect(result.pendingConfirmations[0].fieldPath).toBe('model')
    })

    it('应为缺失字段配置补齐默认值后再执行规则推断', () => {
      const context: InputContext = {
        requiredFields: ['model'],
        providedInputs: {},
        fieldDefaults: { model: 'gpt-4' },
      }
      const result = service.resolveInputs(
        {
          mode: 'RULE_BASED',
          allowedInferenceFields: ['model'],
        },
        context,
      )

      expect(result.resolvedInputs).toEqual({ model: 'gpt-4' })
      expect(result.pendingConfirmations).toHaveLength(0)
    })
  })

  describe('LLM_SUGGEST 模式', () => {
    const config: AutonomyConfig = {
      ...DEFAULT_AUTONOMY_CONFIG,
      mode: 'LLM_SUGGEST',
      fallbackStrategy: 'USE_DEFAULT',
    }

    it('有默认值的字段应作为建议写入 resolvedInputs 并放入 pendingConfirmations', () => {
      const context: InputContext = {
        requiredFields: ['model'],
        providedInputs: {},
        fieldDefaults: { model: 'gpt-4' },
      }
      const result = service.resolveInputs(config, context)

      expect(result.resolvedInputs).toEqual({ model: 'gpt-4' })
      expect(result.pendingConfirmations).toHaveLength(1)
      expect(result.pendingConfirmations[0]).toMatchObject({
        fieldPath: 'model',
        suggestedValue: 'gpt-4',
        fallbackInfo: {
          strategy: 'USE_DEFAULT',
          defaultValue: 'gpt-4',
        },
      })
    })

    it('有默认值的字段注解应为 confidence: 0.5 且 requiresConfirmation: true', () => {
      const context: InputContext = {
        requiredFields: ['model'],
        providedInputs: {},
        fieldDefaults: { model: 'gpt-4' },
      }
      const result = service.resolveInputs(config, context)

      const annotation = result.annotations.find(
        (a) => a.fieldPath === 'model',
      )
      expect(annotation).toMatchObject({
        source: 'default',
        confidence: 0.5,
        requiresConfirmation: true,
      })
    })

    it('无默认值的字段 pendingConfirmation 应包含 fallbackInfo 但无 suggestedValue', () => {
      const context: InputContext = {
        requiredFields: ['model'],
        providedInputs: {},
      }
      const result = service.resolveInputs(config, context)

      expect(result.pendingConfirmations).toHaveLength(1)
      expect(result.pendingConfirmations[0].suggestedValue).toBeUndefined()
      expect(result.pendingConfirmations[0].fallbackInfo).toMatchObject({
        strategy: 'USE_DEFAULT',
      })
    })
  })

  describe('运行时兼容性', () => {
    it('未知 mode 时应回退到 MANUAL_CONFIRM', () => {
      const context: InputContext = {
        requiredFields: ['query', 'model'],
        providedInputs: { query: 'hello' },
      }
      const result = service.resolveInputs(
        {
          ...DEFAULT_AUTONOMY_CONFIG,
          mode: 'UNSUPPORTED_MODE',
        },
        context,
      )

      expect(result.resolvedInputs).toEqual({ query: 'hello' })
      expect(result.pendingConfirmations).toHaveLength(1)
      expect(result.pendingConfirmations[0]).toMatchObject({
        fieldPath: 'model',
      })
      expect(result.annotations).toMatchObject([
        {
          fieldPath: 'query',
          source: 'user',
        },
      ])
    })

    it('返回的注解结果应可 JSON 序列化', () => {
      const context: InputContext = {
        requiredFields: ['model'],
        providedInputs: {},
        fieldDefaults: { model: 'gpt-4' },
      }
      const result = service.resolveInputs(
        {
          mode: 'RULE_BASED',
          allowedInferenceFields: ['model'],
        },
        context,
      )

      expect(JSON.parse(JSON.stringify(result.annotations))).toEqual(
        result.annotations,
      )
    })
  })

  describe('summarizeValue', () => {
    it('应截断长字符串', () => {
      const longStr = 'a'.repeat(100)
      expect(service.summarizeValue(longStr)).toBe('a'.repeat(50) + '...')
    })

    it('应保留短字符串原样', () => {
      expect(service.summarizeValue('hello')).toBe('hello')
    })

    it('应格式化数组', () => {
      expect(service.summarizeValue([1, 2, 3])).toBe('[数组: 3 项]')
    })

    it('应格式化对象', () => {
      expect(service.summarizeValue({ a: 1, b: 2 })).toBe('{对象: 2 键}')
    })

    it('应处理 null 和 undefined', () => {
      expect(service.summarizeValue(null)).toBe('<空>')
      expect(service.summarizeValue(undefined)).toBe('<空>')
    })

    it('应转换布尔值和数字', () => {
      expect(service.summarizeValue(true)).toBe('true')
      expect(service.summarizeValue(42)).toBe('42')
    })
  })
})
