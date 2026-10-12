/**
 * 工作流导入事务回归：验证依赖克隆的读取与写入始终使用同一个事务 client。
 */
import { describe, expect, it, vi } from 'vitest';

import { WORKFLOW_EXPORT_VERSION } from '../dto/workflow-export.dto';
import { WorkflowImportService } from '../workflow-import.service';
import { WorkflowImportSourceResolverService } from '../workflow-import-source-resolver.service';
import { WorkflowImportValidationException } from '../workflow-version.exceptions';

function selectChain(result: unknown) {
  const where = vi.fn().mockResolvedValue(result);
  const chain = { where } as {
    innerJoin?: ReturnType<typeof vi.fn>;
    where: typeof where;
  };
  chain.innerJoin = vi.fn().mockReturnValue(chain);
  return {
    from: vi.fn().mockReturnValue(chain),
  };
}

function insertChain(result: unknown, onWrite: () => void) {
  return {
    values: vi.fn().mockImplementation(() => {
      onWrite();
      const returning = vi.fn().mockResolvedValue([result]);
      return {
        returning,
        onConflictDoNothing: vi.fn().mockReturnValue({ returning }),
      };
    }),
  };
}

function createService() {
  return new WorkflowImportService(
    {} as never,
    { findBySlug: vi.fn() } as never,
    { getShareByToken: vi.fn(), incrementCopyCount: vi.fn() } as never,
    { recordImportedResources: vi.fn() } as never,
    new WorkflowImportSourceResolverService(),
  );
}

describe('WorkflowImportService import validation', () => {
  it('DTO 形状错误时应统一返回 422 导入校验异常', async () => {
    await expect(
      createService().importWorkflow('tenant-id', 'user-id', {}),
    ).rejects.toMatchObject({
      type: 'https://agentloom.dev/errors/workflow-import-validation',
      status: 422,
    });
    await expect(
      createService().importWorkflow('tenant-id', 'user-id', {}),
    ).rejects.toBeInstanceOf(WorkflowImportValidationException);
  });

  it('文件内容校验失败时应返回 422 而不是 400', async () => {
    await expect(
      createService().importWorkflow('tenant-id', 'user-id', {
        name: '坏文件',
        file_content: {
          schema_version: WORKFLOW_EXPORT_VERSION,
          exported_at: '2026-08-27T00:00:00.000Z',
          workflow: {
            name: '坏文件',
            description: null,
            definition: {
              nodes: [{ type: 'agent', position: { x: 0, y: 0 }, data: {} }],
              edges: [],
              viewport: { x: 0, y: 0, zoom: 1 },
            },
            input_schema: null,
          },
        },
      }),
    ).rejects.toMatchObject({
      type: 'https://agentloom.dev/errors/workflow-import-validation',
      status: 422,
    });
  });
});

describe('WorkflowImportService transaction boundary', () => {
  it('源租户 Agent 走根连接读取（目标租户 RLS 下不可见），克隆写入全部在事务内并随失败回滚', async () => {
    const sourceTenantId = '00000000-0000-0000-0000-000000000001';
    const targetTenantId = '00000000-0000-0000-0000-000000000002';
    const userId = '00000000-0000-0000-0000-000000000003';
    const agentId = '00000000-0000-0000-0000-000000000004';
    const agentVersionId = '00000000-0000-0000-0000-000000000005';
    const pendingWrites: string[] = [];
    const committedWrites: string[] = [];

    const tx = {
      select: vi.fn(),
      insert: vi
        .fn()
        .mockReturnValueOnce(
          insertChain(
            {
              id: '00000000-0000-0000-0000-000000000006',
              name: 'Imported Agent',
              runtimeMode: 'no_sandbox',
            },
            () => pendingWrites.push('agent-definition'),
          ),
        )
        .mockReturnValueOnce(
          insertChain({ id: '00000000-0000-0000-0000-000000000007' }, () =>
            pendingWrites.push('agent-version'),
          ),
        )
        .mockReturnValueOnce({
          values: vi.fn().mockImplementation(() => {
            pendingWrites.push('workflow-definition');
            return {
              returning: vi
                .fn()
                .mockRejectedValue(new Error('force transaction rollback')),
            };
          }),
        }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
      }),
    };

    const rootDb = {
      select: vi
        .fn()
        .mockReturnValueOnce(
          selectChain([
            {
              id: '00000000-0000-0000-0000-000000000008',
              title: 'Marketplace Workflow',
              sourceTenantId,
              snapshot: {
                nodes: [
                  {
                    id: 'agent-node',
                    type: 'agent',
                    position: { x: 0, y: 0 },
                    data: {
                      nodeType: 'agent',
                      agentDefinitionId: agentId,
                      agentVersionId,
                    },
                  },
                ],
                edges: [],
                viewport: null,
                inputSchema: null,
              },
            },
          ]),
        )
        .mockReturnValueOnce(
          selectChain([
            {
              id: agentId,
              tenantId: sourceTenantId,
              name: 'Imported Agent',
              description: null,
              icon: null,
              runtimeMode: 'no_sandbox',
              sandboxConfig: null,
              workspaceSnapshotId: null,
              publishedVersionId: agentVersionId,
            },
          ]),
        )
        .mockReturnValueOnce(
          selectChain([
            {
              id: agentVersionId,
              snapshot: {
                runtimeMode: 'no_sandbox',
                nodes: [],
                edges: [],
                viewport: null,
                systemPrompt: null,
                metadata: {},
              },
            },
          ]),
        ),
      insert: vi.fn(),
      update: vi.fn(),
      transaction: vi.fn(
        async (operation: (client: typeof tx) => Promise<unknown>) => {
          try {
            const result = await operation(tx);
            committedWrites.push(...pendingWrites);
            return result;
          } catch (error) {
            pendingWrites.length = 0;
            throw error;
          }
        },
      ),
    };

    const service = new WorkflowImportService(
      rootDb as never,
      { findBySlug: vi.fn() } as never,
      { getShareByToken: vi.fn(), incrementCopyCount: vi.fn() } as never,
      { recordImportedResources: vi.fn() } as never,
      new WorkflowImportSourceResolverService(),
    );

    await expect(
      service.create(targetTenantId, userId, {
        name: 'Rollback Workflow',
        marketplace_listing_id: '00000000-0000-0000-0000-000000000008',
      }),
    ).rejects.toThrow('force transaction rollback');

    // 列表 + 源 Agent 定义 + 源 Agent 版本，全部走根连接；事务里不读源租户
    expect(rootDb.select).toHaveBeenCalledTimes(3);
    expect(rootDb.insert).not.toHaveBeenCalled();
    expect(tx.select).not.toHaveBeenCalled();
    expect(tx.insert).toHaveBeenCalledTimes(3);
    expect(committedWrites).toEqual([]);
    expect(pendingWrites).toEqual([]);
  });
});
