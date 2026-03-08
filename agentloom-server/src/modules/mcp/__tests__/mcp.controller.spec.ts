import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { McpController } from '../mcp.controller';
import type {
  DiscoverMcpToolsDto,
  ImportMcpToolsDto,
  TestMcpConnectionDto,
} from '../dto';
import type { McpService } from '../mcp.service';

function getRoles(controller: object, methodName: string): string[] | undefined {
  const handler = (controller as Record<string, unknown>)[methodName] as Function;
  return handler ? Reflect.getMetadata(ROLES_KEY, handler) : undefined;
}

const TENANT_ID = '00000000-0000-0000-0000-000000000010';
const USER_ID = '00000000-0000-0000-0000-000000000001';
const TOOL_ID = '00000000-0000-0000-0000-000000000100';
const MCP_SERVER_CONFIG_ID = '00000000-0000-0000-0000-000000000200';

const TEST_CONNECTION_RESULT = {
  success: true,
  serverInfo: {
    name: 'filesystem-server',
    version: '1.0.0',
    protocolVersion: '2025-03-26',
  },
};

const DISCOVER_TOOLS_RESULT = {
  tools: [
    {
      name: 'search-files',
      title: '搜索文件',
      description: '按关键字搜索文件',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
      },
      annotations: {
        category: 'filesystem',
      },
    },
  ],
  serverInfo: {
    name: 'filesystem-server',
    version: '1.0.0',
  },
};

const IMPORT_TOOLS_RESULT = {
  mcpServerConfigId: MCP_SERVER_CONFIG_ID,
  imported: [
    {
      id: TOOL_ID,
      name: 'search-files',
      title: '搜索文件',
      description: '按关键字搜索文件',
      portMappingMetadata: {
        inputs: [
          {
            name: 'query',
            dataType: 'text',
            description: '搜索关键字',
            required: true,
          },
        ],
        outputs: [],
      },
    },
  ],
};

const LIST_TOOLS_RESULT = [
  {
    id: TOOL_ID,
    tenantId: TENANT_ID,
    source: 'mcp',
    name: 'search-files',
    title: '搜索文件',
    description: '按关键字搜索文件',
    isActive: true,
  },
];

describe('McpController', () => {
  let controller: McpController;
  let service: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();

    service = {
      testConnection: vi.fn().mockResolvedValue(TEST_CONNECTION_RESULT),
      discoverTools: vi.fn().mockResolvedValue(DISCOVER_TOOLS_RESULT),
      importTools: vi.fn().mockResolvedValue(IMPORT_TOOLS_RESULT),
      listTools: vi.fn().mockResolvedValue(LIST_TOOLS_RESULT),
    };

    controller = new McpController(service as unknown as McpService);
  });

  describe('角色元数据', () => {
    it('testConnection 应当需要 owner 和 admin 角色', () => {
      expect(getRoles(controller, 'testConnection')).toEqual(['owner', 'admin']);
    });

    it('discoverTools 应当需要 owner 和 admin 角色', () => {
      expect(getRoles(controller, 'discoverTools')).toEqual(['owner', 'admin']);
    });

    it('importTools 应当需要 owner 和 admin 角色', () => {
      expect(getRoles(controller, 'importTools')).toEqual(['owner', 'admin']);
    });

    it('listTools 应当需要 owner 和 admin 角色', () => {
      expect(getRoles(controller, 'listTools')).toEqual(['owner', 'admin']);
    });
  });

  describe('testConnection', () => {
    it('应当调用 service.testConnection 并包装返回值', async () => {
      const dto: TestMcpConnectionDto = {
        connection: {
          transportType: 'stdio' as const,
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem'],
          env: {
            MCP_ROOT: '/tmp',
          },
        },
      };

      const result = await controller.testConnection(dto);

      expect(result).toEqual({ data: TEST_CONNECTION_RESULT });
      expect(service.testConnection).toHaveBeenCalledWith(dto);
    });
  });

  describe('discoverTools', () => {
    it('应当调用 service.discoverTools 并包装返回值', async () => {
      const dto: DiscoverMcpToolsDto = {
        connection: {
          transportType: 'sse' as const,
          url: 'https://example.com/sse',
          headers: {
            Authorization: 'Bearer test-token',
          },
        },
      };

      const result = await controller.discoverTools(dto);

      expect(result).toEqual({ data: DISCOVER_TOOLS_RESULT });
      expect(service.discoverTools).toHaveBeenCalledWith(dto);
    });
  });

  describe('importTools', () => {
    it('应当调用 service.importTools 并包装返回值', async () => {
      const dto: ImportMcpToolsDto = {
        serverName: 'Filesystem Server',
        serverDescription: '文件系统工具服务',
        connection: {
          transportType: 'streamable_http' as const,
          url: 'https://example.com/mcp',
          headers: {
            Authorization: 'Bearer import-token',
          },
        },
        toolNames: ['search-files'],
      };

      const result = await controller.importTools(dto, USER_ID, TENANT_ID);

      expect(result).toEqual({ data: IMPORT_TOOLS_RESULT });
      expect(service.importTools).toHaveBeenCalledWith(dto, USER_ID, TENANT_ID);
    });
  });

  describe('listTools', () => {
    it('应当调用 service.listTools 并包装返回值', async () => {
      const source = 'mcp';

      const result = await controller.listTools(TENANT_ID, source);

      expect(result).toEqual({ data: LIST_TOOLS_RESULT });
      expect(service.listTools).toHaveBeenCalledWith(TENANT_ID, source);
    });
  });
});
