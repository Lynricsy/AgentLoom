import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { jsonSchema, tool, type ToolSet } from 'ai';
import {
  type IAgentRuntime,
  type SessionToolProvider,
} from '../../agent/ports/agent-runtime.port';
import type { McpServerConfig } from '../../agent/types/agent-session.types';
import {
  McpService,
  type McpRuntimeConnection,
  type McpRuntimeDiscoveredTool,
} from '../../mcp/mcp.service';
import type { AcpTrackedSession } from '../acp-types';
import { resolveAcpAgentRuntime } from '../resolve-acp-agent-runtime';

type SessionMcpServers = Readonly<Record<string, McpServerConfig>>;

type SessionMcpToolRecord = {
  namespacedToolName: string;
  sourceToolName: string;
  connection: McpRuntimeConnection;
  description: string;
  inputSchema?: Record<string, unknown>;
};

type SessionMcpRegistryEntry = {
  tools: ReadonlyArray<SessionMcpToolRecord>;
  provider: SessionToolProvider;
};

type AiJsonSchemaInput = Parameters<typeof jsonSchema>[0];

const DEFAULT_TOOL_INPUT_SCHEMA: AiJsonSchemaInput = {
  type: 'object',
  properties: {},
  additionalProperties: true,
};

const MAX_TOOL_CALL_ATTEMPTS = 3;

@Injectable()
export class AcpSessionMcpRegistryService {
  private readonly logger = new Logger(AcpSessionMcpRegistryService.name);
  private readonly registry = new Map<string, SessionMcpRegistryEntry>();

  private agentRuntime?: IAgentRuntime;

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly mcpService: McpService,
  ) {}

  async bootstrapSessionTools(
    trackedSession: AcpTrackedSession,
    mcpServers: SessionMcpServers | undefined,
  ): Promise<void> {
    await this.registerSessionTools(trackedSession, mcpServers);
  }

  async restoreSessionTools(
    trackedSession: AcpTrackedSession,
    mcpServers: SessionMcpServers | undefined,
  ): Promise<void> {
    await this.registerSessionTools(trackedSession, mcpServers);
  }

  async cleanupSessionTools(trackedSession: AcpTrackedSession): Promise<void> {
    this.registry.delete(trackedSession.runtimeSessionId);
    this.getAgentRuntime().unregisterSessionToolProvider?.(
      trackedSession.runtimeSessionId,
    );
  }

  private async registerSessionTools(
    trackedSession: AcpTrackedSession,
    mcpServers: SessionMcpServers | undefined,
  ): Promise<void> {
    await this.cleanupSessionTools(trackedSession);

    if (!mcpServers || Object.keys(mcpServers).length === 0) {
      return;
    }

    const tools = await this.buildSessionToolRecords(mcpServers);
    const provider = this.buildSessionToolProvider(tools);
    const runtime = this.getRuntimeWithToolProviderSupport();

    runtime.registerSessionToolProvider?.(
      trackedSession.runtimeSessionId,
      provider,
    );
    this.registry.set(trackedSession.runtimeSessionId, {
      tools,
      provider,
    });
  }

  private getRuntimeWithToolProviderSupport(): IAgentRuntime {
    const runtime = this.getAgentRuntime();

    if (
      !runtime.registerSessionToolProvider ||
      !runtime.unregisterSessionToolProvider
    ) {
      throw new Error('Agent runtime does not support session-local MCP tools');
    }

    return runtime;
  }

  private getAgentRuntime(): IAgentRuntime {
    if (!this.agentRuntime) {
      this.agentRuntime = resolveAcpAgentRuntime(this.moduleRef);
    }

    return this.agentRuntime;
  }

  private async buildSessionToolRecords(
    mcpServers: SessionMcpServers,
  ): Promise<ReadonlyArray<SessionMcpToolRecord>> {
    const tools: SessionMcpToolRecord[] = [];

    for (const [serverName, config] of Object.entries(mcpServers)) {
      const connection = this.normalizeConnection(serverName, config);
      const discoveredTools =
        await this.mcpService.discoverRuntimeTools(connection);

      for (const discoveredTool of discoveredTools) {
        tools.push(
          this.toSessionToolRecord(serverName, connection, discoveredTool),
        );
      }
    }

    return tools;
  }

  private buildSessionToolProvider(
    toolRecords: ReadonlyArray<SessionMcpToolRecord>,
  ): SessionToolProvider {
    return async (): Promise<ToolSet> => {
      const tools: ToolSet = {};

      for (const toolRecord of toolRecords) {
        tools[toolRecord.namespacedToolName] = tool({
          description: toolRecord.description,
          inputSchema: jsonSchema(this.toJsonSchema(toolRecord.inputSchema)),
          execute: async (input) => {
            return await this.executeToolWithRetry(toolRecord, input);
          },
        });
      }

      return tools;
    };
  }

  private async executeToolWithRetry(
    toolRecord: SessionMcpToolRecord,
    input: unknown,
  ): Promise<unknown> {
    const args = this.normalizeToolInput(input);
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_TOOL_CALL_ATTEMPTS; attempt += 1) {
      try {
        return await this.mcpService.callRuntimeTool(
          toolRecord.connection,
          toolRecord.sourceToolName,
          args,
        );
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `ACP MCP 工具调用失败，准备重试 ${toolRecord.namespacedToolName} (${attempt}/${MAX_TOOL_CALL_ATTEMPTS}): ${this.getErrorMessage(error)}`,
        );
      }
    }

    throw new Error(
      `MCP tool ${toolRecord.namespacedToolName} unavailable: ${this.getErrorMessage(lastError)}`,
    );
  }

  private toSessionToolRecord(
    serverName: string,
    connection: McpRuntimeConnection,
    toolDefinition: McpRuntimeDiscoveredTool,
  ): SessionMcpToolRecord {
    return {
      namespacedToolName: `${serverName}/${toolDefinition.name}`,
      sourceToolName: toolDefinition.name,
      connection,
      description:
        toolDefinition.description ??
        toolDefinition.title ??
        `${serverName}/${toolDefinition.name}`,
      ...(toolDefinition.inputSchema === undefined
        ? {}
        : { inputSchema: toolDefinition.inputSchema }),
    };
  }

  private normalizeConnection(
    serverName: string,
    config: McpServerConfig,
  ): McpRuntimeConnection {
    switch (config.transportType) {
      case 'stdio':
        if (typeof config.command !== 'string' || config.command.length === 0) {
          throw new Error(`MCP server ${serverName} is missing stdio command`);
        }

        return {
          transportType: 'stdio',
          command: config.command,
          ...(config.args === undefined
            ? {}
            : { args: this.readStringArray(config.args) }),
          ...(config.env === undefined
            ? {}
            : { env: this.readStringRecord(config.env) }),
        };
      case 'sse':
      case 'streamable_http':
        if (typeof config.url !== 'string' || config.url.length === 0) {
          throw new Error(`MCP server ${serverName} is missing url`);
        }

        return {
          transportType: config.transportType,
          url: config.url,
          ...(config.headers === undefined
            ? {}
            : { headers: this.readStringRecord(config.headers) }),
        };
      default:
        throw new Error(`MCP server ${serverName} has unsupported transport`);
    }
  }

  private readStringArray(value: unknown): string[] {
    if (
      !Array.isArray(value) ||
      value.some((entry) => typeof entry !== 'string')
    ) {
      throw new Error('MCP stdio args must be a string array');
    }

    return value;
  }

  private readStringRecord(value: unknown): Record<string, string> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('MCP credentials must be a string record');
    }

    const entries = Object.entries(value);
    if (entries.some(([, entry]) => typeof entry !== 'string')) {
      throw new Error('MCP credentials must be a string record');
    }

    return Object.fromEntries(entries);
  }

  private normalizeToolInput(input: unknown): Record<string, unknown> {
    if (!this.isPlainObject(input)) {
      return {};
    }

    return Object.fromEntries(Object.entries(input));
  }

  private toJsonSchema(
    schema: Record<string, unknown> | undefined,
  ): AiJsonSchemaInput {
    if (schema === undefined) {
      return DEFAULT_TOOL_INPUT_SCHEMA;
    }

    return schema as AiJsonSchemaInput;
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
