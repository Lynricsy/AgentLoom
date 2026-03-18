import 'reflect-metadata';

import { Logger, type CallHandler, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AUDIT_LOG_CAPTURE_KEY,
  auditLogCaptureConfigs,
} from '../audit-log.capture';
import { AuditLogInterceptor } from '../audit-log.interceptor';

const REQUEST_TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';
const CREATED_TENANT_ID = '550e8400-e29b-41d4-a716-446655440001';
const USER_ID = '550e8400-e29b-41d4-a716-446655440002';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440003';
const EXECUTION_ID = '550e8400-e29b-41d4-a716-446655440004';
const STEP_ID = '550e8400-e29b-41d4-a716-446655440005';
const TOOL_CALL_ID = 'tool-call-1';

function createContext(
  request: Record<string, unknown>,
  handler: object,
): ExecutionContext {
  return {
    getType: () => 'http',
    getHandler: () => handler,
    getClass: () => AuditLogInterceptor,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => undefined,
      getNext: () => undefined,
    }),
  } as ExecutionContext;
}

function createNext(response: unknown): CallHandler {
  return {
    handle: () => of(response),
  };
}

describe('AuditLogInterceptor', () => {
  const auditLogService = {
    record: vi.fn(),
  };

  let interceptor: AuditLogInterceptor;

  beforeEach(() => {
    auditLogService.record.mockReset();
    auditLogService.record.mockResolvedValue(undefined);
    interceptor = new AuditLogInterceptor(new Reflector(), auditLogService as never);
  });

  it('should skip HTTP requests without audit capture metadata', async () => {
    const handler = {};
    const response = { data: { id: ORG_ID } };

    const result = await lastValueFrom(
      interceptor.intercept(
        createContext(
          {
            user: { sub: USER_ID, tenantId: REQUEST_TENANT_ID },
          },
          handler,
        ),
        createNext(response),
      ),
    );

    expect(result).toEqual(response);
    expect(auditLogService.record).not.toHaveBeenCalled();
  });

  it('should use organization data from the createOrganization response instead of request tenant context', async () => {
    const handler = {};
    Reflect.defineMetadata(
      AUDIT_LOG_CAPTURE_KEY,
      auditLogCaptureConfigs.createOrganization,
      handler,
    );

    await lastValueFrom(
      interceptor.intercept(
        createContext(
          {
            user: { sub: USER_ID, tenantId: REQUEST_TENANT_ID },
            params: {},
          },
          handler,
        ),
        createNext({
          data: {
            id: ORG_ID,
            tenantId: CREATED_TENANT_ID,
            name: 'New Org',
            slug: 'new-org',
          },
        }),
      ),
    );

    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: CREATED_TENANT_ID,
        actorId: USER_ID,
        actorType: 'user',
        eventType: 'organization.created',
        resourceType: 'organization',
        resourceId: ORG_ID,
      }),
    );
  });

  it('should derive acceptInvitation tenant and organization id from the response payload', async () => {
    const handler = {};
    Reflect.defineMetadata(
      AUDIT_LOG_CAPTURE_KEY,
      auditLogCaptureConfigs.acceptInvitation,
      handler,
    );

    await lastValueFrom(
      interceptor.intercept(
        createContext(
          {
            user: { sub: USER_ID, tenantId: REQUEST_TENANT_ID },
            params: { token: 'invite-token' },
          },
          handler,
        ),
        createNext({
          data: {
            organization: {
              id: ORG_ID,
              tenantId: CREATED_TENANT_ID,
              name: 'Joined Org',
            },
            member: {
              userId: USER_ID,
              role: 'creator',
            },
          },
        }),
      ),
    );

    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: CREATED_TENANT_ID,
        actorId: USER_ID,
        actorType: 'user',
        eventType: 'organization.invitation.accepted',
        resourceType: 'organization',
        resourceId: ORG_ID,
      }),
    );
  });

  it('should preserve actor identity for tool permission approval at the HTTP boundary', async () => {
    const handler = {};
    Reflect.defineMetadata(
      AUDIT_LOG_CAPTURE_KEY,
      auditLogCaptureConfigs.resolveToolPermission,
      handler,
    );

    await lastValueFrom(
      interceptor.intercept(
        createContext(
          {
            user: { sub: USER_ID, tenantId: REQUEST_TENANT_ID },
            params: {
              executionId: EXECUTION_ID,
              stepId: STEP_ID,
              toolCallId: TOOL_CALL_ID,
            },
            body: { action: 'approve' },
          },
          handler,
        ),
        createNext({
          data: {
            executionId: EXECUTION_ID,
            stepId: STEP_ID,
            toolCallId: TOOL_CALL_ID,
            status: 'permission_resolved',
          },
        }),
      ),
    );

    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: REQUEST_TENANT_ID,
        actorId: USER_ID,
        actorType: 'user',
        eventType: 'execution.tool-permission.resolved',
        resourceType: 'tool_permission',
        resourceId: TOOL_CALL_ID,
        executionId: EXECUTION_ID,
      }),
    );
  });

  it('should keep the business response when audit log persistence fails', async () => {
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const handler = {};
    Reflect.defineMetadata(
      AUDIT_LOG_CAPTURE_KEY,
      auditLogCaptureConfigs.createOrganization,
      handler,
    );
    auditLogService.record.mockRejectedValueOnce(new Error('db unavailable'));

    const response = {
      data: {
        id: ORG_ID,
        tenantId: CREATED_TENANT_ID,
        name: 'New Org',
        slug: 'new-org',
      },
    };

    const result = await lastValueFrom(
      interceptor.intercept(
        createContext(
          {
            user: { sub: USER_ID, tenantId: REQUEST_TENANT_ID },
            params: {},
          },
          handler,
        ),
        createNext(response),
      ),
    );

    expect(result).toEqual(response);
    expect(auditLogService.record).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to persist audit log for organization.created'),
      expect.objectContaining({
        tenantId: CREATED_TENANT_ID,
        resourceType: 'organization',
        resourceId: ORG_ID,
      }),
    );
  });
});
