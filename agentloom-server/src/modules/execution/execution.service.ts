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
import { ResourceGovernanceService } from '../resource-governance/resource-governance.service';
import { ResourceGovernanceDecisionBlockedException } from '../resource-governance/resource-governance.exceptions';
import {
  EXECUTION_QUEUE,
  AGENT_TASK_QUEUE,
  type AgentTaskJobData,
} from './execution.constants';
import type { InternalRunWorkflowRequest } from './dto/run-workflow.dto';
import { SYSTEM_TRIGGER_USER_ID } from '../trigger/trigger.constants';
import {
  workflowInputSchemaSchema,
  type CollectionMode,
  type InputFieldDefinition,
  type WorkflowInputSchema,
} from '../workflow/dto/workflow-input-schema.dto';

export interface ExecutionJobData {
  executionId: string;
  tenantId: string;
}

const CANCELLABLE_STATUSES = new Set(['pending', 'running', 'paused']);
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
      const inputSandboxId = readSandboxSessionId(step.input.sandbox);
      if (inputSandboxId) {
        sessionIds.add(inputSandboxId);
      }

      const inputSandboxOutputId = readSandboxSessionId(
        step.input['sandbox-output'],
      );
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

    const resultSandboxOutputId = readSandboxSessionId(
      step.result['sandbox-output'],
    );
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
      step.input.sandbox,
      statusBySessionId,
    );
    const nextSandboxOutput = patchSandboxReferenceStatus(
      step.input['sandbox-output'],
      statusBySessionId,
    );

    if (
      nextSandbox !== step.input.sandbox ||
      nextSandboxOutput !== step.input['sandbox-output']
    ) {
      nextInput = {
        ...step.input,
        ...(nextSandbox !== step.input.sandbox ? { sandbox: nextSandbox } : {}),
        ...(nextSandboxOutput !== step.input['sandbox-output']
          ? { 'sandbox-output': nextSandboxOutput }
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
      step.result['sandbox-output'],
      statusBySessionId,
    );

    if (
      nextRootResult !== step.result ||
      nextSandboxOutput !== step.result['sandbox-output']
    ) {
      nextResult = {
        ...(isRecord(nextRootResult) ? nextRootResult : step.result),
        ...(nextSandboxOutput !== step.result['sandbox-output']
          ? { 'sandbox-output': nextSandboxOutput }
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

function createInputFieldError(fieldId: string, message: string): FieldError {
  return {
    field: `inputParams.${fieldId}`,
    message,
  };
}

function isEmptyInputValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

function shouldNormalizeLaunchInput(
  workflowInputSchema: WorkflowInputSchema | null | undefined,
  runRequest: InternalRunWorkflowRequest | undefined,
): boolean {
  return workflowInputSchema != null || runRequest?.schemaVersion !== undefined;
}

function shouldRequireSchemaVersion(
  runRequest: InternalRunWorkflowRequest | undefined,
): boolean {
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

function validateResolvedFieldValue(
  field: InputFieldDefinition,
  value: unknown,
  errors: FieldError[],
): unknown {
  if (isEmptyInputValue(value)) {
    if (field.required) {
      errors.push(createInputFieldError(field.id, '该字段为必填项'));
    }

    return undefined;
  }

  switch (field.type) {
    case 'text': {
      if (typeof value !== 'string') {
        errors.push(createInputFieldError(field.id, '该字段必须是字符串'));
        return undefined;
      }

      if (
        field.validation?.minLength !== undefined &&
        value.length < field.validation.minLength
      ) {
        errors.push(
          createInputFieldError(
            field.id,
            `长度不能少于 ${field.validation.minLength} 个字符`,
          ),
        );
      }

      if (
        field.validation?.maxLength !== undefined &&
        value.length > field.validation.maxLength
      ) {
        errors.push(
          createInputFieldError(
            field.id,
            `长度不能超过 ${field.validation.maxLength} 个字符`,
          ),
        );
      }

      return value;
    }
    case 'number': {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        errors.push(createInputFieldError(field.id, '该字段必须是数字'));
        return undefined;
      }

      if (field.validation?.min !== undefined && value < field.validation.min) {
        errors.push(
          createInputFieldError(
            field.id,
            `数值不能小于 ${field.validation.min}`,
          ),
        );
      }

      if (field.validation?.max !== undefined && value > field.validation.max) {
        errors.push(
          createInputFieldError(
            field.id,
            `数值不能大于 ${field.validation.max}`,
          ),
        );
      }

      return value;
    }
    case 'single_select': {
      if (typeof value !== 'string') {
        errors.push(createInputFieldError(field.id, '该字段必须是字符串选项'));
        return undefined;
      }

      if (field.options && !field.options.includes(value)) {
        errors.push(
          createInputFieldError(field.id, '该字段必须是预定义选项之一'),
        );
      }

      return value;
    }
    case 'multi_select': {
      if (!Array.isArray(value)) {
        errors.push(createInputFieldError(field.id, '该字段必须是字符串数组'));
        return undefined;
      }

      if (value.some((item) => typeof item !== 'string')) {
        errors.push(createInputFieldError(field.id, '该字段必须是字符串数组'));
        return undefined;
      }

      if (
        field.options &&
        value.some((item) => !field.options?.includes(item))
      ) {
        errors.push(createInputFieldError(field.id, '该字段包含未定义的选项'));
      }

      return value;
    }
  }
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

  const fieldMap = new Map(
    workflowInputSchema.fields.map((field) => [field.id, field]),
  );
  const errors: FieldError[] = [];

  Object.keys(rawInputParams).forEach((fieldId) => {
    if (!fieldMap.has(fieldId)) {
      errors.push(
        createInputFieldError(fieldId, '该字段不存在于当前输入契约中'),
      );
    }
  });

  if (errors.length > 0) {
    throw new WorkflowLaunchInputValidationException(errors);
  }

  const fieldStateCache = new Map<
    string,
    { visible: boolean; value: unknown }
  >();

  const resolveFieldState = (
    fieldId: string,
    path = new Set<string>(),
  ): { visible: boolean; value: unknown } => {
    const cachedState = fieldStateCache.get(fieldId);
    if (cachedState) {
      return cachedState;
    }

    const field = fieldMap.get(fieldId);
    if (!field) {
      return { visible: false, value: undefined };
    }

    if (path.has(fieldId)) {
      return { visible: false, value: undefined };
    }

    let visible = true;
    if (field.visibility) {
      const nextPath = new Set(path);
      nextPath.add(fieldId);

      const controllerState = resolveFieldState(
        field.visibility.fieldId,
        nextPath,
      );
      visible =
        controllerState.visible &&
        controllerState.value === field.visibility.equals;
    }

    const state = {
      visible,
      value: visible
        ? Object.prototype.hasOwnProperty.call(rawInputParams, field.id)
          ? rawInputParams[field.id]
          : field.default
        : undefined,
    };

    fieldStateCache.set(fieldId, state);
    return state;
  };

  const resolvedInputs: Record<string, unknown> = {};
  const unresolvedFieldIds: string[] = [];

  workflowInputSchema.fields.forEach((field) => {
    const fieldState = resolveFieldState(field.id);

    if (!fieldState.visible) {
      unresolvedFieldIds.push(field.id);
      return;
    }

    const resolvedValue = validateResolvedFieldValue(
      field,
      fieldState.value,
      errors,
    );
    if (resolvedValue !== undefined) {
      resolvedInputs[field.id] = resolvedValue;
    }
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

  const meta: Record<string, unknown> = {
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
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
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
    const [workflow] = await this.tenantDb
      .select()
      .from(schema.workflowDefinitions)
      .where(eq(schema.workflowDefinitions.id, workflowId));

    if (workflow?.status === 'archived') {
      throw new WorkflowArchivedException(workflowId);
    }

    if (
      !workflow ||
      workflow.status !== 'published' ||
      !workflow.publishedVersionId
    ) {
      throw new WorkflowNotPublishedException(workflowId);
    }

    const workflowInputSchema = workflow.inputSchema
      ? workflowInputSchemaSchema.parse(workflow.inputSchema)
      : createDefaultWorkflowInputSchema();

    const inputParams = shouldNormalizeLaunchInput(
      workflow.inputSchema,
      runRequest,
    )
      ? buildNormalizedExecutionInputParams(
          workflowId,
          runRequest,
          workflowInputSchema,
        )
      : buildExecutionInputParams(runRequest);

    const [publishedVersion] = await this.tenantDb
      .select()
      .from(schema.workflowVersions)
      .where(eq(schema.workflowVersions.id, workflow.publishedVersionId));

    const admissionDecision =
      await this.resourceGovernanceService.resolveExecutionAdmissionDecision({
        tenantId,
        workflowId,
        dbClient: this.tenantDb,
      });

    if (admissionDecision) {
      await this.resourceGovernanceService.recordBlockedDecision({
        tenantId,
        actorId: userId,
        actorType: 'user',
        block: admissionDecision,
      });
      throw new ResourceGovernanceDecisionBlockedException(admissionDecision);
    }

    const [execution] = await this.tenantDb
      .insert(schema.workflowExecutions)
      .values({
        workflowDefinitionId: workflowId,
        workflowVersionId: workflow.publishedVersionId,
        tenantId,
        status: 'pending',
        triggerType: runRequest?.triggerType ?? 'manual',
        inputParams,
        definitionSnapshot: publishedVersion.snapshot,
        createdBy:
          userId === SYSTEM_TRIGGER_USER_ID ? workflow.createdBy : userId,
      })
      .returning();

    if (hasActiveTenantTransaction()) {
      registerAfterCommitHook(async () => {
        await this.enqueueExecutionJob(execution.id, tenantId);
      });
    } else {
      await this.enqueueExecutionJob(execution.id, tenantId);
    }

    this.logger.log(
      `Workflow execution created: ${JSON.stringify({ executionId: execution.id, workflowId })}`,
    );

    return execution;
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

  async listExecutions(
    workflowId: string,
    page: number,
    limit: number,
    status?: string,
  ) {
    const conditions = [
      eq(schema.workflowExecutions.workflowDefinitionId, workflowId),
    ];

    if (status) {
      conditions.push(
        eq(
          schema.workflowExecutions.status,
          status as schema.WorkflowExecution['status'],
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

    await this.tenantDb
      .update(schema.executionSteps)
      .set({
        status: 'cancelled',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.executionSteps.executionId, executionId),
          inArray(schema.executionSteps.status, ['pending', 'queued']),
        ),
      );

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
          nodeData: node.data ?? null,
        }));

        const shouldCompleteImmediately = stepValues.length === 0;

        if (scopedExecution.status === 'pending') {
          const [preparedExecution] = await tenantDb
            .update(schema.workflowExecutions)
            .set({
              status: shouldCompleteImmediately ? 'completed' : 'running',
              totalSteps: stepValues.length,
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
          `Execution prepared: ${JSON.stringify({ executionId, totalSteps: stepValues.length, existingSteps: existingSteps.length, status: shouldCompleteImmediately ? 'completed' : 'running' })}`,
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
            errorMessage: {
              message: error.message,
              stack: error.stack,
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
