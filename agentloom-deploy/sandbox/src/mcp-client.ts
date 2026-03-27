import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { McpServerConfig } from './types.js';

const CONNECT_TIMEOUT_MS = 30_000;
const LIST_TOOLS_TIMEOUT_MS = 60_000;
const CALL_TOOL_TIMEOUT_MS = 60_000;

/** MCP listTools 返回的单个工具类型 */
export type McpTool = Awaited<ReturnType<Client['listTools']>>['tools'][number];

/** MCP callTool 返回的结果内容项 */
export interface McpContentItem {
  type: string;
  text?: string;
  mimeType?: string;
  data?: string;
  resource?: { uri?: string; text?: string };
  [key: string]: unknown;
}

/** MCP callTool 返回的结果（简化类型） */
export interface McpCallToolResult {
  content: McpContentItem[];
  isError?: boolean;
}

/**
 * 轻量 MCP 客户端封装。
 * 参考 agentloom-server McpService 的 transport 创建、分页列工具、安全关闭等模式。
 */
export class McpClient {
  private client: Client | null = null;
  private transport: Transport | null = null;

  /**
   * 连接到 MCP 服务器。
   * 根据 transportType 创建对应的 transport 并完成握手。
   */
  async connect(config: McpServerConfig): Promise<void> {
    const transport = this.createTransport(config);
    const client = new Client({ name: 'agentloom-sandbox', version: '1.0.0' });

    try {
      await withTimeout(
        client.connect(transport),
        CONNECT_TIMEOUT_MS,
        `MCP connect timeout (${CONNECT_TIMEOUT_MS / 1000}s)`,
      );
      this.client = client;
      this.transport = transport;
    } catch (error) {
      await this.safeClose(client, transport);
      throw error;
    }
  }

  /**
   * 发现所有可用工具（cursor-based 分页）。
   */
  async listTools(): Promise<McpTool[]> {
    const client = this.assertConnected();

    const tools: McpTool[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | undefined;

    while (true) {
      const result = await withTimeout(
        client.listTools(cursor ? { cursor } : undefined),
        LIST_TOOLS_TIMEOUT_MS,
        'MCP listTools timeout',
      );

      tools.push(...(result.tools ?? []));

      if (!result.nextCursor) {
        return tools;
      }

      if (seenCursors.has(result.nextCursor)) {
        throw new Error(`MCP listTools cursor loop detected: ${result.nextCursor}`);
      }

      seenCursors.add(result.nextCursor);
      cursor = result.nextCursor;
    }
  }

  /**
   * 执行工具调用。
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<McpCallToolResult> {
    const client = this.assertConnected();

    const raw = await withTimeout(
      client.callTool({ name, arguments: args }),
      CALL_TOOL_TIMEOUT_MS,
      `MCP callTool "${name}" timeout`,
    );

    return {
      content: (raw.content ?? []) as McpContentItem[],
      isError: raw.isError as boolean | undefined,
    };
  }

  /**
   * 优雅关闭连接。
   * 遵循 McpService 的 safeClose 模式：先终止 streamable_http 会话，再关闭 client，再关闭 transport。
   */
  async close(): Promise<void> {
    if (!this.client && !this.transport) return;

    const client = this.client;
    const transport = this.transport;
    this.client = null;
    this.transport = null;

    if (client && transport) {
      await this.safeClose(client, transport);
    }
  }

  private createTransport(config: McpServerConfig): Transport {
    switch (config.transportType) {
      case 'stdio': {
        if (!config.command) {
          throw new Error('MCP stdio transport requires "command"');
        }
        return new StdioClientTransport({
          command: config.command,
          args: config.args,
          env: config.env,
        });
      }
      case 'sse': {
        if (!config.url) {
          throw new Error('MCP sse transport requires "url"');
        }
        return new SSEClientTransport(
          new URL(config.url),
          config.headers
            ? { requestInit: { headers: config.headers } }
            : undefined,
        );
      }
      case 'streamable_http': {
        if (!config.url) {
          throw new Error('MCP streamable_http transport requires "url"');
        }
        return new StreamableHTTPClientTransport(
          new URL(config.url),
          config.headers
            ? { requestInit: { headers: config.headers } }
            : undefined,
        );
      }
    }
  }

  private assertConnected(): Client {
    if (!this.client) {
      throw new Error('MCP client is not connected');
    }
    return this.client;
  }

  /**
   * 安全关闭：streamable_http 先终止会话 → client.close → transport.close
   */
  private async safeClose(client: Client, transport: Transport): Promise<void> {
    if (this.isTerminableTransport(transport)) {
      try {
        await transport.terminateSession();
      } catch {
        // 忽略终止会话失败
      }
    }

    try {
      await client.close();
    } catch {
      // 忽略 client 关闭失败
    }

    try {
      await transport.close();
    } catch {
      // 忽略 transport 关闭失败
    }
  }

  private isTerminableTransport(
    transport: Transport,
  ): transport is Transport & { terminateSession: () => Promise<void> } {
    return (
      'terminateSession' in transport &&
      typeof transport.terminateSession === 'function'
    );
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}
