import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';

const server = new McpServer({
  name: 'acp-test-mcp-stdio-server',
  version: '1.0.0',
});

server.registerTool(
  'search',
  {
    description: '返回 ACP stdio E2E 用的固定 MCP 搜索结果。',
    inputSchema: {
      query: z.string().describe('要查询的测试文本'),
    },
  },
  async ({ query }) => {
    return {
      content: [
        {
          type: 'text',
          text: `fixture-search:${query}`,
        },
      ],
    };
  },
);

const transport = new StdioServerTransport();

await server.connect(transport);
