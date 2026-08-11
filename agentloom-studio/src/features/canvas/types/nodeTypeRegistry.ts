import type { NodeCategory } from "../types";
import type { PortDataType, TypeSchema } from "./typeSchema";
import {
  clonePortDefinitions,
  createConfigField,
  createExecInPort,
  createExecOutPort,
  createPort,
} from "./portSchema";
import { AGENT_CANVAS_NODE_REGISTRY } from "../registry/agent-canvas-registry";
import type { AgentRuntimeMode } from "@/features/agent/types/agentRuntimeMode";

export const NODE_TYPES = [
  "llm-model",
  "http-tool",
  "code-tool",
  "mcp-tool",
  "sandbox",
  "manual-trigger",
  "schedule-trigger",
  "webhook-trigger",
  "api-event-trigger",
  "knowledge-base",
  "text",
  "text-output",
  "json-output",
  "condition",
  "loop",
  "iteration",
  "loop-start",
  "iteration-start",
  "loop-state",
  "result",
  "break",
  "continue",
  "reusable-block",
  "smart-routing",
  "plugin",
  "input-preprocessor",
  "memory",
  "agent",
  "skill",
  "workspace",
  "merge",
] as const;

export const DYNAMIC_ONLY_NODE_TYPES: ReadonlySet<NodeType> = new Set([
  "reusable-block",
  "plugin",
  "merge",
  "loop-start",
  "iteration-start",
  "loop-state",
  "result",
  "break",
  "continue",
]);

export const EXEC_PORT_NODE_TYPES: ReadonlySet<NodeType> = new Set([
  "llm-model",
  "mcp-tool",
  "sandbox",
  "knowledge-base",
  "smart-routing",
  "memory",
  "agent",
  "skill",
  "workspace",
  "merge",
]);

export type NodeType = (typeof NODE_TYPES)[number];

export type PortDirection = "input" | "output";

export type PortShape =
  | "circle"
  | "square"
  | "diamond"
  | "capsule"
  | "hexagon"
  | "triangle"
  | "book"
  | "arrow";

export interface PortDefinition {
  id: string;
  label: string;
  direction: PortDirection;
  dataType: PortDataType;
  acceptsAnyDataType?: boolean;
  description?: string;
  required: boolean;
  multiple: boolean;
  maxConnections: number | null;
  schema: TypeSchema;
}

export type HydratablePortDefinition = Pick<PortDefinition, "id"> &
  Partial<Omit<PortDefinition, "id">>;

export interface NodeConfigFieldSchema {
  type: "string" | "number" | "boolean" | "object" | "array";
  title: string;
  description?: string;
  default?: unknown;
  enum?: string[];
  properties?: Record<string, NodeConfigFieldSchema>;
  items?: NodeConfigFieldSchema;
  required?: string[];
}

export interface NodeConfigSchema {
  type: "object";
  properties: Record<string, NodeConfigFieldSchema>;
  required: string[];
}

export interface NodeTypeConfig {
  type: NodeType;
  category: NodeCategory;
  label: string;
  icon: string;
  description: string;
  colorToken: string;
  inputPorts: PortDefinition[];
  outputPorts: PortDefinition[];
  configSchema: NodeConfigSchema;
}

export interface ResolvedNodeTypeConfig extends Omit<
  NodeTypeConfig,
  "type" | "category"
> {
  type: string;
  category: NodeCategory;
  isKnownType: boolean;
}

export interface PortDataTypeMeta {
  label: string;
  colorToken: string;
  shape: PortShape;
}

export const PORT_DATA_TYPE_META: Record<PortDataType, PortDataTypeMeta> = {
  model: {
    label: "Model",
    colorToken: "var(--color-type-model)",
    shape: "circle",
  },
  text: {
    label: "Text",
    colorToken: "var(--color-type-text)",
    shape: "circle",
  },
  json: {
    label: "JSON",
    colorToken: "var(--color-type-json)",
    shape: "square",
  },
  array: {
    label: "Array",
    colorToken: "var(--color-type-json)",
    shape: "square",
  },
  image: {
    label: "Image",
    colorToken: "var(--color-type-image)",
    shape: "diamond",
  },
  audio: {
    label: "Audio",
    colorToken: "var(--color-type-audio)",
    shape: "capsule",
  },
  tool: {
    label: "Tool",
    colorToken: "var(--color-type-tool)",
    shape: "hexagon",
  },
  sandbox: {
    label: "Sandbox",
    colorToken: "var(--color-type-sandbox)",
    shape: "triangle",
  },
  knowledge: {
    label: "Knowledge",
    colorToken: "var(--color-type-knowledge)",
    shape: "book",
  },
  skill: {
    label: "Skill",
    colorToken: "var(--color-type-skill)",
    shape: "diamond",
  },
  agent: { label: "Agent", colorToken: "#F97316", shape: "circle" },
  memory: {
    label: "Memory",
    colorToken: "var(--color-type-knowledge)",
    shape: "book",
  },
  exec: { label: "Exec", colorToken: "var(--color-type-exec)", shape: "arrow" },
  volume: {
    label: "Volume",
    colorToken: "var(--color-type-volume)",
    shape: "square",
  },
};

const NODE_CATEGORY_VALUES: ReadonlySet<NodeCategory> = new Set([
  "agent",
  "tool",
  "trigger",
  "knowledge",
  "output",
  "control",
  "plugin",
  "memory",
]);

const EMPTY_NODE_CONFIG_SCHEMA: NodeConfigSchema = {
  type: "object",
  properties: {},
  required: [],
};

const CATEGORY_COLOR_TOKENS: Record<NodeCategory, string> = {
  agent: "var(--color-node-agent)",
  tool: "var(--color-node-tool)",
  trigger: "var(--color-node-trigger)",
  knowledge: "var(--color-node-knowledge)",
  output: "var(--color-node-output)",
  control: "var(--color-node-control)",
  plugin: "var(--color-node-plugin)",
  memory: "var(--color-node-memory)",
};

const EMPTY_CONFIG_SCHEMA: NodeConfigSchema = {
  type: "object",
  properties: {},
  required: [],
};

export const NODE_TYPE_REGISTRY: Record<NodeType, NodeTypeConfig> = {
  "llm-model": {
    type: "llm-model",
    category: "agent",
    label: "LLM 模型",
    icon: "Brain",
    description: "配置 LLM provider 和模型参数，通过连线为 Agent 提供模型能力",
    colorToken: CATEGORY_COLOR_TOKENS.agent,
    inputPorts: [
      createExecInPort("执行流入口，前序节点完成后激活模型配置节点"),
    ],
    outputPorts: [
      createExecOutPort("执行流出口，模型配置节点完成后触发下游节点"),
      createPort("model-out", "模型", "output", "model", {
        multiple: true,
        maxConnections: 5,
        description:
          "输出配置好的 LLM 模型实例，连接到 Agent 或智能路由节点使用",
      }),
    ],
    configSchema: EMPTY_CONFIG_SCHEMA,
  },
  "http-tool": {
    type: "http-tool",
    category: "tool",
    label: "HTTP Request",
    icon: "Globe",
    description: "HTTP 请求工具",
    colorToken: CATEGORY_COLOR_TOKENS.tool,
    inputPorts: [
      createPort("exec-in", "", "input", "exec", {
        description: "执行流入口，前序节点完成后触发 HTTP 请求",
      }),
      createPort("request-in", "请求体", "input", "json", {
        description: "HTTP 请求发送的 JSON Body 数据",
      }),
    ],
    outputPorts: [
      createPort("exec-out", "", "output", "exec", {
        description: "执行流出口，HTTP 请求完成后触发下游节点",
      }),
      createPort("response-out", "响应体", "output", "json", {
        description: "HTTP 响应返回的 JSON Body 数据",
      }),
    ],
    configSchema: {
      type: "object",
      properties: {
        url: createConfigField("string", "URL"),
        method: createConfigField("string", "Method", {
          enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
          default: "GET",
        }),
        headers: createConfigField("string", "Headers"),
        queryParams: createConfigField("string", "Query Params"),
        body: createConfigField("string", "Body"),
        authType: createConfigField("string", "认证方式", {
          enum: ["none", "bearer", "basic", "api-key"],
          default: "none",
        }),
        authConfig: createConfigField("string", "认证配置"),
        timeout: createConfigField("number", "超时时间", { default: 30 }),
      },
      required: ["url", "method"],
    },
  },
  "code-tool": {
    type: "code-tool",
    category: "tool",
    label: "Code Executor",
    icon: "Code",
    description: "代码执行工具",
    colorToken: CATEGORY_COLOR_TOKENS.tool,
    inputPorts: [
      createPort("exec-in", "", "input", "exec", {
        description: "执行流入口，前序节点完成后触发代码执行",
      }),
      createPort("input-in", "参数", "input", "json", {
        description:
          "以 JSON 形式传入代码的输入参数，在代码中通过 input 变量访问",
      }),
    ],
    outputPorts: [
      createPort("exec-out", "", "output", "exec", {
        description: "执行流出口，代码执行完成后触发下游节点",
      }),
      createPort("result-out", "返回值", "output", "json", {
        description: "代码中 return 语句返回的 JSON 结果",
      }),
      createPort("stdout-out", "stdout", "output", "text", {
        description: "代码执行过程中 console.log / print 输出的文本内容",
      }),
    ],
    configSchema: {
      type: "object",
      properties: {
        language: createConfigField("string", "语言", {
          enum: ["typescript", "javascript", "python", "bash"],
        }),
        code: createConfigField("string", "代码", { default: "" }),
        description: createConfigField("string", "描述"),
        timeout: createConfigField("number", "超时时间", { default: 30 }),
      },
      required: ["language"],
    },
  },
  "mcp-tool": {
    type: "mcp-tool",
    category: "tool",
    label: "MCP Tool",
    icon: "Plug",
    description: "MCP 工具节点",
    colorToken: CATEGORY_COLOR_TOKENS.tool,
    inputPorts: [
      createExecInPort("执行流入口，前序节点完成后暴露 MCP 工具描述符"),
    ],
    outputPorts: [
      createExecOutPort("执行流出口，MCP 工具节点完成后触发下游节点"),
      createPort("tool-out", "工具", "output", "tool", {
        description:
          "连接后该 MCP 工具将注册到 Agent，Agent 可在对话中按需调用",
      }),
    ],
    configSchema: EMPTY_CONFIG_SCHEMA,
  },
  sandbox: {
    type: "sandbox",
    category: "tool",
    label: "Sandbox",
    icon: "Container",
    description: "代码执行沙箱环境",
    colorToken: CATEGORY_COLOR_TOKENS.tool,
    inputPorts: [
      createExecInPort("执行流入口，前序节点完成后创建或恢复沙箱会话"),
      createPort("volume-in", "工作区", "input", "volume", {
        required: false,
        description: "可选挂载持久化工作区，沙箱内的文件读写将保存到该工作区",
      }),
    ],
    outputPorts: [
      createExecOutPort("执行流出口，沙箱会话准备完成后触发下游节点"),
      createPort("sandbox-out", "沙箱", "output", "sandbox", {
        multiple: true,
        maxConnections: null,
        description:
          "提供隔离的代码执行环境，连接到 Agent 后可运行代码和终端命令",
      }),
    ],
    configSchema: {
      type: "object",
      properties: {
        cpu: createConfigField("number", "CPU", { default: 1 }),
        memory: createConfigField("number", "Memory", { default: 512 }),
        disk: createConfigField("number", "Disk", { default: 2 }),
        persistencePath: createConfigField("string", "Persistence Path", {
          default: "",
        }),
        timeout: createConfigField("number", "Timeout", { default: 0 }),
      },
      required: [],
    },
  },
  "manual-trigger": {
    type: "manual-trigger",
    category: "trigger",
    label: "Manual Trigger",
    icon: "Play",
    description: "手动触发器",
    colorToken: CATEGORY_COLOR_TOKENS.trigger,
    inputPorts: [],
    outputPorts: [
      createPort("exec-out", "", "output", "exec", {
        description: "执行流出口，触发后启动工作流的后续节点",
      }),
      createPort("payload-out", "触发数据", "output", "json", {
        description: "手动触发时传入的表单参数数据",
      }),
    ],
    configSchema: EMPTY_CONFIG_SCHEMA,
  },
  "schedule-trigger": {
    type: "schedule-trigger",
    category: "trigger",
    label: "Schedule",
    icon: "Clock",
    description: "定时触发器",
    colorToken: CATEGORY_COLOR_TOKENS.trigger,
    inputPorts: [],
    outputPorts: [
      createPort("exec-out", "", "output", "exec", {
        description: "执行流出口，定时触发后启动工作流",
      }),
      createPort("payload-out", "触发数据", "output", "json", {
        description: "定时触发时的调度信息（触发时间、Cron 表达式等）",
      }),
    ],
    configSchema: {
      type: "object",
      properties: {
        cron: createConfigField("string", "Cron"),
        timezone: createConfigField("string", "时区", { default: "UTC" }),
      },
      required: ["cron"],
    },
  },
  "webhook-trigger": {
    type: "webhook-trigger",
    category: "trigger",
    label: "Webhook",
    icon: "Webhook",
    description: "Webhook 触发器",
    colorToken: CATEGORY_COLOR_TOKENS.trigger,
    inputPorts: [],
    outputPorts: [
      createPort("exec-out", "", "output", "exec", {
        description: "执行流出口，Webhook 请求到达后触发工作流",
      }),
      createPort("payload-out", "触发数据", "output", "json", {
        description: "Webhook 请求携带的 JSON Body 数据",
      }),
    ],
    configSchema: {
      type: "object",
      properties: {
        authMode: createConfigField("string", "鉴权模式", {
          enum: ["simple", "signed"],
          default: "simple",
        }),
        ipWhitelist: createConfigField("string", "IP 白名单"),
      },
      required: [],
    },
  },
  "api-event-trigger": {
    type: "api-event-trigger",
    category: "trigger",
    label: "API Event",
    icon: "Radio",
    description: "API 事件触发器",
    colorToken: CATEGORY_COLOR_TOKENS.trigger,
    inputPorts: [],
    outputPorts: [
      createPort("exec-out", "", "output", "exec", {
        description: "执行流出口，API 事件到达后触发工作流",
      }),
      createPort("payload-out", "触发数据", "output", "json", {
        description:
          "外部 API 事件携带的 JSON 数据（GitHub Webhook、自定义事件等）",
      }),
    ],
    configSchema: {
      type: "object",
      properties: {
        eventSource: createConfigField("string", "事件来源"),
        eventType: createConfigField("string", "事件类型"),
        filterExpression: createConfigField("string", "过滤表达式"),
      },
      required: ["eventSource", "eventType"],
    },
  },
  "knowledge-base": {
    type: "knowledge-base",
    category: "knowledge",
    label: "Knowledge Base",
    icon: "Database",
    description: "知识库检索节点",
    colorToken: CATEGORY_COLOR_TOKENS.knowledge,
    inputPorts: [createExecInPort("执行流入口，前序节点完成后暴露知识库绑定")],
    outputPorts: [
      createExecOutPort("执行流出口，知识库节点完成后触发下游节点"),
      createPort("knowledge-out", "知识库", "output", "knowledge", {
        description: "向量知识库，连接后 Agent 可检索其中的文档进行回答",
      }),
    ],
    configSchema: {
      type: "object",
      properties: {
        knowledgeBaseId: createConfigField("string", "Knowledge Base ID"),
      },
      required: ["knowledgeBaseId"],
    },
  },
  text: {
    type: "text",
    category: "output",
    label: "Text",
    icon: "FileText",
    description: "提供可复用的文本常量，可连接到系统提示词或任意文本输入端口",
    colorToken: CATEGORY_COLOR_TOKENS.output,
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
  "text-output": {
    type: "text-output",
    category: "output",
    label: "Text Output",
    icon: "FileText",
    description: "文本输出节点",
    colorToken: CATEGORY_COLOR_TOKENS.output,
    inputPorts: [
      createPort("exec-in", "", "input", "exec", {
        description: "执行流入口，前序节点完成后触发输出",
      }),
      createPort("content-in", "文本", "input", "text", {
        description: "接收要作为工作流最终结果输出的文本内容",
      }),
    ],
    outputPorts: [],
    configSchema: EMPTY_CONFIG_SCHEMA,
  },
  "json-output": {
    type: "json-output",
    category: "output",
    label: "JSON Output",
    icon: "Braces",
    description: "JSON 输出节点",
    colorToken: CATEGORY_COLOR_TOKENS.output,
    inputPorts: [
      createPort("exec-in", "", "input", "exec", {
        description: "执行流入口，前序节点完成后触发输出",
      }),
      createPort("content-in", "JSON", "input", "json", {
        description: "接收要作为工作流最终结果输出的 JSON 数据",
      }),
    ],
    outputPorts: [],
    configSchema: EMPTY_CONFIG_SCHEMA,
  },
  condition: {
    type: "condition",
    category: "control",
    label: "Condition",
    icon: "GitBranch",
    description: "条件分支节点",
    colorToken: CATEGORY_COLOR_TOKENS.control,
    inputPorts: [
      createPort("exec-in", "", "input", "exec", {
        description: "执行流入口，前序节点完成后触发条件判断",
      }),
      createPort("input-0", "输入 1", "input", "json", {
        acceptsAnyDataType: true,
        description: "第 1 个条件输入口，可接收任意上游端口值并在规则中引用",
        schema: {
          kind: "json",
          shape: "object",
          title: "输入 1",
          properties: {},
          additionalProperties: true,
        },
      }),
    ],
    outputPorts: [
      createPort("branch-0", "IF", "output", "json", {
        description: "第一个条件匹配时数据从此分支输出",
      }),
      createPort("else", "ELSE", "output", "json", {
        description: "兜底分支，当所有条件均不满足时数据从此输出",
      }),
    ],
    configSchema: EMPTY_CONFIG_SCHEMA,
  },
  loop: {
    type: "loop",
    category: "control",
    label: "Loop",
    icon: "Repeat",
    description: "循环 compound 容器",
    colorToken: CATEGORY_COLOR_TOKENS.control,
    inputPorts: [
      createPort("exec-in", "", "input", "exec", {
        description: "执行流入口，前序节点完成后开始循环",
      }),
      createPort("state-in", "初始状态", "input", "json", {
        acceptsAnyDataType: true,
        description: "循环的初始状态输入，未连线时回退到默认 state",
        schema: {
          kind: "json",
          shape: "object",
          title: "初始状态",
          properties: {},
          additionalProperties: true,
        },
      }),
    ],
    outputPorts: [
      createPort("exec-out", "", "output", "exec", {
        description: "循环容器执行完成后触发下游节点",
      }),
    ],
    configSchema: {
      type: "object",
      properties: {
        defaultState: createConfigField("object", "默认初始状态"),
        outputMode: createConfigField("string", "输出模式", {
          enum: ["none", "last", "collect-array"],
          default: "last",
        }),
        isCollapsed: createConfigField("boolean", "收起状态", {
          default: false,
        }),
      },
      required: [],
    },
  },
  iteration: {
    type: "iteration",
    category: "control",
    label: "Iteration",
    icon: "Repeat2",
    description: "数组迭代 compound 容器",
    colorToken: CATEGORY_COLOR_TOKENS.control,
    inputPorts: [
      createPort("exec-in", "", "input", "exec", {
        description: "执行流入口，前序节点完成后开始迭代",
      }),
      createPort("items-in", "数组", "input", "array", {
        description: "待迭代的数组输入",
      }),
    ],
    outputPorts: [
      createPort("exec-out", "", "output", "exec", {
        description: "迭代容器执行完成后触发下游节点",
      }),
    ],
    configSchema: {
      type: "object",
      properties: {
        outputMode: createConfigField("string", "输出模式", {
          enum: ["none", "collect-array", "last"],
          default: "collect-array",
        }),
        isCollapsed: createConfigField("boolean", "收起状态", {
          default: false,
        }),
      },
      required: [],
    },
  },
  "loop-start": {
    type: "loop-start",
    category: "control",
    label: "循环起点",
    icon: "Play",
    description: "循环子图入口节点",
    colorToken: CATEGORY_COLOR_TOKENS.control,
    inputPorts: [],
    outputPorts: [
      createPort("exec-out", "", "output", "exec", {
        description: "每轮开始时触发内部子图",
      }),
      createPort("round", "轮次", "output", "json", {
        acceptsAnyDataType: true,
        description: "当前循环轮次（从 0 开始）",
      }),
      createPort("state", "当前状态", "output", "json", {
        acceptsAnyDataType: true,
        description: "当前循环轮次可见的 state",
        schema: {
          kind: "json",
          shape: "object",
          title: "当前状态",
          properties: {},
          additionalProperties: true,
        },
      }),
    ],
    configSchema: {
      type: "object",
      properties: {
        exposePreviousResult: createConfigField("boolean", "暴露上一轮结果", {
          default: false,
        }),
        exposeIsFirst: createConfigField("boolean", "暴露首轮标记", {
          default: false,
        }),
      },
      required: [],
    },
  },
  "iteration-start": {
    type: "iteration-start",
    category: "control",
    label: "迭代起点",
    icon: "Play",
    description: "迭代子图入口节点",
    colorToken: CATEGORY_COLOR_TOKENS.control,
    inputPorts: [],
    outputPorts: [
      createPort("exec-out", "", "output", "exec", {
        description: "每个数组项开始时触发内部子图",
      }),
      createPort("item", "当前项", "output", "json", {
        acceptsAnyDataType: true,
        description: "当前迭代项",
        schema: {
          kind: "json",
          shape: "object",
          title: "当前项",
          properties: {},
          additionalProperties: true,
        },
      }),
      createPort("index", "索引", "output", "json", {
        acceptsAnyDataType: true,
        description: "当前项索引（从 0 开始）",
      }),
    ],
    configSchema: {
      type: "object",
      properties: {
        exposeTotal: createConfigField("boolean", "暴露总数", {
          default: false,
        }),
        exposeIsFirst: createConfigField("boolean", "暴露首项标记", {
          default: false,
        }),
        exposeIsLast: createConfigField("boolean", "暴露末项标记", {
          default: false,
        }),
      },
      required: [],
    },
  },
  "loop-state": {
    type: "loop-state",
    category: "control",
    label: "Loop State",
    icon: "RefreshCcw",
    description: "提交下一轮循环状态",
    colorToken: CATEGORY_COLOR_TOKENS.control,
    inputPorts: [
      createPort("exec-in", "", "input", "exec", {
        description: "执行流进入后提交下一轮状态",
      }),
      createPort("state-in", "下一轮状态", "input", "json", {
        acceptsAnyDataType: true,
        description: "提交给下一轮循环的状态值",
        schema: {
          kind: "json",
          shape: "object",
          title: "下一轮状态",
          properties: {},
          additionalProperties: true,
        },
      }),
    ],
    outputPorts: [
      createPort("exec-out", "", "output", "exec", {
        description: "状态提交后继续内部执行链路",
      }),
    ],
    configSchema: EMPTY_CONFIG_SCHEMA,
  },
  result: {
    type: "result",
    category: "control",
    label: "Result",
    icon: "ArrowRightFromLine",
    description: "向父 compound 显式提交结果",
    colorToken: CATEGORY_COLOR_TOKENS.control,
    inputPorts: [
      createPort("exec-in", "", "input", "exec", {
        description: "执行流进入后提交结果",
      }),
      createPort("value-in", "结果值", "input", "json", {
        acceptsAnyDataType: true,
        description: "要提交给父容器的结果值",
        schema: {
          kind: "json",
          shape: "object",
          title: "结果值",
          properties: {},
          additionalProperties: true,
        },
      }),
    ],
    outputPorts: [],
    configSchema: {
      type: "object",
      properties: {
        outputKey: createConfigField("string", "输出键", { default: "result" }),
      },
      required: ["outputKey"],
    },
  },
  break: {
    type: "break",
    category: "control",
    label: "Break",
    icon: "CircleOff",
    description: "结束整个 compound",
    colorToken: CATEGORY_COLOR_TOKENS.control,
    inputPorts: [
      createPort("exec-in", "", "input", "exec", {
        description: "执行流进入后结束整个容器",
      }),
    ],
    outputPorts: [],
    configSchema: {
      type: "object",
      properties: {
        mode: createConfigField("string", "触发模式", {
          enum: ["always", "expression"],
          default: "always",
        }),
        expression: createConfigField("string", "条件表达式"),
      },
      required: [],
    },
  },
  continue: {
    type: "continue",
    category: "control",
    label: "Continue",
    icon: "FastForward",
    description: "跳过当前轮次并进入下一轮",
    colorToken: CATEGORY_COLOR_TOKENS.control,
    inputPorts: [
      createPort("exec-in", "", "input", "exec", {
        description: "执行流进入后跳过当前轮次",
      }),
    ],
    outputPorts: [],
    configSchema: {
      type: "object",
      properties: {
        mode: createConfigField("string", "触发模式", {
          enum: ["always", "expression"],
          default: "always",
        }),
        expression: createConfigField("string", "条件表达式"),
      },
      required: [],
    },
  },
  "reusable-block": {
    type: "reusable-block",
    category: "control",
    label: "Reusable Block",
    icon: "Package",
    description: "A reusable group of nodes encapsulated as a single block",
    colorToken: CATEGORY_COLOR_TOKENS.control,
    inputPorts: [],
    outputPorts: [],
    configSchema: EMPTY_CONFIG_SCHEMA,
  },
  "smart-routing": {
    type: "smart-routing",
    category: "agent",
    label: "智能路由",
    icon: "GitFork",
    description: "根据策略从多个 LLM 模型中选择最优模型",
    colorToken: CATEGORY_COLOR_TOKENS.agent,
    inputPorts: [
      createExecInPort("执行流入口，前序节点完成后触发智能路由决策"),
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
      createExecOutPort("执行流出口，智能路由完成后触发下游节点"),
      createPort("model-out", "选定模型", "output", "model", {
        multiple: true,
        maxConnections: 5,
        description: "根据路由策略（如成本优先、质量优先）选出的模型实例",
      }),
    ],
    configSchema: {
      type: "object" as const,
      properties: {
        strategy: {
          type: "string",
          title: "路由策略",
          enum: [
            "random",
            "round_robin",
            "rules",
            "llm_as_router",
            "fallback_chain",
            "knn",
            "mlp",
            "elo",
            "memory_bank",
            "wasm_plugin",
          ],
          default: "random",
        },
      },
      required: ["strategy"],
    },
  },
  plugin: {
    type: "plugin",
    category: "plugin",
    label: "插件节点",
    icon: "Puzzle",
    description: "通过插件扩展的自定义节点",
    colorToken: CATEGORY_COLOR_TOKENS.plugin,
    inputPorts: [],
    outputPorts: [],
    configSchema: EMPTY_CONFIG_SCHEMA,
  },
  "input-preprocessor": {
    type: "input-preprocessor",
    category: "tool",
    label: "输入预处理器",
    icon: "Filter",
    description: "对输入数据进行转换预处理（JMESPath / JSONata / 模板 / 脚本）",
    colorToken: CATEGORY_COLOR_TOKENS.tool,
    inputPorts: [
      createPort("exec-in", "", "input", "exec", {
        description: "执行流入口，前序节点完成后触发预处理",
      }),
      createPort("text-in", "文本", "input", "text", {
        description: "接收待预处理的原始文本，如用户输入或上游节点的文本输出",
      }),
      createPort("json-in", "JSON", "input", "json", {
        description: "接收待预处理的原始 JSON 数据",
      }),
    ],
    outputPorts: [
      createPort("exec-out", "", "output", "exec", {
        description: "执行流出口，预处理完成后触发下游节点",
      }),
      createPort("text-out", "文本", "output", "text", {
        description: "经过预处理规则转换后的文本，可连接多个下游节点",
        multiple: true,
        maxConnections: null,
      }),
      createPort("json-out", "JSON", "output", "json", {
        description: "经过预处理规则转换后的 JSON 数据，可连接多个下游节点",
        multiple: true,
        maxConnections: null,
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
  memory: {
    type: "memory",
    category: "memory",
    label: "Memory",
    icon: "BrainCircuit",
    description: "图谱记忆实例节点",
    colorToken: CATEGORY_COLOR_TOKENS.memory,
    inputPorts: [createExecInPort("执行流入口，前序节点完成后创建记忆会话")],
    outputPorts: [
      createExecOutPort("执行流出口，记忆节点完成后触发下游节点"),
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
  agent: {
    type: "agent",
    category: "agent",
    label: "Agent",
    icon: "Brain",
    description: "调用已发布的 Agent Definition 执行任务",
    colorToken: CATEGORY_COLOR_TOKENS.agent,
    inputPorts: [
      createExecInPort("执行流入口，前序节点完成后触发 Agent 执行"),
      createPort("text-in", "文本", "input", "text", {
        required: true,
        description: "发送给 Agent 的输入文本，通常来自上游节点或触发数据",
      }),
      createPort("system-prompt-in", "系统提示词", "input", "text", {
        maxConnections: 1,
        description:
          "覆盖被调用 Agent 的系统提示词，用于为本次工作流调用注入局部角色约束",
      }),
      createPort("sandbox-in", "沙箱", "input", "sandbox", {
        maxConnections: 1,
        description: "绑定沙箱执行环境，Agent 可在其中运行代码和终端命令",
      }),
      createPort("context-in", "上下文", "input", "json", {
        description: "传入附加上下文 JSON 数据，Agent 推理时可作为参考信息",
      }),
      createPort("skills-in", "Skills", "input", "skill", {
        multiple: true,
        maxConnections: null,
        description: "启用 Skill 能力模板，Agent 在对话中可按需激活使用",
      }),
      createPort("tools-in", "扩展工具", "input", "tool", {
        multiple: true,
        maxConnections: null,
        description: "额外挂载 MCP 工具，Agent 可在对话中按需调用这些工具",
      }),
      createPort("sub-agents-in", "子 Agent", "input", "agent", {
        multiple: true,
        maxConnections: null,
        description: "注册可调度的子 Agent，主 Agent 可将子任务委派给它们",
      }),
      createPort("schema-in", "Schema", "input", "json", {
        maxConnections: 1,
        description: "定义 Agent 输出的 JSON Schema，约束回复格式为结构化数据",
      }),
    ],
    outputPorts: [
      createExecOutPort("执行流出口，Agent 完成后触发下游节点"),
      createPort("agent-out", "回复", "output", "text", {
        multiple: true,
        maxConnections: null,
        description: "Agent 生成的自然语言文本回复",
      }),
      createPort("structured-out", "结构化", "output", "json", {
        multiple: true,
        maxConnections: null,
        description: "Agent 按 Schema 约束输出的结构化 JSON 数据",
      }),
    ],
    configSchema: EMPTY_CONFIG_SCHEMA,
  },
  skill: {
    type: "skill",
    category: "agent",
    label: "Skill",
    icon: "BookOpenText",
    description: "Agent prompt 增强指令",
    colorToken: "var(--color-type-skill)",
    inputPorts: [createExecInPort("执行流入口，前序节点完成后解析 Skill 内容")],
    outputPorts: [
      createExecOutPort("执行流出口，Skill 节点完成后触发下游节点"),
      createPort("skill-out", "Skill", "output", "skill", {
        description: "预定义的能力模板，连接后 Agent 在对话中可按需激活使用",
      }),
    ],
    configSchema: {
      type: "object",
      properties: {
        skillId: createConfigField("string", "Skill ID", {
          description: "关联的技能 ID",
        }),
        skillName: createConfigField("string", "技能名称"),
        skillDescription: createConfigField("string", "技能描述"),
      },
      required: ["skillId"],
    },
  },
  workspace: {
    type: "workspace",
    category: "tool",
    label: "Workspace",
    icon: "FolderOpen",
    description: "持久化工作区卷",
    colorToken: CATEGORY_COLOR_TOKENS.tool,
    inputPorts: [createExecInPort("执行流入口，前序节点完成后暴露工作区卷")],
    outputPorts: [
      createExecOutPort("执行流出口，工作区节点完成后触发下游节点"),
      createPort("volume-out", "工作区", "output", "volume", {
        description: "持久化存储卷，可跨多次执行保留文件，需连接到沙箱节点使用",
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
  merge: {
    type: "merge",
    category: "control",
    label: "Merge",
    icon: "GitMerge",
    description: "合并多分支数据",
    colorToken: CATEGORY_COLOR_TOKENS.control,
    inputPorts: [
      createExecInPort("执行流入口，前序节点完成后触发合并逻辑"),
      createPort("input-0", "输入 1", "input", "json", {
        description: "第 1 路输入，等待所有输入就绪后进行合并",
      }),
      createPort("input-1", "输入 2", "input", "json", {
        description: "第 2 路输入，等待所有输入就绪后进行合并",
      }),
    ],
    outputPorts: [
      createExecOutPort("执行流出口，合并完成后触发下游节点"),
      createPort("merged-out", "合并结果", "output", "json", {
        description: "将所有输入路的数据合并为一个 JSON 对象后输出",
      }),
    ],
    configSchema: {
      type: "object",
      properties: {
        mode: createConfigField("string", "合并模式", {
          enum: ["append", "merge-by-key"],
          default: "append",
        }),
        mergeKey: createConfigField("string", "合并键"),
        inputCount: createConfigField("number", "输入数量", { default: 2 }),
      },
      required: ["mode"],
    },
  },
};

export function getWorkflowAgentInputPorts(
  runtimeMode: AgentRuntimeMode | null | undefined,
): PortDefinition[] {
  const inputPorts = clonePortDefinitions(NODE_TYPE_REGISTRY.agent.inputPorts);
  return runtimeMode === "no_sandbox"
    ? inputPorts.filter((port) => port.id !== "sandbox-in")
    : inputPorts;
}

function resolveLegacyNodeTypeAlias(type: string): string {
  return type === "mcp" ? "mcp-tool" : type;
}

export function getNodeTypeConfig(type: NodeType): NodeTypeConfig {
  const resolvedType = resolveLegacyNodeTypeAlias(type as string);
  const config = NODE_TYPE_REGISTRY[resolvedType as NodeType];
  if (!config) {
    const agentConfig = AGENT_CANVAS_NODE_REGISTRY.get(resolvedType);
    if (agentConfig) return agentConfig as unknown as NodeTypeConfig;
    throw new Error(`Unknown node type: ${type}`);
  }

  return config;
}

export function getNodeTypeConfigOrNull(type: string): NodeTypeConfig | null {
  const resolvedType = resolveLegacyNodeTypeAlias(type);
  return (
    NODE_TYPE_REGISTRY[resolvedType as NodeType] ??
    (AGENT_CANVAS_NODE_REGISTRY.get(
      resolvedType,
    ) as unknown as NodeTypeConfig) ??
    null
  );
}

function resolveNodeCategory(category: unknown): NodeCategory {
  return typeof category === "string" &&
    NODE_CATEGORY_VALUES.has(category as NodeCategory)
    ? (category as NodeCategory)
    : "control";
}

export function getResolvedNodeTypeConfig(
  type: string | null | undefined,
  options: {
    category?: unknown;
    inputPorts?: PortDefinition[] | null | undefined;
    outputPorts?: PortDefinition[] | null | undefined;
  } = {},
): ResolvedNodeTypeConfig {
  const normalizedType =
    typeof type === "string" && type.trim().length > 0
      ? type.trim()
      : "unknown-node";
  const config = getNodeTypeConfigOrNull(normalizedType);

  if (config) {
    return {
      ...config,
      isKnownType: true,
    };
  }

  return {
    type: normalizedType,
    category: resolveNodeCategory(options.category),
    label: "未知节点类型",
    icon: "Bot",
    description: `当前版本暂不识别节点类型 ${normalizedType}，已保留原始端口与配置数据。`,
    colorToken: "var(--color-muted)",
    inputPorts: Array.isArray(options.inputPorts) ? options.inputPorts : [],
    outputPorts: Array.isArray(options.outputPorts) ? options.outputPorts : [],
    configSchema: EMPTY_NODE_CONFIG_SCHEMA,
    isKnownType: false,
  };
}

export function getAllNodeTypes(): NodeTypeConfig[] {
  return NODE_TYPES.map((type) => NODE_TYPE_REGISTRY[type]);
}

