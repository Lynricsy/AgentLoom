import type { CanvasNode } from '../../types'
import type { PortDefinition } from '../../types/nodeTypeRegistry'
import type { TypeSchema } from '../../types/typeSchema'
import type { SerializedPortDefinition } from './contracts'

type StableValue = null | boolean | number | string | StableValue[] | { [key: string]: StableValue }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toStableValue(value: unknown): StableValue {
  if (value == null) {
    return null
  }

  if (
    typeof value === 'boolean'
    || typeof value === 'number'
    || typeof value === 'string'
  ) {
    return value
  }

  if (Array.isArray(value)) {
    return value.map((entry) => toStableValue(entry))
  }

  if (isRecord(value)) {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, StableValue>>((accumulator, key) => {
        accumulator[key] = toStableValue(value[key])
        return accumulator
      }, {})
  }

  return String(value)
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(toStableValue(value))
}

export function cloneTypeSchema(schema: TypeSchema): TypeSchema {
  if (schema.kind !== 'json') {
    return {
      ...schema,
      examples: schema.examples ? [...schema.examples] : undefined,
    }
  }

  if (schema.shape === 'array') {
    return {
      ...schema,
      items: cloneTypeSchema(schema.items),
    }
  }

  return {
    ...schema,
    properties: Object.entries(schema.properties).reduce<Record<string, TypeSchema>>(
      (accumulator, [key, value]) => {
        accumulator[key] = cloneTypeSchema(value)
        return accumulator
      },
      {},
    ),
    required: schema.required ? [...schema.required] : undefined,
  }
}

export function serializePortDefinition(port: PortDefinition): SerializedPortDefinition {
  return {
    id: port.id,
    label: port.label,
    direction: port.direction,
    dataType: port.dataType,
    description: port.description,
    required: port.required,
    multiple: port.multiple,
    maxConnections: port.maxConnections,
    schema: cloneTypeSchema(port.schema),
  }
}

export function getPortContractSignature(port: PortDefinition): string {
  return stableStringify(serializePortDefinition(port))
}

export function getNodePortContractSignature(
  nodeData: Pick<CanvasNode['data'], 'inputPorts' | 'outputPorts'>,
): string {
  return stableStringify({
    inputPorts: nodeData.inputPorts.map((port) => serializePortDefinition(port)),
    outputPorts: nodeData.outputPorts.map((port) => serializePortDefinition(port)),
  })
}

export function getCompatibilityCacheKey(sourcePort: PortDefinition, targetPort: PortDefinition): string {
  return `${getPortContractSignature(sourcePort)}=>${getPortContractSignature(targetPort)}`
}
