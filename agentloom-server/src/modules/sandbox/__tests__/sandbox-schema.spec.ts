import { getTableColumns, getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
  sandboxLogs,
  sandboxSessionStatusEnum,
  sandboxSessions,
  type NewSandboxLog,
  type NewSandboxSession,
  type SandboxConfig,
  type SandboxLog,
  type SandboxSession,
} from '../../../database/schema';

describe('sandboxSessionStatusEnum', () => {
  it('应包含 6 个状态值', () => {
    expect(sandboxSessionStatusEnum.enumValues).toEqual([
      'creating',
      'ready',
      'busy',
      'stopping',
      'stopped',
      'failed',
    ]);
  });

  it('enum 名称应为 sandbox_session_status_enum', () => {
    expect(sandboxSessionStatusEnum.enumName).toBe(
      'sandbox_session_status_enum',
    );
  });
});

describe('sandboxSessions 表定义', () => {
  const columns = getTableColumns(sandboxSessions);

  it('表名应为 sandbox_sessions', () => {
    expect(getTableName(sandboxSessions)).toBe('sandbox_sessions');
  });

  it('应包含 11 个字段', () => {
    const columnNames = Object.keys(columns);
    expect(columnNames).toHaveLength(11);
    expect(columnNames).toEqual(
      expect.arrayContaining([
        'id',
        'executionId',
        'sandboxNodeId',
        'tenantId',
        'containerId',
        'status',
        'config',
        'workspacePath',
        'startedAt',
        'stoppedAt',
        'createdAt',
      ]),
    );
  });

  it('id 应为主键且有默认值', () => {
    expect(columns.id.primary).toBe(true);
    expect(columns.id.hasDefault).toBe(true);
  });

  it('executionId 应不可为空', () => {
    expect(columns.executionId.notNull).toBe(true);
  });

  it('containerId 应可为空', () => {
    expect(columns.containerId.notNull).toBe(false);
  });

  it('status 默认值应为 creating', () => {
    expect(columns.status.hasDefault).toBe(true);
  });

  it('config 应不可为空', () => {
    expect(columns.config.notNull).toBe(true);
  });

  it('startedAt 和 stoppedAt 应可为空', () => {
    expect(columns.startedAt.notNull).toBe(false);
    expect(columns.stoppedAt.notNull).toBe(false);
  });

  it('createdAt 应不可为空且有默认值', () => {
    expect(columns.createdAt.notNull).toBe(true);
    expect(columns.createdAt.hasDefault).toBe(true);
  });
});

describe('sandboxLogs 表定义', () => {
  const columns = getTableColumns(sandboxLogs);

  it('表名应为 sandbox_logs', () => {
    expect(getTableName(sandboxLogs)).toBe('sandbox_logs');
  });

  it('应包含 5 个字段', () => {
    const columnNames = Object.keys(columns);
    expect(columnNames).toHaveLength(5);
    expect(columnNames).toEqual(
      expect.arrayContaining([
        'id',
        'sessionId',
        'level',
        'message',
        'createdAt',
      ]),
    );
  });

  it('sessionId 应不可为空', () => {
    expect(columns.sessionId.notNull).toBe(true);
  });

  it('level 应不可为空', () => {
    expect(columns.level.notNull).toBe(true);
  });

  it('message 应不可为空', () => {
    expect(columns.message.notNull).toBe(true);
  });
});

describe('SandboxConfig 类型契约', () => {
  it('应满足必需字段与可选字段的类型约束', () => {
    const config: SandboxConfig = {
      cpu: 1,
      memory: 512,
      disk: 2,
      timeout: 2,
    };
    expect(config.cpu).toBe(1);
    expect(config.memory).toBe(512);
    expect(config.disk).toBe(2);
    expect(config.timeout).toBe(2);
    expect(config.persistencePath).toBeUndefined();
  });

  it('persistencePath 为可选字段', () => {
    const config: SandboxConfig = {
      cpu: 2,
      memory: 1024,
      disk: 5,
      timeout: 4,
      persistencePath: '/minio/workspace',
    };
    expect(config.persistencePath).toBe('/minio/workspace');
  });
});

describe('推断类型导出验证', () => {
  it('SandboxSession 类型应可赋值', () => {
    const session: SandboxSession = {
      id: '00000000-0000-0000-0000-000000000001',
      executionId: '00000000-0000-0000-0000-000000000002',
      sandboxNodeId: 'sandbox-1',
      tenantId: '00000000-0000-0000-0000-000000000003',
      containerId: null,
      status: 'creating',
      config: { cpu: 1, memory: 512, disk: 2, timeout: 2 },
      workspacePath: null,
      agentConversationId: null,
      startedAt: null,
      stoppedAt: null,
      createdAt: new Date(),
    };
    expect(session.status).toBe('creating');
  });

  it('NewSandboxSession 类型应允许省略有默认值的字段', () => {
    const input: NewSandboxSession = {
      executionId: '00000000-0000-0000-0000-000000000002',
      sandboxNodeId: 'sandbox-1',
      tenantId: '00000000-0000-0000-0000-000000000003',
      config: { cpu: 1, memory: 512, disk: 2, timeout: 2 },
    };
    expect(input.executionId).toBeDefined();
    expect(input.id).toBeUndefined();
  });

  it('SandboxLog 类型应可赋值', () => {
    const log: SandboxLog = {
      id: '00000000-0000-0000-0000-000000000001',
      sessionId: '00000000-0000-0000-0000-000000000002',
      level: 'stdout',
      message: 'Hello from sandbox',
      createdAt: new Date(),
    };
    expect(log.level).toBe('stdout');
  });

  it('NewSandboxLog 类型应允许省略有默认值的字段', () => {
    const input: NewSandboxLog = {
      sessionId: '00000000-0000-0000-0000-000000000002',
      level: 'stderr',
      message: 'Error occurred',
    };
    expect(input.sessionId).toBeDefined();
    expect(input.id).toBeUndefined();
  });
});
