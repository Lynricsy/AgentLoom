import { z } from 'zod';

import { BaseRouterStrategy } from '../core/base-router-strategy';
import type { RoutingCandidate } from '../core/routing-candidate';
import type { RoutingContext } from '../core/routing-context';
import type { RoutingDecision, ModelScore } from '../core/routing-decision';
import { DecryptionBoundaryService } from '../../api-key/decryption-boundary.service';
import { LlmService } from '../../llm/llm.service';

const LLM_TIMEOUT_MS = 3000;

const DEFAULT_SYSTEM_PROMPT = `你是一个模型路由器。根据用户的任务描述和候选模型信息，选择最适合的模型。
你必须返回严格的 JSON 格式: { "selectedModelId": "<候选模型的 id>", "reasoning": "<选择理由>" }
只返回 JSON，不要包含其他内容。`;

export class LlmAsRouterStrategy extends BaseRouterStrategy {
  readonly name = 'llm_as_router';
  readonly category = 'simple' as const;
  readonly requiresEmbedding = false;
  readonly configSchema = z.object({
    routerModelId: z.string(),
    promptTemplate: z.string().optional(),
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
    try {
      const selectedId = await this.callRouterLlm(candidates, context);

      if (selectedId && candidates.some((c) => c.id === selectedId)) {
        return this.buildDecision(candidates, selectedId, context);
      }

      return this.fallbackToRandom(
        candidates,
        'LLM 返回了无效的模型 ID，回退到随机选择',
      );
    } catch (error) {
      const isTimeout =
        error instanceof DOMException && error.name === 'AbortError';
      const reason = isTimeout
        ? 'LLM 路由器调用超时，回退到随机选择'
        : `LLM 路由器调用失败，回退到随机选择: ${String(error)}`;
      return this.fallbackToRandom(candidates, reason);
    }
  }

  private async callRouterLlm(
    candidates: RoutingCandidate[],
    context: RoutingContext,
  ): Promise<string | null> {
    const config = this.configSchema.parse(context.strategyConfig ?? {});
    // routerModelId 是租户里的模型配置 id：端点与凭据都必须从该配置解析。
    // 此前固定打 OpenAI chat completions 且完全不带凭据，这条策略实际从未可用过。
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

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content ?? '';

      return this.parseResponse(content);
    } finally {
      clearTimeout(timeout);
    }
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

  private fallbackToRandom(
    candidates: RoutingCandidate[],
    reason: string,
  ): RoutingDecision {
    const randomIndex = Math.floor(Math.random() * candidates.length);
    const selected = candidates[randomIndex];
    const uniformScore = Math.round(100 / candidates.length);

    const scores: ModelScore[] = candidates.map((c) => ({
      modelId: c.id,
      modelName: c.name,
      provider: c.provider,
      score: uniformScore,
      reasoning: '随机回退',
    }));

    return {
      selectedModelId: selected.id,
      scores,
      reasoning: reason,
      routerType: this.name,
      latencyMs: 0,
    };
  }
}
