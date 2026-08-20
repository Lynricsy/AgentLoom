import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@anatine/zod-nestjs', async () => {
  const { createZodDto } = await import('nestjs-zod');
  return { createZodDto };
});

import { RedisCacheService } from '../../../common/redis/redis-cache.service';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { DRIZZLE } from '../../../database/database.module';
import { OrganizationAutonomyPolicyService } from '../../organization/organization-autonomy-policy.service';
import { TemplateService } from '../../template/template.service';
import { ShareService } from '../../share/share.service';
import { ResourceSourceService } from '../../resource-source/resource-source.service';
import { WorkflowNotPublishedException } from '../../execution/execution.exceptions';
import { MarketplaceListingNotFoundException } from '../../marketplace/marketplace.exceptions';
import { ListWorkflowDefinitionsQueryDto } from '../dto/list-workflow-definitions-query.dto';
import { WORKFLOW_EXPORT_VERSION } from '../dto/workflow-export.dto';
import { WorkflowVersionService } from '../workflow-version.service';
import { WorkflowImportService } from '../workflow-import.service';
import { WorkflowImportSourceResolverService } from '../workflow-import-source-resolver.service';
import { WorkflowPublishService } from '../workflow-publish.service';
import {
  WorkflowArchivedException,
  WorkflowPublishAutonomyCapException,
  WorkflowPublishAgentBindingException,
  WorkflowNotFoundException,
  WorkflowPublishValidationException,
  WorkflowVersionConflictException,
  WorkflowVersionNotFoundException,
} from '../workflow-version.exceptions';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000002';
const WORKFLOW_ID = '00000000-0000-0000-0000-000000000003';
const VERSION_ID = '00000000-0000-0000-0000-000000000004';
const VERSION_ID_2 = '00000000-0000-0000-0000-000000000005';
const NOW = new Date('2025-01-01T00:00:00Z');

const MOCK_NODES = [
  { id: 'node-1', type: 'test', position: { x: 0, y: 0 }, data: {} },
];
const MOCK_EDGES = [{ id: 'edge-1', source: 'node-1', target: 'node-2' }];
const MOCK_VIEWPORT = { x: 0, y: 0, zoom: 1 };
const MOCK_INPUT_SCHEMA = {
  version: 1,
  collectionMode: 'form' as const,
  fields: [
    {
      id: 'topic',
      type: 'text' as const,
      label: '分析主题',
      required: true,
      validation: { maxLength: 200 },
    },
  ],
};

const CONDITIONAL_INPUT_SCHEMA = {
  version: 1,
  collectionMode: 'form' as const,
  fields: [
    {
      id: 'mode',
      type: 'single_select' as const,
      label: '运行模式',
      required: true,
      options: ['basic', 'advanced'],
    },
    {
      id: 'advancedNote',
      type: 'text' as const,
      label: '高级说明',
      required: true,
      visibility: {
        fieldId: 'mode',
        equals: 'advanced',
      },
    },
  ],
};

const MOCK_SNAPSHOT = {
  nodes: MOCK_NODES,
  edges: MOCK_EDGES,
  viewport: MOCK_VIEWPORT,
  inputSchema: null,
  metadata: { nodeCount: 1, edgeCount: 1, createdFromVersion: 1 },
};

function createDraftWorkflow(overrides: Record<string, unknown> = {}) {
  return {
    id: WORKFLOW_ID,
    tenantId: TENANT_ID,
    name: '测试工作流',
    slug: 'test-workflow',
    description: null,
    nodes: MOCK_NODES,
    edges: MOCK_EDGES,
    viewport: MOCK_VIEWPORT,
    metadata: {},
    inputSchema: null,
    version: 1,
    status: 'draft' as const,
    publishedVersionId: null,
    createdBy: USER_ID,
    updatedBy: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function createMockVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: VERSION_ID,
    workflowDefinitionId: WORKFLOW_ID,
    tenantId: TENANT_ID,
    versionNumber: 1,
    label: null,
    snapshot: MOCK_SNAPSHOT,
    publishedAt: null,
    archivedAt: null,
    createdBy: USER_ID,
    createdAt: NOW,
    ...overrides,
  };
}

function createPortMappedWorkflow(sourceType: string, targetType: string) {
  return createDraftWorkflow({
    nodes: [
      {
        id: 'node-1',
        type: 'test',
        position: { x: 0, y: 0 },
        data: {
          portMappingMetadata: {
            outputs: [{ name: 'output-text', dataType: sourceType }],
          },
        },
      },
      {
        id: 'node-2',
        type: 'test',
        position: { x: 200, y: 0 },
        data: {
          portMappingMetadata: {
            inputs: [{ name: 'input-data', dataType: targetType }],
          },
        },
      },
    ],
    edges: [
      {
        id: 'edge-typed-1',
        source: 'node-1',
        target: 'node-2',
        sourceHandle: 'output-text',
        targetHandle: 'input-data',
      },
    ],
  });
}

// 刻意保留 legacy `llm-agent` 类型：归一化会把它收敛成 canonical `agent`，
// 这条 fixture 因此顺带覆盖了「legacy 别名生效后自治上限校验仍能命中该节点」。
// 绑定字段是必需的——发布前的 Agent 绑定校验先于自治校验，不带绑定就走不到被测逻辑。
function createAutonomyWorkflow(
  autonomyMode: 'MANUAL_CONFIRM' | 'RULE_BASED' | 'LLM_SUGGEST' | 'FULL_AUTO',
  source: 'canonical' | 'legacy',
) {
  return createDraftWorkflow({
    nodes: [
      {
        id: 'agent-1',
        type: 'llm-agent',
        position: { x: 0, y: 0 },
        data:
          source === 'legacy'
            ? {
                label: 'Planner',
                agentDefinitionId: 'published-agent-definition-1',
                autonomyMode,
              }
            : {
                label: 'Planner',
                agentDefinitionId: 'published-agent-definition-1',
                autonomyConfig: { mode: autonomyMode },
              },
      },
    ],
    edges: [],
  });
}

function createNoSandboxWorkflowWithUpstreamMcp() {
  return createDraftWorkflow({
    nodes: [
      {
        id: 'mcp-1',
        type: 'tool',
        position: { x: 0, y: 0 },
        data: {
          label: 'WebSearch',
          nodeType: 'mcp-tool',
          mcpServerConfigId: 'mcp-config-1',
        },
      },
      {
        id: 'agent-1',
        type: 'agent',
        position: { x: 240, y: 0 },
        data: {
          label: 'NoSandbox News Agent',
          nodeType: 'agent',
          agentRuntimeMode: 'no_sandbox',
          agentDefinitionId: 'published-agent-definition-1',
        },
      },
    ],
    edges: [
      {
        id: 'edge-mcp-agent',
        source: 'mcp-1',
        target: 'agent-1',
        sourceHandle: 'tool-out',
        targetHandle: 'tools-in',
      },
    ],
  });
}

function createSelectChain(result: unknown) {
  const where = vi.fn().mockResolvedValue(result);
  const from = vi.fn().mockReturnValue({ where });
  return { from, where };
}

function createSelectChainWithLimit(result: unknown) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  return { from, where, limit };
}

function createSelectChainWithPagination(result: unknown) {
  const offset = vi.fn().mockResolvedValue(result);
  const limit = vi.fn().mockReturnValue({ offset });
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  const leftJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ leftJoin, where });
  return { from, leftJoin, where, orderBy, limit, offset };
}

function createSelectChainWithInnerJoin(result: unknown) {
  const where = vi.fn().mockResolvedValue(result);
  const chain = { where } as {
    innerJoin?: ReturnType<typeof vi.fn>;
    where: typeof where;
  };
  const innerJoin = vi.fn().mockReturnValue(chain);
  chain.innerJoin = innerJoin;
  const from = vi.fn().mockReturnValue({ innerJoin });
  return { from, innerJoin, where };
}

function createInsertChain(result: unknown) {
  const returning = vi.fn().mockResolvedValue(result);
  const values = vi.fn().mockReturnValue({ returning });
  return { values, returning };
}

function createUpdateChain(result: unknown) {
  const returning = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  return { set, where, returning };
}

/** update 不带 returning 的场景 */
function createUpdateChainVoid() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where });
  return { set, where };
}

function createListDefinitionsQuery(
  overrides: Partial<{
    page: number;
    pageSize: number;
    status: 'draft' | 'published' | 'archived';
    search: string;
    sourceKind: 'manual' | 'share_imported';
    sort: 'updatedAt' | 'createdAt' | 'name';
    order: 'asc' | 'desc';
  }> = {},
): ListWorkflowDefinitionsQueryDto {
  return Object.assign(new ListWorkflowDefinitionsQueryDto(), overrides);
}

describe('WorkflowVersionService', () => {
  let service: WorkflowVersionService;
  let db: Record<string, ReturnType<typeof vi.fn>>;
  let redis: Record<string, ReturnType<typeof vi.fn>>;
  let templateService: Record<string, ReturnType<typeof vi.fn>>;
  let shareService: Record<string, ReturnType<typeof vi.fn>>;
  let resourceSourceService: {
    buildShareImportedExistsCondition: ReturnType<typeof vi.fn>;
    mapCurrentKinds: ReturnType<typeof vi.fn>;
    recordImportedResources: ReturnType<typeof vi.fn>;
  };
  let organizationAutonomyPolicyService: {
    inspectWorkflowNodesAgainstPolicy: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});

    db = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      execute: vi.fn().mockResolvedValue(undefined),
      transaction: vi.fn(async (callback: (tx: typeof db) => unknown) =>
        callback(db),
      ),
    };

    redis = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      delByPattern: vi.fn(),
    };

    templateService = {
      findBySlug: vi.fn(),
    };

    shareService = {
      getShareByToken: vi.fn(),
      incrementCopyCount: vi.fn(),
    };

    resourceSourceService = {
      buildShareImportedExistsCondition: vi.fn(() => Symbol('share-imported')),
      mapCurrentKinds: vi.fn().mockResolvedValue(new Map()),
      recordImportedResources: vi.fn().mockResolvedValue(undefined),
    };

    organizationAutonomyPolicyService = {
      inspectWorkflowNodesAgainstPolicy: vi.fn().mockResolvedValue({
        autonomyCap: 'LLM_SUGGEST',
        violations: [],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowVersionService,
        WorkflowImportService,
        WorkflowImportSourceResolverService,
        WorkflowPublishService,
        { provide: DRIZZLE, useValue: db },
        { provide: RedisCacheService, useValue: redis },
        { provide: TemplateService, useValue: templateService },
        { provide: ShareService, useValue: shareService },
        { provide: ResourceSourceService, useValue: resourceSourceService },
        {
          provide: OrganizationAutonomyPolicyService,
          useValue: organizationAutonomyPolicyService,
        },
      ],
    }).compile();

    service = module.get(WorkflowVersionService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('findAllDefinitions', () => {
    it('应当使用默认分页返回工作流定义列表', async () => {
      const workflows = [
        createDraftWorkflow({
          name: '工作流 A',
          slug: 'workflow-a',
          description: '描述 A',
          metadata: { complexity: 'beginner' },
          updatedBy: USER_ID,
        }),
        createDraftWorkflow({
          id: '00000000-0000-0000-0000-000000000006',
          name: '工作流 B',
          slug: 'workflow-b',
          description: null,
          metadata: {},
          updatedBy: USER_ID,
          createdAt: new Date('2025-01-01T01:00:00Z'),
          updatedAt: new Date('2025-01-01T01:00:00Z'),
        }),
      ];
      const selectDefinitions = createSelectChainWithPagination(workflows);
      const selectCount = createSelectChain([{ count: 2 }]);

      db.select
        .mockReturnValueOnce(selectDefinitions)
        .mockReturnValueOnce(selectCount);

      const result = await service.findAllDefinitions(
        createListDefinitionsQuery(),
      );

      expect(selectDefinitions.where).toHaveBeenCalledWith(undefined);
      expect(selectDefinitions.limit).toHaveBeenCalledWith(20);
      expect(selectDefinitions.offset).toHaveBeenCalledWith(0);
      expect(result).toEqual({
        data: [
          {
            id: workflows[0].id,
            tenantId: TENANT_ID,
            name: '工作流 A',
            slug: 'workflow-a',
            description: '描述 A',
            icon: null,
            status: 'draft',
            version: 1,
            publishedVersionId: null,
            publishedReleaseNumber: null,
            metadata: { complexity: 'beginner' },
            createdBy: USER_ID,
            updatedBy: USER_ID,
            createdAt: NOW.toISOString(),
            updatedAt: NOW.toISOString(),
            resourceSourceKind: 'manual',
          },
          {
            id: workflows[1].id,
            tenantId: TENANT_ID,
            name: '工作流 B',
            slug: 'workflow-b',
            description: null,
            icon: null,
            status: 'draft',
            version: 1,
            publishedVersionId: null,
            publishedReleaseNumber: null,
            metadata: null,
            createdBy: USER_ID,
            updatedBy: USER_ID,
            createdAt: '2025-01-01T01:00:00.000Z',
            updatedAt: '2025-01-01T01:00:00.000Z',
            resourceSourceKind: 'manual',
          },
        ],
        meta: {
          total: 2,
          page: 1,
          pageSize: 20,
          totalPages: 1,
        },
      });
      expect(result.data[0]).not.toHaveProperty('nodes');
      expect(result.data[0]).not.toHaveProperty('edges');
      expect(result.data[0]).not.toHaveProperty('viewport');
    });

    it('应当支持自定义分页参数', async () => {
      const selectDefinitions = createSelectChainWithPagination([
        createDraftWorkflow({
          name: '第二页工作流',
          slug: 'workflow-page-2',
          updatedBy: USER_ID,
        }),
      ]);
      const selectCount = createSelectChain([{ count: 11 }]);

      db.select
        .mockReturnValueOnce(selectDefinitions)
        .mockReturnValueOnce(selectCount);

      const result = await service.findAllDefinitions(
        createListDefinitionsQuery({ page: 2, pageSize: 5 }),
      );

      expect(selectDefinitions.limit).toHaveBeenCalledWith(5);
      expect(selectDefinitions.offset).toHaveBeenCalledWith(5);
      expect(result.meta).toEqual({
        total: 11,
        page: 2,
        pageSize: 5,
        totalPages: 3,
      });
    });

    it('应当支持按状态筛选', async () => {
      const selectDefinitions = createSelectChainWithPagination([
        createDraftWorkflow({
          status: 'published',
          name: '已发布工作流',
          slug: 'published-workflow',
          updatedBy: USER_ID,
        }),
      ]);
      const selectCount = createSelectChain([{ count: 1 }]);

      db.select
        .mockReturnValueOnce(selectDefinitions)
        .mockReturnValueOnce(selectCount);

      const result = await service.findAllDefinitions(
        createListDefinitionsQuery({ status: 'published' }),
      );

      const whereClause = selectDefinitions.where.mock.calls[0]?.[0];
      expect(whereClause).toBeDefined();
      expect(selectCount.where).toHaveBeenCalledWith(whereClause);
      expect(result.data[0]?.status).toBe('published');
    });

    it('应当支持按来源筛选并返回来源分类', async () => {
      const selectDefinitions = createSelectChainWithPagination([
        createDraftWorkflow({
          name: '分享导入工作流',
          slug: 'shared-workflow',
          updatedBy: USER_ID,
        }),
      ]);
      const selectCount = createSelectChain([{ count: 1 }]);

      db.select
        .mockReturnValueOnce(selectDefinitions)
        .mockReturnValueOnce(selectCount);
      resourceSourceService.mapCurrentKinds.mockResolvedValueOnce(
        new Map([[WORKFLOW_ID, 'share_imported']]),
      );

      const result = await service.findAllDefinitions(
        createListDefinitionsQuery({ sourceKind: 'share_imported' }),
      );

      expect(
        resourceSourceService.buildShareImportedExistsCondition,
      ).toHaveBeenCalledWith({
        resourceType: 'workflow_definition',
        resourceIdColumn: expect.anything(),
      });
      expect(result.data[0]?.resourceSourceKind).toBe('share_imported');
    });

    it('应当支持手工来源与升序排序并在计数行缺失时回退为零', async () => {
      const selectDefinitions = createSelectChainWithPagination([]);
      const selectCount = createSelectChain([]);

      db.select
        .mockReturnValueOnce(selectDefinitions)
        .mockReturnValueOnce(selectCount);

      const result = await service.findAllDefinitions(
        createListDefinitionsQuery({
          sourceKind: 'manual',
          sort: 'name',
          order: 'asc',
        }),
      );

      expect(selectDefinitions.orderBy).toHaveBeenCalledOnce();
      expect(result).toEqual({
        data: [],
        meta: {
          total: 0,
          page: 1,
          pageSize: 20,
          totalPages: 0,
        },
      });
    });

    it('应当支持按搜索词筛选', async () => {
      const selectDefinitions = createSelectChainWithPagination([
        createDraftWorkflow({
          name: '审批工作流',
          slug: 'approval-workflow',
          description: '审批节点流程',
          updatedBy: USER_ID,
        }),
      ]);
      const selectCount = createSelectChain([{ count: 1 }]);

      db.select
        .mockReturnValueOnce(selectDefinitions)
        .mockReturnValueOnce(selectCount);

      const result = await service.findAllDefinitions(
        createListDefinitionsQuery({ search: '审批' }),
      );

      const whereClause = selectDefinitions.where.mock.calls[0]?.[0];
      expect(whereClause).toBeDefined();
      expect(selectCount.where).toHaveBeenCalledWith(whereClause);
      expect(result.data[0]?.name).toBe('审批工作流');
    });

    it('应当支持组合筛选条件', async () => {
      const selectDefinitions = createSelectChainWithPagination([
        createDraftWorkflow({
          status: 'archived',
          name: '归档审批流',
          slug: 'archived-approval-workflow',
          description: '已归档的审批工作流',
          updatedBy: USER_ID,
        }),
      ]);
      const selectCount = createSelectChain([{ count: 1 }]);

      db.select
        .mockReturnValueOnce(selectDefinitions)
        .mockReturnValueOnce(selectCount);

      const result = await service.findAllDefinitions(
        createListDefinitionsQuery({
          status: 'archived',
          search: '审批',
        }),
      );

      const whereClause = selectDefinitions.where.mock.calls[0]?.[0];
      expect(whereClause).toBeDefined();
      expect(selectCount.where).toHaveBeenCalledWith(whereClause);
      expect(result.meta.total).toBe(1);
      expect(result.data[0]?.status).toBe('archived');
    });

    it('应当在无结果时返回空列表', async () => {
      const selectDefinitions = createSelectChainWithPagination([]);
      const selectCount = createSelectChain([{ count: 0 }]);

      db.select
        .mockReturnValueOnce(selectDefinitions)
        .mockReturnValueOnce(selectCount);

      const result = await service.findAllDefinitions(
        createListDefinitionsQuery({ search: '不存在' }),
      );

      expect(result).toEqual({
        data: [],
        meta: {
          total: 0,
          page: 1,
          pageSize: 20,
          totalPages: 0,
        },
      });
    });
  });

  describe('findDefinitionById', () => {
    it('应当返回序列化后的工作流定义详情', async () => {
      const workflow = createDraftWorkflow({
        description: '详情描述',
        metadata: { category: 'analysis' },
        updatedBy: USER_ID,
        createdAt: new Date('2025-02-01T08:00:00Z'),
        updatedAt: new Date('2025-02-02T09:30:00Z'),
      });
      const selectWorkflow = createSelectChain([workflow]);
      db.select.mockReturnValueOnce(selectWorkflow);

      const result = await service.findDefinitionById(WORKFLOW_ID);

      expect(result).toEqual({
        id: WORKFLOW_ID,
        tenantId: TENANT_ID,
        name: '测试工作流',
        slug: 'test-workflow',
        description: '详情描述',
        icon: null,
        status: 'draft',
        version: 1,
        publishedVersionId: null,
        publishedReleaseNumber: null,
        metadata: { category: 'analysis' },
        createdBy: USER_ID,
        updatedBy: USER_ID,
        createdAt: '2025-02-01T08:00:00.000Z',
        updatedAt: '2025-02-02T09:30:00.000Z',
        resourceSourceKind: 'manual',
      });
      expect(result).not.toHaveProperty('nodes');
      expect(result).not.toHaveProperty('edges');
      expect(result).not.toHaveProperty('viewport');
    });

    it('工作流不存在时应当抛出 WorkflowNotFoundException', async () => {
      db.select.mockReturnValueOnce(createSelectChain([]));

      await expect(
        service.findDefinitionById(WORKFLOW_ID),
      ).rejects.toBeInstanceOf(WorkflowNotFoundException);
    });
  });

  describe('findDefinitionDetailById', () => {
    it('应当返回包含画布大字段的完整工作流定义', async () => {
      const workflow = createDraftWorkflow({
        description: '详情描述',
        metadata: { category: 'analysis' },
        inputSchema: MOCK_INPUT_SCHEMA,
        updatedBy: USER_ID,
        createdAt: new Date('2025-02-01T08:00:00Z'),
        updatedAt: new Date('2025-02-02T09:30:00Z'),
      });
      const selectWorkflow = createSelectChain([workflow]);
      db.select.mockReturnValueOnce(selectWorkflow);

      const result = await service.findDefinitionDetailById(WORKFLOW_ID);

      expect(result).toEqual(
        expect.objectContaining({
          id: WORKFLOW_ID,
          tenantId: TENANT_ID,
          name: '测试工作流',
          slug: 'test-workflow',
          description: '详情描述',
          icon: null,
          status: 'draft',
          version: 1,
          publishedVersionId: null,
          publishedReleaseNumber: null,
          edges: MOCK_EDGES,
          viewport: MOCK_VIEWPORT,
          inputSchema: MOCK_INPUT_SCHEMA,
          metadata: { category: 'analysis' },
          createdBy: USER_ID,
          updatedBy: USER_ID,
          createdAt: '2025-02-01T08:00:00.000Z',
          updatedAt: '2025-02-02T09:30:00.000Z',
          resourceSourceKind: 'manual',
        }),
      );
      expect(result.nodes).toEqual([
        expect.objectContaining({
          id: 'node-1',
          type: 'test',
          position: { x: 0, y: 0 },
          data: {
            inputPorts: [],
            outputPorts: [],
          },
        }),
      ]);
      expect(result).toHaveProperty('nodes');
      expect(result).toHaveProperty('edges');
      expect(result).toHaveProperty('viewport');
    });

    it('应当归一化 legacy workflow graph 后再返回详情', async () => {
      const legacyWorkflow = createDraftWorkflow({
        nodes: [
          {
            id: 'trigger-a',
            type: 'workflow-node',
            position: { x: 0, y: 0 },
            data: {
              label: 'Manual Trigger',
              node_type: 'manual-trigger',
              input_ports: [],
              output_ports: [{ id: 'payload-out' }],
            },
          },
          {
            id: 'output-a',
            type: 'workflow-node',
            position: { x: 240, y: 0 },
            data: {
              label: 'Text Output',
              node_type: 'text-output',
              input_ports: [{ id: 'content-in' }],
              output_ports: [],
            },
          },
        ],
        edges: [
          {
            id: 'edge-1',
            source: 'trigger-a',
            target: 'output-a',
            source_handle: 'payload',
            target_handle: 'content',
          },
        ],
      });
      db.select.mockReturnValueOnce(createSelectChain([legacyWorkflow]));

      const result = await service.findDefinitionDetailById(WORKFLOW_ID);

      expect(result.nodes).toEqual([
        expect.objectContaining({
          id: 'trigger-a',
          type: 'trigger',
          data: expect.objectContaining({
            nodeType: 'manual-trigger',
            category: 'trigger',
          }),
        }),
        expect.objectContaining({
          id: 'output-a',
          type: 'output',
          data: expect.objectContaining({
            nodeType: 'text-output',
            category: 'output',
          }),
        }),
      ]);
      expect(result.edges).toEqual([
        expect.objectContaining({
          id: 'edge-1',
          sourceHandle: 'payload-out',
          targetHandle: 'content-in',
        }),
      ]);
    });

    it('工作流不存在时应当抛出 WorkflowNotFoundException', async () => {
      db.select.mockReturnValueOnce(createSelectChain([]));

      await expect(
        service.findDefinitionDetailById(WORKFLOW_ID),
      ).rejects.toBeInstanceOf(WorkflowNotFoundException);
    });
  });

  describe('getInputSchema', () => {
    it('应返回工作流的输入 schema', async () => {
      db.select.mockReturnValueOnce(
        createSelectChain([
          createDraftWorkflow({
            status: 'published',
            inputSchema: MOCK_INPUT_SCHEMA,
          }),
        ]),
      );

      const result = await service.getInputSchema(WORKFLOW_ID, TENANT_ID);

      expect(result).toEqual(MOCK_INPUT_SCHEMA);
    });

    it('inputSchema 为空时应返回默认 schema', async () => {
      db.select.mockReturnValueOnce(
        createSelectChain([
          createDraftWorkflow({
            status: 'published',
            inputSchema: null,
          }),
        ]),
      );

      const result = await service.getInputSchema(WORKFLOW_ID, TENANT_ID);

      expect(result).toEqual({
        version: 1,
        collectionMode: 'form',
        fields: [],
      });
    });

    it('工作流不存在时应抛出 WorkflowNotFoundException', async () => {
      db.select.mockReturnValueOnce(createSelectChain([]));

      await expect(
        service.getInputSchema(WORKFLOW_ID, TENANT_ID),
      ).rejects.toThrow(WorkflowNotFoundException);
    });

    it('工作流未发布时应抛出 WorkflowNotPublishedException', async () => {
      db.select.mockReturnValueOnce(createSelectChain([createDraftWorkflow()]));

      await expect(
        service.getInputSchema(WORKFLOW_ID, TENANT_ID),
      ).rejects.toThrow(WorkflowNotPublishedException);
    });
  });

  describe('exportWorkflow', () => {
    it('草稿画布字段为空时应导出默认画布与空输入 schema', async () => {
      db.select.mockReturnValueOnce(
        createSelectChain([
          createDraftWorkflow({
            nodes: null,
            edges: null,
            viewport: null,
            inputSchema: null,
          }),
        ]),
      );

      const result = await service.exportWorkflow(TENANT_ID, WORKFLOW_ID);

      expect(result).toEqual({
        schema_version: WORKFLOW_EXPORT_VERSION,
        exported_at: NOW.toISOString(),
        workflow: {
          name: '测试工作流',
          description: null,
          definition: {
            nodes: [],
            edges: [],
            viewport: { x: 0, y: 0, zoom: 1 },
          },
          input_schema: null,
        },
      });
    });

    it('已发布定义应优先导出发布快照的画布与输入 schema', async () => {
      const publishedNodes = [
        {
          id: 'published-node',
          type: 'test',
          position: { x: 12, y: 24 },
          data: { label: 'Published' },
        },
      ];
      const publishedViewport = { x: 10, y: 20, zoom: 0.75 };

      db.select
        .mockReturnValueOnce(
          createSelectChain([
            createDraftWorkflow({
              status: 'published',
              publishedVersionId: VERSION_ID,
              nodes: MOCK_NODES,
              edges: MOCK_EDGES,
              viewport: MOCK_VIEWPORT,
              inputSchema: null,
            }),
          ]),
        )
        .mockReturnValueOnce(
          createSelectChain([
            {
              snapshot: {
                nodes: publishedNodes,
                edges: [],
                viewport: publishedViewport,
                inputSchema: MOCK_INPUT_SCHEMA,
                metadata: {},
              },
            },
          ]),
        );

      const result = await service.exportWorkflow(TENANT_ID, WORKFLOW_ID);

      expect(result.workflow.definition.nodes).toEqual([
        expect.objectContaining({ id: 'published-node' }),
      ]);
      expect(result.workflow.definition.edges).toEqual([]);
      expect(result.workflow.definition.viewport).toEqual(publishedViewport);
      expect(result.workflow.input_schema).toEqual(MOCK_INPUT_SCHEMA);
    });

    it('发布快照缺少画布字段时应使用画布默认值并保留定义输入 schema', async () => {
      db.select
        .mockReturnValueOnce(
          createSelectChain([
            createDraftWorkflow({
              status: 'published',
              publishedVersionId: VERSION_ID,
              nodes: MOCK_NODES,
              edges: [],
              viewport: MOCK_VIEWPORT,
              inputSchema: MOCK_INPUT_SCHEMA,
            }),
          ]),
        )
        .mockReturnValueOnce(
          createSelectChain([
            {
              snapshot: {
                nodes: null,
                edges: null,
                viewport: null,
                inputSchema: null,
                metadata: {},
              },
            },
          ]),
        );

      const result = await service.exportWorkflow(TENANT_ID, WORKFLOW_ID);

      expect(result.workflow.definition).toEqual({
        nodes: [],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      });
      expect(result.workflow.input_schema).toEqual(MOCK_INPUT_SCHEMA);
    });

    it('发布版本记录缺失时应回退导出定义当前画布', async () => {
      const currentNodes = [
        {
          id: 'current-node',
          type: 'test',
          position: { x: 1, y: 2 },
          data: {},
        },
      ];

      db.select
        .mockReturnValueOnce(
          createSelectChain([
            createDraftWorkflow({
              status: 'published',
              publishedVersionId: VERSION_ID,
              nodes: currentNodes,
              edges: [],
              viewport: MOCK_VIEWPORT,
              inputSchema: MOCK_INPUT_SCHEMA,
            }),
          ]),
        )
        .mockReturnValueOnce(createSelectChain([]));

      const result = await service.exportWorkflow(TENANT_ID, WORKFLOW_ID);

      expect(result.workflow.definition.nodes).toEqual([
        expect.objectContaining({ id: 'current-node' }),
      ]);
      expect(result.workflow.definition.viewport).toEqual(MOCK_VIEWPORT);
      expect(result.workflow.input_schema).toEqual(MOCK_INPUT_SCHEMA);
    });

    it('定义不存在时应抛出 WorkflowNotFoundException', async () => {
      db.select.mockReturnValueOnce(createSelectChain([]));

      await expect(
        service.exportWorkflow(TENANT_ID, WORKFLOW_ID),
      ).rejects.toBeInstanceOf(WorkflowNotFoundException);
    });
  });

  describe('updateDefinition', () => {
    it('应当更新工作流并返回含递增 version 的完整记录', async () => {
      const workflow = createDraftWorkflow({ version: 3 });
      const updatedWorkflow = createDraftWorkflow({
        version: 4,
        name: '更新后的名称',
        updatedBy: USER_ID,
        updatedAt: NOW,
      });

      const selectWf = createSelectChain([workflow]);
      db.select.mockReturnValueOnce(selectWf);

      const updateChain = createUpdateChain([updatedWorkflow]);
      db.update.mockReturnValueOnce(updateChain);

      const result = await service.updateDefinition(WORKFLOW_ID, USER_ID, {
        version: 3,
        name: '更新后的名称',
      });

      expect(result).toEqual(
        expect.objectContaining({
          id: WORKFLOW_ID,
          tenantId: TENANT_ID,
          name: '更新后的名称',
          slug: 'test-workflow',
          description: null,
          icon: null,
          status: 'draft',
          version: 4,
          publishedVersionId: null,
          publishedReleaseNumber: null,
          edges: MOCK_EDGES,
          viewport: MOCK_VIEWPORT,
          inputSchema: null,
          metadata: null,
          createdBy: USER_ID,
          updatedBy: USER_ID,
          createdAt: NOW.toISOString(),
          updatedAt: NOW.toISOString(),
          resourceSourceKind: 'manual',
        }),
      );
      expect(result.nodes).toEqual([
        expect.objectContaining({
          id: 'node-1',
          data: {
            inputPorts: [],
            outputPorts: [],
          },
        }),
      ]);
      expect(result).toHaveProperty('nodes');
      expect(result).toHaveProperty('edges');
      expect(result).toHaveProperty('viewport');
      expect(db.transaction).toHaveBeenCalledOnce();
      expect(db.execute).toHaveBeenCalledOnce();
    });

    it('应当仅更新提供的字段（部分更新）', async () => {
      const workflow = createDraftWorkflow({ version: 2 });
      const updatedWorkflow = createDraftWorkflow({
        version: 3,
        description: '新描述',
        updatedBy: USER_ID,
      });

      db.select.mockReturnValueOnce(createSelectChain([workflow]));
      db.update.mockReturnValueOnce(createUpdateChain([updatedWorkflow]));

      const result = await service.updateDefinition(WORKFLOW_ID, USER_ID, {
        version: 2,
        description: '新描述',
      });

      expect(result.description).toBe('新描述');
      expect(result.version).toBe(3);
    });

    it('应当支持画布数据更新（nodes/edges/viewport）', async () => {
      const newNodes = [
        {
          id: 'new-node',
          type: 'agent',
          position: { x: 100, y: 100 },
          data: {},
        },
      ];
      const newEdges = [{ id: 'new-edge', source: 'new-node', target: 'n2' }];
      const newViewport = { x: 50, y: 50, zoom: 1.5 };

      const workflow = createDraftWorkflow({ version: 1 });
      const updatedWorkflow = createDraftWorkflow({
        version: 2,
        nodes: newNodes,
        edges: newEdges,
        viewport: newViewport,
        updatedBy: USER_ID,
      });

      db.select.mockReturnValueOnce(createSelectChain([workflow]));
      db.update.mockReturnValueOnce(createUpdateChain([updatedWorkflow]));

      const result = await service.updateDefinition(WORKFLOW_ID, USER_ID, {
        version: 1,
        nodes: newNodes,
        edges: newEdges,
        viewport: newViewport,
      });

      expect(result.nodes).toEqual([
        expect.objectContaining({
          id: 'new-node',
          type: 'agent',
          position: { x: 100, y: 100 },
          data: expect.objectContaining({
            nodeType: 'agent',
            category: 'agent',
            inputPorts: expect.arrayContaining([
              expect.objectContaining({ id: 'exec-in', dataType: 'exec' }),
              expect.objectContaining({ id: 'text-in', dataType: 'text' }),
            ]),
            outputPorts: expect.arrayContaining([
              expect.objectContaining({ id: 'exec-out', dataType: 'exec' }),
              expect.objectContaining({ id: 'agent-out', dataType: 'text' }),
            ]),
          }),
        }),
      ]);
      expect(result.edges).toEqual(newEdges);
      expect(result.viewport).toEqual(newViewport);
      expect(result.version).toBe(2);
    });

    it('应在更新画布时归一化 legacy workflow graph 后再持久化', async () => {
      const workflow = createDraftWorkflow({ version: 1 });
      const updatedWorkflow = createDraftWorkflow({
        version: 2,
        nodes: [
          {
            id: 'trigger-a',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: {
              label: 'Manual Trigger',
              nodeType: 'manual-trigger',
              category: 'trigger',
              inputPorts: [],
              outputPorts: [{ id: 'payload-out' }],
            },
          },
          {
            id: 'output-a',
            type: 'output',
            position: { x: 240, y: 0 },
            data: {
              label: 'Text Output',
              nodeType: 'text-output',
              category: 'output',
              inputPorts: [{ id: 'content-in' }],
              outputPorts: [],
            },
          },
        ],
        edges: [
          {
            id: 'edge-1',
            source: 'trigger-a',
            target: 'output-a',
            sourceHandle: 'payload-out',
            targetHandle: 'content-in',
          },
        ],
        updatedBy: USER_ID,
      });

      db.select.mockReturnValueOnce(createSelectChain([workflow]));
      db.update.mockReturnValueOnce(createUpdateChain([updatedWorkflow]));

      await service.updateDefinition(WORKFLOW_ID, USER_ID, {
        version: 1,
        nodes: [
          {
            id: 'trigger-a',
            type: 'workflow-node',
            position: { x: 0, y: 0 },
            data: {
              label: 'Manual Trigger',
              node_type: 'manual-trigger',
              input_ports: [],
              output_ports: [{ id: 'payload-out' }],
            },
          },
          {
            id: 'output-a',
            type: 'workflow-node',
            position: { x: 240, y: 0 },
            data: {
              label: 'Text Output',
              node_type: 'text-output',
              input_ports: [{ id: 'content-in' }],
              output_ports: [],
            },
          },
        ] as never,
        edges: [
          {
            id: 'edge-1',
            source: 'trigger-a',
            target: 'output-a',
            source_handle: 'payload',
            target_handle: 'content',
          },
        ] as never,
      });

      const updateSetClause =
        db.update.mock.results[0].value.set.mock.calls[0][0];
      expect(updateSetClause.nodes).toEqual([
        expect.objectContaining({
          id: 'trigger-a',
          data: expect.objectContaining({
            outputPorts: expect.arrayContaining([
              expect.objectContaining({
                id: 'exec-out',
                dataType: 'exec',
              }),
              expect.objectContaining({
                id: 'payload-out',
                dataType: 'json',
              }),
            ]),
          }),
        }),
        expect.objectContaining({
          id: 'output-a',
          data: expect.objectContaining({
            inputPorts: expect.arrayContaining([
              expect.objectContaining({
                id: 'exec-in',
                dataType: 'exec',
              }),
              expect.objectContaining({
                id: 'content-in',
                dataType: 'text',
              }),
            ]),
          }),
        }),
      ]);
      expect(updateSetClause.edges).toEqual(updatedWorkflow.edges);
    });

    it('应当在 detail PATCH 时持久化 inputSchema 并返回最新 schema', async () => {
      const workflow = createDraftWorkflow({
        version: 4,
        inputSchema: MOCK_INPUT_SCHEMA,
      });
      const updatedWorkflow = createDraftWorkflow({
        version: 5,
        inputSchema: {
          ...CONDITIONAL_INPUT_SCHEMA,
          version: 2,
        },
        updatedBy: USER_ID,
        updatedAt: NOW,
      });

      db.select.mockReturnValueOnce(createSelectChain([workflow]));
      db.update.mockReturnValueOnce(createUpdateChain([updatedWorkflow]));

      const result = await service.updateDefinition(WORKFLOW_ID, USER_ID, {
        version: 4,
        inputSchema: CONDITIONAL_INPUT_SCHEMA,
      });

      expect(result.inputSchema).toEqual({
        ...CONDITIONAL_INPUT_SCHEMA,
        version: 2,
      });
      expect(
        db.update.mock.results[0].value.set.mock.calls[0][0].inputSchema,
      ).toEqual({
        ...CONDITIONAL_INPUT_SCHEMA,
        version: 2,
      });
    });

    it('OCC 更新首次设置默认输入 schema 时应从默认版本开始且不虚增 schema 版本', async () => {
      const defaultInputSchema = {
        version: 1,
        collectionMode: 'form' as const,
        fields: [],
      };
      const workflow = createDraftWorkflow({
        version: 7,
        inputSchema: null,
      });
      const updatedWorkflow = createDraftWorkflow({
        version: 8,
        inputSchema: defaultInputSchema,
        updatedBy: USER_ID,
      });

      db.select.mockReturnValueOnce(createSelectChain([workflow]));
      db.update.mockReturnValueOnce(createUpdateChain([updatedWorkflow]));

      const result = await service.updateDefinition(WORKFLOW_ID, USER_ID, {
        version: 7,
        inputSchema: defaultInputSchema,
      });

      expect(
        db.update.mock.results[0].value.set.mock.calls[0][0].inputSchema,
      ).toEqual(defaultInputSchema);
      expect(result.inputSchema).toEqual(defaultInputSchema);
      expect(result.version).toBe(8);
    });

    it('非 schema 更新时不应变更现有 inputSchema.version', async () => {
      const workflow = createDraftWorkflow({
        version: 2,
        inputSchema: {
          ...MOCK_INPUT_SCHEMA,
          version: 3,
        },
      });
      const updatedWorkflow = createDraftWorkflow({
        version: 3,
        description: '仅更新描述',
        inputSchema: {
          ...MOCK_INPUT_SCHEMA,
          version: 3,
        },
        updatedBy: USER_ID,
      });

      db.select.mockReturnValueOnce(createSelectChain([workflow]));
      db.update.mockReturnValueOnce(createUpdateChain([updatedWorkflow]));

      const result = await service.updateDefinition(WORKFLOW_ID, USER_ID, {
        version: 2,
        description: '仅更新描述',
      });

      expect(result.version).toBe(3);
      expect(result.inputSchema).toEqual({
        ...MOCK_INPUT_SCHEMA,
        version: 3,
      });
      expect(
        db.update.mock.results[0].value.set.mock.calls[0][0],
      ).not.toHaveProperty('inputSchema');
    });

    it('工作流已归档时应当抛出 WorkflowArchivedException', async () => {
      db.select.mockReturnValueOnce(
        createSelectChain([createDraftWorkflow({ status: 'archived' })]),
      );

      await expect(
        service.updateDefinition(WORKFLOW_ID, USER_ID, { version: 1 }),
      ).rejects.toBeInstanceOf(WorkflowArchivedException);

      expect(db.update).not.toHaveBeenCalled();
    });

    it('工作流不存在时应当抛出 WorkflowNotFoundException', async () => {
      db.select.mockReturnValueOnce(createSelectChain([]));

      await expect(
        service.updateDefinition(WORKFLOW_ID, USER_ID, { version: 1 }),
      ).rejects.toBeInstanceOf(WorkflowNotFoundException);

      expect(db.update).not.toHaveBeenCalled();
    });

    it('版本冲突时应当抛出 WorkflowVersionConflictException', async () => {
      const workflow = createDraftWorkflow({ version: 5 });

      db.select.mockReturnValueOnce(createSelectChain([workflow]));
      db.update.mockReturnValueOnce(createUpdateChain([]));

      await expect(
        service.updateDefinition(WORKFLOW_ID, USER_ID, { version: 3 }),
      ).rejects.toBeInstanceOf(WorkflowVersionConflictException);
    });

    it('应当在事务内获取工作流级写锁', async () => {
      const workflow = createDraftWorkflow({ version: 1 });
      const updatedWorkflow = createDraftWorkflow({
        version: 2,
        updatedBy: USER_ID,
      });

      db.select.mockReturnValueOnce(createSelectChain([workflow]));
      db.update.mockReturnValueOnce(createUpdateChain([updatedWorkflow]));

      await service.updateDefinition(WORKFLOW_ID, USER_ID, {
        version: 1,
        name: '锁测试',
      });

      expect(db.transaction).toHaveBeenCalledOnce();
      expect(db.execute).toHaveBeenCalledOnce();
    });
  });

  describe('createVersion', () => {
    it('应当创建版本快照并返回 DTO', async () => {
      // findWorkflowOrThrow
      const selectWf = createSelectChain([createDraftWorkflow()]);
      // maxVersion
      const selectMax = createSelectChain([{ maxVersion: 2 }]);
      db.select.mockReturnValueOnce(selectWf).mockReturnValueOnce(selectMax);

      const insertChain = createInsertChain([
        createMockVersion({ versionNumber: 3 }),
      ]);
      db.insert.mockReturnValueOnce(insertChain);

      const result = await service.createVersion(
        WORKFLOW_ID,
        { label: '标签' },
        USER_ID,
      );

      expect(result.versionNumber).toBe(3);
      expect(result.workflowDefinitionId).toBe(WORKFLOW_ID);
      expect(db.insert).toHaveBeenCalledOnce();
      expect(db.execute).toHaveBeenCalledOnce();
      expect(db.transaction).toHaveBeenCalledOnce();
    });

    it('应当在无历史版本时从 1 开始编号', async () => {
      const selectWf = createSelectChain([createDraftWorkflow()]);
      const selectMax = createSelectChain([{ maxVersion: null }]);
      db.select.mockReturnValueOnce(selectWf).mockReturnValueOnce(selectMax);

      const version = createMockVersion({ versionNumber: 1 });
      const insertChain = createInsertChain([version]);
      db.insert.mockReturnValueOnce(insertChain);

      const result = await service.createVersion(WORKFLOW_ID, {}, USER_ID);

      expect(result.versionNumber).toBe(1);
    });

    it('工作流已归档时应当抛出 WorkflowArchivedException', async () => {
      const selectWf = createSelectChain([
        createDraftWorkflow({ status: 'archived' }),
      ]);
      db.select.mockReturnValueOnce(selectWf);

      await expect(
        service.createVersion(WORKFLOW_ID, {}, USER_ID),
      ).rejects.toBeInstanceOf(WorkflowArchivedException);

      expect(db.insert).not.toHaveBeenCalled();
    });

    it('工作流不存在时应当抛出 WorkflowNotFoundException', async () => {
      const selectWf = createSelectChain([]);
      db.select.mockReturnValueOnce(selectWf);

      await expect(
        service.createVersion(WORKFLOW_ID, {}, USER_ID),
      ).rejects.toBeInstanceOf(WorkflowNotFoundException);
    });
  });

  describe('listVersions', () => {
    it('应当返回分页版本列表', async () => {
      // findWorkflowOrThrow
      const selectWf = createSelectChain([createDraftWorkflow()]);
      // versions (paginated)
      const selectVersions = createSelectChainWithPagination([
        createMockVersion({ versionNumber: 2 }),
        createMockVersion({ id: VERSION_ID_2, versionNumber: 1 }),
      ]);
      // count
      const selectCount = createSelectChain([{ count: 2 }]);

      db.select
        .mockReturnValueOnce(selectWf)
        .mockReturnValueOnce(selectVersions)
        .mockReturnValueOnce(selectCount);

      const result = await service.listVersions(WORKFLOW_ID, {
        page: 1,
        pageSize: 10,
      });

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(result.meta.page).toBe(1);
      expect(result.meta.pageSize).toBe(10);
      expect(result.meta.totalPages).toBe(1);
    });

    it('应当使用默认分页参数', async () => {
      const selectWf = createSelectChain([createDraftWorkflow()]);
      const selectVersions = createSelectChainWithPagination([]);
      const selectCount = createSelectChain([{ count: 0 }]);

      db.select
        .mockReturnValueOnce(selectWf)
        .mockReturnValueOnce(selectVersions)
        .mockReturnValueOnce(selectCount);

      const result = await service.listVersions(WORKFLOW_ID, {
        page: 1,
        pageSize: 20,
      });

      expect(result.meta.page).toBe(1);
      expect(result.meta.pageSize).toBe(20);
      expect(result.meta.totalPages).toBe(0);
      expect(result.data).toHaveLength(0);
    });

    it('工作流不存在时应当抛出异常', async () => {
      const selectWf = createSelectChain([]);
      db.select.mockReturnValueOnce(selectWf);

      await expect(
        service.listVersions(WORKFLOW_ID, { page: 1, pageSize: 20 }),
      ).rejects.toBeInstanceOf(WorkflowNotFoundException);
    });

    it('应当在版本列表响应中补齐 snapshot 端口定义，避免历史记录页面读取 schema.kind 崩溃', async () => {
      const selectWf = createSelectChain([createDraftWorkflow()]);
      const selectVersions = createSelectChainWithPagination([
        createMockVersion({
          snapshot: {
            ...MOCK_SNAPSHOT,
            nodes: [
              {
                id: 'manual-trigger',
                type: 'workflow-node',
                position: { x: 0, y: 0 },
                data: {
                  label: 'Manual Trigger',
                  node_type: 'manual-trigger',
                  input_ports: [],
                  output_ports: [{ id: 'exec-out' }, { id: 'task' }],
                },
              },
            ],
            edges: [],
          },
        }),
      ]);
      const selectCount = createSelectChain([{ count: 1 }]);

      db.select
        .mockReturnValueOnce(selectWf)
        .mockReturnValueOnce(selectVersions)
        .mockReturnValueOnce(selectCount);

      const result = await service.listVersions(WORKFLOW_ID, {
        page: 1,
        pageSize: 20,
      });

      const ports = result.data[0]?.snapshot.nodes[0]?.data?.outputPorts;
      expect(ports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'exec-out',
            dataType: 'exec',
            schema: expect.objectContaining({ kind: 'exec' }),
          }),
          expect.objectContaining({
            id: 'task',
            dataType: 'json',
            schema: expect.objectContaining({ kind: 'json' }),
          }),
        ]),
      );
    });
  });

  describe('rollback', () => {
    it('应当回滚工作流到指定版本', async () => {
      const selectWf = createSelectChain([createDraftWorkflow()]);
      const selectVersion = createSelectChain([createMockVersion()]);
      db.select
        .mockReturnValueOnce(selectWf)
        .mockReturnValueOnce(selectVersion);

      const updateChain = createUpdateChainVoid();
      db.update.mockReturnValueOnce(updateChain);

      const result = await service.rollback(WORKFLOW_ID, VERSION_ID, USER_ID);

      expect(result.id).toBe(VERSION_ID);
      expect(db.update).toHaveBeenCalledOnce();
    });

    it('工作流已归档时应当抛出 WorkflowArchivedException', async () => {
      const selectWf = createSelectChain([
        createDraftWorkflow({ status: 'archived' }),
      ]);
      db.select.mockReturnValueOnce(selectWf);

      await expect(
        service.rollback(WORKFLOW_ID, VERSION_ID, USER_ID),
      ).rejects.toBeInstanceOf(WorkflowArchivedException);

      expect(db.update).not.toHaveBeenCalled();
    });

    it('版本不存在时应当抛出 WorkflowVersionNotFoundException', async () => {
      const selectWf = createSelectChain([createDraftWorkflow()]);
      const selectVersion = createSelectChain([]);
      db.select
        .mockReturnValueOnce(selectWf)
        .mockReturnValueOnce(selectVersion);

      await expect(
        service.rollback(WORKFLOW_ID, VERSION_ID, USER_ID),
      ).rejects.toBeInstanceOf(WorkflowVersionNotFoundException);
    });
  });

  describe('publish', () => {
    it('应当从当前快照创建新版本并发布', async () => {
      const selectWf = createSelectChain([createDraftWorkflow()]);
      const selectReleases = createSelectChain([]);
      const selectMax = createSelectChain([{ maxVersion: 1 }]);
      db.select
        .mockReturnValueOnce(selectWf)
        .mockReturnValueOnce(selectReleases)
        .mockReturnValueOnce(selectMax);

      const publishedVersion = createMockVersion({
        versionNumber: 2,
        publishedAt: NOW,
      });
      const insertChain = createInsertChain([publishedVersion]);
      db.insert.mockReturnValueOnce(insertChain);

      db.update
        .mockReturnValueOnce(createUpdateChainVoid())
        .mockReturnValueOnce(createUpdateChainVoid());

      redis.del.mockResolvedValueOnce(undefined);

      const result = await service.publish(
        WORKFLOW_ID,
        { label: '发布版本' },
        USER_ID,
      );

      expect(result.data.versionNumber).toBe(2);
      expect(result.data.publishedAt).toBe(NOW.toISOString());
      expect(result.warnings).toEqual([]);
      expect(db.insert).toHaveBeenCalledOnce();
      expect(db.update).toHaveBeenCalledTimes(2);
      expect(redis.del).toHaveBeenCalledOnce();
      expect(db.execute).toHaveBeenCalledOnce();
    });

    it('应当发布指定的已有版本', async () => {
      const selectWf = createSelectChain([createDraftWorkflow()]);
      const selectReleases = createSelectChain([]);
      const selectVersion = createSelectChain([createMockVersion()]);
      db.select
        .mockReturnValueOnce(selectWf)
        .mockReturnValueOnce(selectReleases)
        .mockReturnValueOnce(selectVersion);

      const updatedVersion = createMockVersion({ publishedAt: NOW });
      db.update
        .mockReturnValueOnce(createUpdateChainVoid())
        .mockReturnValueOnce(createUpdateChain([updatedVersion]))
        .mockReturnValueOnce(createUpdateChainVoid());

      redis.del.mockResolvedValueOnce(undefined);

      const result = await service.publish(
        WORKFLOW_ID,
        { versionId: VERSION_ID },
        USER_ID,
      );

      expect(result.data.id).toBe(VERSION_ID);
      expect(result.data.publishedAt).toBe(NOW.toISOString());
      expect(result.warnings).toEqual([]);
      expect(db.insert).not.toHaveBeenCalled();
      expect(db.update).toHaveBeenCalledTimes(3);
    });

    it('工作流已归档时应当抛出 WorkflowArchivedException', async () => {
      const selectWf = createSelectChain([
        createDraftWorkflow({ status: 'archived' }),
      ]);
      db.select.mockReturnValueOnce(selectWf);

      await expect(
        service.publish(WORKFLOW_ID, {}, USER_ID),
      ).rejects.toBeInstanceOf(WorkflowArchivedException);
    });

    it('已发布工作流应当允许再次发布当前快照', async () => {
      const selectWf = createSelectChain([
        createDraftWorkflow({ status: 'published' }),
      ]);
      const selectReleases = createSelectChain([]);
      const selectMax = createSelectChain([{ maxVersion: 2 }]);
      db.select
        .mockReturnValueOnce(selectWf)
        .mockReturnValueOnce(selectReleases)
        .mockReturnValueOnce(selectMax);

      const publishedVersion = createMockVersion({
        versionNumber: 3,
        publishedAt: NOW,
      });
      db.insert.mockReturnValueOnce(createInsertChain([publishedVersion]));
      db.update
        .mockReturnValueOnce(createUpdateChainVoid())
        .mockReturnValueOnce(createUpdateChainVoid());
      redis.del.mockResolvedValueOnce(undefined);

      const result = await service.publish(WORKFLOW_ID, {}, USER_ID);

      expect(result.data.versionNumber).toBe(3);
      expect(result.data.publishedAt).toBe(NOW.toISOString());
      expect(result.warnings).toEqual([]);
    });

    it('工作流无节点时应当抛出 WorkflowPublishValidationException', async () => {
      const selectWf = createSelectChain([createDraftWorkflow({ nodes: [] })]);
      db.select.mockReturnValueOnce(selectWf);

      await expect(
        service.publish(WORKFLOW_ID, {}, USER_ID),
      ).rejects.toBeInstanceOf(WorkflowPublishValidationException);
    });

    it('工作流 nodes 为 null 时应当抛出验证异常', async () => {
      const selectWf = createSelectChain([
        createDraftWorkflow({ nodes: null }),
      ]);
      db.select.mockReturnValueOnce(selectWf);

      await expect(
        service.publish(WORKFLOW_ID, {}, USER_ID),
      ).rejects.toBeInstanceOf(WorkflowPublishValidationException);
    });

    it('发布时 agent 节点未绑定已发布 Agent Definition 应阻断', async () => {
      const workflow = createDraftWorkflow({
        nodes: [
          {
            id: 'agent-unbound',
            type: 'agent',
            position: { x: 0, y: 0 },
            data: { label: '未绑定助手' },
          },
          {
            id: 'chat-agent-unbound',
            type: 'chat-agent',
            position: { x: 200, y: 0 },
            data: {},
          },
        ],
        edges: [],
      });
      db.select.mockReturnValueOnce(createSelectChain([workflow]));

      const publishPromise = service.publish(WORKFLOW_ID, {}, USER_ID);

      await expect(publishPromise).rejects.toBeInstanceOf(
        WorkflowPublishAgentBindingException,
      );
      await expect(publishPromise).rejects.toMatchObject({
        detail: expect.stringMatching(
          /未绑定助手.*agent-unbound.*chat-agent-unbound/,
        ),
      });
      expect(db.insert).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    });

    // 防回归：agentVersionId 只是版本锁定，不是 Agent Definition 绑定。
    // 调度器的 getWorkflowAgentDefinitionId() 不认它；发布校验若把它算作绑定，
    // 就会放行一个发布得掉、运行时却判定未绑定而失败的节点。
    it('发布时只有 agentVersionId 而无 Agent Definition 绑定仍应阻断', async () => {
      const workflow = createDraftWorkflow({
        nodes: [
          {
            id: 'agent-version-only',
            type: 'agent',
            position: { x: 0, y: 0 },
            data: {
              label: '仅锁版本助手',
              agentVersionId: 'agent-version-1',
            },
          },
        ],
        edges: [],
      });
      db.select.mockReturnValueOnce(createSelectChain([workflow]));

      const publishPromise = service.publish(WORKFLOW_ID, {}, USER_ID);

      await expect(publishPromise).rejects.toBeInstanceOf(
        WorkflowPublishAgentBindingException,
      );
      await expect(publishPromise).rejects.toMatchObject({
        detail: expect.stringContaining('仅锁版本助手'),
      });
      expect(db.insert).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    });

    it('发布时 agent 节点已绑定则正常通过', async () => {
      const workflow = createDraftWorkflow({
        nodes: [
          {
            id: 'agent-bound',
            type: 'agent',
            position: { x: 0, y: 0 },
            data: {
              label: '已绑定助手',
              agentDefinitionId: 'published-agent-definition-1',
            },
          },
        ],
        edges: [],
      });
      db.select
        .mockReturnValueOnce(createSelectChain([workflow]))
        .mockReturnValueOnce(createSelectChain([]))
        .mockReturnValueOnce(createSelectChain([{ maxVersion: 1 }]));
      db.insert.mockReturnValueOnce(
        createInsertChain([
          createMockVersion({ versionNumber: 2, publishedAt: NOW }),
        ]),
      );
      db.update
        .mockReturnValueOnce(createUpdateChainVoid())
        .mockReturnValueOnce(createUpdateChainVoid());

      await expect(
        service.publish(WORKFLOW_ID, {}, USER_ID),
      ).resolves.toBeDefined();
    });

    it('非 agent 节点不受 Agent 绑定校验影响', async () => {
      const workflow = createDraftWorkflow({
        nodes: [
          {
            id: 'text-node',
            type: 'text',
            position: { x: 0, y: 0 },
            data: { label: '文本输入' },
          },
        ],
        edges: [],
      });
      db.select
        .mockReturnValueOnce(createSelectChain([workflow]))
        .mockReturnValueOnce(createSelectChain([]))
        .mockReturnValueOnce(createSelectChain([{ maxVersion: 1 }]));
      db.insert.mockReturnValueOnce(
        createInsertChain([
          createMockVersion({ versionNumber: 2, publishedAt: NOW }),
        ]),
      );
      db.update
        .mockReturnValueOnce(createUpdateChainVoid())
        .mockReturnValueOnce(createUpdateChainVoid());

      await expect(
        service.publish(WORKFLOW_ID, {}, USER_ID),
      ).resolves.toBeDefined();
    });

    it('发布时 data.config 内嵌 Agent 绑定也算通过', async () => {
      const workflow = createDraftWorkflow({
        nodes: [
          {
            id: 'chat-agent-bound',
            type: 'chat-agent',
            position: { x: 0, y: 0 },
            data: {
              label: '内嵌绑定助手',
              config: {
                selected_agent_id: 'published-agent-definition-2',
              },
            },
          },
        ],
        edges: [],
      });
      db.select
        .mockReturnValueOnce(createSelectChain([workflow]))
        .mockReturnValueOnce(createSelectChain([]))
        .mockReturnValueOnce(createSelectChain([{ maxVersion: 1 }]));
      db.insert.mockReturnValueOnce(
        createInsertChain([
          createMockVersion({ versionNumber: 2, publishedAt: NOW }),
        ]),
      );
      db.update
        .mockReturnValueOnce(createUpdateChainVoid())
        .mockReturnValueOnce(createUpdateChainVoid());

      await expect(
        service.publish(WORKFLOW_ID, {}, USER_ID),
      ).resolves.toBeDefined();
    });

    it('no_sandbox workflow agent 连接 stdio MCP 节点时应阻止发布', async () => {
      const selectWf = createSelectChain([
        createNoSandboxWorkflowWithUpstreamMcp(),
      ]);
      const selectMcpConfigs = createSelectChain([
        {
          id: 'mcp-config-1',
          name: 'WebSearch',
          transportType: 'stdio',
        },
      ]);
      db.select
        .mockReturnValueOnce(selectWf)
        .mockReturnValueOnce(selectMcpConfigs);

      await expect(
        service.publish(WORKFLOW_ID, {}, USER_ID),
      ).rejects.toMatchObject({
        detail:
          '无 sandbox Agent 节点「NoSandbox News Agent」不能连接 stdio MCP server：WebSearch',
      });
    });

    it('端口类型不兼容时应当返回发布 warnings', async () => {
      const workflow = createPortMappedWorkflow('text', 'image');
      const selectWf = createSelectChain([workflow]);
      const selectReleases = createSelectChain([]);
      const selectMax = createSelectChain([{ maxVersion: 1 }]);
      db.select
        .mockReturnValueOnce(selectWf)
        .mockReturnValueOnce(selectReleases)
        .mockReturnValueOnce(selectMax);

      const publishedVersion = createMockVersion({
        versionNumber: 2,
        publishedAt: NOW,
      });
      db.insert.mockReturnValueOnce(createInsertChain([publishedVersion]));
      db.update
        .mockReturnValueOnce(createUpdateChainVoid())
        .mockReturnValueOnce(createUpdateChainVoid());
      redis.del.mockResolvedValueOnce(undefined);

      const result = await service.publish(WORKFLOW_ID, {}, USER_ID);

      expect(result.warnings).toEqual([
        {
          code: 'PORT_TYPE_INCOMPATIBLE',
          sourceNodeId: 'node-1',
          targetNodeId: 'node-2',
          sourcePort: {
            name: 'output-text',
            dataType: 'text',
          },
          targetPort: {
            name: 'input-data',
            dataType: 'image',
          },
          message:
            '输出端口 "output-text" (text) 与输入端口 "input-data" (image) 类型不兼容',
        },
      ]);
    });

    it('端口类型一致时不应返回发布 warnings', async () => {
      const workflow = createPortMappedWorkflow('text', 'text');
      const selectWf = createSelectChain([workflow]);
      const selectReleases = createSelectChain([]);
      const selectMax = createSelectChain([{ maxVersion: 1 }]);
      db.select
        .mockReturnValueOnce(selectWf)
        .mockReturnValueOnce(selectReleases)
        .mockReturnValueOnce(selectMax);

      const publishedVersion = createMockVersion({
        versionNumber: 2,
        publishedAt: NOW,
      });
      db.insert.mockReturnValueOnce(createInsertChain([publishedVersion]));
      db.update
        .mockReturnValueOnce(createUpdateChainVoid())
        .mockReturnValueOnce(createUpdateChainVoid());
      redis.del.mockResolvedValueOnce(undefined);

      const result = await service.publish(WORKFLOW_ID, {}, USER_ID);

      expect(result.warnings).toEqual([]);
    });

    it('目标端口为 json 时不应返回发布 warnings', async () => {
      const workflow = createPortMappedWorkflow('model', 'json');
      const selectWf = createSelectChain([workflow]);
      const selectReleases = createSelectChain([]);
      const selectMax = createSelectChain([{ maxVersion: 1 }]);
      db.select
        .mockReturnValueOnce(selectWf)
        .mockReturnValueOnce(selectReleases)
        .mockReturnValueOnce(selectMax);

      const publishedVersion = createMockVersion({
        versionNumber: 2,
        publishedAt: NOW,
      });
      db.insert.mockReturnValueOnce(createInsertChain([publishedVersion]));
      db.update
        .mockReturnValueOnce(createUpdateChainVoid())
        .mockReturnValueOnce(createUpdateChainVoid());
      redis.del.mockResolvedValueOnce(undefined);

      const result = await service.publish(WORKFLOW_ID, {}, USER_ID);

      expect(result.warnings).toEqual([]);
    });

    it('存在 canonical 超限自治节点时应阻止发布并返回节点级错误', async () => {
      const workflow = createAutonomyWorkflow('LLM_SUGGEST', 'canonical');
      db.select.mockReturnValueOnce(createSelectChain([workflow]));
      organizationAutonomyPolicyService.inspectWorkflowNodesAgainstPolicy.mockResolvedValueOnce(
        {
          autonomyCap: 'RULE_BASED',
          violations: [
            {
              workflowId: WORKFLOW_ID,
              workflowName: workflow.name,
              nodeId: 'agent-1',
              nodeName: 'Planner',
              rawMode: 'LLM_SUGGEST',
              canonicalMode: 'LLM_SUGGEST',
              replacementMode: 'RULE_BASED',
              source: 'canonical',
              reasonCode: 'mode_exceeds_cap',
              message:
                '自治模式 LLM_SUGGEST 超出组织上限 RULE_BASED，应降级为 RULE_BASED',
            },
          ],
        },
      );

      const publishPromise = service.publish(WORKFLOW_ID, {}, USER_ID);

      await expect(publishPromise).rejects.toMatchObject({
        type: 'https://agentloom.dev/errors/workflow-publish-autonomy-cap',
        errors: [
          {
            field: 'nodes.agent-1.autonomyMode',
            message: expect.stringContaining('Planner'),
          },
        ],
        extensions: {
          autonomyCap: 'RULE_BASED',
          violations: [
            expect.objectContaining({
              nodeId: 'agent-1',
              rawMode: 'LLM_SUGGEST',
              replacementMode: 'RULE_BASED',
            }),
          ],
        },
      });

      await expect(publishPromise).rejects.toBeInstanceOf(
        WorkflowPublishAutonomyCapException,
      );

      expect(
        organizationAutonomyPolicyService.inspectWorkflowNodesAgainstPolicy,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: workflow.tenantId,
          workflowId: workflow.id,
          workflowName: workflow.name,
          nodes: [
            expect.objectContaining({
              id: 'agent-1',
              data: expect.objectContaining({
                label: 'Planner',
                autonomyConfig: {
                  mode: 'LLM_SUGGEST',
                },
                // legacy `llm-agent` 经别名收敛为 canonical `agent` 后，
                // 会拿到 agent 的默认端口模板，不再是空端口
                inputPorts: expect.arrayContaining([
                  expect.objectContaining({ id: 'system-prompt-in' }),
                ]),
                outputPorts: expect.arrayContaining([
                  expect.objectContaining({ id: 'agent-out' }),
                ]),
              }),
            }),
          ],
        }),
      );
      expect(db.insert).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    });

    it('存在 legacy 超限自治节点时应阻止发布并保留 legacy explain 信息', async () => {
      const workflow = createAutonomyWorkflow('FULL_AUTO', 'legacy');
      db.select.mockReturnValueOnce(createSelectChain([workflow]));
      organizationAutonomyPolicyService.inspectWorkflowNodesAgainstPolicy.mockResolvedValueOnce(
        {
          autonomyCap: 'RULE_BASED',
          violations: [
            {
              workflowId: WORKFLOW_ID,
              workflowName: workflow.name,
              nodeId: 'agent-1',
              nodeName: 'Planner',
              rawMode: 'FULL_AUTO',
              canonicalMode: 'LLM_SUGGEST',
              replacementMode: 'RULE_BASED',
              source: 'legacy',
              reasonCode: 'mode_exceeds_cap',
              message:
                '自治模式 FULL_AUTO 超出组织上限 RULE_BASED，应降级为 RULE_BASED',
            },
          ],
        },
      );

      await expect(
        service.publish(WORKFLOW_ID, {}, USER_ID),
      ).rejects.toMatchObject({
        errors: [
          {
            field: 'nodes.agent-1.autonomyMode',
            message: expect.stringContaining('FULL_AUTO'),
          },
        ],
        extensions: {
          autonomyCap: 'RULE_BASED',
          violations: [
            expect.objectContaining({
              rawMode: 'FULL_AUTO',
              canonicalMode: 'LLM_SUGGEST',
              source: 'legacy',
            }),
          ],
        },
      });

      expect(db.insert).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    });
  });

  describe('archive', () => {
    it('应当归档 draft 状态的工作流', async () => {
      const selectWf = createSelectChain([createDraftWorkflow()]);
      db.select.mockReturnValueOnce(selectWf);

      const updateVersionsChain = createUpdateChainVoid();
      const updateWfChain = createUpdateChainVoid();
      db.update
        .mockReturnValueOnce(updateVersionsChain)
        .mockReturnValueOnce(updateWfChain);

      redis.del.mockResolvedValueOnce(undefined);

      await service.archive(WORKFLOW_ID, USER_ID);

      expect(db.update).toHaveBeenCalledTimes(2);
      expect(redis.del).toHaveBeenCalledOnce();
    });

    it('应当归档 published 状态的工作流', async () => {
      const selectWf = createSelectChain([
        createDraftWorkflow({
          status: 'published',
          publishedVersionId: VERSION_ID,
        }),
      ]);
      db.select.mockReturnValueOnce(selectWf);

      const updateVersionsChain = createUpdateChainVoid();
      const updateWfChain = createUpdateChainVoid();
      db.update
        .mockReturnValueOnce(updateVersionsChain)
        .mockReturnValueOnce(updateWfChain);

      redis.del.mockResolvedValueOnce(undefined);

      await service.archive(WORKFLOW_ID, USER_ID);

      expect(db.update).toHaveBeenCalledTimes(2);
    });

    it('工作流已归档时应当抛出 WorkflowArchivedException', async () => {
      const selectWf = createSelectChain([
        createDraftWorkflow({ status: 'archived' }),
      ]);
      db.select.mockReturnValueOnce(selectWf);

      await expect(
        service.archive(WORKFLOW_ID, USER_ID),
      ).rejects.toBeInstanceOf(WorkflowArchivedException);

      expect(db.update).not.toHaveBeenCalled();
    });
  });

  describe('getPublishedVersion', () => {
    it('缓存命中时应当返回缓存的版本', async () => {
      const cachedDto = {
        id: VERSION_ID,
        workflowDefinitionId: WORKFLOW_ID,
        versionNumber: 1,
        label: null,
        snapshot: MOCK_SNAPSHOT,
        publishedAt: NOW.toISOString(),
        archivedAt: null,
        createdBy: USER_ID,
        createdAt: NOW.toISOString(),
      };
      redis.get.mockResolvedValueOnce(JSON.stringify(cachedDto));

      const result = await service.getPublishedVersion(WORKFLOW_ID, TENANT_ID);

      expect(result).toEqual(cachedDto);
      expect(db.select).not.toHaveBeenCalled();
    });

    it('空值标记命中时应当返回 null', async () => {
      redis.get.mockResolvedValueOnce('__NULL__');

      const result = await service.getPublishedVersion(WORKFLOW_ID, TENANT_ID);

      expect(result).toBeNull();
      expect(db.select).not.toHaveBeenCalled();
    });

    it('缓存未命中且无 publishedVersionId 时应当缓存空值标记并返回 null', async () => {
      redis.get.mockResolvedValueOnce(null);

      const selectWf = createSelectChain([
        createDraftWorkflow({ publishedVersionId: null }),
      ]);
      db.select.mockReturnValueOnce(selectWf);

      redis.set.mockResolvedValueOnce(undefined);

      const result = await service.getPublishedVersion(WORKFLOW_ID, TENANT_ID);

      expect(result).toBeNull();
      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining('wf:published:'),
        '__NULL__',
        60,
      );
    });

    it('缓存未命中时应当从数据库获取并缓存', async () => {
      redis.get.mockResolvedValueOnce(null);

      const workflow = createDraftWorkflow({ publishedVersionId: VERSION_ID });
      const selectWf = createSelectChain([workflow]);

      const version = createMockVersion({ publishedAt: NOW });
      const selectVersion = createSelectChain([version]);

      db.select
        .mockReturnValueOnce(selectWf)
        .mockReturnValueOnce(selectVersion);

      redis.set.mockResolvedValueOnce(undefined);

      const result = await service.getPublishedVersion(WORKFLOW_ID, TENANT_ID);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(VERSION_ID);
      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining('wf:published:'),
        expect.any(String),
        300,
      );
    });

    it('缓存未命中且版本记录不存在时应当缓存空值标记', async () => {
      redis.get.mockResolvedValueOnce(null);

      const workflow = createDraftWorkflow({ publishedVersionId: VERSION_ID });
      const selectWf = createSelectChain([workflow]);
      const selectVersion = createSelectChain([]);

      db.select
        .mockReturnValueOnce(selectWf)
        .mockReturnValueOnce(selectVersion);

      redis.set.mockResolvedValueOnce(undefined);

      const result = await service.getPublishedVersion(WORKFLOW_ID, TENANT_ID);

      expect(result).toBeNull();
      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining('wf:published:'),
        '__NULL__',
        60,
      );
    });
  });

  describe('状态转换矩阵', () => {
    describe('draft →', () => {
      it('draft → published：应当允许', async () => {
        const selectWf = createSelectChain([createDraftWorkflow()]);
        const selectReleases = createSelectChain([]);
        const selectMax = createSelectChain([{ maxVersion: 0 }]);
        db.select
          .mockReturnValueOnce(selectWf)
          .mockReturnValueOnce(selectReleases)
          .mockReturnValueOnce(selectMax);

        const insertChain = createInsertChain([
          createMockVersion({ publishedAt: NOW }),
        ]);
        db.insert.mockReturnValueOnce(insertChain);

        db.update
          .mockReturnValueOnce(createUpdateChainVoid())
          .mockReturnValueOnce(createUpdateChainVoid());
        redis.del.mockResolvedValueOnce(undefined);

        await expect(
          service.publish(WORKFLOW_ID, {}, USER_ID),
        ).resolves.toBeDefined();
      });

      it('draft → archived：应当允许', async () => {
        const selectWf = createSelectChain([createDraftWorkflow()]);
        db.select.mockReturnValueOnce(selectWf);

        db.update
          .mockReturnValueOnce(createUpdateChainVoid())
          .mockReturnValueOnce(createUpdateChainVoid());
        redis.del.mockResolvedValueOnce(undefined);

        await expect(
          service.archive(WORKFLOW_ID, USER_ID),
        ).resolves.toBeUndefined();
      });
    });

    describe('published →', () => {
      it('published → published（再次发布）：应当允许', async () => {
        const selectWf = createSelectChain([
          createDraftWorkflow({ status: 'published' }),
        ]);
        const selectReleases = createSelectChain([]);
        const selectMax = createSelectChain([{ maxVersion: 4 }]);
        db.select
          .mockReturnValueOnce(selectWf)
          .mockReturnValueOnce(selectReleases)
          .mockReturnValueOnce(selectMax);

        const publishedVersion = createMockVersion({
          versionNumber: 5,
          publishedAt: NOW,
        });
        db.insert.mockReturnValueOnce(createInsertChain([publishedVersion]));
        db.update
          .mockReturnValueOnce(createUpdateChainVoid())
          .mockReturnValueOnce(createUpdateChainVoid());
        redis.del.mockResolvedValueOnce(undefined);

        await expect(
          service.publish(WORKFLOW_ID, {}, USER_ID),
        ).resolves.toMatchObject({
          data: {
            versionNumber: 5,
            publishedAt: NOW.toISOString(),
          },
        });
      });

      it('published → archived：应当允许', async () => {
        const selectWf = createSelectChain([
          createDraftWorkflow({ status: 'published' }),
        ]);
        db.select.mockReturnValueOnce(selectWf);

        db.update
          .mockReturnValueOnce(createUpdateChainVoid())
          .mockReturnValueOnce(createUpdateChainVoid());
        redis.del.mockResolvedValueOnce(undefined);

        await expect(
          service.archive(WORKFLOW_ID, USER_ID),
        ).resolves.toBeUndefined();
      });
    });

    describe('archived →', () => {
      it('archived → published：应当拒绝', async () => {
        const selectWf = createSelectChain([
          createDraftWorkflow({ status: 'archived' }),
        ]);
        db.select.mockReturnValueOnce(selectWf);

        await expect(
          service.publish(WORKFLOW_ID, {}, USER_ID),
        ).rejects.toBeInstanceOf(WorkflowArchivedException);
      });

      it('archived → archived：应当拒绝（幂等保护）', async () => {
        const selectWf = createSelectChain([
          createDraftWorkflow({ status: 'archived' }),
        ]);
        db.select.mockReturnValueOnce(selectWf);

        await expect(
          service.archive(WORKFLOW_ID, USER_ID),
        ).rejects.toBeInstanceOf(WorkflowArchivedException);
      });

      it('archived → createVersion：应当拒绝', async () => {
        const selectWf = createSelectChain([
          createDraftWorkflow({ status: 'archived' }),
        ]);
        db.select.mockReturnValueOnce(selectWf);

        await expect(
          service.createVersion(WORKFLOW_ID, {}, USER_ID),
        ).rejects.toBeInstanceOf(WorkflowArchivedException);
      });

      it('archived → rollback：应当拒绝', async () => {
        const selectWf = createSelectChain([
          createDraftWorkflow({ status: 'archived' }),
        ]);
        db.select.mockReturnValueOnce(selectWf);

        await expect(
          service.rollback(WORKFLOW_ID, VERSION_ID, USER_ID),
        ).rejects.toBeInstanceOf(WorkflowArchivedException);
      });
    });
  });

  describe('toResponseDto 映射', () => {
    it('应当将 Date 字段转换为 ISO 字符串', async () => {
      const selectWf = createSelectChain([createDraftWorkflow()]);
      const selectMax = createSelectChain([{ maxVersion: 0 }]);
      db.select.mockReturnValueOnce(selectWf).mockReturnValueOnce(selectMax);

      const version = createMockVersion({
        publishedAt: new Date('2025-06-01T12:00:00Z'),
        archivedAt: null,
      });
      const insertChain = createInsertChain([version]);
      db.insert.mockReturnValueOnce(insertChain);

      const result = await service.createVersion(WORKFLOW_ID, {}, USER_ID);

      expect(result.publishedAt).toBe('2025-06-01T12:00:00.000Z');
      expect(result.archivedAt).toBeNull();
      expect(result.createdAt).toBe(NOW.toISOString());
    });

    it('应当正确映射 label 字段（null 兜底）', async () => {
      const selectWf = createSelectChain([createDraftWorkflow()]);
      const selectMax = createSelectChain([{ maxVersion: 0 }]);
      db.select.mockReturnValueOnce(selectWf).mockReturnValueOnce(selectMax);

      const version = createMockVersion({ label: undefined });
      const insertChain = createInsertChain([version]);
      db.insert.mockReturnValueOnce(insertChain);

      const result = await service.createVersion(WORKFLOW_ID, {}, USER_ID);

      expect(result.label).toBeNull();
    });

    it('应当在事务内获取工作流级写锁', async () => {
      const selectWf = createSelectChain([createDraftWorkflow()]);
      const selectMax = createSelectChain([{ maxVersion: 0 }]);
      db.select.mockReturnValueOnce(selectWf).mockReturnValueOnce(selectMax);

      db.insert.mockReturnValueOnce(
        createInsertChain([createMockVersion({ versionNumber: 1 })]),
      );

      await service.createVersion(WORKFLOW_ID, {}, USER_ID);

      expect(db.transaction).toHaveBeenCalledOnce();
      expect(db.execute).toHaveBeenCalledOnce();
    });
  });

  describe('create', () => {
    const MOCK_DTO_BLANK = { name: '测试工作流' };
    const MOCK_DTO_WITH_TEMPLATE = {
      name: '模板副本',
      description: '从模板创建',
      template_slug: 'code-review-assistant',
    };
    const MARKETPLACE_LISTING_ID = '00000000-0000-0000-0000-000000000088';
    const MOCK_DTO_WITH_MARKETPLACE = {
      name: 'Marketplace 副本',
      description: '从 marketplace 安装',
      marketplace_listing_id: MARKETPLACE_LISTING_ID,
    };
    const SHARE_TOKEN = 'share-token-123';
    const MOCK_DTO_WITH_SHARE = {
      name: '分享副本',
      description: '从分享复制',
      share_token: SHARE_TOKEN,
    };
    const MOCK_TEMPLATE = {
      id: '00000000-0000-0000-0000-000000000099',
      name: '代码审查助手',
      slug: 'code-review-assistant',
      definition: {
        inputSchema: MOCK_INPUT_SCHEMA,
        nodes: [
          {
            id: 'tmpl-node-1',
            type: 'agent',
            position: { x: 0, y: 0 },
            data: {},
          },
          {
            id: 'tmpl-node-2',
            type: 'output',
            position: { x: 200, y: 0 },
            data: {},
          },
        ],
        edges: [
          {
            id: 'tmpl-edge-1',
            source: 'tmpl-node-1',
            target: 'tmpl-node-2',
            sourceHandle: 'tmpl-node-1-output',
            targetHandle: 'tmpl-node-2-input',
          },
        ],
        viewport: { x: 100, y: 100, zoom: 0.8 },
      },
    };

    const createInsertReturning = (result: unknown) => ({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([result]),
      }),
    });

    it('应创建空白工作流（无模板）', async () => {
      const mockResult = createDraftWorkflow({
        name: '测试工作流',
        slug: 'ce-shi-gong-zuo-liu',
        nodes: [],
        edges: [],
      });
      db.insert.mockReturnValue(createInsertReturning(mockResult));

      const result = await service.create(TENANT_ID, USER_ID, MOCK_DTO_BLANK);

      expect(result).toEqual(mockResult);
      expect(templateService.findBySlug).not.toHaveBeenCalled();
      expect(db.insert).toHaveBeenCalledOnce();

      // 验证插入参数
      const insertCall = db.insert.mock.results[0].value;
      const valuesArg = insertCall.values.mock.calls[0][0];
      expect(valuesArg).toMatchObject({
        tenantId: TENANT_ID,
        name: '测试工作流',
        description: null,
        nodes: [],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        inputSchema: null,
        metadata: {},
        createdBy: USER_ID,
        updatedBy: USER_ID,
      });
      expect(valuesArg.slug).toBeDefined();
    });

    it('应从模板克隆定义并设置元数据', async () => {
      templateService.findBySlug.mockResolvedValue(MOCK_TEMPLATE);

      const mockResult = createDraftWorkflow({
        name: '模板副本',
        slug: 'mo-ban-fu-ben',
        description: '从模板创建',
      });
      const publishedResult = {
        ...mockResult,
        status: 'published' as const,
        publishedVersionId: VERSION_ID,
      };
      const mockVersion = createMockVersion({ publishedAt: NOW });
      db.insert
        .mockReturnValueOnce(createInsertReturning(mockResult))
        .mockReturnValueOnce(createInsertReturning(mockVersion));
      db.update.mockReturnValueOnce(createUpdateChain([publishedResult]));

      const result = await service.create(
        TENANT_ID,
        USER_ID,
        MOCK_DTO_WITH_TEMPLATE,
      );

      expect(result).toEqual(publishedResult);
      expect(result.status).toBe('published');
      expect(result.publishedVersionId).toBe(VERSION_ID);
      expect(templateService.findBySlug).toHaveBeenCalledWith(
        'code-review-assistant',
      );

      // 验证克隆后的节点 ID 已替换（不等于原始模板 ID）
      const valuesArg = db.insert.mock.results[0].value.values.mock.calls[0][0];
      expect(valuesArg.nodes).toHaveLength(2);
      expect(valuesArg.nodes[0].id).not.toBe('tmpl-node-1');
      expect(valuesArg.nodes[1].id).not.toBe('tmpl-node-2');
      expect(valuesArg.edges).toHaveLength(1);
      expect(valuesArg.edges[0].source).toBe(valuesArg.nodes[0].id);
      expect(valuesArg.edges[0].target).toBe(valuesArg.nodes[1].id);
      expect(valuesArg.viewport).toEqual(MOCK_TEMPLATE.definition.viewport);
      expect(valuesArg.inputSchema).toEqual(MOCK_INPUT_SCHEMA);

      // 验证元数据包含克隆信息
      expect(valuesArg.metadata).toMatchObject({
        cloned_from_template: {
          templateSlug: 'code-review-assistant',
          templateName: '代码审查助手',
        },
      });
      expect(valuesArg.metadata.cloned_from_template.clonedAt).toBeDefined();
      expect(valuesArg.description).toBe('从模板创建');
    });

    it('应从 marketplace listing 克隆定义并处理空 viewport', async () => {
      const marketplaceSnapshot = {
        nodes: [
          {
            id: 'market-node-1',
            type: 'agent',
            position: { x: 0, y: 0 },
            data: {},
          },
          {
            id: 'market-node-2',
            type: 'output',
            position: { x: 240, y: 0 },
            data: {},
          },
        ],
        edges: [
          {
            id: 'market-edge-1',
            source: 'market-node-1',
            target: 'market-node-2',
            sourceHandle: 'market-node-1-output',
            targetHandle: 'market-node-2-input',
          },
        ],
        viewport: null,
        inputSchema: MOCK_INPUT_SCHEMA,
        metadata: { nodeCount: 2, edgeCount: 1, createdFromVersion: 3 },
      };
      const selectListing = createSelectChainWithInnerJoin([
        {
          id: MARKETPLACE_LISTING_ID,
          title: 'Marketplace 热门工作流',
          sourceTenantId: TENANT_ID,
          snapshot: marketplaceSnapshot,
        },
      ]);
      const mockResult = createDraftWorkflow({
        name: 'Marketplace 副本',
        slug: 'marketplace-fu-ben',
        description: '从 marketplace 安装',
      });
      const publishedResult = {
        ...mockResult,
        status: 'published' as const,
        publishedVersionId: VERSION_ID,
      };
      const mockVersion = createMockVersion({ publishedAt: NOW });

      db.select.mockReturnValueOnce(selectListing);
      db.insert
        .mockReturnValueOnce(createInsertReturning(mockResult))
        .mockReturnValueOnce(createInsertReturning(mockVersion));
      db.update.mockReturnValueOnce(createUpdateChain([publishedResult]));

      const result = await service.create(
        TENANT_ID,
        USER_ID,
        MOCK_DTO_WITH_MARKETPLACE,
      );

      expect(result).toEqual(publishedResult);
      expect(result.status).toBe('published');
      expect(result.publishedVersionId).toBe(VERSION_ID);
      const valuesArg = db.insert.mock.results[0].value.values.mock.calls[0][0];
      expect(valuesArg.nodes).toHaveLength(2);
      expect(valuesArg.nodes[0].id).not.toBe('market-node-1');
      expect(valuesArg.nodes[1].id).not.toBe('market-node-2');
      expect(valuesArg.edges[0].source).toBe(valuesArg.nodes[0].id);
      expect(valuesArg.edges[0].target).toBe(valuesArg.nodes[1].id);
      expect(valuesArg.viewport).toEqual(MOCK_VIEWPORT);
      expect(valuesArg.inputSchema).toEqual(MOCK_INPUT_SCHEMA);
      expect(valuesArg.metadata).toMatchObject({
        cloned_from_marketplace: {
          listingId: MARKETPLACE_LISTING_ID,
          listingTitle: 'Marketplace 热门工作流',
        },
      });
      expect(valuesArg.metadata.cloned_from_marketplace.clonedAt).toBeDefined();
    });

    it('应在 marketplace 安装时为 workflow 级 workspace 绑定创建目标租户空工作区', async () => {
      const sourceWorkspaceId = '10000000-0000-0000-0000-000000000111';
      const targetWorkspaceId = '20000000-0000-0000-0000-000000000111';
      const organizationId = '30000000-0000-0000-0000-000000000111';
      const marketplaceSnapshot = {
        nodes: [
          {
            id: 'market-workspace-node',
            type: 'tool',
            position: { x: 0, y: 0 },
            data: {
              label: '项目工作区',
              nodeType: 'workspace',
              workspaceId: sourceWorkspaceId,
              config: {
                workspace_id: sourceWorkspaceId,
                workspace_name: '项目工作区',
              },
            },
          },
          {
            id: 'market-sandbox-node',
            type: 'tool',
            position: { x: 240, y: 0 },
            data: {
              label: '共享开发沙箱',
              nodeType: 'sandbox',
              restoreWorkspaceId: sourceWorkspaceId,
              persistentSandboxId: '40000000-0000-0000-0000-000000000111',
              config: {
                restore_workspace_id: sourceWorkspaceId,
                persistent_sandbox_id: '40000000-0000-0000-0000-000000000111',
              },
            },
          },
        ],
        edges: [],
        viewport: null,
        inputSchema: MOCK_INPUT_SCHEMA,
        metadata: { nodeCount: 2, edgeCount: 0, createdFromVersion: 3 },
      };
      const selectListing = createSelectChainWithInnerJoin([
        {
          id: MARKETPLACE_LISTING_ID,
          title: 'Marketplace 热门工作流',
          sourceTenantId: TENANT_ID,
          snapshot: marketplaceSnapshot,
        },
      ]);
      const selectOrganization = createSelectChainWithLimit([
        { id: organizationId },
      ]);
      const selectSourceWorkspace = createSelectChainWithLimit([
        {
          name: '项目工作区',
          description: '源模板工作区',
        },
      ]);
      const createdWorkspaceSnapshot = {
        id: targetWorkspaceId,
        organizationId,
        tenantId: TENANT_ID,
        name: '项目工作区',
        description: '源模板工作区',
        storageKey: 'pending',
        sizeBytes: 0,
        status: 'ready',
        createdById: USER_ID,
        config: null,
        createdAt: NOW,
        updatedAt: NOW,
      };
      const updatedWorkspaceSnapshot = {
        ...createdWorkspaceSnapshot,
        storageKey: `tenants/${TENANT_ID}/workspaces/${targetWorkspaceId}/snapshot.tar`,
      };
      const mockResult = createDraftWorkflow({
        name: 'Marketplace 副本',
        slug: 'marketplace-fu-ben',
        description: '从 marketplace 安装',
      });
      const publishedResult = {
        ...mockResult,
        status: 'published' as const,
        publishedVersionId: VERSION_ID,
      };
      const mockVersion = createMockVersion({ publishedAt: NOW });

      db.select
        .mockReturnValueOnce(selectListing)
        .mockReturnValueOnce(selectOrganization)
        .mockReturnValueOnce(selectSourceWorkspace);
      db.insert
        .mockReturnValueOnce(createInsertReturning(createdWorkspaceSnapshot))
        .mockReturnValueOnce(createInsertReturning(mockResult))
        .mockReturnValueOnce(createInsertReturning(mockVersion));
      db.update
        .mockReturnValueOnce(createUpdateChain([updatedWorkspaceSnapshot]))
        .mockReturnValueOnce(createUpdateChain([publishedResult]));

      const result = await service.create(
        TENANT_ID,
        USER_ID,
        MOCK_DTO_WITH_MARKETPLACE,
      );

      expect(result).toEqual(publishedResult);

      const workspaceInsertValues =
        db.insert.mock.results[0].value.values.mock.calls[0][0];
      expect(workspaceInsertValues).toMatchObject({
        organizationId,
        tenantId: TENANT_ID,
        name: '项目工作区',
        description: '源模板工作区',
        status: 'ready',
        sizeBytes: 0,
        createdById: USER_ID,
      });

      const workflowInsertValues =
        db.insert.mock.results[1].value.values.mock.calls[0][0];
      expect(workflowInsertValues.nodes).toHaveLength(2);
      const clonedWorkspaceNode = workflowInsertValues.nodes.find(
        (node: Record<string, unknown>) =>
          (node.data as Record<string, unknown>)?.nodeType === 'workspace',
      ) as Record<string, unknown>;
      const clonedSandboxNode = workflowInsertValues.nodes.find(
        (node: Record<string, unknown>) =>
          (node.data as Record<string, unknown>)?.nodeType === 'sandbox',
      ) as Record<string, unknown>;
      expect(clonedWorkspaceNode).toBeDefined();
      expect(clonedSandboxNode).toBeDefined();
      expect(
        (clonedWorkspaceNode.data as Record<string, unknown>).workspaceId,
      ).toBe(targetWorkspaceId);
      expect(
        (
          (clonedWorkspaceNode.data as Record<string, unknown>)
            .config as Record<string, unknown>
        ).workspaceId,
      ).toBe(targetWorkspaceId);
      expect(
        (clonedWorkspaceNode.data as Record<string, unknown>).workspace_id,
      ).toBeUndefined();
      expect(
        (clonedWorkspaceNode.data as Record<string, unknown>).workspaceName,
      ).toBe('项目工作区');
      expect(
        (clonedSandboxNode.data as Record<string, unknown>).restoreWorkspaceId,
      ).toBe(targetWorkspaceId);
      expect(
        (
          (clonedSandboxNode.data as Record<string, unknown>).config as Record<
            string,
            unknown
          >
        ).restoreWorkspaceId,
      ).toBe(targetWorkspaceId);
      expect(
        (clonedSandboxNode.data as Record<string, unknown>).persistentSandboxId,
      ).toBeUndefined();
      expect(
        (
          (clonedSandboxNode.data as Record<string, unknown>).config as Record<
            string,
            unknown
          >
        ).persistentSandboxId,
      ).toBeUndefined();
    });

    it('marketplace listing 不存在时应抛出 MarketplaceListingNotFoundException', async () => {
      db.select.mockReturnValueOnce(createSelectChainWithInnerJoin([]));

      await expect(
        service.create(TENANT_ID, USER_ID, MOCK_DTO_WITH_MARKETPLACE),
      ).rejects.toBeInstanceOf(MarketplaceListingNotFoundException);

      expect(db.insert).not.toHaveBeenCalled();
    });

    it('应在 marketplace 安装时深拷贝 workflow-agent 依赖并重绑目标租户模型', async () => {
      const sourceAgentDefinitionId = '10000000-0000-0000-0000-000000000001';
      const sourceAgentVersionId = '10000000-0000-0000-0000-000000000002';
      const sourceModelConfigId = '10000000-0000-0000-0000-000000000003';
      const targetModelConfigId = '20000000-0000-0000-0000-000000000003';
      const clonedAgentDefinitionId = '30000000-0000-0000-0000-000000000001';
      const clonedAgentVersionId = '30000000-0000-0000-0000-000000000002';
      const sourceProviderId = '10000000-0000-0000-0000-000000000004';
      const targetProviderId = '20000000-0000-0000-0000-000000000004';
      const marketplaceSnapshot = {
        nodes: [
          {
            id: 'market-agent-node',
            type: 'agent',
            position: { x: 0, y: 0 },
            data: {
              label: 'News Agent',
              nodeType: 'agent',
              selectedAgentId: sourceAgentDefinitionId,
              agentVersionId: sourceAgentVersionId,
              config: {
                selected_agent_id: sourceAgentDefinitionId,
                agent_version_id: sourceAgentVersionId,
              },
            },
          },
        ],
        edges: [],
        viewport: MOCK_VIEWPORT,
        inputSchema: null,
        metadata: { nodeCount: 1, edgeCount: 0, createdFromVersion: 1 },
      };
      const sourceAgentDefinition = {
        id: sourceAgentDefinitionId,
        tenantId: TENANT_ID,
        name: 'Source News Agent',
        description: 'source agent',
        icon: null,
        runtimeMode: 'no_sandbox' as const,
        sandboxConfig: null,
        workspaceSnapshotId: null,
        publishedVersionId: sourceAgentVersionId,
      };
      const sourceAgentVersion = {
        id: sourceAgentVersionId,
        snapshot: {
          runtimeMode: 'no_sandbox' as const,
          nodes: [
            {
              id: 'agent-main',
              type: 'agent',
              position: { x: 320, y: 0 },
              data: {
                nodeType: 'agent-main',
                label: 'Agent Main',
              },
            },
            {
              id: 'agent-model',
              type: 'agent',
              position: { x: 0, y: 0 },
              data: {
                nodeType: 'llm-model',
                label: 'claude-sonnet-4-6',
                llmConfigId: sourceModelConfigId,
                modelId: 'claude-sonnet-4-6',
                modelName: 'claude-sonnet-4-6',
                provider: 'anthropic',
                config: {
                  llmConfigId: sourceModelConfigId,
                  modelId: 'claude-sonnet-4-6',
                  modelName: 'claude-sonnet-4-6',
                  provider: 'anthropic',
                },
              },
            },
          ],
          edges: [
            {
              id: 'agent-model-edge',
              source: 'agent-model',
              target: 'agent-main',
              sourceHandle: 'model-out',
              targetHandle: 'model-in',
            },
          ],
          viewport: MOCK_VIEWPORT,
          systemPrompt: null,
          metadata: { nodeCount: 2, edgeCount: 1, createdFromVersion: 1 },
        },
      };
      const sourceModelRow = {
        config: {
          id: sourceModelConfigId,
          orgId: '10000000-0000-0000-0000-000000000010',
          tenantId: TENANT_ID,
          providerId: sourceProviderId,
          name: 'Claude Sonnet 4.6',
          modelId: 'claude-sonnet-4-6',
          modelType: 'chat' as const,
          isEnabled: true,
          isDefault: true,
          capabilities: {},
          contextWindow: null,
          maxOutputTokens: null,
          pricing: null,
          parameters: {},
          metadataSource: 'manual' as const,
          embeddingDimensions: null,
          timeoutMs: null,
          createdAt: NOW,
          updatedAt: NOW,
        },
        provider: {
          id: sourceProviderId,
          orgId: '10000000-0000-0000-0000-000000000010',
          tenantId: TENANT_ID,
          slug: 'anthropic',
          name: 'Anthropic',
          iconUrl: null,
          baseUrl: 'https://models.example.test/',
          defaultBaseUrl: 'https://models.example.test/',
          isBuiltin: true,
          isEnabled: true,
          apiProtocol: 'anthropic' as const,
          apiKeyId: '10000000-0000-0000-0000-000000000099',
          sortOrder: 0,
          createdAt: NOW,
          updatedAt: NOW,
        },
      };
      const targetModelRow = {
        config: {
          ...sourceModelRow.config,
          id: targetModelConfigId,
          tenantId: TENANT_ID,
          providerId: targetProviderId,
        },
        provider: {
          ...sourceModelRow.provider,
          id: targetProviderId,
          tenantId: TENANT_ID,
          apiKeyId: '20000000-0000-0000-0000-000000000099',
        },
      };
      const createdAgentDefinition = {
        id: clonedAgentDefinitionId,
        tenantId: TENANT_ID,
        name: 'Source News Agent',
        slug: 'source-news-agent-fu-ben',
        description: 'source agent',
        icon: null,
        runtimeMode: 'no_sandbox' as const,
        systemPrompt: null,
        nodes: [],
        edges: [],
        viewport: MOCK_VIEWPORT,
        metadata: {},
        sandboxConfig: null,
        workspaceSnapshotId: null,
        version: 1,
        status: 'draft' as const,
        publishedVersionId: null,
        createdBy: USER_ID,
        updatedBy: USER_ID,
        createdAt: NOW,
        updatedAt: NOW,
      };
      const createdAgentVersion = {
        id: clonedAgentVersionId,
        agentDefinitionId: clonedAgentDefinitionId,
        tenantId: TENANT_ID,
        versionNumber: 1,
        label: 'v1 (workflow import)',
        snapshot: sourceAgentVersion.snapshot,
        publishedAt: NOW,
        archivedAt: null,
        createdBy: USER_ID,
        createdAt: NOW,
      };
      const createdWorkflow = createDraftWorkflow({
        name: 'Marketplace 副本',
        slug: 'marketplace-fu-ben',
        description: '从 marketplace 安装',
      });
      const publishedWorkflow = {
        ...createdWorkflow,
        status: 'published' as const,
        publishedVersionId: VERSION_ID,
      };
      const workflowVersion = createMockVersion({ publishedAt: NOW });

      db.select
        .mockReturnValueOnce(
          createSelectChainWithInnerJoin([
            {
              id: MARKETPLACE_LISTING_ID,
              title: 'Marketplace 热门工作流',
              sourceTenantId: TENANT_ID,
              snapshot: marketplaceSnapshot,
            },
          ]),
        )
        .mockReturnValueOnce(createSelectChain([sourceAgentDefinition]))
        .mockReturnValueOnce(createSelectChain([sourceAgentVersion]))
        .mockReturnValueOnce(createSelectChainWithInnerJoin([sourceModelRow]))
        .mockReturnValueOnce(createSelectChainWithInnerJoin([targetModelRow]));
      db.insert
        .mockReturnValueOnce(createInsertReturning(createdAgentDefinition))
        .mockReturnValueOnce(createInsertReturning(createdAgentVersion))
        .mockReturnValueOnce(createInsertReturning(createdWorkflow))
        .mockReturnValueOnce(createInsertReturning(workflowVersion));
      db.update
        .mockReturnValueOnce(createUpdateChainVoid())
        .mockReturnValueOnce(createUpdateChain([publishedWorkflow]));

      const result = await service.create(
        TENANT_ID,
        USER_ID,
        MOCK_DTO_WITH_MARKETPLACE,
      );

      expect(result).toEqual(publishedWorkflow);
      expect(result.status).toBe('published');
      expect(db.insert).toHaveBeenCalledTimes(4);

      const importedAgentValues =
        db.insert.mock.results[0].value.values.mock.calls[0][0];
      const importedModelNode = importedAgentValues.nodes.find(
        (node: Record<string, unknown>) =>
          (node.data as Record<string, unknown>).nodeType === 'llm-model',
      ) as Record<string, unknown>;
      const importedModelData = importedModelNode.data as Record<
        string,
        unknown
      >;
      const importedModelConfig = importedModelData.config as Record<
        string,
        unknown
      >;
      expect(importedAgentValues.runtimeMode).toBe('no_sandbox');
      expect(importedModelData.llmConfigId).toBe(targetModelConfigId);
      expect(importedModelData.modelConfigId).toBe(targetModelConfigId);
      expect(importedModelData.apiKeyId).toBe(targetModelRow.provider.apiKeyId);
      expect(importedModelConfig.llmConfigId).toBe(targetModelConfigId);
      expect(importedModelConfig.modelConfigId).toBe(targetModelConfigId);

      const workflowInsertValues =
        db.insert.mock.results[2].value.values.mock.calls[0][0];
      const importedWorkflowNode = workflowInsertValues.nodes[0];
      expect(importedWorkflowNode.data.selectedAgentId).toBe(
        clonedAgentDefinitionId,
      );
      expect(importedWorkflowNode.data.agentDefinitionId).toBe(
        clonedAgentDefinitionId,
      );
      expect(importedWorkflowNode.data.agentVersionId).toBe(
        clonedAgentVersionId,
      );
      expect(importedWorkflowNode.data.config.selectedAgentId).toBe(
        clonedAgentDefinitionId,
      );
      expect(importedWorkflowNode.data.config.agentVersionId).toBe(
        clonedAgentVersionId,
      );
    });

    it('应从可复制分享克隆定义并递增 copy count', async () => {
      shareService.getShareByToken.mockResolvedValue({
        id: '00000000-0000-0000-0000-000000000099',
        shareType: 'copyable',
        shareToken: SHARE_TOKEN,
        workflowDefinitionId: '00000000-0000-0000-0000-000000000088',
        workflowName: '公开分享工作流',
        snapshot: {
          nodes: [
            {
              id: 'share-node-1',
              type: 'agent',
              position: { x: 0, y: 0 },
              data: {},
            },
            {
              id: 'share-node-2',
              type: 'output',
              position: { x: 240, y: 0 },
              data: {},
            },
          ],
          edges: [
            {
              id: 'share-edge-1',
              source: 'share-node-1',
              target: 'share-node-2',
              sourceHandle: 'share-node-1-output',
              targetHandle: 'share-node-2-input',
            },
          ],
          viewport: MOCK_VIEWPORT,
          inputSchema: MOCK_INPUT_SCHEMA,
        },
      });

      const mockResult = createDraftWorkflow({
        name: '分享副本',
        slug: 'fen-xiang-fu-ben',
        description: '从分享复制',
      });
      const publishedResult = {
        ...mockResult,
        status: 'published' as const,
        publishedVersionId: VERSION_ID,
      };
      const mockVersion = createMockVersion({ publishedAt: NOW });
      db.insert
        .mockReturnValueOnce(createInsertReturning(mockResult))
        .mockReturnValueOnce(createInsertReturning(mockVersion));
      db.update.mockReturnValueOnce(createUpdateChain([publishedResult]));

      const result = await service.create(
        TENANT_ID,
        USER_ID,
        MOCK_DTO_WITH_SHARE,
      );

      expect(result).toEqual(publishedResult);
      expect(result.status).toBe('published');
      expect(result.publishedVersionId).toBe(VERSION_ID);
      expect(shareService.getShareByToken).toHaveBeenCalledWith(SHARE_TOKEN);
      expect(shareService.incrementCopyCount).toHaveBeenCalledWith(SHARE_TOKEN);
      expect(
        resourceSourceService.recordImportedResources,
      ).toHaveBeenCalledWith(TENANT_ID, USER_ID, [
        {
          resourceType: 'workflow_definition',
          resourceId: mockResult.id,
          sourceShareType: 'workflow',
          sourceShareId: '00000000-0000-0000-0000-000000000099',
          sourceShareToken: SHARE_TOKEN,
          sourceResourceType: 'workflow_definition',
          sourceResourceId: '00000000-0000-0000-0000-000000000088',
          sourceResourceTitle: '公开分享工作流',
        },
      ]);

      const valuesArg = db.insert.mock.results[0].value.values.mock.calls[0][0];
      expect(valuesArg.nodes).toHaveLength(2);
      expect(valuesArg.nodes[0].id).not.toBe('share-node-1');
      expect(valuesArg.nodes[1].id).not.toBe('share-node-2');
      expect(valuesArg.edges[0].source).toBe(valuesArg.nodes[0].id);
      expect(valuesArg.edges[0].target).toBe(valuesArg.nodes[1].id);
      expect(valuesArg.inputSchema).toEqual(MOCK_INPUT_SCHEMA);
      expect(valuesArg.metadata).toMatchObject({
        cloned_from_share: {
          shareToken: SHARE_TOKEN,
          workflowName: '公开分享工作流',
        },
      });
      expect(valuesArg.metadata.cloned_from_share.clonedAt).toBeDefined();
    });

    it('read_only 分享链接不支持通过 share_token 克隆', async () => {
      shareService.getShareByToken.mockResolvedValue({
        shareType: 'read_only',
        workflowName: '只读分享工作流',
        snapshot: {
          nodes: MOCK_NODES,
          edges: MOCK_EDGES,
          viewport: MOCK_VIEWPORT,
          inputSchema: null,
        },
      });

      await expect(
        service.create(TENANT_ID, USER_ID, MOCK_DTO_WITH_SHARE),
      ).rejects.toBeInstanceOf(DomainException);

      expect(db.insert).not.toHaveBeenCalled();
      expect(shareService.incrementCopyCount).not.toHaveBeenCalled();
    });

    it('应在 slug 冲突时自动重试', async () => {
      const uniqueViolation = Object.assign(new Error('unique_violation'), {
        code: '23505',
      });

      const mockResult = createDraftWorkflow({ name: '测试工作流' });

      // 第一次插入抛唯一约束错误，第二次成功
      db.insert
        .mockReturnValueOnce({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockRejectedValue(uniqueViolation),
          }),
        })
        .mockReturnValueOnce(createInsertReturning(mockResult));

      const result = await service.create(TENANT_ID, USER_ID, MOCK_DTO_BLANK);

      expect(result).toEqual(mockResult);
      expect(db.insert).toHaveBeenCalledTimes(2);
    });

    it('应在达到最大重试次数后抛出原始错误', async () => {
      const uniqueViolation = Object.assign(new Error('unique_violation'), {
        code: '23505',
      });

      // 所有 4 次尝试（0..3）都抛唯一约束错误
      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(uniqueViolation),
        }),
      });

      await expect(
        service.create(TENANT_ID, USER_ID, MOCK_DTO_BLANK),
      ).rejects.toThrow('unique_violation');

      expect(db.insert).toHaveBeenCalledTimes(4); // MAX_SLUG_RETRIES + 1
    });

    it('应识别 Drizzle 包装后的唯一约束错误并继续重试', async () => {
      const wrappedUniqueViolation = Object.assign(new Error('query_failed'), {
        cause: Object.assign(new Error('unique_violation'), {
          code: '23505',
        }),
      });
      const mockResult = createDraftWorkflow({ name: '包装错误重试工作流' });

      db.insert
        .mockReturnValueOnce({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockRejectedValue(wrappedUniqueViolation),
          }),
        })
        .mockReturnValueOnce(createInsertReturning(mockResult));

      const result = await service.create(TENANT_ID, USER_ID, MOCK_DTO_BLANK);

      expect(result).toEqual(mockResult);
      expect(db.insert).toHaveBeenCalledTimes(2);
    });

    it('应在非唯一约束错误时直接抛出', async () => {
      const otherError = new Error('connection_refused');

      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(otherError),
        }),
      });

      await expect(
        service.create(TENANT_ID, USER_ID, MOCK_DTO_BLANK),
      ).rejects.toThrow('connection_refused');

      // 不应重试
      expect(db.insert).toHaveBeenCalledOnce();
    });
  });
  describe('版本快照与 release 契约补充', () => {
    it('创建版本时应将 legacy graph、空 viewport/inputSchema 与快照元数据一并冻结', async () => {
      const workflow = createDraftWorkflow({
        version: 6,
        viewport: null,
        inputSchema: null,
        nodes: [
          {
            id: 'trigger',
            type: 'workflow-node',
            position: { x: 0, y: 0 },
            data: {
              node_type: 'manual-trigger',
              output_ports: [{ id: 'payload-out' }],
            },
          },
          {
            id: 'output',
            type: 'workflow-node',
            position: { x: 100, y: 0 },
            data: {
              node_type: 'json-output',
              input_ports: [{ id: 'json-in' }],
            },
          },
        ],
        edges: [
          {
            id: 'edge',
            source: 'trigger',
            target: 'output',
            source_handle: 'payload',
            target_handle: 'json',
          },
        ],
      });
      db.select
        .mockReturnValueOnce(createSelectChain([workflow]))
        .mockReturnValueOnce(createSelectChain([{ maxVersion: 8 }]));
      const insertChain = createInsertChain([
        createMockVersion({ versionNumber: 9 }),
      ]);
      db.insert.mockReturnValueOnce(insertChain);

      await service.createVersion(WORKFLOW_ID, {}, USER_ID);

      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          versionNumber: 9,
          label: null,
          snapshot: {
            nodes: [
              expect.objectContaining({
                id: 'trigger',
                type: 'trigger',
                data: expect.objectContaining({
                  nodeType: 'manual-trigger',
                  outputPorts: expect.arrayContaining([
                    expect.objectContaining({ id: 'payload-out' }),
                  ]),
                }),
              }),
              expect.objectContaining({
                id: 'output',
                type: 'output',
                data: expect.objectContaining({ nodeType: 'json-output' }),
              }),
            ],
            edges: [
              expect.objectContaining({
                id: 'edge',
                sourceHandle: 'payload-out',
                targetHandle: 'json-in',
              }),
            ],
            viewport: null,
            inputSchema: null,
            metadata: {
              nodeCount: 2,
              edgeCount: 1,
              createdFromVersion: 6,
              releaseNotes: null,
              releaseNumber: null,
            },
          },
        }),
      );
    });

    it('发布当前草稿时应跨历史版本取最大 release number 并修剪 release notes', async () => {
      const workflow = createDraftWorkflow({ version: 4 });
      db.select
        .mockReturnValueOnce(createSelectChain([workflow]))
        .mockReturnValueOnce(
          createSelectChain([
            {
              snapshot: {
                ...MOCK_SNAPSHOT,
                metadata: { ...MOCK_SNAPSHOT.metadata, releaseNumber: 4 },
              },
              publishedAt: NOW,
            },
            {
              snapshot: {
                ...MOCK_SNAPSHOT,
                metadata: { ...MOCK_SNAPSHOT.metadata, releaseNumber: -2 },
              },
              publishedAt: NOW,
            },
            {
              snapshot: {
                ...MOCK_SNAPSHOT,
                metadata: { ...MOCK_SNAPSHOT.metadata, releaseNumber: 2.5 },
              },
              publishedAt: null,
            },
          ]),
        )
        .mockReturnValueOnce(createSelectChain([{ maxVersion: null }]));
      const insertedVersion = createMockVersion({
        versionNumber: 1,
        publishedAt: NOW,
        snapshot: {
          ...MOCK_SNAPSHOT,
          metadata: {
            ...MOCK_SNAPSHOT.metadata,
            releaseNotes: 'Ship it',
            releaseNumber: 5,
          },
        },
      });
      const insertChain = createInsertChain([insertedVersion]);
      db.insert.mockReturnValueOnce(insertChain);
      db.update
        .mockReturnValueOnce(createUpdateChainVoid())
        .mockReturnValueOnce(createUpdateChainVoid());
      redis.del.mockResolvedValueOnce(undefined);

      const result = await service.publish(
        WORKFLOW_ID,
        { releaseNotes: '  Ship it  ' },
        USER_ID,
      );

      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          versionNumber: 1,
          snapshot: expect.objectContaining({
            metadata: expect.objectContaining({
              createdFromVersion: 4,
              releaseNotes: 'Ship it',
              releaseNumber: 5,
            }),
          }),
        }),
      );
      expect(result.data.releaseNumber).toBe(5);
    });

    it('重新发布已有快照时应保留其 release number、label 与既有说明', async () => {
      const workflow = createDraftWorkflow();
      const existingVersion = createMockVersion({
        label: 'Existing',
        publishedAt: null,
        snapshot: {
          ...MOCK_SNAPSHOT,
          metadata: {
            ...MOCK_SNAPSHOT.metadata,
            releaseNotes: 'Original notes',
            releaseNumber: 7,
          },
        },
      });
      db.select
        .mockReturnValueOnce(createSelectChain([workflow]))
        .mockReturnValueOnce(
          createSelectChain([
            {
              snapshot: {
                ...MOCK_SNAPSHOT,
                metadata: { ...MOCK_SNAPSHOT.metadata, releaseNumber: 9 },
              },
              publishedAt: NOW,
            },
          ]),
        )
        .mockReturnValueOnce(createSelectChain([existingVersion]));
      const updatedVersion = {
        ...existingVersion,
        publishedAt: NOW,
      };
      const clearPublished = createUpdateChainVoid();
      const publishExisting = createUpdateChain([updatedVersion]);
      db.update
        .mockReturnValueOnce(clearPublished)
        .mockReturnValueOnce(publishExisting)
        .mockReturnValueOnce(createUpdateChainVoid());
      redis.del.mockResolvedValueOnce(undefined);

      await service.publish(
        WORKFLOW_ID,
        { versionId: VERSION_ID, releaseNotes: '   ' },
        USER_ID,
      );

      expect(publishExisting.set).toHaveBeenCalledWith({
        publishedAt: NOW,
        label: 'Existing',
        snapshot: {
          ...existingVersion.snapshot,
          metadata: {
            ...existingVersion.snapshot.metadata,
            releaseNotes: 'Original notes',
            releaseNumber: 7,
          },
        },
      });
    });

    it('版本 DTO 应区分显式 release、legacy 已发布版本与未发布草稿', async () => {
      const explicitRelease = createMockVersion({
        snapshot: {
          ...MOCK_SNAPSHOT,
          metadata: { ...MOCK_SNAPSHOT.metadata, releaseNumber: 3 },
        },
      });
      const legacyPublished = createMockVersion({
        id: VERSION_ID_2,
        publishedAt: NOW,
        snapshot: {
          ...MOCK_SNAPSHOT,
          metadata: { ...MOCK_SNAPSHOT.metadata, releaseNumber: 0 },
        },
      });
      const draftVersion = createMockVersion({
        id: '00000000-0000-0000-0000-000000000006',
        snapshot: {
          ...MOCK_SNAPSHOT,
          metadata: { ...MOCK_SNAPSHOT.metadata, releaseNumber: Number.NaN },
        },
      });
      db.select
        .mockReturnValueOnce(createSelectChain([createDraftWorkflow()]))
        .mockReturnValueOnce(
          createSelectChainWithPagination([
            explicitRelease,
            legacyPublished,
            draftVersion,
          ]),
        )
        .mockReturnValueOnce(createSelectChain([{ count: 3 }]));

      const result = await service.listVersions(WORKFLOW_ID, {
        page: 1,
        pageSize: 10,
      });

      expect(result.data.map((version) => version.releaseNumber)).toEqual([
        3,
        1,
        null,
      ]);
    });

    it('OCC 更新仅 nodes 时应借用现有 edges 归一化，但只持久化请求字段', async () => {
      const workflow = createDraftWorkflow({
        version: 2,
        edges: [
          {
            id: 'existing-edge',
            source: 'trigger',
            target: 'output',
            source_handle: 'payload',
            target_handle: 'content',
          },
        ],
      });
      const updatedWorkflow = createDraftWorkflow({
        version: 3,
        nodes: [],
        updatedBy: USER_ID,
      });
      db.select.mockReturnValueOnce(createSelectChain([workflow]));
      const updateChain = createUpdateChain([updatedWorkflow]);
      db.update.mockReturnValueOnce(updateChain);

      await service.updateDefinition(WORKFLOW_ID, USER_ID, {
        version: 2,
        nodes: [
          {
            id: 'trigger',
            type: 'workflow-node',
            position: { x: 0, y: 0 },
            data: {
              node_type: 'manual-trigger',
              output_ports: [{ id: 'payload-out' }],
            },
          },
          {
            id: 'output',
            type: 'workflow-node',
            position: { x: 1, y: 0 },
            data: {
              node_type: 'text-output',
              input_ports: [{ id: 'content-in' }],
            },
          },
        ] as never,
      });

      const setClause = updateChain.set.mock.calls[0][0];
      expect(setClause.nodes).toEqual([
        expect.objectContaining({ id: 'trigger', type: 'trigger' }),
        expect.objectContaining({ id: 'output', type: 'output' }),
      ]);
      expect(setClause).not.toHaveProperty('edges');
      expect(updateChain.where).toHaveBeenCalledOnce();
    });

    it('OCC 更新仅 edges 时应借用现有 nodes 解析 legacy handles 且不覆写 nodes', async () => {
      const workflow = createDraftWorkflow({
        version: 10,
        nodes: [
          {
            id: 'trigger',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: {
              nodeType: 'manual-trigger',
              outputPorts: [{ id: 'payload-out' }],
            },
          },
          {
            id: 'output',
            type: 'output',
            position: { x: 1, y: 0 },
            data: {
              nodeType: 'text-output',
              inputPorts: [{ id: 'content-in' }],
            },
          },
        ],
      });
      db.select.mockReturnValueOnce(createSelectChain([workflow]));
      const updateChain = createUpdateChain([
        createDraftWorkflow({ version: 11 }),
      ]);
      db.update.mockReturnValueOnce(updateChain);

      await service.updateDefinition(WORKFLOW_ID, USER_ID, {
        version: 10,
        edges: [
          {
            id: 'new-edge',
            source: 'trigger',
            target: 'output',
            source_handle: 'payload',
            target_handle: 'content',
          },
        ] as never,
      });

      const setClause = updateChain.set.mock.calls[0][0];
      expect(setClause.edges).toEqual([
        {
          id: 'new-edge',
          source: 'trigger',
          target: 'output',
          sourceHandle: 'payload-out',
          targetHandle: 'content-in',
        },
      ]);
      expect(setClause).not.toHaveProperty('nodes');
    });
    it('定义详情应从已发布快照公开 release number', async () => {
      db.select
        .mockReturnValueOnce(
          createSelectChain([
            createDraftWorkflow({
              status: 'published',
              publishedVersionId: VERSION_ID,
            }),
          ]),
        )
        .mockReturnValueOnce(
          createSelectChain([
            {
              snapshot: {
                ...MOCK_SNAPSHOT,
                metadata: { ...MOCK_SNAPSHOT.metadata, releaseNumber: 12 },
              },
              publishedAt: NOW,
            },
          ]),
        );

      const result = await service.findDefinitionById(WORKFLOW_ID);

      expect(result.publishedVersionId).toBe(VERSION_ID);
      expect(result.publishedReleaseNumber).toBe(12);
    });

    it('定义指向已删除版本时应将 published release 暴露为 null', async () => {
      db.select
        .mockReturnValueOnce(
          createSelectChain([
            createDraftWorkflow({
              status: 'published',
              publishedVersionId: VERSION_ID,
            }),
          ]),
        )
        .mockReturnValueOnce(createSelectChain([]));

      const result = await service.findDefinitionById(WORKFLOW_ID);

      expect(result.publishedReleaseNumber).toBeNull();
    });
  });
});
