import type { PortDataType, TypeSchema } from './typeSchema'
import type { PortDefinition } from './nodeTypeRegistry'
import { createPort } from './nodeTypeRegistry'

export interface BackendPortMapping {
  name: string
  dataType: 'text' | 'number' | 'boolean' | 'json' | 'image' | 'audio'
  description?: string
  required?: boolean
}

export interface BackendPortMappingMetadata {
  inputs: BackendPortMapping[]
  outputs: BackendPortMapping[]
}

export interface McpToolDefinition {
  id: string
  name: string
  title: string | null
  description: string | null
  inputSchema: Record<string, unknown> | null
  outputSchema: Record<string, unknown> | null
  portMappingMetadata: BackendPortMappingMetadata | null
  source: 'mcp' | 'builtin' | 'custom'
  mcpServerConfigId: string | null
  isActive: boolean
  annotations: Record<string, unknown> | null
}

const BACKEND_TO_FRONTEND_DATA_TYPE: Record<BackendPortMapping['dataType'], PortDataType> = {
  text: 'text',
  number: 'json',
  boolean: 'json',
  json: 'json',
  image: 'image',
  audio: 'audio',
}

export function mapBackendDataType(backendType: BackendPortMapping['dataType']): PortDataType {
  return BACKEND_TO_FRONTEND_DATA_TYPE[backendType]
}

function buildSchemaForDataType(dataType: PortDataType, description?: string): TypeSchema {
  if (dataType === 'json') {
    return { kind: 'json', shape: 'object', properties: {}, additionalProperties: true, description }
  }
  return { kind: dataType, description }
}

export function mapPortMappingToPortDefinition(
  mapping: BackendPortMapping,
  direction: 'input' | 'output',
): PortDefinition {
  const frontendDataType = mapBackendDataType(mapping.dataType)
  return createPort(mapping.name, mapping.name, direction, frontendDataType, {
    description: mapping.description,
    required: mapping.required ?? false,
    schema: buildSchemaForDataType(frontendDataType, mapping.description),
  })
}

export interface McpToolPortDefinitions {
  inputPorts: PortDefinition[]
  outputPorts: PortDefinition[]
}

export function buildMcpToolPorts(metadata: BackendPortMappingMetadata | null): McpToolPortDefinitions {
  const inputPorts = (metadata?.inputs ?? []).map((m) => mapPortMappingToPortDefinition(m, 'input'))
  const toolOutput = createPort('tool-output', 'Tool', 'output', 'tool', {
    description: '连接到 Agent 的工具端口',
  })
  return { inputPorts, outputPorts: [toolOutput] }
}
