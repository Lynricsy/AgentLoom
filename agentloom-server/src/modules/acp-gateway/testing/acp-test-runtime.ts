import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Injectable } from '@nestjs/common';
import {
  AGENT_RUNTIME,
  type IAgentRuntime,
} from '../../agent/ports/agent-runtime.port';
import type { AgentEvent, StopReason } from '../../agent/types/agent-event.types';
import { InProcessAgentAdapter } from '../../agent/in-process-agent.adapter';
import type { SessionToolProvider } from '../../agent/ports/agent-runtime.port';
import type { ReplayableAgentEvent } from '../../agent/types/conversation-history.types';
import type {
  AgentSession,
  CreateSessionParams,
} from '../../agent/types/agent-session.types';
import type { ContentBlock } from '../../agent/types/content-block.types';
import { SessionPersistenceService } from '../../execution/services/session-persistence.service';

@Injectable()
export class AcpTestRuntime implements IAgentRuntime {
  private readonly sessions = new Map<string, AgentSession>();
  private readonly abortControllers = new Map<string, AbortController>();
  private readonly sessionToolProviders = new Map<string, SessionToolProvider>();
  private readonly pendingPermissions = new Map<
    string,
    {
      toolCallId: string;
      resolve: (action: 'approve' | 'deny' | 'cancelled') => void;
    }
  >();

  constructor(private readonly sessionPersistence: SessionPersistenceService) {}

  async createSession(params: CreateSessionParams): Promise<AgentSession> {
    const session: AgentSession = {
      id: randomUUID(),
      agentId: params.agentId,
      mode: params.mode,
      status: 'active',
      tenantId: params.tenantId,
      llmModelConfigId: params.llmModelConfigId,
      systemPrompt: params.systemPrompt,
      autonomyMode: params.autonomyMode,
      createdAt: new Date(),
      updatedAt: new Date(),
      context: {
        history: [],
        ...(params.cwd === undefined ? {} : { cwd: params.cwd }),
        ...(params.mcpServers === undefined
          ? {}
          : { mcpServers: params.mcpServers }),
        ...(params.serverSandbox === undefined
          ? {}
          : { serverSandbox: params.serverSandbox }),
        ...(params.context === undefined
          ? {}
          : { workflowState: params.context }),
      },
    };

    this.sessions.set(session.id, session);

    if (session.mode === 'conversation') {
      await this.sessionPersistence.saveConversationSession(session);
    }

    return session;
  }

  async loadSession(sessionId: string): Promise<AgentSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      const durableSession =
        await this.sessionPersistence.loadConversationSession(sessionId);
      if (!durableSession) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      this.sessions.set(sessionId, durableSession);
      return durableSession;
    }

    return session;
  }

  async *prompt(
    sessionId: string,
    content: ContentBlock[],
  ): AsyncGenerator<AgentEvent> {
    const session = await this.loadSession(sessionId);
    session.context.history.push(...content);
    session.updatedAt = new Date();

    if (session.mode === 'conversation') {
      await this.sessionPersistence.appendConversationReplayEntry(session, {
        kind: 'user_message',
        content,
      });
    }

    const abortController = new AbortController();
    this.abortControllers.set(sessionId, abortController);

    try {
      const mcpTool = await this.resolveSessionMcpTool(sessionId, session);
      if (mcpTool !== undefined) {
        yield* this.promptWithMcpTool(
          session,
          content,
          abortController.signal,
          mcpTool,
        );
        return;
      }

      const toolCallId = `tool-${sessionId}`;
      const permissionActionPromise = this.waitForPermission(
        sessionId,
        toolCallId,
        abortController.signal,
      );

      const planEvent = {
        type: 'plan',
        title: '测试计划',
        content: '先发出计划，再请求工具权限，最后生成回复。',
      } as const;
      await this.appendConversationEvent(session, planEvent);
      yield planEvent;

      const awaitingPermissionEvent = {
        type: 'tool_call',
        call: {
          id: toolCallId,
          tool: 'filesystem.read',
          args: {
            path: '/tmp/acp-test.txt',
          },
          status: 'awaiting_permission',
          permissionRequest: {
            description: '读取 ACP 测试文件需要主人确认。',
            resourcePaths: ['/tmp/acp-test.txt'],
          },
        },
      } as const;
      await this.appendConversationEvent(session, awaitingPermissionEvent);
      yield awaitingPermissionEvent;

      const permissionAction = await permissionActionPromise;
      if (permissionAction === 'cancelled' || abortController.signal.aborted) {
        yield {
          type: 'done',
          stopReason: 'cancelled',
        };
        await this.persistConversationSession(session, '', 'cancelled');
        return;
      }

      if (permissionAction === 'deny') {
        const deniedEvent = {
          type: 'tool_call',
          call: {
            id: toolCallId,
            tool: 'filesystem.read',
            args: {
              path: '/tmp/acp-test.txt',
            },
            status: 'denied',
            permissionRequest: {
              description: '读取 ACP 测试文件需要主人确认。',
              resourcePaths: ['/tmp/acp-test.txt'],
            },
          },
        } as const;
        await this.appendConversationEvent(session, deniedEvent);
        yield deniedEvent;
        const deniedMessageEvent = {
          type: 'message_chunk',
          content: '主人拒绝了此次工具调用。',
        } as const;
        await this.appendConversationEvent(session, deniedMessageEvent);
        yield deniedMessageEvent;
        yield {
          type: 'done',
          stopReason: 'end_turn',
        };
        await this.persistConversationSession(
          session,
          '主人拒绝了此次工具调用。',
          'end_turn',
        );
        return;
      }

      const inProgressEvent = {
        type: 'tool_call',
        call: {
          id: toolCallId,
          tool: 'filesystem.read',
          args: {
            path: '/tmp/acp-test.txt',
          },
          status: 'in_progress',
        },
      } as const;
      await this.appendConversationEvent(session, inProgressEvent);
      yield inProgressEvent;

      await delay(30);
      if (abortController.signal.aborted) {
        yield {
          type: 'done',
          stopReason: 'cancelled',
        };
        await this.persistConversationSession(session, '', 'cancelled');
        return;
      }

      const completedToolEvent = {
        type: 'tool_call',
        call: {
          id: toolCallId,
          tool: 'filesystem.read',
          args: {
            path: '/tmp/acp-test.txt',
          },
          status: 'completed',
          result: {
            content: '示例文件内容',
          },
        },
      } as const;
      await this.appendConversationEvent(session, completedToolEvent);
      yield completedToolEvent;

      const firstChunkEvent = {
        type: 'message_chunk',
        content: '你好',
      } as const;
      await this.appendConversationEvent(session, firstChunkEvent);
      yield firstChunkEvent;

      await delay(60);
      if (abortController.signal.aborted) {
        yield {
          type: 'done',
          stopReason: 'cancelled',
        };
        await this.persistConversationSession(session, '你好', 'cancelled');
        return;
      }

      const secondChunkEvent = {
        type: 'message_chunk',
        content: '，主人',
      } as const;
      await this.appendConversationEvent(session, secondChunkEvent);
      yield secondChunkEvent;

      yield {
        type: 'done',
        stopReason: 'end_turn',
      };
      await this.persistConversationSession(session, '你好，主人', 'end_turn');
    } finally {
      this.abortControllers.delete(sessionId);
      this.pendingPermissions.delete(sessionId);
    }
  }

  async cancel(sessionId: string): Promise<void> {
    this.abortControllers.get(sessionId)?.abort();
    this.pendingPermissions.get(sessionId)?.resolve('cancelled');
    this.sessionToolProviders.delete(sessionId);
    const session = await this.loadSession(sessionId);
    session.status = 'completed';
    session.updatedAt = new Date();
    if (session.mode === 'conversation') {
      await this.sessionPersistence.saveConversationSession(session);
    }
  }

  async resolveToolPermission(
    sessionId: string,
    toolCallId: string,
    action: 'approve' | 'deny',
  ): Promise<void> {
    const pendingPermission = this.pendingPermissions.get(sessionId);
    if (!pendingPermission || pendingPermission.toolCallId !== toolCallId) {
      throw new Error(
        `Pending tool permission not found: ${sessionId}/${toolCallId}`,
      );
    }

    this.pendingPermissions.delete(sessionId);
    pendingPermission.resolve(action);
  }

  registerSessionToolProvider(
    sessionId: string,
    provider: SessionToolProvider,
  ): void {
    this.sessionToolProviders.set(sessionId, provider);
  }

  unregisterSessionToolProvider(sessionId: string): void {
    this.sessionToolProviders.delete(sessionId);
  }

  private async *promptWithMcpTool(
    session: AgentSession,
    content: ContentBlock[],
    signal: AbortSignal,
    mcpTool: {
      toolName: string;
      execute: (input: Record<string, unknown>) => Promise<unknown>;
    },
  ): AsyncGenerator<AgentEvent> {
    const promptText = this.extractPromptText(content);
    const toolCallId = `mcp-tool-${session.id}`;
    const toolArgs = {
      query: promptText,
    } satisfies Record<string, unknown>;

    const inProgressEvent = {
      type: 'tool_call',
      call: {
        id: toolCallId,
        tool: mcpTool.toolName,
        args: toolArgs,
        status: 'in_progress',
      },
    } as const;
    await this.appendConversationEvent(session, inProgressEvent);
    yield inProgressEvent;

    await delay(40);
    if (signal.aborted) {
      yield {
        type: 'done',
        stopReason: 'cancelled',
      };
      await this.persistConversationSession(session, '', 'cancelled');
      return;
    }

    try {
      const toolResult = await mcpTool.execute(toolArgs);
      const completedEvent = {
        type: 'tool_call',
        call: {
          id: toolCallId,
          tool: mcpTool.toolName,
          args: toolArgs,
          status: 'completed',
          result: toolResult,
        },
      } as const;
      await this.appendConversationEvent(session, completedEvent);
      yield completedEvent;

      await delay(20);
      if (signal.aborted) {
        yield {
          type: 'done',
          stopReason: 'cancelled',
        };
        await this.persistConversationSession(session, '', 'cancelled');
        return;
      }

      const assistantText = `已通过 ${mcpTool.toolName} 获取：${this.stringifyToolResult(toolResult)}`;
      const messageEvent = {
        type: 'message_chunk',
        content: assistantText,
      } as const;
      await this.appendConversationEvent(session, messageEvent);
      yield messageEvent;

      yield {
        type: 'done',
        stopReason: 'end_turn',
      };
      await this.persistConversationSession(session, assistantText, 'end_turn');
    } catch (error) {
      const failedMessage = `MCP 工具调用失败：${this.getErrorMessage(error)}`;
      const failedEvent = {
        type: 'tool_call',
        call: {
          id: toolCallId,
          tool: mcpTool.toolName,
          args: toolArgs,
          status: 'failed',
          error: failedMessage,
        },
      } as const;
      await this.appendConversationEvent(session, failedEvent);
      yield failedEvent;

      const messageEvent = {
        type: 'message_chunk',
        content: failedMessage,
      } as const;
      await this.appendConversationEvent(session, messageEvent);
      yield messageEvent;

      yield {
        type: 'done',
        stopReason: 'end_turn',
      };
      await this.persistConversationSession(session, failedMessage, 'end_turn');
    }
  }

  private async waitForPermission(
    sessionId: string,
    toolCallId: string,
    signal: AbortSignal,
  ): Promise<'approve' | 'deny' | 'cancelled'> {
    if (signal.aborted) {
      return 'cancelled';
    }

    return await new Promise<'approve' | 'deny' | 'cancelled'>((resolve) => {
      const onAbort = () => {
        signal.removeEventListener('abort', onAbort);
        this.pendingPermissions.delete(sessionId);
        resolve('cancelled');
      };

      signal.addEventListener('abort', onAbort, { once: true });
      this.pendingPermissions.set(sessionId, {
        toolCallId,
        resolve: (action) => {
          signal.removeEventListener('abort', onAbort);
          this.pendingPermissions.delete(sessionId);
          resolve(action);
        },
      });
    });
  }

  private async resolveSessionMcpTool(
    sessionId: string,
    session: AgentSession,
  ): Promise<
    | {
        toolName: string;
        execute: (input: Record<string, unknown>) => Promise<unknown>;
      }
    | undefined
  > {
    const mcpServers = session.context.mcpServers;
    if (!mcpServers || Object.keys(mcpServers).length === 0) {
      return undefined;
    }

    const provider = this.sessionToolProviders.get(sessionId);
    if (!provider) {
      return undefined;
    }

    const tools = await provider();
    const firstToolEntry = Object.entries(tools)[0];
    if (!firstToolEntry) {
      return undefined;
    }

    const [toolName, toolDefinition] = firstToolEntry;
    const execute = this.readToolExecute(toolDefinition);
    if (!execute) {
      return undefined;
    }

    return {
      toolName,
      execute,
    };
  }

  private readToolExecute(
    toolDefinition: unknown,
  ): ((input: Record<string, unknown>) => Promise<unknown>) | undefined {
    if (typeof toolDefinition !== 'object' || toolDefinition === null) {
      return undefined;
    }

    const execute = Reflect.get(toolDefinition, 'execute');
    if (typeof execute !== 'function') {
      return undefined;
    }

    return async (input: Record<string, unknown>) => await execute(input);
  }

  private extractPromptText(content: ContentBlock[]): string {
    const textContent = content
      .filter((block): block is Extract<ContentBlock, { type: 'text' }> => {
        return block.type === 'text';
      })
      .map((block) => block.text.trim())
      .filter((block) => block.length > 0);

    if (textContent.length === 0) {
      return 'ACP MCP 测试查询';
    }

    return textContent.join(' ');
  }

  private stringifyToolResult(result: unknown): string {
    if (typeof result === 'string') {
      return result;
    }

    if (typeof result === 'object' && result !== null) {
      const content = Reflect.get(result, 'content');
      if (Array.isArray(content)) {
        const firstTextContent = content.find((entry) => {
          if (typeof entry !== 'object' || entry === null) {
            return false;
          }

          return (
            Reflect.get(entry, 'type') === 'text' &&
            typeof Reflect.get(entry, 'text') === 'string'
          );
        });

        if (firstTextContent) {
          return String(Reflect.get(firstTextContent, 'text'));
        }
      }

      return JSON.stringify(result);
    }

    return String(result);
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.length > 0) {
      return error.message;
    }

    return String(error);
  }

  private async appendConversationEvent(
    session: AgentSession,
    event: ReplayableAgentEvent,
  ): Promise<void> {
    if (session.mode !== 'conversation') {
      return;
    }

    await this.sessionPersistence.appendConversationReplayEntry(session, {
      kind: 'agent_event',
      event,
    });
  }

  private async persistConversationSession(
    session: AgentSession,
    assistantText: string,
    stopReason: StopReason,
  ): Promise<void> {
    if (session.mode !== 'conversation') {
      return;
    }

    if (assistantText.length > 0) {
      const lastBlock = session.context.history.at(-1);
      if (!(lastBlock?.type === 'text' && lastBlock.text === assistantText)) {
        session.context.history.push({
          type: 'text',
          text: assistantText,
        });
      }
    }

    if (session.status !== 'completed' && session.status !== 'error') {
      session.status = stopReason === 'cancelled' ? 'completed' : 'active';
    }
    session.updatedAt = new Date();
    await this.sessionPersistence.saveConversationSession(session);
  }
}

export const ACP_TEST_RUNTIME_PROVIDER = {
  provide: AGENT_RUNTIME,
  inject: [InProcessAgentAdapter, SessionPersistenceService],
  useFactory: (
    inProcessAgentAdapter: InProcessAgentAdapter,
    sessionPersistence: SessionPersistenceService,
  ): IAgentRuntime => {
    if (process.env.ACP_TEST_FAKE_RUNTIME === '1') {
      return new AcpTestRuntime(sessionPersistence);
    }

    return inProcessAgentAdapter;
  },
};
