import {
  type NodeTypeConfig,
  type NodeType,
  type NodeConfigSchema,
} from "../types/nodeTypeRegistry";
import { createConfigField, createPort } from "../types/portSchema";
import type { NodeCategory } from "../types";

// Agent canvas extends base NodeType with 'sub-agent' and 'agent-main', exclusive to the agent editor
export type AgentCanvasNodeType = NodeType | "sub-agent" | "agent-main";

/**
 * Agent node config mirrors NodeTypeConfig but uses AgentCanvasNodeType and supports maxInstances.
 * Structurally compatible with NodeTypeConfig for all nodes whose type is a base NodeType.
 */
export interface AgentNodeTypeConfig extends Omit<NodeTypeConfig, "type"> {
  type: AgentCanvasNodeType;
  /** Maximum number of instances of this node allowed on the agent canvas */
  maxInstances?: number;
}

// Local color tokens — mirrors the unexported CATEGORY_COLOR_TOKENS in nodeTypeRegistry.ts
const AGENT_CATEGORY_COLOR_TOKENS: Record<NodeCategory, string> = {
  agent: "var(--color-node-agent)",
  tool: "var(--color-node-tool)",
  trigger: "var(--color-node-trigger)",
  knowledge: "var(--color-node-knowledge)",
  output: "var(--color-node-output)",
  control: "var(--color-node-control)",
  plugin: "var(--color-node-plugin)",
  memory: "var(--color-node-memory)",
};

const EMPTY_AGENT_CONFIG_SCHEMA: NodeConfigSchema = {
  type: "object",
  properties: {},
  required: [],
};

export const AGENT_CANVAS_NODE_TYPES = [
  "agent-main",
  "llm-model",
  "smart-routing",
  "mcp-tool",
  "knowledge-base",
  "memory",
  "text",
  "sub-agent",
  "input-preprocessor",
  "skill",
  "sandbox",
  "workspace",
] as const satisfies readonly AgentCanvasNodeType[];

export const AGENT_CANVAS_NODE_REGISTRY = new Map<string, AgentNodeTypeConfig>([
  [
    "llm-model",
    {
      type: "llm-model",
      category: "agent",
      label: "LLM 模型",
      icon: "Brain",
      description: "配置 LLM provider 和模型参数，为 Agent 提供模型能力",
      colorToken: AGENT_CATEGORY_COLOR_TOKENS.agent,
      inputPorts: [],
      outputPorts: [
        createPort("model-out", "模型", "output", "model", {
          description: "输出配置好的 LLM 模型实例，连接到 Agent Main 节点使用",
        }),
      ],
      configSchema: EMPTY_AGENT_CONFIG_SCHEMA,
    },
  ],
  [
    "smart-routing",
    {
      type: "smart-routing",
      category: "agent",
      label: "智能路由",
      icon: "GitFork",
      description: "根据策略从多个 LLM 模型中选择最优模型",
      colorToken: AGENT_CATEGORY_COLOR_TOKENS.agent,
      inputPorts: [
        createPort("model-in-0", "模型 1", "input", "model", {
          required: true,
          description: "第一个候选模型，路由策略将从候选模型中选择最优项",
        }),
        createPort("model-in-1", "模型 2", "input", "model", {
          required: true,
          description: "第二个候选模型，路由策略将从候选模型中选择最优项",
        }),
      ],
      outputPorts: [
        createPort("model-out", "选定模型", "output", "model", {
          multiple: true,
          maxConnections: 5,
          description: "根据路由策略（如成本优先、质量优先）选出的模型实例",
        }),
      ],
      configSchema: {
        type: "object",
        properties: {
          strategy: createConfigField("string", "路由策略", {
            enum: [
              "TOKEN_OPTIMIZED",
              "COST_OPTIMIZED",
              "QUALITY_FIRST",
              "LATENCY_FIRST",
              "HISTORICAL_BEST",
              "FALLBACK_CHAIN",
            ],
            default: "FALLBACK_CHAIN",
          }),
        },
        required: ["strategy"],
      },
    },
  ],
  [
    "mcp-tool",
    {
      type: "mcp-tool",
      category: "tool",
      label: "MCP 工具",
      icon: "Plug",
      description: "通过 MCP 协议调用外部工具",
      colorToken: AGENT_CATEGORY_COLOR_TOKENS.tool,
      inputPorts: [],
      outputPorts: [
        createPort("tool-out", "工具", "output", "tool", {
          description:
            "连接后该 MCP 工具将注册到 Agent，Agent 可在对话中按需调用",
        }),
      ],
      configSchema: EMPTY_AGENT_CONFIG_SCHEMA,
    },
  ],
  [
    "knowledge-base",
    {
      type: "knowledge-base",
      category: "knowledge",
      label: "知识库",
      icon: "BookOpen",
      description:
        "为 Agent 暴露一个可选知识库，运行时通过统一 search_knowledge 工具显式选择",
      colorToken: AGENT_CATEGORY_COLOR_TOKENS.knowledge,
      inputPorts: [],
      outputPorts: [
        createPort("knowledge-out", "知识库", "output", "knowledge", {
          description: "向量知识库，连接后 Agent 可检索其中的文档进行回答",
        }),
      ],
      configSchema: {
        type: "object",
        properties: {
          knowledgeBaseId: createConfigField("string", "知识库 ID"),
        },
        required: ["knowledgeBaseId"],
      },
    },
  ],
  [
    "memory",
    {
      type: "memory",
      category: "memory",
      label: "Memory",
      icon: "BrainCircuit",
      description: "图谱记忆实例节点",
      colorToken: AGENT_CATEGORY_COLOR_TOKENS.memory,
      inputPorts: [],
      outputPorts: [
        createPort("memory-out", "记忆", "output", "memory", {
          description: "Agent 的长期记忆存储，跨对话保留关键信息和用户偏好",
        }),
      ],
      configSchema: {
        type: "object",
        properties: {
          memoryInstanceId: createConfigField("string", "Memory Instance"),
          role: createConfigField("string", "角色", {
            enum: ["primary", "readonly"],
            default: "primary",
          }),
          fusionPriority: createConfigField("number", "融合优先级", {
            default: 1,
          }),
          bootUris: createConfigField("string", "引导 URIs"),
        },
        required: ["memoryInstanceId"],
      },
    },
  ],
  [
    "text",
    {
      type: "text",
      category: "output",
      label: "Text",
      icon: "FileText",
      description: "提供可复用的文本常量，可连接到系统提示词或任意文本输入端口",
      colorToken: AGENT_CATEGORY_COLOR_TOKENS.output,
      inputPorts: [],
      outputPorts: [
        createPort("text-out", "文本", "output", "text", {
          multiple: true,
          maxConnections: null,
          description: "输出文本常量，可复用到多个下游节点",
        }),
      ],
      configSchema: {
        type: "object",
        properties: {
          text: createConfigField("string", "文本内容", {
            default: "",
          }),
        },
        required: [],
      },
    },
  ],
  [
    "sub-agent",
    {
      type: "sub-agent",
      category: "agent",
      label: "子 Agent",
      icon: "Bot",
      description:
        "声明一个可委派的子 Agent，并通过连线为它注入局部覆盖与扩展能力",
      colorToken: AGENT_CATEGORY_COLOR_TOKENS.agent,
      inputPorts: [
        createPort("system-prompt-in", "系统提示词", "input", "text", {
          maxConnections: 1,
          description: "覆盖该子 Agent 实例的系统提示词，仅作用于当前挂载位置",
        }),
        createPort("model-in", "模型", "input", "model", {
          maxConnections: 1,
          description: "覆盖该子 Agent 实例的模型配置",
        }),
        createPort("schema-in", "Schema", "input", "json", {
          maxConnections: 1,
          description: "覆盖该子 Agent 实例的结构化输出 Schema",
        }),
        createPort("tools-in", "扩展工具", "input", "tool", {
          multiple: true,
          maxConnections: null,
          description: "为该子 Agent 实例额外挂载工具",
        }),
        createPort("skills-in", "Skills", "input", "skill", {
          multiple: true,
          maxConnections: null,
          description: "为该子 Agent 实例追加 Skills",
        }),
        createPort("sub-agents-in", "子 Agent", "input", "agent", {
          multiple: true,
          maxConnections: null,
          description: "为该子 Agent 实例追加可继续委派的下级 Agent",
        }),
        createPort("knowledge-in", "知识库", "input", "knowledge", {
          multiple: true,
          maxConnections: null,
          description: "为该子 Agent 实例追加知识库上下文",
        }),
        createPort("memory-in", "记忆", "input", "memory", {
          multiple: true,
          maxConnections: null,
          description: "为该子 Agent 实例追加记忆上下文",
        }),
      ],
      outputPorts: [
        createPort("agent-out", "Agent", "output", "agent", {
          description:
            '输出子 Agent 实例，连接到主 Agent 的"子 Agent"端口即可注册',
        }),
      ],
      configSchema: {
        type: "object",
        properties: {
          agentDefinitionId: createConfigField("string", "Agent 定义 ID"),
          agentVersionId: createConfigField("string", "版本 ID"),
          alias: createConfigField("string", "别名"),
          maxTimeoutMs: createConfigField("number", "最大超时（毫秒）", {
            default: 300_000,
          }),
        },
        required: ["agentDefinitionId", "alias"],
      },
    },
  ],
  [
    "input-preprocessor",
    {
      type: "input-preprocessor",
      category: "tool",
      label: "输入预处理器",
      icon: "Filter",
      description:
        "对输入数据进行转换预处理（JMESPath / JSONata / 模板 / 脚本）",
      colorToken: AGENT_CATEGORY_COLOR_TOKENS.tool,
      inputPorts: [
        createPort("text-in", "文本", "input", "text", {
          description: "接收待预处理的原始文本，如用户输入或上游节点的文本输出",
        }),
        createPort("json-in", "JSON", "input", "json", {
          description: "接收待预处理的原始 JSON 数据",
        }),
      ],
      outputPorts: [
        createPort("json-out", "JSON", "output", "json", {
          description: "经过预处理规则转换后的 JSON 数据",
        }),
      ],
      configSchema: {
        type: "object",
        properties: {
          transformType: createConfigField("string", "转换类型", {
            enum: ["jmespath", "jsonata", "template", "script"],
            default: "jmespath",
          }),
          expression: createConfigField("string", "转换表达式"),
          outputFormat: createConfigField("string", "输出格式"),
        },
        required: ["transformType", "expression"],
      },
    },
  ],
  [
    "skill",
    {
      type: "skill",
      category: "knowledge",
      label: "Skill",
      icon: "BookOpenText",
      description: "Agent prompt 增强指令",
      colorToken: AGENT_CATEGORY_COLOR_TOKENS.knowledge,
      inputPorts: [],
      outputPorts: [
        createPort("skill-out", "Skill", "output", "skill", {
          description: "预定义的能力模板，连接后 Agent 在对话中可按需激活使用",
        }),
      ],
      configSchema: {
        type: "object",
        properties: {
          skillId: createConfigField("string", "Skill ID"),
          skillName: createConfigField("string", "Skill 名称"),
          skillDescription: createConfigField("string", "Skill 描述"),
        },
        required: ["skillId"],
      },
    },
  ],
  [
    "sandbox",
    {
      type: "sandbox",
      category: "tool",
      label: "沙箱环境",
      icon: "Container",
      description: "为 Agent 提供隔离的代码执行沙箱环境",
      colorToken: AGENT_CATEGORY_COLOR_TOKENS.tool,
      maxInstances: 1,
      inputPorts: [
        createPort("volume-in", "工作区", "input", "volume", {
          required: false,
          description: "可选挂载持久化工作区，沙箱内的文件读写将保存到该工作区",
        }),
      ],
      outputPorts: [
        createPort("sandbox-out", "沙箱", "output", "sandbox", {
          description:
            "提供隔离的代码执行环境，连接到 Agent 后可运行代码和终端命令",
        }),
      ],
      configSchema: {
        type: "object",
        properties: {
          enabled: createConfigField("boolean", "启用沙箱", { default: true }),
          cpuLimit: createConfigField("number", "CPU 限制（核）", {
            default: 1,
          }),
          memoryLimitMb: createConfigField("number", "内存限制（MB）", {
            default: 512,
          }),
          timeoutSeconds: createConfigField("number", "超时时间（秒）", {
            default: 0,
          }),
          conversationIdleAutoEndMinutes: createConfigField(
            "number",
            "对话空闲自动结束（分钟）",
            { default: 10 },
          ),
        },
        required: [],
      },
    },
  ],
  [
    "workspace",
    {
      type: "workspace",
      category: "tool",
      label: "工作区",
      icon: "FolderOpen",
      description: "为 Agent 提供持久化工作区存储卷",
      colorToken: AGENT_CATEGORY_COLOR_TOKENS.tool,
      maxInstances: 1,
      inputPorts: [],
      outputPorts: [
        createPort("volume-out", "工作区", "output", "volume", {
          description:
            "持久化存储卷，可跨多次执行保留文件，需连接到沙箱节点使用",
        }),
      ],
      configSchema: {
        type: "object",
        properties: {
          workspaceId: createConfigField("string", "Workspace ID"),
          workspaceName: createConfigField("string", "工作区名称"),
        },
        required: ["workspaceId"],
      },
    },
  ],
  [
    "agent-main",
    {
      type: "agent-main",
      category: "agent",
      label: "Agent Main",
      icon: "BrainCircuit",
      description: "Central agent configuration node",
      colorToken: AGENT_CATEGORY_COLOR_TOKENS.agent,
      maxInstances: 1,
      inputPorts: [
        createPort("model-in", "模型", "input", "model", {
          description: "指定 Agent 使用的 LLM 模型，决定推理能力和成本",
        }),
        createPort("tools-in", "工具", "input", "tool", {
          multiple: true,
          maxConnections: null,
          description: "为 Agent 挂载 MCP 工具，Agent 可在对话中按需调用",
        }),
        createPort("knowledge-in", "知识库", "input", "knowledge", {
          multiple: true,
          maxConnections: null,
          description: "绑定向量知识库，Agent 回答时可检索相关文档作为参考",
        }),
        createPort("sandbox-in", "沙箱", "input", "sandbox", {
          maxConnections: 1,
          description: "绑定沙箱执行环境，Agent 可运行代码和终端命令",
        }),
        createPort("skills-in", "Skills", "input", "skill", {
          multiple: true,
          maxConnections: null,
          description: "启用 Skill 能力模板，Agent 在对话中可按需激活",
        }),
        createPort("memory-in", "记忆", "input", "memory", {
          multiple: true,
          maxConnections: null,
          description: "绑定长期记忆存储，Agent 可跨对话记住关键信息",
        }),
        createPort("system-prompt-in", "系统提示词", "input", "text", {
          maxConnections: 1,
          description: "注入自定义系统提示词，定义 Agent 的角色和行为准则",
        }),
        createPort("sub-agents-in", "子 Agent", "input", "agent", {
          multiple: true,
          maxConnections: null,
          description: "注册可调度的子 Agent，主 Agent 可将子任务委派给它们",
        }),
        createPort("input-preprocessor-in", "输入预处理", "input", "json", {
          description: "连接输入预处理管道，用户消息先经过预处理再交给 Agent",
        }),
      ],
      outputPorts: [],
      configSchema: EMPTY_AGENT_CONFIG_SCHEMA,
    },
  ],
]);

export function getAgentNodeTypeConfig(
  type: string,
): AgentNodeTypeConfig | undefined {
  return AGENT_CANVAS_NODE_REGISTRY.get(type);
}

export function getAllAgentNodeTypes(): AgentNodeTypeConfig[] {
  return Array.from(AGENT_CANVAS_NODE_REGISTRY.values());
}
