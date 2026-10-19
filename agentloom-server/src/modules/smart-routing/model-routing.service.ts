/**
 * 模型路由的共享入口：
 * - routeAgentRuntimeConfig：按 Agent 画布的智能路由（runtimeConfig.routingConfig）选出运行模型，
 *   对话启动与工作流 Agent 节点共用；
 * - recordDecision：路由决策写 routing_decisions，并经 DecisionService 记 routing.model_choice，
 *   智能路由节点、对话、工作流 Agent 节点三条路径共用。
 */
import { Inject, Injectable, Logger } from '@nestjs/common';

import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import type {
  AgentRoutingConfig,
  AgentRuntimeConfig,
} from '../agent-definition/agent-runtime-config.interface';
import { DecisionService } from '../decision/decision.service';
import {
  estimateTokenCount,
  mapRoutingDecisionScores,
  normalizeSmartRoutingStrategyName,
} from '../execution/smart-routing-input.util';
import { HealthMonitorService } from './circuit-breaker/health-monitor.service';
import { RouterRegistry } from './core/router-registry';
import type { RoutingCandidate } from './core/routing-candidate';
import type { RoutingFallbackSource } from './core/routing-decision';
import {
  SmartRoutingService,
  type PersistedRoutingDecision,
  type RoutingDecisionSubject,
} from './smart-routing.service';

export interface RecordRoutingDecisionParams {
  subject: RoutingDecisionSubject;
  tenantId: string;
  routingNodeId: string;
  decision: PersistedRoutingDecision & { selectedModelId: string };
  /** 决策输入：供 decision_records 记录与 Jev 影子评估 */
  queryText?: string;
  taskCategory?: string;
  inputTokenCount: number;
  candidates: RoutingCandidate[];
}

export interface AgentRoutingParams {
  tenantId: string;
  subject: RoutingDecisionSubject;
  /** routing_decisions.routing_node_id：对话为 `conversation`，工作流 Agent 节点为其 nodeId */
  routingNodeId: string;
  taskCategory: string;
  queryText?: string;
}

@Injectable()
export class ModelRoutingService {
  private readonly logger = new Logger(ModelRoutingService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly smartRoutingService: SmartRoutingService,
    private readonly routerRegistry: RouterRegistry,
    private readonly healthMonitorService: HealthMonitorService,
    private readonly decisionService: DecisionService,
  ) {}

  /** 路由决策落库并记入决策账本（同一租户事务） */
  async recordDecision(params: RecordRoutingDecisionParams): Promise<string> {
    const { tenantId, decision } = params;
    return runInTenantTransaction(this.db, tenantId, async () => {
      const routingDecisionId = await this.smartRoutingService.recordDecision(
        params.subject,
        tenantId,
        params.routingNodeId,
        decision,
      );
      await this.decisionService.decide({
        kind: 'routing.model_choice',
        tenantId,
        subject: { type: 'routing_decision', id: routingDecisionId },
        input: {
          queryText: params.queryText ?? null,
          taskCategory: params.taskCategory ?? null,
          inputTokenCount: params.inputTokenCount,
          candidates: params.candidates.map((candidate) => ({
            id: candidate.id,
            name: candidate.name,
            provider: candidate.provider,
            qualityRank: candidate.routingMeta.qualityRank,
            avgLatencyMs: candidate.routingMeta.avgLatencyMs,
            costs: candidate.routingMeta.costs,
          })),
          selectedModelId: decision.selectedModelId,
        },
      });
      return routingDecisionId;
    });
  }

  /**
   * 按 routingConfig 在候选间选出运行模型并写回 modelConfig.modelId；
   * 没有候选时原样返回，只有一个候选时直接使用（不产生决策）。
   */
  async routeAgentRuntimeConfig(
    runtimeConfig: AgentRuntimeConfig,
    params: AgentRoutingParams,
  ): Promise<AgentRuntimeConfig> {
    const routingConfig = runtimeConfig.routingConfig;
    const candidateModelIds = (routingConfig?.candidateModelIds ?? []).filter(
      (id) => typeof id === 'string' && id.length > 0,
    );
    if (!routingConfig || candidateModelIds.length === 0) {
      return runtimeConfig;
    }

    const selectedModelId =
      candidateModelIds.length === 1
        ? candidateModelIds[0]
        : await this.selectModelId(routingConfig, candidateModelIds, params);

    return {
      ...runtimeConfig,
      modelConfig: {
        ...(runtimeConfig.modelConfig ?? {}),
        modelId: selectedModelId,
      },
      routingConfig: { ...routingConfig, candidateModelIds },
    };
  }

  /**
   * 经 RouterRegistry 选择策略、健康过滤后路由并记录决策。
   * 路由器抛错或未选出模型时确定性回退到 fallbackModelId（须在候选内）或候选首位，
   * 同样记录（fallbackReason=router_error）；记录失败只告警，不影响选择结果。
   */
  private async selectModelId(
    routingConfig: AgentRoutingConfig,
    candidateModelIds: string[],
    params: AgentRoutingParams,
  ): Promise<string> {
    const { tenantId } = params;
    const strategyName = normalizeSmartRoutingStrategyName(
      routingConfig.strategy?.trim() || 'FALLBACK_CHAIN',
    );
    const queryText = params.queryText || undefined;
    const inputTokenCount = estimateTokenCount(queryText ?? '');
    const startedAt = Date.now();
    let candidates: RoutingCandidate[] = [];
    let decision: RecordRoutingDecisionParams['decision'];

    try {
      const router = this.routerRegistry.get(strategyName);
      candidates = await runInTenantTransaction(this.db, tenantId, () =>
        this.smartRoutingService.loadCandidates(candidateModelIds, tenantId),
      );
      const healthyCandidates =
        await this.healthMonitorService.filterHealthyCandidates(
          tenantId,
          candidates,
        );
      candidates = healthyCandidates;
      const routed = await router.route(healthyCandidates, {
        inputTokenCount,
        tenantId,
        taskCategory: params.taskCategory,
        ...(queryText ? { queryText } : {}),
        ...(routingConfig.strategyConfig
          ? { strategyConfig: routingConfig.strategyConfig }
          : {}),
      });
      if (!routed.selectedModelId) {
        throw new Error(`路由策略 ${strategyName} 未选出模型`);
      }
      decision = {
        selectedModelId: routed.selectedModelId,
        strategy: strategyName,
        reasoning: routed.reasoning,
        evaluatedModels: mapRoutingDecisionScores(routed),
        latencyMs: routed.latencyMs,
        routerType: routed.routerType,
        fallbackReason: routed.fallback?.reason,
        fallbackSource: routed.fallback?.source,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const configuredFallback =
        routingConfig.fallbackModelId &&
        candidateModelIds.includes(routingConfig.fallbackModelId)
          ? routingConfig.fallbackModelId
          : undefined;
      const fallbackSource: RoutingFallbackSource = configuredFallback
        ? 'configured_model'
        : 'first_candidate';
      const selectedModelId = configuredFallback ?? candidateModelIds[0];
      this.logger.warn(
        `Agent smart routing failed (${params.routingNodeId}), falling back to ${fallbackSource} ${selectedModelId}: ${message}`,
      );
      decision = {
        selectedModelId,
        strategy: strategyName,
        reasoning: message,
        evaluatedModels: [],
        latencyMs: Date.now() - startedAt,
        routerType: strategyName,
        fallbackReason: 'router_error',
        fallbackSource,
      };
    }

    try {
      await this.recordDecision({
        subject: params.subject,
        tenantId,
        routingNodeId: params.routingNodeId,
        decision,
        queryText,
        taskCategory: params.taskCategory,
        inputTokenCount,
        candidates,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to record agent routing decision (${params.routingNodeId}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    return decision.selectedModelId;
  }
}
