import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { and, desc, eq, ilike, inArray, not, or, sql } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.module';
import type { DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import type { ResourceSourceKind } from '../../database/schema';
import { EncryptionService } from '../api-key/encryption.service';
import {
  mcpServerConfigs,
  organizations,
  toolDefinitions,
} from '../../database/schema';
import { ResourceSourceService } from '../resource-source/resource-source.service';
import type { TestMcpConnectionResponse } from './dto/test-mcp-connection.dto';
import type { DiscoverMcpToolsResponse } from './dto/discover-mcp-tools.dto';
import type {
  ImportedToolResult,
  ImportMcpToolsResponse,
  PortMapping,
} from './dto/import-mcp-tools.dto';
import type { TestMcpConnectionDto } from './dto/test-mcp-connection.dto';
import type { DiscoverMcpToolsDto } from './dto/discover-mcp-tools.dto';
import type {
  ImportMcpToolsDto,
  ReimportMcpToolsDto,
} from './dto/import-mcp-tools.dto';
import type { McpServerConfigQueryType } from './dto/mcp-server-config-query.dto';
import type { UpdateMcpServerConfigType } from './dto/update-mcp-server-config.dto';
import {
  McpConnectionFailedException,
  McpConnectionTimeoutException,
  McpImportConflictException,
  McpServerConfigNotFoundException,
  McpToolDeactivationNotAllowedException,
  McpToolNotFoundException,
} from './mcp.exceptions';

const CONNECT_TIMEOUT_MS = 120_000;
const LIST_TOOLS_TIMEOUT_MS = 60_000;
const CALL_TOOL_TIMEOUT_MS = 60_000;

export type McpRuntimeConnection = TestMcpConnectionDto['connection'];
export type McpRuntimeDiscoveredTool =
  DiscoverMcpToolsResponse['tools'][number];

type McpConnection = McpRuntimeConnection;
type DiscoveredMcpTool = Awaited<
  ReturnType<Client['listTools']>
>['tools'][number];
type SavedMcpConfig = typeof mcpServerConfigs.$inferSelect;
type McpOperation =
  | '连接测试'
  | '工具发现'
  | '工具导入'
  | '运行时工具发现'
  | '运行时工具调用';
type McpToolListingOperation = '工具发现' | '工具导入' | '运行时工具发现';

type ImportSummary = {
  total: number;
  imported: number;
  overwritten: number;
  skipped: number;
  failed: number;
};

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly encryptionService: EncryptionService,
    private readonly resourceSourceService: ResourceSourceService,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  /**
   * 根据已保存的 MCP 服务器配置 ID 解析出运行时连接信息（含解密凭证）。
   * 供 NodeSchedulerService 在构建 agent task job data 时注入 mcpServers。
   */
  async resolveRuntimeConnection(
    mcpServerConfigId: string,
    tenantId: string,
  ): Promise<McpRuntimeConnection> {
    const config = await this.getSavedConfigOrThrow(
      mcpServerConfigId,
      tenantId,
    );
    return this.buildConnectionFromSavedConfig(config);
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
    return await this.discoverToolsForConnection(dto.connection, '工具发现');
  }

  async discoverRuntimeTools(
    connection: McpRuntimeConnection,
  ): Promise<ReadonlyArray<McpRuntimeDiscoveredTool>> {
    const result = await this.discoverToolsForConnection(
      connection,
      '运行时工具发现',
    );

    return result.tools;
  }

  async callRuntimeTool(
    connection: McpRuntimeConnection,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const { client, transport } = await this.createAndConnectClient(
      connection,
      CONNECT_TIMEOUT_MS,
      '运行时工具调用',
    );

    try {
      return await this.withTimeout(
        client.callTool({
          name: toolName,
          arguments: args,
        }),
        CALL_TOOL_TIMEOUT_MS,
        '运行时工具调用超时',
      );
    } catch (error) {
      this.handleOperationError(error, connection, '运行时工具调用');
    } finally {
      await this.safeCloseClient(client, transport);
    }
  }

  async testSavedConfigConnection(
    mcpServerConfigId: string,
    tenantId: string,
  ): Promise<TestMcpConnectionResponse> {
    const config = await this.getSavedConfigOrThrow(
      mcpServerConfigId,
      tenantId,
    );
    const connection = this.buildConnectionFromSavedConfig(config);

    return await this.testConnection({ connection });
  }

  async importTools(
    dto: ImportMcpToolsDto,
    userId: string,
    tenantId: string,
  ): Promise<ImportMcpToolsResponse> {
    return await this.importToolsForConnection({
      connection: dto.connection,
      tenantId,
      userId,
      serverName: dto.serverName,
      serverDescription: dto.serverDescription,
      toolNames: dto.toolNames,
      conflictStrategy: dto.conflictStrategy,
    });
  }

  async rediscoverTools(
    mcpServerConfigId: string,
    tenantId: string,
  ): Promise<DiscoverMcpToolsResponse> {
    const config = await this.getSavedConfigOrThrow(
      mcpServerConfigId,
      tenantId,
    );
    const connection = this.buildConnectionFromSavedConfig(config);

    return await this.discoverToolsForConnection(connection, '工具发现');
  }

  async reimportTools(
    mcpServerConfigId: string,
    dto: ReimportMcpToolsDto,
    tenantId: string,
  ): Promise<ImportMcpToolsResponse> {
    const config = await this.getSavedConfigOrThrow(
      mcpServerConfigId,
      tenantId,
    );
    const connection = this.buildConnectionFromSavedConfig(config);

    return await this.importToolsForConnection({
      connection,
      tenantId,
      existingConfig: config,
      serverName: config.name,
      serverDescription: config.description ?? undefined,
      toolNames: dto.toolNames,
      conflictStrategy: dto.conflictStrategy,
    });
  }

  async deactivateTool(toolDefinitionId: string, tenantId: string) {
    const [existingTool] = await this.tenantDb
      .select()
      .from(toolDefinitions)
      .where(
        and(
          eq(toolDefinitions.id, toolDefinitionId),
          eq(toolDefinitions.tenantId, tenantId),
        ),
      );

    if (!existingTool) {
      throw new McpToolNotFoundException(
        `待停用的 MCP 工具不存在: ${toolDefinitionId}`,
      );
    }

    if (existingTool.source !== 'mcp' || !existingTool.mcpServerConfigId) {
      throw new McpToolDeactivationNotAllowedException(
        '仅支持停用 MCP 导入工具',
      );
    }

    const [updatedTool] = await this.tenantDb
      .update(toolDefinitions)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(toolDefinitions.id, toolDefinitionId))
      .returning();

    return updatedTool;
  }

  async listTools(tenantId: string, source?: string) {
    const conditions = [eq(toolDefinitions.tenantId, tenantId)];

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

  async findAllConfigs(
    tenantId: string,
    query: McpServerConfigQueryType,
  ): Promise<{
    data: (SavedMcpConfig & {
      toolCount: number;
      sourceKind: ResourceSourceKind;
    })[];
    meta: { total: number; page: number; pageSize: number; totalPages: number };
  }> {
    const { page, pageSize, search, status, transportType, sourceKind } = query;
    const offset = (page - 1) * pageSize;

    const conditions = [eq(mcpServerConfigs.tenantId, tenantId)];

    if (search) {
      conditions.push(
        or(
          ilike(mcpServerConfigs.name, `%${search}%`),
          ilike(mcpServerConfigs.description, `%${search}%`),
        )!,
      );
    }
    if (status) {
      conditions.push(eq(mcpServerConfigs.status, status));
    }
    if (transportType) {
      conditions.push(eq(mcpServerConfigs.transportType, transportType));
    }
    if (sourceKind) {
      const importedExistsCondition =
        this.resourceSourceService.buildShareImportedExistsCondition({
          resourceType: 'mcp_server_config',
          resourceIdColumn: mcpServerConfigs.id,
        });

      conditions.push(
        sourceKind === 'share_imported'
          ? importedExistsCondition
          : not(importedExistsCondition),
      );
    }

    const whereClause = and(...conditions);

    const [rows, countResult] = await Promise.all([
      this.tenantDb
        .select()
        .from(mcpServerConfigs)
        .where(whereClause)
        .orderBy(desc(mcpServerConfigs.updatedAt))
        .limit(pageSize)
        .offset(offset),
      this.tenantDb
        .select({ total: sql<number>`count(*)::int` })
        .from(mcpServerConfigs)
        .where(whereClause),
    ]);

    const total = countResult[0]?.total ?? 0;

    // 批量查询每个配置的活跃工具数量
    const configIds = rows.map((r) => r.id);
    let toolCountMap = new Map<string, number>();

    if (configIds.length > 0) {
      const toolCounts = await this.tenantDb
        .select({
          mcpServerConfigId: toolDefinitions.mcpServerConfigId,
          count: sql<number>`count(*)::int`,
        })
        .from(toolDefinitions)
        .where(
          and(
            inArray(toolDefinitions.mcpServerConfigId, configIds),
            eq(toolDefinitions.isActive, true),
          ),
        )
        .groupBy(toolDefinitions.mcpServerConfigId);

      toolCountMap = new Map(
        toolCounts.map((tc) => [tc.mcpServerConfigId!, tc.count]),
      );
    }
    const sourceKindMap = await this.resourceSourceService.mapCurrentKinds(
      'mcp_server_config',
      configIds,
    );

    const data = rows.map((row) => ({
      ...row,
      toolCount: toolCountMap.get(row.id) ?? 0,
      sourceKind: sourceKindMap.get(row.id) ?? 'manual',
    }));

    return {
      data,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findConfigById(tenantId: string, configId: string) {
    const config = await this.getSavedConfigOrThrow(configId, tenantId);

    const tools = await this.tenantDb
      .select()
      .from(toolDefinitions)
      .where(
        and(
          eq(toolDefinitions.mcpServerConfigId, configId),
          eq(toolDefinitions.tenantId, tenantId),
          eq(toolDefinitions.isActive, true),
        ),
      );

    // 解密凭证只取 key 名，不暴露值
    const credentials = this.decryptStoredCredentials(config);
    const credentialKeys = credentials ? Object.keys(credentials) : [];

    // 去掉加密二进制字段
    const {
      encryptedData: _ed,
      encryptedDek: _ek,
      iv: _iv,
      authTag: _at,
      ...safeConfig
    } = config;
    const sourceKindMap = await this.resourceSourceService.mapCurrentKinds(
      'mcp_server_config',
      [configId],
    );

    return {
      ...safeConfig,
      tools,
      credentialKeys,
      sourceKind: sourceKindMap.get(configId) ?? 'manual',
    };
  }

  async updateConfig(
    tenantId: string,
    configId: string,
    data: UpdateMcpServerConfigType,
  ): Promise<SavedMcpConfig & { sourceKind: ResourceSourceKind }> {
    await this.getSavedConfigOrThrow(configId, tenantId);

    const setClause: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (data.name !== undefined) setClause.name = data.name;
    if (data.description !== undefined)
      setClause.description = data.description;
    if (data.status !== undefined) setClause.status = data.status;

    // 更新连接配置
    if (data.connection) {
      const conn = data.connection;
      setClause.transportType = conn.transportType;

      if (conn.transportType === 'stdio') {
        setClause.command = conn.command;
        setClause.args = conn.args ?? null;
        setClause.url = null;
      } else {
        setClause.url = conn.url;
        setClause.command = null;
        setClause.args = null;
      }

      // 加密凭证
      const credentials = this.extractCredentials(conn as McpConnection);
      const encryptedFields = credentials
        ? this.encryptionService.encrypt(JSON.stringify(credentials))
        : null;

      setClause.encryptedData = encryptedFields?.encryptedKey ?? null;
      setClause.encryptedDek = encryptedFields?.encryptedDek ?? null;
      setClause.iv = encryptedFields?.iv ?? null;
      setClause.authTag = encryptedFields?.authTag ?? null;

      // 重新计算指纹
      setClause.connectionFingerprint = this.buildConnectionFingerprint(
        conn as McpConnection,
      );
    }

    const [updated] = await this.tenantDb
      .update(mcpServerConfigs)
      .set(setClause)
      .where(
        and(
          eq(mcpServerConfigs.id, configId),
          eq(mcpServerConfigs.tenantId, tenantId),
        ),
      )
      .returning();

    const sourceKindMap = await this.resourceSourceService.mapCurrentKinds(
      'mcp_server_config',
      [configId],
    );

    return {
      ...updated,
      sourceKind: sourceKindMap.get(configId) ?? 'manual',
    };
  }

  async deleteConfig(tenantId: string, configId: string): Promise<void> {
    await this.getSavedConfigOrThrow(configId, tenantId);

    await this.tenantDb
      .delete(mcpServerConfigs)
      .where(
        and(
          eq(mcpServerConfigs.id, configId),
          eq(mcpServerConfigs.tenantId, tenantId),
        ),
      );
  }

  private async importToolsForConnection(input: {
    connection: McpConnection;
    tenantId: string;
    userId?: string;
    existingConfig?: SavedMcpConfig;
    serverName: string;
    serverDescription?: string;
    toolNames: string[];
    conflictStrategy: 'skip' | 'overwrite';
  }): Promise<ImportMcpToolsResponse> {
    const discoveredTools = await this.listToolsForConnection(
      input.connection,
      CONNECT_TIMEOUT_MS,
      '工具导入',
    );
    const requestedToolNames = this.deduplicateToolNames(input.toolNames);
    const discoveredToolsByName = new Map(
      discoveredTools.map((tool) => [tool.name, tool] as const),
    );
    const organizationId = await this.resolveOrganizationId(input.tenantId);
    const connectionFingerprint = this.buildConnectionFingerprint(
      input.connection,
    );
    const savedConfig =
      input.existingConfig ??
      (await this.findSavedConfigByFingerprint(
        input.tenantId,
        connectionFingerprint,
      ));
    const credentials = this.extractCredentials(input.connection);
    const encryptedFields = credentials
      ? this.encryptionService.encrypt(JSON.stringify(credentials))
      : null;
    const existingTools = savedConfig
      ? await this.findExistingActiveTools(
          input.tenantId,
          savedConfig.id,
          requestedToolNames.filter((toolName) =>
            discoveredToolsByName.has(toolName),
          ),
        )
      : [];
    const existingToolsByName = new Map(
      existingTools.map((tool) => [tool.name, tool] as const),
    );

    return await this.tenantDb.transaction(async (tx) => {
      let configId = savedConfig?.id;

      if (!configId) {
        if (!input.userId) {
          throw new McpImportConflictException(
            '首次导入 MCP 工具需要用户上下文',
          );
        }

        const [createdConfig] = await tx
          .insert(mcpServerConfigs)
          .values({
            tenantId: input.tenantId,
            organizationId,
            createdBy: input.userId,
            name: input.serverName,
            description: input.serverDescription,
            transportType: input.connection.transportType,
            command:
              input.connection.transportType === 'stdio'
                ? input.connection.command
                : null,
            args:
              input.connection.transportType === 'stdio'
                ? (input.connection.args ?? null)
                : null,
            url:
              input.connection.transportType !== 'stdio'
                ? input.connection.url
                : null,
            connectionFingerprint,
            encryptedData: encryptedFields?.encryptedKey ?? null,
            encryptedDek: encryptedFields?.encryptedDek ?? null,
            iv: encryptedFields?.iv ?? null,
            authTag: encryptedFields?.authTag ?? null,
            status: 'active',
            lastTestedAt: new Date(),
          })
          .returning();

        configId = createdConfig.id;
      }

      const results: ImportedToolResult[] = [];

      for (const toolName of requestedToolNames) {
        const discoveredTool = discoveredToolsByName.get(toolName);

        if (!discoveredTool) {
          results.push({
            toolName,
            status: 'failed',
            reasonCode: 'tool_not_found',
            reasonMessage: `请求导入的工具不存在: ${toolName}`,
          });
          continue;
        }

        const existingTool = existingToolsByName.get(toolName);
        const portMappingMetadata = this.generatePortMapping(discoveredTool);
        const title = this.getToolTitle(discoveredTool);
        const description = discoveredTool.description ?? undefined;
        const inputSchema = this.getToolInputSchema(discoveredTool);
        const annotations = this.getToolAnnotations(discoveredTool);

        if (existingTool && input.conflictStrategy === 'skip') {
          results.push({
            toolDefinitionId: existingTool.id,
            toolName,
            status: 'skipped',
            title: existingTool.title ?? undefined,
            description: existingTool.description ?? undefined,
            reasonCode: 'duplicate_tool',
            reasonMessage: `工具 ${toolName} 已存在，已按 skip 策略跳过`,
          });
          continue;
        }

        if (existingTool && input.conflictStrategy === 'overwrite') {
          const [updatedTool] = await tx
            .update(toolDefinitions)
            .set({
              title,
              description,
              inputSchema,
              annotations,
              portMappingMetadata,
              isActive: true,
              updatedAt: new Date(),
            })
            .where(eq(toolDefinitions.id, existingTool.id))
            .returning();

          results.push({
            toolDefinitionId: updatedTool.id,
            toolName: updatedTool.name,
            status: 'overwritten',
            title: updatedTool.title ?? undefined,
            description: updatedTool.description ?? undefined,
            portMappingMetadata: portMappingMetadata ?? undefined,
          });
          continue;
        }

        const [insertedTool] = await tx
          .insert(toolDefinitions)
          .values({
            tenantId: input.tenantId,
            organizationId,
            mcpServerConfigId: configId,
            source: 'mcp',
            name: toolName,
            title,
            description,
            inputSchema,
            annotations,
            portMappingMetadata,
            isActive: true,
            importedAt: new Date(),
          })
          .returning();

        results.push({
          toolDefinitionId: insertedTool.id,
          toolName: insertedTool.name,
          status: 'imported',
          title: insertedTool.title ?? undefined,
          description: insertedTool.description ?? undefined,
          portMappingMetadata: portMappingMetadata ?? undefined,
        });
      }

      return {
        mcpServerConfigId: configId,
        summary: this.buildImportSummary(results),
        results,
      };
    });
  }

  private async resolveOrganizationId(tenantId: string): Promise<string> {
    const [org] = await this.tenantDb
      .select()
      .from(organizations)
      .where(eq(organizations.tenantId, tenantId));

    if (!org) {
      throw new Error(`租户 ${tenantId} 对应的组织未找到`);
    }

    return org.id;
  }

  private async getSavedConfigOrThrow(
    mcpServerConfigId: string,
    tenantId: string,
  ): Promise<SavedMcpConfig> {
    const [config] = await this.tenantDb
      .select()
      .from(mcpServerConfigs)
      .where(
        and(
          eq(mcpServerConfigs.id, mcpServerConfigId),
          eq(mcpServerConfigs.tenantId, tenantId),
        ),
      );

    if (!config) {
      throw new McpServerConfigNotFoundException(
        `MCP 服务器配置不存在: ${mcpServerConfigId}`,
      );
    }

    return config;
  }

  private async findSavedConfigByFingerprint(
    tenantId: string,
    connectionFingerprint: string,
  ): Promise<SavedMcpConfig | undefined> {
    const selectQuery = this.tenantDb.select();

    if (!this.hasFromClause(selectQuery)) {
      return undefined;
    }

    const [config] = await selectQuery
      .from(mcpServerConfigs)
      .where(
        and(
          eq(mcpServerConfigs.tenantId, tenantId),
          eq(mcpServerConfigs.connectionFingerprint, connectionFingerprint),
        ),
      );

    if (config) {
      return config;
    }

    return await this.findLegacySavedConfigByFingerprint(
      tenantId,
      connectionFingerprint,
    );
  }

  private async findLegacySavedConfigByFingerprint(
    tenantId: string,
    connectionFingerprint: string,
  ): Promise<SavedMcpConfig | undefined> {
    const selectQuery = this.tenantDb.select();

    if (!this.hasFromClause(selectQuery)) {
      return undefined;
    }

    const legacyConfigs = await selectQuery
      .from(mcpServerConfigs)
      .where(eq(mcpServerConfigs.tenantId, tenantId));

    const matchedLegacyConfig = legacyConfigs.find((config) => {
      if (config.connectionFingerprint) {
        return false;
      }

      try {
        const legacyConnection = this.buildConnectionFromSavedConfig(config);

        return (
          this.buildConnectionFingerprint(legacyConnection) ===
          connectionFingerprint
        );
      } catch (error) {
        this.logger.warn(
          `跳过无法回填 fingerprint 的历史 MCP 配置 ${config.id}: ${this.getErrorMessage(error)}`,
        );

        return false;
      }
    });

    if (!matchedLegacyConfig) {
      return undefined;
    }

    const updatedAt = new Date();
    const [updatedConfig] = await this.tenantDb
      .update(mcpServerConfigs)
      .set({
        connectionFingerprint,
        updatedAt,
      })
      .where(eq(mcpServerConfigs.id, matchedLegacyConfig.id))
      .returning();

    return (
      updatedConfig ?? {
        ...matchedLegacyConfig,
        connectionFingerprint,
        updatedAt,
      }
    );
  }

  private async findExistingActiveTools(
    tenantId: string,
    mcpServerConfigId: string,
    toolNames: string[],
  ) {
    if (toolNames.length === 0) {
      return [];
    }

    return await this.tenantDb
      .select()
      .from(toolDefinitions)
      .where(
        and(
          eq(toolDefinitions.tenantId, tenantId),
          eq(toolDefinitions.mcpServerConfigId, mcpServerConfigId),
          eq(toolDefinitions.source, 'mcp'),
          eq(toolDefinitions.isActive, true),
          inArray(toolDefinitions.name, toolNames),
        ),
      );
  }

  private deduplicateToolNames(toolNames: string[]): string[] {
    return Array.from(new Set(toolNames));
  }

  private buildImportSummary(results: ImportedToolResult[]): ImportSummary {
    return results.reduce<ImportSummary>(
      (summary, result) => {
        summary.total += 1;
        summary[result.status] += 1;
        return summary;
      },
      {
        total: 0,
        imported: 0,
        overwritten: 0,
        skipped: 0,
        failed: 0,
      },
    );
  }

  private async discoverToolsForConnection(
    connection: McpConnection,
    operation: McpToolListingOperation,
  ): Promise<DiscoverMcpToolsResponse> {
    const { client, transport } = await this.createAndConnectClient(
      connection,
      CONNECT_TIMEOUT_MS,
      operation,
    );

    try {
      const tools = await this.listAllTools(client, operation);
      const serverVersion = client.getServerVersion();

      return {
        tools: tools.map((tool) => this.toDiscoveredTool(tool)),
        serverInfo: serverVersion
          ? { name: serverVersion.name, version: serverVersion.version }
          : undefined,
      };
    } catch (error) {
      this.handleOperationError(error, connection, operation);
    } finally {
      await this.safeCloseClient(client, transport);
    }
  }

  private async listToolsForConnection(
    connection: McpConnection,
    timeout: number,
    operation: McpToolListingOperation,
  ): Promise<Awaited<ReturnType<Client['listTools']>>['tools']> {
    const { client, transport } = await this.createAndConnectClient(
      connection,
      timeout,
      operation,
    );

    try {
      return await this.listAllTools(client, operation);
    } catch (error) {
      this.handleOperationError(error, connection, operation);
    } finally {
      await this.safeCloseClient(client, transport);
    }
  }

  private toDiscoveredTool(tool: DiscoveredMcpTool) {
    return {
      name: tool.name,
      title: this.getToolTitle(tool),
      description: tool.description,
      inputSchema: this.getToolInputSchema(tool),
      annotations: this.getToolAnnotations(tool),
    };
  }

  private getToolTitle(tool: DiscoveredMcpTool): string | undefined {
    const value = this.getToolMetadataValue(tool, 'title');
    return typeof value === 'string' ? value : undefined;
  }

  private getToolInputSchema(
    tool: DiscoveredMcpTool,
  ): Record<string, unknown> | undefined {
    return this.isPlainObject(tool.inputSchema) ? tool.inputSchema : undefined;
  }

  private getToolAnnotations(
    tool: DiscoveredMcpTool,
  ): Record<string, unknown> | undefined {
    const value = this.getToolMetadataValue(tool, 'annotations');
    return this.isPlainObject(value) ? value : undefined;
  }

  private getToolMetadataValue(tool: DiscoveredMcpTool, key: string): unknown {
    return Reflect.get(tool as object, key);
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private buildConnectionFromSavedConfig(
    config: SavedMcpConfig,
  ): McpConnection {
    const credentials = this.decryptStoredCredentials(config);

    switch (config.transportType) {
      case 'stdio':
        if (!config.command) {
          throw new McpConnectionFailedException(
            '已保存的 MCP stdio 配置缺少 command',
          );
        }

        return {
          transportType: 'stdio',
          command: config.command,
          args: config.args ?? undefined,
          env: credentials ?? undefined,
        };
      case 'sse':
      case 'streamable_http':
        if (!config.url) {
          throw new McpConnectionFailedException(
            '已保存的 MCP HTTP 配置缺少 url',
          );
        }

        return {
          transportType: config.transportType,
          url: config.url,
          headers: credentials ?? undefined,
        };
    }
  }

  private decryptStoredCredentials(
    config: SavedMcpConfig,
  ): Record<string, string> | null {
    if (
      !config.encryptedData ||
      !config.encryptedDek ||
      !config.iv ||
      !config.authTag
    ) {
      return null;
    }

    const decrypted = this.encryptionService.decrypt({
      encryptedKey: config.encryptedData,
      encryptedDek: config.encryptedDek,
      iv: config.iv,
      authTag: config.authTag,
    });

    try {
      const parsed = JSON.parse(decrypted) as unknown;

      if (!this.isStringRecord(parsed)) {
        throw new Error('解密后的凭据不是字符串字典');
      }

      return parsed;
    } catch (error) {
      throw new McpConnectionFailedException(
        `已保存的 MCP 凭据解析失败: ${this.getErrorMessage(error)}`,
      );
    }
  }

  private buildConnectionFingerprint(connection: McpConnection): string {
    const credentials = this.extractCredentials(connection);
    const serializedCredentials = this.serializeCredentialPairs(credentials);
    const fingerprintSource =
      connection.transportType === 'stdio'
        ? [
            connection.transportType,
            connection.command,
            (connection.args ?? []).join(','),
            serializedCredentials,
          ].join('|')
        : [
            connection.transportType,
            connection.url,
            serializedCredentials,
          ].join('|');

    return createHash('sha256').update(fingerprintSource).digest('hex');
  }

  private serializeCredentialPairs(
    credentials: Record<string, string> | null,
  ): string {
    if (!credentials) {
      return '';
    }

    return Object.entries(credentials)
      .map(([key, value]) => [key.toLowerCase(), value] as const)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
  }

  private isStringRecord(value: unknown): value is Record<string, string> {
    return (
      this.isPlainObject(value) &&
      Object.values(value).every((entry) => typeof entry === 'string')
    );
  }

  private hasFromClause(value: unknown): value is {
    from: (table: typeof mcpServerConfigs) => {
      where: (condition: ReturnType<typeof and>) => Promise<SavedMcpConfig[]>;
    };
  } {
    return (
      typeof value === 'object' &&
      value !== null &&
      'from' in value &&
      typeof value.from === 'function'
    );
  }

  private async createAndConnectClient(
    connection: McpConnection,
    timeout: number,
    operation: McpOperation,
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
    operation: McpToolListingOperation,
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

  private createTransport(connection: McpConnection): Transport {
    switch (connection.transportType) {
      case 'stdio':
        return new StdioClientTransport({
          command: connection.command,
          args: connection.args,
          env: connection.env
            ? {
                ...(Object.fromEntries(
                  Object.entries(process.env).filter(
                    (e): e is [string, string] => e[1] != null,
                  ),
                ) as Record<string, string>),
                ...connection.env,
              }
            : undefined,
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
    connection: McpConnection,
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

  private generatePortMapping(tool: {
    inputSchema?: Record<string, unknown>;
  }): { inputs: PortMapping[]; outputs: PortMapping[] } | null {
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
        dataType: this.mapJsonSchemaToPortDataType(name, prop),
        description: prop.description as string | undefined,
        required: requiredFields.has(name),
      }),
    );

    const outputs: PortMapping[] = [
      {
        name: 'tool-out',
        dataType: 'tool' as const,
        description: '工具执行结果',
      },
    ];

    return { inputs, outputs };
  }

  private mapJsonSchemaToPortDataType(
    propertyName: string,
    prop: Record<string, unknown>,
  ): PortMapping['dataType'] {
    const type = prop.type as string | undefined;
    const contentMediaType = prop.contentMediaType as string | undefined;
    const description = ((prop.description as string) ?? '').toLowerCase();
    const nameLower = propertyName.toLowerCase();

    if (contentMediaType) {
      if (contentMediaType.startsWith('image/')) return 'image';
      if (contentMediaType.startsWith('audio/')) return 'audio';
    }

    if (
      this.matchesHeuristic(nameLower, description, ['model', 'llm']) &&
      type === 'string'
    ) {
      return 'model';
    }
    if (
      this.matchesHeuristic(nameLower, description, ['tool', 'function_call'])
    ) {
      return 'tool';
    }
    if (
      this.matchesHeuristic(nameLower, description, [
        'sandbox',
        'runtime',
        'execution_env',
      ])
    ) {
      return 'sandbox';
    }
    if (
      this.matchesHeuristic(nameLower, description, [
        'knowledge',
        'knowledge_base',
        'rag',
        'retrieval',
      ])
    ) {
      return 'knowledge';
    }

    switch (type) {
      case 'string':
        return 'text';
      case 'array':
        return 'array';
      case 'number':
      case 'integer':
      case 'boolean':
      case 'object':
        return 'json';
      default:
        return 'text';
    }
  }

  private matchesHeuristic(
    name: string,
    description: string,
    keywords: string[],
  ): boolean {
    return keywords.some((kw) => name.includes(kw) || description.includes(kw));
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
      this.logger.warn(
        `MCP transport 关闭失败: ${this.getErrorMessage(error)}`,
      );
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

  private getConnectionTarget(connection: McpConnection): string {
    return connection.transportType === 'stdio'
      ? connection.command
      : connection.url;
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private handleOperationError(
    error: unknown,
    connection: McpConnection,
    operation: McpOperation,
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

    throw new McpConnectionFailedException(`MCP ${operation}失败: ${message}`);
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
