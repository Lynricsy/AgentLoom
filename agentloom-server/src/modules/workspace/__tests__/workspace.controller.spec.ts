import type { FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import type { JwtPayload } from '../../../common/guards/auth.guard';
import { WorkspaceController } from '../workspace.controller';
import type { WorkspaceService } from '../workspace.service';
import { enrichWorkspaceSnapshot } from '../workspace-source.utils';

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_ORG_ID = '00000000-0000-0000-0000-000000000010';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000020';

function buildRequest(
  overrides: Partial<
    FastifyRequest & { tenantId?: string; user: JwtPayload }
  > = {},
) {
  return {
    tenantId: TEST_TENANT_ID,
    user: {
      sub: TEST_USER_ID,
      email: 'workspace@example.com',
      aud: 'authenticated',
      exp: 1,
      iat: 1,
      tenantId: TEST_TENANT_ID,
    },
    ...overrides,
  } as FastifyRequest & { tenantId?: string; user: JwtPayload };
}

describe('WorkspaceController', () => {
  it('create 应解析真实 organizationId，而不是错误复用 tenantId', async () => {
    const snapshot = { id: 'workspace-1' };
    const workspaceService = {
      resolveOrganizationId: vi.fn().mockResolvedValue(TEST_ORG_ID),
      createEmpty: vi.fn().mockResolvedValue(snapshot),
      createFromSandbox: vi.fn(),
    } as unknown as WorkspaceService;
    const controller = new WorkspaceController(workspaceService);

    const result = await controller.create(
      {
        name: 'Chore',
        description: null,
      },
      buildRequest({
        user: {
          sub: TEST_USER_ID,
          email: 'workspace@example.com',
          aud: 'authenticated',
          exp: 1,
          iat: 1,
          tenantId: TEST_TENANT_ID,
        },
      }),
    );

    expect(workspaceService.resolveOrganizationId).toHaveBeenCalledWith(
      TEST_TENANT_ID,
    );
    expect(workspaceService.createEmpty).toHaveBeenCalledWith(
      TEST_TENANT_ID,
      TEST_ORG_ID,
      TEST_USER_ID,
      'Chore',
      undefined,
    );
    expect(result).toEqual({ data: enrichWorkspaceSnapshot(snapshot as never) });
  });
});
