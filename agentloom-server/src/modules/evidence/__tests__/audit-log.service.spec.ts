import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DRIZZLE } from '../../../database/database.module';
import { auditLogArchives, auditLogs } from '../../../database/schema';
import { AuditLogService } from '../audit-log.service';

const mocks = vi.hoisted(() => ({
  runInTenantTransaction: vi.fn(),
  transactionStorageGetStore: vi.fn(),
}));

vi.mock('../../../common/interceptors/tenant-transaction.context', () => ({
  runInTenantTransaction: mocks.runInTenantTransaction,
  transactionStorage: {
    getStore: mocks.transactionStorageGetStore,
  },
}));

const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';
const USER_ID = '550e8400-e29b-41d4-a716-446655440001';
const EXECUTION_ID = '550e8400-e29b-41d4-a716-446655440002';
const RESOURCE_ID = '550e8400-e29b-41d4-a716-446655440003';
const NOW = new Date('2026-03-17T10:00:00.000Z');
const LATER = new Date('2026-03-17T10:05:00.000Z');
const EARLIER = new Date('2026-03-17T09:55:00.000Z');

function createMockDb() {
  const returning = vi.fn().mockResolvedValue([
    {
      id: '550e8400-e29b-41d4-a716-446655440099',
      tenantId: TENANT_ID,
      actorId: USER_ID,
      actorType: 'user',
      eventType: 'organization.created',
      resourceType: 'organization',
      resourceId: RESOURCE_ID,
      executionId: EXECUTION_ID,
      summary: 'Organization created',
      before: null,
      after: { name: 'AgentLoom' },
      metadata: { source: 'http' },
      createdAt: NOW,
    },
  ]);
  const values = vi.fn().mockReturnValue({ returning });
  const insert = vi.fn().mockReturnValue({ values });

  return {
    insert,
    values,
    returning,
  };
}

function createAuditLogRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: '550e8400-e29b-41d4-a716-446655440099',
    tenantId: TENANT_ID,
    actorId: USER_ID,
    actorType: 'user' as const,
    eventType: 'organization.created',
    resourceType: 'organization',
    resourceId: RESOURCE_ID,
    executionId: EXECUTION_ID,
    summary: 'Organization created',
    before: null,
    after: { name: 'AgentLoom' },
    metadata: { source: 'http' },
    createdAt: NOW,
    ...overrides,
  };
}

type AuditLogRow = ReturnType<typeof createAuditLogRecord>;

const COLUMN_NAME_TO_ROW_KEY = {
  actor_id: 'actorId',
  actor_type: 'actorType',
  created_at: 'createdAt',
  event_type: 'eventType',
  execution_id: 'executionId',
  id: 'id',
  resource_id: 'resourceId',
  resource_type: 'resourceType',
  tenant_id: 'tenantId',
} as const satisfies Record<string, keyof AuditLogRow>;

function getStringChunkText(chunk: unknown): string | null {
  if (!chunk || typeof chunk !== 'object' || !('value' in chunk)) {
    return null;
  }

  const value = (chunk as { value?: unknown }).value;

  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .join('');
  }

  return null;
}

function isQueryContainer(chunk: unknown): chunk is { queryChunks: unknown[] } {
  return (
    !!chunk &&
    typeof chunk === 'object' &&
    Array.isArray((chunk as { queryChunks?: unknown }).queryChunks)
  );
}

function extractPredicates(
  whereClause: unknown,
): Array<(row: AuditLogRow) => boolean> {
  const predicates: Array<(row: AuditLogRow) => boolean> = [];

  function visit(chunk: unknown) {
    if (!isQueryContainer(chunk)) {
      return;
    }

    const comparison = parseComparison(chunk.queryChunks);

    if (comparison) {
      predicates.push(buildPredicate(comparison));
      return;
    }

    for (const child of chunk.queryChunks) {
      visit(child);
    }
  }

  visit(whereClause);
  return predicates;
}

function parseComparison(queryChunks: unknown[]) {
  let columnName: keyof typeof COLUMN_NAME_TO_ROW_KEY | null = null;
  let operator: '=' | '>=' | '<=' | null = null;
  let value: unknown;
  let hasNestedSql = false;

  for (const chunk of queryChunks) {
    if (isQueryContainer(chunk)) {
      hasNestedSql = true;
      continue;
    }

    if (
      chunk &&
      typeof chunk === 'object' &&
      'name' in chunk &&
      typeof (chunk as { name: unknown }).name === 'string' &&
      (chunk as { name: string }).name in COLUMN_NAME_TO_ROW_KEY
    ) {
      columnName = (chunk as { name: keyof typeof COLUMN_NAME_TO_ROW_KEY })
        .name;
      continue;
    }

    const text = getStringChunkText(chunk)?.trim();

    if (text === '=' || text === '>=' || text === '<=') {
      operator = text;
      continue;
    }

    if (
      chunk &&
      typeof chunk === 'object' &&
      'value' in chunk &&
      'encoder' in chunk
    ) {
      value = (chunk as { value: unknown }).value;
    }
  }

  if (hasNestedSql || !columnName || !operator || value === undefined) {
    return null;
  }

  return { columnName, operator, value };
}

type ComparableValue = string | number | null | undefined;

function normalizeComparableValue(value: unknown): ComparableValue {
  if (value instanceof Date) {
    return value.getTime();
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number'
  ) {
    return value;
  }

  return String(value);
}

function buildPredicate(comparison: {
  columnName: keyof typeof COLUMN_NAME_TO_ROW_KEY;
  operator: '=' | '>=' | '<=';
  value: unknown;
}) {
  const rowKey = COLUMN_NAME_TO_ROW_KEY[comparison.columnName];
  const expected: ComparableValue = normalizeComparableValue(comparison.value);

  return (row: AuditLogRow) => {
    const actual: ComparableValue = normalizeComparableValue(row[rowKey]);

    if (actual === null || actual === undefined) {
      return false;
    }

    switch (comparison.operator) {
      case '=':
        return actual === expected;
      case '>=':
        if (
          expected === null ||
          expected === undefined ||
          (typeof actual !== 'string' && typeof actual !== 'number') ||
          (typeof expected !== 'string' && typeof expected !== 'number')
        ) {
          return false;
        }

        {
          const actualComparable: string | number = actual;
          const expectedComparable: string | number = expected;
          return actualComparable >= expectedComparable;
        }
      case '<=':
        if (
          expected === null ||
          expected === undefined ||
          (typeof actual !== 'string' && typeof actual !== 'number') ||
          (typeof expected !== 'string' && typeof expected !== 'number')
        ) {
          return false;
        }

        {
          const actualComparable: string | number = actual;
          const expectedComparable: string | number = expected;
          return actualComparable <= expectedComparable;
        }
    }
  };
}

function filterRowsByWhereClause(rows: AuditLogRow[], whereClause: unknown) {
  const predicates = extractPredicates(whereClause);

  return rows.filter((row) => predicates.every((predicate) => predicate(row)));
}

function createTenantSelectDb(results: Map<object, unknown[]>) {
  const from = vi.fn().mockImplementation((table: object) => {
    return {
      where: vi.fn().mockImplementation((whereClause: unknown) => {
        const rows = (results.get(table) ?? []) as AuditLogRow[];
        const filteredRows = filterRowsByWhereClause(rows, whereClause);
        const orderedQuery = Object.assign(Promise.resolve(filteredRows), {
          limit: vi
            .fn()
            .mockImplementation(async (limit: number) =>
              filteredRows.slice(0, limit),
            ),
        });

        return {
          orderBy: vi.fn().mockReturnValue(orderedQuery),
        };
      }),
    };
  });

  return {
    select: vi.fn().mockReturnValue({ from }),
    from,
  };
}

describe('AuditLogService', () => {
  let moduleRef: TestingModule;
  let service: AuditLogService;
  let tenantDb: ReturnType<typeof createMockDb>;
  const rootDb = { label: 'root-db' };

  beforeEach(async () => {
    tenantDb = createMockDb();

    mocks.runInTenantTransaction.mockReset();
    mocks.transactionStorageGetStore.mockReset();
    mocks.runInTenantTransaction.mockImplementation(
      async (
        _db: unknown,
        _tenantId: string,
        operation: (db: typeof tenantDb) => Promise<unknown>,
      ) => operation(tenantDb),
    );
    mocks.transactionStorageGetStore.mockReturnValue(undefined);

    moduleRef = await Test.createTestingModule({
      providers: [
        AuditLogService,
        {
          provide: DRIZZLE,
          useValue: rootDb,
        },
      ],
    }).compile();

    service = moduleRef.get(AuditLogService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('should insert audit logs through tenant transaction and return the record', async () => {
    const result = await service.record({
      tenantId: TENANT_ID,
      actorId: USER_ID,
      actorType: 'user',
      eventType: 'organization.created',
      resourceType: 'organization',
      resourceId: RESOURCE_ID,
      executionId: EXECUTION_ID,
      summary: 'Organization created',
      after: { name: 'AgentLoom' },
      metadata: { source: 'http' },
    });

    expect(mocks.runInTenantTransaction).toHaveBeenCalledWith(
      rootDb,
      TENANT_ID,
      expect.any(Function),
    );
    expect(tenantDb.insert).toHaveBeenCalledWith(auditLogs);
    expect(tenantDb.values).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: USER_ID,
      actorType: 'user',
      eventType: 'organization.created',
      resourceType: 'organization',
      resourceId: RESOURCE_ID,
      executionId: EXECUTION_ID,
      summary: 'Organization created',
      before: null,
      after: { name: 'AgentLoom' },
      metadata: { source: 'http' },
    });
    expect(result).toEqual({
      id: '550e8400-e29b-41d4-a716-446655440099',
      tenantId: TENANT_ID,
      actorId: USER_ID,
      actorType: 'user',
      eventType: 'organization.created',
      resourceType: 'organization',
      resourceId: RESOURCE_ID,
      executionId: EXECUTION_ID,
      summary: 'Organization created',
      before: null,
      after: { name: 'AgentLoom' },
      metadata: { source: 'http' },
      createdAt: NOW,
    });
  });

  it('should merge hot and archive rows with stable ordering and hot-first dedupe', async () => {
    const mergedDb = createTenantSelectDb(
      new Map<object, unknown[]>([
        [
          auditLogs,
          [
            createAuditLogRecord({
              id: '00000000-0000-4000-8000-000000000003',
              createdAt: LATER,
              summary: 'hot-later',
            }),
            createAuditLogRecord({
              id: '00000000-0000-4000-8000-000000000002',
              createdAt: NOW,
              summary: 'hot-duplicate',
            }),
          ],
        ],
        [
          auditLogArchives,
          [
            createAuditLogRecord({
              id: '00000000-0000-4000-8000-000000000001',
              createdAt: EARLIER,
              summary: 'archive-earlier',
            }),
            createAuditLogRecord({
              id: '00000000-0000-4000-8000-000000000002',
              createdAt: NOW,
              summary: 'archive-duplicate',
            }),
          ],
        ],
      ]),
    );

    moduleRef = await Test.createTestingModule({
      providers: [
        AuditLogService,
        {
          provide: DRIZZLE,
          useValue: mergedDb,
        },
      ],
    }).compile();

    service = moduleRef.get(AuditLogService);

    const result = await service.list(TENANT_ID, {
      page: 1,
      pageSize: 10,
    });

    expect(result.total).toBe(3);
    expect(result.data.map((record) => [record.id, record.summary])).toEqual([
      ['00000000-0000-4000-8000-000000000001', 'archive-earlier'],
      ['00000000-0000-4000-8000-000000000002', 'hot-duplicate'],
      ['00000000-0000-4000-8000-000000000003', 'hot-later'],
    ]);
  });

  it('should derive list page slices from the same merged deduped set', async () => {
    const mergedDb = createTenantSelectDb(
      new Map<object, unknown[]>([
        [
          auditLogs,
          [
            createAuditLogRecord({
              id: '00000000-0000-4000-8000-000000000003',
              createdAt: LATER,
            }),
          ],
        ],
        [
          auditLogArchives,
          [
            createAuditLogRecord({
              id: '00000000-0000-4000-8000-000000000001',
              createdAt: EARLIER,
            }),
            createAuditLogRecord({
              id: '00000000-0000-4000-8000-000000000002',
              createdAt: NOW,
            }),
          ],
        ],
      ]),
    );

    moduleRef = await Test.createTestingModule({
      providers: [
        AuditLogService,
        {
          provide: DRIZZLE,
          useValue: mergedDb,
        },
      ],
    }).compile();

    service = moduleRef.get(AuditLogService);

    const result = await service.list(TENANT_ID, {
      page: 2,
      pageSize: 2,
    });

    expect(result.total).toBe(3);
    expect(result.data.map((record) => record.id)).toEqual([
      '00000000-0000-4000-8000-000000000003',
    ]);
  });

  it('should resolve detail from archive when hot storage misses', async () => {
    const mergedDb = createTenantSelectDb(
      new Map<object, unknown[]>([
        [auditLogs, []],
        [
          auditLogArchives,
          [
            createAuditLogRecord({
              id: '00000000-0000-4000-8000-000000000010',
              summary: 'archive-only',
            }),
          ],
        ],
      ]),
    );

    moduleRef = await Test.createTestingModule({
      providers: [
        AuditLogService,
        {
          provide: DRIZZLE,
          useValue: mergedDb,
        },
      ],
    }).compile();

    service = moduleRef.get(AuditLogService);

    await expect(
      service.findById(TENANT_ID, '00000000-0000-4000-8000-000000000010'),
    ).resolves.toMatchObject({
      id: '00000000-0000-4000-8000-000000000010',
      summary: 'archive-only',
    });
  });

  it('should throw NotFoundException when detail does not exist in hot or archive', async () => {
    const mergedDb = createTenantSelectDb(
      new Map<object, unknown[]>([
        [auditLogs, []],
        [auditLogArchives, []],
      ]),
    );

    moduleRef = await Test.createTestingModule({
      providers: [
        AuditLogService,
        {
          provide: DRIZZLE,
          useValue: mergedDb,
        },
      ],
    }).compile();

    service = moduleRef.get(AuditLogService);

    await expect(
      service.findById(TENANT_ID, '00000000-0000-4000-8000-000000000011'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should recall resource sequence across hot and archive in chronological order', async () => {
    const mergedDb = createTenantSelectDb(
      new Map<object, unknown[]>([
        [
          auditLogs,
          [
            createAuditLogRecord({
              id: '00000000-0000-4000-8000-000000000013',
              createdAt: LATER,
              summary: 'hot-sequence',
            }),
          ],
        ],
        [
          auditLogArchives,
          [
            createAuditLogRecord({
              id: '00000000-0000-4000-8000-000000000012',
              createdAt: EARLIER,
              summary: 'archive-sequence',
            }),
          ],
        ],
      ]),
    );

    moduleRef = await Test.createTestingModule({
      providers: [
        AuditLogService,
        {
          provide: DRIZZLE,
          useValue: mergedDb,
        },
      ],
    }).compile();

    service = moduleRef.get(AuditLogService);

    const result = await service.findResourceSequence(
      TENANT_ID,
      'organization',
      RESOURCE_ID,
    );

    expect(result.map((record) => [record.id, record.summary])).toEqual([
      ['00000000-0000-4000-8000-000000000012', 'archive-sequence'],
      ['00000000-0000-4000-8000-000000000013', 'hot-sequence'],
    ]);
  });

  it('should apply from/to createdAt filters across hot and archive recall', async () => {
    const mergedDb = createTenantSelectDb(
      new Map<object, unknown[]>([
        [
          auditLogs,
          [
            createAuditLogRecord({
              id: '00000000-0000-4000-8000-000000000020',
              createdAt: NOW,
              summary: 'hot-in-window',
            }),
            createAuditLogRecord({
              id: '00000000-0000-4000-8000-000000000021',
              createdAt: LATER,
              summary: 'hot-after-window',
            }),
          ],
        ],
        [
          auditLogArchives,
          [
            createAuditLogRecord({
              id: '00000000-0000-4000-8000-000000000022',
              createdAt: EARLIER,
              summary: 'archive-before-window',
            }),
          ],
        ],
      ]),
    );

    moduleRef = await Test.createTestingModule({
      providers: [
        AuditLogService,
        {
          provide: DRIZZLE,
          useValue: mergedDb,
        },
      ],
    }).compile();

    service = moduleRef.get(AuditLogService);

    const result = await service.list(TENANT_ID, {
      page: 1,
      pageSize: 10,
      from: new Date('2026-03-17T09:58:00.000Z'),
      to: new Date('2026-03-17T10:02:00.000Z'),
    });

    expect(result.total).toBe(1);
    expect(result.data.map((record) => [record.id, record.summary])).toEqual([
      ['00000000-0000-4000-8000-000000000020', 'hot-in-window'],
    ]);
  });
});
