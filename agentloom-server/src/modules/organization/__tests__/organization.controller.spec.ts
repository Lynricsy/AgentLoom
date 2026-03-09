import 'reflect-metadata';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { OrganizationController } from '../organization.controller';
import type { OrganizationService } from '../organization.service';
import type { InviteMemberDto } from '../dto/invite-member.dto';

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

  beforeEach(() => {
    service = {
      createOrganization: vi.fn(),
      getOrganization: vi.fn(),
      inviteMember: vi.fn(),
      acceptInvitation: vi.fn(),
      updateMemberRole: vi.fn(),
      removeMember: vi.fn(),
    };

    controller = new OrganizationController(
      service as unknown as OrganizationService,
    );
  });

  it('applies owner/admin roles only to organization management routes', () => {
    expect(getMethodRoles('createOrganization')).toBeUndefined();
    expect(getMethodRoles('getOrganization')).toBeUndefined();
    expect(getMethodRoles('acceptInvitation')).toBeUndefined();
    expect(getMethodRoles('inviteMember')).toEqual(['owner', 'admin']);
    expect(getMethodRoles('updateMemberRole')).toEqual(['owner', 'admin']);
    expect(getMethodRoles('removeMember')).toEqual(['owner', 'admin']);
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
});
