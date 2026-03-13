import { z, type ZodTypeAny } from 'zod'
import type {
  NodeConfigSchema,
  NodeConfigFieldSchema,
} from '../types/nodeTypeRegistry'

function fieldToZod(
  field: NodeConfigFieldSchema,
  isRequired: boolean,
): ZodTypeAny {
  let schema: ZodTypeAny

  switch (field.type) {
    case 'string':
      if (field.enum && field.enum.length > 0) {
        const enumValues = field.enum as [string, ...string[]]

        schema = isRequired
          ? z
              .string()
              .min(1, '此字段为必填项')
              .refine((value) => enumValues.includes(value), {
                message: '请选择有效选项',
              })
          : z.enum(enumValues)
      } else {
        const stringSchema = z.string()
        schema = isRequired
          ? stringSchema.min(1, '此字段为必填项')
          : stringSchema
      }
      break

    case 'number':
      schema = z.number()
      break

    case 'boolean':
      schema = z.boolean()
      break

    case 'object': {
      if (field.properties && Object.keys(field.properties).length > 0) {
        const shape: Record<string, ZodTypeAny> = {}
        for (const [key, prop] of Object.entries(field.properties)) {
          const propRequired = field.required?.includes(key) ?? false
          shape[key] = fieldToZod(prop, propRequired)
        }
        schema = z.object(shape)
      } else {
        schema = z.record(z.string(), z.unknown())
      }
      break
    }

    case 'array':
      if (field.items) {
        schema = z.array(fieldToZod(field.items, false))
      } else {
        schema = z.array(z.unknown())
      }
      break

    default:
      schema = z.unknown()
  }

  // 先应用 default（default 会让 undefined 输入变为有值输出）
  if (field.default !== undefined) {
    schema = schema.default(field.default)
  }

  // 仅在非必填且没有 default 时标记 optional
  if (!isRequired && field.default === undefined) {
    schema = schema.optional()
  }

  return schema
}

/**
 * 将 NodeConfigSchema 转换为 Zod object schema 供表单验证使用
 *
 * @returns 若 configSchema.properties 为空则返回 null（该节点无需配置表单）
 */
export function configSchemaToZod(
  configSchema: NodeConfigSchema,
): z.ZodObject<Record<string, ZodTypeAny>> | null {
  const { properties } = configSchema
  if (!properties || Object.keys(properties).length === 0) {
    return null
  }

  const shape: Record<string, ZodTypeAny> = {}
  for (const [key, field] of Object.entries(properties)) {
    const isRequired = configSchema.required.includes(key)
    shape[key] = fieldToZod(field, isRequired)
  }

  return z.object(shape)
}
