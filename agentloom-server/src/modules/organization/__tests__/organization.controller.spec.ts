import 'reflect-metadata';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { OrganizationController } from '../organization.controller';
import type { OrganizationService } from '../organization.service';
import type { OrganizationAutonomyPolicyService } from '../organization-autonomy-policy.service';
import type { InviteMemberDto } from '../dto/invite-member.dto';
import type { UpdateOrganizationAutonomyPolicyDto } from '../dto/update-organization-autonomy-policy.dto';

function getMethodRoles(methodName: keyof OrganizationController) {
  const handler = Object.getOwnPropertyDescriptor(
    OrganizationController.prototype,
    methodName,
  )?.value;

  return handler ? Reflect.getMetadata(ROLES_KEY, handler) : undefined;
}

describe('OrganizationController', () => {
  let controller: OrganizationController;
  let service: {
    createOrganization: ReturnType<typeof vi.fn>;
    getOrganization: ReturnType<typeof vi.fn>;
    inviteMember: ReturnType<typeof vi.fn>;
    acceptInvitation: ReturnType<typeof vi.fn>;
    updateMemberRole: ReturnType<typeof vi.fn>;
    removeMember: ReturnType<typeof vi.fn>;
  };
  let autonomyPolicyService: {
    getAutonomyPolicy: ReturnType<typeof vi.fn>;
    updateAutonomyPolicy: ReturnType<typeof vi.fn>;
    previewAutonomyDowngrade: ReturnType<typeof vi.fn>;
    confirmAutonomyDowngrade: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    service = {
      createOrganization: vi.fn(),
      getOrganization: vi.fn(),
      inviteMember: vi.fn(),
      acceptInvitation: vi.fn(),
      updateMemberRole: vi.fn(),
      removeMember: vi.fn(),
    };

    autonomyPolicyService = {
      getAutonomyPolicy: vi.fn(),
      updateAutonomyPolicy: vi.fn(),
      previewAutonomyDowngrade: vi.fn(),
      confirmAutonomyDowngrade: vi.fn(),
    };

    controller = new OrganizationController(
      service as unknown as OrganizationService,
      autonomyPolicyService as unknown as OrganizationAutonomyPolicyService,
    );
  });

  it('applies owner/admin roles only to organization management routes', () => {
    expect(getMethodRoles('createOrganization')).toBeUndefined();
    expect(getMethodRoles('getOrganization')).toBeUndefined();
    expect(getMethodRoles('acceptInvitation')).toBeUndefined();
    expect(getMethodRoles('inviteMember')).toEqual(['owner', 'admin']);
    expect(getMethodRoles('updateMemberRole')).toEqual(['owner', 'admin']);
    expect(getMethodRoles('removeMember')).toEqual(['owner', 'admin']);
    expect(getMethodRoles('getAutonomyPolicy')).toEqual(['owner']);
    expect(getMethodRoles('updateAutonomyPolicy')).toEqual(['owner']);
    expect(getMethodRoles('previewAutonomyDowngrade')).toEqual(['owner']);
    expect(getMethodRoles('confirmAutonomyDowngrade')).toEqual(['owner']);
  });

  it('passes the authenticated user id to createOrganization', async () => {
    const dto = { name: 'Alpha Org', description: 'demo org' };
    service.createOrganization.mockResolvedValue({ id: 'org-1' });

    const result = await controller.createOrganization(dto, {
      user: { sub: 'user-1' },
    } as never);

    expect(service.createOrganization).toHaveBeenCalledWith('user-1', dto);
    expect(result).toEqual({ data: { id: 'org-1' } });
  });

  it('passes the authenticated user id to inviteMember', async () => {
    const dto: InviteMemberDto = {
      email: 'member@example.com',
      role: 'viewer',
    };
    service.inviteMember.mockResolvedValue({ id: 'invite-1' });

    const result = await controller.inviteMember('org-1', dto, {
      user: { sub: 'user-1' },
    } as never);

    expect(service.inviteMember).toHaveBeenCalledWith('org-1', dto, 'user-1');
    expect(result).toEqual({ data: { id: 'invite-1' } });
  });

  it('wraps getAutonomyPolicy responses and forwards the authenticated user id', async () => {
    autonomyPolicyService.getAutonomyPolicy.mockResolvedValue({
      organizationId: 'org-1',
      autonomyCap: 'LLM_SUGGEST',
      version: 0,
      violationSummary: {
        workflowCount: 0,
        nodeCount: 0,
      },
    });

    const result = await controller.getAutonomyPolicy('org-1', {
      user: { sub: 'user-1' },
    } as never);

    expect(autonomyPolicyService.getAutonomyPolicy).toHaveBeenCalledWith(
      'org-1',
      'user-1',
    );
    expect(result).toEqual({
      data: {
        organizationId: 'org-1',
        autonomyCap: 'LLM_SUGGEST',
        version: 0,
        violationSummary: {
          workflowCount: 0,
          nodeCount: 0,
        },
      },
    });
  });

  it('wraps updateAutonomyPolicy responses and forwards the authenticated user id', async () => {
    const dto: UpdateOrganizationAutonomyPolicyDto = {
      autonomyCap: 'RULE_BASED',
    };

    autonomyPolicyService.updateAutonomyPolicy.mockResolvedValue({
      organizationId: 'org-1',
      autonomyCap: 'RULE_BASED',
      version: 1,
      violationSummary: {
        workflowCount: 2,
        nodeCount: 3,
      },
    });

    const result = await controller.updateAutonomyPolicy('org-1', dto, {
      user: { sub: 'user-1' },
    } as never);

    expect(autonomyPolicyService.updateAutonomyPolicy).toHaveBeenCalledWith(
      'org-1',
      dto,
      'user-1',
    );
    expect(result).toEqual({
      data: {
        organizationId: 'org-1',
        autonomyCap: 'RULE_BASED',
        version: 1,
        violationSummary: {
          workflowCount: 2,
          nodeCount: 3,
        },
      },
    });
  });

  it('wraps previewAutonomyDowngrade responses and forwards the authenticated user id', async () => {
    const dto: UpdateOrganizationAutonomyPolicyDto = {
      autonomyCap: 'RULE_BASED',
    };

    autonomyPolicyService.previewAutonomyDowngrade.mockResolvedValue({
      organizationId: 'org-1',
      autonomyCap: 'RULE_BASED',
      violationSummary: {
        workflowCount: 1,
        nodeCount: 2,
      },
      violations: [
        {
          workflowId: 'wf-1',
          workflowName: 'Preview workflow',
          nodeId: 'node-1',
          nodeName: 'Planner',
          rawMode: 'FULL_AUTO',
          canonicalMode: 'LLM_SUGGEST',
          replacementMode: 'RULE_BASED',
          source: 'legacy',
          reasonCode: 'mode_exceeds_cap',
          message:
            '自治模式 LLM_SUGGEST 超出组织上限 RULE_BASED，应降级为 RULE_BASED',
        },
      ],
    });

    const result = await controller.previewAutonomyDowngrade('org-1', dto, {
      user: { sub: 'user-1' },
    } as never);

    expect(autonomyPolicyService.previewAutonomyDowngrade).toHaveBeenCalledWith(
      'org-1',
      dto,
      'user-1',
    );
    expect(result).toEqual({
      data: {
        organizationId: 'org-1',
        autonomyCap: 'RULE_BASED',
        violationSummary: {
          workflowCount: 1,
          nodeCount: 2,
        },
        violations: [
          {
            workflowId: 'wf-1',
            workflowName: 'Preview workflow',
            nodeId: 'node-1',
            nodeName: 'Planner',
            rawMode: 'FULL_AUTO',
            canonicalMode: 'LLM_SUGGEST',
            replacementMode: 'RULE_BASED',
            source: 'legacy',
            reasonCode: 'mode_exceeds_cap',
            message:
              '自治模式 LLM_SUGGEST 超出组织上限 RULE_BASED，应降级为 RULE_BASED',
          },
        ],
      },
    });
  });

  it('wraps confirmAutonomyDowngrade responses and forwards the authenticated user id', async () => {
    const dto: UpdateOrganizationAutonomyPolicyDto = {
      autonomyCap: 'MANUAL_CONFIRM',
    };

    autonomyPolicyService.confirmAutonomyDowngrade.mockResolvedValue({
      organizationId: 'org-1',
      autonomyCap: 'MANUAL_CONFIRM',
      downgradedSummary: {
        workflowCount: 1,
        nodeCount: 2,
      },
      downgradedViolations: [
        {
          workflowId: 'wf-1',
          workflowName: 'Confirm workflow',
          nodeId: 'node-1',
          nodeName: 'Planner',
          rawMode: 'FULL_AUTO',
          canonicalMode: 'LLM_SUGGEST',
          replacementMode: 'MANUAL_CONFIRM',
          source: 'legacy',
          reasonCode: 'mode_exceeds_cap',
          message:
            '自治模式 LLM_SUGGEST 超出组织上限 MANUAL_CONFIRM，应降级为 MANUAL_CONFIRM',
        },
      ],
      policy: {
        organizationId: 'org-1',
        autonomyCap: 'MANUAL_CONFIRM',
        version: 3,
        violationSummary: {
          workflowCount: 0,
          nodeCount: 0,
        },
      },
    });

    const result = await controller.confirmAutonomyDowngrade('org-1', dto, {
      user: { sub: 'user-1' },
    } as never);

    expect(autonomyPolicyService.confirmAutonomyDowngrade).toHaveBeenCalledWith(
      'org-1',
      dto,
      'user-1',
    );
    expect(result).toEqual({
      data: {
        organizationId: 'org-1',
        autonomyCap: 'MANUAL_CONFIRM',
        downgradedSummary: {
          workflowCount: 1,
          nodeCount: 2,
        },
        downgradedViolations: [
          {
            workflowId: 'wf-1',
            workflowName: 'Confirm workflow',
            nodeId: 'node-1',
            nodeName: 'Planner',
            rawMode: 'FULL_AUTO',
            canonicalMode: 'LLM_SUGGEST',
            replacementMode: 'MANUAL_CONFIRM',
            source: 'legacy',
            reasonCode: 'mode_exceeds_cap',
            message:
              '自治模式 LLM_SUGGEST 超出组织上限 MANUAL_CONFIRM，应降级为 MANUAL_CONFIRM',
          },
        ],
        policy: {
          organizationId: 'org-1',
          autonomyCap: 'MANUAL_CONFIRM',
          version: 3,
          violationSummary: {
            workflowCount: 0,
            nodeCount: 0,
          },
        },
      },
    });
  });
});
