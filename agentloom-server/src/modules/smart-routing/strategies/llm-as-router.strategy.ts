import { generateText, type LanguageModel } from 'ai';
import { z } from 'zod';

import { BaseRouterStrategy } from '../core/base-router-strategy';
import type { RoutingCandidate } from '../core/routing-candidate';
import type { RoutingContext } from '../core/routing-context';
import type {
  RoutingDecision,
  ModelScore,
  RoutingFallbackReason,
} from '../core/routing-decision';
import { LlmTimeoutException } from '../../llm/llm.exceptions';
import { LlmService } from '../../llm/llm.service';
import { PiAiAdapter } from '../../llm/pi-ai-adapter';
import { RulesRouter, routingRuleSchema } from './rules.strategy';

/** 路由模型请求超时默认值：常见对话模型一次短回复实测 4~6 秒 */
const DEFAULT_ROUTER_TIMEOUT_MS = 10_000;
const ROUTER_MAX_OUTPUT_TOKENS = 256;

const DEFAULT_SYSTEM_PROMPT = `你是一个模型路由器。根据用户的任务描述和候选模型信息，选择最适合的模型。
你必须返回严格的 JSON 格式: { "selectedModelId": "<候选模型的 id>", "reasoning": "<选择理由>" }
只返回 JSON，不要包含其他内容。`;

/** 发起请求之前的配置阶段失败（模型配置缺失、协议不支持、凭据解密失败等） */
class LlmRouterConfigError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = 'LlmRouterConfigError';
  }
}

/** 路由模型请求超过 timeoutMs 被中止 */
class LlmRouterTimeoutError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = 'LlmRouterTimeoutError';
  }
}

export class LlmAsRouterStrategy extends BaseRouterStrategy {
  readonly name = 'llm_as_router';
  readonly category = 'simple' as const;
  readonly requiresEmbedding = false;
  readonly configSchema = z.object({
    routerModelId: z.string(),
    promptTemplate: z.string().optional(),
    fallbackModelId: z.string().optional(),
    fallbackRules: z.array(routingRuleSchema).optional(),
    timeoutMs: z
      .number()
      .int()
      .min(1000)
      .max(60_000)
      .default(DEFAULT_ROUTER_TIMEOUT_MS),
  });

  constructor(
    private readonly llmService: LlmService,
    private readonly piAiAdapter: PiAiAdapter,
  ) {
    super();
  }

  async routeSingle(
    candidates: RoutingCandidate[],
    context: RoutingContext,
  ): Promise<RoutingDecision> {
    let selectedId: string | null;
    try {
      selectedId = await this.callRouterLlm(candidates, context);
    } catch (error) {
      return this.fallbackDeterministic(
        candidates,
        context,
        this.classifyFailure(error),
      );
    }

    if (selectedId && candidates.some((c) => c.id === selectedId)) {
      return this.buildDecision(candidates, selectedId, context);
    }

    return this.fallbackDeterministic(
      candidates,
      context,
      'llm_invalid_response',
    );
  }

  private classifyFailure(error: unknown): RoutingFallbackReason {
    if (
      error instanceof LlmRouterTimeoutError ||
      error instanceof LlmTimeoutException
    ) {
      return 'llm_timeout';
    }
    if (error instanceof LlmRouterConfigError) {
      return 'llm_config_error';
    }
    // 非 2xx 响应与网络层失败
    return 'llm_http_error';
  }

  /**
   * 确定性回退：已配置回退模型 → 规则路由（fallbackRules，无匹配取候选首位）。
   * 回退配置本身不合法时按未配置处理，保证回退路径不再抛错。
   */
  private async fallbackDeterministic(
    candidates: RoutingCandidate[],
    context: RoutingContext,
    reason: RoutingFallbackReason,
  ): Promise<RoutingDecision> {
    const parsed = this.configSchema
      .pick({ fallbackModelId: true, fallbackRules: true })
      .safeParse(context.strategyConfig ?? {});
    const config = parsed.success ? parsed.data : {};

    const fallbackModelId = config.fallbackModelId;
    const fallbackModel = fallbackModelId
      ? candidates.find((c) => c.id === fallbackModelId)
      : undefined;
    if (fallbackModel) {
      return {
        ...this.buildDecision(candidates, fallbackModel.id, context),
        reasoning: `LLM 路由回退（${reason}）：使用已配置回退模型 ${fallbackModel.name}`,
        fallback: { reason, source: 'configured_model' },
      };
    }

    const rules = new RulesRouter();
    const decision = await rules.routeSingle(candidates, {
      ...context,
      strategyConfig: { rules: config.fallbackRules ?? [] },
    });
    return {
      ...decision,
      routerType: this.name,
      reasoning: `LLM 路由回退（${reason}）：${decision.reasoning}`,
      fallback: { reason, source: 'rules' },
    };
  }

  /**
   * 经 PiAiAdapter 调用路由模型：请求格式按提供商 apiProtocol（openai_chat / openai_responses /
   * anthropic …）选择，base URL 按 llm-base-url 规则规范化，与 Agent 推理走同一套适配层。
   */
  private async callRouterLlm(
    candidates: RoutingCandidate[],
    context: RoutingContext,
  ): Promise<string | null> {
    const { config, model } = await this.resolveRouterModel(context).catch(
      (error: unknown) => {
        throw new LlmRouterConfigError(error);
      },
    );

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const { system, prompt } = this.buildPrompt(
        candidates,
        context,
        config.promptTemplate,
      );
      const result = await generateText({
        model,
        system,
        prompt,
        temperature: 0,
        maxOutputTokens: ROUTER_MAX_OUTPUT_TOKENS,
        // 超时预算内失败直接走确定性回退，不在 SDK 层重试
        maxRetries: 0,
        abortSignal: controller.signal,
      });

      return this.parseResponse(result.text);
    } catch (error) {
      if (controller.signal.aborted) {
        throw new LlmRouterTimeoutError(error);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  /** 配置阶段：解析路由器模型配置并构造语言模型；任何失败都归为 llm_config_error */
  private async resolveRouterModel(context: RoutingContext) {
    const config = this.configSchema.parse(context.strategyConfig ?? {});
    // routerModelId 是租户里的模型配置 id：端点、协议与凭据都必须从该配置解析。
    const routerModel = await this.llmService.findById(
      config.routerModelId,
      context.tenantId,
    );
    const model = (await this.piAiAdapter.getModel(
      routerModel,
    )) as LanguageModel;

    return { config, model };
  }

  private buildPrompt(
    candidates: RoutingCandidate[],
    context: RoutingContext,
    promptTemplate?: string,
  ): { system: string; prompt: string } {
    const system = promptTemplate
      ? `${promptTemplate}\n\n${DEFAULT_SYSTEM_PROMPT}`
      : DEFAULT_SYSTEM_PROMPT;

    const candidateDescriptions = candidates
      .map(
        (c) =>
          `- id: ${c.id}, name: ${c.name}, provider: ${c.provider}, ` +
          `quality: ${c.routingMeta.qualityRank}, latency: ${c.routingMeta.avgLatencyMs}ms, ` +
          `cost(input): ${c.routingMeta.costs.input}, cost(output): ${c.routingMeta.costs.output}`,
      )
      .join('\n');

    const taskInfo = [
      `输入 token 数: ${context.inputTokenCount}`,
      context.taskCategory && `任务类别: ${context.taskCategory}`,
      context.queryText && `查询文本: ${context.queryText}`,
    ]
      .filter(Boolean)
      .join('\n');

    return {
      system,
      prompt: `候选模型:\n${candidateDescriptions}\n\n任务信息:\n${taskInfo}`,
    };
  }

  private parseResponse(content: string): string | null {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.selectedModelId ?? null;
    } catch {
      return null;
    }
  }

  private buildDecision(
    candidates: RoutingCandidate[],
    selectedId: string,
    context: RoutingContext,
  ): RoutingDecision {
    const selected = candidates.find((c) => c.id === selectedId)!;
    const scores: ModelScore[] = candidates.map((c) => ({
      modelId: c.id,
      modelName: c.name,
      provider: c.provider,
      score: c.id === selectedId ? 100 : 0,
      reasoning: c.id === selectedId ? `LLM 路由器选择 ${c.name}` : '',
    }));

    return {
      selectedModelId: selectedId,
      scores,
      reasoning: `LLM 路由器选择了 ${selected.name} (${selected.provider}) 用于任务 ${context.taskCategory ?? 'unknown'}`,
      routerType: this.name,
      latencyMs: 0,
    };
  }
}
