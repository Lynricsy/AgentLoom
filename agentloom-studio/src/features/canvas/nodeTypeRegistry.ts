import type { NodeCategory, PaletteGroup, PaletteNodeItem } from './types'
import type {
  NodeConfigSchema,
  PortDataType,
  PortDataTypeMeta,
  PortDefinition,
  PortDirection,
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

function port(
  id: string,
  label: string,
  direction: PortDirection,
  dataType: PortDataType,
): PortDefinition {
  return {
    id,
    label,
    direction,
    dataType,
    required: false,
    multiple: false,
    maxConnections: 1,
    schema: { kind: 'scalar', shape: 'string' },
  }
}

const EMPTY_CONFIG_SCHEMA: NodeConfigSchema = { type: 'object', properties: {}, required: [] }

const NODE_TYPE_CONFIGS: NodeTypeConfig[] = [
  {
    type: 'llm-agent',
    category: 'agent',
    label: 'LLM Agent',
    icon: 'Bot',
    description: '大语言模型 Agent 节点',
    colorToken: CATEGORY_COLOR_TOKENS.agent,
    inputPorts: [port('context', 'Context', 'input', 'json'), port('model', 'Model', 'input', 'model')],
    outputPorts: [port('result', 'Result', 'output', 'text'), port('structured', 'Structured', 'output', 'json')],
    configSchema: {
      type: 'object',
      properties: {
        systemPrompt: { type: 'string', label: 'System Prompt' },
        outputSchemaTitle: { type: 'string', label: 'Output Schema Title' },
      },
      required: [],
    },
  },
  {
    type: 'chat-agent',
    category: 'agent',
    label: 'Chat Agent',
    icon: 'MessageSquare',
    description: '对话型 Agent 节点',
    colorToken: CATEGORY_COLOR_TOKENS.agent,
    inputPorts: [port('messages', 'Messages', 'input', 'json'), port('model', 'Model', 'input', 'model')],
    outputPorts: [port('reply', 'Reply', 'output', 'text'), port('structured', 'Structured', 'output', 'json')],
    configSchema: {
      type: 'object',
      properties: {
        systemPrompt: { type: 'string', label: 'System Prompt' },
      },
      required: [],
    },
  },
  {
    type: 'http-tool',
    category: 'tool',
    label: 'HTTP Request',
    icon: 'Globe',
    description: 'HTTP 请求工具',
    colorToken: CATEGORY_COLOR_TOKENS.tool,
    inputPorts: [port('request', 'Request', 'input', 'json')],
    outputPorts: [port('response', 'Response', 'output', 'json')],
    configSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', label: 'URL' },
        method: { type: 'string', label: 'Method', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
      },
      required: ['url', 'method'],
    },
  },
  {
    type: 'code-tool',
    category: 'tool',
    label: 'Code Executor',
    icon: 'Code',
    description: '代码执行工具',
    colorToken: CATEGORY_COLOR_TOKENS.tool,
    inputPorts: [port('input', 'Input', 'input', 'json'), port('sandbox', 'Sandbox', 'input', 'sandbox')],
    outputPorts: [port('result', 'Result', 'output', 'json'), port('stdout', 'Stdout', 'output', 'text')],
    configSchema: {
      type: 'object',
      properties: {
        language: {
          type: 'string',
          label: 'Language',
          enum: ['typescript', 'javascript', 'python', 'bash'],
        },
      },
      required: ['language'],
    },
  },
  {
    type: 'manual-trigger',
    category: 'trigger',
    label: 'Manual Trigger',
    icon: 'Play',
    description: '手动触发器',
    colorToken: CATEGORY_COLOR_TOKENS.trigger,
    inputPorts: [],
    outputPorts: [port('payload', 'Payload', 'output', 'json')],
    configSchema: EMPTY_CONFIG_SCHEMA,
  },
  {
    type: 'schedule-trigger',
    category: 'trigger',
    label: 'Schedule',
    icon: 'Clock',
    description: '定时触发器',
    colorToken: CATEGORY_COLOR_TOKENS.trigger,
    inputPorts: [],
    outputPorts: [port('payload', 'Payload', 'output', 'json')],
    configSchema: {
      type: 'object',
      properties: {
        cron: { type: 'string', label: 'Cron' },
      },
      required: ['cron'],
    },
  },
  {
    type: 'knowledge-base',
    category: 'knowledge',
    label: 'Knowledge Base',
    icon: 'Database',
    description: '知识库检索节点',
    colorToken: CATEGORY_COLOR_TOKENS.knowledge,
    inputPorts: [port('query', 'Query', 'input', 'text')],
    outputPorts: [port('knowledge', 'Knowledge', 'output', 'knowledge')],
    configSchema: {
      type: 'object',
      properties: {
        knowledgeBaseId: { type: 'string', label: 'Knowledge Base ID' },
      },
      required: ['knowledgeBaseId'],
    },
  },
  {
    type: 'text-output',
    category: 'output',
    label: 'Text Output',
    icon: 'FileText',
    description: '文本输出节点',
    colorToken: CATEGORY_COLOR_TOKENS.output,
    inputPorts: [port('content', 'Content', 'input', 'text')],
    outputPorts: [],
    configSchema: EMPTY_CONFIG_SCHEMA,
  },
  {
    type: 'json-output',
    category: 'output',
    label: 'JSON Output',
    icon: 'Braces',
    description: 'JSON 输出节点',
    colorToken: CATEGORY_COLOR_TOKENS.output,
    inputPorts: [port('content', 'Content', 'input', 'json')],
    outputPorts: [],
    configSchema: EMPTY_CONFIG_SCHEMA,
  },
  {
    type: 'condition',
    category: 'control',
    label: 'Condition',
    icon: 'GitBranch',
    description: '条件分支节点',
    colorToken: CATEGORY_COLOR_TOKENS.control,
    inputPorts: [port('input', 'Input', 'input', 'json')],
    outputPorts: [port('matched', 'Matched', 'output', 'json'), port('unmatched', 'Unmatched', 'output', 'json')],
    configSchema: {
      type: 'object',
      properties: {
        expression: { type: 'string', label: 'Expression' },
      },
      required: ['expression'],
    },
  },
  {
    type: 'loop',
    category: 'control',
    label: 'Loop',
    icon: 'Repeat',
    description: '循环控制节点',
    colorToken: CATEGORY_COLOR_TOKENS.control,
    inputPorts: [port('items', 'Items', 'input', 'json')],
    outputPorts: [port('item', 'Item', 'output', 'json'), port('done', 'Done', 'output', 'json')],
    configSchema: {
      type: 'object',
      properties: {
        maxIterations: { type: 'number', label: 'Max Iterations', default: 10 },
      },
      required: [],
    },
  },
]

const registry = new Map<NodeType, NodeTypeConfig>()
for (const config of NODE_TYPE_CONFIGS) {
  registry.set(config.type, config)
}

export function getNodeTypeConfig(type: NodeType): NodeTypeConfig {
  const config = registry.get(type)
  if (!config) throw new Error(`Unknown node type: ${type}`)
  return config
}

export function getNodeTypeConfigOrNull(type: string): NodeTypeConfig | null {
  return registry.get(type as NodeType) ?? null
}

export function getAllNodeTypes(): NodeTypeConfig[] {
  return [...registry.values()]
}

export function clonePortDefinitions(ports: PortDefinition[]): PortDefinition[] {
  return ports.map((p) => ({ ...p, schema: { ...p.schema } }))
}

export function buildPaletteGroups(
  categories: Record<NodeCategory, { label: string; icon: string; color: string }>,
): PaletteGroup[] {
  const grouped = new Map<NodeCategory, PaletteNodeItem[]>()

  for (const config of NODE_TYPE_CONFIGS) {
    const items = grouped.get(config.category) ?? []
    items.push({
      type: config.type,
      label: config.label,
      category: config.category,
      icon: config.icon,
      description: config.description,
    })
    grouped.set(config.category, items)
  }

  const categoryOrder: NodeCategory[] = ['agent', 'tool', 'trigger', 'knowledge', 'output', 'control']

  return categoryOrder
    .filter((cat) => grouped.has(cat))
    .map((cat) => {
      const meta = categories[cat]
      return {
        category: cat,
        label: meta.label,
        icon: meta.icon,
        color: meta.color,
        items: grouped.get(cat)!,
      }
    })
}
