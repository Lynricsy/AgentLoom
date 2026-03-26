import {
  createPort,
  type NodeTypeConfig,
  type NodeType,
  type NodeConfigFieldSchema,
  type NodeConfigSchema,
} from '../types/nodeTypeRegistry'
import type { NodeCategory } from '../types'

// Agent canvas extends base NodeType with 'sub-agent' and 'agent-main', exclusive to the agent editor
export type AgentCanvasNodeType = NodeType | 'sub-agent' | 'agent-main'

/**
 * Agent node config mirrors NodeTypeConfig but uses AgentCanvasNodeType and supports maxInstances.
 * Structurally compatible with NodeTypeConfig for all nodes whose type is a base NodeType.
 */
export interface AgentNodeTypeConfig extends Omit<NodeTypeConfig, 'type'> {
  type: AgentCanvasNodeType
  /** Maximum number of instances of this node allowed on the agent canvas */
  maxInstances?: number
}

// Local color tokens — mirrors the unexported CATEGORY_COLOR_TOKENS in nodeTypeRegistry.ts
const AGENT_CATEGORY_COLOR_TOKENS: Record<NodeCategory, string> = {
  agent: 'var(--color-type-model)',
  tool: 'var(--color-type-tool)',
  trigger: 'var(--color-warning)',
  knowledge: 'var(--color-type-knowledge)',
  output: 'var(--color-type-text)',
  control: 'var(--color-muted)',
  plugin: 'var(--color-type-tool)',
  memory: 'var(--color-type-json)',
}

// Local createConfigField helper — mirrors the unexported version in nodeTypeRegistry.ts
function createConfigField(
  type: NodeConfigFieldSchema['type'],
  title: string,
  options: Omit<NodeConfigFieldSchema, 'type' | 'title'> = {},
): NodeConfigFieldSchema {
  return { type, title, ...options }
}

const EMPTY_AGENT_CONFIG_SCHEMA: NodeConfigSchema = {
  type: 'object',
  properties: {},
  required: [],
}

export const AGENT_CANVAS_NODE_TYPES = [
  'agent-main',
  'llm-model',
  'smart-routing',
  'http-tool',
  'code-tool',
  'mcp-tool',
  'knowledge-base',
  'sub-agent',
  'input-preprocessor',
  'skill',
  'sandbox',
] as const satisfies readonly AgentCanvasNodeType[]

export const AGENT_CANVAS_NODE_REGISTRY = new Map<string, AgentNodeTypeConfig>([
  [
    'llm-model',
    {
      type: 'llm-model',
      category: 'agent',
      label: 'LLM 模型',
      icon: 'Brain',
      description: '配置 LLM provider 和模型参数，为 Agent 提供模型能力',
      colorToken: AGENT_CATEGORY_COLOR_TOKENS.agent,
      inputPorts: [
        createPort('model-in', '模型输入', 'input', 'model', {
          required: true,
          description: '接入模型配置',
        }),
      ],
      outputPorts: [
        createPort('model-output', '模型输出', 'output', 'model', {
          description: '模型配置输出，连接到 Agent Main',
        }),
      ],
      configSchema: EMPTY_AGENT_CONFIG_SCHEMA,
    },
  ],
  [
    'smart-routing',
    {
      type: 'smart-routing',
      category: 'agent',
      label: '智能路由',
      icon: 'GitFork',
      description: '根据策略从多个 LLM 模型中选择最优模型',
      colorToken: AGENT_CATEGORY_COLOR_TOKENS.agent,
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
        type: 'object',
        properties: {
          strategy: createConfigField('string', '路由策略', {
            enum: [
              'TOKEN_OPTIMIZED',
              'COST_OPTIMIZED',
              'QUALITY_FIRST',
              'LATENCY_FIRST',
              'HISTORICAL_BEST',
              'FALLBACK_CHAIN',
            ],
            default: 'FALLBACK_CHAIN',
          }),
        },
        required: ['strategy'],
      },
    },
  ],
  [
    'http-tool',
    {
      type: 'http-tool',
      category: 'tool',
      label: 'HTTP 请求',
      icon: 'Globe',
      description: '通过 HTTP 请求调用外部 API',
      colorToken: AGENT_CATEGORY_COLOR_TOKENS.tool,
      inputPorts: [
        createPort('config-in', '配置输入', 'input', 'json', {
          description: '请求配置（URL / 方法 / 参数）',
        }),
      ],
      outputPorts: [
        createPort('tool-output', '工具输出', 'output', 'tool', {
          description: 'HTTP 工具执行结果',
        }),
      ],
      configSchema: {
        type: 'object',
        properties: {
          url: createConfigField('string', 'URL'),
          method: createConfigField('string', '请求方法', {
            enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
            default: 'GET',
          }),
        },
        required: ['url', 'method'],
      },
    },
  ],
  [
    'code-tool',
    {
      type: 'code-tool',
      category: 'tool',
      label: '代码执行器',
      icon: 'Code',
      description: '执行自定义代码片段',
      colorToken: AGENT_CATEGORY_COLOR_TOKENS.tool,
      inputPorts: [
        createPort('text-input', '文本输入', 'input', 'text', {
          description: '文本格式输入数据',
        }),
        createPort('json-input', 'JSON 输入', 'input', 'json', {
          description: 'JSON 格式输入数据',
        }),
      ],
      outputPorts: [
        createPort('tool-output', '工具输出', 'output', 'tool', {
          description: '代码执行工具结果',
        }),
      ],
      configSchema: {
        type: 'object',
        properties: {
          language: createConfigField('string', '编程语言', {
            enum: ['typescript', 'javascript', 'python', 'bash'],
            default: 'python',
          }),
          code: createConfigField('string', '代码'),
        },
        required: ['language'],
      },
    },
  ],
  [
    'mcp-tool',
    {
      type: 'mcp-tool',
      category: 'tool',
      label: 'MCP 工具',
      icon: 'Plug',
      description: '通过 MCP 协议调用外部工具',
      colorToken: AGENT_CATEGORY_COLOR_TOKENS.tool,
      inputPorts: [
        createPort('config-in', '工具配置', 'input', 'json', {
          description: '工具调用参数',
        }),
      ],
      outputPorts: [
        createPort('tool-output', '工具输出', 'output', 'tool', {
          description: 'MCP 工具执行结果',
        }),
      ],
      configSchema: EMPTY_AGENT_CONFIG_SCHEMA,
    },
  ],
  [
    'knowledge-base',
    {
      type: 'knowledge-base',
      category: 'knowledge',
      label: '知识库',
      icon: 'BookOpen',
      description: '从知识库检索相关信息',
      colorToken: AGENT_CATEGORY_COLOR_TOKENS.knowledge,
      inputPorts: [
        createPort('query-in', '查询输入', 'input', 'text', {
          required: true,
          description: '检索查询文本',
        }),
      ],
      outputPorts: [
        createPort('knowledge-output', '知识输出', 'output', 'knowledge', {
          description: '检索到的知识条目',
        }),
      ],
      configSchema: {
        type: 'object',
        properties: {
          knowledgeBaseId: createConfigField('string', '知识库 ID'),
          topK: createConfigField('number', '返回条数', { default: 5 }),
        },
        required: ['knowledgeBaseId'],
      },
    },
  ],
  [
    'sub-agent',
    {
      type: 'sub-agent',
      category: 'agent',
      label: '子 Agent',
      icon: 'Bot',
      description: '调用另一个 Agent 执行特定子任务',
      colorToken: AGENT_CATEGORY_COLOR_TOKENS.agent,
      inputPorts: [
        createPort('text-input', '文本输入', 'input', 'text', {
          description: '文本格式任务输入',
        }),
        createPort('json-input', 'JSON 输入', 'input', 'json', {
          description: 'JSON 格式任务输入',
        }),
      ],
      outputPorts: [
        createPort('agent-output', 'Agent 输出', 'output', 'agent', {
          description: '子 Agent 引用输出',
        }),
      ],
      configSchema: {
        type: 'object',
        properties: {
          agentDefinitionId: createConfigField('string', 'Agent 定义 ID'),
          agentVersionId: createConfigField('string', '版本 ID'),
          alias: createConfigField('string', '别名'),
          maxTimeoutMs: createConfigField('number', '最大超时（毫秒）', {
            default: 300_000,
          }),
        },
        required: ['agentDefinitionId', 'alias'],
      },
    },
  ],
  [
    'input-preprocessor',
    {
      type: 'input-preprocessor',
      category: 'tool',
      label: '输入预处理器',
      icon: 'Filter',
      description: '对输入数据进行转换预处理（JMESPath / JSONata / 模板 / 脚本）',
      colorToken: AGENT_CATEGORY_COLOR_TOKENS.tool,
      inputPorts: [
        createPort('text-input', '文本输入', 'input', 'text', {
          description: '文本格式输入数据',
        }),
        createPort('json-input', 'JSON 输入', 'input', 'json', {
          description: 'JSON 格式输入数据',
        }),
      ],
      outputPorts: [
        createPort('json-output', 'JSON 输出', 'output', 'json', {
          description: '预处理转换结果',
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
  ],
  [
    'skill',
    {
      type: 'skill',
      category: 'knowledge',
      label: 'Skill',
      icon: 'BookOpenText',
      description: 'Agent prompt 增强指令',
      colorToken: AGENT_CATEGORY_COLOR_TOKENS.knowledge,
      inputPorts: [],
      outputPorts: [
        createPort('skill-out', 'Skill', 'output', 'skill'),
      ],
      configSchema: {
        type: 'object',
        properties: {
          skillId: createConfigField('string', 'Skill ID'),
          skillName: createConfigField('string', 'Skill 名称'),
          skillDescription: createConfigField('string', 'Skill 描述'),
        },
        required: ['skillId'],
      },
    },
  ],
  [
    'agent-main',
    {
      type: 'agent-main',
      category: 'agent',
      label: 'Agent Main',
      icon: 'BrainCircuit',
      description: 'Central agent configuration node',
      colorToken: AGENT_CATEGORY_COLOR_TOKENS.agent,
      maxInstances: 1,
      inputPorts: [
        createPort('model-in', '模型', 'input', 'model', {
          description: '来自 LLM 模型节点的模型配置',
        }),
        createPort('tools-in', '工具', 'input', 'tool', {
          multiple: true,
          maxConnections: null,
          description: '来自 HTTP/代码/MCP 工具节点的工具集',
        }),
        createPort('knowledge-in', '知识库', 'input', 'knowledge', {
          multiple: true,
          maxConnections: null,
          description: '来自知识库节点的知识源',
        }),
        createPort('sandbox-in', '沙箱', 'input', 'sandbox', {
          maxConnections: 1,
          description: '专属沙箱环境（独占连接）',
        }),
        createPort('skills-in', 'Skills', 'input', 'skill', {
          multiple: true,
          maxConnections: null,
          description: '来自 Skill 节点的技能指令',
        }),
        createPort('memory-in', '记忆', 'input', 'knowledge', {
          multiple: true,
          maxConnections: null,
          description: '来自记忆/知识节点的记忆数据',
        }),
        createPort('system-prompt-in', '系统提示词', 'input', 'text', {
          maxConnections: 1,
          description: '系统提示词（独占连接）',
        }),
        createPort('sub-agents-in', '子 Agent', 'input', 'agent', {
          multiple: true,
          maxConnections: null,
          description: '来自子 Agent 节点的 Agent 引用',
        }),
        createPort('input-preprocessor-in', '输入预处理', 'input', 'json', {
          description: '来自输入预处理节点的预处理数据',
        }),
      ],
      outputPorts: [],
      configSchema: EMPTY_AGENT_CONFIG_SCHEMA,
    },
  ],
])

export function getAgentNodeTypeConfig(type: string): AgentNodeTypeConfig | undefined {
  return AGENT_CANVAS_NODE_REGISTRY.get(type)
}

export function getAllAgentNodeTypes(): AgentNodeTypeConfig[] {
  return Array.from(AGENT_CANVAS_NODE_REGISTRY.values())
}
