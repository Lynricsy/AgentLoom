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
  description?: string
}

export interface ScalarTypeSchema extends BaseTypeSchema {
  kind: 'scalar'
  shape: 'string' | 'number' | 'boolean'
}

export interface ObjectTypeSchema extends BaseTypeSchema {
  kind: 'object'
  shape: 'object'
  properties?: Record<string, TypeSchema>
  required?: string[]
}

export interface ArrayTypeSchema extends BaseTypeSchema {
  kind: 'array'
  shape: 'array'
  items: TypeSchema
}

export type TypeSchema = ScalarTypeSchema | ObjectTypeSchema | ArrayTypeSchema

export function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${String(x)}`)
}

export type PortDirection = 'input' | 'output'

export type PortShape = 'circle' | 'square' | 'diamond' | 'hexagon' | 'triangle' | 'book' | 'capsule'

export interface PortDefinition {
  id: string
  label: string
  direction: PortDirection
  dataType: PortDataType
  description?: string
  required: boolean
  multiple: boolean
  maxConnections: number | null
  schema: TypeSchema
}

export interface NodeConfigFieldSchema {
  type: 'string' | 'number' | 'boolean'
  label: string
  description?: string
  default?: string | number | boolean
  enum?: string[]
  required?: boolean
}

export interface NodeConfigSchema {
  type: 'object'
  properties: Record<string, NodeConfigFieldSchema>
  required: string[]
}

export interface PortDataTypeMeta {
  label: string
  colorToken: string
  shape: PortShape
}
