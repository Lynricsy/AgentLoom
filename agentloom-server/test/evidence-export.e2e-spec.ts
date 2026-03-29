import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.mock('@anatine/zod-nestjs', async () => {
  const { createZodDto } = await import('nestjs-zod');
  return { createZodDto };
});

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import * as crypto from 'node:crypto';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import type { FastifyRequest } from 'fastify';
import type { JSONValue } from 'postgres';

import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import type { JwtPayload } from '../src/common/guards/auth.guard';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import { RedisCacheService } from '../src/common/redis/redis-cache.service';
import { RedisPubSubService } from '../src/common/redis/redis-pubsub.service';
import { RbacCacheService } from '../src/common/services/rbac-cache.service';
import { DRIZZLE, type DrizzleDB } from '../src/database/database.module';
import { StorageService } from '../src/infrastructure/storage/storage.service';
import { AuditLogService } from '../src/modules/evidence/audit-log.service';
import { EvidenceExportController } from '../src/modules/evidence/evidence-export.controller';
import { EvidenceExportAccessGuard } from '../src/modules/evidence/evidence-export-access.guard';
import {
  buildEvidenceExportArchiveFileName,
  buildEvidenceExportStorageKey,
  EVIDENCE_EXPORT_ARTIFACT_FORMAT,
  EVIDENCE_EXPORT_DOWNLOAD_URL_TTL_SECONDS,
  EVIDENCE_EXPORT_JOB_NAME,
  EVIDENCE_EXPORT_QUEUE,
} from '../src/modules/evidence/evidence-export.constants';
import { EvidenceExportService } from '../src/modules/evidence/evidence-export.service';
import type { OrganizationRole, RlsTestContext } from './rls/rls-test-utils';
import {
  createRlsTestContext,
  seedAppUser,
  seedMember,
  seedOrg,
  seedWorkflowDefinition,
} from './rls/rls-test-utils';

const JWT_SECRET = 'test-evidence-export-jwt-secret';

type TestUser = {
  id: string;
  email: string;
};

type AuthenticatedTestUser = TestUser & {
  tenantId?: string;
  tenantRole?: OrganizationRole;
};

type SeededTenant = {
  user: TestUser;
  tenantId: string;
  organizationId: string;
  headers: Record<string, string>;
};

type SeededWorkflowExecution = {
  workflowId: string;
  workflowVersionId: string;
  executionId: string;
};

type ExportJobRow = {
  id: string;
  status: string;
  storage_key: string | null;
};

function signToken(payload: Record<string, unknown>) {
  return jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });
}

function authHeaders(user: AuthenticatedTestUser) {
  const claims: Record<string, unknown> = {
    sub: user.id,
    email: user.email,
    aud: 'authenticated',
    jti: crypto.randomUUID(),
  };

  if (user.tenantId) {
    claims.tenant_id = user.tenantId;
  }

  if (user.tenantRole) {
    claims.tenant_role = user.tenantRole;
  }

  return {
    authorization: `Bearer ${signToken(claims)}`,
  };
}

function withTenantContext(
  user: TestUser,
  tenantId: string,
  tenantRole: OrganizationRole,
): AuthenticatedTestUser {
  return {
    ...user,
    tenantId,
    tenantRole,
  };
}

function createTestUser(prefix: string): TestUser {
  const suffix = crypto.randomUUID().slice(0, 8);
  return {
    id: crypto.randomUUID(),
    email: `${prefix}-${suffix}@example.com`,
  };
}

function createMockRedisCacheService() {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
    delByPattern: vi.fn().mockResolvedValue(undefined),
    onModuleDestroy: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockRedisPubSubService() {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    onModuleInit: vi.fn().mockResolvedValue(undefined),
    onModuleDestroy: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockExportQueue() {
  return {
    add: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockStorageService() {
  return {
    getPresignedUrl: vi
      .fn()
      .mockResolvedValue('https://download.example.com/evidence-export.zip'),
    upload: vi.fn(),
    delete: vi.fn(),
    exists: vi.fn(),
  };
}

function toJsonValue(value: Record<string, unknown>): JSONValue {
  return value as JSONValue;
}

@Injectable()
class TestJwtAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<
      FastifyRequest & {
        user?: JwtPayload;
      }
    >();
    const authorization = request.headers.authorization;

    if (!authorization || !authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing authorization header.');
    }

    const token = authorization.slice('Bearer '.length);
    const payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload & {
      sub?: string;
      email?: string;
      tenant_id?: string;
      tenant_role?: OrganizationRole;
      tenantId?: string;
      tenantRole?: OrganizationRole;
      jti?: string;
    };

    request.user = {
      sub: String(payload.sub ?? ''),
      email: String(payload.email ?? ''),
      aud: String(payload.aud ?? 'authenticated'),
      exp: Number(payload.exp ?? 0),
      iat: Number(payload.iat ?? 0),
      tenantId: payload.tenantId ?? payload.tenant_id,
      tenantRole: payload.tenantRole ?? payload.tenant_role,
    };

    return true;
  }
}

describe('EvidenceExport E2E', () => {
  let ctx: RlsTestContext;
  let app: NestFastifyApplication;
  let drizzleDb: DrizzleDB;
  let redisCacheMock: ReturnType<typeof createMockRedisCacheService>;
  let redisPubSubMock: ReturnType<typeof createMockRedisPubSubService>;
  let exportQueueMock: ReturnType<typeof createMockExportQueue>;
  let storageServiceMock: ReturnType<typeof createMockStorageService>;

  beforeAll(async () => {
    ctx = await createRlsTestContext();

    drizzleDb = ctx.db;
    redisCacheMock = createMockRedisCacheService();
    redisPubSubMock = createMockRedisPubSubService();
    exportQueueMock = createMockExportQueue();
    storageServiceMock = createMockStorageService();

    const moduleRef = await Test.createTestingModule({
      controllers: [EvidenceExportController],
      providers: [
        TestJwtAuthGuard,
        {
          provide: APP_GUARD,
          useExisting: TestJwtAuthGuard,
        },
        EvidenceExportService,
        EvidenceExportAccessGuard,
        AuditLogService,
        RbacCacheService,
        {
          provide: DRIZZLE,
          useValue: drizzleDb,
        },
        {
          provide: RedisCacheService,
          useValue: redisCacheMock,
        },
        {
          provide: RedisPubSubService,
          useValue: redisPubSubMock,
        },
        {
          provide: getQueueToken(EVIDENCE_EXPORT_QUEUE),
          useValue: exportQueueMock,
        },
        {
          provide: StorageService,
          useValue: storageServiceMock,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(new ZodValidationPipe());

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await ctx?.close();
  }, 30_000);

  beforeEach(async () => {
    await ctx.reset();
    await ctx.adminSql`DELETE FROM evidence_export_jobs`;
    await ctx.adminSql`DELETE FROM workflow_executions`;
    await ctx.adminSql`DELETE FROM workflow_versions`;

    vi.clearAllMocks();

    redisCacheMock.get.mockResolvedValue(null);
    redisCacheMock.set.mockResolvedValue(undefined);
    redisCacheMock.del.mockResolvedValue(undefined);
    redisCacheMock.delByPattern.mockResolvedValue(undefined);

    redisPubSubMock.publish.mockResolvedValue(undefined);
    redisPubSubMock.subscribe.mockResolvedValue(undefined);
    redisPubSubMock.unsubscribe.mockResolvedValue(undefined);

    exportQueueMock.add.mockResolvedValue(undefined);
    storageServiceMock.getPresignedUrl.mockResolvedValue(
      'https://download.example.com/evidence-export.zip',
    );
  });

  async function seedTenant(
    prefix: string,
    role: OrganizationRole = 'owner',
  ): Promise<SeededTenant> {
    const user = createTestUser(prefix);
    const tenantId = crypto.randomUUID();
    const organizationId = crypto.randomUUID();

    await seedAppUser(ctx.adminSql, user.id, user.email);
    await seedOrg(
      ctx.adminSql,
      organizationId,
      `${prefix} org`,
      `org-${prefix}-${crypto.randomUUID().slice(0, 8)}`,
      user.id,
      tenantId,
    );
    await seedMember(ctx.adminSql, organizationId, user.id, role, user.id);
    await ctx.adminSql`
      UPDATE users
      SET current_organization_id = ${organizationId}::uuid
      WHERE id = ${user.id}::uuid
    `;

    return {
      user,
      tenantId,
      organizationId,
      headers: authHeaders(withTenantContext(user, tenantId, role)),
    };
  }

  async function seedWorkflowExecution(options: {
    tenantId: string;
    createdBy: string;
  }): Promise<SeededWorkflowExecution> {
    const workflowId = crypto.randomUUID();
    const workflowVersionId = crypto.randomUUID();
    const executionId = crypto.randomUUID();
    const snapshot = {
      nodes: [
        {
          id: 'node-start',
          type: 'agent',
          position: { x: 0, y: 0 },
          data: { label: 'Start' },
        },
      ],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      metadata: {
        nodeCount: 1,
        edgeCount: 0,
      },
    };

    await seedWorkflowDefinition(ctx.adminSql, {
      id: workflowId,
      tenantId: options.tenantId,
      name: `Evidence Export Workflow ${crypto.randomUUID().slice(0, 6)}`,
      slug: `evidence-export-workflow-${crypto.randomUUID().slice(0, 8)}`,
      createdBy: options.createdBy,
      updatedBy: options.createdBy,
      nodes: snapshot.nodes as unknown as readonly JSONValue[],
      edges: snapshot.edges as unknown as readonly JSONValue[],
      viewport: snapshot.viewport as unknown as JSONValue,
      version: 1,
      status: 'draft',
    });

    await ctx.adminSql`
      INSERT INTO workflow_versions (
        id,
        workflow_definition_id,
        tenant_id,
        version_number,
        label,
        snapshot,
        published_at,
        created_by
      )
      VALUES (
        ${workflowVersionId}::uuid,
        ${workflowId}::uuid,
        ${options.tenantId}::uuid,
        1,
        'v1',
        ${ctx.adminSql.json(toJsonValue(snapshot))},
        NOW(),
        ${options.createdBy}::uuid
      )
    `;

    await ctx.adminSql`
      INSERT INTO workflow_executions (
        id,
        workflow_definition_id,
        workflow_version_id,
        tenant_id,
        status,
        trigger_type,
        input_params,
        definition_snapshot,
        started_at,
        completed_at,
        total_steps,
        completed_steps,
        created_by
      )
      VALUES (
        ${executionId}::uuid,
        ${workflowId}::uuid,
        ${workflowVersionId}::uuid,
        ${options.tenantId}::uuid,
        'completed'::execution_status_enum,
        'manual'::execution_trigger_type_enum,
        ${ctx.adminSql.json(toJsonValue({ source: 'e2e' }))},
        ${ctx.adminSql.json(toJsonValue(snapshot))},
        NOW() - INTERVAL '5 minutes',
        NOW() - INTERVAL '1 minute',
        1,
        1,
        ${options.createdBy}::uuid
      )
    `;

    return {
      workflowId,
      workflowVersionId,
      executionId,
    };
  }

  async function seedExportJob(options: {
    tenantId: string;
    requestedBy: string;
    executionIds: string[];
    workflowId?: string;
    status?: 'completed' | 'failed' | 'expired';
    storageKey?: string | null;
    expiresAt?: Date;
  }) {
    const exportId = crypto.randomUUID();
    const requestedAt = new Date('2026-03-17T00:00:00.000Z');
    const completedAt = new Date('2026-03-17T00:05:00.000Z');
    const status = options.status ?? 'completed';
    const storageKey =
      options.storageKey === undefined
        ? buildEvidenceExportStorageKey(options.tenantId, exportId)
        : options.storageKey;
    const expiresAt = options.expiresAt ?? new Date('2026-03-20T00:00:00.000Z');
    const fileName = buildEvidenceExportArchiveFileName(exportId);

    await ctx.adminSql`
      INSERT INTO evidence_export_jobs (
        id,
        tenant_id,
        requested_by,
        status,
        filters,
        storage_key,
        artifact_format,
        file_name,
        mime_type,
        matched_execution_count,
        expires_at,
        requested_at,
        completed_at,
        failed_at,
        last_error,
        created_at,
        updated_at
      )
      VALUES (
        ${exportId}::uuid,
        ${options.tenantId}::uuid,
        ${options.requestedBy}::uuid,
        ${status}::evidence_export_job_status,
        ${ctx.adminSql.json(
          toJsonValue({
            workflowId: options.workflowId,
            executionIds: options.executionIds,
            includeAuditMetadata: true,
          }),
        )},
        ${storageKey},
        ${EVIDENCE_EXPORT_ARTIFACT_FORMAT},
        ${fileName},
        'application/zip',
        ${options.executionIds.length},
        ${expiresAt.toISOString()}::timestamptz,
        ${requestedAt.toISOString()}::timestamptz,
        ${completedAt.toISOString()}::timestamptz,
        null,
        null,
        ${requestedAt.toISOString()}::timestamptz,
        ${completedAt.toISOString()}::timestamptz
      )
    `;

    return exportId;
  }

  async function listAuditEvents(tenantId: string, eventType: string) {
    return ctx.adminSql`
      SELECT id, event_type, resource_type, resource_id, summary, metadata
      FROM audit_logs
      WHERE tenant_id = ${tenantId}::uuid
        AND event_type = ${eventType}
      ORDER BY created_at ASC, id ASC
    `;
  }

  async function fetchExportJobRow(
    exportId: string,
  ): Promise<ExportJobRow | null> {
    const [row] = await ctx.adminSql<ExportJobRow[]>`
      SELECT id, status, storage_key
      FROM evidence_export_jobs
      WHERE id = ${exportId}::uuid
    `;

    return row ?? null;
  }

  it('owner can create an evidence export and queue it', async () => {
    const owner = await seedTenant('owner-create', 'owner');
    const execution = await seedWorkflowExecution({
      tenantId: owner.tenantId,
      createdBy: owner.user.id,
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/evidence-exports')
      .set(owner.headers)
      .send({
        workflowId: execution.workflowId,
      });

    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe('queued');
    expect(response.body.data.matchedExecutionCount).toBe(1);
    expect(response.body.data.filters.workflowId).toBe(execution.workflowId);
    expect(response.body.data.filters.executionIds).toEqual([
      execution.executionId,
    ]);

    expect(exportQueueMock.add).toHaveBeenCalledTimes(1);
    expect(exportQueueMock.add).toHaveBeenCalledWith(
      EVIDENCE_EXPORT_JOB_NAME,
      {
        exportId: response.body.data.id,
        tenantId: owner.tenantId,
      },
      expect.objectContaining({
        jobId: `evidence-export:${response.body.data.id}`,
      }),
    );

    const auditEvents = await listAuditEvents(
      owner.tenantId,
      'evidence.export.requested',
    );
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]?.resource_id).toBe(response.body.data.id);
  });

  it('viewer create returns 403 and writes evidence.export.rejected', async () => {
    const viewer = await seedTenant('viewer-create', 'viewer');

    const response = await request(app.getHttpServer())
      .post('/api/v1/evidence-exports')
      .set(viewer.headers)
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.type).toBe(
      'https://agentloom.dev/errors/insufficient-permissions',
    );
    expect(exportQueueMock.add).not.toHaveBeenCalled();

    const auditEvents = await listAuditEvents(
      viewer.tenantId,
      'evidence.export.rejected',
    );
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]?.resource_type).toBe('evidence_export_job');
    expect(auditEvents[0]?.resource_id).toBe('pending');
  });

  it('owner can get download detail for a completed export', async () => {
    const owner = await seedTenant('owner-download', 'owner');
    const execution = await seedWorkflowExecution({
      tenantId: owner.tenantId,
      createdBy: owner.user.id,
    });
    const exportId = await seedExportJob({
      tenantId: owner.tenantId,
      requestedBy: owner.user.id,
      workflowId: execution.workflowId,
      executionIds: [execution.executionId],
    });

    const response = await request(app.getHttpServer())
      .get(`/api/v1/evidence-exports/${exportId}/download`)
      .set(owner.headers);

    expect(response.status).toBe(200);
    expect(storageServiceMock.getPresignedUrl).toHaveBeenCalledWith(
      buildEvidenceExportStorageKey(owner.tenantId, exportId),
      EVIDENCE_EXPORT_DOWNLOAD_URL_TTL_SECONDS,
    );
    expect(response.body.data.url).toBe(
      'https://download.example.com/evidence-export.zip',
    );
    expect(response.body.data.fileName).toBe(
      buildEvidenceExportArchiveFileName(exportId),
    );
    expect(response.body.data.mimeType).toBe('application/zip');
    expect(response.body.data.expiresIn).toBe(
      EVIDENCE_EXPORT_DOWNLOAD_URL_TTL_SECONDS,
    );

    const auditEvents = await listAuditEvents(
      owner.tenantId,
      'evidence.export.download.issued',
    );
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]?.resource_id).toBe(exportId);
  });

  it('viewer download returns 403 and writes evidence.export.rejected', async () => {
    const viewer = await seedTenant('viewer-download', 'viewer');
    const execution = await seedWorkflowExecution({
      tenantId: viewer.tenantId,
      createdBy: viewer.user.id,
    });
    const exportId = await seedExportJob({
      tenantId: viewer.tenantId,
      requestedBy: viewer.user.id,
      workflowId: execution.workflowId,
      executionIds: [execution.executionId],
    });

    const response = await request(app.getHttpServer())
      .get(`/api/v1/evidence-exports/${exportId}/download`)
      .set(viewer.headers);

    expect(response.status).toBe(403);
    expect(response.body.type).toBe(
      'https://agentloom.dev/errors/insufficient-permissions',
    );

    const auditEvents = await listAuditEvents(
      viewer.tenantId,
      'evidence.export.rejected',
    );
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]?.resource_id).toBe(exportId);
  });

  it('expired export download returns 410 and marks the job expired', async () => {
    const owner = await seedTenant('owner-expired', 'owner');
    const execution = await seedWorkflowExecution({
      tenantId: owner.tenantId,
      createdBy: owner.user.id,
    });
    const exportId = await seedExportJob({
      tenantId: owner.tenantId,
      requestedBy: owner.user.id,
      workflowId: execution.workflowId,
      executionIds: [execution.executionId],
      expiresAt: new Date('2026-03-16T00:00:00.000Z'),
    });

    const response = await request(app.getHttpServer())
      .get(`/api/v1/evidence-exports/${exportId}/download`)
      .set(owner.headers);

    expect(response.status).toBe(410);
    expect(response.body.type).toBe(
      'https://agentloom.dev/errors/evidence-export-expired',
    );

    const exportJob = await fetchExportJobRow(exportId);
    expect(exportJob?.status).toBe('expired');
    expect(exportJob?.storage_key).toBe(
      buildEvidenceExportStorageKey(owner.tenantId, exportId),
    );

    const auditEvents = await listAuditEvents(
      owner.tenantId,
      'evidence.export.download.expired',
    );
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]?.resource_id).toBe(exportId);
  });
});
