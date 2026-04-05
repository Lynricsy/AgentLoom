import type { FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import type { JwtPayload } from '../../../common/guards/auth.guard';
import { WorkspaceController } from '../workspace.controller';
import type { WorkspaceService } from '../workspace.service';
import { enrichWorkspaceSnapshot } from '../workspace-source.utils';

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_ORG_ID = '00000000-0000-0000-0000-000000000010';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000020';
const TEST_WORKSPACE_ID = '00000000-0000-0000-0000-000000000030';

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
    expect(result).toEqual({
      data: enrichWorkspaceSnapshot(snapshot as never),
    });
  });

  it('getFileTree 应调用 workspaceService 并返回 data envelope', async () => {
    const fileTree = [{ name: 'readme.md', type: 'file', path: 'readme.md' }];
    const workspaceService = {
      getFileTree: vi.fn().mockResolvedValue(fileTree),
    } as unknown as WorkspaceService;
    const controller = new WorkspaceController(workspaceService);

    await expect(
      controller.getFileTree(TEST_WORKSPACE_ID, buildRequest()),
    ).resolves.toEqual({ data: fileTree });
    expect(workspaceService.getFileTree).toHaveBeenCalledWith(
      TEST_TENANT_ID,
      TEST_WORKSPACE_ID,
    );
  });

  it('getFilePreview 应调用 workspaceService 并返回 data envelope', async () => {
    const preview = {
      kind: 'text',
      path: 'readme.md',
      fileName: 'readme.md',
      size: 7,
      mimeType: 'text/markdown',
      canDownload: true,
      content: '# hello',
      encoding: 'utf-8',
    };
    const workspaceService = {
      getFilePreview: vi.fn().mockResolvedValue(preview),
    } as unknown as WorkspaceService;
    const controller = new WorkspaceController(workspaceService);

    await expect(
      controller.getFilePreview(
        TEST_WORKSPACE_ID,
        'docs/readme.md',
        buildRequest(),
      ),
    ).resolves.toEqual({ data: preview });
    expect(workspaceService.getFilePreview).toHaveBeenCalledWith(
      TEST_TENANT_ID,
      TEST_WORKSPACE_ID,
      'docs/readme.md',
    );
  });

  it('getRawFile 应透传文件资产到 Fastify reply', async () => {
    const asset = {
      fileName: 'cover.png',
      size: 6,
      mimeType: 'image/png',
      content: Buffer.from([1, 2, 3]),
    };
    const reply = {
      header: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      send: vi.fn().mockResolvedValue(undefined),
    };
    const workspaceService = {
      getFileAsset: vi.fn().mockResolvedValue(asset),
    } as unknown as WorkspaceService;
    const controller = new WorkspaceController(workspaceService);

    await controller.getRawFile(
      TEST_WORKSPACE_ID,
      'cover.png',
      buildRequest(),
      reply,
    );

    expect(workspaceService.getFileAsset).toHaveBeenCalledWith(
      TEST_TENANT_ID,
      TEST_WORKSPACE_ID,
      'cover.png',
    );
    expect(reply.header).toHaveBeenCalledWith(
      'Content-Disposition',
      'inline; filename="cover.png"',
    );
    expect(reply.header).toHaveBeenCalledWith('Content-Length', '6');
    expect(reply.type).toHaveBeenCalledWith('image/png');
    expect(reply.send).toHaveBeenCalledWith(asset.content);
  });
});
