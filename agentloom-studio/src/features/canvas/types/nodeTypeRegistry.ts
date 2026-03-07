import type { NodeCategory } from '../types'
import { assertNever } from './typeSchema'
import type {
  ObjectTypeSchema,
  PortDataType,
  ScalarTypeSchema,
  TypeSchema,
} from './typeSchema'

export const NODE_TYPES = [
  'llm-agent',
  'chat-agent',
  'http-tool',
  'code-tool',
  'manual-trigger',
  'schedule-trigger',
  'knowledge-base',
  'text-output',
  'json-output',
  'condition',
  'loop',
] as const

export type NodeType = (typeof NODE_TYPES)[number]

export type PortDirection = 'input' | 'output'

export type PortShape =
  | 'circle'
  | 'square'
  | 'diamond'
  | 'capsule'
  | 'hexagon'
  | 'triangle'
  | 'book'

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
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  title: string
  description?: string
  default?: unknown
  enum?: string[]
  properties?: Record<string, NodeConfigFieldSchema>
  items?: NodeConfigFieldSchema
  required?: string[]
}

export interface NodeConfigSchema {
  type: 'object'
  properties: Record<string, NodeConfigFieldSchema>
  required: string[]
}

export interface NodeTypeConfig {
  type: NodeType
  category: NodeCategory
  label: string
  icon: string
  description: string
  colorToken: string
  inputPorts: PortDefinition[]
  outputPorts: PortDefinition[]
  configSchema: NodeConfigSchema
}

export interface PortDataTypeMeta {
  label: string
  colorToken: string
  shape: PortShape
}

export const PORT_DATA_TYPE_META: Record<PortDataType, PortDataTypeMeta> = {
  model: { label: 'Model', colorToken: 'var(--color-type-model)', shape: 'circle' },
  text: { label: 'Text', colorToken: 'var(--color-type-text)', shape: 'circle' },
  json: { label: 'JSON', colorToken: 'var(--color-type-json)', shape: 'square' },
  image: { label: 'Image', colorToken: 'var(--color-type-image)', shape: 'diamond' },
  audio: { label: 'Audio', colorToken: 'var(--color-type-audio)', shape: 'capsule' },
  tool: { label: 'Tool', colorToken: 'var(--color-type-tool)', shape: 'hexagon' },
  sandbox: { label: 'Sandbox', colorToken: 'var(--color-type-sandbox)', shape: 'triangle' },
  knowledge: { label: 'Knowledge', colorToken: 'var(--color-type-knowledge)', shape: 'book' },
}

const CATEGORY_COLOR_TOKENS: Record<NodeCategory, string> = {
  agent: 'var(--color-type-model)',
  tool: 'var(--color-type-tool)',
  trigger: 'var(--color-warning)',
  knowledge: 'var(--color-type-knowledge)',
  output: 'var(--color-type-text)',
  control: 'var(--color-muted)',
}

type NonJsonPortDataType = Exclude<PortDataType, 'json'>

function createScalarSchema(
  kind: NonJsonPortDataType,
  title: string,
  description?: string,
): ScalarTypeSchema {
  return {
    kind,
    title,
    description,
  }
}

function createJsonSchema(title: string, description?: string): ObjectTypeSchema {
  return {
    kind: 'json',
    shape: 'object',
    title,
    description,
    properties: {},
    additionalProperties: true,
  }
}

function createPort(
  id: string,
  label: string,
  direction: PortDirection,
  dataType: PortDataType,
): PortDefinition {
  const schema = dataType === 'json'
    ? createJsonSchema(label)
    : createScalarSchema(dataType, label)

  return {
    id,
    label,
    direction,
    dataType,
    required: false,
    multiple: false,
    maxConnections: 1,
    schema,
  }
}

function createConfigField(
  type: NodeConfigFieldSchema['type'],
  title: string,
  options: Omit<NodeConfigFieldSchema, 'type' | 'title'> = {},
): NodeConfigFieldSchema {
  return {
    type,
    title,
    ...options,
  }
}

const EMPTY_CONFIG_SCHEMA: NodeConfigSchema = {
  type: 'object',
  properties: {},
  required: [],
}

export const NODE_TYPE_REGISTRY: Record<NodeType, NodeTypeConfig> = {
  'llm-agent': {
    type: 'llm-agent',
    category: 'agent',
    label: 'LLM Agent',
    icon: 'Bot',
    description: '大语言模型 Agent 节点',
    colorToken: CATEGORY_COLOR_TOKENS.agent,
    inputPorts: [createPort('context', 'context', 'input', 'json'), createPort('model', 'model', 'input', 'model')],
    outputPorts: [createPort('result', 'result', 'output', 'text'), createPort('structured', 'structured', 'output', 'json')],
    configSchema: {
      type: 'object',
      properties: {
        systemPrompt: createConfigField('string', 'System Prompt'),
        outputSchemaTitle: createConfigField('string', 'Output Schema Title'),
      },
      required: [],
    },
  },
  'chat-agent': {
    type: 'chat-agent',
    category: 'agent',
    label: 'Chat Agent',
    icon: 'MessageSquare',
    description: '对话型 Agent 节点',
    colorToken: CATEGORY_COLOR_TOKENS.agent,
    inputPorts: [createPort('messages', 'messages', 'input', 'json'), createPort('model', 'model', 'input', 'model')],
    outputPorts: [createPort('reply', 'reply', 'output', 'text'), createPort('structured', 'structured', 'output', 'json')],
    configSchema: {
      type: 'object',
      properties: {
        systemPrompt: createConfigField('string', 'System Prompt'),
      },
      required: [],
    },
  },
  'http-tool': {
    type: 'http-tool',
    category: 'tool',
    label: 'HTTP Request',
    icon: 'Globe',
    description: 'HTTP 请求工具',
    colorToken: CATEGORY_COLOR_TOKENS.tool,
    inputPorts: [createPort('request', 'request', 'input', 'json')],
    outputPorts: [createPort('response', 'response', 'output', 'json')],
    configSchema: {
      type: 'object',
      properties: {
        url: createConfigField('string', 'URL'),
        method: createConfigField('string', 'Method', {
          enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        }),
      },
      required: ['url', 'method'],
    },
  },
  'code-tool': {
    type: 'code-tool',
    category: 'tool',
    label: 'Code Executor',
    icon: 'Code',
    description: '代码执行工具',
    colorToken: CATEGORY_COLOR_TOKENS.tool,
    inputPorts: [createPort('input', 'input', 'input', 'json'), createPort('sandbox', 'sandbox', 'input', 'sandbox')],
    outputPorts: [createPort('result', 'result', 'output', 'json'), createPort('stdout', 'stdout', 'output', 'text')],
    configSchema: {
      type: 'object',
      properties: {
        language: createConfigField('string', 'Language', {
          enum: ['typescript', 'javascript', 'python', 'bash'],
        }),
      },
      required: ['language'],
    },
  },
  'manual-trigger': {
    type: 'manual-trigger',
    category: 'trigger',
    label: 'Manual Trigger',
    icon: 'Play',
    description: '手动触发器',
    colorToken: CATEGORY_COLOR_TOKENS.trigger,
    inputPorts: [],
    outputPorts: [createPort('payload', 'payload', 'output', 'json')],
    configSchema: EMPTY_CONFIG_SCHEMA,
  },
  'schedule-trigger': {
    type: 'schedule-trigger',
    category: 'trigger',
    label: 'Schedule',
    icon: 'Clock',
    description: '定时触发器',
    colorToken: CATEGORY_COLOR_TOKENS.trigger,
    inputPorts: [],
    outputPorts: [createPort('payload', 'payload', 'output', 'json')],
    configSchema: {
      type: 'object',
      properties: {
        cron: createConfigField('string', 'Cron'),
      },
      required: ['cron'],
    },
  },
  'knowledge-base': {
    type: 'knowledge-base',
    category: 'knowledge',
    label: 'Knowledge Base',
    icon: 'Database',
    description: '知识库检索节点',
    colorToken: CATEGORY_COLOR_TOKENS.knowledge,
    inputPorts: [createPort('query', 'query', 'input', 'text')],
    outputPorts: [createPort('knowledge', 'knowledge', 'output', 'knowledge')],
    configSchema: {
      type: 'object',
      properties: {
        knowledgeBaseId: createConfigField('string', 'Knowledge Base ID'),
      },
      required: ['knowledgeBaseId'],
    },
  },
  'text-output': {
    type: 'text-output',
    category: 'output',
    label: 'Text Output',
    icon: 'FileText',
    description: '文本输出节点',
    colorToken: CATEGORY_COLOR_TOKENS.output,
    inputPorts: [createPort('content', 'content', 'input', 'text')],
    outputPorts: [],
    configSchema: EMPTY_CONFIG_SCHEMA,
  },
  'json-output': {
    type: 'json-output',
    category: 'output',
    label: 'JSON Output',
    icon: 'Braces',
    description: 'JSON 输出节点',
    colorToken: CATEGORY_COLOR_TOKENS.output,
    inputPorts: [createPort('content', 'content', 'input', 'json')],
    outputPorts: [],
    configSchema: EMPTY_CONFIG_SCHEMA,
  },
  condition: {
    type: 'condition',
    category: 'control',
    label: 'Condition',
    icon: 'GitBranch',
    description: '条件分支节点',
    colorToken: CATEGORY_COLOR_TOKENS.control,
    inputPorts: [createPort('input', 'input', 'input', 'json')],
    outputPorts: [createPort('matched', 'matched', 'output', 'json'), createPort('unmatched', 'unmatched', 'output', 'json')],
    configSchema: {
      type: 'object',
      properties: {
        expression: createConfigField('string', 'Expression'),
      },
      required: ['expression'],
    },
  },
  loop: {
    type: 'loop',
    category: 'control',
    label: 'Loop',
    icon: 'Repeat',
    description: '循环控制节点',
    colorToken: CATEGORY_COLOR_TOKENS.control,
    inputPorts: [createPort('items', 'items', 'input', 'json')],
    outputPorts: [createPort('item', 'item', 'output', 'json'), createPort('done', 'done', 'output', 'json')],
    configSchema: {
      type: 'object',
      properties: {
        maxIterations: createConfigField('number', 'Max Iterations', { default: 10 }),
      },
      required: [],
    },
  },
}

export function getNodeTypeConfig(type: NodeType): NodeTypeConfig {
  const config = NODE_TYPE_REGISTRY[type]
  if (!config) {
    throw new Error(`Unknown node type: ${type}`)
  }

  return config
}

export function getNodeTypeConfigOrNull(type: string): NodeTypeConfig | null {
  return NODE_TYPE_REGISTRY[type as NodeType] ?? null
}

export function getAllNodeTypes(): NodeTypeConfig[] {
  return NODE_TYPES.map((type) => NODE_TYPE_REGISTRY[type])
}

function cloneTypeSchema(schema: TypeSchema): TypeSchema {
  switch (schema.kind) {
    case 'json': {
      if (schema.shape === 'object') {
        return {
          ...schema,
          properties: Object.fromEntries(
            Object.entries(schema.properties).map(([key, value]) => [key, cloneTypeSchema(value)])
          ),
          required: schema.required ? [...schema.required] : undefined,
        }
      }

      if (schema.shape === 'array') {
        return {
          ...schema,
          items: cloneTypeSchema(schema.items),
        }
      }

      return assertNever(schema)
    }
    case 'model':
    case 'text':
    case 'image':
    case 'audio':
    case 'tool':
    case 'sandbox':
    case 'knowledge':
      return {
        ...schema,
        examples: schema.examples ? [...schema.examples] : undefined,
      }
    default:
      return assertNever(schema)
  }
}

export function clonePortDefinitions(ports: PortDefinition[]): PortDefinition[] {
  return ports.map((port) => ({
    ...port,
    schema: cloneTypeSchema(port.schema),
  }))
}
