import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { ExecutionController } from '../../execution/execution.controller';
import { OrganizationController } from '../../organization/organization.controller';
import { WorkflowDefinitionCreateController } from '../../workflow-definition/workflow-definition-create.controller';
import {
  AUDIT_LOG_CAPTURE_KEY,
  type AuditLogHttpCaptureConfig,
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
    | AuditLogHttpCaptureConfig
    | undefined;
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
