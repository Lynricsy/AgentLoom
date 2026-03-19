import type { AgentEvent } from '../types/agent-event.types';
import type {
  AgentSession,
  CreateSessionParams,
} from '../types/agent-session.types';
import type { ContentBlock } from '../types/content-block.types';

/**
 * NestJS 注入令牌：IAgentRuntime
 *
 * @example
 * ```typescript
 * @Inject(AGENT_RUNTIME) private readonly runtime: IAgentRuntime
 * ```
 */
export const AGENT_RUNTIME = Symbol('AGENT_RUNTIME');

/**
 * Agent 运行时协议无关接口
 *
 * 解耦 Agent 交互与具体传输协议（REST/WebSocket/stdio），
 * 上层模块通过该接口统一访问 Agent 能力。
 */
export interface IAgentRuntime {
  createSession(params: CreateSessionParams): Promise<AgentSession>;
  loadSession(sessionId: string): Promise<AgentSession>;
  prompt(sessionId: string, content: ContentBlock[]): AsyncIterable<AgentEvent>;
  cancel(sessionId: string): Promise<void>;
  resolveToolPermission?(
    sessionId: string,
    toolCallId: string,
    action: 'approve' | 'deny',
  ): Promise<void>;
  registerSessionMetadata?(
    sessionId: string,
    tenantId: string,
    stepId: string,
  ): void;
}
