/**
 * 智能路由节点执行器：解析节点配置，经 SmartRoutingService 加载候选、健康过滤、路由决策，
 * 再经 ModelRoutingService 持久化决策并记录 routing.model_choice（规则 = 实际选择；配置 Jev 时异步写影子结果）。
 */
import { Injectable } from '@nestjs/common';
import type { ExecutionStep } from '../../../database/schema';
import { AgentExecutionException } from '../execution.exceptions';
import { ModelRoutingService } from '../../smart-routing/model-routing.service';
import { SmartRoutingService } from '../../smart-routing/smart-routing.service';
import { RouterRegistry } from '../../smart-routing/core/router-registry';
import type { RoutingContext as SmartRoutingContext } from '../../smart-routing/core/routing-context';
import { HealthMonitorService } from '../../smart-routing/circuit-breaker/health-monitor.service';
import { EmbeddingIntegrationService } from '../../smart-routing/embedding/embedding.service';
import type { NodeSchedulerService } from '../node-scheduler.service';
import { NodeExecutionFailurePolicy } from '../node-execution-failure-policy';
import { StepStateMachineService } from '../step-state-machine.service';
import { getRuntimeNodeData } from '../node-value.util';
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
    private readonly smartRoutingService: SmartRoutingService,
    private readonly routerRegistry: RouterRegistry,
    private readonly healthMonitorService: HealthMonitorService,
    private readonly embeddingService: EmbeddingIntegrationService,
    private readonly stepStateMachine: StepStateMachineService,
    private readonly failurePolicy: NodeExecutionFailurePolicy,
    private readonly modelRoutingService: ModelRoutingService,
  ) {}

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

      const candidates = await this.smartRoutingService.loadCandidates(
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
      const routingDecisionId = await this.modelRoutingService.recordDecision({
        subject: { executionStepId: step.id },
        tenantId,
        routingNodeId: step.nodeId,
        decision: {
          selectedModelId: decision.selectedModelId,
          strategy: strategyName,
          reasoning: decision.reasoning,
          evaluatedModels,
          latencyMs: decision.latencyMs,
          routerType: decision.routerType,
          fallbackReason: decision.fallback?.reason,
          fallbackSource: decision.fallback?.source,
        },
        queryText,
        taskCategory,
        inputTokenCount,
        candidates: healthyCandidates,
      });

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
}
