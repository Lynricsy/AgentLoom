import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { ExecutionController } from '../../execution/execution.controller';
import { OrganizationController } from '../../organization/organization.controller';
import { WorkflowDefinitionCreateController } from '../../workflow-definition/workflow-definition-create.controller';
import {
  AUDIT_LOG_CAPTURE_KEY,
  auditLogCaptureConfigs,
  CaptureAuditLog,
  type AuditLogHttpCaptureConfig,
  type AuditLogHttpCaptureContext,
} from '../audit-log.capture';

function getCaptureMetadata(
  target: object,
  methodName: string,
): AuditLogHttpCaptureConfig | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(target, methodName);

  if (typeof descriptor?.value !== 'function') {
    throw new Error(`Method ${methodName} is not defined`);
  }

  return Reflect.getMetadata(AUDIT_LOG_CAPTURE_KEY, descriptor.value) as
    AuditLogHttpCaptureConfig | undefined;
}

describe('Audit log capture matrix', () => {
  it('should decorate the exact HTTP endpoints in story S2', () => {
    expect(
      getCaptureMetadata(
        OrganizationController.prototype,
        'createOrganization',
      ),
    ).toEqual(expect.objectContaining({ eventType: 'organization.created' }));
    expect(
      getCaptureMetadata(OrganizationController.prototype, 'inviteMember'),
    ).toEqual(
      expect.objectContaining({ eventType: 'organization.member.invited' }),
    );
    expect(
      getCaptureMetadata(OrganizationController.prototype, 'acceptInvitation'),
    ).toEqual(
      expect.objectContaining({
        eventType: 'organization.invitation.accepted',
      }),
    );
    expect(
      getCaptureMetadata(OrganizationController.prototype, 'updateMemberRole'),
    ).toEqual(
      expect.objectContaining({
        eventType: 'organization.member.role.updated',
      }),
    );
    expect(
      getCaptureMetadata(OrganizationController.prototype, 'removeMember'),
    ).toEqual(
      expect.objectContaining({ eventType: 'organization.member.removed' }),
    );
    expect(
      getCaptureMetadata(
        ExecutionController.prototype,
        'resolveToolPermission',
      ),
    ).toEqual(
      expect.objectContaining({
        eventType: 'execution.tool-permission.resolved',
      }),
    );
    expect(
      getCaptureMetadata(
        WorkflowDefinitionCreateController.prototype,
        'exportWorkflow',
      ),
    ).toEqual(
      expect.objectContaining({ eventType: 'workflow.export.started' }),
    );
  });

  it('should explicitly leave interveneStep without HTTP audit capture metadata', () => {
    expect(
      getCaptureMetadata(ExecutionController.prototype, 'interveneStep'),
    ).toBeUndefined();
  });
});

describe('Audit log record builders', () => {
  const authenticatedRequest = {
    user: { sub: 'actor-1', tenantId: 'tenant-1' },
    params: {
      id: 'org-1',
      userId: 'member-1',
      executionId: 'execution-1',
      stepId: 'step-1',
      toolCallId: 'tool-call-1',
      workflowId: 'workflow-1',
    },
  };

  it('captures response state and request metadata for every successful operation', () => {
    expect(
      auditLogCaptureConfigs.createOrganization.buildRecord({
        request: { user: { sub: 'actor-1' } },
        response: {
          data: { id: 'org-created', tenantId: 'tenant-created', name: 'Acme' },
        },
      }),
    ).toMatchObject({
      tenantId: 'tenant-created',
      actorId: 'actor-1',
      resourceId: 'org-created',
      after: { id: 'org-created', tenantId: 'tenant-created', name: 'Acme' },
    });

    expect(
      auditLogCaptureConfigs.inviteMember.buildRecord({
        request: authenticatedRequest,
        response: { data: { id: 'invitation-1', email: 'new@example.com' } },
      }),
    ).toMatchObject({
      tenantId: 'tenant-1',
      actorId: 'actor-1',
      resourceId: 'org-1',
      after: { id: 'invitation-1', email: 'new@example.com' },
    });

    expect(
      auditLogCaptureConfigs.acceptInvitation.buildRecord({
        request: { user: { sub: 'actor-1' } },
        response: {
          data: {
            organization: { id: 'org-accepted', tenantId: 'tenant-accepted' },
            membership: { role: 'member' },
          },
        },
      }),
    ).toMatchObject({
      tenantId: 'tenant-accepted',
      resourceId: 'org-accepted',
      after: {
        organization: { id: 'org-accepted', tenantId: 'tenant-accepted' },
        membership: { role: 'member' },
      },
    });

    expect(
      auditLogCaptureConfigs.updateMemberRole.buildRecord({
        request: authenticatedRequest,
        response: { data: { userId: 'member-1', role: 'admin' } },
      }),
    ).toMatchObject({
      resourceId: 'org-1',
      after: { userId: 'member-1', role: 'admin' },
      metadata: { userId: 'member-1' },
    });

    expect(
      auditLogCaptureConfigs.removeMember.buildRecord({
        request: authenticatedRequest,
        response: undefined,
      }),
    ).toMatchObject({
      resourceId: 'org-1',
      metadata: { userId: 'member-1' },
    });

    expect(
      auditLogCaptureConfigs.resolveToolPermission.buildRecord({
        request: {
          ...authenticatedRequest,
          body: { action: 'allow', ignored: true },
        },
        response: { data: { status: 'running' } },
      }),
    ).toMatchObject({
      resourceId: 'tool-call-1',
      executionId: 'execution-1',
      after: { status: 'running' },
      metadata: { stepId: 'step-1', action: 'allow' },
    });

    expect(
      auditLogCaptureConfigs.exportWorkflow.buildRecord({
        request: authenticatedRequest,
        response: undefined,
      }),
    ).toMatchObject({
      resourceId: 'workflow-1',
      eventType: 'workflow.export.started',
    });
  });

  it.each([
    ['createOrganization', { request: {}, response: { data: {} } }],
    ['inviteMember', { request: {}, response: null }],
    ['acceptInvitation', { request: {}, response: { data: [] } }],
    ['updateMemberRole', { request: {}, response: undefined }],
    ['removeMember', { request: {}, response: undefined }],
    ['resolveToolPermission', { request: { body: [] }, response: undefined }],
    ['exportWorkflow', { request: {}, response: undefined }],
  ] as const)(
    'returns null instead of emitting an unattributed %s record',
    (configName, context) => {
      expect(
        auditLogCaptureConfigs[configName].buildRecord(
          context as AuditLogHttpCaptureContext,
        ),
      ).toBeNull();
    },
  );

  it('omits optional ids and metadata when request values are empty or malformed', () => {
    const request = {
      user: { sub: 'actor-1', tenantId: 'tenant-1' },
      params: {
        id: '',
        userId: undefined,
        executionId: '',
        stepId: undefined,
        toolCallId: '',
      },
      body: { action: '' },
    };

    expect(
      auditLogCaptureConfigs.updateMemberRole.buildRecord({
        request,
        response: { data: ['not', 'an', 'object'] },
      }),
    ).toMatchObject({
      resourceId: '',
      after: null,
      metadata: null,
    });
    expect(
      auditLogCaptureConfigs.resolveToolPermission.buildRecord({
        request,
        response: { data: 'not-an-object' },
      }),
    ).toMatchObject({
      resourceId: '',
      executionId: null,
      after: null,
      metadata: null,
    });
  });

  it('applies arbitrary capture configuration through the decorator', () => {
    class Controller {
      handler() {
        return 'ok';
      }
    }
    const config: AuditLogHttpCaptureConfig = {
      eventType: 'custom.completed',
      buildRecord: () => null,
    };
    const descriptor = Object.getOwnPropertyDescriptor(
      Controller.prototype,
      'handler',
    )!;

    CaptureAuditLog(config)(Controller.prototype, 'handler', descriptor);

    expect(Reflect.getMetadata(AUDIT_LOG_CAPTURE_KEY, descriptor.value)).toBe(
      config,
    );
  });
});
