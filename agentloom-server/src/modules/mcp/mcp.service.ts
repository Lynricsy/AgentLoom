import { Inject, Injectable, Logger } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.module';
import type { DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { EncryptionService } from '../api-key/encryption.service';
import {
  mcpServerConfigs,
  organizations,
  toolDefinitions,
} from '../../database/schema';
import type { TestMcpConnectionResponse } from './dto/test-mcp-connection.dto';
import type { DiscoverMcpToolsResponse } from './dto/discover-mcp-tools.dto';
import type { ImportMcpToolsResponse, PortMapping } from './dto/import-mcp-tools.dto';
import type { TestMcpConnectionDto } from './dto/test-mcp-connection.dto';
import type { DiscoverMcpToolsDto } from './dto/discover-mcp-tools.dto';
import type { ImportMcpToolsDto } from './dto/import-mcp-tools.dto';
import {
  McpConnectionFailedException,
  McpConnectionTimeoutException,
  McpImportConflictException,
} from './mcp.exceptions';

const CONNECT_TIMEOUT_MS = 30_000;
const LIST_TOOLS_TIMEOUT_MS = 60_000;

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly encryptionService: EncryptionService,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  async testConnection(
    dto: TestMcpConnectionDto,
  ): Promise<TestMcpConnectionResponse> {
    const { client, transport } = await this.createAndConnectClient(
      dto.connection,
      CONNECT_TIMEOUT_MS,
      '连接测试',
    );

    try {
      const serverVersion = client.getServerVersion();
      const protocolVersion =
        serverVersion &&
        'protocolVersion' in serverVersion &&
        typeof serverVersion.protocolVersion === 'string'
          ? serverVersion.protocolVersion
          : undefined;
      const serverInfo: TestMcpConnectionResponse['serverInfo'] = serverVersion
        ? {
            name: serverVersion.name,
            version: serverVersion.version,
            protocolVersion,
          }
        : undefined;

      return {
        success: true,
        serverInfo,
      };
    } finally {
      await this.safeCloseClient(client, transport);
    }
  }

  async discoverTools(
    dto: DiscoverMcpToolsDto,
  ): Promise<DiscoverMcpToolsResponse> {
    const { client, transport } = await this.createAndConnectClient(
      dto.connection,
      CONNECT_TIMEOUT_MS,
      '工具发现',
    );

    try {
      const tools = await this.listAllTools(client, '工具发现');

      const serverVersion = client.getServerVersion();

      return {
        tools: tools.map((tool) => ({
          name: tool.name,
          title: (tool as Record<string, unknown>).title as string | undefined,
          description: tool.description,
          inputSchema: tool.inputSchema as Record<string, unknown> | undefined,
          annotations: (tool as Record<string, unknown>).annotations as
            | Record<string, unknown>
            | undefined,
        })),
        serverInfo: serverVersion
          ? { name: serverVersion.name, version: serverVersion.version }
          : undefined,
      };
    } catch (error) {
      this.handleOperationError(error, dto.connection, '工具发现');
    } finally {
      await this.safeCloseClient(client, transport);
    }
  }

  async importTools(
    dto: ImportMcpToolsDto,
    userId: string,
    tenantId: string,
  ): Promise<ImportMcpToolsResponse> {
    const { client, transport } = await this.createAndConnectClient(
      dto.connection,
      CONNECT_TIMEOUT_MS,
      '工具导入',
    );

    let discoveredTools: Awaited<ReturnType<Client['listTools']>>['tools'] = [];

    try {
      discoveredTools = await this.listAllTools(client, '工具导入');
    } catch (error) {
      this.handleOperationError(error, dto.connection, '工具导入');
    } finally {
      await this.safeCloseClient(client, transport);
    }

    const requestedToolNames = new Set(dto.toolNames);
    const selectedTools = discoveredTools.filter((tool) =>
      requestedToolNames.has(tool.name),
    );
    const selectedToolNames = new Set(selectedTools.map((tool) => tool.name));
    const missingToolNames = dto.toolNames.filter(
      (toolName) => !selectedToolNames.has(toolName),
    );

    if (missingToolNames.length > 0) {
      throw new McpImportConflictException(
        `请求导入的工具不存在: ${missingToolNames.join(', ')}`,
      );
    }

    discoveredTools = selectedTools;

    const credentials = this.extractCredentials(dto.connection);
    const encryptedFields = credentials
      ? this.encryptionService.encrypt(JSON.stringify(credentials))
      : null;

    const organizationId = await this.resolveOrganizationId(tenantId);

    return await this.tenantDb.transaction(async (tx) => {
      const [config] = await tx
        .insert(mcpServerConfigs)
        .values({
          tenantId,
          organizationId,
          createdBy: userId,
          name: dto.serverName,
          description: dto.serverDescription,
          transportType: dto.connection.transportType,
          command:
            dto.connection.transportType === 'stdio'
              ? dto.connection.command
              : null,
          args:
            dto.connection.transportType === 'stdio'
              ? (dto.connection.args ?? null)
              : null,
          url:
            dto.connection.transportType !== 'stdio'
              ? dto.connection.url
              : null,
          encryptedData: encryptedFields?.encryptedKey ?? null,
          encryptedDek: encryptedFields?.encryptedDek ?? null,
          iv: encryptedFields?.iv ?? null,
          authTag: encryptedFields?.authTag ?? null,
          status: 'active',
          lastTestedAt: new Date(),
        })
        .returning();

      const imported = await Promise.all(
        discoveredTools.map(async (tool) => {
          const portMappingMetadata = this.generatePortMapping(tool);
          const [inserted] = await tx
            .insert(toolDefinitions)
            .values({
              tenantId,
              organizationId,
              mcpServerConfigId: config.id,
              source: 'mcp',
              name: tool.name,
              title:
                (tool as Record<string, unknown>).title as string | undefined,
              description: tool.description,
              inputSchema: tool.inputSchema as Record<string, unknown>,
              annotations: (tool as Record<string, unknown>).annotations as
                | Record<string, unknown>
                | undefined,
              portMappingMetadata,
              isActive: true,
              importedAt: new Date(),
            })
            .returning();

          return {
            id: inserted.id,
            name: inserted.name,
            title: inserted.title ?? undefined,
            description: inserted.description ?? undefined,
            portMappingMetadata: portMappingMetadata ?? undefined,
          };
        }),
      );

      return {
        mcpServerConfigId: config.id,
        imported,
      };
    });
  }

  async listTools(
    tenantId: string,
    source?: string,
  ) {
    const conditions = [
      eq(toolDefinitions.tenantId, tenantId),
    ];

    if (source) {
      conditions.push(
        eq(toolDefinitions.source, source as 'mcp' | 'builtin' | 'custom'),
      );
    }

    return await this.tenantDb
      .select()
      .from(toolDefinitions)
      .where(and(...conditions));
  }

  private async resolveOrganizationId(tenantId: string): Promise<string> {
    const [org] = await this.tenantDb
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.tenantId, tenantId));

    if (!org) {
      throw new Error(`租户 ${tenantId} 对应的组织未找到`);
    }

    return org.id;
  }

  private async createAndConnectClient(
    connection: TestMcpConnectionDto['connection'],
    timeout: number,
    operation: '连接测试' | '工具发现' | '工具导入',
  ): Promise<{ client: Client; transport: Transport }> {
    const transport = this.createTransport(connection);
    const client = new Client({ name: 'agentloom', version: '1.0.0' });

    try {
      await this.withTimeout(
        client.connect(transport),
        timeout,
        `连接 MCP 服务器超时 (${timeout / 1000}s)`,
      );
      return { client, transport };
    } catch (error) {
      await this.safeCloseClient(client, transport);
      this.handleOperationError(error, connection, operation);
    }
  }

  private async listAllTools(
    client: Client,
    operation: '工具发现' | '工具导入',
  ): Promise<Awaited<ReturnType<Client['listTools']>>['tools']> {
    const tools: Awaited<ReturnType<Client['listTools']>>['tools'] = [];
    const seenCursors = new Set<string>();
    let cursor: string | undefined;

    while (true) {
      const result = await this.withTimeout(
        client.listTools(cursor ? { cursor } : undefined),
        LIST_TOOLS_TIMEOUT_MS,
        `${operation}超时`,
      );

      tools.push(...(result.tools ?? []));

      if (!result.nextCursor) {
        return tools;
      }

      if (seenCursors.has(result.nextCursor)) {
        throw new Error(`MCP 工具列表分页游标重复: ${result.nextCursor}`);
      }

      seenCursors.add(result.nextCursor);
      cursor = result.nextCursor;
    }
  }

  private createTransport(
    connection: TestMcpConnectionDto['connection'],
  ): Transport {
    switch (connection.transportType) {
      case 'stdio':
        return new StdioClientTransport({
          command: connection.command,
          args: connection.args,
          env: connection.env as Record<string, string> | undefined,
        });
      case 'sse':
        return new SSEClientTransport(
          new URL(connection.url),
          connection.headers
            ? {
                requestInit: {
                  headers: connection.headers,
                },
              }
            : undefined,
        );
      case 'streamable_http':
        return new StreamableHTTPClientTransport(
          new URL(connection.url),
          connection.headers
            ? {
                requestInit: {
                  headers: connection.headers,
                },
              }
            : undefined,
        );
    }
  }

  private extractCredentials(
    connection: TestMcpConnectionDto['connection'],
  ): Record<string, string> | null {
    switch (connection.transportType) {
      case 'stdio':
        return connection.env && Object.keys(connection.env).length > 0
          ? connection.env
          : null;
      case 'sse':
      case 'streamable_http':
        return connection.headers && Object.keys(connection.headers).length > 0
          ? connection.headers
          : null;
    }
  }

  private generatePortMapping(
    tool: { inputSchema?: Record<string, unknown> },
  ): { inputs: PortMapping[]; outputs: PortMapping[] } | null {
    const schema = tool.inputSchema;
    if (!schema || typeof schema !== 'object') return null;

    const properties = schema.properties as
      | Record<string, Record<string, unknown>>
      | undefined;
    if (!properties) return null;

    const requiredFields = Array.isArray(schema.required)
      ? new Set(schema.required as string[])
      : new Set<string>();

    const inputs: PortMapping[] = Object.entries(properties).map(
      ([name, prop]) => ({
        name,
        dataType: this.mapJsonSchemaToPortDataType(prop),
        description: prop.description as string | undefined,
        required: requiredFields.has(name),
      }),
    );

    // MCP 工具的输出默认为 text（content 数组）
    const outputs: PortMapping[] = [
      {
        name: 'result',
        dataType: 'text' as const,
        description: '工具执行结果',
      },
    ];

    return { inputs, outputs };
  }

  private mapJsonSchemaToPortDataType(
    prop: Record<string, unknown>,
  ): PortMapping['dataType'] {
    const type = prop.type as string | undefined;
    const contentMediaType = prop.contentMediaType as string | undefined;

    if (contentMediaType) {
      if (contentMediaType.startsWith('image/')) return 'image';
      if (contentMediaType.startsWith('audio/')) return 'audio';
    }

    switch (type) {
      case 'string':
        return 'text';
      case 'number':
      case 'integer':
        return 'number';
      case 'boolean':
        return 'boolean';
      case 'object':
      case 'array':
        return 'json';
      default:
        return 'text';
    }
  }

  private async safeCloseClient(
    client: Client,
    transport: Transport,
  ): Promise<void> {
    if (this.isTerminableStreamableHttpTransport(transport)) {
      try {
        await transport.terminateSession();
      } catch (error) {
        this.logger.warn(
          `MCP streamable_http 会话终止失败: ${this.getErrorMessage(error)}`,
        );
      }
    }

    try {
      await client.close();
    } catch (error) {
      this.logger.warn(`MCP 客户端关闭失败: ${this.getErrorMessage(error)}`);
    }

    try {
      await transport.close();
    } catch (error) {
      this.logger.warn(`MCP transport 关闭失败: ${this.getErrorMessage(error)}`);
    }
  }

  private isTerminableStreamableHttpTransport(
    transport: Transport,
  ): transport is Transport & { terminateSession: () => Promise<void> } {
    return (
      'terminateSession' in transport &&
      typeof transport.terminateSession === 'function'
    );
  }

  private getConnectionTarget(
    connection: TestMcpConnectionDto['connection'],
  ): string {
    return connection.transportType === 'stdio'
      ? connection.command
      : connection.url;
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private handleOperationError(
    error: unknown,
    connection: TestMcpConnectionDto['connection'],
    operation: '连接测试' | '工具发现' | '工具导入',
  ): never {
    const message = this.getErrorMessage(error);

    this.logger.error(
      `[MCP ${operation}] 失败 transport=${connection.transportType} target=${this.getConnectionTarget(connection)} message=${message}`,
      error instanceof Error ? error.stack : undefined,
    );

    if (
      error instanceof McpConnectionTimeoutException ||
      error instanceof McpConnectionFailedException
    ) {
      throw error;
    }

    throw new McpConnectionFailedException(
      `MCP ${operation}失败: ${message}`,
    );
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    timeoutMessage: string,
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;

    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new McpConnectionTimeoutException(timeoutMessage));
      }, ms);
    });

    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timer!);
    }
  }
}
