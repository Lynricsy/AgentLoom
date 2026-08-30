/**
 * Sandbox 工具注册边界：构建 runtimeConfig 工具集、序列化远程工具描述并校验回调令牌。
 * 数据库事务仅包围 MCP 描述读取；MCP、HTTP、RAG 与代码执行均在事务外发生。
 */
import {
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import {
  asSchema,
  jsonSchema,
  tool,
  type FlexibleSchema,
  type ToolSet,
} from 'ai';
import { and, eq } from 'drizzle-orm';
import { existsSync } from 'node:fs';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import * as schema from '../../database/schema';
import type {
  AgentCodeToolBinding,
  AgentHttpToolBinding,
  AgentKnowledgeBinding,
  AgentMcpToolBinding,
  AgentRuntimeConfig,
  AgentToolBinding,
} from '../agent-definition/agent-runtime-config.interface';
import { RagService } from '../knowledge/services/rag.service';
import { McpService } from '../mcp/mcp.service';
import { SandboxNotFoundException } from '../sandbox/sandbox.exceptions';
import { CodeExecutionService } from './code-execution.service';
import { executeHttpToolRequest } from './http-tool-request.util';
import { normalizeFlexibleSchemaJson } from './tool-schema-converter';
import type { SessionToolProvider } from './ports/agent-runtime.port';
import type { AgentSession } from './types';

const DEFAULT_REMOTE_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: true,
} satisfies Record<string, unknown>;
type AiJsonSchemaInput = Parameters<typeof jsonSchema>[0];
type RemoteToolDescriptor = {
  name: string;
  label: string;
  description: string;
  promptSnippet?: string;
  parameters: Record<string, unknown>;
};
type McpRuntimeToolDescriptor = {
  toolName: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  mcpServerConfigId: string;
};
const HTTP_TOOL_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    query: {
      type: 'object',
      description: '可选 query 参数，会自动附加到 URL',
      additionalProperties: true,
    },
    headers: {
      type: 'object',
      description: '可选请求头，值必须为字符串',
      additionalProperties: { type: 'string' },
    },
    body: {
      description: '非 GET/HEAD 请求时发送的 body；对象会默认序列化为 JSON',
    },
  },
  additionalProperties: true,
} satisfies AiJsonSchemaInput;
const CODE_TOOL_INPUT_SCHEMA = {
  type: 'object',
  properties: { input: { description: '传入代码工具的结构化输入' } },
  additionalProperties: true,
} satisfies AiJsonSchemaInput;
const KNOWLEDGE_TOOL_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    query: { type: 'string', description: '用于知识检索的查询词' },
    knowledgeBaseIds: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      description: '要检索的知识库 ID 列表，必须从当前 Agent 可用知识库中选择',
    },
    topK: { type: 'integer', minimum: 1, description: '可选覆盖返回条数' },
  },
  required: ['query', 'knowledgeBaseIds'],
  additionalProperties: false,
} satisfies AiJsonSchemaInput;

@Injectable()
export class SandboxToolRegistryService {
  private readonly sessionToolProviders = new Map<
    string,
    SessionToolProvider[]
  >();
  private readonly sessionToolCallbackTokens = new Map<string, string>();

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    @Optional() private readonly mcpService?: McpService,
    @Optional() private readonly ragService?: RagService,
    @Optional() private readonly codeExecutionService?: CodeExecutionService,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  initializeSession(sessionId: string): void {
    this.sessionToolCallbackTokens.set(sessionId, randomUUID());
  }

  registerSessionToolProvider(
    sessionId: string,
    provider: SessionToolProvider,
  ): void {
    const providers = this.sessionToolProviders.get(sessionId) ?? [];
    providers.push(provider);
    this.sessionToolProviders.set(sessionId, providers);
  }

  unregisterSessionToolProvider(sessionId: string): void {
    this.sessionToolProviders.delete(sessionId);
  }

  disposeSession(sessionId: string): void {
    this.unregisterSessionToolProvider(sessionId);
    this.sessionToolCallbackTokens.delete(sessionId);
  }
  createRuntimeConfigToolProvider(
    session: AgentSession,
    runtimeConfig?: AgentRuntimeConfig,
  ): SessionToolProvider | null {
    if (!runtimeConfig) {
      return null;
    }

    const hasCanvasTools = (runtimeConfig.tools?.length ?? 0) > 0;
    const hasKnowledgeBindings =
      (runtimeConfig.knowledgeBindings?.length ?? 0) > 0;
    if (!hasCanvasTools && !hasKnowledgeBindings) {
      return null;
    }

    let cachedToolSetPromise: Promise<ToolSet> | null = null;
    return () => {
      cachedToolSetPromise ??= this.buildRuntimeConfigToolSet(
        session,
        runtimeConfig,
      );
      return cachedToolSetPromise;
    };
  }

  private async buildRuntimeConfigToolSet(
    session: AgentSession,
    runtimeConfig: AgentRuntimeConfig,
  ): Promise<ToolSet> {
    const toolSet: ToolSet = {};

    for (const binding of runtimeConfig.tools ?? []) {
      if (binding.enabled === false) {
        continue;
      }

      const normalizedBinding = this.normalizeToolBinding(binding);
      if (!normalizedBinding) {
        continue;
      }

      if (normalizedBinding.toolType === 'mcp') {
        const mcpEntry = await this.buildMcpToolEntry(
          session,
          normalizedBinding,
        );
        if (mcpEntry) {
          toolSet[mcpEntry.name] = mcpEntry.tool;
        }
        continue;
      }

      if (normalizedBinding.toolType === 'http') {
        const httpEntry = this.buildHttpToolEntry(normalizedBinding);
        toolSet[httpEntry.name] = httpEntry.tool;
        continue;
      }

      const codeEntry = this.buildCodeToolEntry(normalizedBinding);
      toolSet[codeEntry.name] = codeEntry.tool;
    }

    const enabledKnowledgeBindings = (
      runtimeConfig.knowledgeBindings ?? []
    ).filter((binding) => binding.enabled !== false);
    if (enabledKnowledgeBindings.length > 0) {
      const knowledgeEntry = this.buildKnowledgeToolEntry(
        session,
        enabledKnowledgeBindings,
      );
      if (knowledgeEntry) {
        toolSet[knowledgeEntry.name] = knowledgeEntry.tool;
      }
    }

    return toolSet;
  }

  private normalizeToolBinding(
    binding: AgentToolBinding,
  ): AgentMcpToolBinding | AgentHttpToolBinding | AgentCodeToolBinding | null {
    const mcpBinding = binding as Partial<AgentMcpToolBinding>;

    if (
      (typeof mcpBinding.mcpToolDefinitionId === 'string' &&
        mcpBinding.mcpToolDefinitionId.length > 0) ||
      (mcpBinding.mcpServerConfigId !== undefined &&
        mcpBinding.toolName !== undefined) ||
      binding.toolType === 'mcp'
    ) {
      return {
        ...binding,
        toolType: 'mcp',
      } as AgentMcpToolBinding;
    }

    if (
      binding.toolType === 'http' ||
      (typeof (binding as Partial<AgentHttpToolBinding>).url === 'string' &&
        (binding as Partial<AgentHttpToolBinding>).url!.length > 0)
    ) {
      const url = (binding as Partial<AgentHttpToolBinding>).url;
      if (typeof url !== 'string' || url.length === 0) {
        return null;
      }

      return {
        ...binding,
        toolType: 'http',
        url,
        method: (binding as Partial<AgentHttpToolBinding>).method,
      } as AgentHttpToolBinding;
    }

    if (
      binding.toolType === 'code' ||
      typeof (binding as Partial<AgentCodeToolBinding>).language === 'string'
    ) {
      const language = (binding as Partial<AgentCodeToolBinding>).language;
      if (
        language !== 'typescript' &&
        language !== 'javascript' &&
        language !== 'python' &&
        language !== 'bash'
      ) {
        return null;
      }

      return {
        ...binding,
        toolType: 'code',
        language,
        code: (binding as Partial<AgentCodeToolBinding>).code,
      } as AgentCodeToolBinding;
    }

    return null;
  }

  private async buildMcpToolEntry(
    session: AgentSession,
    binding: AgentMcpToolBinding,
  ): Promise<{ name: string; tool: ToolSet[string] } | null> {
    const descriptor = await this.resolveMcpToolDescriptor(session, binding);
    if (!descriptor) {
      return null;
    }

    const toolName = this.sanitizeToolName(
      binding.name || descriptor.toolName,
      descriptor.toolName,
    );
    const inputSchema = this.resolveMcpInputSchema(
      descriptor.inputSchema ?? binding.inputSchema,
    );

    return {
      name: toolName,
      tool: tool({
        description: binding.description ?? descriptor.description,
        inputSchema,
        execute: async (input) => {
          const args = this.normalizeExecuteArgs(
            input,
            binding.parameterOverrides,
          );
          const connection = await this.mcpService!.resolveRuntimeConnection(
            descriptor.mcpServerConfigId,
            session.tenantId!,
          );
          this.assertMcpTransportAllowed(session, connection.transportType);
          const result = await this.mcpService!.callRuntimeTool(
            connection,
            descriptor.toolName,
            args,
          );

          return result;
        },
      }),
    };
  }

  private async resolveMcpToolDescriptor(
    session: AgentSession,
    binding: AgentMcpToolBinding,
  ): Promise<McpRuntimeToolDescriptor | null> {
    const tenantId = session.tenantId;
    if (!tenantId || !this.mcpService) {
      return null;
    }

    if (binding.mcpToolDefinitionId) {
      const storedTool = await runInTenantTransaction(
        this.db,
        tenantId,
        async () => {
          const [record] = await this.tenantDb
            .select({
              mcpServerConfigId: schema.toolDefinitions.mcpServerConfigId,
              name: schema.toolDefinitions.name,
              title: schema.toolDefinitions.title,
              description: schema.toolDefinitions.description,
              inputSchema: schema.toolDefinitions.inputSchema,
            })
            .from(schema.toolDefinitions)
            .where(
              and(
                eq(schema.toolDefinitions.id, binding.mcpToolDefinitionId!),
                eq(schema.toolDefinitions.tenantId, tenantId),
                eq(schema.toolDefinitions.isActive, true),
              ),
            );

          return record;
        },
      );

      if (storedTool?.mcpServerConfigId && storedTool.name) {
        return {
          mcpServerConfigId: storedTool.mcpServerConfigId,
          toolName: storedTool.name,
          description:
            binding.description ??
            storedTool.description ??
            storedTool.title ??
            binding.name,
          inputSchema: this.asRecord(storedTool.inputSchema) ?? undefined,
        };
      }
    }

    if (binding.mcpServerConfigId && binding.toolName) {
      return {
        mcpServerConfigId: binding.mcpServerConfigId,
        toolName: binding.toolName,
        description: binding.description ?? binding.name,
        inputSchema: binding.inputSchema,
      };
    }

    return null;
  }

  private buildHttpToolEntry(binding: AgentHttpToolBinding): {
    name: string;
    tool: ToolSet[string];
  } {
    const name = this.sanitizeToolName(binding.name, `http_${binding.toolId}`);
    const method = binding.method ?? 'GET';

    return {
      name,
      tool: tool({
        description:
          binding.description ?? `通过 ${method} ${binding.url} 调用 HTTP 接口`,
        inputSchema: jsonSchema(HTTP_TOOL_INPUT_SCHEMA),
        execute: async (input) => {
          const args = this.normalizeExecuteArgs(
            input,
            binding.parameterOverrides,
          );
          const response = await this.executeHttpToolRequest(binding, args);
          return response;
        },
      }),
    };
  }

  private buildCodeToolEntry(binding: AgentCodeToolBinding): {
    name: string;
    tool: ToolSet[string];
  } {
    const name = this.sanitizeToolName(binding.name, `code_${binding.toolId}`);

    return {
      name,
      tool: tool({
        description: binding.description ?? `执行 ${binding.language} 代码片段`,
        inputSchema: jsonSchema(CODE_TOOL_INPUT_SCHEMA),
        execute: async (input) => {
          const args = this.normalizeExecuteArgs(
            input,
            binding.parameterOverrides,
          );

          if (!this.codeExecutionService) {
            return {
              success: false,
              message: `Sandbox runtime 未配置 CodeExecutionService，无法执行 ${binding.language} 代码工具。`,
              toolId: binding.toolId,
              language: binding.language,
              code: binding.code ?? '',
              input: args,
            };
          }

          const result = await this.codeExecutionService.execute({
            language: binding.language,
            code: binding.code ?? '',
            input: args,
            timeout: binding.timeout ?? 30,
          });
          return result;
        },
      }),
    };
  }

  private buildKnowledgeToolEntry(
    session: AgentSession,
    bindings: AgentKnowledgeBinding[],
  ): { name: string; tool: ToolSet[string] } | null {
    if (!session.tenantId || !this.ragService) {
      return null;
    }

    const availableKnowledgeBaseIds = Array.from(
      new Set(bindings.map((binding) => binding.knowledgeBaseId)),
    );
    const name = this.sanitizeToolName('search_knowledge', 'search_knowledge');

    return {
      name,
      tool: tool({
        description: `从指定知识库中检索相关内容。调用时必须显式传 knowledgeBaseIds。当前可用知识库: ${availableKnowledgeBaseIds.join(', ')}`,
        inputSchema: jsonSchema(KNOWLEDGE_TOOL_INPUT_SCHEMA),
        execute: async (input) => {
          const args = this.normalizeExecuteArgs(input);
          const query = typeof args.query === 'string' ? args.query : '';
          const requestedKnowledgeBaseIds = Array.isArray(args.knowledgeBaseIds)
            ? args.knowledgeBaseIds.filter(
                (value): value is string =>
                  typeof value === 'string' && value.length > 0,
              )
            : [];

          if (requestedKnowledgeBaseIds.length === 0) {
            throw new Error('search_knowledge 必须提供 knowledgeBaseIds');
          }

          const invalidKnowledgeBaseIds = requestedKnowledgeBaseIds.filter(
            (knowledgeBaseId) =>
              !availableKnowledgeBaseIds.includes(knowledgeBaseId),
          );
          if (invalidKnowledgeBaseIds.length > 0) {
            throw new Error(
              `search_knowledge 只能访问已连接知识库，非法 ID: ${invalidKnowledgeBaseIds.join(', ')}`,
            );
          }

          const selectedBindings = bindings.filter((binding) =>
            requestedKnowledgeBaseIds.includes(binding.knowledgeBaseId),
          );
          const topK =
            typeof args.topK === 'number' && Number.isFinite(args.topK)
              ? Math.max(1, Math.trunc(args.topK))
              : Math.max(
                  8,
                  ...selectedBindings.map((binding) => binding.topK ?? 0),
                );
          const scoreThreshold =
            selectedBindings.length === 1
              ? selectedBindings[0]?.similarityThreshold
              : undefined;

          const results = await this.ragService!.search(
            query,
            session.tenantId!,
            {
              knowledgeBaseIds: requestedKnowledgeBaseIds,
              limit: topK,
              ...(scoreThreshold === undefined ? {} : { scoreThreshold }),
            },
          );

          return {
            knowledgeBaseIds: requestedKnowledgeBaseIds,
            total: results.length,
            results,
          };
        },
      }),
    };
  }

  private resolveMcpInputSchema(
    inputSchema?: Record<string, unknown>,
  ): FlexibleSchema<Record<string, unknown>> {
    return jsonSchema(normalizeFlexibleSchemaJson(inputSchema));
  }

  private normalizeExecuteArgs(
    input: unknown,
    parameterOverrides?: Record<string, unknown>,
  ): Record<string, unknown> {
    const normalized = this.asRecord(input) ?? {};
    return parameterOverrides
      ? { ...normalized, ...parameterOverrides }
      : normalized;
  }

  private async executeHttpToolRequest(
    binding: AgentHttpToolBinding,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return executeHttpToolRequest(binding, input);
  }

  private assertMcpTransportAllowed(
    session: AgentSession,
    transportType: string,
  ): void {
    if (
      session.runtimeConfig?.runtimeMode === 'no_sandbox' &&
      transportType === 'stdio'
    ) {
      throw new Error('无 sandbox Agent 只能使用 HTTP MCP，禁止执行 stdio MCP');
    }
  }

  private sanitizeToolName(
    rawName: string | undefined,
    fallback: string,
  ): string {
    const candidate = (rawName ?? fallback).trim();
    const sanitized = candidate.replace(/[^a-zA-Z0-9_/-]+/g, '_');
    if (sanitized.length === 0) {
      return fallback;
    }

    return /^[a-zA-Z_]/.test(sanitized) ? sanitized : `tool_${sanitized}`;
  }

  async buildRemoteToolExecutionPayload(
    sessionId: string,
  ): Promise<Record<string, unknown>> {
    const tools = await this.serializeRemoteToolDescriptors(sessionId);
    if (tools.length === 0) {
      return {};
    }

    return {
      remoteToolExecution: {
        sessionId,
        callbackUrl: this.buildSessionToolExecutionCallbackUrl(sessionId),
        callbackToken: this.resolveSessionToolCallbackToken(sessionId),
        tools,
      },
    };
  }

  private async serializeRemoteToolDescriptors(
    sessionId: string,
  ): Promise<RemoteToolDescriptor[]> {
    const toolSet = await this.resolveSessionToolSet(sessionId);
    return await Promise.all(
      Object.entries(toolSet).map(async ([toolName, tool]) => ({
        name: toolName,
        label: toolName,
        description:
          this.readString(tool.description) ?? `Session tool ${toolName}`,
        promptSnippet: this.buildRemoteToolPromptSnippet(
          toolName,
          this.readString(tool.description),
        ),
        parameters: await this.serializeToolParameters(tool.inputSchema),
      })),
    );
  }

  private async serializeToolParameters(
    inputSchema: unknown,
  ): Promise<Record<string, unknown>> {
    if (!inputSchema) {
      return DEFAULT_REMOTE_TOOL_SCHEMA;
    }

    const schema = await asSchema(
      inputSchema as FlexibleSchema<Record<string, unknown>>,
    ).jsonSchema;
    return this.isRecord(schema) ? schema : DEFAULT_REMOTE_TOOL_SCHEMA;
  }

  private buildRemoteToolPromptSnippet(
    toolName: string,
    description?: string,
  ): string {
    const normalizedDescription = description?.trim();
    return normalizedDescription && normalizedDescription.length > 0
      ? normalizedDescription
      : `Use ${toolName} when its capability is needed.`;
  }

  private resolveSessionToolCallbackToken(sessionId: string): string {
    const callbackToken = this.sessionToolCallbackTokens.get(sessionId);
    if (!callbackToken) {
      throw new SandboxNotFoundException(
        `Sandbox session tool callback token not found: ${sessionId}`,
      );
    }
    return callbackToken;
  }

  private buildSessionToolExecutionCallbackUrl(sessionId: string): string {
    const apiBaseUrl = this.resolveSessionToolCallbackApiBaseUrl();
    return `${apiBaseUrl}/agent-runtime/sessions/${encodeURIComponent(sessionId)}/tool-executions`;
  }

  private resolveSessionToolCallbackApiBaseUrl(): string {
    const configuredBaseUrl = this.normalizeString(
      process.env.APP_SANDBOX_CALLBACK_BASE_URL,
    );
    if (configuredBaseUrl) {
      return configuredBaseUrl.replace(/\/$/, '');
    }

    const appPort = this.normalizeString(process.env.APP_PORT) ?? '3000';
    if (this.isRunningInContainer()) {
      const hostname = this.normalizeString(process.env.HOSTNAME);
      if (hostname) {
        return `http://${hostname}:${appPort}/api/v1`;
      }
    }

    return `http://host.docker.internal:${appPort}/api/v1`;
  }

  private isRunningInContainer(): boolean {
    return existsSync('/.dockerenv');
  }

  assertValidSessionToolCallbackToken(
    sessionId: string,
    callbackToken?: string,
  ): void {
    const expectedToken = this.resolveSessionToolCallbackToken(sessionId);
    const providedToken = this.normalizeString(callbackToken);

    if (!providedToken) {
      throw new UnauthorizedException(
        'Sandbox session tool callback token is required',
      );
    }

    const expectedBuffer = Buffer.from(expectedToken, 'utf8');
    const providedBuffer = Buffer.from(providedToken, 'utf8');
    if (
      expectedBuffer.length !== providedBuffer.length ||
      !timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      throw new UnauthorizedException(
        'Sandbox session tool callback token is invalid',
      );
    }
  }

  async resolveSessionToolSet(sessionId: string): Promise<ToolSet> {
    const providers = this.sessionToolProviders.get(sessionId) ?? [];
    const toolSet: ToolSet = {};

    for (const provider of providers) {
      Object.assign(toolSet, await provider());
    }

    return toolSet;
  }

  async resolveSessionTool(
    sessionId: string,
    toolName: string,
  ): Promise<ToolSet[string]> {
    const toolSet = await this.resolveSessionToolSet(sessionId);
    const tool = toolSet[toolName];
    if (!tool) {
      throw new SandboxNotFoundException(
        `Sandbox session tool "${toolName}" not found for session ${sessionId}`,
      );
    }
    return tool;
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
  private asRecord(value: unknown): Record<string, unknown> | undefined {
    return this.isRecord(value) ? value : undefined;
  }
  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
  private normalizeString(value?: string | null): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
}
