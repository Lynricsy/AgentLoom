export const PORT_DATA_TYPES = [
  'model',
  'text',
  'json',
  'image',
  'audio',
  'tool',
  'sandbox',
  'knowledge',
] as const

export type PortDataType = (typeof PORT_DATA_TYPES)[number]

interface BaseTypeSchema {
  kind: PortDataType
  title?: string
  description?: string
  nullable?: boolean
}

export interface ScalarTypeSchema extends BaseTypeSchema {
  kind: Exclude<PortDataType, 'json'>
  format?: string
  examples?: unknown[]
}

export interface ObjectTypeSchema extends BaseTypeSchema {
  kind: 'json'
  shape: 'object'
  properties: Record<string, TypeSchema>
  required?: string[]
  additionalProperties?: boolean
}

export interface ArrayTypeSchema extends BaseTypeSchema {
  kind: 'json'
  shape: 'array'
  items: TypeSchema
  minItems?: number
  maxItems?: number
}

export type TypeSchema = ScalarTypeSchema | ObjectTypeSchema | ArrayTypeSchema

export function assertNever(value: never): never {
  throw new Error(`Unexpected schema variant: ${JSON.stringify(value)}`)
}
