import { z } from 'zod';

import { BaseRouterStrategy } from '../core/base-router-strategy';
import type { RoutingCandidate } from '../core/routing-candidate';
import type { RoutingContext } from '../core/routing-context';
import type {
  RoutingDecision,
  ModelScore,
  RoutingFallbackReason,
} from '../core/routing-decision';
import { DecryptionBoundaryService } from '../../api-key/decryption-boundary.service';
import { LlmService } from '../../llm/llm.service';
import { RulesRouter, routingRuleSchema } from './rules.strategy';

const LLM_TIMEOUT_MS = 3000;

const DEFAULT_SYSTEM_PROMPT = `你是一个模型路由器。根据用户的任务描述和候选模型信息，选择最适合的模型。
你必须返回严格的 JSON 格式: { "selectedModelId": "<候选模型的 id>", "reasoning": "<选择理由>" }
只返回 JSON，不要包含其他内容。`;

/** 发起 HTTP 请求之前的配置阶段失败（模型配置缺失、base URL 缺失、凭据解密失败等） */
class LlmRouterConfigError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = 'LlmRouterConfigError';
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
  });

  constructor(
    private readonly llmService: LlmService,
    private readonly decryptionBoundaryService: DecryptionBoundaryService,
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
    if (error instanceof DOMException && error.name === 'AbortError') {
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

  private async callRouterLlm(
    candidates: RoutingCandidate[],
    context: RoutingContext,
  ): Promise<string | null> {
    const { config, routerModel, baseUrl, apiKey } =
      await this.resolveRouterEndpoint(context).catch((error: unknown) => {
        throw new LlmRouterConfigError(error);
      });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

    try {
      const prompt = this.buildPrompt(
        candidates,
        context,
        config.promptTemplate,
      );

      const response = await fetch(
        `${baseUrl.replace(/\/+$/, '')}/v1/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: routerModel.modelId,
            messages: prompt,
            temperature: 0,
            max_tokens: 256,
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // 响应体不是 JSON 时按无效响应处理（parseResponse 返回 null）
      const data = await response.json().catch(() => null);
      const content = data?.choices?.[0]?.message?.content ?? '';

      return this.parseResponse(content);
    } finally {
      clearTimeout(timeout);
    }
  }

  /** 配置阶段：解析路由器模型配置、端点与凭据；任何失败都归为 llm_config_error */
  private async resolveRouterEndpoint(context: RoutingContext) {
    const config = this.configSchema.parse(context.strategyConfig ?? {});
    // routerModelId 是租户里的模型配置 id：端点与凭据都必须从该配置解析。
    const routerModel = await this.llmService.findById(
      config.routerModelId,
      context.tenantId,
    );
    const baseUrl =
      routerModel.provider.baseUrl ?? routerModel.provider.defaultBaseUrl;
    if (!baseUrl) {
      throw new Error(
        `路由器模型 ${config.routerModelId} 的提供商没有可用的 base URL`,
      );
    }

    const apiKey = await this.decryptionBoundaryService.decryptConfiguredApiKey(
      {
        apiKeyId: routerModel.provider.apiKeyId,
        organizationId: routerModel.provider.orgId,
        tenantId: context.tenantId,
        provider: routerModel.provider.slug,
      },
      'LlmAsRouterStrategy.callRouterLlm',
    );

    return { config, routerModel, baseUrl, apiKey };
  }

  private buildPrompt(
    candidates: RoutingCandidate[],
    context: RoutingContext,
    promptTemplate?: string,
  ): Array<{ role: string; content: string }> {
    const systemContent = promptTemplate
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

    return [
      { role: 'system', content: systemContent },
      {
        role: 'user',
        content: `候选模型:\n${candidateDescriptions}\n\n任务信息:\n${taskInfo}`,
      },
    ];
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
