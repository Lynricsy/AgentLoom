import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createMockDb: () => ({
    select: vi.fn(),
  }),
  getTenantDb: vi.fn(),
  operators: {
    asc: vi.fn((value: unknown) => ({ type: 'asc', value })),
    desc: vi.fn((value: unknown) => ({ type: 'desc', value })),
    eq: vi.fn((left: unknown, right: unknown) => ({ type: 'eq', left, right })),
    inArray: vi.fn((left: unknown, right: unknown[]) => ({
      type: 'inArray',
      left,
      right,
    })),
  },
  createPathResolverService: () => ({
    resolveUri: vi.fn(),
  }),
  createMemoryNodeService: () => ({
    listNodes: vi.fn(),
  }),
  createMemoryVersionService: () => ({
    getLatestVersion: vi.fn(),
  }),
  createGlossaryService: () => ({}),
}));

vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm');

  return {
    ...actual,
    asc: mocks.operators.asc,
    desc: mocks.operators.desc,
    eq: mocks.operators.eq,
    inArray: mocks.operators.inArray,
  };
});

vi.mock('../../../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: mocks.getTenantDb,
}));

import type { DrizzleDB } from '../../../../database/database.module';
import {
  memoryGlossaryKeywords,
  memoryPaths,
  memoryVersions,
  type MemoryGlossaryKeyword,
  type MemoryInstance,
  type MemoryNode,
  type MemoryPath,
  type MemoryVersion,
} from '../../../../database/schema';
import {
  MEMORY_SYSTEM_PROMPT_TEMPLATE,
} from '../../constants/memory-system-prompt.template';
import { BootProtocolService } from '../boot-protocol.service';

type MockDb = ReturnType<typeof mocks.createMockDb>;
type MockPathResolverService = ReturnType<typeof mocks.createPathResolverService>;
type MockMemoryNodeService = ReturnType<typeof mocks.createMemoryNodeService>;
type MockMemoryVersionService = ReturnType<typeof mocks.createMemoryVersionService>;
type MockGlossaryService = ReturnType<typeof mocks.createGlossaryService>;

type SelectChain<TResult> = Promise<TResult[]> & {
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const INSTANCE_ID = '22222222-2222-4222-8222-222222222222';
const NODE_ID = '33333333-3333-4333-8333-333333333333';
const VERSION_ID = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2025-02-01T08:00:00.000Z');

function createSelectChain<TResult>(result: TResult[]): SelectChain<TResult> {
  const chain = Promise.resolve(result) as SelectChain<TResult>;
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  return chain;
}

function createNode(overrides: Partial<MemoryNode> = {}): MemoryNode {
  return {
    id: NODE_ID,
    instanceId: INSTANCE_ID,
    tenantId: TENANT_ID,
    contentType: 'text',
    metadata: { label: 'boot' },
    disclosureLevel: 0,
    createdAt: NOW,
    ...overrides,
  };
}

function createVersion(overrides: Partial<MemoryVersion> = {}): MemoryVersion {
  return {
    id: VERSION_ID,
    nodeId: NODE_ID,
    tenantId: TENANT_ID,
    content: 'I am Agent X',
    version: 1,
    deprecated: false,
    migratedTo: null,
    reviewStatus: 'pending',
    patchSummary: null,
    createdBy: null,
    createdAt: NOW,
    ...overrides,
  };
}

function createPath(overrides: Partial<MemoryPath> = {}): MemoryPath {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    instanceId: INSTANCE_ID,
    tenantId: TENANT_ID,
    domain: 'core',
    pathString: 'agent',
    edgeId: null,
    nodeId: NODE_ID,
    createdAt: NOW,
    ...overrides,
  };
}

function createGlossaryKeyword(
  overrides: Partial<MemoryGlossaryKeyword> = {},
): MemoryGlossaryKeyword {
  return {
    id: '66666666-6666-4666-8666-666666666666',
    instanceId: INSTANCE_ID,
    tenantId: TENANT_ID,
    keyword: 'agentloom',
    nodeId: NODE_ID,
    createdAt: NOW,
    ...overrides,
  };
}

function createMemoryInstance(
  overrides: Partial<MemoryInstance> = {},
): MemoryInstance {
  return {
    id: INSTANCE_ID,
    tenantId: TENANT_ID,
    name: 'Primary Memory',
    description: null,
    config: null,
    systemPromptOverride: null,
    validDomains: ['core', 'writer'],
    coreMemoryUris: ['core://agent'],
    status: 'active',
    occVersion: 1,
    createdBy: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('BootProtocolService', () => {
  let service: BootProtocolService;
  let rawDb: MockDb;
  let tenantDb: MockDb;
  let pathResolverService: MockPathResolverService;
  let memoryNodeService: MockMemoryNodeService;
  let memoryVersionService: MockMemoryVersionService;
  let glossaryService: MockGlossaryService;

  beforeEach(() => {
    vi.clearAllMocks();

    rawDb = mocks.createMockDb();
    tenantDb = mocks.createMockDb();
    pathResolverService = mocks.createPathResolverService();
    memoryNodeService = mocks.createMemoryNodeService();
    memoryVersionService = mocks.createMemoryVersionService();
    glossaryService = mocks.createGlossaryService();

    mocks.getTenantDb.mockReturnValue(tenantDb as unknown as DrizzleDB);

    service = new BootProtocolService(
      rawDb as unknown as DrizzleDB,
      pathResolverService as never,
      memoryNodeService as never,
      memoryVersionService as never,
      glossaryService as never,
    );
  });

  it('默认模板应包含占位符、工具名和关键操作章节', () => {
    expect(MEMORY_SYSTEM_PROMPT_TEMPLATE).toContain('{{VALID_DOMAINS}}');
    expect(MEMORY_SYSTEM_PROMPT_TEMPLATE).toContain('{{CORE_MEMORY_URIS}}');
    expect(MEMORY_SYSTEM_PROMPT_TEMPLATE).toContain('read_memory');
    expect(MEMORY_SYSTEM_PROMPT_TEMPLATE).toContain('create_memory');
    expect(MEMORY_SYSTEM_PROMPT_TEMPLATE).toContain('update_memory');
    expect(MEMORY_SYSTEM_PROMPT_TEMPLATE).toContain('delete_memory');
    expect(MEMORY_SYSTEM_PROMPT_TEMPLATE).toContain('add_alias');
    expect(MEMORY_SYSTEM_PROMPT_TEMPLATE).toContain('manage_triggers');
    expect(MEMORY_SYSTEM_PROMPT_TEMPLATE).toContain('search_memory');
    expect(MEMORY_SYSTEM_PROMPT_TEMPLATE).toContain('Startup Protocol');
    expect(MEMORY_SYSTEM_PROMPT_TEMPLATE).toContain('Priority');
    expect(MEMORY_SYSTEM_PROMPT_TEMPLATE).toContain('Disclosure');
    expect(MEMORY_SYSTEM_PROMPT_TEMPLATE).toContain('Maintenance');
  });

  describe('boot', () => {
    it('应读取 system://boot 对应节点的最新版本内容', async () => {
      const node = createNode();
      const latestVersion = createVersion({ content: 'I am Agent X' });

      pathResolverService.resolveUri.mockResolvedValue({
        node,
        path: createPath({ domain: 'system', pathString: 'boot' }),
      });
      memoryVersionService.getLatestVersion.mockResolvedValue(latestVersion);

      await expect(service.boot(INSTANCE_ID)).resolves.toBe('I am Agent X');

      expect(pathResolverService.resolveUri).toHaveBeenCalledWith(
        INSTANCE_ID,
        'system://boot',
      );
      expect(memoryVersionService.getLatestVersion).toHaveBeenCalledWith(NODE_ID);
    });

    it('system://boot 缺失时应降级返回 null', async () => {
      pathResolverService.resolveUri.mockRejectedValue(
        new NotFoundException('Memory path system://boot not found'),
      );

      await expect(service.boot(INSTANCE_ID)).resolves.toBeNull();
      expect(memoryVersionService.getLatestVersion).not.toHaveBeenCalled();
    });
  });

  describe('getIndex', () => {
    it('应读取 system://index 并返回实例内全部路径列表', async () => {
      const query = createSelectChain([
        createPath({ domain: 'core', pathString: 'agent' }),
        createPath({ id: 'path-2', domain: 'writer', pathString: 'chapter_1' }),
      ]);

      pathResolverService.resolveUri.mockResolvedValue(createNode());
      tenantDb.select.mockReturnValueOnce(query);

      await expect(service.getIndex(INSTANCE_ID)).resolves.toEqual([
        createPath({ domain: 'core', pathString: 'agent' }),
        createPath({ id: 'path-2', domain: 'writer', pathString: 'chapter_1' }),
      ]);

      expect(pathResolverService.resolveUri).toHaveBeenCalledWith(
        INSTANCE_ID,
        'system://index',
      );
      expect(query.orderBy).toHaveBeenCalledWith(
        mocks.operators.asc(memoryPaths.domain),
        mocks.operators.asc(memoryPaths.pathString),
      );
    });

    it('system://index 缺失时应返回空数组而不是抛错', async () => {
      pathResolverService.resolveUri.mockRejectedValue(
        new NotFoundException('Memory path system://index not found'),
      );
      tenantDb.select.mockReturnValueOnce(createSelectChain([]));

      await expect(service.getIndex(INSTANCE_ID)).resolves.toEqual([]);
    });
  });

  describe('getRecent', () => {
    it('应按 createdAt 倒序返回实例内最近版本', async () => {
      const firstNode = createNode({ id: NODE_ID });
      const secondNode = createNode({ id: 'node-2' });
      const recentVersions = [
        createVersion({ id: 'v2', nodeId: 'node-2', createdAt: new Date('2025-02-03T00:00:00.000Z') }),
        createVersion({ id: 'v1', nodeId: NODE_ID, createdAt: new Date('2025-02-02T00:00:00.000Z') }),
      ];
      const query = createSelectChain(recentVersions);

      memoryNodeService.listNodes.mockResolvedValue({
        data: [firstNode, secondNode],
        total: 2,
      });
      tenantDb.select.mockReturnValueOnce(query);

      await expect(service.getRecent(INSTANCE_ID, 5)).resolves.toEqual(recentVersions);

      expect(memoryNodeService.listNodes).toHaveBeenCalledWith(INSTANCE_ID, {
        page: 1,
        limit: Number.MAX_SAFE_INTEGER,
      });
      expect(query.where).toHaveBeenCalledWith(
        mocks.operators.inArray(memoryVersions.nodeId, [NODE_ID, 'node-2']),
      );
      expect(query.orderBy).toHaveBeenCalledWith(
        mocks.operators.desc(memoryVersions.createdAt),
      );
      expect(query.limit).toHaveBeenCalledWith(5);
    });

    it('实例没有节点时应返回空数组', async () => {
      memoryNodeService.listNodes.mockResolvedValue({ data: [], total: 0 });

      await expect(service.getRecent(INSTANCE_ID)).resolves.toEqual([]);
      expect(tenantDb.select).not.toHaveBeenCalled();
    });
  });

  describe('getGlossary', () => {
    it('应按 keyword 排序返回全部 glossary 关键词', async () => {
      const glossaryRows = [
        createGlossaryKeyword({ keyword: 'agentloom' }),
        createGlossaryKeyword({ id: 'kw-2', keyword: 'boot-sequence' }),
      ];
      const query = createSelectChain(glossaryRows);

      tenantDb.select.mockReturnValueOnce(query);

      await expect(service.getGlossary(INSTANCE_ID)).resolves.toEqual(glossaryRows);

      expect(query.where).toHaveBeenCalledWith(
        mocks.operators.eq(memoryGlossaryKeywords.instanceId, INSTANCE_ID),
      );
      expect(query.orderBy).toHaveBeenCalledWith(
        mocks.operators.asc(memoryGlossaryKeywords.keyword),
      );
    });
  });

  describe('getMemorySystemPrompt', () => {
    it('应使用默认模板并替换实例占位符', async () => {
      const instance = createMemoryInstance({
        validDomains: ['core', 'writer'],
        coreMemoryUris: ['core://agent', 'writer://chapter_1'],
      });
      const query = createSelectChain([instance]);

      tenantDb.select.mockReturnValueOnce(query);

      const prompt = await service.getMemorySystemPrompt(INSTANCE_ID);

      expect(prompt).toContain('core, writer');
      expect(prompt).toContain('core://agent, writer://chapter_1');
      expect(prompt).toContain('read_memory');
      expect(prompt).not.toContain('{{VALID_DOMAINS}}');
      expect(prompt).not.toContain('{{CORE_MEMORY_URIS}}');
    });

    it('override 非空时应优先使用自定义模板并继续替换占位符', async () => {
      const instance = createMemoryInstance({
        systemPromptOverride:
          'You are a special agent. Domains: {{VALID_DOMAINS}}. Core: {{CORE_MEMORY_URIS}}.',
        validDomains: ['core', 'notes'],
        coreMemoryUris: ['core://agent'],
      });

      tenantDb.select.mockReturnValueOnce(createSelectChain([instance]));

      await expect(service.getMemorySystemPrompt(INSTANCE_ID)).resolves.toBe(
        'You are a special agent. Domains: core, notes. Core: core://agent.',
      );
    });
  });

  describe('executeBootSequence', () => {
    it('应按顺序聚合 system prompt、boot、index 与 glossary', async () => {
      const getMemorySystemPromptSpy = vi
        .spyOn(service, 'getMemorySystemPrompt')
        .mockResolvedValue('Prompt');
      const bootSpy = vi.spyOn(service, 'boot').mockResolvedValue('I am Agent X');
      const getIndexSpy = vi.spyOn(service, 'getIndex').mockResolvedValue([
        createPath({ domain: 'core', pathString: 'agent' }),
      ]);
      const getGlossarySpy = vi.spyOn(service, 'getGlossary').mockResolvedValue([
        createGlossaryKeyword({ keyword: 'agentloom' }),
      ]);

      await expect(service.executeBootSequence(INSTANCE_ID)).resolves.toEqual({
        systemPrompt: 'Prompt',
        boot: 'I am Agent X',
        index: [createPath({ domain: 'core', pathString: 'agent' })],
        glossary: [createGlossaryKeyword({ keyword: 'agentloom' })],
      });

      expect(getMemorySystemPromptSpy.mock.invocationCallOrder[0]).toBeLessThan(
        bootSpy.mock.invocationCallOrder[0],
      );
      expect(bootSpy.mock.invocationCallOrder[0]).toBeLessThan(
        getIndexSpy.mock.invocationCallOrder[0],
      );
      expect(getIndexSpy.mock.invocationCallOrder[0]).toBeLessThan(
        getGlossarySpy.mock.invocationCallOrder[0],
      );
    });

    it('空实例时应保留 system prompt 并降级为空上下文', async () => {
      vi.spyOn(service, 'getMemorySystemPrompt').mockResolvedValue('Prompt');
      vi.spyOn(service, 'boot').mockResolvedValue(null);
      vi.spyOn(service, 'getIndex').mockResolvedValue([]);
      vi.spyOn(service, 'getGlossary').mockResolvedValue([]);

      await expect(service.executeBootSequence(INSTANCE_ID)).resolves.toEqual({
        systemPrompt: 'Prompt',
        boot: null,
        index: [],
        glossary: [],
      });
    });
  });
});
