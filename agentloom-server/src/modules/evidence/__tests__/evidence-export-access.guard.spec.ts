import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InsufficientPermissionsException } from '../../../common/exceptions/auth.exceptions';
import { EvidenceExportAccessGuard } from '../evidence-export-access.guard';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const ACTOR_ID = '00000000-0000-4000-8000-000000000002';
const EXPORT_ID = '00000000-0000-4000-8000-000000000003';

function createMockRbacCacheService() {
  return {
    getUserRole: vi.fn(),
  };
}

function createMockAuditLogService() {
  return {
    record: vi.fn().mockResolvedValue(undefined),
  };
}

function createContext(options?: {
  methodName?: string;
  method?: string;
  url?: string;
  exportId?: string;
  actorId?: string | null;
  tenantId?: string | null;
}) {
  const user =
    options?.actorId === null && options?.tenantId === null
      ? undefined
      : {
          sub: options?.actorId ?? ACTOR_ID,
          tenantId: options?.tenantId ?? TENANT_ID,
        };

  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method: options?.method ?? 'GET',
        url:
          options?.url ?? `/evidence-exports/${options?.exportId ?? EXPORT_ID}`,
        params: {
          id: options?.exportId,
        },
        user,
      }),
    }),
    getHandler: () => ({
      name: options?.methodName ?? 'getDownloadDetail',
    }),
  } as never;
}

describe('EvidenceExportAccessGuard', () => {
  let guard: EvidenceExportAccessGuard;
  let rbacCacheService: ReturnType<typeof createMockRbacCacheService>;
  let auditLogService: ReturnType<typeof createMockAuditLogService>;

  beforeEach(() => {
    rbacCacheService = createMockRbacCacheService();
    auditLogService = createMockAuditLogService();
    guard = new EvidenceExportAccessGuard(
      rbacCacheService as never,
      auditLogService as never,
    );
  });

  it('allows owner/admin roles without auditing a rejection', async () => {
    rbacCacheService.getUserRole.mockResolvedValue('admin');

    await expect(guard.canActivate(createContext())).resolves.toBe(true);

    expect(rbacCacheService.getUserRole).toHaveBeenCalledWith(TENANT_ID, ACTOR_ID);
    expect(auditLogService.record).not.toHaveBeenCalled();
  });

  it('audits denied create attempts and throws insufficient permissions', async () => {
    rbacCacheService.getUserRole.mockResolvedValue('viewer');

    await expect(
      guard.canActivate(
        createContext({
          methodName: 'create',
          method: 'POST',
          url: '/evidence-exports',
          exportId: undefined,
        }),
      ),
    ).rejects.toBeInstanceOf(InsufficientPermissionsException);

    expect(auditLogService.record).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      actorType: 'user',
      eventType: 'evidence.export.rejected',
      resourceType: 'evidence_export_job',
      resourceId: 'pending',
      summary: '拒绝证据导出创建请求',
      metadata: {
        reason: 'insufficient_permissions',
        requiredRoles: ['owner', 'admin'],
        currentRole: 'viewer',
        operation: 'create',
        method: 'POST',
        path: '/evidence-exports',
      },
    });
  });

  it('audits denied download attempts against the target export id', async () => {
    rbacCacheService.getUserRole.mockResolvedValue('viewer');

    await expect(
      guard.canActivate(
        createContext({
          methodName: 'getDownloadDetail',
          method: 'GET',
          exportId: EXPORT_ID,
          url: `/evidence-exports/${EXPORT_ID}/download`,
        }),
      ),
    ).rejects.toBeInstanceOf(InsufficientPermissionsException);

    expect(auditLogService.record).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      actorType: 'user',
      eventType: 'evidence.export.rejected',
      resourceType: 'evidence_export_job',
      resourceId: EXPORT_ID,
      summary: '拒绝证据导出下载请求',
      metadata: {
        reason: 'insufficient_permissions',
        requiredRoles: ['owner', 'admin'],
        currentRole: 'viewer',
        operation: 'download',
        method: 'GET',
        path: `/evidence-exports/${EXPORT_ID}/download`,
      },
    });
  });
});
