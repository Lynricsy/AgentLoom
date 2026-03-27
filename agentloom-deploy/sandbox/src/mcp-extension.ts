import { Type } from '@sinclair/typebox';

import { McpClient } from './mcp-client.js';
import type { McpCallToolResult, McpContentItem } from './mcp-client.js';
import type { McpServersConfig } from './types.js';
import type {
  PiExtensionAPI,
  PiToolDefinition,
  PiAgentToolResult,
} from './agentloom-extension.js';

interface McpPiExtensionAPI extends PiExtensionAPI {
  on(event: 'session_shutdown', handler: () => void | Promise<void>): void;
  on(event: string, handler: Function): void;
}

export interface McpExtensionOptions {
  mcpServers?: McpServersConfig;
}

export interface McpExtensionResult {
  register: (pi: McpPiExtensionAPI) => Promise<void>;
  clients: Map<string, McpClient>;
}

function wrapExecute(
  fn: (params: Record<string, unknown>) => unknown,
): PiToolDefinition['execute'] {
  return async (
    _toolCallId: string,
    params: Record<string, unknown>,
  ): Promise<PiAgentToolResult> => {
    try {
      const result = fn(params);
      const resolved = result instanceof Promise ? await result : result;
      const text =
        typeof resolved === 'string'
          ? resolved
          : JSON.stringify(resolved, null, 2);
      return { resultForAssistant: text };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { resultForAssistant: `Error: ${message}` };
    }
  };
}

/**
 * 将 MCP callTool 结果序列化为可读文本。
 */
function formatCallToolResult(result: McpCallToolResult): string {
  const contents: McpContentItem[] = result.content ?? [];
  if (contents.length === 0) {
    return result.isError ? 'Error: (empty result)' : '(empty result)';
  }

  const parts: string[] = [];
  for (const item of contents) {
    if (item.type === 'text' && item.text) {
      parts.push(item.text);
    } else if (item.type === 'image') {
      parts.push(`[image: ${item.mimeType ?? 'unknown'}]`);
    } else if (item.type === 'resource' && item.resource) {
      parts.push(item.resource.text ?? `[resource: ${item.resource.uri ?? 'unknown'}]`);
    } else {
      parts.push(JSON.stringify(item));
    }
  }

  const text = parts.join('\n');
  return result.isError ? `Error: ${text}` : text;
}

/**
 * 创建 MCP Extension。
 *
 * 遵循 pty-extension.ts 的工厂模式：
 * - 返回 `{ register, clients }`
 * - register 是 async ExtensionFactory（因为 MCP 连接是异步的）
 * - session_shutdown 时优雅关闭所有连接
 * - 单个 server 连接失败不阻塞其他 server
 */
export function createMcpExtension(options: McpExtensionOptions): McpExtensionResult {
  const clients = new Map<string, McpClient>();

  const register = async (pi: McpPiExtensionAPI): Promise<void> => {
    const servers = options.mcpServers;
    if (!servers || Object.keys(servers).length === 0) {
      return;
    }

    // 并发连接所有 MCP 服务器
    const entries = Object.entries(servers);
    const results = await Promise.allSettled(
      entries.map(async ([serverName, config]) => {
        const client = new McpClient();
        try {
          await client.connect(config);
          const tools = await client.listTools();
          clients.set(serverName, client);
          return { serverName, tools };
        } catch (err) {
          // 连接失败：优雅降级，不阻塞其他 server
          await client.close().catch(() => {});
          const message = err instanceof Error ? err.message : String(err);
          console.warn(`[MCP] Failed to connect to server "${serverName}": ${message}`);
          return null;
        }
      }),
    );

    // 注册成功连接的服务器的工具
    for (const result of results) {
      if (result.status !== 'fulfilled' || !result.value) continue;

      const { serverName, tools } = result.value;
      const client = clients.get(serverName);
      if (!client) continue;

      for (const tool of tools) {
        const toolName = `mcp__${serverName}__${tool.name}`;

        // MCP 工具的 inputSchema 是 JSON Schema；使用 Type.Unsafe() 包装为 TypeBox 兼容类型
        const parameters = Type.Unsafe(tool.inputSchema ?? { type: 'object' });

        pi.registerTool({
          name: toolName,
          label: tool.name,
          description: tool.description ?? `MCP tool: ${tool.name}`,
          parameters,
          promptSnippet: `${toolName}: ${tool.description ?? tool.name}`,
          execute: wrapExecute(async (params) => {
            const callResult = await client.callTool(tool.name, params);
            return formatCallToolResult(callResult);
          }),
        } as PiToolDefinition & { promptSnippet: string });
      }

      console.log(`[MCP] Server "${serverName}": registered ${tools.length} tool(s)`);
    }

    // session_shutdown 时关闭所有 MCP 客户端
    pi.on('session_shutdown', async () => {
      const closePromises = Array.from(clients.entries()).map(
        async ([name, client]) => {
          try {
            await client.close();
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`[MCP] Failed to close client "${name}": ${message}`);
          }
        },
      );
      await Promise.allSettled(closePromises);
      clients.clear();
    });
  };

  return { register, clients };
}
