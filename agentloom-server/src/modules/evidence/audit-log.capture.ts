import { SetMetadata } from '@nestjs/common';

import type { AuditLogJson } from '../../database/schema';
import type { AuditLogRecordInput } from './audit-log.service';

type AuditRequestUser = {
  sub?: string;
  tenantId?: string;
};

type AuditLogHttpRequest = {
  user?: AuditRequestUser;
  params?: Record<string, string | undefined>;
  body?: unknown;
};

export interface AuditLogHttpCaptureContext {
  request: AuditLogHttpRequest;
  response: unknown;
}

export interface AuditLogHttpCaptureConfig {
  eventType: string;
  buildRecord: (
    context: AuditLogHttpCaptureContext,
  ) => AuditLogRecordInput | null;
}

export const AUDIT_LOG_CAPTURE_KEY = Symbol('AUDIT_LOG_CAPTURE_KEY');

function readString(
  value: Record<string, unknown> | null,
  key: string,
): string | null {
  const candidate = value?.[key];
  return typeof candidate === 'string' && candidate.length > 0
    ? candidate
    : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getResponseData(response: unknown): Record<string, unknown> | null {
  return asRecord(asRecord(response)?.data);
}

function toAuditLogJson(value: unknown): AuditLogJson | null {
  return asRecord(value);
}

function getActorId(request: AuditLogHttpRequest): string | null {
  return request.user?.sub ?? null;
}

function getTenantId(request: AuditLogHttpRequest): string | null {
  return request.user?.tenantId ?? null;
}

function getParam(request: AuditLogHttpRequest, key: string): string | null {
  const candidate = request.params?.[key];
  return typeof candidate === 'string' && candidate.length > 0
    ? candidate
    : null;
}

function createUserActorRecord(
  tenantId: string | null,
  actorId: string | null,
  base: Omit<AuditLogRecordInput, 'tenantId' | 'actorId' | 'actorType'>,
): AuditLogRecordInput | null {
  if (!tenantId || !actorId) {
    return null;
  }

  return {
    tenantId,
    actorId,
    actorType: 'user',
    ...base,
  };
}

export const auditLogCaptureConfigs = {
  createOrganization: {
    eventType: 'organization.created',
    buildRecord: ({ request, response }) => {
      const actorId = getActorId(request);
      const organization = getResponseData(response);
      const tenantId = readString(organization, 'tenantId');
      const organizationId = readString(organization, 'id');

      return createUserActorRecord(tenantId, actorId, {
        eventType: 'organization.created',
        resourceType: 'organization',
        resourceId: organizationId ?? '',
        summary: 'Organization created',
        after: toAuditLogJson(organization),
      });
    },
  },
  inviteMember: {
    eventType: 'organization.member.invited',
    buildRecord: ({ request, response }) => {
      const tenantId = getTenantId(request);
      const actorId = getActorId(request);
      const organizationId = getParam(request, 'id');
      const invitation = getResponseData(response);

      return createUserActorRecord(tenantId, actorId, {
        eventType: 'organization.member.invited',
        resourceType: 'organization',
        resourceId: organizationId ?? '',
        summary: 'Organization member invited',
        after: toAuditLogJson(invitation),
      });
    },
  },
  acceptInvitation: {
    eventType: 'organization.invitation.accepted',
    buildRecord: ({ request, response }) => {
      const actorId = getActorId(request);
      const result = getResponseData(response);
      const organization = asRecord(result?.organization);
      const tenantId = readString(organization, 'tenantId');
      const organizationId = readString(organization, 'id');

      return createUserActorRecord(tenantId, actorId, {
        eventType: 'organization.invitation.accepted',
        resourceType: 'organization',
        resourceId: organizationId ?? '',
        summary: 'Organization invitation accepted',
        after: toAuditLogJson(result),
      });
    },
  },
  updateMemberRole: {
    eventType: 'organization.member.role.updated',
    buildRecord: ({ request, response }) => {
      const tenantId = getTenantId(request);
      const actorId = getActorId(request);
      const organizationId = getParam(request, 'id');
      const userId = getParam(request, 'userId');
      const updatedMember = getResponseData(response);

      return createUserActorRecord(tenantId, actorId, {
        eventType: 'organization.member.role.updated',
        resourceType: 'organization',
        resourceId: organizationId ?? '',
        summary: 'Organization member role updated',
        after: toAuditLogJson(updatedMember),
        metadata: userId ? { userId } : null,
      });
    },
  },
  removeMember: {
    eventType: 'organization.member.removed',
    buildRecord: ({ request }) => {
      const tenantId = getTenantId(request);
      const actorId = getActorId(request);
      const organizationId = getParam(request, 'id');
      const userId = getParam(request, 'userId');

      return createUserActorRecord(tenantId, actorId, {
        eventType: 'organization.member.removed',
        resourceType: 'organization',
        resourceId: organizationId ?? '',
        summary: 'Organization member removed',
        metadata: userId ? { userId } : null,
      });
    },
  },
  resolveToolPermission: {
    eventType: 'execution.tool-permission.resolved',
    buildRecord: ({ request, response }) => {
      const tenantId = getTenantId(request);
      const actorId = getActorId(request);
      const executionId = getParam(request, 'executionId');
      const stepId = getParam(request, 'stepId');
      const toolCallId = getParam(request, 'toolCallId');
      const body = asRecord(request.body);
      const result = getResponseData(response);
      const action = readString(body, 'action');

      return createUserActorRecord(tenantId, actorId, {
        eventType: 'execution.tool-permission.resolved',
        resourceType: 'tool_permission',
        resourceId: toolCallId ?? '',
        executionId,
        summary: 'Tool permission resolved',
        after: toAuditLogJson(result),
        metadata:
          stepId || action
            ? {
                ...(stepId ? { stepId } : {}),
                ...(action ? { action } : {}),
              }
            : null,
      });
    },
  },
  exportWorkflow: {
    eventType: 'workflow.export.started',
    buildRecord: ({ request }) => {
      const tenantId = getTenantId(request);
      const actorId = getActorId(request);
      const workflowId = getParam(request, 'workflowId');

      return createUserActorRecord(tenantId, actorId, {
        eventType: 'workflow.export.started',
        resourceType: 'workflow_definition',
        resourceId: workflowId ?? '',
        summary: 'Workflow export started',
      });
    },
  },
} satisfies Record<string, AuditLogHttpCaptureConfig>;

export function CaptureAuditLog(config: AuditLogHttpCaptureConfig) {
  return SetMetadata(AUDIT_LOG_CAPTURE_KEY, config);
}
