import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { validate as isUuid } from 'uuid';

import type { JwtPayload } from '../../common/guards/auth.guard';
import {
  InsufficientPermissionsException,
  InvalidTenantContextException,
  TenantRequiredException,
} from '../../common/exceptions/auth.exceptions';
import { RbacCacheService } from '../../common/services/rbac-cache.service';
import { AuditLogService } from './audit-log.service';

const ALLOWED_EVIDENCE_EXPORT_ROLES = ['owner', 'admin'] as const;

@Injectable()
export class EvidenceExportAccessGuard implements CanActivate {
  constructor(
    private readonly rbacCacheService: RbacCacheService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<
      FastifyRequest & {
        user?: JwtPayload;
        params?: Record<string, string | undefined>;
      }
    >();
    const tenantId = request.user?.tenantId;

    if (!tenantId) {
      throw new TenantRequiredException();
    }

    if (!isUuid(tenantId)) {
      throw new InvalidTenantContextException();
    }

    const actorId = request.user?.sub ?? null;
    const currentRole = actorId
      ? await this.rbacCacheService.getUserRole(tenantId, actorId)
      : null;

    if (currentRole === 'owner' || currentRole === 'admin') {
      return true;
    }

    await this.auditLogService.record({
      tenantId,
      actorId,
      actorType: 'user',
      eventType: 'evidence.export.rejected',
      resourceType: 'evidence_export_job',
      resourceId: this.resolveResourceId(request),
      summary: this.buildDeniedSummary(context),
      metadata: {
        reason: 'insufficient_permissions',
        requiredRoles: [...ALLOWED_EVIDENCE_EXPORT_ROLES],
        currentRole,
        operation: this.resolveOperation(context),
        method: request.method,
        path: request.url,
      },
    });

    throw new InsufficientPermissionsException(
      [...ALLOWED_EVIDENCE_EXPORT_ROLES],
      currentRole ?? undefined,
    );
  }

  private resolveResourceId(
    request: FastifyRequest & {
      params?: Record<string, string | undefined>;
    },
  ): string {
    const exportId = request.params?.id;

    return exportId && isUuid(exportId) ? exportId : 'pending';
  }

  private resolveOperation(context: ExecutionContext): string {
    switch (context.getHandler().name) {
      case 'create':
        return 'create';
      case 'getDownloadDetail':
        return 'download';
      case 'refreshDownloadDetail':
        return 'refresh_download';
      case 'findById':
        return 'read';
      default:
        return 'access';
    }
  }

  private buildDeniedSummary(context: ExecutionContext): string {
    switch (this.resolveOperation(context)) {
      case 'create':
        return '拒绝证据导出创建请求';
      case 'download':
        return '拒绝证据导出下载请求';
      case 'refresh_download':
        return '拒绝证据导出下载刷新请求';
      case 'read':
        return '拒绝证据导出详情访问请求';
      default:
        return '拒绝证据导出访问请求';
    }
  }
}
