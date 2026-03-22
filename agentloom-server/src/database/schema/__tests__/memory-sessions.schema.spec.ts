import { getTableColumns } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  memorySessions as barrelMemorySessions,
  memorySessionRoleEnum as barrelMemorySessionRoleEnum,
  memorySessionStatusEnum as barrelMemorySessionStatusEnum,
} from '..';
import {
  memorySessions,
  memorySessionRoleEnum,
  memorySessionStatusEnum,
  type MemorySession,
  type MemorySessionConfig,
  type NewMemorySession,
} from '../memory-sessions.schema';

type MemorySessionConfigHasBootUris =
  MemorySessionConfig extends { bootUris: string[]; fusionPriority: number }
    ? true
    : false;

type DirectImportSmoke = [MemorySession, NewMemorySession, MemorySessionConfig];
type BarrelImportSmoke = [
  import('..').MemorySession,
  import('..').NewMemorySession,
  import('..').MemorySessionConfig,
];

describe('memory_sessions schema', () => {
  it('exports table, enums, and types from direct file and schema barrel', () => {
    expect(barrelMemorySessions).toBe(memorySessions);
    expect(barrelMemorySessionRoleEnum).toBe(memorySessionRoleEnum);
    expect(barrelMemorySessionStatusEnum).toBe(memorySessionStatusEnum);

    const directSmoke: DirectImportSmoke | null = null;
    const barrelSmoke: BarrelImportSmoke | null = null;
    const configSmoke: MemorySessionConfigHasBootUris = true;

    expect(directSmoke).toBeNull();
    expect(barrelSmoke).toBeNull();
    expect(configSmoke).toBe(true);
  });

  it('defines memory_sessions with correct column set and nullability', () => {
    const columns = getTableColumns(memorySessions);
    const tableConfig = getTableConfig(memorySessions);

    expect(tableConfig.name).toBe('memory_sessions');
    expect(Object.keys(columns)).toEqual(
      expect.arrayContaining([
        'id',
        'tenantId',
        'memoryInstanceId',
        'executionId',
        'agentConversationId',
        'role',
        'status',
        'config',
        'createdAt',
        'updatedAt',
      ]),
    );

    expect(columns.id.hasDefault).toBe(true);
    expect(columns.tenantId.notNull).toBe(true);
    expect(columns.memoryInstanceId.notNull).toBe(true);
    // Nullable dual FK columns
    expect(columns.executionId.notNull).toBe(false);
    expect(columns.agentConversationId.notNull).toBe(false);
    expect(columns.role.getSQLType()).toBe('memory_session_role_enum');
    expect(columns.role.notNull).toBe(true);
    expect(columns.role.hasDefault).toBe(true);
    expect(columns.status.getSQLType()).toBe('memory_session_status_enum');
    expect(columns.status.notNull).toBe(true);
    expect(columns.status.hasDefault).toBe(true);
    expect(columns.createdAt.notNull).toBe(true);
    expect(columns.createdAt.hasDefault).toBe(true);
    expect(columns.updatedAt.notNull).toBe(true);
    expect(columns.updatedAt.hasDefault).toBe(true);
  });

  it('defines partial unique indexes and regular indexes', () => {
    const tableConfig = getTableConfig(memorySessions);
    const indexNames = tableConfig.indexes.map((idx) => idx.config.name);

    expect(indexNames).toEqual(
      expect.arrayContaining([
        'uq_memory_sessions_instance_execution_active',
        'uq_memory_sessions_instance_conversation_active',
        'idx_memory_sessions_execution_id',
        'idx_memory_sessions_agent_conversation_id',
        'idx_memory_sessions_instance_status',
      ]),
    );
  });

  it('defines CHECK constraint chk_memory_sessions_fk for dual FK invariant', () => {
    const tableConfig = getTableConfig(memorySessions);

    expect(
      tableConfig.checks.some((c) => c.name === 'chk_memory_sessions_fk'),
    ).toBe(true);
  });

  it('has 4 direct tenant RLS policies', () => {
    const tableConfig = getTableConfig(memorySessions);

    expect(tableConfig.policies).toHaveLength(4);
  });

  it('defines correct FK references with cascade delete', () => {
    const tableConfig = getTableConfig(memorySessions);
    const fks = tableConfig.foreignKeys.map((fk) => {
      const ref = fk.reference();

      return {
        columns: ref.columns.map((c) => c.name),
        foreignTable: getTableConfig(ref.foreignTable).name,
        onDelete: fk.onDelete,
      };
    });

    expect(fks).toContainEqual({
      columns: ['memory_instance_id'],
      foreignTable: 'agent_memory_instances',
      onDelete: 'cascade',
    });
    expect(fks).toContainEqual({
      columns: ['execution_id'],
      foreignTable: 'workflow_executions',
      onDelete: 'cascade',
    });
    expect(fks).toContainEqual({
      columns: ['agent_conversation_id'],
      foreignTable: 'agent_conversations',
      onDelete: 'cascade',
    });
  });

  it('memorySessionRoleEnum covers primary and readonly', () => {
    expect(memorySessionRoleEnum.enumValues).toEqual(['primary', 'readonly']);
  });

  it('memorySessionStatusEnum covers active, disconnected, expired', () => {
    expect(memorySessionStatusEnum.enumValues).toEqual([
      'active',
      'disconnected',
      'expired',
    ]);
  });
});
