import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { eq } from 'drizzle-orm';
import { generateText, type LanguageModel } from 'ai';

import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import {
  agentConversations,
  agentMessages,
} from '../../database/schema/agent-conversations.schema';
import { LlmService } from '../llm/llm.service';
import { PiAiAdapter } from '../llm/pi-ai-adapter';
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
      // 如果没有 userId，从对话记录中获取
      const resolvedUserId = userId ?? (await this.resolveUserId(conversationId));

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
            m.content.length > 500 ? m.content.slice(0, 500) + '...' : m.content;
          return `${m.role === 'user' ? 'User' : 'Assistant'}: ${content}`;
        })
        .join('\n');

      const prompt = TITLE_GENERATION_PROMPT + conversationSnippet;

      // 解析用户偏好中的模型配置
      const model = await this.resolveModel(tenantId, resolvedUserId);
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
      messages.find((message) => message.role === 'user' && message.content.trim())
        ?.content ??
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
        ? `${chars
            .slice(0, FALLBACK_TITLE_SUMMARY_MAX_CHARS - 1)
            .join('')}…`
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
    tenantId: string,
    userId: string,
  ): Promise<LanguageModel | null> {
    try {
      // 先检查用户偏好
      const preference = userId
        ? await this.userPreferenceService.findByUser(userId, tenantId)
        : null;

      const modelConfig = preference?.titleModelConfigId
        ? await this.llmService.findById(
            preference.titleModelConfigId,
            tenantId,
          )
        : await this.llmService.findDefaultByType(tenantId, 'chat');

      if (!modelConfig) {
        return null;
      }

      return (await this.piAiAdapter.getModel(modelConfig)) as LanguageModel;
    } catch (error) {
      this.logger.warn(
        `Failed to resolve model for title generation: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }
}
