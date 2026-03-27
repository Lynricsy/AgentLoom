import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { EVENT_LISTENER_METADATA } from '@nestjs/event-emitter/dist/constants';
import { PgDialect } from 'drizzle-orm/pg-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DRIZZLE } from '../../database/database.module';
import type {
  AgentExecutionRecord,
  ExecutionStep,
  ExecutionSummaryData,
  StepTelemetryData,
} from '../../database/schema';
import { ExecutionRecordService } from './execution-record.service';
import { ExecutionNotFoundException } from '../execution/execution.exceptions';
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
  const values = vi
    .fn()
    .mockImplementation((value: Record<string, unknown>) => {
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
  runInTenantTransaction: vi.fn(),
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

function createStep(overrides: Partial<ExecutionStep> = {}): ExecutionStep {
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

function createStepPayload(overrides: Record<string, unknown> = {}) {
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

function createExecutionStatusPayload(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: TENANT_ID,
    executionId: EXECUTION_ID,
    status: 'completed',
    ...overrides,
  };
}

function createTelemetryData(
  overrides: Partial<StepTelemetryData> = {},
): StepTelemetryData {
  return {
    toolCalls: [],
    errors: [],
    selfRepairs: [],
    ioSnapshots: {
      stepInput: null,
      stepOutput: null,
    },
    llmInteractions: {
      modelId: 'gpt-4o-mini',
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
      latencyMs: 1000,
    },
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

    mocks.runInTenantTransaction.mockReset();
    mocks.runInTenantTransaction.mockImplementation(
      async (
        _db: unknown,
        _tenantId: string,
        operation: (db: MockDb) => Promise<unknown>,
      ) => operation(tenantDb),
    );

    warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

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
    await service.handleStepStatusChanged(createStepPayload({ to: 'running' }));

    expect(mocks.runInTenantTransaction).not.toHaveBeenCalled();
    expect(tenantDb.insert).not.toHaveBeenCalled();
  });

  it('should record completed step telemetry using the new telemetryData contract', async () => {
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
          privateKey: 'private-key',
          content: 'ok',
        },
        checkpointData: {
          toolCalls: [
            {
              id: 'tool-1',
              tool: 'search_docs',
              args: {
                query: 'execution record',
                apiKey: 'tool-api-key',
              },
              status: 'completed',
              result: {
                snippets: ['ok'],
                accessKey: 'tool-access-key',
              },
              transitions: [
                {
                  from: 'pending',
                  to: 'in_progress',
                  timestamp: '2026-03-16T09:59:00.000Z',
                },
                {
                  from: 'in_progress',
                  to: 'completed',
                  timestamp: '2026-03-16T09:59:01.500Z',
                },
              ],
            },
            {
              id: 'tool-2',
              tool: 'approval_gate',
              args: {
                authorizationHeader: 'Bearer secret',
              },
              status: 'awaiting_permission',
              transitions: [
                {
                  from: 'pending',
                  to: 'awaiting_permission',
                  timestamp: '2026-03-16T09:59:02.000Z',
                },
              ],
            },
            {
              id: 'tool-3',
              tool: 'fallback_tool',
              args: { prompt: 'hello' },
              status: 'failed',
              error: 'permission denied',
            },
            'invalid-tool-call',
          ],
          attempts: [
            {
              attempt: 1,
              error: 'first failure',
              timestamp: '2026-03-16T09:59:00.000Z',
            },
            {
              attempt: 2,
              error: 'second failure',
              timestamp: '2026-03-16T09:59:01.000Z',
            },
          ],
        },
        startedAt: new Date('2026-03-16T09:59:00.000Z'),
        completedAt: new Date('2026-03-16T09:59:05.000Z'),
      }),
    ]);

    await service.handleStepStatusChanged(createStepPayload());

    expect(mocks.runInTenantTransaction).toHaveBeenCalledWith(
      rootDb,
      TENANT_ID,
      expect.any(Function),
    );
    expect(tenantDb.insert).toHaveBeenCalledTimes(1);

    const insertedRecord = tenantDb.insertValues[0] as {
      tenantId: string;
      summaryData: null;
      telemetryData: StepTelemetryData;
      recordType: string;
    };

    expect(insertedRecord).toMatchObject({
      tenantId: TENANT_ID,
      executionId: EXECUTION_ID,
      stepId: STEP_ID,
      nodeId: NODE_ID,
      recordType: 'step_telemetry',
      summaryData: null,
    });

    const telemetry = insertedRecord.telemetryData;
    expect(telemetry.toolCalls.map((toolCall) => toolCall.status)).toEqual([
      'success',
      'error',
      'error',
    ]);
    expect(telemetry.selfRepairs).toEqual([]);
    expect(telemetry.toolCalls[0]).toMatchObject({
      toolName: 'search_docs',
      input: {
        query: 'execution record',
        apiKey: '[REDACTED]',
      },
      output: {
        snippets: ['ok'],
        accessKey: '[REDACTED]',
      },
      durationMs: 1500,
      status: 'success',
    });
    expect(telemetry.ioSnapshots.stepInput).toEqual({
      prompt: '生成摘要',
      apiKey: '[REDACTED]',
    });
    expect(telemetry.ioSnapshots.stepOutput).toMatchObject({
      modelId: 'gpt-4o-mini',
      promptTokens: 12,
      completionTokens: 8,
      totalTokens: 20,
      privateKey: '[REDACTED]',
      content: 'ok',
    });
    expect(telemetry.llmInteractions).toEqual({
      modelId: 'gpt-4o-mini',
      promptTokens: 12,
      completionTokens: 8,
      totalTokens: 20,
      latencyMs: 5000,
    });
  });

  it('should record failed telemetry with canonical error types and no fake self repairs', async () => {
    tenantDb.queueSelectResult('limit', [
      createStep({
        status: 'failed',
        nodeType: 'tool-node',
        errorMessage: null,
        checkpointData: {
          attempts: [
            {
              attempt: 1,
              error: 'first failure',
              timestamp: '2026-03-16T09:59:00.000Z',
            },
            {
              attempt: 2,
              error: 'second failure',
              timestamp: '2026-03-16T09:59:01.000Z',
            },
          ],
        },
      }),
    ]);

    await service.handleStepStatusChanged(
      createStepPayload({
        to: 'failed',
        errorDetail: {
          message: 'Permission denied by tool sandbox',
        },
      }),
    );

    const insertedRecord = tenantDb.insertValues[0] as {
      telemetryData: StepTelemetryData;
    };
    const telemetry = insertedRecord.telemetryData;

    expect(telemetry.errors).toEqual([
      expect.objectContaining({
        errorType: 'tool_error',
        errorMessage: 'Permission denied by tool sandbox',
        nodeId: NODE_ID,
        stepId: STEP_ID,
      }),
    ]);
    expect(telemetry.selfRepairs).toEqual([]);
  });

  it('should warn and skip insert when the step is not found', async () => {
    tenantDb.queueSelectResult('limit', []);

    await service.handleStepStatusChanged(createStepPayload());

    expect(warnSpy).toHaveBeenCalledWith(
      `Step ${STEP_ID} not found for telemetry recording`,
    );
    expect(tenantDb.insert).not.toHaveBeenCalled();
  });

  it('should build and store execution summaries from telemetryData records', async () => {
    tenantDb.queueSelectResult('where', [
      {
        telemetryData: createTelemetryData({
          toolCalls: [
            {
              toolName: 'tool-1',
              input: null,
              output: null,
              durationMs: 1000,
              status: 'success',
            },
            {
              toolName: 'tool-2',
              input: null,
              output: null,
              durationMs: 800,
              status: 'error',
            },
          ],
          errors: [
            {
              errorType: 'tool_error',
              errorMessage: 'tool failed',
              timestamp: NOW.toISOString(),
              nodeId: NODE_ID,
              stepId: STEP_ID,
            },
          ],
          selfRepairs: [
            {
              originalOutput: 'bad',
              validationError: 'invalid schema',
              repairAttempts: [
                { attemptNumber: 1, result: 'better', success: true },
              ],
            },
          ],
          llmInteractions: {
            modelId: 'gpt-4o-mini',
            promptTokens: 20,
            completionTokens: 30,
            totalTokens: 50,
            latencyMs: 1200,
          },
        }),
      },
      {
        telemetryData: createTelemetryData({
          toolCalls: [
            {
              toolName: 'tool-3',
              input: null,
              output: null,
              durationMs: 900,
              status: 'success',
            },
          ],
          llmInteractions: {
            modelId: 'gpt-4.1',
            promptTokens: 40,
            completionTokens: 60,
            totalTokens: 100,
            latencyMs: 2800,
          },
        }),
      },
      {
        telemetryData: null,
      },
    ]);
    tenantDb.queueSelectResult('where', [
      createStep({
        status: 'completed',
        startedAt: new Date('2026-03-16T10:00:00.000Z'),
        completedAt: new Date('2026-03-16T10:00:10.000Z'),
      }),
      createStep({
        id: STEP_ID_TWO,
        status: 'failed',
        startedAt: new Date('2026-03-16T10:00:05.000Z'),
        completedAt: new Date('2026-03-16T10:00:40.000Z'),
      }),
      createStep({
        id: STEP_ID_THREE,
        status: 'pending',
        startedAt: null,
        completedAt: null,
      }),
    ]);

    await service.handleExecutionStatusChanged(createExecutionStatusPayload());

    const insertedRecord = tenantDb.insertValues[0] as {
      tenantId: string;
      recordType: string;
      telemetryData: null;
      summaryData: ExecutionSummaryData;
    };

    expect(insertedRecord).toMatchObject({
      tenantId: TENANT_ID,
      executionId: EXECUTION_ID,
      recordType: 'execution_summary',
      telemetryData: null,
    });
    expect(insertedRecord.summaryData).toEqual({
      totalSteps: 3,
      completedSteps: 1,
      failedSteps: 1,
      totalToolCalls: 3,
      totalErrors: 1,
      totalSelfRepairs: 1,
      totalTokens: 150,
      totalLatencyMs: 4000,
      avgStepLatencyMs: 2000,
      executionDurationMs: 40000,
    });
  });

  it('should warn instead of throwing when execution summary recording fails', async () => {
    mocks.runInTenantTransaction.mockRejectedValueOnce(
      new Error('summary write failed'),
    );

    await expect(
      service.handleExecutionStatusChanged(createExecutionStatusPayload()),
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      `Failed to record execution summary for ${EXECUTION_ID}: summary write failed`,
    );
  });

  it('should return paginated execution records with telemetryData and summaryData', async () => {
    tenantDb.queueSelectResult('limit', [{ id: EXECUTION_ID }]);
    const recordsChain = tenantDb.queueSelectResult('offset', [
      {
        id: 'record-1',
        tenantId: TENANT_ID,
        executionId: EXECUTION_ID,
        stepId: STEP_ID,
        nodeId: NODE_ID,
        recordType: 'step_telemetry',
        telemetryData: createTelemetryData(),
        summaryData: null,
        createdAt: new Date('2026-03-16T10:05:00.000Z'),
      } satisfies Partial<AgentExecutionRecord>,
    ]);
    tenantDb.queueSelectResult('where', [{ total: 1 }]);

    const result = await service.findByExecution(TENANT_ID, {
      executionId: EXECUTION_ID,
      stepId: STEP_ID,
      recordType: 'step_telemetry',
      limit: 10,
      offset: 20,
    });

    expect(mocks.runInTenantTransaction).toHaveBeenCalledWith(
      rootDb,
      TENANT_ID,
      expect.any(Function),
    );
    expect(renderSql(recordsChain.where.mock.calls[0][0])).toContain(
      '"agent_execution_records"."execution_id" = $1',
    );
    expect(renderSql(recordsChain.where.mock.calls[0][0])).toContain(
      '"agent_execution_records"."step_id" = $2',
    );
    expect(renderSql(recordsChain.where.mock.calls[0][0])).toContain(
      '"agent_execution_records"."record_type" = $3',
    );
    expect(result).toEqual({
      data: [
        {
          id: 'record-1',
          executionId: EXECUTION_ID,
          stepId: STEP_ID,
          nodeId: NODE_ID,
          recordType: 'step_telemetry',
          telemetryData: createTelemetryData(),
          summaryData: null,
          createdAt: '2026-03-16T10:05:00.000Z',
        },
      ],
      meta: {
        total: 1,
        limit: 10,
        offset: 20,
        hasMore: false,
      },
    });
  });

  it('should throw ExecutionNotFoundException when the execution is missing or inaccessible', async () => {
    tenantDb.queueSelectResult('limit', []);

    await expect(
      service.findByExecution(TENANT_ID, {
        executionId: EXECUTION_ID,
        limit: 50,
        offset: 0,
      }),
    ).rejects.toBeInstanceOf(ExecutionNotFoundException);
  });

  it('should return empty paginated results when the execution exists but has no records', async () => {
    tenantDb.queueSelectResult('limit', [{ id: EXECUTION_ID }]);
    tenantDb.queueSelectResult('offset', []);
    tenantDb.queueSelectResult('where', [{ total: 0 }]);

    await expect(
      service.findByExecution(TENANT_ID, {
        executionId: EXECUTION_ID,
        limit: 50,
        offset: 0,
      }),
    ).resolves.toEqual({
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
