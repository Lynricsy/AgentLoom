/**
 * guest Fastify 进程 ⇄ dsh 子进程内 agentloom-bridge 插件之间的 JSON-RPC 契约。
 * 传输为 unix socket 上的行分隔 JSON-RPC（`@deepseek-ai/dsh-sdk-protocol`
 * 的 JsonRpcLineTransport）；guest 是客户端，bridge 是服务端。
 */
import type { PTYSessionInfo } from '../pty/types.js';
import type {
  CreateSessionRequest,
  RemoteToolExecutionConfig,
  SandboxAgentEvent,
} from '../types.js';

/** bridge → guest 的唯一通知：某个会话的 SandboxAgentEvent */
export const BRIDGE_EVENT_NOTIFICATION = 'event';

export type NativeToolPolicy = NonNullable<CreateSessionRequest['nativeToolPolicy']>;

export interface BridgeEventNotification {
  sessionId: string;
  event: SandboxAgentEvent;
}

export interface BridgeInitializeParams {
  cwd: string;
  /** llm-pi-ai 路由名（= models.providers 的键） */
  provider: string;
  model: string;
  /** 远程工具回调配置经 socket 下发，不落盘到 patch 文件（含会话 token） */
  remoteToolExecution?: RemoteToolExecutionConfig;
  nativeToolPolicy?: NativeToolPolicy;
  /**
   * runtime 插件 patch 插入的 Loader 条目。dsh 对未激活的非必需条目只在 stderr
   * 警告；bridge 在 Loader 就绪后逐个核对，任一未激活即让 initialize 失败。
   */
  pluginEntries?: RuntimePluginEntry[];
}

export interface RuntimePluginEntry {
  /** cordis.patch.yml 中的条目 id */
  id: string;
  /** 出错信息里展示的插件名（package：pluginId；npm：name@version） */
  plugin: string;
}

export interface BridgeRequestMap {
  initialize: { params: BridgeInitializeParams; result: Record<string, never> };
  'session/create': { params: { sessionId: string }; result: Record<string, never> };
  'session/prompt': {
    params: { sessionId: string; text: string };
    result: { messageId: string };
  };
  'session/cancel': { params: { sessionId: string }; result: Record<string, never> };
  'session/dispose': { params: { sessionId: string }; result: Record<string, never> };
  /** 解析 bridge 发起的审批；resolved=false 表示该 callId 没有待决审批 */
  'permission/resolve': {
    params: { callId: string; allowed: boolean };
    result: { resolved: boolean };
  };
  'pty/list': { params: Record<string, never>; result: { sessions: PTYSessionInfo[] } };
  'pty/write': {
    params: { sessionId: string; data: string };
    result: Record<string, never>;
  };
  /** content=null 表示 PTY 会话不存在 */
  'pty/buffer-dump': {
    params: { sessionId: string };
    result: { content: string | null };
  };
  shutdown: { params: Record<string, never>; result: Record<string, never> };
}

export type BridgeMethod = keyof BridgeRequestMap;
