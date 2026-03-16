import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { EVENT_LISTENER_METADATA } from '@nestjs/event-emitter/dist/constants';
import { PgDialect } from 'drizzle-orm/pg-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DRIZZLE } from '../../database/database.module';
import type {
  ExecutionStep,
  ExecutionSummaryData,
  StepTelemetryData,
} from '../../database/schema';
import { QueryExecutionRecordsSchema } from './dto/execution-record.dto';
import { ExecutionRecordService } from './execution-record.service';
import { ExecutionEventName } from '../execution/types/execution-event.types';

type MockSelectTerminal = 'where' | 'limit' | 'offset';

function createSelectChain<T>(terminal: MockSelectTerminal, result: T) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    offset: vi.fn(),
  };

  chain.from.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);

  if (terminal === 'where') {
    chain.where.mockResolvedValue(result);
  } else {
    chain.where.mockReturnValue(chain);
  }

  if (terminal === 'limit') {
    chain.limit.mockResolvedValue(result);
  } else {
    chain.limit.mockReturnValue(chain);
  }

  if (terminal === 'offset') {
    chain.offset.mockResolvedValue(result);
  } else {
    chain.offset.mockReturnValue(chain);
  }

  return chain;
}

function createMockDb() {
  const insertValues: Array<Record<string, unknown>> = [];
  const values = vi.fn().mockImplementation((value: Record<string, unknown>) => {
    insertValues.push(value);
    return Promise.resolve([{ id: 'mock-record-id' }]);
  });
  const insert = vi.fn().mockReturnValue({ values });
  const select = vi.fn();

  return {
    select,
    insert,
    values,
    insertValues,
    queueSelectResult<T>(terminal: MockSelectTerminal, result: T) {
      const chain = createSelectChain(terminal, result);
      select.mockReturnValueOnce(chain);
      return chain;
    },
  };
}

const mocks = vi.hoisted(() => ({
  getTenantDb: vi.fn(),
  runInTenantTransaction: vi.fn(),
}));

vi.mock('../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: mocks.getTenantDb,
}));

vi.mock('../../common/interceptors/tenant-transaction.context', () => ({
  runInTenantTransaction: mocks.runInTenantTransaction,
}));

const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';
const EXECUTION_ID = '550e8400-e29b-41d4-a716-446655440001';
const STEP_ID = '550e8400-e29b-41d4-a716-446655440002';
const STEP_ID_TWO = '550e8400-e29b-41d4-a716-446655440003';
const STEP_ID_THREE = '550e8400-e29b-41d4-a716-446655440004';
const NODE_ID = 'node-execution-record';
const NOW = new Date('2026-03-16T10:00:00.000Z');

type MockDb = ReturnType<typeof createMockDb>;

function createStep(
  overrides: Partial<ExecutionStep> = {},
): ExecutionStep {
  return {
    id: STEP_ID,
    executionId: EXECUTION_ID,
    nodeId: NODE_ID,
    stepOrder: 1,
    status: 'completed',
    nodeType: 'llm-agent',
    nodeData: { label: '测试节点' },
    input: null,
    result: null,
    attemptCount: 0,
    checkpointData: null,
    errorMessage: null,
    isEncrypted: false,
    startedAt: null,
    completedAt: null,
    createdAt: new Date('2026-03-16T09:59:00.000Z'),
    updatedAt: new Date('2026-03-16T09:59:00.000Z'),
    ...overrides,
  };
}

function createStepPayload(
  overrides: Record<string, unknown> = {},
) {
  return {
    tenantId: TENANT_ID,
    executionId: EXECUTION_ID,
    stepId: STEP_ID,
    nodeId: NODE_ID,
    from: 'running',
    to: 'completed',
    ...overrides,
  };
}

function createExecutionStatusPayload(
  overrides: Record<string, unknown> = {},
) {
  return {
    tenantId: TENANT_ID,
    executionId: EXECUTION_ID,
    status: 'completed',
    ...overrides,
  };
}

function getHandler(
  name: 'handleStepStatusChanged' | 'handleExecutionStatusChanged',
): object {
  const descriptor = Object.getOwnPropertyDescriptor(
    ExecutionRecordService.prototype,
    name,
  );

  if (typeof descriptor?.value !== 'function') {
    throw new Error(`Handler ${name} is not defined on ExecutionRecordService`);
  }

  return descriptor.value as object;
}

function renderSql(sql: Parameters<PgDialect['sqlToQuery']>[0]): string {
  return new PgDialect().sqlToQuery(sql).sql;
}

describe('ExecutionRecordService', () => {
  let moduleRef: TestingModule;
  let service: ExecutionRecordService;
  let tenantDb: MockDb;
  let rootDb: Record<string, unknown>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    tenantDb = createMockDb();
    rootDb = { label: 'root-db' };

    mocks.getTenantDb.mockReset();
    mocks.runInTenantTransaction.mockReset();
    mocks.getTenantDb.mockReturnValue(tenantDb);
    mocks.runInTenantTransaction.mockImplementation(
      async (
        _db: unknown,
        _tenantId: string,
        operation: (db: MockDb) => Promise<unknown>,
      ) => operation(tenantDb),
    );

    warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    moduleRef = await Test.createTestingModule({
      providers: [
        ExecutionRecordService,
        {
          provide: DRIZZLE,
          useValue: rootDb,
        },
      ],
    }).compile();

    service = moduleRef.get(ExecutionRecordService);
  });

  afterEach(async () => {
    warnSpy.mockRestore();
    vi.useRealTimers();
    await moduleRef.close();
  });

  it('should register OnEvent metadata for step and execution handlers', () => {
    const stepHandlerMetadata = Reflect.getMetadata(
      EVENT_LISTENER_METADATA,
      getHandler('handleStepStatusChanged'),
    );
    const executionHandlerMetadata = Reflect.getMetadata(
      EVENT_LISTENER_METADATA,
      getHandler('handleExecutionStatusChanged'),
    );

    expect(stepHandlerMetadata).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: ExecutionEventName.STEP_STATUS_CHANGED,
        }),
      ]),
    );
    expect(executionHandlerMetadata).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: ExecutionEventName.EXECUTION_STATUS_CHANGED,
        }),
      ]),
    );
  });

  it('should ignore non-terminal step statuses', async () => {
    await service.handleStepStatusChanged(
      createStepPayload({ to: 'running' }),
    );

    expect(mocks.runInTenantTransaction).not.toHaveBeenCalled();
    expect(tenantDb.insert).not.toHaveBeenCalled();
  });

  it('should record completed step telemetry with extracted tool calls, repairs, io snapshots and llm metrics', async () => {
    tenantDb.queueSelectResult('limit', [
      createStep({
        input: {
          prompt: '生成摘要',
          apiKey: 'secret-api-key',
        },
        result: {
          modelId: 'gpt-4o-mini',
          promptTokens: 12,
          completionTokens: 8,
          totalTokens: 20,
          privateKey: '-----BEGIN PRIVATE KEY-----',
          content: '完成',
        },
        checkpointData: {
          toolCalls: [
            {
              id: 'tool-call-1',
              tool: 'search_docs',
              args: {
                query: 'workflow execution record',
                apiKey: 'tool-api-key',
              },
              status: 'completed',
              result: {
                content: 'done',
                accessKey: 'tool-access-key',
              },
              transitions: [
                {
                  to: 'pending',
                  timestamp: '2026-03-16T09:00:00.000Z',
                  source: 'runtime',
                },
                {
                  to: 'in_progress',
                  timestamp: '2026-03-16T09:00:01.000Z',
                  source: 'runtime',
                },
                {
                  to: 'completed',
                  timestamp: '2026-03-16T09:00:04.500Z',
                  source: 'runtime',
                },
              ],
            },
            {
              id: 'tool-call-2',
              tool: 'approval_gate',
              args: {
                authorizationHeader: 'Bearer token-value',
              },
              status: 'awaiting_permission',
              transitions: [
                {
                  to: 'pending',
                  timestamp: '2026-03-16T09:00:10.000Z',
                  source: 'runtime',
                },
                {
                  to: 'awaiting_permission',
                  timestamp: '2026-03-16T09:00:12.000Z',
                  source: 'user',
                },
              ],
            },
            {
              id: 'tool-call-3',
              tool: 'fallback_tool',
              args: {
                prompt: 'just fail',
              },
              status: 'failed',
              error: 'permission denied',
            },
            {
              id: 'invalid-tool-call',
              tool: 'broken',
              args: null,
              status: 'completed',
            },
          ],
          attempts: [
            {
              attempt: 1,
              error: '初次校验失败',
              timestamp: '2026-03-16T09:00:00.000Z',
            },
            {
              attempt: 2,
              error: '修复后通过',
              timestamp: '2026-03-16T09:00:02.000Z',
            },
            {
              attempt: 'invalid',
              error: 123,
              timestamp: null,
            },
          ],
        },
        startedAt: new Date('2026-03-16T09:00:00.000Z'),
        completedAt: new Date('2026-03-16T09:00:05.000Z'),
      }),
    ]);

    await service.handleStepStatusChanged(createStepPayload());

    expect(mocks.runInTenantTransaction).toHaveBeenCalledWith(
      rootDb,
      TENANT_ID,
      expect.any(Function),
    );
    expect(tenantDb.insert).toHaveBeenCalledTimes(1);

    const [insertedRecord] = tenantDb.insertValues;
    const telemetry = insertedRecord['data'] as StepTelemetryData;

    expect(insertedRecord).toMatchObject({
      executionId: EXECUTION_ID,
      stepId: STEP_ID,
      nodeId: NODE_ID,
      recordType: 'step_telemetry',
    });
    expect(telemetry.toolCalls).toEqual([
      {
        toolName: 'search_docs',
        input: {
          query: 'workflow execution record',
          apiKey: '[REDACTED]',
        },
        output: {
          content: 'done',
          accessKey: '[REDACTED]',
        },
        durationMs: 3500,
        status: 'completed',
      },
      {
        toolName: 'approval_gate',
        input: {
          authorizationHeader: '[REDACTED]',
        },
        output: null,
        durationMs: 2000,
        status: 'awaiting_permission',
      },
      {
        toolName: 'fallback_tool',
        input: {
          prompt: 'just fail',
        },
        output: 'permission denied',
        durationMs: 0,
        status: 'failed',
      },
    ]);
    expect(telemetry.errors).toEqual([]);
    expect(telemetry.selfRepairs).toEqual([
      {
        originalOutput: '初次校验失败',
        validationError: 'Retry after failure',
        repairAttempts: [
          {
            attemptNumber: 2,
            result: '修复后通过',
            success: true,
          },
        ],
      },
    ]);
    expect(telemetry.ioSnapshots).toEqual({
      stepInput: {
        prompt: '生成摘要',
        apiKey: '[REDACTED]',
      },
      stepOutput: {
        modelId: 'gpt-4o-mini',
        promptTokens: '[REDACTED]',
        completionTokens: '[REDACTED]',
        totalTokens: '[REDACTED]',
        privateKey: '[REDACTED]',
        content: '完成',
      },
    });
    expect(telemetry.llmInteractions).toEqual({
      modelId: 'gpt-4o-mini',
      promptTokens: 12,
      completionTokens: 8,
      totalTokens: 20,
      latencyMs: 5000,
    });
  });

  it('should record failed step telemetry with fallback values and failed self repair attempts', async () => {
    tenantDb.queueSelectResult('limit', [
      createStep({
        status: 'failed',
        checkpointData: {
          toolCalls: 'invalid-tool-calls',
          attempts: [
            {
              attempt: 1,
              error: '首轮失败',
              timestamp: '2026-03-16T09:10:00.000Z',
            },
            {
              attempt: 2,
              error: '二次仍失败',
              timestamp: '2026-03-16T09:10:10.000Z',
            },
            {
              attempt: 3,
              error: 404,
              timestamp: false,
            },
          ],
        },
        result: {
          modelId: 123,
          promptTokens: '12',
          completionTokens: null,
        } as Record<string, unknown>,
        startedAt: new Date('2026-03-16T09:10:00.000Z'),
        completedAt: null,
      }),
    ]);

    await service.handleStepStatusChanged(
      createStepPayload({
        to: 'failed',
        errorDetail: {
          message: 'Payload failure message',
          detail: 'Payload failure detail',
        },
      }),
    );

    const [insertedRecord] = tenantDb.insertValues;
    const telemetry = insertedRecord['data'] as StepTelemetryData;

    expect(telemetry.toolCalls).toEqual([]);
    expect(telemetry.errors).toEqual([
      {
        errorType: 'unknown',
        errorMessage: 'Payload failure message',
        timestamp: NOW.toISOString(),
        nodeId: NODE_ID,
        stepId: STEP_ID,
      },
    ]);
    expect(telemetry.selfRepairs).toEqual([
      {
        originalOutput: '首轮失败',
        validationError: 'Retry after failure',
        repairAttempts: [
          {
            attemptNumber: 2,
            result: '二次仍失败',
            success: false,
          },
        ],
      },
    ]);
    expect(telemetry.ioSnapshots).toEqual({
      stepInput: null,
      stepOutput: {
        modelId: 123,
        promptTokens: '[REDACTED]',
        completionTokens: '[REDACTED]',
      },
    });
    expect(telemetry.llmInteractions).toEqual({
      modelId: '',
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      latencyMs: 0,
    });
  });

  it('should warn and skip insert when the step is not found', async () => {
    tenantDb.queueSelectResult('limit', []);

    await service.handleStepStatusChanged(createStepPayload());

    expect(tenantDb.insert).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      `Step ${STEP_ID} not found for telemetry recording`,
    );
  });

  it('should warn instead of throwing when step telemetry recording fails', async () => {
    mocks.runInTenantTransaction.mockRejectedValueOnce(new Error('step db unavailable'));

    await expect(
      service.handleStepStatusChanged(createStepPayload()),
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        `Failed to record step telemetry for step ${STEP_ID}: step db unavailable`,
      ),
    );
  });

  it('should ignore non-terminal execution statuses', async () => {
    await service.handleExecutionStatusChanged(
      createExecutionStatusPayload({ status: 'running' }),
    );

    expect(mocks.runInTenantTransaction).not.toHaveBeenCalled();
    expect(tenantDb.insert).not.toHaveBeenCalled();
  });

  it('should build and store an execution summary for completed executions', async () => {
    tenantDb.queueSelectResult('where', [
      {
        id: 'record-1',
        executionId: EXECUTION_ID,
        stepId: STEP_ID,
        nodeId: NODE_ID,
        recordType: 'step_telemetry',
        data: {
          toolCalls: [
            {
              toolName: 'tool-a',
              input: { value: 'a' },
              output: { ok: true },
              durationMs: 500,
              status: 'completed',
            },
            {
              toolName: 'tool-b',
              input: { value: 'b' },
              output: { ok: true },
              durationMs: 700,
              status: 'completed',
            },
          ],
          errors: [
            {
              errorType: 'tool_error',
              errorMessage: 'step failed once',
              timestamp: '2026-03-16T09:00:09.000Z',
              nodeId: NODE_ID,
              stepId: STEP_ID,
            },
          ],
          selfRepairs: [
            {
              originalOutput: 'needs retry',
              validationError: 'Retry after failure',
              repairAttempts: [
                {
                  attemptNumber: 2,
                  result: 'fixed',
                  success: true,
                },
              ],
            },
          ],
          ioSnapshots: { stepInput: null, stepOutput: null },
          llmInteractions: {
            modelId: 'gpt-4o-mini',
            promptTokens: 20,
            completionTokens: 30,
            totalTokens: 50,
            latencyMs: 1200,
          },
        } satisfies StepTelemetryData,
        createdAt: new Date('2026-03-16T09:15:00.000Z'),
      },
      {
        id: 'record-2',
        executionId: EXECUTION_ID,
        stepId: STEP_ID_TWO,
        nodeId: 'node-2',
        recordType: 'step_telemetry',
        data: {
          toolCalls: [
            {
              toolName: 'tool-c',
              input: { value: 'c' },
              output: { ok: true },
              durationMs: 900,
              status: 'completed',
            },
          ],
          errors: [],
          selfRepairs: [],
          ioSnapshots: { stepInput: null, stepOutput: null },
          llmInteractions: {
            modelId: 'gpt-4o-mini',
            promptTokens: 40,
            completionTokens: 60,
            totalTokens: 100,
            latencyMs: 2800,
          },
        } satisfies StepTelemetryData,
        createdAt: new Date('2026-03-16T09:16:00.000Z'),
      },
    ]);
    tenantDb.queueSelectResult('where', [
      createStep({
        id: STEP_ID,
        status: 'completed',
        startedAt: new Date('2026-03-16T09:00:00.000Z'),
        completedAt: new Date('2026-03-16T09:00:10.000Z'),
      }),
      createStep({
        id: STEP_ID_TWO,
        status: 'failed',
        startedAt: new Date('2026-03-16T09:00:05.000Z'),
        completedAt: new Date('2026-03-16T09:00:35.000Z'),
      }),
      createStep({
        id: STEP_ID_THREE,
        status: 'pending',
        startedAt: null,
        completedAt: null,
      }),
    ]);

    await service.handleExecutionStatusChanged(createExecutionStatusPayload());

    const [insertedRecord] = tenantDb.insertValues;
    const summary = insertedRecord['data'] as ExecutionSummaryData;

    expect(insertedRecord).toMatchObject({
      executionId: EXECUTION_ID,
      recordType: 'execution_summary',
    });
    expect(summary).toEqual({
      totalSteps: 3,
      completedSteps: 1,
      failedSteps: 1,
      totalToolCalls: 3,
      totalErrors: 1,
      totalSelfRepairs: 1,
      totalTokens: 150,
      totalLatencyMs: 4000,
      avgStepLatencyMs: 2000,
      executionDurationMs: 35000,
    });
  });

  it('should build zeroed summaries for failed executions without telemetry records', async () => {
    tenantDb.queueSelectResult('where', []);
    tenantDb.queueSelectResult('where', []);

    await service.handleExecutionStatusChanged(
      createExecutionStatusPayload({ status: 'failed' }),
    );

    const [insertedRecord] = tenantDb.insertValues;

    expect(insertedRecord).toMatchObject({
      executionId: EXECUTION_ID,
      recordType: 'execution_summary',
      data: {
        totalSteps: 0,
        completedSteps: 0,
        failedSteps: 0,
        totalToolCalls: 0,
        totalErrors: 0,
        totalSelfRepairs: 0,
        totalTokens: 0,
        totalLatencyMs: 0,
        avgStepLatencyMs: 0,
        executionDurationMs: 0,
      },
    });
  });

  it('should warn instead of throwing when execution summary recording fails', async () => {
    mocks.runInTenantTransaction.mockRejectedValueOnce(
      new Error('summary db unavailable'),
    );

    await expect(
      service.handleExecutionStatusChanged(createExecutionStatusPayload()),
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        `Failed to record execution summary for ${EXECUTION_ID}: summary db unavailable`,
      ),
    );
  });

  it('should return paginated execution records with stepId and recordType filters', async () => {
    const query = QueryExecutionRecordsSchema.parse({
      executionId: EXECUTION_ID,
      stepId: STEP_ID,
      recordType: 'step_telemetry',
      limit: 2,
      offset: 1,
    });
    const dataChain = tenantDb.queueSelectResult('offset', [
      {
        id: 'record-a',
        executionId: EXECUTION_ID,
        stepId: STEP_ID,
        nodeId: NODE_ID,
        recordType: 'step_telemetry',
        data: { foo: 'bar' },
        createdAt: new Date('2026-03-16T08:00:00.000Z'),
      },
      {
        id: 'record-b',
        executionId: EXECUTION_ID,
        stepId: STEP_ID,
        nodeId: NODE_ID,
        recordType: 'step_telemetry',
        data: { baz: 'qux' },
        createdAt: '2026-03-16T08:05:00.000Z',
      },
    ]);
    const countChain = tenantDb.queueSelectResult('where', [{ total: 5 }]);

    const result = await service.findByExecution(TENANT_ID, query);
    const dataWhereSql = renderSql(
      dataChain.where.mock.calls[0]?.[0] as Parameters<PgDialect['sqlToQuery']>[0],
    );
    const countWhereSql = renderSql(
      countChain.where.mock.calls[0]?.[0] as Parameters<PgDialect['sqlToQuery']>[0],
    );

    expect(mocks.getTenantDb).toHaveBeenCalledWith(rootDb);
    expect(dataChain.limit).toHaveBeenCalledWith(2);
    expect(dataChain.offset).toHaveBeenCalledWith(1);
    expect(dataWhereSql).toContain('"agent_execution_records"."execution_id"');
    expect(dataWhereSql).toContain('"agent_execution_records"."step_id"');
    expect(dataWhereSql).toContain('"agent_execution_records"."record_type"');
    expect(countWhereSql).toContain('"agent_execution_records"."execution_id"');
    expect(countWhereSql).toContain('"agent_execution_records"."step_id"');
    expect(countWhereSql).toContain('"agent_execution_records"."record_type"');
    expect(result).toEqual({
      data: [
        {
          id: 'record-a',
          executionId: EXECUTION_ID,
          stepId: STEP_ID,
          nodeId: NODE_ID,
          recordType: 'step_telemetry',
          data: { foo: 'bar' },
          createdAt: '2026-03-16T08:00:00.000Z',
        },
        {
          id: 'record-b',
          executionId: EXECUTION_ID,
          stepId: STEP_ID,
          nodeId: NODE_ID,
          recordType: 'step_telemetry',
          data: { baz: 'qux' },
          createdAt: '2026-03-16T08:05:00.000Z',
        },
      ],
      meta: {
        total: 5,
        limit: 2,
        offset: 1,
        hasMore: true,
      },
    });
  });

  it('should return empty paginated results when no records exist', async () => {
    const query = QueryExecutionRecordsSchema.parse({
      executionId: EXECUTION_ID,
    });
    const dataChain = tenantDb.queueSelectResult('offset', []);
    const countChain = tenantDb.queueSelectResult('where', [{ total: 0 }]);

    const result = await service.findByExecution(TENANT_ID, query);
    const whereSql = renderSql(
      dataChain.where.mock.calls[0]?.[0] as Parameters<PgDialect['sqlToQuery']>[0],
    );
    const countWhereSql = renderSql(
      countChain.where.mock.calls[0]?.[0] as Parameters<PgDialect['sqlToQuery']>[0],
    );

    expect(whereSql).toContain('"agent_execution_records"."execution_id"');
    expect(whereSql).not.toContain('"agent_execution_records"."step_id"');
    expect(whereSql).not.toContain('"agent_execution_records"."record_type"');
    expect(countWhereSql).toContain('"agent_execution_records"."execution_id"');
    expect(result).toEqual({
      data: [],
      meta: {
        total: 0,
        limit: 50,
        offset: 0,
        hasMore: false,
      },
    });
  });
});
