import { z } from 'zod';

/** 本适配器实现的 A2A 协议版本（JSON-RPC 绑定） */
export const A2A_PROTOCOL_VERSION = '1.0';

/** 请求头：客户端声明的 A2A 协议版本 */
export const A2A_VERSION_HEADER = 'a2a-version';

/** `SendMessage` 阻塞等待 run 结束的上限（秒）；到期仍未终态时返回当前状态 */
export const A2A_BLOCKING_WAIT_SECONDS = 120;

export const A2A_TASK_STATES = [
  'TASK_STATE_SUBMITTED',
  'TASK_STATE_WORKING',
  'TASK_STATE_COMPLETED',
  'TASK_STATE_FAILED',
  'TASK_STATE_CANCELED',
] as const;
export type A2aTaskState = (typeof A2A_TASK_STATES)[number];

/** JSON-RPC 2.0 标准错误码 */
export const JSON_RPC_ERRORS = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
} as const;

/** A2A 1.0 规范定义的错误码 */
export const A2A_ERRORS = {
  TaskNotFound: -32001,
  TaskNotCancelable: -32002,
  PushNotificationNotSupported: -32003,
  UnsupportedOperation: -32004,
  ContentTypeNotSupported: -32005,
  VersionNotSupported: -32009,
} as const;

export const A2A_METHODS = {
  SendMessage: 'SendMessage',
  SendStreamingMessage: 'SendStreamingMessage',
  GetTask: 'GetTask',
  ListTasks: 'ListTasks',
  CancelTask: 'CancelTask',
  SubscribeToTask: 'SubscribeToTask',
  CreateTaskPushNotificationConfig: 'CreateTaskPushNotificationConfig',
  GetTaskPushNotificationConfig: 'GetTaskPushNotificationConfig',
  ListTaskPushNotificationConfigs: 'ListTaskPushNotificationConfigs',
  DeleteTaskPushNotificationConfig: 'DeleteTaskPushNotificationConfig',
  GetExtendedAgentCard: 'GetExtendedAgentCard',
} as const;

export const A2A_PUSH_NOTIFICATION_METHODS: readonly string[] = [
  A2A_METHODS.CreateTaskPushNotificationConfig,
  A2A_METHODS.GetTaskPushNotificationConfig,
  A2A_METHODS.ListTaskPushNotificationConfigs,
  A2A_METHODS.DeleteTaskPushNotificationConfig,
];

export const JsonRpcIdSchema = z.union([z.string(), z.number(), z.null()]);
export type JsonRpcId = z.infer<typeof JsonRpcIdSchema>;

export const JsonRpcRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: JsonRpcIdSchema,
  method: z.string().min(1),
  params: z.unknown().optional(),
});
export type JsonRpcRequest = z.infer<typeof JsonRpcRequestSchema>;

/** Part：`text | raw | url | data` 四选一 */
export const A2aPartSchema = z
  .object({
    text: z.string().optional(),
    raw: z.string().optional(),
    url: z.string().optional(),
    data: z.unknown().optional(),
    filename: z.string().optional(),
    mediaType: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (part) =>
      [part.text, part.raw, part.url, part.data].filter(
        (value) => value !== undefined,
      ).length === 1,
    { message: 'part must contain exactly one of text, raw, url, data' },
  );
export type A2aPart = z.infer<typeof A2aPartSchema>;

export const A2aRoleSchema = z.enum(['ROLE_USER', 'ROLE_AGENT']);
export type A2aRole = z.infer<typeof A2aRoleSchema>;

export const A2aMessageSchema = z.object({
  messageId: z.string().min(1).max(200),
  contextId: z.string().optional(),
  taskId: z.string().optional(),
  role: A2aRoleSchema,
  parts: z.array(A2aPartSchema).min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
  extensions: z.array(z.string()).optional(),
  referenceTaskIds: z.array(z.string()).optional(),
});
export type A2aMessage = z.infer<typeof A2aMessageSchema>;

export const SendMessageParamsSchema = z.object({
  tenant: z.string().optional(),
  message: A2aMessageSchema,
  configuration: z
    .object({
      returnImmediately: z.boolean().optional(),
      historyLength: z.number().int().nonnegative().optional(),
      acceptedOutputModes: z.array(z.string()).optional(),
      taskPushNotificationConfig: z.unknown().optional(),
    })
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type SendMessageParams = z.infer<typeof SendMessageParamsSchema>;

export const GetTaskParamsSchema = z.object({
  tenant: z.string().optional(),
  id: z.string().min(1),
  historyLength: z.number().int().nonnegative().optional(),
});
export type GetTaskParams = z.infer<typeof GetTaskParamsSchema>;

export const CancelTaskParamsSchema = z.object({
  tenant: z.string().optional(),
  id: z.string().min(1),
});
export type CancelTaskParams = z.infer<typeof CancelTaskParamsSchema>;

export const SubscribeToTaskParamsSchema = z.object({
  tenant: z.string().optional(),
  id: z.string().min(1),
});
export type SubscribeToTaskParams = z.infer<typeof SubscribeToTaskParamsSchema>;

/* ---------- 响应对象（只由服务端构造，不做运行期校验） ---------- */

export interface A2aTaskStatus {
  state: A2aTaskState;
  message?: A2aOutboundMessage;
  timestamp: string;
}

export interface A2aOutboundPart {
  text: string;
  mediaType?: string;
}

export interface A2aOutboundMessage {
  messageId: string;
  contextId: string;
  taskId: string;
  role: A2aRole;
  parts: A2aOutboundPart[];
}

export interface A2aArtifact {
  artifactId: string;
  name?: string;
  parts: A2aOutboundPart[];
}

export interface A2aTask {
  id: string;
  contextId: string;
  status: A2aTaskStatus;
  artifacts: A2aArtifact[];
  history?: A2aOutboundMessage[];
  metadata: Record<string, unknown>;
}

export interface A2aTaskStatusUpdateEvent {
  taskId: string;
  contextId: string;
  status: A2aTaskStatus;
  metadata?: Record<string, unknown>;
}

export interface A2aTaskArtifactUpdateEvent {
  taskId: string;
  contextId: string;
  artifact: A2aArtifact;
  append?: boolean;
  lastChunk?: boolean;
}

/** 流式响应：`task | message | statusUpdate | artifactUpdate` 四选一 */
export type A2aStreamResponse =
  | { task: A2aTask }
  | { message: A2aOutboundMessage }
  | { statusUpdate: A2aTaskStatusUpdateEvent }
  | { artifactUpdate: A2aTaskArtifactUpdateEvent };

export interface A2aAgentCard {
  name: string;
  description: string;
  supportedInterfaces: Array<{
    url: string;
    protocolBinding: 'JSONRPC';
    protocolVersion: string;
  }>;
  provider: { organization: string; url?: string };
  version: string;
  capabilities: {
    streaming: boolean;
    pushNotifications: boolean;
    extendedAgentCard: boolean;
  };
  securitySchemes: Record<
    string,
    {
      httpAuthSecurityScheme: {
        scheme: string;
        bearerFormat?: string;
        description?: string;
      };
    }
  >;
  securityRequirements: Array<{
    schemes: Record<string, { list: string[] }>;
  }>;
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: Array<{
    id: string;
    name: string;
    description: string;
    tags: string[];
    inputModes: string[];
    outputModes: string[];
  }>;
}

export interface JsonRpcErrorObject {
  code: number;
  message: string;
  data?: unknown;
}

export type JsonRpcResponse =
  | { jsonrpc: '2.0'; id: JsonRpcId; result: unknown }
  | { jsonrpc: '2.0'; id: JsonRpcId; error: JsonRpcErrorObject };
