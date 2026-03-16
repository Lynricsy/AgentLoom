import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { and, count, desc, eq } from 'drizzle-orm';

import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import {
  agentExecutionRecords,
  executionSteps,
  type ExecutionStep,
  type ExecutionStepAttemptError,
  type ExecutionSummaryData,
  type ExecutionStepErrorMessage,
  type StepTelemetryData,
} from '../../database/schema';
import type { ToolCallEvent } from '../agent/types/tool-call-event.types';
import {
  ExecutionEventName,
  type ExecutionStatusChangedPayload,
  type StepStatusChangedPayload,
} from '../execution/types/execution-event.types';
import type { QueryExecutionRecordsInput } from './dto/execution-record.dto';
import { sanitizeTelemetryData } from './utils/sanitize';

interface StepStatusChangedEvent extends StepStatusChangedPayload {
  tenantId: string;
  executionId: string;
}

interface ExecutionStatusChangedEvent extends ExecutionStatusChangedPayload {
  tenantId: string;
}

@Injectable()
export class ExecutionRecordService {
  private readonly logger = new Logger(ExecutionRecordService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  @OnEvent(ExecutionEventName.STEP_STATUS_CHANGED)
  async handleStepStatusChanged(
    payload: StepStatusChangedEvent,
  ): Promise<void> {
    if (payload.to !== 'completed' && payload.to !== 'failed') {
      return;
    }

    try {
      await runInTenantTransaction(this.db, payload.tenantId, async (tenantDb) => {
        const [step] = await tenantDb
          .select()
          .from(executionSteps)
          .where(eq(executionSteps.id, payload.stepId))
          .limit(1);

        if (!step) {
          this.logger.warn(
            `Step ${payload.stepId} not found for telemetry recording`,
          );
          return;
        }

        const telemetryData = this.extractStepTelemetry(step, payload);
        const sanitizedData = sanitizeTelemetryData(telemetryData);

        await tenantDb.insert(agentExecutionRecords).values({
          executionId: payload.executionId,
          stepId: payload.stepId,
          nodeId: payload.nodeId,
          recordType: 'step_telemetry',
          data: sanitizedData,
        });
      });
    } catch (error) {
      this.logger.warn(
        `Failed to record step telemetry for step ${payload.stepId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  @OnEvent(ExecutionEventName.EXECUTION_STATUS_CHANGED)
  async handleExecutionStatusChanged(
    payload: ExecutionStatusChangedEvent,
  ): Promise<void> {
    if (payload.status !== 'completed' && payload.status !== 'failed') {
      return;
    }

    try {
      await runInTenantTransaction(this.db, payload.tenantId, async (tenantDb) => {
        const summaryData = await this.buildExecutionSummary(
          tenantDb,
          payload.executionId,
        );

        await tenantDb.insert(agentExecutionRecords).values({
          executionId: payload.executionId,
          recordType: 'execution_summary',
          data: summaryData,
        });
      });
    } catch (error) {
      this.logger.warn(
        `Failed to record execution summary for ${payload.executionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async findByExecution(tenantId: string, query: QueryExecutionRecordsInput) {
    void tenantId;

    const tenantDb = getTenantDb(this.db);
    const conditions = [
      eq(agentExecutionRecords.executionId, query.executionId),
    ];

    if (query.stepId) {
      conditions.push(eq(agentExecutionRecords.stepId, query.stepId));
    }

    if (query.recordType) {
      conditions.push(eq(agentExecutionRecords.recordType, query.recordType));
    }

    const whereClause = and(...conditions);

    const [records, [{ total }]] = await Promise.all([
      tenantDb
        .select()
        .from(agentExecutionRecords)
        .where(whereClause)
        .orderBy(desc(agentExecutionRecords.createdAt))
        .limit(query.limit)
        .offset(query.offset),
      tenantDb
        .select({ total: count() })
        .from(agentExecutionRecords)
        .where(whereClause),
    ]);

    return {
      data: records.map((record) => ({
        ...record,
        createdAt: this.toIsoString(record.createdAt),
      })),
      meta: {
        total,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + query.limit < total,
      },
    };
  }

  private extractStepTelemetry(
    step: ExecutionStep,
    payload: Pick<
      StepStatusChangedEvent,
      'nodeId' | 'stepId' | 'to' | 'errorDetail'
    >,
  ): StepTelemetryData {
    const checkpointData = (step.checkpointData ?? {}) as {
      toolCalls?: unknown;
      attempts?: unknown;
    };
    const result = step.result ?? null;
    const toolCalls = this.extractToolCalls(checkpointData.toolCalls);
    const attempts = this.extractAttempts(checkpointData.attempts);

    const errors: StepTelemetryData['errors'] = [];
    if (payload.to === 'failed') {
      errors.push({
        errorType: this.resolveErrorType(step.errorMessage),
        errorMessage: this.resolveErrorMessage(step.errorMessage, payload.errorDetail),
        timestamp: new Date().toISOString(),
        nodeId: payload.nodeId,
        stepId: payload.stepId,
      });
    }

    const selfRepairs: StepTelemetryData['selfRepairs'] = [];
    if (attempts.length > 1) {
      selfRepairs.push({
        originalOutput: attempts[0]?.error ?? null,
        validationError: 'Retry after failure',
        repairAttempts: attempts.slice(1).map((attempt) => ({
          attemptNumber: attempt.attempt,
          result: attempt.error,
          success: payload.to === 'completed' && attempt === attempts[attempts.length - 1],
        })),
      });
    }

    return {
      toolCalls,
      errors,
      selfRepairs,
      ioSnapshots: {
        stepInput: step.input ?? null,
        stepOutput: result,
      },
      llmInteractions: {
        modelId: this.readString(result, 'modelId'),
        promptTokens: this.readNumber(result, 'promptTokens'),
        completionTokens: this.readNumber(result, 'completionTokens'),
        totalTokens: this.readNumber(result, 'totalTokens'),
        latencyMs:
          step.startedAt && step.completedAt
            ? step.completedAt.getTime() - step.startedAt.getTime()
            : 0,
      },
    };
  }

  private async buildExecutionSummary(
    tenantDb: DrizzleDB,
    executionId: string,
  ): Promise<ExecutionSummaryData> {
    const [records, steps] = await Promise.all([
      tenantDb
        .select()
        .from(agentExecutionRecords)
        .where(
          and(
            eq(agentExecutionRecords.executionId, executionId),
            eq(agentExecutionRecords.recordType, 'step_telemetry'),
          ),
        ),
      tenantDb
        .select()
        .from(executionSteps)
        .where(eq(executionSteps.executionId, executionId)),
    ]);

    let totalToolCalls = 0;
    let totalErrors = 0;
    let totalSelfRepairs = 0;
    let totalTokens = 0;
    let totalLatencyMs = 0;

    for (const record of records) {
      const data = record.data as StepTelemetryData;
      totalToolCalls += data.toolCalls.length;
      totalErrors += data.errors.length;
      totalSelfRepairs += data.selfRepairs.length;
      totalTokens += data.llmInteractions.totalTokens;
      totalLatencyMs += data.llmInteractions.latencyMs;
    }

    const completedSteps = steps.filter((step) => step.status === 'completed').length;
    const failedSteps = steps.filter((step) => step.status === 'failed').length;

    const stepTimes = steps
      .filter((step) => step.startedAt && step.completedAt)
      .map((step) => ({
        start: step.startedAt!.getTime(),
        end: step.completedAt!.getTime(),
      }));

    const executionDurationMs =
      stepTimes.length > 0
        ? Math.max(...stepTimes.map((time) => time.end)) -
          Math.min(...stepTimes.map((time) => time.start))
        : 0;

    return {
      totalSteps: steps.length,
      completedSteps,
      failedSteps,
      totalToolCalls,
      totalErrors,
      totalSelfRepairs,
      totalTokens,
      totalLatencyMs,
      avgStepLatencyMs:
        records.length > 0 ? Math.round(totalLatencyMs / records.length) : 0,
      executionDurationMs,
    };
  }

  private extractToolCalls(toolCalls: unknown): StepTelemetryData['toolCalls'] {
    if (!Array.isArray(toolCalls)) {
      return [];
    }

    return toolCalls
      .filter((toolCall): toolCall is ToolCallEvent => this.isToolCallEvent(toolCall))
      .map((toolCall) => ({
        toolName: toolCall.tool,
        input: toolCall.args,
        output: toolCall.result ?? toolCall.error ?? null,
        durationMs: this.resolveToolCallDurationMs(toolCall),
        status: toolCall.status,
      }));
  }

  private extractAttempts(attempts: unknown): ExecutionStepAttemptError[] {
    if (!Array.isArray(attempts)) {
      return [];
    }

    return attempts.filter(
      (attempt): attempt is ExecutionStepAttemptError =>
        typeof attempt === 'object' &&
        attempt !== null &&
        typeof attempt.attempt === 'number' &&
        typeof attempt.error === 'string' &&
        typeof attempt.timestamp === 'string',
    );
  }

  private isToolCallEvent(toolCall: unknown): toolCall is ToolCallEvent {
    if (typeof toolCall !== 'object' || toolCall === null) {
      return false;
    }

    const candidate = toolCall as Record<string, unknown>;

    return (
      typeof candidate['id'] === 'string' &&
      typeof candidate['tool'] === 'string' &&
      typeof candidate['args'] === 'object' &&
      candidate['args'] !== null &&
      typeof candidate['status'] === 'string'
    );
  }

  private resolveToolCallDurationMs(toolCall: ToolCallEvent): number {
    if (!toolCall.transitions || toolCall.transitions.length === 0) {
      return 0;
    }

    const startTransition =
      toolCall.transitions.find((transition) => transition.to === 'in_progress') ??
      toolCall.transitions[0];
    const endTransition =
      [...toolCall.transitions]
        .reverse()
        .find(
          (transition) =>
            transition.to === 'completed' ||
            transition.to === 'failed' ||
            transition.to === 'denied',
        ) ?? toolCall.transitions[toolCall.transitions.length - 1];

    const durationMs =
      new Date(endTransition.timestamp).getTime() -
      new Date(startTransition.timestamp).getTime();

    return Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0;
  }

  private resolveErrorType(
    errorMessage: ExecutionStepErrorMessage | null,
  ): string {
    return errorMessage?.type ?? 'unknown';
  }

  private resolveErrorMessage(
    errorMessage: ExecutionStepErrorMessage | null,
    errorDetail?: StepStatusChangedPayload['errorDetail'],
  ): string {
    return (
      errorMessage?.message ??
      errorMessage?.detail ??
      errorDetail?.message ??
      errorDetail?.detail ??
      'Unknown error'
    );
  }

  private readString(
    value: Record<string, unknown> | null,
    key: string,
  ): string {
    const candidate = value?.[key];
    return typeof candidate === 'string' ? candidate : '';
  }

  private readNumber(
    value: Record<string, unknown> | null,
    key: string,
  ): number {
    const candidate = value?.[key];
    return typeof candidate === 'number' ? candidate : 0;
  }

  private toIsoString(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  }
}
