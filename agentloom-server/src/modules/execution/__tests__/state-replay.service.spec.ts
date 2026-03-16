import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { DRIZZLE } from '../../../database/database.module';
import { StateReplayService } from '../services/state-replay.service';
import type { EventBridgeService } from '../services/event-bridge.service';

const EXEC_ID = 'exec-uuid-1';
const TENANT_ID = 'tenant-uuid-1';

function createSelectChain(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(result),
    }),
  };
}

const makeExecution = (overrides = {}) => ({
  id: EXEC_ID,
  status: 'running' as const,
  completedSteps: 2,
  totalSteps: 5,
  ...overrides,
});

const makeStep = (id: string, nodeId: string, overrides = {}) => ({
  id,
  nodeId,
  status: 'completed' as const,
  startedAt: new Date('2025-01-01T00:00:00Z'),
  completedAt: new Date('2025-01-01T00:01:00Z'),
  errorMessage: null,
  result: null,
  checkpointData: null,
  ...overrides,
});

describe('StateReplayService', () => {
  let service: StateReplayService;
  let mockDb: { select: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});

    mockDb = { select: vi.fn() };

    const module = await Test.createTestingModule({
      providers: [StateReplayService, { provide: DRIZZLE, useValue: mockDb }],
    }).compile();

    service = module.get(StateReplayService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return null when execution not found', async () => {
    mockDb.select.mockReturnValueOnce(createSelectChain([]));

    const result = await service.getExecutionSnapshot(EXEC_ID, TENANT_ID);
    expect(result).toBeNull();
  });

  it('should return snapshot with steps mapped correctly', async () => {
    const execution = makeExecution();
    const steps = [
      makeStep('step-1', 'node-a'),
      makeStep('step-2', 'node-b', {
        status: 'running',
        completedAt: null,
        errorMessage: null,
      }),
    ];

    mockDb.select
      .mockReturnValueOnce(createSelectChain([execution]))
      .mockReturnValueOnce(createSelectChain(steps));

    const snapshot = await service.getExecutionSnapshot(EXEC_ID, TENANT_ID);

    expect(snapshot).not.toBeNull();
    expect(snapshot!.executionId).toBe(EXEC_ID);
    expect(snapshot!.status).toBe('running');
    expect(snapshot!.completedSteps).toBe(2);
    expect(snapshot!.totalSteps).toBe(5);
    expect(snapshot!.steps).toHaveLength(2);
    expect(snapshot!.snapshotAt).toBeDefined();
  });

  it('should map step dates to ISO strings', async () => {
    mockDb.select
      .mockReturnValueOnce(createSelectChain([makeExecution()]))
      .mockReturnValueOnce(createSelectChain([makeStep('step-1', 'node-a')]));

    const snapshot = await service.getExecutionSnapshot(EXEC_ID, TENANT_ID);
    const step = snapshot!.steps[0];

    expect(step.startedAt).toBe('2025-01-01T00:00:00.000Z');
    expect(step.completedAt).toBe('2025-01-01T00:01:00.000Z');
  });

  it('should handle null dates gracefully', async () => {
    mockDb.select
      .mockReturnValueOnce(createSelectChain([makeExecution()]))
      .mockReturnValueOnce(
        createSelectChain([
          makeStep('step-1', 'node-a', {
            startedAt: null,
            completedAt: null,
          }),
        ]),
      );

    const snapshot = await service.getExecutionSnapshot(EXEC_ID, TENANT_ID);
    const step = snapshot!.steps[0];

    expect(step.startedAt).toBeNull();
    expect(step.completedAt).toBeNull();
  });

  it('should extract error message from jsonb errorMessage and preserve errorDetail', async () => {
    const errorDetail = {
      message: 'Something broke',
      title: '端口类型不匹配',
      detail: '上游输出与下游输入的数据类型不兼容',
      type: 'https://agentloom.dev/errors/node-type-mismatch',
      nodeId: 'node-a',
      stack: '...',
      errors: [
        {
          field: 'input.image',
          message: '图片输入无效',
        },
      ],
      typeMismatch: {
        sourcePortId: 'output-text',
        targetPortId: 'input-image',
        sourceType: 'text',
        targetType: 'image',
        sourceNodeId: 'node-source',
        targetNodeId: 'node-target',
        edgeId: 'edge-1',
      },
    };

    mockDb.select
      .mockReturnValueOnce(createSelectChain([makeExecution()]))
      .mockReturnValueOnce(
        createSelectChain([
          makeStep('step-1', 'node-a', {
            status: 'failed',
            errorMessage: errorDetail,
          }),
        ]),
      );

    const snapshot = await service.getExecutionSnapshot(EXEC_ID, TENANT_ID);
    expect(snapshot!.steps[0].errorMessage).toBe('Something broke');
    expect(snapshot!.steps[0].errorDetail).toEqual(errorDetail);
  });

  it('should omit errorMessage when null', async () => {
    mockDb.select
      .mockReturnValueOnce(createSelectChain([makeExecution()]))
      .mockReturnValueOnce(createSelectChain([makeStep('step-1', 'node-a')]));

    const snapshot = await service.getExecutionSnapshot(EXEC_ID, TENANT_ID);
    expect(snapshot!.steps[0]).not.toHaveProperty('errorMessage');
  });

  it('should include result in step snapshot when present', async () => {
    const result = { output: 'Hello from agent', tokens: 42 };
    mockDb.select
      .mockReturnValueOnce(createSelectChain([makeExecution()]))
      .mockReturnValueOnce(
        createSelectChain([makeStep('step-1', 'node-a', { result })]),
      );

    const snapshot = await service.getExecutionSnapshot(EXEC_ID, TENANT_ID);
    expect(snapshot!.steps[0].result).toEqual(result);
  });

  it('should include checkpointData in step snapshot when present', async () => {
    const checkpointData = {
      sessionId: 'session-1',
      interventionRequestedAt: '2025-01-01T00:00:30.000Z',
      interventionNodeName: '人工审核节点',
    };
    mockDb.select
      .mockReturnValueOnce(createSelectChain([makeExecution()]))
      .mockReturnValueOnce(
        createSelectChain([makeStep('step-1', 'node-a', { checkpointData })]),
      );

    const snapshot = await service.getExecutionSnapshot(EXEC_ID, TENANT_ID);
    expect(snapshot!.steps[0].checkpointData).toEqual(checkpointData);
  });

  it('should set result to null when step has no result', async () => {
    mockDb.select
      .mockReturnValueOnce(createSelectChain([makeExecution()]))
      .mockReturnValueOnce(
        createSelectChain([makeStep('step-1', 'node-a', { result: null })]),
      );

    const snapshot = await service.getExecutionSnapshot(EXEC_ID, TENANT_ID);
    expect(snapshot!.steps[0].result).toBeNull();
  });

  it('should use eventBridge lastEventId when provided', async () => {
    const mockBridge = {
      getLastEventId: vi.fn().mockReturnValue(42),
    } as unknown as EventBridgeService;

    mockDb.select
      .mockReturnValueOnce(createSelectChain([makeExecution()]))
      .mockReturnValueOnce(createSelectChain([]));

    await service.getExecutionSnapshot(EXEC_ID, TENANT_ID, mockBridge);

    expect(mockBridge.getLastEventId).toHaveBeenCalledWith(EXEC_ID);
  });

  it('should default completedSteps and totalSteps to 0 when null', async () => {
    mockDb.select
      .mockReturnValueOnce(
        createSelectChain([
          makeExecution({ completedSteps: null, totalSteps: null }),
        ]),
      )
      .mockReturnValueOnce(createSelectChain([]));

    const snapshot = await service.getExecutionSnapshot(EXEC_ID, TENANT_ID);
    expect(snapshot!.completedSteps).toBe(0);
    expect(snapshot!.totalSteps).toBe(0);
  });
});
