import { createHash } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const drizzleMocks = vi.hoisted(() => ({
  eq: vi.fn((left: unknown, right: unknown) => ({
    type: 'eq',
    left,
    right,
  })),
  and: vi.fn((...conditions: unknown[]) => ({
    type: 'and',
    conditions,
  })),
}));

const mcpMocks = vi.hoisted(() => {
  const mockClient = {
    connect: vi.fn(),
    listTools: vi.fn(),
    callTool: vi.fn(),
    getServerVersion: vi.fn(),
    close: vi.fn(),
  };

  const stdioTransport = {
    close: vi.fn(),
  };

  const sseTransport = {
    close: vi.fn(),
  };

  const streamableHttpTransport = {
    terminateSession: vi.fn(),
    close: vi.fn(),
  };

  return {
    mockClient,
    stdioTransport,
    sseTransport,
    streamableHttpTransport,
    Client: vi.fn(function MockClient() {
      return mockClient;
    }),
    StdioClientTransport: vi.fn(function MockStdioClientTransport() {
      return stdioTransport;
    }),
    SSEClientTransport: vi.fn(function MockSSEClientTransport() {
      return sseTransport;
    }),
    StreamableHTTPClientTransport: vi.fn(
      function MockStreamableHTTPClientTransport() {
        return streamableHttpTransport;
      },
    ),
  };
});

vi.mock('drizzle-orm', async () => {
  const actual =
    await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm');

  return {
    ...actual,
    eq: drizzleMocks.eq,
    and: drizzleMocks.and,
  };
});

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: mcpMocks.Client,
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: mcpMocks.StdioClientTransport,
}));

vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({
  SSEClientTransport: mcpMocks.SSEClientTransport,
}));

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: mcpMocks.StreamableHTTPClientTransport,
}));

import { DRIZZLE } from '../../../database/database.module';
import {
  mcpServerConfigs,
  organizations,
  toolDefinitions,
} from '../../../database/schema';
import { EncryptionService } from '../../api-key/encryption.service';
import type { EncryptedData } from '../../api-key/encryption.service';
import {
  McpConnectionFailedException,
  McpConnectionTimeoutException,
  McpToolDeactivationNotAllowedException,
  McpToolNotFoundException,
} from '../mcp.exceptions';
import { McpService } from '../mcp.service';

const NOW = new Date('2025-01-01T00:00:00Z');
const TENANT_ID = '00000000-0000-0000-0000-000000000010';
const ORG_ID = '00000000-0000-0000-0000-000000000020';
const USER_ID = '00000000-0000-0000-0000-000000000001';
const CONFIG_ID = '00000000-0000-0000-0000-000000000100';
const TOOL_ID = '00000000-0000-0000-0000-000000000200';
const NEW_TOOL_ID = '00000000-0000-0000-0000-000000000202';
const BUILTIN_TOOL_ID = '00000000-0000-0000-0000-000000000201';

const MOCK_ENCRYPTED: EncryptedData = {
  encryptedKey: Buffer.from('ek'),
  encryptedDek: Buffer.from('ed'),
  iv: Buffer.from('iv'),
  authTag: Buffer.from('at'),
};

function createSha256Fingerprint(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function createSelectChain(result: unknown) {
  const where = vi.fn().mockResolvedValue(result);
  const from = vi.fn().mockReturnValue({ where });
  return { from, where };
}

function createInsertChain(result: unknown) {
  const returning = vi.fn().mockResolvedValue(result);
  const values = vi.fn().mockReturnValue({ returning });
  return { values, returning };
}

function createRejectingSelectChain(error: unknown) {
  const where = vi.fn().mockRejectedValue(error);
  const from = vi.fn().mockReturnValue({ where });
  return { from, where };
}

function createStdioConnection(
  overrides: Partial<{
    command: string;
    args: string[];
    env: Record<string, string>;
  }> = {},
) {
  return {
    transportType: 'stdio' as const,
    command: 'node',
    args: ['server.js'],
    env: {
      MCP_TOKEN: 'secret-token',
    },
    ...overrides,
  };
}

function createSseConnection(
  overrides: Partial<{
    url: string;
    headers: Record<string, string>;
  }> = {},
) {
  return {
    transportType: 'sse' as const,
    url: 'https://mcp.example.com/sse',
    headers: {
      Authorization: 'Bearer sse-token',
    },
    ...overrides,
  };
}

function createStreamableHttpConnection(
  overrides: Partial<{
    url: string;
    headers: Record<string, string>;
  }> = {},
) {
  return {
    transportType: 'streamable_http' as const,
    url: 'https://mcp.example.com/http',
    headers: {
      Authorization: 'Bearer http-token',
      'X-Workspace': 'workspace-1',
    },
    ...overrides,
  };
}

function createDiscoveredTool(overrides: Record<string, unknown> = {}) {
  return {
    name: 'search-docs',
    title: '搜索文档',
    description: '搜索知识库文档',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '查询关键词',
        },
        limit: {
          type: 'integer',
          description: '返回数量',
        },
        enabled: {
          type: 'boolean',
          description: '是否启用扩展搜索',
        },
        payload: {
          type: 'object',
          description: '结构化负载',
        },
        thumbnail: {
          type: 'string',
          contentMediaType: 'image/png',
          description: '缩略图',
        },
        clip: {
          type: 'string',
          contentMediaType: 'audio/mpeg',
          description: '音频片段',
        },
        tags: {
          type: 'array',
          description: '标签列表',
        },
        modelConfig: {
          type: 'string',
          description: '模型标识',
        },
        selectedTool: {
          type: 'string',
          description: '待调用工具',
        },
        sandboxSession: {
          type: 'string',
          description: '沙箱 runtime 会话',
        },
        knowledgeBaseId: {
          type: 'string',
          description: '知识库标识',
        },
      },
      required: ['query', 'enabled'],
    },
    annotations: {
      category: 'knowledge',
    },
    ...overrides,
  };
}

function createToolDefinitionRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: TOOL_ID,
    tenantId: TENANT_ID,
    organizationId: ORG_ID,
    mcpServerConfigId: CONFIG_ID,
    source: 'mcp' as const,
    name: 'search-docs',
    title: '搜索文档',
    description: '搜索知识库文档',
    inputSchema: {
      type: 'object',
    },
    annotations: {
      category: 'knowledge',
    },
    portMappingMetadata: null,
    isActive: true,
    importedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function createMcpServerConfigRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: CONFIG_ID,
    tenantId: TENANT_ID,
    organizationId: ORG_ID,
    createdBy: USER_ID,
    name: '知识库服务器',
    description: '用于导入知识库工具',
    transportType: 'streamable_http' as const,
    command: null,
    args: null,
    url: 'https://mcp.example.com/http',
    encryptedData: MOCK_ENCRYPTED.encryptedKey,
    encryptedDek: MOCK_ENCRYPTED.encryptedDek,
    iv: MOCK_ENCRYPTED.iv,
    authTag: MOCK_ENCRYPTED.authTag,
    status: 'active' as const,
    lastTestedAt: NOW,
    connectionFingerprint: createSha256Fingerprint(
      'streamable_http|https://mcp.example.com/http|authorization=Bearer http-token&x-workspace=workspace-1',
    ),
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

type TransactionMock = {
  insert: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

type TransactionCallback = (tx: TransactionMock) => Promise<unknown>;

function createUpdateChain(result: unknown) {
  const returning = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });

  return {
    set,
    where,
    returning,
  };
}

function getCallableMethod<TArgs extends unknown[], TResult>(
  target: object,
  methodName: string,
): (...args: TArgs) => TResult {
  const method = Reflect.get(target, methodName);
  expect(typeof method).toBe('function');

  if (typeof method !== 'function') {
    expect.unreachable(`预期 ${methodName} 已定义为可调用方法`);
  }

  return method.bind(target) as (...args: TArgs) => TResult;
}

describe('McpService', () => {
  let service: McpService;
  let encryptionService: {
    encrypt: ReturnType<typeof vi.fn>;
    decrypt: ReturnType<typeof vi.fn>;
  };
  let db: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    encryptionService = {
      encrypt: vi.fn().mockReturnValue(MOCK_ENCRYPTED),
      decrypt: vi.fn(),
    };

    db = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      transaction: vi.fn(),
    };

    mcpMocks.mockClient.getServerVersion.mockReturnValue({
      name: 'AgentLoom MCP',
      version: '1.0.0',
      protocolVersion: '2024-11-05',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        McpService,
        { provide: DRIZZLE, useValue: db },
        { provide: EncryptionService, useValue: encryptionService },
      ],
    }).compile();

    service = module.get<McpService>(McpService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('testConnection', () => {
    it('应当通过 stdio 连接并返回服务器信息', async () => {
      mcpMocks.mockClient.connect.mockResolvedValue(undefined);

      const result = await service.testConnection({
        connection: createStdioConnection(),
      });

      expect(result).toEqual({
        success: true,
        serverInfo: {
          name: 'AgentLoom MCP',
          version: '1.0.0',
          protocolVersion: '2024-11-05',
        },
      });
      expect(mcpMocks.Client).toHaveBeenCalledWith({
        name: 'agentloom',
        version: '1.0.0',
      });
      expect(mcpMocks.StdioClientTransport).toHaveBeenCalledWith({
        command: 'node',
        args: ['server.js'],
        env: {
          MCP_TOKEN: 'secret-token',
        },
      });
      expect(mcpMocks.mockClient.connect).toHaveBeenCalledWith(
        mcpMocks.stdioTransport,
      );
      expect(mcpMocks.mockClient.close).toHaveBeenCalledOnce();
      expect(mcpMocks.stdioTransport.close).toHaveBeenCalledOnce();
    });

    it('应当通过 SSE 传输创建连接', async () => {
      mcpMocks.mockClient.connect.mockResolvedValue(undefined);

      const result = await service.testConnection({
        connection: createSseConnection(),
      });

      expect(result.success).toBe(true);
      expect(mcpMocks.SSEClientTransport).toHaveBeenCalledOnce();

      const sseCalls = mcpMocks.SSEClientTransport.mock
        .calls as unknown as Array<
        [URL, { requestInit: { headers: Record<string, string> } }]
      >;
      const [url, options] = sseCalls[0];
      expect(url).toBeInstanceOf(URL);
      expect(url.toString()).toBe('https://mcp.example.com/sse');
      expect(options).toEqual({
        requestInit: {
          headers: {
            Authorization: 'Bearer sse-token',
          },
        },
      });
      expect(mcpMocks.mockClient.connect).toHaveBeenCalledWith(
        mcpMocks.sseTransport,
      );
    });

    it('应当通过 Streamable HTTP 传输创建连接', async () => {
      mcpMocks.mockClient.connect.mockResolvedValue(undefined);

      const result = await service.testConnection({
        connection: createStreamableHttpConnection(),
      });

      expect(result.success).toBe(true);
      expect(mcpMocks.StreamableHTTPClientTransport).toHaveBeenCalledOnce();

      const streamableHttpCalls = mcpMocks.StreamableHTTPClientTransport.mock
        .calls as unknown as Array<
        [URL, { requestInit: { headers: Record<string, string> } }]
      >;
      const [url, options] = streamableHttpCalls[0];
      expect(url).toBeInstanceOf(URL);
      expect(url.toString()).toBe('https://mcp.example.com/http');
      expect(options).toEqual({
        requestInit: {
          headers: {
            Authorization: 'Bearer http-token',
            'X-Workspace': 'workspace-1',
          },
        },
      });
      expect(mcpMocks.mockClient.connect).toHaveBeenCalledWith(
        mcpMocks.streamableHttpTransport,
      );
    });

    it('应当在连接失败时抛出 McpConnectionFailedException', async () => {
      mcpMocks.mockClient.connect.mockRejectedValue(new Error('ECONNREFUSED'));

      const promise = service.testConnection({
        connection: createStdioConnection(),
      });

      await promise.catch((error: unknown) => {
        expect(error).toBeInstanceOf(McpConnectionFailedException);
        expect(error).toMatchObject({
          detail: expect.stringContaining('ECONNREFUSED'),
        });
      });
      expect(mcpMocks.mockClient.close).toHaveBeenCalledOnce();
      expect(mcpMocks.stdioTransport.close).toHaveBeenCalledOnce();
    });

    it('应当在连接超时时抛出 McpConnectionTimeoutException', async () => {
      mcpMocks.mockClient.connect.mockImplementation(
        () => new Promise(() => undefined),
      );

      const promise = service.testConnection({
        connection: createStdioConnection(),
      });
      const assertion = promise.catch((error: unknown) => {
        expect(error).toBeInstanceOf(McpConnectionTimeoutException);
        expect(error).toMatchObject({
          detail: '连接 MCP 服务器超时 (30s)',
        });
      });

      await vi.advanceTimersByTimeAsync(30_000);

      await assertion;
      expect(mcpMocks.mockClient.close).toHaveBeenCalledOnce();
      expect(mcpMocks.stdioTransport.close).toHaveBeenCalledOnce();
    });
  });

  describe('discoverTools', () => {
    it('应当返回发现到的工具列表与服务器信息', async () => {
      const tool = createDiscoveredTool();

      mcpMocks.mockClient.connect.mockResolvedValue(undefined);
      mcpMocks.mockClient.listTools.mockResolvedValue({
        tools: [tool],
      });
      mcpMocks.mockClient.getServerVersion.mockReturnValue({
        name: 'Knowledge MCP',
        version: '2.1.0',
        protocolVersion: '2024-11-05',
      });

      const result = await service.discoverTools({
        connection: createStdioConnection(),
      });

      expect(result).toEqual({
        tools: [
          {
            name: 'search-docs',
            title: '搜索文档',
            description: '搜索知识库文档',
            inputSchema: tool.inputSchema,
            annotations: {
              category: 'knowledge',
            },
          },
        ],
        serverInfo: {
          name: 'Knowledge MCP',
          version: '2.1.0',
        },
      });
      expect(mcpMocks.mockClient.listTools).toHaveBeenCalledOnce();
      expect(mcpMocks.mockClient.close).toHaveBeenCalledOnce();
      expect(mcpMocks.stdioTransport.close).toHaveBeenCalledOnce();
    });

    it('应当在工具发现失败时映射为 McpConnectionFailedException', async () => {
      mcpMocks.mockClient.connect.mockResolvedValue(undefined);
      mcpMocks.mockClient.listTools.mockRejectedValue(
        new Error('列出工具失败'),
      );

      const promise = service.discoverTools({
        connection: createStdioConnection(),
      });

      await promise.catch((error: unknown) => {
        expect(error).toBeInstanceOf(McpConnectionFailedException);
        expect(error).toMatchObject({
          detail: 'MCP 工具发现失败: 列出工具失败',
        });
      });
      expect(mcpMocks.mockClient.close).toHaveBeenCalledOnce();
      expect(mcpMocks.stdioTransport.close).toHaveBeenCalledOnce();
    });
  });

  describe('runtime facade', () => {
    it('应当返回运行时 MCP 工具发现结果', async () => {
      const tool = createDiscoveredTool();

      mcpMocks.mockClient.connect.mockResolvedValue(undefined);
      mcpMocks.mockClient.listTools.mockResolvedValue({
        tools: [tool],
      });

      const result = await service.discoverRuntimeTools(createStdioConnection());

      expect(result).toEqual([
        {
          name: 'search-docs',
          title: '搜索文档',
          description: '搜索知识库文档',
          inputSchema: tool.inputSchema,
          annotations: {
            category: 'knowledge',
          },
        },
      ]);
      expect(mcpMocks.mockClient.listTools).toHaveBeenCalledOnce();
      expect(mcpMocks.mockClient.close).toHaveBeenCalledOnce();
      expect(mcpMocks.stdioTransport.close).toHaveBeenCalledOnce();
    });

    it('应当在运行时调用 MCP 工具后关闭 streamable_http 会话', async () => {
      mcpMocks.mockClient.connect.mockResolvedValue(undefined);
      mcpMocks.mockClient.callTool.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: 'ok',
          },
        ],
      });

      const result = await service.callRuntimeTool(
        createStreamableHttpConnection(),
        'search-docs',
        {
          query: 'AgentLoom',
        },
      );

      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: 'ok',
          },
        ],
      });
      expect(mcpMocks.mockClient.callTool).toHaveBeenCalledWith({
        name: 'search-docs',
        arguments: {
          query: 'AgentLoom',
        },
      });
      expect(mcpMocks.streamableHttpTransport.terminateSession).toHaveBeenCalledOnce();
      expect(mcpMocks.mockClient.close).toHaveBeenCalledOnce();
      expect(mcpMocks.streamableHttpTransport.close).toHaveBeenCalledOnce();
    });
  });

  describe('testSavedConfigConnection', () => {
    it('应当使用已保存配置测试连接', async () => {
      const testSavedConfigConnection = getCallableMethod<
        [mcpServerConfigId: string, tenantId: string],
        Promise<unknown>
      >(service, 'testSavedConfigConnection');

      db.select.mockReturnValueOnce(
        createSelectChain([createMcpServerConfigRecord()]),
      );
      encryptionService.decrypt.mockReturnValue(
        JSON.stringify({
          Authorization: 'Bearer http-token',
          'X-Workspace': 'workspace-1',
        }),
      );
      mcpMocks.mockClient.connect.mockResolvedValue(undefined);
      mcpMocks.mockClient.getServerVersion.mockReturnValue({
        name: 'Knowledge MCP',
        version: '2.1.0',
        protocolVersion: '2025-11-25',
      });

      const result = await testSavedConfigConnection(CONFIG_ID, TENANT_ID);

      expect(result).toEqual({
        success: true,
        serverInfo: {
          name: 'Knowledge MCP',
          version: '2.1.0',
          protocolVersion: '2025-11-25',
        },
      });
      expect(mcpMocks.StreamableHTTPClientTransport).toHaveBeenCalledWith(
        new URL('https://mcp.example.com/http'),
        {
          requestInit: {
            headers: {
              Authorization: 'Bearer http-token',
              'X-Workspace': 'workspace-1',
            },
          },
        },
      );
    });
  });

  describe('importTools', () => {
    it('应当在事务中创建配置并导入指定工具', async () => {
      const tool = createDiscoveredTool();
      const ignoredTool = createDiscoveredTool({
        name: 'ignored-tool',
        title: '忽略工具',
      });

      mcpMocks.mockClient.connect.mockResolvedValue(undefined);
      mcpMocks.mockClient.listTools
        .mockResolvedValueOnce({
          tools: [tool],
          nextCursor: 'page-2',
        })
        .mockResolvedValueOnce({
          tools: [ignoredTool],
        });

      const orgChain = createSelectChain([{ id: ORG_ID }]);
      db.select.mockReturnValueOnce(orgChain);

      const tx: TransactionMock = {
        insert: vi.fn(),
        select: vi.fn(),
        update: vi.fn(),
      };

      const configInsertChain = createInsertChain([{ id: CONFIG_ID }]);
      const toolInsertChain = createInsertChain([
        {
          id: TOOL_ID,
          name: 'search-docs',
          title: '搜索文档',
          description: '搜索知识库文档',
        },
      ]);

      tx.insert
        .mockReturnValueOnce(configInsertChain)
        .mockReturnValueOnce(toolInsertChain);

      db.transaction.mockImplementationOnce(
        async (callback: TransactionCallback) => callback(tx),
      );

      const result = await service.importTools(
        {
          serverName: '知识库服务器',
          serverDescription: '用于导入知识库工具',
          connection: createStreamableHttpConnection(),
          conflictStrategy: 'skip',
          toolNames: ['search-docs'],
        },
        USER_ID,
        TENANT_ID,
      );

      expect(encryptionService.encrypt).toHaveBeenCalledWith(
        JSON.stringify({
          Authorization: 'Bearer http-token',
          'X-Workspace': 'workspace-1',
        }),
      );
      expect(drizzleMocks.eq).toHaveBeenCalledWith(
        organizations.tenantId,
        TENANT_ID,
      );
      expect(db.transaction).toHaveBeenCalledOnce();
      expect(tx.insert).toHaveBeenNthCalledWith(1, mcpServerConfigs);
      expect(tx.insert).toHaveBeenNthCalledWith(2, toolDefinitions);
      expect(configInsertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          organizationId: ORG_ID,
          createdBy: USER_ID,
          name: '知识库服务器',
          description: '用于导入知识库工具',
          transportType: 'streamable_http',
          command: null,
          args: null,
          url: 'https://mcp.example.com/http',
          encryptedData: MOCK_ENCRYPTED.encryptedKey,
          encryptedDek: MOCK_ENCRYPTED.encryptedDek,
          iv: MOCK_ENCRYPTED.iv,
          authTag: MOCK_ENCRYPTED.authTag,
          connectionFingerprint: createSha256Fingerprint(
            'streamable_http|https://mcp.example.com/http|authorization=Bearer http-token&x-workspace=workspace-1',
          ),
          status: 'active',
          lastTestedAt: expect.any(Date),
        }),
      );

      const expectedPortMappingMetadata = {
        inputs: [
          {
            name: 'query',
            dataType: 'text',
            description: '查询关键词',
            required: true,
          },
          {
            name: 'limit',
            dataType: 'json',
            description: '返回数量',
            required: false,
          },
          {
            name: 'enabled',
            dataType: 'json',
            description: '是否启用扩展搜索',
            required: true,
          },
          {
            name: 'payload',
            dataType: 'json',
            description: '结构化负载',
            required: false,
          },
          {
            name: 'thumbnail',
            dataType: 'image',
            description: '缩略图',
            required: false,
          },
          {
            name: 'clip',
            dataType: 'audio',
            description: '音频片段',
            required: false,
          },
          {
            name: 'tags',
            dataType: 'json',
            description: '标签列表',
            required: false,
          },
          {
            name: 'modelConfig',
            dataType: 'model',
            description: '模型标识',
            required: false,
          },
          {
            name: 'selectedTool',
            dataType: 'tool',
            description: '待调用工具',
            required: false,
          },
          {
            name: 'sandboxSession',
            dataType: 'sandbox',
            description: '沙箱 runtime 会话',
            required: false,
          },
          {
            name: 'knowledgeBaseId',
            dataType: 'knowledge',
            description: '知识库标识',
            required: false,
          },
        ],
        outputs: [
          {
            name: 'result',
            dataType: 'text',
            description: '工具执行结果',
          },
        ],
      };

      expect(toolInsertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          organizationId: ORG_ID,
          mcpServerConfigId: CONFIG_ID,
          source: 'mcp',
          name: 'search-docs',
          title: '搜索文档',
          description: '搜索知识库文档',
          inputSchema: tool.inputSchema,
          annotations: {
            category: 'knowledge',
          },
          isActive: true,
          importedAt: expect.any(Date),
          portMappingMetadata: expectedPortMappingMetadata,
        }),
      );
      expect(result).toEqual({
        mcpServerConfigId: CONFIG_ID,
        summary: {
          total: 1,
          imported: 1,
          overwritten: 0,
          skipped: 0,
          failed: 0,
        },
        results: [
          {
            toolDefinitionId: TOOL_ID,
            toolName: 'search-docs',
            status: 'imported',
            title: '搜索文档',
            description: '搜索知识库文档',
            portMappingMetadata: expectedPortMappingMetadata,
          },
        ],
      });
    });

    it('应当复用已保存配置并返回 imported/skipped/failed 混合回执', async () => {
      const duplicateTool = createDiscoveredTool();
      const newTool = createDiscoveredTool({
        name: 'summarize-docs',
        title: '总结文档',
        description: '总结知识库文档',
      });

      mcpMocks.mockClient.connect.mockResolvedValue(undefined);
      mcpMocks.mockClient.listTools.mockResolvedValue({
        tools: [duplicateTool, newTool],
      });

      db.select
        .mockReturnValueOnce(createSelectChain([{ id: ORG_ID }]))
        .mockReturnValueOnce(createSelectChain([createMcpServerConfigRecord()]))
        .mockReturnValueOnce(createSelectChain([createToolDefinitionRecord()]));

      const tx: TransactionMock = {
        insert: vi.fn(),
        select: vi.fn(),
        update: vi.fn(),
      };
      const toolInsertChain = createInsertChain([
        {
          id: NEW_TOOL_ID,
          name: 'summarize-docs',
          title: '总结文档',
          description: '总结知识库文档',
        },
      ]);
      tx.insert.mockReturnValueOnce(toolInsertChain);

      db.transaction.mockImplementationOnce(
        async (callback: TransactionCallback) => callback(tx),
      );

      const result = await service.importTools(
        {
          serverName: '知识库服务器',
          connection: createStreamableHttpConnection(),
          conflictStrategy: 'skip',
          toolNames: ['search-docs', 'summarize-docs', 'missing-tool'],
        },
        USER_ID,
        TENANT_ID,
      );

      expect(tx.insert).toHaveBeenCalledTimes(1);
      expect(tx.insert).toHaveBeenCalledWith(toolDefinitions);
      expect(tx.insert).not.toHaveBeenCalledWith(mcpServerConfigs);
      expect(result).toMatchObject({
        mcpServerConfigId: CONFIG_ID,
        summary: {
          total: 3,
          imported: 1,
          overwritten: 0,
          skipped: 1,
          failed: 1,
        },
      });
      expect(result.results).toHaveLength(3);
      expect(result.results[0]).toMatchObject({
        toolDefinitionId: TOOL_ID,
        toolName: 'search-docs',
        status: 'skipped',
        reasonCode: 'duplicate_tool',
      });
      expect(result.results[1]).toMatchObject({
        toolDefinitionId: NEW_TOOL_ID,
        toolName: 'summarize-docs',
        status: 'imported',
        title: '总结文档',
      });
      expect(result.results[1].portMappingMetadata).toEqual(
        expect.objectContaining({
          inputs: expect.any(Array),
          outputs: expect.any(Array),
        }),
      );
      expect(result.results[2]).toMatchObject({
        toolName: 'missing-tool',
        status: 'failed',
        reasonCode: 'tool_not_found',
      });
    });

    it('应当复用历史空 fingerprint 配置并回填哈希', async () => {
      const tool = createDiscoveredTool();
      const legacyFingerprint = createSha256Fingerprint(
        'streamable_http|https://mcp.example.com/http|authorization=Bearer http-token&x-workspace=workspace-1',
      );
      const legacyConfig = createMcpServerConfigRecord({
        connectionFingerprint: null,
      });

      mcpMocks.mockClient.connect.mockResolvedValue(undefined);
      mcpMocks.mockClient.listTools.mockResolvedValue({
        tools: [tool],
      });
      encryptionService.decrypt.mockReturnValue(
        JSON.stringify({
          Authorization: 'Bearer http-token',
          'X-Workspace': 'workspace-1',
        }),
      );

      db.select
        .mockReturnValueOnce(createSelectChain([{ id: ORG_ID }]))
        .mockReturnValueOnce(createSelectChain([]))
        .mockReturnValueOnce(createSelectChain([legacyConfig]))
        .mockReturnValueOnce(createSelectChain([]));

      const configUpdateChain = createUpdateChain([
        createMcpServerConfigRecord({
          id: CONFIG_ID,
          connectionFingerprint: legacyFingerprint,
        }),
      ]);
      db.update.mockReturnValueOnce(configUpdateChain);

      const tx: TransactionMock = {
        insert: vi.fn(),
        select: vi.fn(),
        update: vi.fn(),
      };
      const toolInsertChain = createInsertChain([
        {
          id: TOOL_ID,
          name: 'search-docs',
          title: '搜索文档',
          description: '搜索知识库文档',
        },
      ]);
      tx.insert.mockReturnValueOnce(toolInsertChain);

      db.transaction.mockImplementationOnce(
        async (callback: TransactionCallback) => callback(tx),
      );

      const result = await service.importTools(
        {
          serverName: '知识库服务器',
          connection: createStreamableHttpConnection(),
          conflictStrategy: 'skip',
          toolNames: ['search-docs'],
        },
        USER_ID,
        TENANT_ID,
      );

      expect(db.update).toHaveBeenCalledWith(mcpServerConfigs);
      expect(configUpdateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionFingerprint: legacyFingerprint,
          updatedAt: expect.any(Date),
        }),
      );
      expect(tx.insert).toHaveBeenCalledTimes(1);
      expect(tx.insert).toHaveBeenCalledWith(toolDefinitions);
      expect(tx.insert).not.toHaveBeenCalledWith(mcpServerConfigs);
      expect(result).toMatchObject({
        mcpServerConfigId: CONFIG_ID,
        summary: {
          total: 1,
          imported: 1,
          overwritten: 0,
          skipped: 0,
          failed: 0,
        },
      });
    });

    it('应当在 overwrite 策略下原位更新现有工具并保留 toolDefinitionId', async () => {
      const discoveredTool = createDiscoveredTool({
        title: '搜索文档（新版）',
        description: '覆盖后的知识库文档搜索',
      });

      mcpMocks.mockClient.connect.mockResolvedValue(undefined);
      mcpMocks.mockClient.listTools.mockResolvedValue({
        tools: [discoveredTool],
      });

      db.select
        .mockReturnValueOnce(createSelectChain([{ id: ORG_ID }]))
        .mockReturnValueOnce(createSelectChain([createMcpServerConfigRecord()]))
        .mockReturnValueOnce(createSelectChain([createToolDefinitionRecord()]));

      const tx: TransactionMock = {
        insert: vi.fn(),
        select: vi.fn(),
        update: vi.fn(),
      };
      const toolUpdateChain = createUpdateChain([
        {
          id: TOOL_ID,
          name: 'search-docs',
          title: '搜索文档（新版）',
          description: '覆盖后的知识库文档搜索',
        },
      ]);
      tx.update.mockReturnValueOnce(toolUpdateChain);

      db.transaction.mockImplementationOnce(
        async (callback: TransactionCallback) => callback(tx),
      );

      const result = await service.importTools(
        {
          serverName: '知识库服务器',
          connection: createStreamableHttpConnection(),
          conflictStrategy: 'overwrite',
          toolNames: ['search-docs'],
        },
        USER_ID,
        TENANT_ID,
      );

      expect(tx.insert).not.toHaveBeenCalledWith(toolDefinitions);
      expect(tx.update).toHaveBeenCalledWith(toolDefinitions);
      expect(toolUpdateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '搜索文档（新版）',
          description: '覆盖后的知识库文档搜索',
          isActive: true,
          updatedAt: expect.any(Date),
        }),
      );
      expect(result).toMatchObject({
        mcpServerConfigId: CONFIG_ID,
        summary: {
          total: 1,
          imported: 0,
          overwritten: 1,
          skipped: 0,
          failed: 0,
        },
      });
      expect(result.results).toEqual([
        expect.objectContaining({
          toolDefinitionId: TOOL_ID,
          toolName: 'search-docs',
          status: 'overwritten',
          title: '搜索文档（新版）',
        }),
      ]);
    });

    it('应当在未找到组织时抛出错误并停止事务写入', async () => {
      mcpMocks.mockClient.connect.mockResolvedValue(undefined);
      mcpMocks.mockClient.listTools.mockResolvedValue({
        tools: [createDiscoveredTool()],
      });

      const orgChain = createSelectChain([]);
      db.select.mockReturnValueOnce(orgChain);

      const promise = service.importTools(
        {
          serverName: '知识库服务器',
          connection: createStdioConnection(),
          conflictStrategy: 'skip',
          toolNames: ['search-docs'],
        },
        USER_ID,
        TENANT_ID,
      );

      await promise.catch((error: unknown) => {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe(
          `租户 ${TENANT_ID} 对应的组织未找到`,
        );
      });
      expect(db.transaction).not.toHaveBeenCalled();
    });
  });

  describe('rediscoverTools', () => {
    it('应当使用已保存配置重新发现工具', async () => {
      const rediscoverTools = getCallableMethod<
        [mcpServerConfigId: string, tenantId: string],
        Promise<unknown>
      >(service, 'rediscoverTools');

      db.select.mockReturnValueOnce(
        createSelectChain([createMcpServerConfigRecord()]),
      );
      encryptionService.decrypt.mockReturnValue(
        JSON.stringify({
          Authorization: 'Bearer http-token',
          'X-Workspace': 'workspace-1',
        }),
      );
      mcpMocks.mockClient.connect.mockResolvedValue(undefined);
      mcpMocks.mockClient.listTools.mockResolvedValue({
        tools: [createDiscoveredTool()],
      });
      mcpMocks.mockClient.getServerVersion.mockReturnValue({
        name: 'Knowledge MCP',
        version: '2.1.0',
        protocolVersion: '2024-11-05',
      });

      const result = await rediscoverTools(CONFIG_ID, TENANT_ID);

      expect(encryptionService.decrypt).toHaveBeenCalledWith({
        encryptedKey: MOCK_ENCRYPTED.encryptedKey,
        encryptedDek: MOCK_ENCRYPTED.encryptedDek,
        iv: MOCK_ENCRYPTED.iv,
        authTag: MOCK_ENCRYPTED.authTag,
      });
      expect(result).toEqual({
        tools: [
          {
            name: 'search-docs',
            title: '搜索文档',
            description: '搜索知识库文档',
            inputSchema: createDiscoveredTool().inputSchema,
            annotations: {
              category: 'knowledge',
            },
          },
        ],
        serverInfo: {
          name: 'Knowledge MCP',
          version: '2.1.0',
        },
      });
    });
  });

  describe('deactivateTool', () => {
    it('应当仅将 MCP 导入工具标记为 inactive 而不是物理删除', async () => {
      const deactivateTool = getCallableMethod<
        [toolDefinitionId: string, tenantId: string],
        Promise<unknown>
      >(service, 'deactivateTool');

      db.select.mockReturnValueOnce(
        createSelectChain([createToolDefinitionRecord()]),
      );
      const updateChain = createUpdateChain([
        createToolDefinitionRecord({
          isActive: false,
        }),
      ]);
      db.update.mockReturnValueOnce(updateChain);

      const result = await deactivateTool(TOOL_ID, TENANT_ID);

      expect(db.delete).not.toHaveBeenCalled();
      expect(db.update).toHaveBeenCalledWith(toolDefinitions);
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: false,
          updatedAt: expect.any(Date),
        }),
      );
      expect(result).toMatchObject({
        id: TOOL_ID,
        isActive: false,
      });
    });

    it('应当拒绝停用非 MCP 来源的工具', async () => {
      const deactivateTool = getCallableMethod<
        [toolDefinitionId: string, tenantId: string],
        Promise<unknown>
      >(service, 'deactivateTool');

      db.select.mockReturnValueOnce(
        createSelectChain([
          createToolDefinitionRecord({
            id: BUILTIN_TOOL_ID,
            source: 'builtin',
            mcpServerConfigId: null,
          }),
        ]),
      );

      await expect(
        deactivateTool(BUILTIN_TOOL_ID, TENANT_ID),
      ).rejects.toBeInstanceOf(McpToolDeactivationNotAllowedException);
      expect(db.update).not.toHaveBeenCalled();
      expect(db.delete).not.toHaveBeenCalled();
    });

    it('应当在工具不存在时抛�� McpToolNotFoundException', async () => {
      const deactivateTool = getCallableMethod<
        [toolDefinitionId: string, tenantId: string],
        Promise<unknown>
      >(service, 'deactivateTool');

      db.select.mockReturnValueOnce(createSelectChain([]));

      await expect(deactivateTool(TOOL_ID, TENANT_ID)).rejects.toBeInstanceOf(
        McpToolNotFoundException,
      );
      expect(db.update).not.toHaveBeenCalled();
      expect(db.delete).not.toHaveBeenCalled();
    });
  });

  describe('listTools', () => {
    it('应当返回租户下的工具列表', async () => {
      const records = [
        createToolDefinitionRecord(),
        createToolDefinitionRecord({
          id: BUILTIN_TOOL_ID,
          source: 'builtin',
          name: 'builtin-tool',
          title: '内置工具',
        }),
      ];
      const selectChain = createSelectChain(records);
      db.select.mockReturnValueOnce(selectChain);

      const result = await service.listTools(TENANT_ID);

      expect(result).toEqual(records);
      expect(drizzleMocks.eq).toHaveBeenCalledTimes(1);
      expect(drizzleMocks.eq).toHaveBeenCalledWith(
        toolDefinitions.tenantId,
        TENANT_ID,
      );
      expect(drizzleMocks.and).toHaveBeenCalledWith({
        type: 'eq',
        left: toolDefinitions.tenantId,
        right: TENANT_ID,
      });
    });

    it('应当按来源过滤工具列表', async () => {
      const records = [createToolDefinitionRecord()];
      const selectChain = createSelectChain(records);
      db.select.mockReturnValueOnce(selectChain);

      const result = await service.listTools(TENANT_ID, 'mcp');

      expect(result).toEqual(records);
      expect(drizzleMocks.eq).toHaveBeenNthCalledWith(
        1,
        toolDefinitions.tenantId,
        TENANT_ID,
      );
      expect(drizzleMocks.eq).toHaveBeenNthCalledWith(
        2,
        toolDefinitions.source,
        'mcp',
      );
      expect(drizzleMocks.and).toHaveBeenCalledWith(
        {
          type: 'eq',
          left: toolDefinitions.tenantId,
          right: TENANT_ID,
        },
        {
          type: 'eq',
          left: toolDefinitions.source,
          right: 'mcp',
        },
      );
    });

    it('应当在查询失败时透传错误', async () => {
      const error = new Error('查询失败');
      const selectChain = createRejectingSelectChain(error);
      db.select.mockReturnValueOnce(selectChain);

      await expect(service.listTools(TENANT_ID)).rejects.toThrow(error);
    });
  });
});
