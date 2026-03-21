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
  'llm-model',
  'http-tool',
  'code-tool',
  'mcp-tool',
  'sandbox',
  'manual-trigger',
  'schedule-trigger',
  'knowledge-base',
  'text-output',
  'json-output',
  'condition',
  'loop',
  'reusable-block',
  'smart-routing',
  'plugin',
  'input-preprocessor',
] as const

export const DYNAMIC_ONLY_NODE_TYPES: ReadonlySet<NodeType> = new Set(['mcp-tool', 'reusable-block', 'plugin'])

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
  plugin: 'var(--color-type-tool)',
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

export interface CreatePortOptions {
  required?: boolean
  multiple?: boolean
  maxConnections?: number | null
  description?: string
  schema?: TypeSchema
}

export function createPort(
  id: string,
  label: string,
  direction: PortDirection,
  dataType: PortDataType,
  options?: CreatePortOptions,
): PortDefinition {
  const schema = options?.schema
    ?? (dataType === 'json'
      ? createJsonSchema(label)
      : createScalarSchema(dataType, label))

  return {
    id,
    label,
    direction,
    dataType,
    description: options?.description,
    required: options?.required ?? false,
    multiple: options?.multiple ?? false,
    maxConnections: options?.maxConnections !== undefined ? options.maxConnections : 1,
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
    inputPorts: [
      createPort('tools', 'Tools', 'input', 'tool', {
        multiple: true,
        maxConnections: null,
        description: 'Agent 可调用的工具',
      }),
      createPort('knowledge', 'Knowledge', 'input', 'knowledge', {
        multiple: true,
        maxConnections: null,
        description: 'Agent 可检索的知识源',
      }),
      createPort('sandbox', 'Sandbox', 'input', 'sandbox', {
        description: 'Agent 代码执行沙箱',
      }),
      createPort('model', 'Model', 'input', 'model', {
        required: true,
        description: 'LLM 模型配置',
      }),
      createPort('context', 'Context', 'input', 'json', {
        description: '上下文数据',
        schema: createJsonSchema('Context', '输入上下文'),
      }),
      createPort('system-prompt', 'System Prompt', 'input', 'text', {
        description: '系统提示词',
      }),
      createPort('tool-results', 'Tool Results', 'input', 'json', {
        multiple: true,
        maxConnections: null,
        description: '工具执行结果回传',
        schema: createJsonSchema('Tool Results', '工具返回的执行结果'),
      }),
      createPort('trigger-payload', 'Trigger Payload', 'input', 'json', {
        description: '触发器负载',
        schema: createJsonSchema('Trigger Payload', '触发器传入的负载数据'),
      }),
      createPort('memory', 'Memory', 'input', 'json', {
        description: '记忆/历史上下文',
        schema: createJsonSchema('Memory', '历史对话或记忆数据'),
      }),
    ],
    outputPorts: [
      createPort('final-output', 'Final Output', 'output', 'text', {
        multiple: true,
        maxConnections: null,
        description: 'Agent 最终输出',
      }),
      createPort('structured-output', 'Structured Output', 'output', 'json', {
        multiple: true,
        maxConnections: null,
        description: '结构化输出',
        schema: createJsonSchema('Structured Output', 'Agent 结构化输出'),
      }),
      createPort('telemetry', 'Telemetry', 'output', 'json', {
        multiple: true,
        maxConnections: null,
        description: '遥测数据',
        schema: createJsonSchema('Telemetry', 'Agent 运行遥测数据'),
      }),
      createPort('evidence-requests', 'Evidence Requests', 'output', 'json', {
        multiple: true,
        maxConnections: null,
        description: '证据请求',
        schema: createJsonSchema('Evidence Requests', 'Agent 发出的证据收集请求'),
      }),
    ],
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
  'llm-model': {
    type: 'llm-model',
    category: 'agent',
    label: 'LLM 模型',
    icon: 'Brain',
    description: '配置 LLM provider 和模型参数，通过连线为 Agent 提供模型能力',
    colorToken: CATEGORY_COLOR_TOKENS.agent,
    inputPorts: [],
    outputPorts: [createPort('model-output', '模型输出', 'output', 'model', {
      multiple: true,
      maxConnections: 5,
    })],
    configSchema: EMPTY_CONFIG_SCHEMA,
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
  'mcp-tool': {
    type: 'mcp-tool',
    category: 'tool',
    label: 'MCP Tool',
    icon: 'Plug',
    description: 'MCP 工具节点',
    colorToken: CATEGORY_COLOR_TOKENS.tool,
    inputPorts: [],
    outputPorts: [createPort('tool-output', 'Tool', 'output', 'tool', {
      description: '连接到 Agent 的工具端口',
    })],
    configSchema: EMPTY_CONFIG_SCHEMA,
  },
  sandbox: {
    type: 'sandbox',
    category: 'tool',
    label: 'Sandbox',
    icon: 'Container',
    description: '代码执行沙箱环境',
    colorToken: CATEGORY_COLOR_TOKENS.tool,
    inputPorts: [],
    outputPorts: [
      createPort('sandbox-output', 'Sandbox 环境', 'output', 'sandbox', {
        multiple: true,
        maxConnections: null,
        description: 'Agent 可用的沙箱环境',
      }),
    ],
    configSchema: {
      type: 'object',
      properties: {
        cpu: createConfigField('number', 'CPU', { default: 1 }),
        memory: createConfigField('number', 'Memory', { default: 512 }),
        disk: createConfigField('number', 'Disk', { default: 2 }),
        persistencePath: createConfigField('string', 'Persistence Path', { default: '' }),
        timeout: createConfigField('number', 'Timeout', { default: 2 }),
      },
      required: [],
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
    inputPorts: [],
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
  'reusable-block': {
    type: 'reusable-block',
    category: 'control',
    label: 'Reusable Block',
    icon: 'Package',
    description: 'A reusable group of nodes encapsulated as a single block',
    colorToken: CATEGORY_COLOR_TOKENS.control,
    inputPorts: [],
    outputPorts: [],
    configSchema: EMPTY_CONFIG_SCHEMA,
  },
  'smart-routing': {
    type: 'smart-routing',
    category: 'agent',
    label: '智能路由',
    icon: 'GitFork',
    description: '根据策略从多个 LLM 模型中选择最优模型',
    colorToken: CATEGORY_COLOR_TOKENS.agent,
    inputPorts: [
      createPort('model-in-0', '模型 1', 'input', 'model', { required: true }),
      createPort('model-in-1', '模型 2', 'input', 'model', { required: true }),
    ],
    outputPorts: [
      createPort('model-out', '选定模型', 'output', 'model', {
        multiple: true,
        maxConnections: 5,
      }),
    ],
    configSchema: {
      type: 'object' as const,
      properties: {
        strategy: {
          type: 'string',
          title: '路由策略',
          enum: [
            'TOKEN_OPTIMIZED',
            'COST_OPTIMIZED',
            'QUALITY_FIRST',
            'LATENCY_FIRST',
            'HISTORICAL_BEST',
            'FALLBACK_CHAIN',
          ],
          default: 'FALLBACK_CHAIN',
        },
      },
      required: ['strategy'],
    },
  },
  'plugin': {
    type: 'plugin',
    category: 'plugin',
    label: '插件节点',
    icon: 'Puzzle',
    description: '通过插件扩展的自定义节点',
    colorToken: CATEGORY_COLOR_TOKENS.plugin,
    inputPorts: [],
    outputPorts: [],
    configSchema: EMPTY_CONFIG_SCHEMA,
  },
  'input-preprocessor': {
    type: 'input-preprocessor',
    category: 'tool',
    label: '输入预处理器',
    icon: 'Filter',
    description: '对输入数据进行转换预处理（JMESPath / JSONata / 模板 / 脚本）',
    colorToken: CATEGORY_COLOR_TOKENS.tool,
    inputPorts: [
      createPort('text-in', '文本输入', 'input', 'text', {
        description: '文本格式输入数据',
      }),
      createPort('json-in', 'JSON 输入', 'input', 'json', {
        description: 'JSON 格式输入数据',
      }),
    ],
    outputPorts: [
      createPort('text-out', '文本输出', 'output', 'text', {
        description: '文本格式转换结果',
        multiple: true,
        maxConnections: null,
      }),
      createPort('json-out', 'JSON 输出', 'output', 'json', {
        description: 'JSON 格式转换结果',
        multiple: true,
        maxConnections: null,
      }),
    ],
    configSchema: {
      type: 'object',
      properties: {
        transformType: createConfigField('string', '转换类型', {
          enum: ['jmespath', 'jsonata', 'template', 'script'],
          default: 'jmespath',
        }),
        expression: createConfigField('string', '转换表达式'),
        outputFormat: createConfigField('string', '输出格式'),
      },
      required: ['transformType', 'expression'],
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
