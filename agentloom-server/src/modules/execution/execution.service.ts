import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, type Job, type JobType } from 'bullmq';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import * as schema from '../../database/schema';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import type { FieldError } from '../../common/types/problem-details.type';
import {
  hasActiveTenantTransaction,
  registerAfterCommitHook,
  runInTenantTransaction,
} from '../../common/interceptors/tenant-transaction.context';
import {
  DeadLetterJobNotFoundException,
  ExecutionNotFoundException,
  WorkflowLaunchInputValidationException,
  WorkflowLaunchSchemaVersionMismatchException,
  WorkflowNotPublishedException,
  ExecutionNotCancellableException,
  WorkflowArchivedException,
} from './execution.exceptions';
import { EventBridgeService } from './services/event-bridge.service';
import { ExecutionCancellationService } from './services/execution-cancellation.service';
import { ResourceGovernanceService } from '../resource-governance/resource-governance.service';
import { ResourceGovernanceDecisionBlockedException } from '../resource-governance/resource-governance.exceptions';
import {
  EXECUTION_QUEUE,
  AGENT_TASK_QUEUE,
  type AgentTaskJobData,
} from './execution.constants';
import type {
  InternalLaunchSource,
  InternalRunWorkflowRequest,
} from './dto/run-workflow.dto';
import { SYSTEM_TRIGGER_USER_ID } from '../trigger/trigger.constants';
import {
  workflowInputSchemaSchema,
  type CollectionMode,
  type WorkflowInputSchema,
} from '../workflow/dto/workflow-input-schema.dto';
import { resolveWorkflowInputParams } from '../workflow/utils/workflow-input-validation.util';
import {
  WorkflowNotFoundException,
  WorkflowVersionNotFoundException,
} from '../workflow-definition/workflow-version.exceptions';
import {
  attachExecutionRuntimeMeta,
  isTrackedExecutionStep,
} from './compound-runtime.util';
import { buildExecutableWorkflowGraph } from './reusable-block-expansion.util';
import { SandboxMaintenanceException } from '../sandbox/sandbox.exceptions';

export interface ExecutionJobData {
  executionId: string;
  tenantId: string;
}

export interface ListExecutionsFilters {
  status?: schema.WorkflowExecution['status'];
  workflowVersionId?: string;
  definitionSource?: schema.WorkflowExecution['definitionSource'];
}

const CANCELLABLE_STATUSES = new Set(['pending', 'running', 'paused']);
/** 取消执行时一并置为 cancelled 的步骤状态 */
const CANCELLABLE_STEP_STATUSES: schema.ExecutionStep['status'][] = [
  'pending',
  'queued',
  'running',
  'waiting_intervention',
];
const REMOVABLE_JOB_STATES: JobType[] = ['waiting', 'delayed', 'prioritized'];
const TERMINAL_EXECUTION_STATUSES = new Set([
  'cancelled',
  'completed',
  'failed',
]);
const WORKFLOW_NODE_CATEGORY_TYPES = new Set([
  'agent',
  'tool',
  'trigger',
  'knowledge',
  'memory',
  'output',
  'control',
  'plugin',
]);

function isRemovableJobState(state: string): state is JobType {
  return REMOVABLE_JOB_STATES.includes(state as JobType);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeWorkflowExecutionNodeType(nodeType: string): string {
  switch (nodeType) {
    case 'conditional':
      return 'condition';
    case 'data_transform':
      return 'input-preprocessor';
    default:
      return nodeType;
  }
}

function resolveWorkflowExecutionNodeType(
  node: Pick<schema.ReactFlowNode, 'type' | 'data'>,
): string | null {
  const nodeData = isRecord(node.data) ? node.data : {};
  const dataNodeType =
    typeof nodeData.nodeType === 'string' && nodeData.nodeType.length > 0
      ? nodeData.nodeType
      : typeof nodeData.node_type === 'string' && nodeData.node_type.length > 0
        ? nodeData.node_type
        : null;

  if (dataNodeType) {
    return normalizeWorkflowExecutionNodeType(dataNodeType);
  }

  if (typeof node.type !== 'string' || node.type.length === 0) {
    return null;
  }

  return WORKFLOW_NODE_CATEGORY_TYPES.has(node.type)
    ? node.type
    : normalizeWorkflowExecutionNodeType(node.type);
}

type SandboxSessionStatus = schema.SandboxSession['status'];

function readSandboxSessionId(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  return typeof value.sessionId === 'string' ? value.sessionId : null;
}

function patchSandboxReferenceStatus<T>(
  value: T,
  statusBySessionId: Map<string, SandboxSessionStatus>,
): T {
  if (!isRecord(value) || typeof value.sessionId !== 'string') {
    return value;
  }

  const currentStatus = statusBySessionId.get(value.sessionId);

  if (!currentStatus || value.status === currentStatus) {
    return value;
  }

  return {
    ...value,
    status: currentStatus,
  } as T;
}

function collectSandboxSessionIds(steps: schema.ExecutionStep[]): string[] {
  const sessionIds = new Set<string>();

  for (const step of steps) {
    if (isRecord(step.input)) {
      const inputSandboxId =
        readSandboxSessionId(step.input['sandbox-in']) ??
        readSandboxSessionId(step.input.sandbox);
      if (inputSandboxId) {
        sessionIds.add(inputSandboxId);
      }

      const inputSandboxOutputId =
        readSandboxSessionId(step.input['sandbox-out']) ??
        readSandboxSessionId(step.input['sandbox-output']);
      if (inputSandboxOutputId) {
        sessionIds.add(inputSandboxOutputId);
      }
    }

    if (step.nodeType !== 'sandbox' || !isRecord(step.result)) {
      continue;
    }

    const resultSandboxId = readSandboxSessionId(step.result);
    if (resultSandboxId) {
      sessionIds.add(resultSandboxId);
    }

    const resultSandboxOutputId =
      readSandboxSessionId(step.result['sandbox-out']) ??
      readSandboxSessionId(step.result['sandbox-output']);
    if (resultSandboxOutputId) {
      sessionIds.add(resultSandboxOutputId);
    }
  }

  return Array.from(sessionIds);
}

function patchExecutionStepSandboxStatuses(
  step: schema.ExecutionStep,
  statusBySessionId: Map<string, SandboxSessionStatus>,
): schema.ExecutionStep {
  let nextInput = step.input;
  let nextResult = step.result;

  if (isRecord(step.input)) {
    const nextSandbox = patchSandboxReferenceStatus(
      step.input['sandbox-in'] ?? step.input.sandbox,
      statusBySessionId,
    );
    const nextSandboxOutput = patchSandboxReferenceStatus(
      step.input['sandbox-out'] ?? step.input['sandbox-output'],
      statusBySessionId,
    );

    const origSandbox = step.input['sandbox-in'] ?? step.input.sandbox;
    const origSandboxOutput =
      step.input['sandbox-out'] ?? step.input['sandbox-output'];

    if (
      nextSandbox !== origSandbox ||
      nextSandboxOutput !== origSandboxOutput
    ) {
      nextInput = {
        ...step.input,
        ...(nextSandbox !== origSandbox ? { 'sandbox-in': nextSandbox } : {}),
        ...(nextSandboxOutput !== origSandboxOutput
          ? { 'sandbox-out': nextSandboxOutput }
          : {}),
      };
    }
  }

  if (step.nodeType === 'sandbox' && isRecord(step.result)) {
    const nextRootResult = patchSandboxReferenceStatus(
      step.result,
      statusBySessionId,
    );
    const nextSandboxOutput = patchSandboxReferenceStatus(
      step.result['sandbox-out'] ?? step.result['sandbox-output'],
      statusBySessionId,
    );

    const origSandboxOutput =
      step.result['sandbox-out'] ?? step.result['sandbox-output'];

    if (
      nextRootResult !== step.result ||
      nextSandboxOutput !== origSandboxOutput
    ) {
      nextResult = {
        ...(isRecord(nextRootResult) ? nextRootResult : step.result),
        ...(nextSandboxOutput !== origSandboxOutput
          ? { 'sandbox-out': nextSandboxOutput }
          : {}),
      };
    }
  }

  if (nextInput === step.input && nextResult === step.result) {
    return step;
  }

  return {
    ...step,
    input: nextInput,
    result: nextResult,
  };
}

interface ExecutionLaunchConfig {
  workflowId: string;
  schemaVersion: number;
  collectionMode: CollectionMode;
  resolvedInputs: Record<string, unknown>;
  unresolvedFieldIds: string[];
  launchSource: InternalRunWorkflowRequest['launchSource'] | null;
}

function createDefaultWorkflowInputSchema(): WorkflowInputSchema {
  return workflowInputSchemaSchema.parse({});
}

function shouldNormalizeLaunchInput(
  workflowInputSchema: WorkflowInputSchema | null | undefined,
  runRequest: InternalRunWorkflowRequest | undefined,
): boolean {
  return workflowInputSchema != null || runRequest?.schemaVersion !== undefined;
}

/**
 * 触发器启动由外部系统投递（cron / webhook / API 事件），投递方无从得知已发布输入契约的
 * 版本，也无法控制载荷字段。这些来源只在服务端内部设置，公开 run DTO 不接受。
 */
const TRIGGER_LAUNCH_SOURCES: Partial<Record<InternalLaunchSource, true>> = {
  'cron-trigger': true,
  'webhook-trigger': true,
  'api-event-trigger': true,
};

function shouldRequireSchemaVersion(
  runRequest: InternalRunWorkflowRequest | undefined,
): boolean {
  if (
    runRequest?.launchSource &&
    TRIGGER_LAUNCH_SOURCES[runRequest.launchSource]
  ) {
    return false;
  }

  const triggerType = runRequest?.triggerType ?? 'manual';

  return triggerType === 'manual' || triggerType === 'api';
}

function getRawLaunchInputParams(
  runRequest: InternalRunWorkflowRequest | undefined,
): Record<string, unknown> {
  if (!runRequest?.inputParams) {
    return {};
  }

  const rawInputParams = { ...runRequest.inputParams };
  delete rawInputParams._meta;

  return rawInputParams;
}

function buildNormalizedExecutionInputParams(
  workflowId: string,
  runRequest: InternalRunWorkflowRequest | undefined,
  workflowInputSchema: WorkflowInputSchema,
): Record<string, unknown> {
  const rawInputParams = getRawLaunchInputParams(runRequest);
  const schemaVersion = runRequest?.schemaVersion;

  if (schemaVersion === undefined) {
    if (shouldRequireSchemaVersion(runRequest)) {
      throw new WorkflowLaunchInputValidationException([
        {
          field: 'schemaVersion',
          message: 'schemaVersion 是必填字段',
        },
      ]);
    }
  } else if (schemaVersion !== workflowInputSchema.version) {
    throw new WorkflowLaunchSchemaVersionMismatchException(
      workflowInputSchema.version,
      schemaVersion,
    );
  }

  // 未知键 / visibility / default / 空值 / options 语义与生成应用公开提交共用同一实现，
  // 见 workflow/utils/workflow-input-validation.util.ts 的注释。
  // 触发器载荷是外部系统的事件体（如 GitHub push 带数百个键），契约外字段丢弃而非 422，
  // 原始载荷仍完整保存在 workflow_trigger_history.payload。
  const isTriggerLaunch =
    runRequest?.launchSource !== undefined &&
    TRIGGER_LAUNCH_SOURCES[runRequest.launchSource] === true;
  const { resolvedInputs, unresolvedFieldIds, errors } =
    resolveWorkflowInputParams({
      workflowInputSchema,
      rawInputParams,
      fieldPrefix: 'inputParams',
      unknownKeys: isTriggerLaunch ? 'drop' : 'reject',
    });

  if (errors.length > 0) {
    throw new WorkflowLaunchInputValidationException(errors);
  }

  const launchConfig: ExecutionLaunchConfig = {
    workflowId,
    schemaVersion: workflowInputSchema.version,
    collectionMode: workflowInputSchema.collectionMode,
    resolvedInputs: { ...resolvedInputs },
    unresolvedFieldIds,
    launchSource: runRequest?.launchSource ?? null,
  };

  const existingMeta = isRecord(runRequest?.inputParams?._meta)
    ? { ...runRequest.inputParams._meta }
    : {};
  const meta: Record<string, unknown> = {
    ...existingMeta,
    launchConfig,
  };

  if (runRequest?.launchSource) {
    meta.launchSource = runRequest.launchSource;
  }

  return {
    ...resolvedInputs,
    _meta: meta,
  };
}

function buildExecutionInputParams(
  runRequest: InternalRunWorkflowRequest | undefined,
): Record<string, unknown> {
  const inputParams = runRequest?.inputParams
    ? { ...runRequest.inputParams }
    : {};

  if (!runRequest?.launchSource) {
    return inputParams;
  }

  const existingMeta = isRecord(inputParams._meta)
    ? { ...inputParams._meta }
    : {};

  return {
    ...inputParams,
    _meta: {
      ...existingMeta,
      launchSource: runRequest.launchSource,
    },
  };
}

@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    @InjectQueue(EXECUTION_QUEUE) private readonly executionQueue: Queue,
    @InjectQueue(AGENT_TASK_QUEUE) private readonly agentTaskQueue: Queue,
    private readonly eventBridge: EventBridgeService,
    private readonly resourceGovernanceService: ResourceGovernanceService,
    private readonly executionCancellation: ExecutionCancellationService,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  private shouldUseDraftDefinition(
    runRequest: InternalRunWorkflowRequest | undefined,
  ): boolean {
    return runRequest?.launchSource === 'web-studio';
  }

  private buildDraftExecutionSnapshot(
    workflow: typeof schema.workflowDefinitions.$inferSelect,
  ): schema.WorkflowExecution['definitionSnapshot'] {
    const normalizedGraph = buildExecutableWorkflowGraph(
      workflow.nodes ?? [],
      workflow.edges ?? [],
    );

    return {
      nodes: normalizedGraph.nodes,
      edges: normalizedGraph.edges,
      viewport: workflow.viewport ?? null,
      inputSchema: workflow.inputSchema ?? null,
      metadata: {
        nodeCount: normalizedGraph.nodes.length,
        edgeCount: normalizedGraph.edges.length,
        createdFromVersion: workflow.version,
        releaseNotes: null,
      },
    };
  }

  private async hydrateSandboxStatusesInSteps(
    steps: schema.ExecutionStep[],
  ): Promise<schema.ExecutionStep[]> {
    const sessionIds = collectSandboxSessionIds(steps);

    if (sessionIds.length === 0) {
      return steps;
    }

    const sandboxSessions = await this.tenantDb
      .select({
        id: schema.sandboxSessions.id,
        status: schema.sandboxSessions.status,
      })
      .from(schema.sandboxSessions)
      .where(inArray(schema.sandboxSessions.id, sessionIds));

    if (sandboxSessions.length === 0) {
      return steps;
    }

    const statusBySessionId = new Map(
      sandboxSessions.map((session) => [session.id, session.status]),
    );

    return steps.map((step) =>
      patchExecutionStepSandboxStatuses(step, statusBySessionId),
    );
  }

  async runWorkflow(
    workflowId: string,
    runRequest: InternalRunWorkflowRequest | undefined,
    tenantId: string,
    userId: string,
  ): Promise<schema.WorkflowExecution> {
    if (process.env.APP_SANDBOX_MAINTENANCE_MODE === 'true') {
      throw new SandboxMaintenanceException('execute');
    }
    const useDraftDefinition = this.shouldUseDraftDefinition(runRequest);
    const [workflow] = await this.tenantDb
      .select()
      .from(schema.workflowDefinitions)
      .where(
        and(
          eq(schema.workflowDefinitions.id, workflowId),
          eq(schema.workflowDefinitions.tenantId, tenantId),
        ),
      );

    if (!workflow) {
      throw new WorkflowNotFoundException(workflowId);
    }

    if (workflow.status === 'archived') {
      throw new WorkflowArchivedException(workflowId);
    }

    if (workflow.status !== 'published' || !workflow.publishedVersionId) {
      throw new WorkflowNotPublishedException(workflowId);
    }

    // 显式指定版本（评测候选版本、生成应用的固定版本）时先取该版本快照，并按快照里的输入契约
    // 校验：固定版本的调用方不受工作流之后改契约的影响。未指定时沿用工作流当前契约，
    // 且先校验入参再读版本，入参非法时不查版本。
    const requestedVersionDefinition =
      runRequest?.workflowVersionId && !useDraftDefinition
        ? await this.resolveVersionExecutionDefinition(
            workflowId,
            runRequest.workflowVersionId,
            workflow.publishedVersionId,
            tenantId,
          )
        : null;
    const launchInputSchema = requestedVersionDefinition
      ? (requestedVersionDefinition.definitionSnapshot.inputSchema ?? null)
      : workflow.inputSchema;
    const workflowInputSchema = launchInputSchema
      ? workflowInputSchemaSchema.parse(launchInputSchema)
      : createDefaultWorkflowInputSchema();

    const inputParams = shouldNormalizeLaunchInput(
      launchInputSchema,
      runRequest,
    )
      ? buildNormalizedExecutionInputParams(
          workflowId,
          runRequest,
          workflowInputSchema,
        )
      : buildExecutionInputParams(runRequest);

    // 草稿运行没有对应版本：workflowVersionId 留空并标记 draft，真实定义只在 definitionSnapshot。
    const { versionId, definitionSnapshot } = useDraftDefinition
      ? {
          versionId: null,
          definitionSnapshot: this.buildDraftExecutionSnapshot(workflow),
        }
      : (requestedVersionDefinition ??
        (await this.resolveVersionExecutionDefinition(
          workflowId,
          undefined,
          workflow.publishedVersionId,
          tenantId,
        )));

    // 准入判定（含租户 advisory 锁）与插入必须在同一事务：锁持有到提交，并发启动按顺序计数（D-212）。
    // HTTP 请求里复用拦截器建立的租户事务，触发器等无事务调用方在这里开一个。
    const execution = await runInTenantTransaction(
      this.db,
      tenantId,
      async (tenantDb) => {
        const admissionDecision =
          await this.resourceGovernanceService.resolveExecutionAdmissionDecision(
            {
              tenantId,
              workflowId,
              dbClient: tenantDb,
            },
          );

        if (admissionDecision) {
          await this.resourceGovernanceService.recordBlockedDecision({
            tenantId,
            actorId: userId,
            actorType: 'user',
            block: admissionDecision,
          });
          throw new ResourceGovernanceDecisionBlockedException(
            admissionDecision,
          );
        }

        const [created] = await tenantDb
          .insert(schema.workflowExecutions)
          .values({
            workflowDefinitionId: workflowId,
            workflowVersionId: versionId,
            definitionSource: useDraftDefinition ? 'draft' : 'version',
            tenantId,
            status: 'pending',
            triggerType: runRequest?.triggerType ?? 'manual',
            inputParams,
            definitionSnapshot,
            createdBy:
              userId === SYSTEM_TRIGGER_USER_ID ? workflow.createdBy : userId,
          })
          .returning();

        registerAfterCommitHook(async () => {
          await this.enqueueExecutionJob(created.id, tenantId);
        });

        return created;
      },
    );

    this.logger.log(
      `Workflow execution created: ${JSON.stringify({ executionId: execution.id, workflowId })}`,
    );

    return execution;
  }

  private async resolveVersionExecutionDefinition(
    workflowId: string,
    requestedVersionId: string | undefined,
    publishedVersionId: string,
    tenantId: string,
  ): Promise<{
    versionId: string;
    definitionSnapshot: schema.WorkflowExecution['definitionSnapshot'];
  }> {
    const versionId = requestedVersionId ?? publishedVersionId;
    const [version] = await this.tenantDb
      .select()
      .from(schema.workflowVersions)
      .where(
        and(
          eq(schema.workflowVersions.id, versionId),
          eq(schema.workflowVersions.workflowDefinitionId, workflowId),
          eq(schema.workflowVersions.tenantId, tenantId),
        ),
      );

    if (!version) {
      if (requestedVersionId) {
        throw new WorkflowVersionNotFoundException(requestedVersionId);
      }
      throw new WorkflowNotPublishedException(workflowId);
    }

    const normalizedGraph = buildExecutableWorkflowGraph(
      version.snapshot.nodes,
      version.snapshot.edges,
    );

    return {
      versionId,
      definitionSnapshot: {
        ...version.snapshot,
        nodes: normalizedGraph.nodes,
        edges: normalizedGraph.edges,
      },
    };
  }

  /**
   * 投递 resume 任务。
   *
   * 必须走 after-commit：resume 的 execution/steps 状态更新在请求事务里，
   * 若在事务内投递，消费者会读到提交前的 failed/cancelled 快照并静默 no-op，
   * 执行就永久停在 running。与 runWorkflow 的投递时机保持一致。
   */
  async enqueueResumeJob(executionId: string, tenantId: string): Promise<void> {
    if (hasActiveTenantTransaction()) {
      registerAfterCommitHook(async () => {
        await this.executionQueue.add('resume-execution', {
          executionId,
          tenantId,
        } satisfies ExecutionJobData);
      });
      return;
    }

    await this.executionQueue.add('resume-execution', {
      executionId,
      tenantId,
    } satisfies ExecutionJobData);
  }

  private async enqueueExecutionJob(
    executionId: string,
    tenantId: string,
  ): Promise<void> {
    try {
      await this.executionQueue.add(
        'execute',
        {
          executionId,
          tenantId,
        } satisfies ExecutionJobData,
        {
          jobId: executionId,
        },
      );
    } catch (error) {
      const message = this.getErrorMessage(error);

      await this.db
        .update(schema.workflowExecutions)
        .set({
          status: 'failed',
          failedAt: new Date(),
          errorMessage: {
            message,
          },
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.workflowExecutions.id, executionId),
            eq(schema.workflowExecutions.tenantId, tenantId),
          ),
        );

      this.eventBridge.emitExecutionStatusChanged(tenantId, executionId, {
        executionId,
        status: 'failed',
        errorMessage: message,
      });

      throw error;
    }
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return 'Unknown execution enqueue error';
  }

  async getExecution(
    executionId: string,
  ): Promise<schema.WorkflowExecution & { steps: schema.ExecutionStep[] }> {
    const [execution] = await this.tenantDb
      .select()
      .from(schema.workflowExecutions)
      .where(eq(schema.workflowExecutions.id, executionId));

    if (!execution) {
      throw new ExecutionNotFoundException(executionId);
    }

    const steps = await this.tenantDb
      .select()
      .from(schema.executionSteps)
      .where(eq(schema.executionSteps.executionId, executionId))
      .orderBy(schema.executionSteps.stepOrder);

    const hydratedSteps = await this.hydrateSandboxStatusesInSteps(steps);

    return { ...execution, steps: hydratedSteps };
  }

  /**
   * 执行的子资源（PTY 会话等）只按 executionId 查询，RLS 过滤后不存在或他租户的执行
   * 会得到空结果；先在租户内断言执行存在，否则 404。
   */
  async assertExecutionExists(executionId: string): Promise<void> {
    const [execution] = await this.tenantDb
      .select({ id: schema.workflowExecutions.id })
      .from(schema.workflowExecutions)
      .where(eq(schema.workflowExecutions.id, executionId))
      .limit(1);

    if (!execution) {
      throw new ExecutionNotFoundException(executionId);
    }
  }

  async listExecutions(
    workflowId: string,
    page: number,
    limit: number,
    filters: ListExecutionsFilters = {},
  ) {
    // 执行列表受 RLS 过滤，不存在或他租户的工作流会得到空列表；先在租户内断言工作流存在
    const [workflow] = await this.tenantDb
      .select({ id: schema.workflowDefinitions.id })
      .from(schema.workflowDefinitions)
      .where(eq(schema.workflowDefinitions.id, workflowId))
      .limit(1);

    if (!workflow) {
      throw new WorkflowNotFoundException(workflowId);
    }

    const conditions = [
      eq(schema.workflowExecutions.workflowDefinitionId, workflowId),
    ];

    if (filters.status) {
      conditions.push(eq(schema.workflowExecutions.status, filters.status));
    }

    // 草稿运行的 workflowVersionId 为 NULL，按版本筛选天然不会命中
    if (filters.workflowVersionId) {
      conditions.push(
        eq(
          schema.workflowExecutions.workflowVersionId,
          filters.workflowVersionId,
        ),
      );
    }

    if (filters.definitionSource) {
      conditions.push(
        eq(
          schema.workflowExecutions.definitionSource,
          filters.definitionSource,
        ),
      );
    }

    const whereClause = and(...conditions);

    const [results, countResult] = await Promise.all([
      this.tenantDb
        .select()
        .from(schema.workflowExecutions)
        .where(whereClause)
        .orderBy(desc(schema.workflowExecutions.createdAt))
        .limit(limit)
        .offset((page - 1) * limit),
      this.tenantDb
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.workflowExecutions)
        .where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;

    return {
      data: results,
      meta: {
        total,
        page,
        limit,
        pageSize: limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async cancelExecution(
    executionId: string,
    tenantId: string,
  ): Promise<schema.WorkflowExecution> {
    const [execution] = await this.tenantDb
      .select()
      .from(schema.workflowExecutions)
      .where(eq(schema.workflowExecutions.id, executionId));

    if (!execution) {
      throw new ExecutionNotFoundException(executionId);
    }

    if (!CANCELLABLE_STATUSES.has(execution.status)) {
      throw new ExecutionNotCancellableException(executionId, execution.status);
    }

    const [updated] = await this.tenantDb
      .update(schema.workflowExecutions)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.workflowExecutions.id, executionId))
      .returning();

    // 运行中 / 等待干预的步骤一并置为 cancelled：执行器随后无法再把它们推进到 completed
    // （cancelled → completed 不是合法转换），终态快照与执行状态一致。
    // 逐步推送状态事件：画布 / 执行页按 socket 驱动，否则仍显示「待干预」「等待中」。
    const stepsToCancel = await this.tenantDb
      .select({
        id: schema.executionSteps.id,
        nodeId: schema.executionSteps.nodeId,
        status: schema.executionSteps.status,
      })
      .from(schema.executionSteps)
      .where(
        and(
          eq(schema.executionSteps.executionId, executionId),
          inArray(schema.executionSteps.status, CANCELLABLE_STEP_STATUSES),
        ),
      );

    const cancelledSteps =
      stepsToCancel.length === 0
        ? []
        : await this.tenantDb
            .update(schema.executionSteps)
            .set({
              status: 'cancelled',
              updatedAt: new Date(),
            })
            .where(
              and(
                inArray(
                  schema.executionSteps.id,
                  stepsToCancel.map((step) => step.id),
                ),
                inArray(
                  schema.executionSteps.status,
                  CANCELLABLE_STEP_STATUSES,
                ),
              ),
            )
            .returning({ id: schema.executionSteps.id });

    const previousStepById = new Map(
      stepsToCancel.map((step) => [step.id, step]),
    );
    for (const { id } of cancelledSteps) {
      const previous = previousStepById.get(id);
      if (!previous) continue;
      this.eventBridge.emitStepStatusChanged(tenantId, executionId, {
        stepId: id,
        nodeId: previous.nodeId,
        from: previous.status,
        to: 'cancelled',
      });
    }

    const queuedJob = await this.executionQueue.getJob(executionId);

    if (queuedJob) {
      const state = await queuedJob.getState();

      if (isRemovableJobState(state)) {
        await queuedJob.remove();
      } else {
        this.logger.warn(
          `Skip removing active execution job: ${JSON.stringify({ executionId, state })}`,
        );
      }
    } else {
      const jobs = await this.executionQueue.getJobs(REMOVABLE_JOB_STATES);
      for (const job of jobs) {
        if ((job.data as ExecutionJobData).executionId === executionId) {
          await job.remove();
          break;
        }
      }
    }

    this.eventBridge.emitExecutionStatusChanged(tenantId, executionId, {
      executionId,
      status: 'cancelled',
    });

    // 中止运行中的 Agent 会话（停止 LLM 调用）。必须在请求事务提交后：
    // 否则会话结束得比 cancelled 状态落库早，执行器会把步骤推进到 completed。
    if (hasActiveTenantTransaction()) {
      registerAfterCommitHook(async () => {
        await this.executionCancellation.cancelExecution(executionId);
      });
    } else {
      await this.executionCancellation.cancelExecution(executionId);
    }

    this.logger.log(`Execution cancelled: ${JSON.stringify({ executionId })}`);

    return updated;
  }

  async initializeSteps(executionId: string): Promise<void> {
    const execution = await this.getExecutionRecord(executionId);

    await runInTenantTransaction(
      this.db,
      execution.tenantId,
      async (tenantDb) => {
        const [scopedExecution] = await tenantDb
          .select()
          .from(schema.workflowExecutions)
          .where(eq(schema.workflowExecutions.id, executionId));

        if (!scopedExecution) {
          throw new ExecutionNotFoundException(executionId);
        }

        if (TERMINAL_EXECUTION_STATUSES.has(scopedExecution.status)) {
          this.logger.warn(
            `Skip step initialization for terminal execution: ${JSON.stringify({ executionId, status: scopedExecution.status })}`,
          );
          return;
        }

        const { nodes } = scopedExecution.definitionSnapshot;
        const nodesById = new Map(nodes.map((node) => [node.id, node]));
        const existingSteps = await tenantDb
          .select()
          .from(schema.executionSteps)
          .where(eq(schema.executionSteps.executionId, executionId));
        const stepValues = nodes.map((node, index) => ({
          executionId,
          nodeId: node.id,
          stepOrder: index,
          status: 'pending' as const,
          nodeType: resolveWorkflowExecutionNodeType(node),
          nodeData: attachExecutionRuntimeMeta(node, nodesById),
        }));
        const trackedStepCount = stepValues.filter((step) =>
          isTrackedExecutionStep({ nodeData: step.nodeData }),
        ).length;

        const shouldCompleteImmediately = trackedStepCount === 0;

        if (scopedExecution.status === 'pending') {
          const [preparedExecution] = await tenantDb
            .update(schema.workflowExecutions)
            .set({
              status: shouldCompleteImmediately ? 'completed' : 'running',
              totalSteps: trackedStepCount,
              startedAt: new Date(),
              ...(shouldCompleteImmediately ? { completedAt: new Date() } : {}),
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(schema.workflowExecutions.id, executionId),
                eq(schema.workflowExecutions.status, 'pending'),
              ),
            )
            .returning({ status: schema.workflowExecutions.status });

          if (!preparedExecution) {
            const [latestExecution] = await tenantDb
              .select({ status: schema.workflowExecutions.status })
              .from(schema.workflowExecutions)
              .where(eq(schema.workflowExecutions.id, executionId));

            this.logger.warn(
              `Skip step initialization after concurrent status change: ${JSON.stringify({ executionId, status: latestExecution?.status ?? 'unknown' })}`,
            );
            return;
          }
        } else if (!['running', 'paused'].includes(scopedExecution.status)) {
          this.logger.warn(
            `Skip step initialization for unsupported execution status: ${JSON.stringify({ executionId, status: scopedExecution.status })}`,
          );
          return;
        }

        if (stepValues.length > 0 && existingSteps.length === 0) {
          await tenantDb.insert(schema.executionSteps).values(stepValues);
        }

        this.logger.log(
          `Execution prepared: ${JSON.stringify({ executionId, totalSteps: trackedStepCount, actualStepRows: stepValues.length, existingSteps: existingSteps.length, status: shouldCompleteImmediately ? 'completed' : 'running' })}`,
        );

        if (shouldCompleteImmediately) {
          this.eventBridge.emitExecutionStatusChanged(
            scopedExecution.tenantId,
            executionId,
            { executionId, status: 'completed', totalSteps: 0 },
          );
        }
      },
    );
  }

  async markFailed(executionId: string, error: Error): Promise<void> {
    const [execution] = await this.db
      .select({ tenantId: schema.workflowExecutions.tenantId })
      .from(schema.workflowExecutions)
      .where(eq(schema.workflowExecutions.id, executionId));

    if (!execution) {
      this.logger.warn(
        `Skip failure update for missing execution: ${JSON.stringify({ executionId })}`,
      );
      return;
    }

    await runInTenantTransaction(
      this.db,
      execution.tenantId,
      async (tenantDb) => {
        const [updatedExecution] = await tenantDb
          .update(schema.workflowExecutions)
          .set({
            status: 'failed',
            failedAt: new Date(),
            // 堆栈只写服务端日志，errorMessage 会原样返回给客户端
            errorMessage: {
              message: error.message,
            },
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.workflowExecutions.id, executionId),
              inArray(schema.workflowExecutions.status, [
                'pending',
                'running',
                'paused',
              ]),
            ),
          )
          .returning({ id: schema.workflowExecutions.id });

        if (!updatedExecution) {
          const [currentExecution] = await tenantDb
            .select({ status: schema.workflowExecutions.status })
            .from(schema.workflowExecutions)
            .where(eq(schema.workflowExecutions.id, executionId));

          this.logger.warn(
            `Skip failure update for terminal execution: ${JSON.stringify({ executionId, status: currentExecution?.status ?? 'unknown' })}`,
          );
          return;
        }

        this.eventBridge.emitExecutionStatusChanged(
          execution.tenantId,
          executionId,
          { executionId, status: 'failed', errorMessage: error.message },
        );
      },
    );

    this.logger.error(
      `Execution failed: ${JSON.stringify({ executionId, error: error.message })}`,
      error.stack,
    );
  }

  private async getExecutionRecord(
    executionId: string,
  ): Promise<schema.WorkflowExecution> {
    const [execution] = await this.db
      .select()
      .from(schema.workflowExecutions)
      .where(eq(schema.workflowExecutions.id, executionId));

    if (!execution) {
      throw new ExecutionNotFoundException(executionId);
    }

    return execution;
  }

  // ──── Dead Letter Queue (DLQ) ────

  async getDeadLetterJobs(tenantId: string, page = 1, limit = 20) {
    const counts = await this.agentTaskQueue.getJobCounts('failed');
    const failedCount = counts.failed;

    if (failedCount === 0) {
      return {
        data: [],
        meta: {
          total: 0,
          page,
          limit,
          totalPages: 0,
        },
      };
    }

    const jobs = await this.agentTaskQueue.getFailed(0, failedCount - 1);
    const tenantJobs = jobs.filter(
      (job) => this.getDeadLetterJobTenantId(job) === tenantId,
    );
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedJobs = tenantJobs.slice(start, end);

    return {
      data: paginatedJobs.map((job) => ({
        jobId: job.id,
        name: job.name,
        data: job.data,
        failedReason: job.failedReason,
        attemptsMade: job.attemptsMade,
        timestamp: job.timestamp,
        finishedOn: job.finishedOn,
        processedOn: job.processedOn,
      })),
      meta: {
        total: tenantJobs.length,
        page,
        limit,
        totalPages: Math.ceil(tenantJobs.length / limit),
      },
    };
  }

  async retryDeadLetterJob(tenantId: string, jobId: string): Promise<void> {
    const job = await this.agentTaskQueue.getJob(jobId);
    this.assertDeadLetterJobAccess(job, tenantId, jobId);
    await job.retry();
    this.logger.log(`DLQ job retried: ${jobId}`);
  }

  async discardDeadLetterJob(tenantId: string, jobId: string): Promise<void> {
    const job = await this.agentTaskQueue.getJob(jobId);
    this.assertDeadLetterJobAccess(job, tenantId, jobId);
    await job.remove();
    this.logger.log(`DLQ job discarded: ${jobId}`);
  }

  private getDeadLetterJobTenantId(
    job:
      | {
          data?: unknown;
        }
      | null
      | undefined,
  ): string | undefined {
    const data = job?.data;

    if (!this.hasTenantIdField(data) || typeof data.tenantId !== 'string') {
      return undefined;
    }

    return data.tenantId;
  }

  private hasTenantIdField(data: unknown): data is { tenantId?: unknown } {
    return typeof data === 'object' && data !== null && 'tenantId' in data;
  }

  private assertDeadLetterJobAccess(
    job: Job<unknown, unknown, string> | null | undefined,
    tenantId: string,
    jobId: string,
  ): asserts job is Job<AgentTaskJobData> {
    if (!job || this.getDeadLetterJobTenantId(job) !== tenantId) {
      throw new DeadLetterJobNotFoundException(jobId);
    }
  }
}
