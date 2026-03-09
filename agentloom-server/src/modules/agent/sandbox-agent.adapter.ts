import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { SandboxNotFoundException } from '../sandbox/sandbox.exceptions';
import { SandboxService } from '../sandbox/sandbox.service';

import type { IAgentRuntime } from './ports/agent-runtime.port';
import type {
  AgentEvent,
  AgentSession,
  ContentBlock,
  CreateSessionParams,
} from './types';

const SANDBOX_AGENT_PORT = 8080;
const SANDBOX_PROMPT_PATH = '/v1/prompt';
const CONTAINER_WORKSPACE = '/workspace/';
const REQUEST_TIMEOUT_MS = 300_000;

@Injectable()
export class SandboxAgentAdapter implements IAgentRuntime {
  private readonly logger = new Logger(SandboxAgentAdapter.name);
  private readonly sessions = new Map<string, AgentSession>();
  private readonly abortControllers = new Map<string, AbortController>();

  constructor(private readonly sandboxService: SandboxService) {}

  async createSession(params: CreateSessionParams): Promise<AgentSession> {
    const session: AgentSession = {
      id: randomUUID(),
      agentId: params.agentId,
      mode: params.mode,
      context: {
        history: [],
        cwd: CONTAINER_WORKSPACE,
        mcpServers: params.mcpServers,
        workflowState: params.context,
      },
      status: 'active',
      tenantId: params.tenantId,
      llmModelConfigId: params.llmModelConfigId,
      systemPrompt: params.systemPrompt,
      autonomyMode: params.autonomyMode,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.sessions.set(session.id, session);
    this.abortControllers.set(session.id, new AbortController());
    this.logger.debug(`创建 Sandbox 会话: ${session.id}`);
    return session;
  }

  async loadSession(sessionId: string): Promise<AgentSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SandboxNotFoundException(
        `Sandbox session not found: ${sessionId}`,
      );
    }
    return session;
  }

  async *prompt(
    sessionId: string,
    content: ContentBlock[],
  ): AsyncIterable<AgentEvent> {
    const session = await this.loadSession(sessionId);
    const abortController = this.abortControllers.get(sessionId);

    session.context.history.push(...content);
    session.updatedAt = new Date();

    const sandboxSession = await this.sandboxService.getSandboxSession(
      session.context.workflowState?.['executionId'] as string,
    );

    if (!sandboxSession?.containerId) {
      yield {
        type: 'done',
        stopReason: 'end_turn',
      };
      return;
    }

    const containerUrl = `http://${sandboxSession.containerId.slice(0, 12)}:${SANDBOX_AGENT_PORT}${SANDBOX_PROMPT_PATH}`;

    try {
      const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      const combinedSignal = abortController
        ? AbortSignal.any([abortController.signal, timeoutSignal])
        : timeoutSignal;

      const response = await fetch(containerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          content,
          cwd: CONTAINER_WORKSPACE,
        }),
        signal: combinedSignal,
      });

      if (!response.ok || !response.body) {
        yield { type: 'message_chunk', content: `Sandbox agent error: ${response.status}` };
        yield { type: 'done', stopReason: 'end_turn' };
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter((line) => line.trim());

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const eventData = JSON.parse(line.slice(6)) as AgentEvent;
            yield eventData;
          }
        }
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === 'AbortError'
      ) {
        yield { type: 'done', stopReason: 'cancelled' };
        return;
      }

      this.logger.error(`Sandbox prompt 失败: ${error}`);
      yield {
        type: 'message_chunk',
        content: `Sandbox execution error: ${error instanceof Error ? error.message : String(error)}`,
      };
      yield { type: 'done', stopReason: 'end_turn' };
    }
  }

  async cancel(sessionId: string): Promise<void> {
    const controller = this.abortControllers.get(sessionId);
    if (controller) {
      controller.abort();
    }

    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'completed';
      session.updatedAt = new Date();
    }

    this.logger.debug(`取消 Sandbox 会话: ${sessionId}`);
  }
}
