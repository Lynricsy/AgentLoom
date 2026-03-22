import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createMockDb: () => ({
    select: vi.fn(),
  }),
  getTenantDb: vi.fn(),
  operators: {
    and: vi.fn((...conditions: unknown[]) => ({ type: 'and', conditions })),
    eq: vi.fn((left: unknown, right: unknown) => ({ type: 'eq', left, right })),
    inArray: vi.fn((left: unknown, right: unknown[]) => ({
      type: 'inArray',
      left,
      right,
    })),
  },
  createBootProtocolService: () => ({
    executeBootSequence: vi.fn(),
  }),
  createMemorySearchService: () => ({
    search: vi.fn(),
  }),
  createPathResolverService: () => ({
    resolveUri: vi.fn(),
    createPath: vi.fn(),
  }),
  createMemoryVersionService: () => ({
    appendVersion: vi.fn(),
    createVersion: vi.fn(),
    getLatestVersion: vi.fn(),
  }),
  createMemoryNodeService: () => ({
    createNode: vi.fn(),
  }),
}));

vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm');

  return {
    ...actual,
    and: mocks.operators.and,
    eq: mocks.operators.eq,
    inArray: mocks.operators.inArray,
  };
});

vi.mock('../../../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: mocks.getTenantDb,
}));

import type { DrizzleDB } from '../../../../database/database.module';
import {
  memorySessions,
  type MemoryGlossaryKeyword,
  type MemoryNode,
  type MemoryPath,
  type MemorySession,
  type MemorySessionConfig,
  type MemoryVersion,
} from '../../../../database/schema';
import type { MemoryBootSequenceResult } from '../boot-protocol.service';
import { MemoryFusionService } from '../memory-fusion.service';

type MockDb = ReturnType<typeof mocks.createMockDb>;
type MockBootProtocolService = ReturnType<typeof mocks.createBootProtocolService>;
type MockMemorySearchService = ReturnType<typeof mocks.createMemorySearchService>;
type MockPathResolverService = ReturnType<typeof mocks.createPathResolverService>;
type MockMemoryVersionService = ReturnType<typeof mocks.createMemoryVersionService>;
type MockMemoryNodeService = ReturnType<typeof mocks.createMemoryNodeService>;

type SelectChain<TResult> = Promise<TResult[]> & {
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2025-02-01T08:00:00.000Z');

function createSelectChain<TResult>(result: TResult[]): SelectChain<TResult> {
  const chain = Promise.resolve(result) as SelectChain<TResult>;
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  return chain;
}

function createSessionConfig(
  overrides: Partial<MemorySessionConfig> = {},
): MemorySessionConfig {
  return {
    bootUris: ['system://boot'],
    fusionPriority: 1,
    ...overrides,
  };
}

function createSession(overrides: Partial<MemorySession> = {}): MemorySession {
  const sessionId = overrides.id ?? crypto.randomUUID();

  return {
    id: sessionId,
    tenantId: TENANT_ID,
    memoryInstanceId: `${sessionId}-instance`,
    executionId: 'execution-1',
    agentConversationId: null,
    role: 'readonly',
    status: 'active',
    config: createSessionConfig(),
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function createNode(overrides: Partial<MemoryNode> = {}): MemoryNode {
  return {
    id: 'node-1',
    instanceId: 'instance-1',
    tenantId: TENANT_ID,
    contentType: 'text',
    metadata: { label: 'memory-node' },
    disclosureLevel: 0,
    createdAt: NOW,
    ...overrides,
  };
}

function createVersion(overrides: Partial<MemoryVersion> = {}): MemoryVersion {
  return {
    id: 'version-1',
    nodeId: 'node-1',
    tenantId: TENANT_ID,
    content: '记忆内容',
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
    id: 'path-1',
    instanceId: 'instance-1',
    tenantId: TENANT_ID,
    domain: 'core',
    pathString: 'agent',
    edgeId: null,
    nodeId: 'node-1',
    createdAt: NOW,
    ...overrides,
  };
}

function createGlossaryKeyword(
  overrides: Partial<MemoryGlossaryKeyword> = {},
): MemoryGlossaryKeyword {
  return {
    id: 'keyword-1',
    instanceId: 'instance-1',
    tenantId: TENANT_ID,
    keyword: 'agentloom',
    nodeId: 'node-1',
    createdAt: NOW,
    ...overrides,
  };
}

function createBootSequence(
  overrides: Partial<MemoryBootSequenceResult> = {},
): MemoryBootSequenceResult {
  return {
    systemPrompt: 'Prompt',
    boot: 'Boot',
    index: [createPath()],
    glossary: [createGlossaryKeyword()],
    ...overrides,
  };
}

describe('MemoryFusionService', () => {
  let service: MemoryFusionService;
  let rawDb: MockDb;
  let tenantDb: MockDb;
  let bootProtocolService: MockBootProtocolService;
  let memorySearchService: MockMemorySearchService;
  let pathResolverService: MockPathResolverService;
  let memoryVersionService: MockMemoryVersionService;
  let memoryNodeService: MockMemoryNodeService;

  beforeEach(() => {
    vi.clearAllMocks();

    rawDb = mocks.createMockDb();
    tenantDb = mocks.createMockDb();
    bootProtocolService = mocks.createBootProtocolService();
    memorySearchService = mocks.createMemorySearchService();
    pathResolverService = mocks.createPathResolverService();
    memoryVersionService = mocks.createMemoryVersionService();
    memoryNodeService = mocks.createMemoryNodeService();

    mocks.getTenantDb.mockReturnValue(tenantDb as unknown as DrizzleDB);

    service = new MemoryFusionService(
      rawDb as unknown as DrizzleDB,
      bootProtocolService as never,
      memorySearchService as never,
      pathResolverService as never,
      memoryVersionService as never,
      memoryNodeService as never,
    );
  });

  describe('readFromAll', () => {
    it('应按 fusionPriority 升序返回多实例读取结果', async () => {
      const lowPrioritySession = createSession({
        id: 'session-low',
        memoryInstanceId: 'instance-low',
        config: createSessionConfig({ fusionPriority: 3 }),
      });
      const highPrioritySession = createSession({
        id: 'session-high',
        memoryInstanceId: 'instance-high',
        config: createSessionConfig({ fusionPriority: 1 }),
      });
      const sessionQuery = createSelectChain([lowPrioritySession, highPrioritySession]);

      tenantDb.select.mockReturnValueOnce(sessionQuery);
      pathResolverService.resolveUri.mockImplementation(async (instanceId: string) =>
        instanceId === 'instance-high'
          ? createNode({ id: 'node-high', instanceId })
          : createNode({ id: 'node-low', instanceId }),
      );
      memoryVersionService.getLatestVersion.mockImplementation(async (nodeId: string) =>
        nodeId === 'node-high'
          ? createVersion({ id: 'version-high', nodeId, content: '高优先级内容' })
          : createVersion({ id: 'version-low', nodeId, content: '低优先级内容' }),
      );

      await expect(
        service.readFromAll(
          [lowPrioritySession.id, highPrioritySession.id],
          'core://agent/name',
        ),
      ).resolves.toEqual([
        {
          sessionId: 'session-high',
          memoryInstanceId: 'instance-high',
          fusionPriority: 1,
          role: 'readonly',
          nodeId: 'node-high',
          uri: 'core://agent/name',
          content: '高优先级内容',
        },
        {
          sessionId: 'session-low',
          memoryInstanceId: 'instance-low',
          fusionPriority: 3,
          role: 'readonly',
          nodeId: 'node-low',
          uri: 'core://agent/name',
          content: '低优先级内容',
        },
      ]);
    });

    it('单个实例缺失目标 URI 时应跳过该实例', async () => {
      const missingSession = createSession({
        id: 'session-missing',
        memoryInstanceId: 'instance-missing',
        config: createSessionConfig({ fusionPriority: 1 }),
      });
      const foundSession = createSession({
        id: 'session-found',
        memoryInstanceId: 'instance-found',
        config: createSessionConfig({ fusionPriority: 2 }),
      });

      tenantDb.select.mockReturnValueOnce(
        createSelectChain([missingSession, foundSession]),
      );
      pathResolverService.resolveUri.mockImplementation(async (instanceId: string) => {
        if (instanceId === 'instance-missing') {
          throw new NotFoundException('Memory path core://agent/name not found');
        }

        return createNode({ id: 'node-found', instanceId });
      });
      memoryVersionService.getLatestVersion.mockResolvedValue(
        createVersion({ id: 'version-found', nodeId: 'node-found', content: '可读内容' }),
      );

      await expect(
        service.readFromAll(
          [missingSession.id, foundSession.id],
          'core://agent/name',
        ),
      ).resolves.toEqual([
        {
          sessionId: 'session-found',
          memoryInstanceId: 'instance-found',
          fusionPriority: 2,
          role: 'readonly',
          nodeId: 'node-found',
          uri: 'core://agent/name',
          content: '可读内容',
        },
      ]);
    });

    it('空 sessionIds 应返回空数组', async () => {
      await expect(service.readFromAll([], 'core://agent/name')).resolves.toEqual([]);
      expect(tenantDb.select).not.toHaveBeenCalled();
    });

    it('相同 fusionPriority 时应按 sessionId 稳定排序', async () => {
      const sessionB = createSession({
        id: 'session-b',
        memoryInstanceId: 'instance-b',
        config: createSessionConfig({ fusionPriority: 2 }),
      });
      const sessionA = createSession({
        id: 'session-a',
        memoryInstanceId: 'instance-a',
        config: createSessionConfig({ fusionPriority: 2 }),
      });

      tenantDb.select.mockReturnValueOnce(createSelectChain([sessionB, sessionA]));
      pathResolverService.resolveUri.mockImplementation(async (instanceId: string) =>
        createNode({
          id: instanceId === 'instance-a' ? 'node-a' : 'node-b',
          instanceId,
        }),
      );
      memoryVersionService.getLatestVersion.mockImplementation(async (nodeId: string) =>
        createVersion({
          id: `${nodeId}-version`,
          nodeId,
          content: nodeId === 'node-a' ? 'A' : 'B',
        }),
      );

      const results = await service.readFromAll(['session-b', 'session-a'], 'core://agent/name');

      expect(results.map((result) => result.sessionId)).toEqual(['session-a', 'session-b']);
    });
  });

  describe('searchAll', () => {
    it('应按 priority × relevance 的加权分数混合排序', async () => {
      const lowPrioritySession = createSession({
        id: 'session-low',
        memoryInstanceId: 'instance-low',
        config: createSessionConfig({ fusionPriority: 4 }),
      });
      const highPrioritySession = createSession({
        id: 'session-high',
        memoryInstanceId: 'instance-high',
        config: createSessionConfig({ fusionPriority: 1 }),
      });

      tenantDb.select.mockReturnValueOnce(
        createSelectChain([lowPrioritySession, highPrioritySession]),
      );
      memorySearchService.search.mockImplementation(
        async (instanceId: string, options: { query: string; limit?: number }) => {
          if (instanceId === 'instance-high') {
            expect(options).toEqual({ query: 'agent', limit: 5 });

            return [
              {
                nodeId: 'node-high',
                content: '高优先级但相关性略低',
                relevanceScore: 0.45,
                snippet: '高优先级摘要',
                disclosureLevel: 0,
              },
            ];
          }

          return [
            {
              nodeId: 'node-low',
              content: '低优先级但相关性更高',
              relevanceScore: 0.9,
              snippet: '低优先级摘要',
              disclosureLevel: 0,
            },
          ];
        },
      );

      await expect(service.searchAll(['session-low', 'session-high'], 'agent', { limit: 5 }))
        .resolves.toEqual([
          {
            sessionId: 'session-high',
            memoryInstanceId: 'instance-high',
            fusionPriority: 1,
            weightedScore: 0.45,
            nodeId: 'node-high',
            content: '高优先级但相关性略低',
            relevanceScore: 0.45,
            snippet: '高优先级摘要',
            disclosureLevel: 0,
          },
          {
            sessionId: 'session-low',
            memoryInstanceId: 'instance-low',
            fusionPriority: 4,
            weightedScore: 0.225,
            nodeId: 'node-low',
            content: '低优先级但相关性更高',
            relevanceScore: 0.9,
            snippet: '低优先级摘要',
            disclosureLevel: 0,
          },
        ]);
    });

    it('空 sessionIds 应返回空搜索结果', async () => {
      await expect(service.searchAll([], 'agent')).resolves.toEqual([]);
      expect(tenantDb.select).not.toHaveBeenCalled();
    });
  });

  describe('writeToTarget', () => {
    it('应仅将写入路由到唯一 primary session', async () => {
      const primarySession = createSession({
        id: 'session-primary',
        role: 'primary',
        memoryInstanceId: 'instance-primary',
        config: createSessionConfig({ fusionPriority: 1 }),
      });

      tenantDb.select.mockReturnValueOnce(createSelectChain([primarySession]));
      pathResolverService.resolveUri.mockResolvedValue(
        createNode({ id: 'node-primary', instanceId: 'instance-primary' }),
      );
      memoryVersionService.getLatestVersion.mockResolvedValue(
        createVersion({ id: 'version-latest', nodeId: 'node-primary', content: '旧内容' }),
      );

      const appendedVersion = createVersion({
        id: 'version-appended',
        nodeId: 'node-primary',
        content: '旧内容\n新内容',
        version: 2,
      });
      memoryVersionService.appendVersion.mockResolvedValue(appendedVersion);

      await expect(
        service.writeToTarget(
          ['session-primary', 'session-readonly'],
          'core://data',
          '新内容',
        ),
      ).resolves.toEqual(appendedVersion);

      expect(pathResolverService.resolveUri).toHaveBeenCalledWith(
        'instance-primary',
        'core://data',
      );
      expect(memoryVersionService.appendVersion).toHaveBeenCalledWith(
        'node-primary',
        '新内容',
      );
      expect(memoryNodeService.createNode).not.toHaveBeenCalled();
    });

    it('目标 URI 不存在时应在 primary 实例创建节点、路径和首个版本', async () => {
      const primarySession = createSession({
        id: 'session-primary',
        role: 'primary',
        memoryInstanceId: 'instance-primary',
      });
      const createdNode = createNode({ id: 'node-created', instanceId: 'instance-primary' });
      const createdVersion = createVersion({
        id: 'version-created',
        nodeId: 'node-created',
        content: '初始化内容',
      });

      tenantDb.select.mockReturnValueOnce(createSelectChain([primarySession]));
      pathResolverService.resolveUri.mockRejectedValue(
        new NotFoundException('Memory path writer://drafts/ch1 not found'),
      );
      memoryNodeService.createNode.mockResolvedValue(createdNode);
      pathResolverService.createPath.mockResolvedValue(
        createPath({
          id: 'path-created',
          instanceId: 'instance-primary',
          domain: 'writer',
          pathString: 'drafts/ch1',
          nodeId: 'node-created',
        }),
      );
      memoryVersionService.createVersion.mockResolvedValue(createdVersion);

      await expect(
        service.writeToTarget(['session-primary'], 'writer://drafts/ch1', '初始化内容'),
      ).resolves.toEqual(createdVersion);

      expect(memoryNodeService.createNode).toHaveBeenCalledWith('instance-primary', {
        metadata: { uri: 'writer://drafts/ch1' },
      });
      expect(pathResolverService.createPath).toHaveBeenCalledWith(
        'instance-primary',
        'writer',
        'drafts/ch1',
        'node-created',
      );
      expect(memoryVersionService.createVersion).toHaveBeenCalledWith(
        'node-created',
        '初始化内容',
      );
    });

    it('已解析节点没有版本时应创建首个版本', async () => {
      const primarySession = createSession({
        id: 'session-primary',
        role: 'primary',
        memoryInstanceId: 'instance-primary',
      });
      const createdVersion = createVersion({
        id: 'version-first',
        nodeId: 'node-primary',
        content: '首个版本',
      });

      tenantDb.select.mockReturnValueOnce(createSelectChain([primarySession]));
      pathResolverService.resolveUri.mockResolvedValue(
        createNode({ id: 'node-primary', instanceId: 'instance-primary' }),
      );
      memoryVersionService.getLatestVersion.mockResolvedValue(null);
      memoryVersionService.createVersion.mockResolvedValue(createdVersion);

      await expect(
        service.writeToTarget(['session-primary'], 'core://draft', '首个版本'),
      ).resolves.toEqual(createdVersion);

      expect(memoryVersionService.createVersion).toHaveBeenCalledWith(
        'node-primary',
        '首个版本',
      );
      expect(memoryVersionService.appendVersion).not.toHaveBeenCalled();
    });

    it('resolveUri 的非 NotFoundException 错误应直接透传', async () => {
      const primarySession = createSession({
        id: 'session-primary',
        role: 'primary',
        memoryInstanceId: 'instance-primary',
      });
      const expectedError = new Error('storage unavailable');

      tenantDb.select.mockReturnValueOnce(createSelectChain([primarySession]));
      pathResolverService.resolveUri.mockRejectedValue(expectedError);

      await expect(
        service.writeToTarget(['session-primary'], 'core://draft', '新内容'),
      ).rejects.toBe(expectedError);
    });

    it('创建新路径时若 URI 非法应抛出 BadRequestException', async () => {
      const primarySession = createSession({
        id: 'session-primary',
        role: 'primary',
        memoryInstanceId: 'instance-primary',
      });

      tenantDb.select.mockReturnValueOnce(createSelectChain([primarySession]));
      pathResolverService.resolveUri.mockRejectedValue(
        new NotFoundException('Memory path invalid-uri not found'),
      );

      await expect(
        service.writeToTarget(['session-primary'], 'invalid-uri', '坏内容'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getWriteTarget', () => {
    it('空 sessionIds 时应抛出 BadRequestException', async () => {
      await expect(service.getWriteTarget([])).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(tenantDb.select).not.toHaveBeenCalled();
    });

    it('没有 primary session 时应抛出 BadRequestException', async () => {
      tenantDb.select.mockReturnValueOnce(createSelectChain([]));

      await expect(service.getWriteTarget(['session-a', 'session-b'])).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('存在多个 primary session 时应抛出 BadRequestException', async () => {
      tenantDb.select.mockReturnValueOnce(
        createSelectChain([
          createSession({ id: 'primary-1', role: 'primary' }),
          createSession({ id: 'primary-2', role: 'primary' }),
        ]),
      );

      await expect(service.getWriteTarget(['primary-1', 'primary-2'])).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('bootAll', () => {
    it('应按优先级合并 boot sequence，并让高优先级 domain 覆盖低优先级 domain', async () => {
      const lowPrioritySession = createSession({
        id: 'session-low',
        memoryInstanceId: 'instance-low',
        config: createSessionConfig({ fusionPriority: 3 }),
      });
      const highPrioritySession = createSession({
        id: 'session-high',
        memoryInstanceId: 'instance-high',
        config: createSessionConfig({ fusionPriority: 1 }),
      });

      tenantDb.select.mockReturnValueOnce(
        createSelectChain([lowPrioritySession, highPrioritySession]),
      );
      bootProtocolService.executeBootSequence.mockImplementation(
        async (instanceId: string) => {
          if (instanceId === 'instance-high') {
            return createBootSequence({
              systemPrompt: 'Prompt H',
              boot: 'Boot H',
              index: [
                createPath({ id: 'path-core-h', instanceId, domain: 'core', pathString: 'agent' }),
                createPath({ id: 'path-notes-h', instanceId, domain: 'notes', pathString: 'scratchpad' }),
              ],
              glossary: [createGlossaryKeyword({ id: 'kw-shared', instanceId, keyword: 'identity' })],
            });
          }

          return createBootSequence({
            systemPrompt: 'Prompt L',
            boot: 'Boot L',
            index: [
              createPath({ id: 'path-core-l', instanceId, domain: 'core', pathString: 'fallback' }),
              createPath({ id: 'path-writer-l', instanceId, domain: 'writer', pathString: 'chapter_1' }),
            ],
            glossary: [
              createGlossaryKeyword({ id: 'kw-shared', instanceId, keyword: 'identity' }),
              createGlossaryKeyword({ id: 'kw-writer', instanceId, keyword: 'chapter' }),
            ],
          });
        },
      );

      await expect(service.bootAll(['session-low', 'session-high'])).resolves.toEqual({
        systemPrompt: 'Prompt H\n\nPrompt L',
        boot: 'Boot H\n\nBoot L',
        index: [
          createPath({
            id: 'path-core-h',
            instanceId: 'instance-high',
            domain: 'core',
            pathString: 'agent',
          }),
          createPath({
            id: 'path-notes-h',
            instanceId: 'instance-high',
            domain: 'notes',
            pathString: 'scratchpad',
          }),
          createPath({
            id: 'path-writer-l',
            instanceId: 'instance-low',
            domain: 'writer',
            pathString: 'chapter_1',
          }),
        ],
        glossary: [
          createGlossaryKeyword({
            id: 'kw-shared',
            instanceId: 'instance-high',
            keyword: 'identity',
          }),
          createGlossaryKeyword({
            id: 'kw-writer',
            instanceId: 'instance-low',
            keyword: 'chapter',
          }),
        ],
      });
    });

    it('单个 active session 时应走 fast path 返回原始 boot sequence', async () => {
      const session = createSession({
        id: 'session-only',
        memoryInstanceId: 'instance-only',
        role: 'primary',
      });
      const sequence = createBootSequence({ systemPrompt: 'Solo', boot: null, index: [] });

      tenantDb.select.mockReturnValueOnce(createSelectChain([session]));
      bootProtocolService.executeBootSequence.mockResolvedValue(sequence);

      await expect(service.bootAll(['session-only'])).resolves.toEqual(sequence);
    });

    it('空 sessionIds 应返回空 boot 上下文', async () => {
      await expect(service.bootAll([])).resolves.toEqual({
        systemPrompt: '',
        boot: null,
        index: [],
        glossary: [],
      });
      expect(tenantDb.select).not.toHaveBeenCalled();
    });
  });

  describe('tenant scoped queries', () => {
    it('session 查询应始终通过 getTenantDb(this.db)', async () => {
      tenantDb.select.mockReturnValueOnce(createSelectChain([]));

      await service.searchAll(['session-a'], 'agent');

      expect(mocks.getTenantDb).toHaveBeenCalledWith(rawDb);
      expect(tenantDb.select).toHaveBeenCalledWith();
      expect(mocks.operators.inArray).toHaveBeenCalledWith(memorySessions.id, ['session-a']);
      expect(mocks.operators.eq).toHaveBeenCalledWith(memorySessions.status, 'active');
    });
  });
});
