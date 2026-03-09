import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { streamText, type LanguageModel } from 'ai';
import { and, eq } from 'drizzle-orm';
import * as schema from '../../database/schema';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { PiAiAdapter } from '../llm/pi-ai-adapter';
import type { IAgentRuntime } from './ports/agent-runtime.port';
import type {
  AgentSession,
  CreateSessionParams,
  SessionContext,
} from './types/agent-session.types';
import type { AgentEvent, StopReason } from './types/agent-event.types';
import type { ContentBlock } from './types/content-block.types';

@Injectable()
export class InProcessAgentAdapter implements IAgentRuntime {
  private readonly logger = new Logger(InProcessAgentAdapter.name);
  private readonly sessions = new Map<string, AgentSession>();
  private readonly abortControllers = new Map<string, AbortController>();

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly piAiAdapter: PiAiAdapter,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  async createSession(params: CreateSessionParams): Promise<AgentSession> {
    const sessionId = randomUUID();
    const now = new Date();

    const context: SessionContext = {
      history: [],
      cwd: params.cwd,
      mcpServers: params.mcpServers,
      workflowState:
        params.mode === 'workflow' ? params.context : undefined,
    };

    const session: AgentSession = {
      id: sessionId,
      agentId: params.agentId,
      mode: params.mode,
      context,
      status: 'active',
      tenantId: params.tenantId,
      llmModelConfigId: params.llmModelConfigId,
      systemPrompt: params.systemPrompt,
      autonomyMode: params.autonomyMode,
      createdAt: now,
      updatedAt: now,
    };

    this.sessions.set(sessionId, session);
    this.logger.debug(
      `Session created: ${sessionId} for agent: ${params.agentId}`,
    );
    return session;
  }

  async loadSession(sessionId: string): Promise<AgentSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return session;
  }

  async *prompt(
    sessionId: string,
    content: ContentBlock[],
  ): AsyncGenerator<AgentEvent> {
    const session = await this.loadSession(sessionId);

    const abortController = new AbortController();
    this.abortControllers.set(sessionId, abortController);

    try {
      session.context.history.push(...content);
      session.updatedAt = new Date();

      if (session.status === 'completed' || abortController.signal.aborted) {
        yield { type: 'done', stopReason: 'cancelled' } as const;
        return;
      }

      const modelConfig = await this.resolveModelConfig(session);
      const model = await this.piAiAdapter.getModel(modelConfig);
      const promptText = this.serializeContentBlocks(session.context.history);
      const result = streamText({
        model: model as LanguageModel,
        system: session.systemPrompt,
        prompt: promptText,
        abortSignal: abortController.signal,
      });

      let emittedDone = false;
      let accumulatedText = '';

      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          if (part.text) {
            accumulatedText += part.text;
            yield { type: 'message_chunk', content: part.text } as const;
          }
          continue;
        }

        if (part.type === 'abort' || abortController.signal.aborted) {
          emittedDone = true;
          yield { type: 'done', stopReason: 'cancelled' } as const;
          return;
        }

        if (part.type === 'error') {
          throw part.error instanceof Error
            ? part.error
            : new Error('LLM 流式输出失败');
        }

        if (part.type === 'finish') {
          emittedDone = true;
          if (session.autonomyMode === 'LLM_SUGGEST') {
            yield {
              type: 'decision',
              suggestedContent: accumulatedText,
              confidence: 0.5,
            } as const;
            yield {
              type: 'done',
              stopReason: 'intervention_required',
            } as const;
            return;
          }

          yield {
            type: 'done',
            stopReason: this.mapFinishReason(part.finishReason),
          } as const;
          return;
        }
      }

      if (!emittedDone) {
        yield { type: 'done', stopReason: 'end_turn' } as const;
      }
      session.status = 'active';
      session.updatedAt = new Date();
    } catch (error) {
      session.status = 'error';
      session.updatedAt = new Date();
      throw error;
    } finally {
      this.abortControllers.delete(sessionId);
    }
  }

  async cancel(sessionId: string): Promise<void> {
    const controller = this.abortControllers.get(sessionId);
    if (controller) {
      controller.abort();
      this.logger.debug(`Session cancelled: ${sessionId}`);
    }

    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'completed';
      session.updatedAt = new Date();
    }
  }

  private async resolveModelConfig(
    session: AgentSession,
  ): Promise<schema.LlmModelConfig> {
    if (!session.tenantId) {
      throw new Error(`Session ${session.id} 缺少 tenantId`);
    }

    const tenantId = session.tenantId;
    const llmModelConfigId = session.llmModelConfigId;

    return runInTenantTransaction(this.db, tenantId, async () => {
      if (llmModelConfigId) {
        const [modelConfig] = await this.tenantDb
          .select()
          .from(schema.llmModelConfigs)
          .where(
            and(
              eq(schema.llmModelConfigs.id, llmModelConfigId),
              eq(schema.llmModelConfigs.tenantId, tenantId),
            ),
          );

        if (!modelConfig) {
          throw new Error(`LLM 模型配置不存在: ${llmModelConfigId}`);
        }

        return modelConfig;
      }

      const [modelConfig] = await this.tenantDb
        .select()
        .from(schema.llmModelConfigs)
        .where(
          and(
            eq(schema.llmModelConfigs.tenantId, tenantId),
            eq(schema.llmModelConfigs.isDefault, true),
          ),
        );

      if (!modelConfig) {
        throw new Error(`租户 ${tenantId} 未配置默认 LLM 模型`);
      }

      session.llmModelConfigId = modelConfig.id;
      return modelConfig;
    });
  }

  private serializeContentBlocks(blocks: ContentBlock[]): string {
    return blocks
      .map((block) => {
        switch (block.type) {
          case 'text':
            return block.text;
          case 'image':
            return `[image:${block.mimeType}]`;
          case 'audio':
            return `[audio:${block.mimeType}]`;
          case 'resource':
            return block.text ?? block.blob ?? `[resource:${block.uri}]`;
          case 'resource_link':
            return block.title ?? `[resource_link:${block.uri}]`;
          default:
            return '';
        }
      })
      .join('\n\n');
  }

  private mapFinishReason(finishReason: string | undefined): StopReason {
    switch (finishReason) {
      case 'length':
        return 'max_tokens';
      case 'tool-calls':
        return 'tool_use';
      default:
        return 'end_turn';
    }
  }
}
