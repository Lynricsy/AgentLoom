/**
 * Compound 执行服务：管理 loop/iteration 上下文、轮次推进与内部节点生命周期。
 */
import { Inject, Injectable } from '@nestjs/common';
import { inArray } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import * as schema from '../../database/schema';
import type { ExecutionStep, ReactFlowEdge } from '../../database/schema';
import { DagResolverService } from './dag-resolver.service';
import { EventBridgeService } from './services/event-bridge.service';
import { NodeExecutionFailurePolicy } from './node-execution-failure-policy';
import { StepStateMachineService } from './step-state-machine.service';
import {
  readCompoundParentNodeId,
  readExecutionRuntimeMeta,
} from './compound-runtime.util';
import {
  extractOutputValue,
  getRuntimeNodeData,
  isRecord,
  readFirstDefined,
  readFirstString,
  readOptionalNumber,
} from './node-value.util';
import {
  evaluateExpression,
  normalizeLoopItemsInput,
} from './condition-evaluator.util';

export type CompoundSchedulingDecision = 'schedule' | 'skip' | 'wait';

export interface CompoundExecutionRuntime {
  loadExecutionContext(executionId: string): Promise<{
    execution: schema.WorkflowExecution;
    snapshot: { nodes: schema.ReactFlowNode[]; edges: ReactFlowEdge[] };
    steps: ExecutionStep[];
  }>;
  scheduleNode(
    executionId: string,
    nodeId: string,
    tenantId: string,
    snapshot: { nodes: schema.ReactFlowNode[]; edges: ReactFlowEdge[] },
    steps: ExecutionStep[],
    options?: { readonly skipLatestState?: boolean },
  ): Promise<void>;
  getSchedulingDecision(
    nodeId: string,
    edges: ReactFlowEdge[],
    steps: ExecutionStep[],
  ): CompoundSchedulingDecision;
  onNodeCompleted(
    executionId: string,
    stepId: string,
    tenantId: string,
  ): Promise<void>;
  onNodeFailed(
    executionId: string,
    stepId: string,
    tenantId: string,
  ): Promise<void>;
}

export interface CompoundExecutionContext {
  executionId: string;
  tenantId: string;
  parentNodeId: string;
  parentStepId: string;
  parentNodeType: 'loop' | 'iteration';
  parentInput: Record<string, unknown>;
  outputMode: 'none' | 'collect-array' | 'last';
  internalNodes: schema.ReactFlowNode[];
  internalEdges: ReactFlowEdge[];
  orderedNodeIds: string[];
  extraInputPortIds: string[];
  iterationItems: unknown[];
  iterationIndex: number;
  completedRounds: number;
  loopState: unknown;
  loopRound: number;
  maxIterations: number;
  previousResult: Record<string, unknown> | null;
  roundOutputs: Record<string, unknown>;
  finalOutputs: Record<string, unknown>;
  breakRequested: boolean;
  continueRequested: boolean;
  nextStateProvided: boolean;
  nextState: unknown;
}

function buildCompoundContextKey(
  executionId: string,
  parentNodeId: string,
): string {
  return `${executionId}:${parentNodeId}`;
}

@Injectable()
export class CompoundExecutionService {
  private readonly compoundContexts = new Map<
    string,
    CompoundExecutionContext
  >();

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly dagResolver: DagResolverService,
    private readonly stepStateMachine: StepStateMachineService,
    private readonly eventBridge: EventBridgeService,
    private readonly failurePolicy: NodeExecutionFailurePolicy,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  async executeLoopNode(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
    runtime: CompoundExecutionRuntime,
  ): Promise<void> {
    await this.startCompoundExecution(
      step,
      input,
      tenantId,
      executionId,
      'loop',
      runtime,
    );
  }

  async executeIterationNode(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
    runtime: CompoundExecutionRuntime,
  ): Promise<void> {
    await this.startCompoundExecution(
      step,
      input,
      tenantId,
      executionId,
      'iteration',
      runtime,
    );
  }

  async executeLoopStartNode(
    step: ExecutionStep,
    tenantId: string,
    executionId: string,
    runtime: CompoundExecutionRuntime,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const context = await this.requireCompoundContextForStep(
        step,
        executionId,
      );
      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        {
          result: this.buildLoopStartResult(context),
        },
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

  async executeIterationStartNode(
    step: ExecutionStep,
    tenantId: string,
    executionId: string,
    runtime: CompoundExecutionRuntime,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const context = await this.requireCompoundContextForStep(
        step,
        executionId,
      );
      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        {
          result: this.buildIterationStartResult(context),
        },
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

  async executeLoopStateNode(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
    runtime: CompoundExecutionRuntime,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const context = await this.requireCompoundContextForStep(
        step,
        executionId,
      );
      context.nextStateProvided = true;
      context.nextState = this.extractCompoundValueInput(input, 'state-in');

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        {
          result: {
            state: context.nextState,
            'exec-out': { triggered: true },
          },
        },
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

  async executeResultNode(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
    runtime: CompoundExecutionRuntime,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const context = await this.requireCompoundContextForStep(
        step,
        executionId,
      );
      const nodeData = getRuntimeNodeData(step.nodeData ?? {});
      const outputKey =
        readFirstString(nodeData.outputKey, nodeData.output_key) ?? 'result';
      const value = this.extractCompoundValueInput(input, 'value-in');

      context.roundOutputs[outputKey] = value;

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        {
          result: {
            outputKey,
            value,
          },
        },
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

  async executeBreakNode(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
    runtime: CompoundExecutionRuntime,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const context = await this.requireCompoundContextForStep(
        step,
        executionId,
      );
      const triggered = this.shouldTriggerJumpNode(step, input);
      if (triggered) {
        context.breakRequested = true;
      }

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        {
          result: {
            action: 'break',
            triggered,
          },
        },
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

  async executeContinueNode(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
    runtime: CompoundExecutionRuntime,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const context = await this.requireCompoundContextForStep(
        step,
        executionId,
      );
      const triggered = this.shouldTriggerJumpNode(step, input);
      if (triggered) {
        context.continueRequested = true;
      }

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        {
          result: {
            action: 'continue',
            triggered,
          },
        },
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

  async startCompoundExecution(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
    parentNodeType: 'loop' | 'iteration',
    runtime: CompoundExecutionRuntime,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const { snapshot, steps } =
        await runtime.loadExecutionContext(executionId);
      const context = this.createCompoundContext(
        step,
        input,
        tenantId,
        executionId,
        snapshot,
        parentNodeType,
      );

      const contextKey = buildCompoundContextKey(
        executionId,
        context.parentNodeId,
      );
      this.compoundContexts.set(contextKey, context);

      if (
        context.internalNodes.length === 0 ||
        (context.parentNodeType === 'iteration' &&
          context.iterationItems.length === 0)
      ) {
        await this.finalizeCompoundExecution(context, tenantId, runtime);
        return;
      }

      await this.resetCompoundRoundSteps(context, steps, tenantId);
      await this.scheduleNextCompoundNode(context, tenantId, runtime);
    } catch (error) {
      await this.failurePolicy.handle(error, {
        tenantId,
        executionId,
        step,
        onNodeFailed: runtime.onNodeFailed.bind(runtime),
      });
    }
  }

  createCompoundContext(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
    snapshot: { nodes: schema.ReactFlowNode[]; edges: ReactFlowEdge[] },
    parentNodeType: 'loop' | 'iteration',
  ): CompoundExecutionContext {
    const parentNodeId = step.nodeId;
    const internalNodes = snapshot.nodes.filter(
      (node) => readCompoundParentNodeId(node) === parentNodeId,
    );
    const internalNodeIds = new Set(internalNodes.map((node) => node.id));
    const internalEdges = snapshot.edges.filter(
      (edge) =>
        internalNodeIds.has(edge.source) && internalNodeIds.has(edge.target),
    );
    const orderedNodeIds = this.dagResolver
      .resolveDag(internalNodes, internalEdges)
      .layers.flat();

    const nodeData = getRuntimeNodeData(step.nodeData ?? {});
    const inputPorts = Array.isArray(nodeData.inputPorts)
      ? nodeData.inputPorts
      : Array.isArray(nodeData.input_ports)
        ? nodeData.input_ports
        : [];
    const extraInputPortIds = inputPorts
      .filter(
        (port) =>
          isRecord(port) &&
          typeof port.id === 'string' &&
          port.id.startsWith('input-'),
      )
      .map((port) => port.id as string);
    const configuredMaxIterations = readOptionalNumber(
      nodeData.maxIterations,
      nodeData.max_iterations,
    );

    return {
      executionId,
      tenantId,
      parentNodeId,
      parentStepId: step.id,
      parentNodeType,
      parentInput: input,
      outputMode:
        readFirstString(nodeData.outputMode, nodeData.output_mode) === 'none'
          ? 'none'
          : readFirstString(nodeData.outputMode, nodeData.output_mode) ===
              'collect-array'
            ? 'collect-array'
            : readFirstString(nodeData.outputMode, nodeData.output_mode) ===
                'last'
              ? 'last'
              : parentNodeType === 'iteration'
                ? 'collect-array'
                : 'last',
      internalNodes,
      internalEdges,
      orderedNodeIds,
      extraInputPortIds,
      iterationItems:
        parentNodeType === 'iteration' ? normalizeLoopItemsInput(input) : [],
      iterationIndex: 0,
      completedRounds: 0,
      loopState:
        input['state-in'] ??
        readFirstDefined(nodeData.defaultState, nodeData.default_state) ??
        null,
      loopRound: 0,
      maxIterations:
        configuredMaxIterations && configuredMaxIterations > 0
          ? Math.floor(configuredMaxIterations)
          : 100,
      previousResult: null,
      roundOutputs: {},
      finalOutputs: {},
      breakRequested: false,
      continueRequested: false,
      nextStateProvided: false,
      nextState: undefined,
    };
  }

  async requireCompoundContextForStep(
    step: ExecutionStep,
    executionId: string,
  ): Promise<CompoundExecutionContext> {
    const meta = readExecutionRuntimeMeta(step.nodeData);
    const parentNodeId = meta.compoundParentId;
    if (!parentNodeId) {
      throw new Error(`步骤 ${step.nodeId} 不属于 compound 内部节点`);
    }

    const context = this.compoundContexts.get(
      buildCompoundContextKey(executionId, parentNodeId),
    );
    if (!context) {
      throw new Error(`compound 上下文不存在: ${executionId}:${parentNodeId}`);
    }

    return context;
  }

  shouldTriggerJumpNode(
    step: ExecutionStep,
    input: Record<string, unknown>,
  ): boolean {
    const nodeData = getRuntimeNodeData(step.nodeData ?? {});
    const mode =
      readFirstString(nodeData.mode, nodeData.jumpMode) === 'expression'
        ? 'expression'
        : 'always';

    if (mode !== 'expression') {
      return true;
    }

    const expression = readFirstString(
      nodeData.expression,
      nodeData.jumpExpression,
    );
    if (!expression?.trim()) {
      return false;
    }

    return Boolean(evaluateExpression(expression, input));
  }

  buildLoopStartResult(
    context: CompoundExecutionContext,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {
      'exec-out': { triggered: true, round: context.loopRound },
      round: context.loopRound,
      state: context.loopState,
    };

    for (const inputPortId of context.extraInputPortIds) {
      result[inputPortId] = context.parentInput[inputPortId];
    }

    if (context.previousResult) {
      result['previous-result'] = context.previousResult;
    }

    result['is-first'] = context.loopRound === 0;
    return result;
  }

  buildIterationStartResult(
    context: CompoundExecutionContext,
  ): Record<string, unknown> {
    const currentItem = context.iterationItems[context.iterationIndex];
    const result: Record<string, unknown> = {
      'exec-out': { triggered: true, index: context.iterationIndex },
      item: currentItem,
      index: context.iterationIndex,
      total: context.iterationItems.length,
      'is-first': context.iterationIndex === 0,
      'is-last': context.iterationIndex === context.iterationItems.length - 1,
    };

    for (const inputPortId of context.extraInputPortIds) {
      result[inputPortId] = context.parentInput[inputPortId];
    }

    return result;
  }

  extractCompoundValueInput(
    input: Record<string, unknown>,
    portId: string,
  ): unknown {
    if (Object.prototype.hasOwnProperty.call(input, portId)) {
      return input[portId];
    }

    return extractOutputValue(input);
  }

  async resetCompoundRoundSteps(
    context: CompoundExecutionContext,
    steps: ExecutionStep[],
    tenantId: string,
  ): Promise<void> {
    const internalNodeIds = new Set(
      context.internalNodes.map((node) => node.id),
    );
    const internalSteps = steps.filter((step) =>
      internalNodeIds.has(step.nodeId),
    );
    const now = new Date();

    for (const step of internalSteps) {
      if (step.status !== 'pending') {
        this.eventBridge.emitStepStatusChanged(tenantId, context.executionId, {
          stepId: step.id,
          nodeId: step.nodeId,
          from: step.status,
          to: 'pending',
        });
      }
    }

    if (internalSteps.length === 0) {
      return;
    }

    await this.tenantDb
      .update(schema.executionSteps)
      .set({
        status: 'pending',
        input: null,
        result: null,
        errorMessage: null,
        checkpointData: null,
        startedAt: null,
        completedAt: null,
        updatedAt: now,
      })
      .where(
        inArray(
          schema.executionSteps.id,
          internalSteps.map((step) => step.id),
        ),
      );

    context.roundOutputs = {};
    context.breakRequested = false;
    context.continueRequested = false;
    context.nextStateProvided = false;
    context.nextState = undefined;
  }

  async scheduleNextCompoundNode(
    context: CompoundExecutionContext,
    tenantId: string,
    runtime: CompoundExecutionRuntime,
  ): Promise<void> {
    const { steps } = await runtime.loadExecutionContext(context.executionId);
    const internalNodeIds = new Set(
      context.internalNodes.map((node) => node.id),
    );
    const internalSteps = steps.filter((step) =>
      internalNodeIds.has(step.nodeId),
    );

    const hasActiveStep = internalSteps.some(
      (step) =>
        step.status === 'queued' ||
        step.status === 'running' ||
        step.status === 'waiting_intervention',
    );
    if (hasActiveStep) {
      return;
    }

    if (context.breakRequested) {
      const readyResultStep = internalSteps.find(
        (step) =>
          step.status === 'pending' &&
          step.nodeType === 'result' &&
          runtime.getSchedulingDecision(
            step.nodeId,
            context.internalEdges,
            internalSteps,
          ) === 'schedule',
      );

      if (readyResultStep) {
        await runtime.scheduleNode(
          context.executionId,
          readyResultStep.nodeId,
          tenantId,
          {
            nodes: context.internalNodes,
            edges: context.internalEdges,
          },
          steps,
          { skipLatestState: true },
        );
        return;
      }

      await this.skipPendingCompoundInternalSteps(internalSteps, tenantId);
      context.completedRounds += 1;

      if (Object.keys(context.roundOutputs).length > 0) {
        this.mergeCompoundRoundOutputs(context);
        context.previousResult = { ...context.roundOutputs };
      }

      await this.finalizeCompoundExecution(context, tenantId, runtime);
      return;
    }

    if (context.continueRequested) {
      await this.skipPendingCompoundInternalSteps(internalSteps, tenantId);
      const { steps: latestSteps } = await runtime.loadExecutionContext(
        context.executionId,
      );
      const internalNodeIds = new Set(
        context.internalNodes.map((node) => node.id),
      );
      const latestInternalSteps = latestSteps.filter((step) =>
        internalNodeIds.has(step.nodeId),
      );
      await this.advanceCompoundRound(
        context,
        latestInternalSteps,
        tenantId,
        true,
        runtime,
      );
      return;
    }

    for (const nodeId of context.orderedNodeIds) {
      const step = internalSteps.find(
        (candidate) => candidate.nodeId === nodeId,
      );
      if (!step || step.status !== 'pending') {
        continue;
      }

      const decision = runtime.getSchedulingDecision(
        nodeId,
        context.internalEdges,
        internalSteps,
      );

      if (decision === 'skip') {
        await this.stepStateMachine.updateStepStatus(
          tenantId,
          step.id,
          'skipped',
        );
        await runtime.onNodeCompleted(context.executionId, step.id, tenantId);
        return;
      }

      if (decision === 'schedule') {
        await runtime.scheduleNode(
          context.executionId,
          nodeId,
          tenantId,
          {
            nodes: context.internalNodes,
            edges: context.internalEdges,
          },
          steps,
          { skipLatestState: true },
        );
        return;
      }
    }

    const hasPending = internalSteps.some((step) => step.status === 'pending');
    if (!hasPending) {
      await this.advanceCompoundRound(
        context,
        internalSteps,
        tenantId,
        false,
        runtime,
      );
    }
  }

  async skipPendingCompoundInternalSteps(
    steps: ExecutionStep[],
    tenantId: string,
  ): Promise<void> {
    for (const step of steps) {
      if (step.status !== 'pending') {
        continue;
      }

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'skipped',
      );
    }
  }

  async advanceCompoundRound(
    context: CompoundExecutionContext,
    steps: ExecutionStep[],
    tenantId: string,
    discardRoundOutputs: boolean,
    runtime: CompoundExecutionRuntime,
  ): Promise<void> {
    context.completedRounds += 1;

    if (!discardRoundOutputs) {
      this.mergeCompoundRoundOutputs(context);
    }

    if (!discardRoundOutputs && Object.keys(context.roundOutputs).length > 0) {
      context.previousResult = { ...context.roundOutputs };
    }

    if (context.parentNodeType === 'iteration') {
      context.iterationIndex += 1;
      if (context.iterationIndex >= context.iterationItems.length) {
        await this.finalizeCompoundExecution(context, tenantId, runtime);
        return;
      }
    } else {
      context.loopRound += 1;
      if (context.nextStateProvided) {
        context.loopState = context.nextState;
      }

      if (context.loopRound >= context.maxIterations) {
        await this.finalizeCompoundExecution(
          context,
          tenantId,
          runtime,
          'max_iterations',
        );
        return;
      }
    }

    await this.resetCompoundRoundSteps(context, steps, tenantId);
    await this.scheduleNextCompoundNode(context, tenantId, runtime);
  }

  mergeCompoundRoundOutputs(context: CompoundExecutionContext): void {
    if (context.outputMode === 'none') {
      return;
    }

    for (const [outputKey, value] of Object.entries(context.roundOutputs)) {
      if (context.outputMode === 'collect-array') {
        const current = Array.isArray(context.finalOutputs[outputKey])
          ? (context.finalOutputs[outputKey] as unknown[])
          : [];
        context.finalOutputs[outputKey] = [...current, value];
        continue;
      }

      context.finalOutputs[outputKey] = value;
    }
  }

  async finalizeCompoundExecution(
    context: CompoundExecutionContext,
    tenantId: string,
    runtime: CompoundExecutionRuntime,
    stopReason?: string,
  ): Promise<void> {
    this.compoundContexts.delete(
      buildCompoundContextKey(context.executionId, context.parentNodeId),
    );

    const result: Record<string, unknown> = {
      'exec-out': {
        triggered: true,
        stopReason:
          stopReason ?? (context.breakRequested ? 'break' : 'completed'),
      },
      ...context.finalOutputs,
      compound: {
        mode: context.parentNodeType,
        rounds: context.completedRounds,
        ...(context.parentNodeType === 'iteration'
          ? { totalItems: context.iterationItems.length }
          : { finalState: context.loopState }),
        ...(stopReason ? { stopReason } : {}),
      },
    };

    await this.stepStateMachine.updateStepStatus(
      tenantId,
      context.parentStepId,
      'completed',
      {
        result,
      },
    );

    await runtime.onNodeCompleted(
      context.executionId,
      context.parentStepId,
      tenantId,
    );
  }

  async onCompoundInternalNodeCompleted(
    executionId: string,
    completedStep: ExecutionStep,
    steps: ExecutionStep[],
    tenantId: string,
    runtime: CompoundExecutionRuntime,
  ): Promise<void> {
    const meta = readExecutionRuntimeMeta(completedStep.nodeData);
    if (!meta.compoundParentId) {
      return;
    }

    const context = this.compoundContexts.get(
      buildCompoundContextKey(executionId, meta.compoundParentId),
    );
    if (!context) {
      return;
    }

    await this.scheduleNextCompoundNode(context, tenantId, runtime);
  }

  async onCompoundInternalNodeFailed(
    executionId: string,
    failedStep: ExecutionStep,
    steps: ExecutionStep[],
    tenantId: string,
    runtime: CompoundExecutionRuntime,
  ): Promise<void> {
    const meta = readExecutionRuntimeMeta(failedStep.nodeData);
    if (!meta.compoundParentId) {
      return;
    }

    const context = this.compoundContexts.get(
      buildCompoundContextKey(executionId, meta.compoundParentId),
    );
    if (!context) {
      return;
    }

    this.compoundContexts.delete(
      buildCompoundContextKey(executionId, meta.compoundParentId),
    );

    const message =
      failedStep.errorMessage?.message ??
      `compound 内部节点 ${failedStep.nodeId} 执行失败`;

    await this.stepStateMachine.updateStepStatus(
      tenantId,
      context.parentStepId,
      'failed',
      {
        errorMessage: {
          ...(failedStep.errorMessage ?? { message }),
          message,
          nodeId: context.parentNodeId,
          detail: `内部节点 ${failedStep.nodeId} 执行失败`,
        },
      },
    );

    await runtime.onNodeFailed(executionId, context.parentStepId, tenantId);
  }
}
