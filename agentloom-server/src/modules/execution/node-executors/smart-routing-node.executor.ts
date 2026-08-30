/**
 * 智能路由节点执行器：拥有候选模型加载、健康过滤、路由决策与持久化实现。
 */
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../../../database/database.module';
import { getTenantDb } from '../../../common/providers/tenant-aware-db.provider';
import * as schema from '../../../database/schema';
import type { ExecutionStep } from '../../../database/schema';
import { AgentExecutionException } from '../execution.exceptions';
import { SmartRoutingService } from '../../smart-routing/smart-routing.service';
import { RouterRegistry } from '../../smart-routing/core/router-registry';
import type { RoutingCandidate } from '../../smart-routing/core/routing-candidate';
import type { RoutingContext as SmartRoutingContext } from '../../smart-routing/core/routing-context';
import { HealthMonitorService } from '../../smart-routing/circuit-breaker/health-monitor.service';
import { EmbeddingIntegrationService } from '../../smart-routing/embedding/embedding.service';
import { getModelRoutingMeta } from '../../llm/llm-provider-catalog';
import type { NodeSchedulerService } from '../node-scheduler.service';
import { NodeExecutionFailurePolicy } from '../node-execution-failure-policy';
import { StepStateMachineService } from '../step-state-machine.service';
import { getRuntimeNodeData, isRecord, readNumber } from '../node-value.util';
import {
  collectModelConfigIds,
  estimateTokenCount,
  extractSmartRoutingQueryText,
  extractSmartRoutingTaskCategory,
  mapRoutingDecisionScores,
  normalizeSmartRoutingStrategyName,
  resolveSmartRoutingStrategyConfig,
  resolveSmartRoutingStrategyValue,
} from '../smart-routing-input.util';
import type {
  NodeExecutionContext,
  NodeExecutor,
} from './node-executor.interface';

@Injectable()
export class SmartRoutingNodeExecutor implements NodeExecutor {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly smartRoutingService: SmartRoutingService,
    private readonly routerRegistry: RouterRegistry,
    private readonly healthMonitorService: HealthMonitorService,
    private readonly embeddingService: EmbeddingIntegrationService,
    private readonly stepStateMachine: StepStateMachineService,
    private readonly failurePolicy: NodeExecutionFailurePolicy,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  async execute(context: NodeExecutionContext): Promise<void> {
    await this.executeSmartRouting(
      context.step,
      context.input,
      context.tenantId,
      context.executionId,
      context.runtime,
    );
  }

  async executeSmartRouting(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
    runtime: NodeSchedulerService,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const nodeData = getRuntimeNodeData(step.nodeData ?? {});
      const rawStrategy = resolveSmartRoutingStrategyValue(nodeData);
      const strategyName = normalizeSmartRoutingStrategyName(rawStrategy);
      const strategyConfig = resolveSmartRoutingStrategyConfig(nodeData);
      const router = this.routerRegistry.get(strategyName);

      const modelConfigIds = collectModelConfigIds(nodeData, input);
      const tokenThreshold =
        typeof nodeData.tokenThreshold === 'number' &&
        nodeData.tokenThreshold > 0
          ? nodeData.tokenThreshold
          : 4096;
      const queryText = extractSmartRoutingQueryText(nodeData, input);
      const taskCategory = extractSmartRoutingTaskCategory(nodeData, input);
      const inputTokenCount = estimateTokenCount(input);
      const historicalMetrics =
        strategyName === 'historical_best'
          ? await this.smartRoutingService.getHistoricalMetrics(
              tenantId,
              step.nodeId,
            )
          : undefined;

      const context: SmartRoutingContext = {
        inputTokenCount,
        tenantId,
        ...(queryText ? { queryText } : {}),
        ...(taskCategory ? { taskCategory } : {}),
        ...(strategyConfig ? { strategyConfig } : {}),
        ...(historicalMetrics && Object.keys(historicalMetrics).length > 0
          ? { historicalMetrics }
          : {}),
      };

      if (router.requiresEmbedding) {
        const embeddingSource = queryText ?? JSON.stringify(input ?? {});
        const queryEmbedding = await this.embeddingService.generateEmbedding(
          embeddingSource,
          tenantId,
        );

        if (queryEmbedding) {
          context.queryEmbedding = queryEmbedding;
        }
      }

      const candidates = await this.loadRoutingCandidates(
        modelConfigIds,
        tenantId,
      );
      const healthyCandidates =
        await this.healthMonitorService.filterHealthyCandidates(
          tenantId,
          candidates,
        );

      const decision = await router.route(healthyCandidates, context);

      if (!decision.selectedModelId) {
        throw new AgentExecutionException(
          `Smart routing node ${step.nodeId} 未能选择模型`,
        );
      }

      const evaluatedModels = mapRoutingDecisionScores(decision);
      const routingDecisionId = await this.smartRoutingService.recordDecision(
        step.id,
        tenantId,
        step.nodeId,
        {
          selectedModelId: decision.selectedModelId,
          strategy: strategyName,
          reasoning: decision.reasoning,
          evaluatedModels,
          latencyMs: decision.latencyMs,
          routerType: decision.routerType,
        },
      );

      const candidateModelIds = evaluatedModels.map((model) => model.modelId);
      const currentModelIndex = Math.max(
        candidateModelIds.indexOf(decision.selectedModelId),
        0,
      );

      const result = {
        selectedModelId: decision.selectedModelId,
        llmModelConfigId: decision.selectedModelId,
        'model-out': {
          selectedModelId: decision.selectedModelId,
          llmModelConfigId: decision.selectedModelId,
        },
        'exec-out': {
          triggered: true,
          selectedModelId: decision.selectedModelId,
        },
        strategy: rawStrategy,
        reasoning: decision.reasoning,
        evaluatedModels,
        latencyMs: decision.latencyMs,
        routerType: decision.routerType,
        routingDecisionId,
        routingStepId: step.id,
        routingNodeId: step.nodeId,
        candidateModelIds,
        currentModelIndex,
        inputTokenCount,
        tokenThreshold,
        ...(queryText ? { queryText } : {}),
        ...(taskCategory ? { taskCategory } : {}),
      };

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        { result },
      );

      await runtime.onNodeCompleted(executionId, step.id, tenantId);
    } catch (error) {
      await this.failurePolicy.handle(error, {
        tenantId,
        executionId,
        step,
        onNodeFailed: runtime.onNodeFailed.bind(runtime),
      });
    }
  }

  private async loadRoutingCandidates(
    modelConfigIds: string[],
    tenantId: string,
  ): Promise<RoutingCandidate[]> {
    if (modelConfigIds.length === 0) {
      return [];
    }

    const modelConfigs = await this.tenantDb
      .select({
        id: schema.llmModelConfigs.id,
        name: schema.llmModelConfigs.name,
        providerSlug: schema.llmProviders.slug,
        modelId: schema.llmModelConfigs.modelId,
      })
      .from(schema.llmModelConfigs)
      .innerJoin(
        schema.llmProviders,
        eq(schema.llmModelConfigs.providerId, schema.llmProviders.id),
      )
      .where(
        and(
          eq(schema.llmModelConfigs.tenantId, tenantId),
          inArray(schema.llmModelConfigs.id, modelConfigIds),
        ),
      );

    const routingMetadataRows = await this.tenantDb
      .select({
        modelConfigId: schema.routerModels.modelId,
        providerName: schema.routerModels.providerName,
        routingMeta: schema.routerModels.routingMeta,
        eloRating: schema.routerModels.eloRating,
      })
      .from(schema.routerModels)
      .where(
        and(
          eq(schema.routerModels.tenantId, tenantId),
          eq(schema.routerModels.isActive, true),
          inArray(schema.routerModels.modelId, modelConfigIds),
        ),
      );

    const configsById = new Map(
      modelConfigs.map((config) => [config.id, config]),
    );
    const routingMetadataById = new Map(
      routingMetadataRows.map((row) => [row.modelConfigId, row]),
    );

    const candidates: RoutingCandidate[] = [];

    for (const modelConfigId of modelConfigIds) {
      const modelConfig = configsById.get(modelConfigId);
      if (!modelConfig) {
        continue;
      }

      const routingMetadata = routingMetadataById.get(modelConfigId);
      const fallbackMeta = getModelRoutingMeta(
        modelConfig.providerSlug,
        modelConfig.modelId,
      );
      const rawRoutingMeta = isRecord(routingMetadata?.routingMeta)
        ? routingMetadata.routingMeta
        : undefined;
      const rawCosts = isRecord(rawRoutingMeta?.costs)
        ? rawRoutingMeta.costs
        : undefined;

      candidates.push({
        id: modelConfig.id,
        modelConfigId: modelConfig.id,
        name: modelConfig.name,
        provider: routingMetadata?.providerName ?? modelConfig.providerSlug,
        routingMeta: {
          contextWindow: readNumber(
            rawRoutingMeta?.contextWindow,
            fallbackMeta.contextWindow,
          ),
          costs: {
            input: readNumber(
              rawCosts?.inputPer1kTokens,
              fallbackMeta.costPer1kInputTokens,
            ),
            output: readNumber(
              rawCosts?.outputPer1kTokens,
              fallbackMeta.costPer1kOutputTokens,
            ),
          },
          qualityRank: readNumber(
            rawRoutingMeta?.qualityRank,
            fallbackMeta.qualityRank,
          ),
          avgLatencyMs: readNumber(
            rawRoutingMeta?.avgLatencyMs,
            fallbackMeta.avgLatencyMs,
          ),
          maxInputTokens: readNumber(
            rawRoutingMeta?.maxInputTokens,
            readNumber(
              rawRoutingMeta?.contextWindow,
              fallbackMeta.contextWindow,
            ),
          ),
          eloRating: readNumber(routingMetadata?.eloRating, 1200),
        },
        healthStatus: 'healthy',
      });
    }

    return candidates;
  }
}
