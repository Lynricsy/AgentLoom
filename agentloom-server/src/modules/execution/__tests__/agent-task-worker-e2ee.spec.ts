import { getQueueToken } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AGENT_RUNTIME,
  type IAgentRuntime,
} from '../../agent/ports/agent-runtime.port';
import {
  AGENT_RUNTIME_FACTORY,
  type IAgentAdapterFactory,
} from '../../agent/agent-adapter.factory';
import type { AgentEvent } from '../../agent/types/agent-event.types';
import { InterventionPolicyService } from '../../intervention-policy/intervention-policy.service';
import {
  LlmEncryptionService,
  type EncryptedPayload,
} from '../../llm/llm-encryption.service';
import { NotificationService } from '../../notification/notification.service';
import { SmartRoutingService } from '../../smart-routing/smart-routing.service';
import { OrganizationAutonomyPolicyService } from '../../organization/organization-autonomy-policy.service';
import { DRIZZLE } from '../../../database/database.module';
import {
  AGENT_TASK_QUEUE,
  type AgentTaskJobData,
} from '../execution.constants';
import { AgentTaskWorker } from '../agent-task.worker';
import { NodeSchedulerService } from '../node-scheduler.service';
import { EventBridgeService } from '../services/event-bridge.service';
import { SessionPersistenceService } from '../services/session-persistence.service';
import { ThrottleService } from '../services/throttle.service';
import { ToolCallStateMachineService } from '../services/tool-call-state-machine.service';
import { StepStateMachineService } from '../step-state-machine.service';

const mocks = vi.hoisted(() => ({
  runInTenantTransaction: vi.fn(
    async (
      db: unknown,
      _tenantId: string,
      operation: (tenantDb: unknown) => Promise<unknown>,
    ) => operation(db),
  ),
  stepStateMachine: {
    updateStepStatus: vi.fn(),
    updateExecutionStatus: vi.fn(),
    broadcastAgentEvent: vi.fn(),
    broadcastStepRetry: vi.fn(),
  },
  nodeScheduler: {
    onNodeCompleted: vi.fn(),
    onNodeFailed: vi.fn(),
    enqueueInterventionTimeout: vi.fn(),
    resolveIntervention: vi.fn(),
  },
  throttleService: {
    bufferOutputChunk: vi.fn(),
  },
  eventBridge: {
    emitInterventionRequired: vi.fn(),
    emitToolCallStatus: vi.fn(),
    emitToolPermissionRequired: vi.fn(),
    emitToolPermissionResolved: vi.fn(),
    emitOutputChunk: vi.fn(),
    emitStepAgentEvent: vi.fn(),
  },
  toolCallStateMachine: {
    transition: vi.fn().mockImplementation((_from: string, to: string) => to),
    isTerminal: vi.fn().mockReturnValue(false),
    getAllowedTransitions: vi.fn().mockReturnValue([]),
  },
  sessionPersistence: {
    saveToCheckpoint: vi.fn(),
    loadFromCheckpoint: vi.fn(),
    serializeSession: vi.fn(),
    deserializeSession: vi.fn(),
  },
  interventionPolicy: {
    resolvePolicy: vi.fn(),
  },
  notificationService: {
    create: vi.fn(),
  },
  llmEncryptionService: {
    isE2EEEnabled: vi.fn(),
    encryptForTenant: vi.fn(),
  },
  smartRoutingService: {
    recordDecision: vi.fn(),
  },
  organizationAutonomyPolicyService: {
    resolveAutonomyCapForTenant: vi.fn(),
  },
  agentRuntime: {
    createSession: vi.fn(),
    loadSession: vi.fn(),
    prompt: vi.fn(),
    cancel: vi.fn(),
    registerSessionMetadata: vi.fn(),
  },
  queue: {
    add: vi.fn(),
  },
  db: {
    select: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock(
  '../../../common/interceptors/tenant-transaction.context',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('../../../common/interceptors/tenant-transaction.context')
      >();

    return {
      ...actual,
      runInTenantTransaction: mocks.runInTenantTransaction,
    };
  },
);

const EXECUTION_ID = '019391d4-d000-7000-0000-000000000001';
const STEP_ID = '019391d4-d000-7000-0000-000000000002';
const TENANT_ID = '019391d4-d000-7000-0000-000000000003';
const ORG_ID = '019391d4-d000-7000-0000-000000000004';
const SESSION_ID = 'session-e2ee-001';
const AGENT_ID = 'agent-e2ee-001';
const NOW = new Date('2026-03-15T16:20:30.000Z');

type CompletedStepExtra = {
  result: Record<string, unknown>;
  isEncrypted?: boolean;
};

function createMockJob(
  overrides: Partial<Job<AgentTaskJobData>> = {},
): Job<AgentTaskJobData> {
  return {
    data: {
      executionId: EXECUTION_ID,
      stepId: STEP_ID,
      tenantId: TENANT_ID,
    },
    id: 'job-e2ee-1',
    attemptsMade: 0,
    opts: {},
    ...overrides,
  } as Job<AgentTaskJobData>;
}

function makeStep(overrides: Record<string, unknown> = {}) {
  return {
    id: STEP_ID,
    executionId: EXECUTION_ID,
    nodeId: 'node-e2ee-1',
    stepOrder: 0,
    status: 'queued',
    nodeType: 'agent',
    nodeData: { agentId: AGENT_ID, systemPrompt: '你是一个加密测试助手' },
    input: { upstream_node: { answer: '42' } },
    result: null,
    attemptCount: 0,
    checkpointData: null,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeSession() {
  return {
    id: SESSION_ID,
    agentId: AGENT_ID,
    mode: 'workflow',
    context: { history: [] },
    status: 'active',
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createSelectChain(result: unknown) {
  const resolvedResult = Array.isArray(result) ? result : [result];
  const limit = vi.fn().mockResolvedValue(resolvedResult);
  const whereResult = Object.assign(Promise.resolve(resolvedResult), { limit });

  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(whereResult),
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue(whereResult),
      }),
    }),
  };
}

async function* createEventStream(
  events: AgentEvent[],
): AsyncIterable<AgentEvent> {
  for (const event of events) {
    yield event;
  }
}

function createEncryptedPayload(
  overrides: Partial<EncryptedPayload> = {},
): EncryptedPayload {
  return {
    ciphertext: 'ciphertext-base64',
    encryptedSessionKey: 'encrypted-session-key-base64',
    iv: 'iv-base64',
    authTag: 'auth-tag-base64',
    aad: `${TENANT_ID}:${NOW.toISOString()}`,
    keyFingerprint: 'fp-e2ee-test',
    algorithm: 'RSA-OAEP-4096+AES-256-GCM',
    ...overrides,
  };
}

function queueStepAndOrgLookup(orgLookupResult: unknown): void {
  mocks.db.select
    .mockReturnValueOnce(createSelectChain(makeStep()))
    .mockReturnValueOnce(createSelectChain(orgLookupResult));
}

function queueCompletionPrompt(output: string): void {
  mocks.agentRuntime.prompt.mockReturnValue(
    createEventStream([
      { type: 'message_chunk', content: output },
      { type: 'done', stopReason: 'end_turn' },
    ]),
  );
}

function getCompletedStepExtra(): CompletedStepExtra {
  const completedCall =
    mocks.stepStateMachine.updateStepStatus.mock.calls.at(-1);
  expect(completedCall).toBeDefined();
  expect(completedCall?.[0]).toBe(TENANT_ID);
  expect(completedCall?.[1]).toBe(STEP_ID);
  expect(completedCall?.[2]).toBe('completed');
  return completedCall?.[3] as CompletedStepExtra;
}

describe('AgentTaskWorker E2EE integration', () => {
  let worker: AgentTaskWorker;

  const adapterFactory: IAgentAdapterFactory = {
    selectAdapter: vi
      .fn()
      .mockReturnValue(mocks.agentRuntime as unknown as IAgentRuntime),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    mocks.runInTenantTransaction.mockImplementation(
      async (
        db: unknown,
        _tenantId: string,
        operation: (tenantDb: unknown) => Promise<unknown>,
      ) => operation(db),
    );

    mocks.db.select.mockReset();
    mocks.db.update.mockReset();

    mocks.stepStateMachine.updateStepStatus.mockResolvedValue(makeStep());
    mocks.stepStateMachine.updateExecutionStatus.mockResolvedValue(undefined);
    mocks.nodeScheduler.onNodeCompleted.mockResolvedValue(undefined);
    mocks.nodeScheduler.onNodeFailed.mockResolvedValue(undefined);
    mocks.nodeScheduler.enqueueInterventionTimeout.mockResolvedValue(undefined);
    mocks.nodeScheduler.resolveIntervention.mockResolvedValue(undefined);
    mocks.sessionPersistence.saveToCheckpoint.mockResolvedValue(undefined);
    mocks.sessionPersistence.loadFromCheckpoint.mockResolvedValue(null);
    mocks.sessionPersistence.serializeSession.mockReturnValue({});
    mocks.interventionPolicy.resolvePolicy.mockResolvedValue({
      allowedRoles: ['owner', 'admin'],
      timeoutSeconds: 86400,
      timeoutAction: 'reject',
      escalateToRole: null,
      notifyChannels: ['in_app'],
      source: 'system_default',
    });
    mocks.notificationService.create.mockResolvedValue(undefined);
    mocks.llmEncryptionService.isE2EEEnabled.mockResolvedValue(false);
    mocks.smartRoutingService.recordDecision
      .mockReset()
      .mockResolvedValue(undefined);
    mocks.organizationAutonomyPolicyService.resolveAutonomyCapForTenant
      .mockReset()
      .mockResolvedValue('LLM_SUGGEST');
    mocks.agentRuntime.createSession.mockResolvedValue(makeSession());
    mocks.agentRuntime.loadSession.mockResolvedValue(makeSession());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentTaskWorker,
        { provide: DRIZZLE, useValue: mocks.db },
        { provide: AGENT_RUNTIME, useValue: mocks.agentRuntime },
        { provide: AGENT_RUNTIME_FACTORY, useValue: adapterFactory },
        { provide: StepStateMachineService, useValue: mocks.stepStateMachine },
        { provide: NodeSchedulerService, useValue: mocks.nodeScheduler },
        { provide: ThrottleService, useValue: mocks.throttleService },
        { provide: EventBridgeService, useValue: mocks.eventBridge },
        {
          provide: ToolCallStateMachineService,
          useValue: mocks.toolCallStateMachine,
        },
        {
          provide: SessionPersistenceService,
          useValue: mocks.sessionPersistence,
        },
        {
          provide: InterventionPolicyService,
          useValue: mocks.interventionPolicy,
        },
        { provide: NotificationService, useValue: mocks.notificationService },
        {
          provide: LlmEncryptionService,
          useValue: mocks.llmEncryptionService,
        },
        {
          provide: SmartRoutingService,
          useValue: mocks.smartRoutingService,
        },
        {
          provide: OrganizationAutonomyPolicyService,
          useValue: mocks.organizationAutonomyPolicyService,
        },
        {
          provide: getQueueToken(AGENT_TASK_QUEUE),
          useValue: mocks.queue,
        },
      ],
    }).compile();

    worker = module.get(AgentTaskWorker);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('E2EE 启用时会加密完成结果并把 isEncrypted 传给步骤状态机', async () => {
    const encryptedPayload = createEncryptedPayload();
    queueStepAndOrgLookup({ id: ORG_ID });
    queueCompletionPrompt('这是机密输出');
    mocks.llmEncryptionService.isE2EEEnabled.mockResolvedValue(true);
    mocks.llmEncryptionService.encryptForTenant.mockResolvedValue(
      encryptedPayload,
    );

    await worker.process(createMockJob());

    const extra = getCompletedStepExtra();
    const result = extra.result as Record<string, unknown> & {
      encryptedContent?: EncryptedPayload;
      encryptionMetadata?: Record<string, unknown>;
    };

    expect(mocks.llmEncryptionService.isE2EEEnabled).toHaveBeenCalledWith(
      TENANT_ID,
      ORG_ID,
    );
    expect(mocks.llmEncryptionService.encryptForTenant).toHaveBeenCalledWith(
      TENANT_ID,
      ORG_ID,
      '这是机密输出',
    );
    expect(result.content).toBe('[ENCRYPTED]');
    expect(result.encryptedContent).toEqual(encryptedPayload);
    expect(result.encryptionMetadata).toEqual({
      algorithm: encryptedPayload.algorithm,
      keyFingerprint: encryptedPayload.keyFingerprint,
      encryptedAt: NOW.toISOString(),
    });
    expect(extra.isEncrypted).toBe(true);
    expect(mocks.nodeScheduler.onNodeCompleted).toHaveBeenCalledWith(
      EXECUTION_ID,
      STEP_ID,
      TENANT_ID,
    );
  });

  it('E2EE 禁用时保留明文结果且不写入加密载荷', async () => {
    queueStepAndOrgLookup({ id: ORG_ID });
    queueCompletionPrompt('保持明文');
    mocks.llmEncryptionService.isE2EEEnabled.mockResolvedValue(false);

    await worker.process(createMockJob());

    const extra = getCompletedStepExtra();
    const result = extra.result;

    expect(mocks.llmEncryptionService.isE2EEEnabled).toHaveBeenCalledWith(
      TENANT_ID,
      ORG_ID,
    );
    expect(mocks.llmEncryptionService.encryptForTenant).not.toHaveBeenCalled();
    expect(result.content).toBe('保持明文');
    expect(result).not.toHaveProperty('encryptedContent');
    expect(result).not.toHaveProperty('encryptionMetadata');
    expect(extra.isEncrypted).toBeUndefined();
  });

  it('加密失败时会优雅降级为明文并记录警告', async () => {
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});

    queueStepAndOrgLookup({ id: ORG_ID });
    queueCompletionPrompt('加密失败后保留的明文');
    mocks.llmEncryptionService.isE2EEEnabled.mockResolvedValue(true);
    mocks.llmEncryptionService.encryptForTenant.mockRejectedValue(
      new Error('tenant key unavailable'),
    );

    await worker.process(createMockJob());

    const extra = getCompletedStepExtra();
    const result = extra.result;

    expect(result.content).toBe('加密失败后保留的明文');
    expect(result.encryptionFailed).toBe(true);
    expect(result).not.toHaveProperty('encryptedContent');
    expect(extra.isEncrypted).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('E2EE: 加密失败，降级为明文存储'),
      { executionId: EXECUTION_ID, stepId: STEP_ID },
    );
  });

  it('resolveOrgId 返回 null 时会跳过 E2EE 且继续完成步骤', async () => {
    queueStepAndOrgLookup([]);
    queueCompletionPrompt('组织缺失时的输出');

    await worker.process(createMockJob());

    const extra = getCompletedStepExtra();
    const result = extra.result;

    expect(mocks.llmEncryptionService.isE2EEEnabled).not.toHaveBeenCalled();
    expect(mocks.llmEncryptionService.encryptForTenant).not.toHaveBeenCalled();
    expect(result.content).toBe('组织缺失时的输出');
    expect(result).not.toHaveProperty('encryptedContent');
    expect(result).not.toHaveProperty('encryptionMetadata');
    expect(extra.isEncrypted).toBeUndefined();
  });
});
