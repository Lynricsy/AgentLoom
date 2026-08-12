import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as jwt from 'jsonwebtoken';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { RbacCacheService } from '../../../common/services/rbac-cache.service';
import { TokenBlacklistService } from '../../../common/services/token-blacklist.service';
import { UserIdentityResolverService } from '../../../common/services/user-identity-resolver.service';
import { OrganizationController } from '../organization.controller';
import { OrganizationAutonomyPolicyService } from '../organization-autonomy-policy.service';
import { OrganizationService } from '../organization.service';
import { OrganizationNotFoundException } from '../organization.exceptions';
import type { CreateOrganizationDto } from '../dto/create-organization.dto';
import type { InviteMemberDto } from '../dto/invite-member.dto';
import type { UpdateOrganizationAutonomyPolicyDto } from '../dto/update-organization-autonomy-policy.dto';

const TEST_JWT_SECRET = 'organization-controller-test-secret';

const mockedFactories = vi.hoisted(() => ({
  createMockOrganizationService: () => ({
    createOrganization: vi.fn(),
    getOrganization: vi.fn(),
    getCurrentOrganization: vi.fn(),
    listMembers: vi.fn(),
    inviteMember: vi.fn(),
    acceptInvitation: vi.fn(),
    updateMemberRole: vi.fn(),
    removeMember: vi.fn(),
  }),
  createMockAutonomyPolicyService: () => ({
    getAutonomyPolicy: vi.fn(),
    updateAutonomyPolicy: vi.fn(),
    previewAutonomyDowngrade: vi.fn(),
    confirmAutonomyDowngrade: vi.fn(),
  }),
  createMockTokenBlacklistService: () => ({
    isBlacklisted: vi.fn().mockResolvedValue(false),
  }),
  createMockRbacCacheService: () => ({
    getUserRole: vi.fn(),
  }),
}));

type OrganizationServiceMock = ReturnType<
  typeof mockedFactories.createMockOrganizationService
>;
type OrganizationAutonomyPolicyServiceMock = ReturnType<
  typeof mockedFactories.createMockAutonomyPolicyService
>;

function getMethodRoles(methodName: keyof OrganizationController) {
  const handler = Object.getOwnPropertyDescriptor(
    OrganizationController.prototype,
    methodName,
  )?.value;

  return handler ? Reflect.getMetadata(ROLES_KEY, handler) : undefined;
}

function createOrganizationRecord(
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    id: 'org-1',
    tenantId: 'tenant-1',
    name: 'Alpha Org',
    slug: 'alpha-org',
    ownerId: 'user-1',
    description: 'demo org',
    settings: null,
    isActive: true,
    createdAt: '2026-03-25T00:00:00.000Z',
    updatedAt: '2026-03-25T00:00:00.000Z',
    ...overrides,
  };
}

function createAccessToken(
  overrides: Partial<jwt.JwtPayload & { email: string; sub: string }> = {},
) {
  const now = Math.floor(Date.now() / 1000);

  return jwt.sign(
    {
      sub: 'user-1',
      email: 'bootstrap@example.com',
      aud: 'authenticated',
      iat: now,
      exp: now + 60 * 60,
      ...overrides,
    },
    TEST_JWT_SECRET,
    { algorithm: 'HS256' },
  );
}

async function createTestingApp() {
  const organizationService = mockedFactories.createMockOrganizationService();
  const autonomyPolicyService =
    mockedFactories.createMockAutonomyPolicyService();
  const tokenBlacklistService =
    mockedFactories.createMockTokenBlacklistService();
  const rbacCacheService = mockedFactories.createMockRbacCacheService();

  const moduleRef = await Test.createTestingModule({
    controllers: [OrganizationController],
    providers: [
      {
        provide: OrganizationService,
        useValue: organizationService,
      },
      {
        provide: OrganizationAutonomyPolicyService,
        useValue: autonomyPolicyService,
      },
      {
        provide: ConfigService,
        useValue: {
          get: vi.fn((key: string) =>
            key === 'APP_JWT_SECRET' ? TEST_JWT_SECRET : undefined,
          ),
        },
      },
      {
        provide: TokenBlacklistService,
        useValue: tokenBlacklistService,
      },
      {
        provide: RbacCacheService,
        useValue: rbacCacheService,
      },
      {
        provide: UserIdentityResolverService,
        useValue: {
          resolveAppUserId: vi
            .fn()
            .mockImplementation((id: string) => Promise.resolve(id)),
        },
      },
      {
        provide: APP_GUARD,
        useClass: AuthGuard,
      },
      {
        provide: APP_GUARD,
        useClass: TenantGuard,
      },
      {
        provide: APP_GUARD,
        useClass: RolesGuard,
      },
    ],
  }).compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter(),
  );

  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return {
    app,
    organizationService,
    rbacCacheService,
    autonomyPolicyService,
  };
}

describe('OrganizationController', () => {
  let controller: OrganizationController;
  let service: OrganizationServiceMock;
  let autonomyPolicyService: OrganizationAutonomyPolicyServiceMock;

  beforeEach(() => {
    vi.clearAllMocks();

    service = mockedFactories.createMockOrganizationService();
    autonomyPolicyService = mockedFactories.createMockAutonomyPolicyService();

    controller = new OrganizationController(
      service as unknown as OrganizationService,
      autonomyPolicyService as unknown as OrganizationAutonomyPolicyService,
    );
  });

  it('keeps createOrganization bootstrap-safe by omitting @Roles metadata', () => {
    expect(getMethodRoles('createOrganization')).toBeUndefined();
  });

  it('applies owner/admin roles only to organization management routes', () => {
    expect(getMethodRoles('getOrganization')).toBeUndefined();
    expect(getMethodRoles('getCurrentOrganization')).toBeUndefined();
    expect(getMethodRoles('acceptInvitation')).toBeUndefined();
    expect(getMethodRoles('listMembers')).toEqual(['owner', 'admin']);
    expect(getMethodRoles('inviteMember')).toEqual(['owner', 'admin']);
    expect(getMethodRoles('updateMemberRole')).toEqual(['owner', 'admin']);
    expect(getMethodRoles('removeMember')).toEqual(['owner', 'admin']);
    expect(getMethodRoles('getAutonomyPolicy')).toEqual(['owner']);
    expect(getMethodRoles('updateAutonomyPolicy')).toEqual(['owner']);
    expect(getMethodRoles('previewAutonomyDowngrade')).toEqual(['owner']);
    expect(getMethodRoles('confirmAutonomyDowngrade')).toEqual(['owner']);
  });

  it('passes the authenticated user id to createOrganization and returns the full organization object', async () => {
    const dto: CreateOrganizationDto = {
      name: 'Alpha Org',
      description: 'demo org',
    };
    const organization = createOrganizationRecord();
    service.createOrganization.mockResolvedValue(organization);

    const result = await controller.createOrganization(dto, {
      user: { sub: 'user-1' },
    } as never);

    expect(service.createOrganization).toHaveBeenCalledWith('user-1', dto);
    expect(result).toEqual({ data: organization });
    expect(result.data.tenantId).toBe('tenant-1');
  });

  it('returns 401 for unauthenticated POST /organizations via the global AuthGuard', async () => {
    const { app, organizationService } = await createTestingApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/organizations',
        payload: {
          name: 'Alpha Org',
          description: 'demo org',
        } satisfies CreateOrganizationDto,
      });

      expect(response.statusCode).toBe(401);
      expect(organizationService.createOrganization).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('allows an authenticated user without tenant context to POST /organizations', async () => {
    const dto: CreateOrganizationDto = {
      name: 'Alpha Org',
      description: 'demo org',
    };
    const organization = createOrganizationRecord();
    const { app, organizationService } = await createTestingApp();
    organizationService.createOrganization.mockResolvedValue(organization);

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/organizations',
        headers: {
          authorization: `Bearer ${createAccessToken({ tenant_id: null })}`,
        },
        payload: dto,
      });

      expect(response.statusCode).toBe(201);
      expect(organizationService.createOrganization).toHaveBeenCalledWith(
        'user-1',
        dto,
      );
      expect(response.json()).toEqual({ data: organization });
      expect(response.json().data.tenantId).toBe('tenant-1');
    } finally {
      await app.close();
    }
  });

  it('wraps the organization member list in the standard data envelope', async () => {
    const members = [
      {
        userId: 'user-1',
        email: 'owner@example.com',
        displayName: 'Owner',
        role: 'owner' as const,
        createdAt: new Date('2026-03-25T00:00:00.000Z'),
      },
    ];
    service.listMembers.mockResolvedValue(members);

    const result = await controller.listMembers('org-1');

    expect(service.listMembers).toHaveBeenCalledWith('org-1');
    expect(result).toEqual({ data: members });
  });

  it('returns the current tenant organization in the standard data envelope', async () => {
    const organization = createOrganizationRecord({ memberCount: 3 });
    service.getCurrentOrganization.mockResolvedValue(organization);

    const result = await controller.getCurrentOrganization({
      tenantId: 'tenant-1',
      user: { sub: 'user-1' },
    } as never);

    expect(service.getCurrentOrganization).toHaveBeenCalledWith(
      'tenant-1',
      'user-1',
    );
    expect(result).toEqual({ data: organization });
  });

  it('propagates organization-not-found for a tenant without an organization', async () => {
    service.getCurrentOrganization.mockRejectedValue(
      new OrganizationNotFoundException(),
    );

    await expect(
      controller.getCurrentOrganization({
        tenantId: 'tenant-without-org',
        user: { sub: 'user-1' },
      } as never),
    ).rejects.toBeInstanceOf(OrganizationNotFoundException);
  });

  it('matches GET /organizations/current before the parameterized organization route', async () => {
    const organization = createOrganizationRecord({ memberCount: 1 });
    const { app, organizationService } = await createTestingApp();
    organizationService.getCurrentOrganization.mockResolvedValue(organization);

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/organizations/current',
        headers: {
          authorization: `Bearer ${createAccessToken({
            tenant_id: '11111111-1111-4111-8111-111111111111',
          })}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(organizationService.getCurrentOrganization).toHaveBeenCalledWith(
        '11111111-1111-4111-8111-111111111111',
        'user-1',
      );
      expect(organizationService.getOrganization).not.toHaveBeenCalled();
      expect(response.json()).toEqual({ data: organization });
    } finally {
      await app.close();
    }
  });

  it.each(['owner', 'admin'] as const)(
    'allows %s to read GET /organizations/:id/members',
    async (role) => {
      const members = [
        {
          userId: 'user-1',
          email: 'owner@example.com',
          displayName: null,
          role: 'owner' as const,
          createdAt: '2026-03-25T00:00:00.000Z',
        },
      ];
      const { app, organizationService, rbacCacheService } =
        await createTestingApp();
      rbacCacheService.getUserRole.mockResolvedValue(role);
      organizationService.listMembers.mockResolvedValue(members);

      try {
        const response = await app.inject({
          method: 'GET',
          url: '/organizations/org-1/members',
          headers: {
            authorization: `Bearer ${createAccessToken({
              tenant_id: '11111111-1111-4111-8111-111111111111',
            })}`,
          },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ data: members });
      } finally {
        await app.close();
      }
    },
  );

  it('rejects a viewer from GET /organizations/:id/members', async () => {
    const { app, organizationService, rbacCacheService } =
      await createTestingApp();
    rbacCacheService.getUserRole.mockResolvedValue('viewer');

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/organizations/org-1/members',
        headers: {
          authorization: `Bearer ${createAccessToken({
            tenant_id: '11111111-1111-4111-8111-111111111111',
          })}`,
        },
      });

      expect(response.statusCode).toBe(403);
      expect(organizationService.listMembers).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
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
