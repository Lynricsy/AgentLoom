import type {
  NodeConfigFieldSchema,
  NodeConfigSchema,
} from '../types/nodeTypeRegistry'

const FIELD_TYPES = ['string', 'number', 'boolean', 'object', 'array'] as const

type PluginFieldType = (typeof FIELD_TYPES)[number]

function toFieldType(value: unknown): PluginFieldType {
  return FIELD_TYPES.includes(value as PluginFieldType)
    ? (value as PluginFieldType)
    : 'string'
}

function toEnumValues(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined

  const values = value.filter((item): item is string => typeof item === 'string')

  return values.length > 0 ? values : undefined
}

function toField(key: string, raw: unknown): NodeConfigFieldSchema {
  const source = (raw ?? {}) as Record<string, unknown>

  const field: NodeConfigFieldSchema = {
    type: toFieldType(source.type),
    title: typeof source.title === 'string' ? source.title : key,
  }

  if (typeof source.description === 'string') {
    field.description = source.description
  }
  if (source.default !== undefined) {
    field.default = source.default as NodeConfigFieldSchema['default']
  }

  const enumValues = toEnumValues(source.enum)
  if (enumValues) {
    field.enum = enumValues
  }

  return field
}

/**
 * 把插件节点定义里的原始 JSON Schema 归一化成画布的 `NodeConfigSchema`，
 * 让插件配置面板复用 DynamicConfigForm 的类型化渲染与 zod 校验。
 *
 * 插件包由第三方签名打包，schema 内容不可信：未知 type 一律降级为 string，
 * 非字符串 enum 直接丢弃，避免脏 schema 把面板打挂。
 *
 * @returns properties 为空（或结构非法）时返回 null，表示该节点无需配置表单
 */
export function normalizePluginConfigSchema(
  raw: Record<string, unknown> | undefined,
): NodeConfigSchema | null {
  const rawProperties = raw?.properties
  if (!rawProperties || typeof rawProperties !== 'object') return null

  const entries = Object.entries(rawProperties as Record<string, unknown>)
  if (entries.length === 0) return null

  const required = Array.isArray(raw?.required)
    ? raw.required.filter((key): key is string => typeof key === 'string')
    : []

  return {
    type: 'object',
    properties: Object.fromEntries(
      entries.map(([key, value]) => [key, toField(key, value)]),
    ),
    required,
  }
}
