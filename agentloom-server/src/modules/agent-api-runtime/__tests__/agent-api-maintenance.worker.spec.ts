import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { AgentApiMaintenanceWorker } from '../agent-api-maintenance.worker';
import {
  AGENT_API_MAINTENANCE_JOB_NAME,
  AGENT_API_RUN_WORKER_LOST_ERROR,
} from '../agent-api-runtime.constants';

interface UpdateChain {
  set: Mock;
  where: Mock;
  returning: Mock;
  then: (resolve: (value: unknown) => void) => void;
}

function createUpdateChain(rows: unknown[]): UpdateChain {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
    then: (resolve: (value: unknown) => void) => resolve(undefined),
  };
}

function renderWhere(where: SQL) {
  return new PgDialect().sqlToQuery(where);
}

describe('AgentApiMaintenanceWorker', () => {
  const db = { update: vi.fn() };
  const runService = { publishTerminal: vi.fn() };
  const eventEmitter = { emit: vi.fn() };
  const configService = { get: vi.fn() };
  let worker: AgentApiMaintenanceWorker;
  let staleRunsUpdate: UpdateChain;
  let idempotencyUpdate: UpdateChain;
  let conversationsUpdate: UpdateChain;

  beforeEach(() => {
    vi.clearAllMocks();
    staleRunsUpdate = createUpdateChain([
      { id: 'run-1', tenantId: 'tenant-1' },
      { id: 'run-2', tenantId: 'tenant-2' },
      { id: 'run-3', tenantId: 'tenant-1' },
    ]);
    idempotencyUpdate = createUpdateChain([]);
    conversationsUpdate = createUpdateChain([
      { id: 'conversation-1', tenantId: 'tenant-1' },
    ]);
    db.update
      .mockReturnValueOnce(staleRunsUpdate)
      .mockReturnValueOnce(idempotencyUpdate)
      .mockReturnValueOnce(conversationsUpdate);
    runService.publishTerminal.mockResolvedValue(undefined);
    configService.get.mockReturnValue(undefined);
    worker = new AgentApiMaintenanceWorker(
      db as never,
      runService as never,
      eventEmitter as never,
      configService as never,
    );
  });

  it('超过 2 小时仍为 queued/running 的 run 标记为 run-worker-lost 并按租户发布终态', async () => {
    await worker.process({ name: AGENT_API_MAINTENANCE_JOB_NAME } as never);

    expect(staleRunsUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        error: AGENT_API_RUN_WORKER_LOST_ERROR,
      }),
    );
    const staleWhere = renderWhere(staleRunsUpdate.where.mock.calls[0][0]);
    expect(staleWhere.params).toEqual(['queued', 'running', 2]);
    expect(runService.publishTerminal).toHaveBeenCalledWith('tenant-1', [
      'run-1',
      'run-3',
    ]);
    expect(runService.publishTerminal).toHaveBeenCalledWith('tenant-2', [
      'run-2',
    ]);
  });

  it('清空 24 小时前的幂等记录', async () => {
    await worker.process({ name: AGENT_API_MAINTENANCE_JOB_NAME } as never);

    expect(idempotencyUpdate.set).toHaveBeenCalledWith({
      idempotencyKey: null,
      requestHash: null,
    });
    expect(
      renderWhere(idempotencyUpdate.where.mock.calls[0][0]).params,
    ).toEqual([24]);
  });

  it('结束空闲的 API 对话并发出与 Studio 同形的 ended 事件', async () => {
    configService.get.mockReturnValue('6');

    await worker.process({ name: AGENT_API_MAINTENANCE_JOB_NAME } as never);

    expect(conversationsUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ended' }),
    );
    expect(
      renderWhere(conversationsUpdate.where.mock.calls[0][0]).params,
    ).toEqual(['api', 'active', 6]);
    expect(eventEmitter.emit).toHaveBeenCalledWith('agent-conversation.ended', {
      conversationId: 'conversation-1',
      tenantId: 'tenant-1',
      organizationId: 'tenant-1',
      userId: null,
    });
  });

  it('空闲时长未配置或非法时使用默认 24 小时', async () => {
    configService.get.mockReturnValue('abc');

    await worker.process({ name: AGENT_API_MAINTENANCE_JOB_NAME } as never);

    expect(
      renderWhere(conversationsUpdate.where.mock.calls[0][0]).params,
    ).toEqual(['api', 'active', 24]);
  });

  it('单个租户发布终态失败不影响后续清扫', async () => {
    runService.publishTerminal.mockRejectedValueOnce(new Error('redis down'));

    await worker.process({ name: AGENT_API_MAINTENANCE_JOB_NAME } as never);

    expect(runService.publishTerminal).toHaveBeenCalledTimes(2);
    expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
  });
});
