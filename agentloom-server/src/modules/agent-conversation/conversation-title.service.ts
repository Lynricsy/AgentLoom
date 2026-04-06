import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, eq } from 'drizzle-orm';
import { generateText, type LanguageModel } from 'ai';

import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import {
  agentConversations,
  agentMessages,
} from '../../database/schema/agent-conversations.schema';
import {
  agentDefinitions,
  agentVersions,
} from '../../database/schema/agent-definitions.schema';
import type { AgentRuntimeConfig } from '../agent-definition/agent-runtime-config.interface';
import { AgentDefinitionService } from '../agent-definition/agent-definition.service';
import { LlmService } from '../llm/llm.service';
import { PiAiAdapter, type ResolvedModelConfig } from '../llm/pi-ai-adapter';
import { UserPreferenceService } from '../user-preference/user-preference.service';

const TITLE_GENERATION_PROMPT = `You are a conversation title generator. Based on the conversation below, generate a concise title.

Rules:
- Format: <single emoji> <short summary in the conversation's language>
- The summary part must be under 15 characters
- Choose an emoji that best represents the topic
- Respond with ONLY the title, nothing else
- Examples: "☀️ 今日天气", "🐛 修复登录Bug", "📊 销售数据分析"

Conversation:
`;

const FALLBACK_TITLE_PREFIX = '💬 ';
const FALLBACK_TITLE_SUMMARY_MAX_CHARS = 14;

@Injectable()
export class ConversationTitleService {
  private readonly logger = new Logger(ConversationTitleService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly llmService: LlmService,
    private readonly piAiAdapter: PiAiAdapter,
    private readonly userPreferenceService: UserPreferenceService,
    private readonly agentDefinitionService: AgentDefinitionService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  /**
   * 生成对话标题。userId 可选 — 未提供时从 conversation.createdBy 读取。
   */
  async generateTitle(
    conversationId: string,
    tenantId: string,
    userId?: string,
  ): Promise<string | null> {
    try {
      return await runInTenantTransaction(this.db, tenantId, async () => {
        // 如果没有 userId，从对话记录中获取
        const resolvedUserId =
          userId ?? (await this.resolveUserId(conversationId));

        // 获取对话的前几条消息用于生成标题
        const messages = await this.tenantDb
          .select({
            role: agentMessages.role,
            content: agentMessages.content,
          })
          .from(agentMessages)
          .where(eq(agentMessages.conversationId, conversationId))
          .orderBy(agentMessages.createdAt)
          .limit(4);

        if (messages.length === 0) {
          return null;
        }

        const fallbackTitle = this.buildFallbackTitle(messages);

        // 构造 prompt
        const conversationSnippet = messages
          .map((m) => {
            const content =
              m.content.length > 500
                ? m.content.slice(0, 500) + '...'
                : m.content;
            return `${m.role === 'user' ? 'User' : 'Assistant'}: ${content}`;
          })
          .join('\n');

        const prompt = TITLE_GENERATION_PROMPT + conversationSnippet;

        // 解析用户偏好中的模型配置
        const model = await this.resolveModel(
          conversationId,
          tenantId,
          resolvedUserId,
        );
        if (!model) {
          this.logger.warn(
            `No model available for title generation (tenant=${tenantId})`,
          );
          if (!fallbackTitle) {
            return null;
          }

          await this.persistTitle(conversationId, tenantId, fallbackTitle);
          return fallbackTitle;
        }

        let title = fallbackTitle;

        try {
          const result = await generateText({ model, prompt });
          const generatedTitle = result.text.trim().slice(0, 255);

          if (generatedTitle.length > 0) {
            title = generatedTitle;
          }
        } catch (error) {
          this.logger.warn(
            `Failed to generate title with LLM for conversation ${conversationId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }

        if (!title) {
          return null;
        }

        await this.persistTitle(conversationId, tenantId, title);

        return title;
      });
    } catch (error) {
      this.logger.warn(
        `Failed to generate title for conversation ${conversationId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private buildFallbackTitle(
    messages: Array<{ role: string; content: string }>,
  ): string | null {
    const primaryContent =
      messages.find(
        (message) => message.role === 'user' && message.content.trim(),
      )?.content ??
      messages.find((message) => message.content.trim())?.content ??
      '';
    const normalized = primaryContent
      .replace(/\s+/g, ' ')
      .replace(/^[#>*\-\s]+/, '')
      .trim();

    if (!normalized) {
      return null;
    }

    const chars = Array.from(normalized);
    const summary =
      chars.length > FALLBACK_TITLE_SUMMARY_MAX_CHARS
        ? `${chars.slice(0, FALLBACK_TITLE_SUMMARY_MAX_CHARS - 1).join('')}…`
        : chars.join('');

    return `${FALLBACK_TITLE_PREFIX}${summary}`.slice(0, 255);
  }

  private async persistTitle(
    conversationId: string,
    tenantId: string,
    title: string,
  ): Promise<void> {
    await this.tenantDb
      .update(agentConversations)
      .set({ title, updatedAt: new Date() })
      .where(eq(agentConversations.id, conversationId));

    this.eventEmitter.emit('conversation.title.updated', {
      conversationId,
      tenantId,
      title,
    });

    this.logger.log(
      `Generated title for conversation ${conversationId}: ${title}`,
    );
  }

  private async resolveUserId(conversationId: string): Promise<string> {
    const [conv] = await this.tenantDb
      .select({ createdBy: agentConversations.createdBy })
      .from(agentConversations)
      .where(eq(agentConversations.id, conversationId))
      .limit(1);

    return conv?.createdBy ?? '';
  }

  private async resolveModel(
    conversationId: string,
    tenantId: string,
    userId: string,
  ): Promise<LanguageModel | null> {
    try {
      const attemptedModelConfigIds = new Set<string>();
      const preference = userId
        ? await this.userPreferenceService.findByUser(userId, tenantId)
        : null;

      const preferredModel = await this.tryResolveModelByConfigId({
        modelConfigId: preference?.titleModelConfigId,
        tenantId,
        attemptedModelConfigIds,
        source: 'title preference',
      });
      if (preferredModel) {
        return preferredModel;
      }

      const conversationModelConfigId =
        await this.resolveConversationModelConfigId(conversationId);
      const conversationModel = await this.tryResolveModelByConfigId({
        modelConfigId: conversationModelConfigId,
        tenantId,
        attemptedModelConfigIds,
        source: 'conversation runtime',
      });
      if (conversationModel) {
        return conversationModel;
      }

      const defaultModelConfig = await this.llmService.findDefaultByType(
        tenantId,
        'chat',
      );
      if (
        !defaultModelConfig ||
        attemptedModelConfigIds.has(defaultModelConfig.id)
      ) {
        return null;
      }

      attemptedModelConfigIds.add(defaultModelConfig.id);
      return this.instantiateLanguageModel(defaultModelConfig, 'default');
    } catch (error) {
      this.logger.warn(
        `Failed to resolve model for title generation: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private async tryResolveModelByConfigId(params: {
    modelConfigId: string | null | undefined;
    tenantId: string;
    attemptedModelConfigIds: Set<string>;
    source: string;
  }): Promise<LanguageModel | null> {
    const modelConfigId = this.normalizeOptionalString(params.modelConfigId);
    if (!modelConfigId || params.attemptedModelConfigIds.has(modelConfigId)) {
      return null;
    }

    params.attemptedModelConfigIds.add(modelConfigId);

    try {
      const modelConfig = await this.llmService.findById(
        modelConfigId,
        params.tenantId,
      );
      return this.instantiateLanguageModel(modelConfig, params.source);
    } catch (error) {
      this.logger.warn(
        `Failed to resolve ${params.source} model ${modelConfigId} for title generation: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private async instantiateLanguageModel(
    modelConfig: ResolvedModelConfig,
    source: string,
  ): Promise<LanguageModel | null> {
    try {
      return (await this.piAiAdapter.getModel(modelConfig)) as LanguageModel;
    } catch (error) {
      this.logger.warn(
        `Failed to instantiate ${source} model ${modelConfig.id} for title generation: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private async resolveConversationModelConfigId(
    conversationId: string,
  ): Promise<string | null> {
    const [conversation] = await this.tenantDb
      .select({ agentDefinitionId: agentConversations.agentDefinitionId })
      .from(agentConversations)
      .where(eq(agentConversations.id, conversationId))
      .limit(1);

    if (!conversation) {
      return null;
    }

    const [definition] = await this.tenantDb
      .select({
        id: agentDefinitions.id,
        publishedVersionId: agentDefinitions.publishedVersionId,
        nodes: agentDefinitions.nodes,
        edges: agentDefinitions.edges,
        runtimeMode: agentDefinitions.runtimeMode,
      })
      .from(agentDefinitions)
      .where(eq(agentDefinitions.id, conversation.agentDefinitionId))
      .limit(1);

    if (!definition) {
      return null;
    }

    let nodes = definition.nodes ?? [];
    let edges = definition.edges ?? [];
    let runtimeMode = definition.runtimeMode;

    if (definition.publishedVersionId) {
      const [version] = await this.tenantDb
        .select({ snapshot: agentVersions.snapshot })
        .from(agentVersions)
        .where(
          and(
            eq(agentVersions.id, definition.publishedVersionId),
            eq(agentVersions.agentDefinitionId, definition.id),
          ),
        )
        .limit(1);

      if (version?.snapshot) {
        nodes = version.snapshot.nodes ?? nodes;
        edges = version.snapshot.edges ?? edges;
        runtimeMode = version.snapshot.runtimeMode ?? runtimeMode;
      }
    }

    const runtimeConfig =
      this.agentDefinitionService.buildRuntimeConfigFromNodes(
        nodes,
        edges,
        definition.id,
        runtimeMode,
      );

    return this.pickRuntimeModelConfigId(runtimeConfig);
  }

  private pickRuntimeModelConfigId(
    runtimeConfig: AgentRuntimeConfig,
  ): string | null {
    const directModelId = this.normalizeOptionalString(
      runtimeConfig.modelConfig?.modelId,
    );
    if (directModelId) {
      return directModelId;
    }

    const fallbackModelId = this.normalizeOptionalString(
      runtimeConfig.routingConfig?.fallbackModelId,
    );
    if (fallbackModelId) {
      return fallbackModelId;
    }

    return (
      this.extractStringArray(
        runtimeConfig.routingConfig?.candidateModelIds,
      ).at(0) ?? null
    );
  }

  private normalizeOptionalString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : null;
  }

  private extractStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => this.normalizeOptionalString(item))
      .filter((item): item is string => item !== null);
  }
}
