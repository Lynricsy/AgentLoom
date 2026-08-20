import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import {
  EXECUTION_EVENT_NAMES,
  EXECUTION_EVENT_PAYLOAD_SCHEMAS,
  ExecutionStateSnapshotSchema,
  parseExecutionEvent,
  type ExecutionEventName as ContractExecutionEventName,
} from '@agentloom/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { DRIZZLE } from '../../../database/database.module';
import {
  EventBridgeService,
  ExecutionBroadcastIntent,
} from '../services/event-bridge.service';
import { StateReplayService } from '../services/state-replay.service';
import { ThrottleService } from '../services/throttle.service';
import { ExecutionEventName } from '../types/execution-event.types';

/**
 * wire 格式闸门：server 实际产出的事件信封与回放快照必须同时通过契约层 schema，
 * 并与 `agentloom-contracts/fixtures/` 逐字段深度一致。
 * 这道测试让"server 悄悄改 wire 格式"直接变成红灯。
 */

const require_ = createRequire(import.meta.url);

function readFixture<T>(relativePath: string): T {
  const resolved = require_.resolve(`@agentloom/contracts/${relativePath}`);
  return JSON.parse(readFileSync(resolved, 'utf8')) as T;
}

interface EnvelopeFixture {
  eventId: number;
  event: ContractExecutionEventName;
  timestamp: string;
  executionId: string;
  tenantId: string;
  data: Record<string, unknown>;
}

interface StepSnapshotFixture {
  stepId: string;
  nodeId: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage?: string;
  errorDetail?: Record<string, unknown>;
  result: Record<string, unknown> | null;
  checkpointData: Record<string, unknown> | null;
}

interface SnapshotFixture {
  executionId: string;
  status: string;
  completedSteps: number;
  totalSteps: number;
  steps: StepSnapshotFixture[];
  snapshotAt: string;
  lastEventId: number;
}

const ENVELOPE_FIXTURE = readFixture<EnvelopeFixture>(
  'fixtures/execution-event-envelope.json',
);
const SNAPSHOT_FIXTURE = readFixture<SnapshotFixture>(
  'fixtures/execution-state-snapshot.json',
);

const TENANT = ENVELOPE_FIXTURE.tenantId;
const EXEC = ENVELOPE_FIXTURE.executionId;

/**
 * 每个事件名对应的 payload fixture 与实际 emit 入口。
 * 覆盖全部 10 个事件名 —— 少一个就说明有事件绕过了契约校验。
 */
const EMIT_CASES: ReadonlyArray<{
  event: ContractExecutionEventName;
  fixture: string;
  emit: (
    service: EventBridgeService,
    payload: never,
  ) => { event: string; data: unknown };
}> = [
  {
    event: ExecutionEventName.EXECUTION_STATUS_CHANGED,
    fixture: 'execution-status-changed.json',
    emit: (service, payload) =>
      service.emitExecutionStatusChanged(TENANT, EXEC, payload),
  },
  {
    event: ExecutionEventName.STEP_STATUS_CHANGED,
    fixture: 'node-status-changed.json',
    emit: (service, payload) =>
      service.emitStepStatusChanged(TENANT, EXEC, payload),
  },
  {
    event: ExecutionEventName.STEP_AGENT_EVENT,
    fixture: 'node-agent-event.json',
    emit: (service, payload) =>
      service.emitStepAgentEvent(TENANT, EXEC, payload),
  },
  {
    event: ExecutionEventName.STEP_RETRYING,
    fixture: 'node-retrying.json',
    emit: (service, payload) =>
      service.emitStepRetrying(TENANT, EXEC, payload),
  },
  {
    event: ExecutionEventName.OUTPUT_CHUNK,
    fixture: 'node-output-chunk.json',
    emit: (service, payload) =>
      service.emitOutputChunk(TENANT, EXEC, payload),
  },
  {
    event: ExecutionEventName.NODE_INTERVENTION_REQUIRED,
    fixture: 'node-intervention-required.json',
    emit: (service, payload) =>
      service.emitInterventionRequired(TENANT, EXEC, payload),
  },
  {
    event: ExecutionEventName.NODE_INTERVENTION_RESOLVED,
    fixture: 'node-intervention-resolved.json',
    emit: (service, payload) =>
      service.emitInterventionResolved(TENANT, EXEC, payload),
  },
  {
    event: ExecutionEventName.NODE_TOOL_CALL_STATUS,
    fixture: 'node-tool-call-status.json',
    emit: (service, payload) =>
      service.emitToolCallStatus(TENANT, EXEC, payload),
  },
  {
    event: ExecutionEventName.NODE_TOOL_PERMISSION_REQUIRED,
    fixture: 'node-tool-permission-required.json',
    emit: (service, payload) =>
      service.emitToolPermissionRequired(TENANT, EXEC, payload),
  },
  {
    event: ExecutionEventName.NODE_TOOL_PERMISSION_RESOLVED,
    fixture: 'node-tool-permission-resolved.json',
    emit: (service, payload) =>
      service.emitToolPermissionResolved(TENANT, EXEC, payload),
  },
];

describe('执行事件 wire 契约', () => {
  let service: EventBridgeService;
  let emitIntent: Mock;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(ENVELOPE_FIXTURE.timestamp));
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    emitIntent = vi.fn();

    const module = await Test.createTestingModule({
      providers: [
        EventBridgeService,
        {
          provide: EventEmitter2,
          useValue: { emit: emitIntent },
        },
        {
          provide: ThrottleService,
          useValue: {
            forceFlush: vi.fn().mockReturnValue([]),
            clearExecution: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(EventBridgeService);
  });

  afterEach(() => {
    service.onModuleDestroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('服务端事件名常量表与契约层取值集合完全一致', () => {
    expect(Object.values(ExecutionEventName).sort()).toEqual(
      [...EXECUTION_EVENT_NAMES].sort(),
    );
  });

  it('emit 用例覆盖全部契约事件名', () => {
    expect(EMIT_CASES.map((testCase) => testCase.event).sort()).toEqual(
      [...EXECUTION_EVENT_NAMES].sort(),
    );
  });

  it('契约层为每个事件名都提供了载荷 schema', () => {
    for (const name of EXECUTION_EVENT_NAMES) {
      expect(EXECUTION_EVENT_PAYLOAD_SCHEMAS[name]).toBeDefined();
    }
  });

  for (const testCase of EMIT_CASES) {
    it(`${testCase.event} 的信封结构与载荷都通过契约校验且与 fixture 深度一致`, () => {
      const payload = readFixture<Record<string, unknown>>(
        `fixtures/execution-events/${testCase.fixture}`,
      );

      const envelope = testCase.emit(service, payload as never);

      expect(envelope).toEqual({
        eventId: 1,
        event: testCase.event,
        timestamp: ENVELOPE_FIXTURE.timestamp,
        executionId: EXEC,
        tenantId: TENANT,
        data: payload,
      });

      const parsed = parseExecutionEvent(envelope);
      expect(parsed.data).toEqual(payload);
    });
  }

  it('emitExecutionStatusChanged 在第 7 个事件位置产出与信封 fixture 完全一致的对象', () => {
    const payload = readFixture<Record<string, unknown>>(
      `fixtures/execution-events/execution-status-changed.json`,
    );

    // fixture 的 eventId 为 7：先推进 6 个事件占位，再产出被断言的信封。
    for (let index = 0; index < 6; index += 1) {
      service.emitStepRetrying(TENANT, EXEC, {
        stepId: 'warmup',
        attempt: 1,
        maxAttempts: 1,
      });
    }

    const envelope = service.emitExecutionStatusChanged(
      TENANT,
      EXEC,
      payload as never,
    );

    expect(envelope).toEqual(ENVELOPE_FIXTURE);
  });

  it('eventId 在同一 execution 内单调递增', () => {
    const first = service.emitStepRetrying(TENANT, EXEC, {
      stepId: 'step-1',
      attempt: 1,
      maxAttempts: 3,
    });
    const second = service.emitStepRetrying(TENANT, EXEC, {
      stepId: 'step-1',
      attempt: 2,
      maxAttempts: 3,
    });

    expect(second.eventId).toBe(first.eventId + 1);
  });

  it('广播给 gateway 的就是通过契约校验的同一个信封', () => {
    const envelope = service.emitStepRetrying(TENANT, EXEC, {
      stepId: 'step-1',
      attempt: 1,
      maxAttempts: 3,
    });

    expect(emitIntent).toHaveBeenCalledWith(
      ExecutionBroadcastIntent.BROADCAST,
      {
        tenantId: TENANT,
        executionId: EXEC,
        event: envelope.event,
        data: envelope,
      },
    );
  });
});

describe('回放快照 wire 契约', () => {
  function createSelectChain(result: unknown) {
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(result),
      }),
    };
  }

  /** 把 snapshot fixture 的 step 反推成 DB 行形状。 */
  function toDbRow(step: StepSnapshotFixture) {
    return {
      id: step.stepId,
      nodeId: step.nodeId,
      status: step.status,
      startedAt: step.startedAt ? new Date(step.startedAt) : null,
      completedAt: step.completedAt ? new Date(step.completedAt) : null,
      errorMessage: step.errorDetail ?? null,
      result: step.result,
      checkpointData: step.checkpointData,
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(SNAPSHOT_FIXTURE.snapshotAt));
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('getExecutionSnapshot 输出通过契约 schema 且与快照 fixture 完全一致', async () => {
    const db = { select: vi.fn() };
    db.select
      .mockReturnValueOnce(
        createSelectChain([
          {
            id: SNAPSHOT_FIXTURE.executionId,
            status: SNAPSHOT_FIXTURE.status,
            completedSteps: SNAPSHOT_FIXTURE.completedSteps,
            totalSteps: SNAPSHOT_FIXTURE.totalSteps,
          },
        ]),
      )
      .mockReturnValueOnce(
        createSelectChain(SNAPSHOT_FIXTURE.steps.map(toDbRow)),
      );

    const module = await Test.createTestingModule({
      providers: [StateReplayService, { provide: DRIZZLE, useValue: db }],
    }).compile();

    const snapshot = await module
      .get(StateReplayService)
      .getExecutionSnapshot(SNAPSHOT_FIXTURE.executionId, TENANT, {
        getLastEventId: () => SNAPSHOT_FIXTURE.lastEventId,
      } as never);

    expect(ExecutionStateSnapshotSchema.parse(snapshot)).toEqual(
      SNAPSHOT_FIXTURE,
    );
  });
});
