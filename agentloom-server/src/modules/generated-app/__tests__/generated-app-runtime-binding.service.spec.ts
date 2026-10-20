import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import type { DrizzleDB } from '../../../database/database.module';
import type { GeneratedApp } from '../../../database/schema';
import type { WorkflowVersionService } from '../../workflow-definition/workflow-version.service';
import {
  GeneratedAppBindingTargetNotFoundException,
  GeneratedAppNotFoundException,
} from '../generated-app.exceptions';
import { GeneratedAppRepository } from '../generated-app.repository';
import { buildAgentWrapperWorkflowGraph } from '../generated-app.runtime-binding.util';
import {
  GENERATED_APP_AGENT_WRAPPER_BINDING_KIND,
  GeneratedAppRuntimeBindingService,
} from '../generated-app-runtime-binding.service';
import {
  APP_ID,
  GENERATION_RUN_ID,
  TENANT_ID,
  USER_ID,
  V2_AGENT_DEFINITION_ID,
  WORKFLOW_DEFINITION_ID,
  WORKFLOW_VERSION_ID,
  createAgentAppSpecV2Fixture,
  createAppSpecV2Fixture,
  createConfigService,
  createGeneratedApp,
} from './generated-app-test-support';

vi.mock(
  '../../../common/interceptors/tenant-transaction.context',
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    runInTenantTransaction: (
      db: unknown,
      _tenantId: string,
      operation: (db: unknown) => unknown,
    ) => operation(db),
  }),
);

const WRAPPER_ID = '88888888-8888-4888-8888-888888888881';
const WRAPPER_VERSION_ID = '88888888-8888-4888-8888-888888888882';
const NEWER_VERSION_ID = '88888888-8888-4888-8888-888888888883';
const RUNTIME_SOURCE = 'generated-app-runtime-workflow';
const dialect = new PgDialect();

function limitChain<T>(rows: T[]) {
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

function updateChain<T>(rows: T[] = []) {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn(),
    returning: vi.fn().mockResolvedValue(rows),
  };
  chain.where.mockReturnValue(chain);
  return chain;
}

function createFakeDb() {
  return {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    // 包装工作流写入用 savepoint；单测直接复用同一个 db
    transaction: <T>(operation: (tx: unknown) => Promise<T>) =>
      operation(fakeDb),
  };
}
let fakeDb: ReturnType<typeof createFakeDb>;

function wrapperWorkflowRow(overrides: Record<string, unknown> = {}) {
  return {
    id: WRAPPER_ID,
    status: 'published',
    publishedVersionId: WRAPPER_VERSION_ID,
    inputSchema: null,
    metadata: {
      source: RUNTIME_SOURCE,
      generatedAppId: APP_ID,
      bindingKind: GENERATED_APP_AGENT_WRAPPER_BINDING_KIND,
    },
    ...overrides,
  };
}

describe('GeneratedAppRuntimeBindingService', () => {
  let repository: GeneratedAppRepository;
  let publish: Mock;
  let service: GeneratedAppRuntimeBindingService;

  beforeEach(() => {
    fakeDb = createFakeDb();
    repository = new GeneratedAppRepository(
      fakeDb as unknown as DrizzleDB,
      createConfigService(),
    );
    vi.spyOn(repository, 'tenantDb', 'get').mockReturnValue(
      fakeDb as unknown as DrizzleDB,
    );
    publish = vi.fn().mockResolvedValue({ data: { id: NEWER_VERSION_ID } });
    service = new GeneratedAppRuntimeBindingService(repository, {
      publish,
    } as unknown as WorkflowVersionService);
  });

  function mockApp(app: GeneratedApp) {
    vi.spyOn(repository, 'findGeneratedAppRecord').mockResolvedValue(app);
  }

  describe('运行时绑定就绪度', () => {
    it('还没有 v2 AppSpec 时 runtime_not_bound，不查询工作流', async () => {
      mockApp(createGeneratedApp({ appSpec: null }));

      const readiness = await service.getRuntimeBindingReadiness(
        TENANT_ID,
        APP_ID,
      );

      expect(readiness).toMatchObject({
        state: 'runtime_not_bound',
        canStartWorkflowExecution: false,
        pinnedVersionId: null,
      });
      expect(fakeDb.select).not.toHaveBeenCalled();
    });

    it('固定版本仍是当前发布版本时 workflow_published，按租户与固定版本查询', async () => {
      mockApp(createGeneratedApp());
      const workflowSelect = limitChain([
        {
          id: WORKFLOW_DEFINITION_ID,
          status: 'published',
          publishedVersionId: WORKFLOW_VERSION_ID,
          metadata: {},
        },
      ]);
      const versionSelect = limitChain([
        {
          id: WORKFLOW_VERSION_ID,
          snapshot: {
            nodes: [],
            edges: [],
            inputSchema: { version: 2, collectionMode: 'form', fields: [] },
          },
        },
      ]);
      fakeDb.select
        .mockReturnValueOnce(workflowSelect)
        .mockReturnValueOnce(versionSelect);

      const readiness = await service.getRuntimeBindingReadiness(
        TENANT_ID,
        APP_ID,
      );

      expect(readiness).toMatchObject({
        state: 'workflow_published',
        workflowDefinitionId: WORKFLOW_DEFINITION_ID,
        pinnedVersionId: WORKFLOW_VERSION_ID,
        canStartWorkflowExecution: true,
      });
      const versionQuery = dialect.sqlToQuery(
        versionSelect.where.mock.calls[0]?.[0] as SQL,
      );
      expect(versionQuery.params).toEqual([
        WORKFLOW_DEFINITION_ID,
        TENANT_ID,
        WORKFLOW_VERSION_ID,
      ]);
    });

    it('源工作流重新发布后 workflow_version_drift：仍可执行固定版本', async () => {
      mockApp(createGeneratedApp());
      fakeDb.select
        .mockReturnValueOnce(
          limitChain([
            {
              id: WORKFLOW_DEFINITION_ID,
              status: 'published',
              publishedVersionId: NEWER_VERSION_ID,
              metadata: {},
            },
          ]),
        )
        .mockReturnValueOnce(
          limitChain([
            {
              id: WORKFLOW_VERSION_ID,
              snapshot: { nodes: [], edges: [], inputSchema: null },
            },
          ]),
        );

      const readiness = await service.getRuntimeBindingReadiness(
        TENANT_ID,
        APP_ID,
      );

      expect(readiness).toMatchObject({
        state: 'workflow_version_drift',
        publishedVersionId: NEWER_VERSION_ID,
        pinnedVersionId: WORKFLOW_VERSION_ID,
        canStartWorkflowExecution: true,
      });
    });

    it('工作流不存在、已归档、未发布或固定版本被删时不可执行', async () => {
      const app = createGeneratedApp();
      const spec = createAppSpecV2Fixture();
      const cases: Array<{ rows: unknown[][]; state: string }> = [
        { rows: [[]], state: 'workflow_not_found' },
        {
          rows: [
            [
              {
                id: WORKFLOW_DEFINITION_ID,
                status: 'archived',
                publishedVersionId: null,
                metadata: {},
              },
            ],
          ],
          state: 'workflow_not_found',
        },
        {
          rows: [
            [
              {
                id: WORKFLOW_DEFINITION_ID,
                status: 'draft',
                publishedVersionId: null,
                metadata: {},
              },
            ],
          ],
          state: 'workflow_not_published',
        },
        {
          rows: [
            [
              {
                id: WORKFLOW_DEFINITION_ID,
                status: 'published',
                publishedVersionId: NEWER_VERSION_ID,
                metadata: {},
              },
            ],
            [],
          ],
          state: 'workflow_not_found',
        },
      ];

      for (const { rows, state } of cases) {
        for (const result of rows) {
          fakeDb.select.mockReturnValueOnce(limitChain(result));
        }
        await expect(
          service.resolveRuntimeTarget(
            fakeDb as unknown as DrizzleDB,
            app,
            spec,
          ),
        ).resolves.toMatchObject({ available: false, state });
      }
    });

    it('Agent 绑定取与当前 AppSpec 指纹一致的包装工作流版本，而不是最新发布版本', async () => {
      const spec = createAgentAppSpecV2Fixture();
      const app = createGeneratedApp({
        appSpec: spec,
        workflowDefinitionId: WRAPPER_ID,
      });
      const graph = buildAgentWrapperWorkflowGraph(spec, { appId: APP_ID });
      fakeDb.select
        .mockReturnValueOnce(
          limitChain([
            wrapperWorkflowRow({ publishedVersionId: NEWER_VERSION_ID }),
          ]),
        )
        .mockReturnValueOnce(
          limitChain([
            // 创建者手动改过并重新发布的版本：指纹对不上
            {
              id: NEWER_VERSION_ID,
              snapshot: { nodes: [], edges: [], inputSchema: null },
            },
            {
              id: WRAPPER_VERSION_ID,
              snapshot: {
                nodes: graph.nodes,
                edges: graph.edges,
                inputSchema: graph.inputSchema,
              },
            },
          ]),
        );

      await expect(
        service.resolveRuntimeTarget(fakeDb as unknown as DrizzleDB, app, spec),
      ).resolves.toEqual({
        available: true,
        workflowDefinitionId: WRAPPER_ID,
        workflowVersionId: WRAPPER_VERSION_ID,
        inputSchemaVersion: 1,
        workflowStatus: 'published',
        publishedVersionId: NEWER_VERSION_ID,
        drifted: true,
      });
    });

    it('Agent 绑定尚未创建包装工作流，或绑定的是别的工作流时 runtime_not_bound', async () => {
      const spec = createAgentAppSpecV2Fixture();

      await expect(
        service.resolveRuntimeTarget(
          fakeDb as unknown as DrizzleDB,
          createGeneratedApp({ appSpec: spec, workflowDefinitionId: null }),
          spec,
        ),
      ).resolves.toMatchObject({
        available: false,
        state: 'runtime_not_bound',
      });

      fakeDb.select.mockReturnValueOnce(
        limitChain([wrapperWorkflowRow({ metadata: { source: 'user' } })]),
      );
      await expect(
        service.resolveRuntimeTarget(
          fakeDb as unknown as DrizzleDB,
          createGeneratedApp({
            appSpec: spec,
            workflowDefinitionId: WRAPPER_ID,
          }),
          spec,
        ),
      ).resolves.toMatchObject({
        available: false,
        state: 'runtime_not_bound',
      });
    });
  });

  describe('ensureRuntimeWorkflow', () => {
    it('工作流绑定直接使用被绑定工作流与固定版本，不创建、不发布任何工作流', async () => {
      fakeDb.select.mockReturnValueOnce(
        limitChain([{ id: WORKFLOW_VERSION_ID }]),
      );
      const appUpdate = updateChain([{ id: APP_ID }]);
      fakeDb.update.mockReturnValueOnce(appUpdate);

      await expect(
        service.ensureRuntimeWorkflow({
          tenantId: TENANT_ID,
          userId: USER_ID,
          appId: APP_ID,
          appSpec: createAppSpecV2Fixture(),
          generationRunId: GENERATION_RUN_ID,
        }),
      ).resolves.toEqual({
        workflowDefinitionId: WORKFLOW_DEFINITION_ID,
        workflowVersionId: WORKFLOW_VERSION_ID,
      });
      expect(fakeDb.insert).not.toHaveBeenCalled();
      expect(publish).not.toHaveBeenCalled();
      expect(appUpdate.set).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowDefinitionId: WORKFLOW_DEFINITION_ID,
          agentDefinitionId: null,
        }),
      );
    });

    it('固定版本已不存在时报绑定目标不存在，不改应用', async () => {
      fakeDb.select.mockReturnValueOnce(limitChain([]));

      await expect(
        service.ensureRuntimeWorkflow({
          tenantId: TENANT_ID,
          userId: USER_ID,
          appId: APP_ID,
          appSpec: createAppSpecV2Fixture(),
          generationRunId: GENERATION_RUN_ID,
        }),
      ).rejects.toBeInstanceOf(GeneratedAppBindingTargetNotFoundException);
      expect(fakeDb.update).not.toHaveBeenCalled();
    });

    it('Agent 绑定首次创建包装工作流并经发布链发布，应用记录包装工作流与 Agent', async () => {
      const spec = createAgentAppSpecV2Fixture();
      fakeDb.select.mockReturnValueOnce(limitChain([]));
      const insert = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: WRAPPER_ID }]),
      };
      fakeDb.insert.mockReturnValueOnce(insert);
      const appUpdate = updateChain([{ id: APP_ID }]);
      fakeDb.update.mockReturnValueOnce(appUpdate);

      await expect(
        service.ensureRuntimeWorkflow({
          tenantId: TENANT_ID,
          userId: USER_ID,
          appId: APP_ID,
          appSpec: spec,
          generationRunId: GENERATION_RUN_ID,
        }),
      ).resolves.toEqual({
        workflowDefinitionId: WRAPPER_ID,
        workflowVersionId: NEWER_VERSION_ID,
      });
      const graph = buildAgentWrapperWorkflowGraph(spec, { appId: APP_ID });
      expect(insert.values).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          status: 'draft',
          nodes: graph.nodes,
          edges: graph.edges,
          inputSchema: graph.inputSchema,
          metadata: expect.objectContaining({
            source: RUNTIME_SOURCE,
            generatedAppId: APP_ID,
            bindingKind: GENERATED_APP_AGENT_WRAPPER_BINDING_KIND,
          }),
        }),
      );
      expect(publish).toHaveBeenCalledWith(
        WRAPPER_ID,
        expect.objectContaining({ label: expect.any(String) }),
        USER_ID,
      );
      expect(appUpdate.set).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowDefinitionId: WRAPPER_ID,
          agentDefinitionId: V2_AGENT_DEFINITION_ID,
        }),
      );
    });

    it('同一 AppSpec 再次调用时复用已发布的一致版本，不改画布、不重复发布', async () => {
      const spec = createAgentAppSpecV2Fixture();
      const graph = buildAgentWrapperWorkflowGraph(spec, { appId: APP_ID });
      fakeDb.select
        .mockReturnValueOnce(limitChain([wrapperWorkflowRow()]))
        .mockReturnValueOnce(
          limitChain([{ snapshot: { nodes: graph.nodes } }]),
        );
      fakeDb.update.mockReturnValueOnce(updateChain([{ id: APP_ID }]));

      await expect(
        service.ensureRuntimeWorkflow({
          tenantId: TENANT_ID,
          userId: USER_ID,
          appId: APP_ID,
          appSpec: spec,
          generationRunId: GENERATION_RUN_ID,
        }),
      ).resolves.toEqual({
        workflowDefinitionId: WRAPPER_ID,
        workflowVersionId: WRAPPER_VERSION_ID,
      });
      expect(publish).not.toHaveBeenCalled();
      expect(fakeDb.update).toHaveBeenCalledTimes(1);
    });

    it('AppSpec 变化后更新画布、输入契约版本加 1 并发布新版本', async () => {
      const spec = createAgentAppSpecV2Fixture();
      fakeDb.select
        .mockReturnValueOnce(
          limitChain([
            wrapperWorkflowRow({
              inputSchema: {
                version: 3,
                collectionMode: 'form',
                fields: [
                  { id: 'topic', type: 'text', label: '主题', required: true },
                ],
              },
            }),
          ]),
        )
        .mockReturnValueOnce(limitChain([{ snapshot: { nodes: [] } }]));
      const definitionUpdate = updateChain();
      fakeDb.update
        .mockReturnValueOnce(definitionUpdate)
        .mockReturnValueOnce(updateChain([{ id: APP_ID }]));

      await expect(
        service.ensureRuntimeWorkflow({
          tenantId: TENANT_ID,
          userId: USER_ID,
          appId: APP_ID,
          appSpec: spec,
          generationRunId: GENERATION_RUN_ID,
        }),
      ).resolves.toEqual({
        workflowDefinitionId: WRAPPER_ID,
        workflowVersionId: NEWER_VERSION_ID,
      });
      expect(definitionUpdate.set).toHaveBeenCalledWith(
        expect.objectContaining({
          inputSchema: expect.objectContaining({
            version: 4,
            fields: [expect.objectContaining({ id: 'question' })],
          }),
        }),
      );
      expect(publish).toHaveBeenCalledTimes(1);
    });

    it('应用已删除时整体失败', async () => {
      fakeDb.select.mockReturnValueOnce(
        limitChain([{ id: WORKFLOW_VERSION_ID }]),
      );
      fakeDb.update.mockReturnValueOnce(updateChain([]));

      await expect(
        service.ensureRuntimeWorkflow({
          tenantId: TENANT_ID,
          userId: USER_ID,
          appId: APP_ID,
          appSpec: createAppSpecV2Fixture(),
          generationRunId: GENERATION_RUN_ID,
        }),
      ).rejects.toBeInstanceOf(GeneratedAppNotFoundException);
    });
  });
});
