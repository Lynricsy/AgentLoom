import { describe, expect, it } from 'vitest'
import type { NodeConfigSchema } from '../types/nodeTypeRegistry'
import { configSchemaToZod } from './configSchemaToZod'

describe('configSchemaToZod', () => {
  it('returns null for an empty schema', () => {
    const schema: NodeConfigSchema = {
      type: 'object',
      properties: {},
      required: [],
    }

    expect(configSchemaToZod(schema)).toBeNull()
  })

  it('validates required string fields with the story error message', () => {
    const schema = configSchemaToZod({
      type: 'object',
      properties: {
        name: {
          type: 'string',
          title: '名称',
        },
      },
      required: ['name'],
    })

    if (!schema) {
      throw new Error('Expected required string schema to be created')
    }

    const result = schema.safeParse({ name: '' })

    expect(result.success).toBe(false)
    if (result.success) {
      throw new Error('Expected required string validation to fail')
    }

    expect(result.error.issues[0]?.message).toBe('此字段为必填项')
  })

  it('supports enum string fields', () => {
    const schema = configSchemaToZod({
      type: 'object',
      properties: {
        method: {
          type: 'string',
          title: 'Method',
          enum: ['GET', 'POST', 'DELETE'],
        },
      },
      required: ['method'],
    })

    if (!schema) {
      throw new Error('Expected enum schema to be created')
    }

    const result = schema.safeParse({ method: 'POST' })

    expect(result.success).toBe(true)
    if (!result.success) {
      throw new Error('Expected enum validation to pass')
    }

    expect(result.data).toEqual({ method: 'POST' })
  })

  it('applies number defaults when the field is omitted', () => {
    const schema = configSchemaToZod({
      type: 'object',
      properties: {
        timeout: {
          type: 'number',
          title: '超时',
          default: 30,
        },
      },
      required: [],
    })

    if (!schema) {
      throw new Error('Expected defaulted number schema to be created')
    }

    expect(schema.parse({})).toEqual({ timeout: 30 })
  })

  it('allows optional fields to be omitted', () => {
    const schema = configSchemaToZod({
      type: 'object',
      properties: {
        description: {
          type: 'string',
          title: '描述',
        },
        enabled: {
          type: 'boolean',
          title: '启用',
        },
      },
      required: [],
    })

    if (!schema) {
      throw new Error('Expected optional field schema to be created')
    }

    expect(schema.parse({})).toEqual({})
  })
})
