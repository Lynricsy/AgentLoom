import type * as BullMq from 'bullmq';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';

const queueEventsInstances: Array<{ close: Mock }> = [];

vi.mock('bullmq', async (importOriginal) => {
  const actual = await importOriginal<typeof BullMq>();
  class FakeQueueEvents {
    readonly close = vi.fn().mockResolvedValue(undefined);
    readonly waitUntilReady = vi.fn().mockResolvedValue(undefined);
    constructor() {
      queueEventsInstances.push(this);
    }
  }
  return { ...actual, QueueEvents: FakeQueueEvents };
});

import { GeneratedAppBrowserAcceptanceDispatcher } from '../generated-app-browser-acceptance.dispatcher';
import type {
  GeneratedAppBrowserAcceptanceJob,
  GeneratedAppBrowserAcceptanceResult,
} from '../types/browser-acceptance-job.schema';

const TENANT_ID = '01a15800-0000-7000-8000-0000000000a1';
const APP_ID = '01a15800-0000-7000-8000-0000000000b2';
const RUN_ID = '01a15800-0000-7000-8000-0000000000c3';
const TOKEN = 'ef'.repeat(32);
const SCENARIO_TIMEOUT_MS = 180_000;
const TOTAL_TIMEOUT_MS = 900_000;
const WAIT_MS = TOTAL_TIMEOUT_MS + 30_000;

const REQUEST = {
  tenantId: TENANT_ID,
  appId: APP_ID,
  generationRunId: RUN_ID,
  viewports: [
    'desktop',
    'mobile',
  ] as GeneratedAppBrowserAcceptanceJob['viewports'],
  scenarios: [
    {
      scenarioId: 'scenario-ask',
      steps: [
        {
          action: 'fill' as const,
          fieldId: 'question',
          value: '几个子 Agent？',
        },
        { action: 'submit' as const },
      ],
    },
  ],
};

const RESULT: GeneratedAppBrowserAcceptanceResult = {
  jobVersion: 1,
  status: 'passed',
  runnerError: null,
  browser: { name: 'chromium', version: '156.0.8078.4' },
  playwrightVersion: '1.64.1',
  startedAt: '2026-10-20T04:00:00.000Z',
  completedAt: '2026-10-20T04:00:05.000Z',
  scenarios: [],
};

function createHarness() {
  const queuedJob = {
    waitUntilFinished: vi.fn().mockResolvedValue(RESULT),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  const queue = {
    opts: { connection: { host: '127.0.0.1', port: 6379 }, prefix: 'bull' },
    getWorkers: vi.fn().mockResolvedValue([{ id: 'runner-1' }]),
    getJob: vi.fn().mockResolvedValue(undefined),
    add: vi.fn().mockResolvedValue(queuedJob),
  };
  const tokenStore = {
    issueAcceptanceToken: vi.fn().mockResolvedValue({
      token: TOKEN,
      expiresAt: new Date('2026-10-20T04:16:00.000Z'),
    }),
    revokeAcceptanceToken: vi.fn().mockResolvedValue(undefined),
  };
  const configService = {
    get: vi.fn((key: string) =>
      key === 'APP_GENERATED_APP_BROWSER_SCENARIO_TIMEOUT_MS'
        ? SCENARIO_TIMEOUT_MS
        : TOTAL_TIMEOUT_MS,
    ),
  };
  const dispatcher = new GeneratedAppBrowserAcceptanceDispatcher(
    queue as never,
    tokenStore as never,
    configService as never,
  );
  return { dispatcher, queue, queuedJob, tokenStore };
}

describe('GeneratedAppBrowserAcceptanceDispatcher', () => {
  beforeEach(() => {
    queueEventsInstances.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('没有在线 runner 时立即返回 runner-unavailable，不签发令牌也不投递', async () => {
    const { dispatcher, queue, tokenStore } = createHarness();
    queue.getWorkers.mockResolvedValue([]);

    const outcome = await dispatcher.dispatch(
      REQUEST,
      new AbortController().signal,
    );

    expect(outcome.kind).toBe('runner-unavailable');
    expect(tokenStore.issueAcceptanceToken).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('签发令牌、按契约投递任务、等待结果并在结束后撤销令牌', async () => {
    const { dispatcher, queue, queuedJob, tokenStore } = createHarness();

    const outcome = await dispatcher.dispatch(
      REQUEST,
      new AbortController().signal,
    );

    expect(outcome).toEqual({
      kind: 'completed',
      jobId: `gate5-${RUN_ID}`,
      result: RESULT,
    });
    expect(tokenStore.issueAcceptanceToken).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      appId: APP_ID,
      generationRunId: RUN_ID,
      ttlMs: TOTAL_TIMEOUT_MS + 60_000,
    });
    expect(queue.add).toHaveBeenCalledWith(
      'gate-5-browser-acceptance',
      {
        jobVersion: 1,
        tenantId: TENANT_ID,
        appId: APP_ID,
        generationRunId: RUN_ID,
        acceptanceToken: TOKEN,
        viewports: ['desktop', 'mobile'],
        scenarios: REQUEST.scenarios,
        limits: {
          scenarioTimeoutMs: SCENARIO_TIMEOUT_MS,
          totalTimeoutMs: TOTAL_TIMEOUT_MS,
        },
        artifactPrefix: `tenants/${TENANT_ID}/generated-apps/${APP_ID}/runs/${RUN_ID}/gate-5`,
      },
      expect.objectContaining({ jobId: `gate5-${RUN_ID}`, attempts: 1 }),
    );
    expect(queuedJob.waitUntilFinished).toHaveBeenCalledWith(
      queueEventsInstances[0],
      WAIT_MS,
    );
    expect(tokenStore.revokeAcceptanceToken).toHaveBeenCalledWith(
      TENANT_ID,
      APP_ID,
    );
    // 撤销发生在拿到结果之后
    expect(
      tokenStore.revokeAcceptanceToken.mock.invocationCallOrder[0],
    ).toBeGreaterThan(queuedJob.waitUntilFinished.mock.invocationCallOrder[0]);
  });

  it('等待超过总超时 + 30s 时返回 runner-timeout，删除未执行的任务并撤销令牌', async () => {
    const { dispatcher, queuedJob, tokenStore } = createHarness();
    let clock = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => clock);
    queuedJob.waitUntilFinished.mockImplementation(async () => {
      clock += WAIT_MS;
      throw new Error(
        `Job wait gate-5-browser-acceptance timed out before finishing, no finish notification arrived after ${WAIT_MS}ms`,
      );
    });

    const outcome = await dispatcher.dispatch(
      REQUEST,
      new AbortController().signal,
    );

    expect(outcome).toMatchObject({
      kind: 'runner-timeout',
      jobId: `gate5-${RUN_ID}`,
      waitedMs: WAIT_MS,
    });
    expect(queuedJob.remove).toHaveBeenCalled();
    expect(tokenStore.revokeAcceptanceToken).toHaveBeenCalledWith(
      TENANT_ID,
      APP_ID,
    );
  });

  it('runner 把任务判失败时返回 runner-failed 并撤销令牌', async () => {
    const { dispatcher, queuedJob, tokenStore } = createHarness();
    queuedJob.waitUntilFinished.mockRejectedValue(
      new Error('Gate 5 验收任务格式无效：limits: Required'),
    );

    const outcome = await dispatcher.dispatch(
      REQUEST,
      new AbortController().signal,
    );

    expect(outcome).toMatchObject({
      kind: 'runner-failed',
      jobId: `gate5-${RUN_ID}`,
    });
    expect(outcome.kind === 'runner-failed' && outcome.message).toContain(
      '格式无效',
    );
    expect(tokenStore.revokeAcceptanceToken).toHaveBeenCalledTimes(1);
  });

  it('runner 回传值不符合结果契约时返回 runner-failed', async () => {
    const { dispatcher, queuedJob } = createHarness();
    queuedJob.waitUntilFinished.mockResolvedValue({ status: 'passed' });

    const outcome = await dispatcher.dispatch(
      REQUEST,
      new AbortController().signal,
    );

    expect(outcome.kind).toBe('runner-failed');
  });

  it('运行截止信号在等待中触发时立即返回 runner-timeout，删除任务并撤销令牌', async () => {
    const { dispatcher, queuedJob, tokenStore } = createHarness();
    const controller = new AbortController();
    queuedJob.waitUntilFinished.mockImplementation(() => {
      setTimeout(() => controller.abort(), 5);
      return new Promise(() => {});
    });

    const outcome = await dispatcher.dispatch(REQUEST, controller.signal);

    expect(outcome).toMatchObject({
      kind: 'runner-timeout',
      jobId: `gate5-${RUN_ID}`,
      message: '生成运行已到截止时间，Gate 5 等待被取消。',
    });
    expect(queuedJob.remove).toHaveBeenCalled();
    expect(tokenStore.revokeAcceptanceToken).toHaveBeenCalledWith(
      TENANT_ID,
      APP_ID,
    );
  });

  it('信号在投递前已触发时不签发令牌也不投递', async () => {
    const { dispatcher, queue, tokenStore } = createHarness();
    const controller = new AbortController();
    controller.abort();

    const outcome = await dispatcher.dispatch(REQUEST, controller.signal);

    expect(outcome).toMatchObject({ kind: 'runner-timeout', jobId: null });
    expect(tokenStore.issueAcceptanceToken).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('同一运行已结束的旧任务先删除再投递，避免被 jobId 去重成旧结果', async () => {
    const { dispatcher, queue } = createHarness();
    const previous = {
      getState: vi.fn().mockResolvedValue('completed'),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    queue.getJob.mockResolvedValue(previous);

    const outcome = await dispatcher.dispatch(
      REQUEST,
      new AbortController().signal,
    );

    expect(outcome.kind).toBe('completed');
    expect(previous.remove).toHaveBeenCalled();
    expect(previous.remove.mock.invocationCallOrder[0]).toBeLessThan(
      queue.add.mock.invocationCallOrder[0],
    );
  });

  it('同一运行的旧任务仍在执行时不重复投递，也不签发新令牌', async () => {
    const { dispatcher, queue, tokenStore } = createHarness();
    queue.getJob.mockResolvedValue({
      getState: vi.fn().mockResolvedValue('active'),
      remove: vi.fn(),
    });

    const outcome = await dispatcher.dispatch(
      REQUEST,
      new AbortController().signal,
    );

    expect(outcome).toMatchObject({ kind: 'runner-failed', jobId: null });
    expect(tokenStore.issueAcceptanceToken).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('撤销令牌失败不影响已拿到的结果（令牌仍按 TTL 过期）', async () => {
    const { dispatcher, tokenStore } = createHarness();
    tokenStore.revokeAcceptanceToken.mockRejectedValue(new Error('db down'));

    const outcome = await dispatcher.dispatch(
      REQUEST,
      new AbortController().signal,
    );

    expect(outcome.kind).toBe('completed');
  });

  it('QueueEvents 只创建一次，模块销毁时关闭', async () => {
    const { dispatcher } = createHarness();

    await dispatcher.dispatch(REQUEST, new AbortController().signal);
    await dispatcher.dispatch(REQUEST, new AbortController().signal);
    await dispatcher.onModuleDestroy();

    expect(queueEventsInstances).toHaveLength(1);
    expect(queueEventsInstances[0].close).toHaveBeenCalled();
  });
});
