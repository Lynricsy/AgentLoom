import { Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { jsonSchema, tool, type LanguageModel, type ToolSet } from 'ai';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../../database/schema';
import { type DrizzleDB } from '../../database/database.module';
import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import type {
  AgentCodeToolBinding,
  AgentHttpToolBinding,
  AgentKnowledgeBinding,
  AgentMcpToolBinding,
  AgentRuntimeConfig,
  AgentToolBinding,
} from '../agent-definition/agent-runtime-config.interface';
import { RagService } from '../knowledge/services/rag.service';
import { PiAiAdapter } from '../llm/pi-ai-adapter';
import { McpService } from '../mcp/mcp.service';
import type {
  IAgentRuntime,
  SessionToolProvider,
} from './ports/agent-runtime.port';
import { importPiAgentCore } from './pi-imports';
import { createVercelStreamFn } from './stream-fn.adapter';
import { typeBoxToZod, zodToTypeBox } from './tool-schema-converter';
import type { AgentEvent, StopReason } from './types/agent-event.types';
import type {
  AgentSession,
  CreateSessionParams,
  SessionContext,
} from './types/agent-session.types';
import type { ContentBlock } from './types/content-block.types';
import type {
  ToolCallEvent,
  ToolPermissionRequest,
} from './types/tool-call-event.types';

const PERMISSION_EXEMPT_TOOLS = new Set([
  'call_subagent',
  'spawn_subagent',
  'wait_for_subagents',
  'get_subagent_status',
]);

type PiToolCallShape = {
  id?: string;
  toolCallId?: string;
  name?: string;
  toolName?: string;
  arguments?: Record<string, unknown>;
};

type PiBeforeToolCallContext = {
  toolCall?: PiToolCallShape;
  args?: unknown;
};

type PiAgentEndEvent = {
  type: 'agent_end';
  messages?: Array<{
    stopReason?: string;
    errorMessage?: string;
  }>;
};

type PiAgentTool = {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  execute: (
    toolCallId: string,
    params: unknown,
    signal?: AbortSignal,
    onUpdate?: (partialResult: unknown) => void,
  ) => Promise<{
    content: Array<{ type: 'text'; text: string }>;
    details: unknown;
  }>;
};

type PiAgentInstance = {
  prompt: (input: string) => Promise<void>;
  abort: () => void;
  subscribe: (listener: (event: Record<string, unknown>) => void) => () => void;
  setTools?: (tools: PiAgentTool[]) => void;
  streamFn?: unknown;
};

type PiAgentCoreModule = {
  Agent: new (options: Record<string, unknown>) => PiAgentInstance;
};

type PermissionResolution = 'approve' | 'deny' | 'cancelled';

interface PendingPermissionGate {
  readonly resolve: (action: PermissionResolution) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

interface RuntimeSession {
  readonly session: AgentSession;
  readonly agent: PiAgentInstance;
  readonly model: LanguageModel;
  activeSink?: AsyncAgentEventSink;
}

type AiJsonSchemaInput = Parameters<typeof jsonSchema>[0];

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
  properties: {
    input: {
      description: '传入代码工具的结构化输入',
    },
  },
  additionalProperties: true,
} satisfies AiJsonSchemaInput;

const KNOWLEDGE_TOOL_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: '用于知识检索的查询词',
    },
    topK: {
      type: 'integer',
      minimum: 1,
      description: '可选覆盖返回条数',
    },
  },
  required: ['query'],
  additionalProperties: false,
} satisfies AiJsonSchemaInput;

class AsyncAgentEventSink implements AsyncIterable<AgentEvent> {
  private readonly buffer: AgentEvent[] = [];
  private readonly waiters: Array<{
    resolve: (value: IteratorResult<AgentEvent>) => void;
    reject: (error: unknown) => void;
  }> = [];
  private closed = false;
  private failure: Error | null = null;

  emit(event: AgentEvent): void {
    if (this.closed || this.failure) {
      return;
    }

    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve({ done: false, value: event });
      return;
    }

    this.buffer.push(event);
  }

  close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    for (const waiter of this.waiters.splice(0)) {
      waiter.resolve({
        done: true,
        value: undefined as never,
      });
    }
  }

  fail(error: unknown): void {
    if (this.failure) {
      return;
    }

    this.failure = error instanceof Error ? error : new Error(String(error));
    for (const waiter of this.waiters.splice(0)) {
      waiter.reject(this.failure);
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<AgentEvent> {
    return {
      next: () => {
        if (this.buffer.length > 0) {
          return Promise.resolve({
            done: false,
            value: this.buffer.shift()!,
          });
        }

        if (this.failure) {
          return Promise.reject(this.failure);
        }

        if (this.closed) {
          return Promise.resolve({
            done: true,
            value: undefined as never,
          });
        }

        return new Promise<IteratorResult<AgentEvent>>((resolve, reject) => {
          this.waiters.push({ resolve, reject });
        });
      },
    };
  }
}

@Injectable()
export class PiAgentCoreAdapter implements IAgentRuntime {
  private readonly sessions = new Map<string, RuntimeSession>();
  private readonly sessionToolProviders = new Map<
    string,
    SessionToolProvider[]
  >();
  private readonly pendingPermissionResolvers = new Map<
    string,
    Map<string, PendingPermissionGate>
  >();
  private readonly deniedToolCalls = new Map<string, Set<string>>();

  constructor(
    private readonly db: DrizzleDB,
    private readonly piAiAdapter: PiAiAdapter,
    @Optional() private readonly mcpService?: McpService,
    @Optional() private readonly ragService?: RagService,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  async createSession(params: CreateSessionParams): Promise<AgentSession> {
    const session: AgentSession = {
      id: randomUUID(),
      agentId: params.agentId,
      mode: params.mode,
      context: this.buildSessionContext(params),
      status: 'active',
      tenantId: params.tenantId,
      llmModelConfigId: params.llmModelConfigId,
      systemPrompt: params.systemPrompt,
      autonomyMode: params.autonomyMode,
      runtimeConfig: params.runtimeConfig,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const runtimeConfigProvider = this.createRuntimeConfigToolProvider(
      session,
      params.runtimeConfig,
    );
    if (runtimeConfigProvider) {
      this.registerSessionToolProvider(session.id, runtimeConfigProvider);
    }

    const toolSet = await this.resolveSessionTools(session.id);
    const modelConfig = await this.resolveModelConfig(session);
    const model = (await this.piAiAdapter.getModel(
      modelConfig,
    )) as LanguageModel;
    const streamFn = createVercelStreamFn(model, toolSet);
    const tools = this.convertToolSetToPiTools(toolSet);
    const piAgentCore =
      (await importPiAgentCore()) as unknown as PiAgentCoreModule;
    const agent = new piAgentCore.Agent({
      initialState: {
        systemPrompt: params.systemPrompt ?? '',
        model,
        tools,
      },
      streamFn,
      sessionId: session.id,
      beforeToolCall: async (
        context: PiBeforeToolCallContext,
        signal?: AbortSignal,
      ) => this.beforeToolCall(session.id, context, signal),
    });

    this.sessions.set(session.id, {
      session,
      agent,
      model,
    });

    return session;
  }

  async loadSession(sessionId: string): Promise<AgentSession> {
    return this.getRuntimeSession(sessionId).session;
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

  async *prompt(
    sessionId: string,
    content: ContentBlock[],
  ): AsyncGenerator<AgentEvent> {
    const runtimeSession = this.getRuntimeSession(sessionId);
    const { session, agent } = runtimeSession;
    const toolSet = await this.resolveSessionTools(sessionId);

    agent.setTools?.(this.convertToolSetToPiTools(toolSet));
    agent.streamFn = createVercelStreamFn(runtimeSession.model, toolSet);

    session.context.history.push(...content);
    session.status = 'active';
    session.updatedAt = new Date();

    const promptText = this.serializeContentBlocks(content);
    const sink = new AsyncAgentEventSink();
    let accumulatedText = '';

    runtimeSession.activeSink = sink;

    const unsubscribe = agent.subscribe((event) => {
      const translated = this.translatePiEvent(sessionId, event);
      for (const item of translated) {
        if (item.type === 'message_chunk') {
          accumulatedText += item.content;
        }
        sink.emit(item);
      }
    });

    const promptPromise = agent
      .prompt(promptText)
      .catch((error) => {
        session.status = 'error';
        sink.fail(error);
      })
      .finally(() => {
        unsubscribe();
        runtimeSession.activeSink = undefined;
        this.clearPendingPermissions(sessionId, 'cancelled');
        this.clearDeniedToolCallCache(sessionId);
        if (accumulatedText.length > 0) {
          session.context.history.push({
            type: 'text',
            text: accumulatedText,
          });
        }
        if (session.status !== 'completed' && session.status !== 'error') {
          session.status = 'active';
        }
        session.updatedAt = new Date();
        sink.close();
      });

    try {
      for await (const event of sink) {
        yield event;
      }
      await promptPromise;
    } finally {
      await promptPromise;
    }
  }

  async cancel(sessionId: string): Promise<void> {
    const runtimeSession = this.sessions.get(sessionId);
    if (!runtimeSession) {
      return;
    }

    runtimeSession.agent.abort();
    runtimeSession.session.status = 'completed';
    runtimeSession.session.updatedAt = new Date();
    this.clearPendingPermissions(sessionId, 'cancelled');
    this.clearDeniedToolCallCache(sessionId);
  }

  async resolveToolPermission(
    sessionId: string,
    toolCallId: string,
    action: 'approve' | 'deny',
  ): Promise<void> {
    const sessionResolvers = this.pendingPermissionResolvers.get(sessionId);
    const gate = sessionResolvers?.get(toolCallId);

    if (!gate) {
      throw new Error(
        `Session ${sessionId} has no pending tool permission for ${toolCallId}`,
      );
    }

    clearTimeout(gate.timer);
    sessionResolvers?.delete(toolCallId);
    if (sessionResolvers?.size === 0) {
      this.pendingPermissionResolvers.delete(sessionId);
    }

    gate.resolve(action);
  }

  private buildSessionContext(params: CreateSessionParams): SessionContext {
    return {
      history: [],
      ...(params.cwd === undefined ? {} : { cwd: params.cwd }),
      ...(params.mcpServers === undefined
        ? {}
        : { mcpServers: params.mcpServers }),
      ...(params.serverSandbox === undefined
        ? {}
        : { serverSandbox: params.serverSandbox }),
      ...(params.mode === 'workflow' && params.context !== undefined
        ? { workflowState: params.context }
        : {}),
    };
  }

  private getRuntimeSession(sessionId: string): RuntimeSession {
    const runtimeSession = this.sessions.get(sessionId);
    if (!runtimeSession) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    return runtimeSession;
  }

  private createRuntimeConfigToolProvider(
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

    for (const binding of runtimeConfig.knowledgeBindings ?? []) {
      if (binding.enabled === false) {
        continue;
      }

      const knowledgeEntry = this.buildKnowledgeToolEntry(session, binding);
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
        description:
          binding.description ??
          `调用 ${binding.language} 代码片段工具（当前为受限占位执行）`,
        inputSchema: jsonSchema(CODE_TOOL_INPUT_SCHEMA),
        execute: async (input) => {
          const args = this.normalizeExecuteArgs(
            input,
            binding.parameterOverrides,
          );
          return {
            success: false,
            message: `In-process runtime 当前不会直接执行 ${binding.language} 代码工具，请改用沙箱运行时。`,
            toolId: binding.toolId,
            language: binding.language,
            code: binding.code ?? '',
            input: args,
          };
        },
      }),
    };
  }

  private buildKnowledgeToolEntry(
    session: AgentSession,
    binding: AgentKnowledgeBinding,
  ): { name: string; tool: ToolSet[string] } | null {
    if (!session.tenantId || !this.ragService) {
      return null;
    }

    const name = this.sanitizeToolName(
      `searchKnowledge_${binding.knowledgeBaseId}`,
      `searchKnowledge_${randomUUID()}`,
    );

    return {
      name,
      tool: tool({
        description: `在知识库 ${binding.knowledgeBaseId} 中检索相关内容`,
        inputSchema: jsonSchema(KNOWLEDGE_TOOL_INPUT_SCHEMA),
        execute: async (input) => {
          const args = this.normalizeExecuteArgs(input);
          const query = typeof args.query === 'string' ? args.query : '';
          const topK =
            typeof args.topK === 'number' && Number.isFinite(args.topK)
              ? Math.max(1, Math.trunc(args.topK))
              : binding.topK;

          const results = await this.ragService!.search(
            query,
            session.tenantId!,
            {
              knowledgeBaseId: binding.knowledgeBaseId,
              ...(topK === undefined ? {} : { limit: topK }),
              ...(binding.similarityThreshold === undefined
                ? {}
                : { scoreThreshold: binding.similarityThreshold }),
            },
          );

          return {
            knowledgeBaseId: binding.knowledgeBaseId,
            total: results.length,
            results,
          };
        },
      }),
    };
  }

  private resolveMcpInputSchema(
    inputSchema?: Record<string, unknown>,
  ): z.ZodTypeAny {
    if (!inputSchema) {
      return z.object({}).passthrough();
    }

    try {
      return typeBoxToZod(inputSchema as Parameters<typeof typeBoxToZod>[0]);
    } catch {
      return z.object({}).passthrough();
    }
  }

  private normalizeExecuteArgs(
    input: unknown,
    parameterOverrides?: Record<string, unknown>,
  ): Record<string, unknown> {
    const normalized = this.isRecord(input) ? input : {};
    return parameterOverrides
      ? { ...normalized, ...parameterOverrides }
      : normalized;
  }

  private async executeHttpToolRequest(
    binding: AgentHttpToolBinding,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const method = binding.method ?? 'GET';
    const url = new URL(binding.url);
    const query = this.asRecord(input.query);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) {
          continue;
        }

        url.searchParams.set(
          key,
          typeof value === 'string' ? value : JSON.stringify(value),
        );
      }
    }

    const headers = this.extractStringHeaders(input.headers);
    let body: BodyInit | undefined;
    if (method !== 'GET' && 'body' in input) {
      const rawBody = input.body;
      if (typeof rawBody === 'string') {
        body = rawBody;
      } else if (rawBody !== undefined) {
        headers['content-type'] ??= 'application/json';
        body = JSON.stringify(rawBody);
      }
    }

    const response = await fetch(url, {
      method,
      headers,
      ...(body === undefined ? {} : { body }),
    });

    const responseBody = await this.parseHttpResponseBody(response);
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      url: response.url,
      headers: Object.fromEntries(response.headers.entries()),
      body: responseBody,
    };
  }

  private async parseHttpResponseBody(response: Response): Promise<unknown> {
    const contentType =
      response.headers.get('content-type')?.toLowerCase() ?? '';
    if (contentType.includes('application/json')) {
      return await response.json();
    }

    return await response.text();
  }

  private extractStringHeaders(input: unknown): Record<string, string> {
    const headers = this.asRecord(input);
    if (!headers) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(headers).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
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

  private async resolveSessionTools(
    sessionId: string,
  ): Promise<ToolSet | undefined> {
    const providers = this.sessionToolProviders.get(sessionId);
    if (!providers?.length) {
      return undefined;
    }

    const mergedTools: ToolSet = {};
    for (const provider of providers) {
      const tools = await provider();
      if (!tools || Object.keys(tools).length === 0) {
        continue;
      }

      Object.assign(mergedTools, tools);
    }

    return Object.keys(mergedTools).length > 0 ? mergedTools : undefined;
  }

  private convertToolSetToPiTools(toolSet?: ToolSet): PiAgentTool[] {
    if (!toolSet) {
      return [];
    }

    return Object.entries(toolSet).map(([name, tool]) => ({
      name,
      label: name,
      description: tool.description ?? '',
      parameters: zodToTypeBox(
        tool.inputSchema as Parameters<typeof zodToTypeBox>[0],
      ),
      execute: async (
        toolCallId: string,
        params: unknown,
        signal?: AbortSignal,
      ) => {
        if (!tool.execute) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Tool has no execute function',
              },
            ],
            details: null,
          };
        }

        const result = await tool.execute(params as never, {
          toolCallId,
          messages: [],
          abortSignal: signal,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text:
                result === null || result === undefined
                  ? ''
                  : typeof result === 'string'
                    ? result
                    : JSON.stringify(result),
            },
          ],
          details: result,
        };
      },
    }));
  }

  private async beforeToolCall(
    sessionId: string,
    context: PiBeforeToolCallContext,
    signal?: AbortSignal,
  ): Promise<{ block: boolean; reason?: string } | undefined> {
    const toolCallId = this.getToolCallId(context);
    const toolName = this.getToolName(context);

    if (PERMISSION_EXEMPT_TOOLS.has(toolName)) {
      return undefined;
    }

    const args = this.normalizeToolArgs(
      context.args ?? context.toolCall?.arguments,
    );

    const permissionRequest: ToolPermissionRequest = {
      description: `工具 ${toolName} 需要主人授权后才能执行。`,
      ...(this.extractResourcePaths(args).length > 0
        ? { resourcePaths: this.extractResourcePaths(args) }
        : {}),
    };

    this.emitAgentEvent(sessionId, {
      type: 'tool_call',
      call: {
        id: toolCallId,
        tool: toolName,
        args,
        status: 'awaiting_permission',
        permissionRequest,
      },
    });

    const decision = await this.waitForPermission(
      sessionId,
      toolCallId,
      signal,
    );

    if (decision === 'approve') {
      return undefined;
    }

    if (decision === 'deny') {
      this.markToolCallDenied(sessionId, toolCallId);
      this.emitAgentEvent(sessionId, {
        type: 'tool_call',
        call: {
          id: toolCallId,
          tool: toolName,
          args,
          status: 'denied',
          permissionRequest,
        },
      });

      return {
        block: true,
        reason: 'Tool execution denied by user.',
      };
    }

    return {
      block: true,
      reason: 'Tool execution cancelled.',
    };
  }

  private waitForPermission(
    sessionId: string,
    toolCallId: string,
    signal?: AbortSignal,
  ): Promise<PermissionResolution> {
    const existing = this.pendingPermissionResolvers.get(sessionId);
    if (existing?.has(toolCallId)) {
      throw new Error(
        `Session ${sessionId} already has a pending tool permission for ${toolCallId}`,
      );
    }

    const sessionResolvers =
      existing ?? new Map<string, PendingPermissionGate>();
    this.pendingPermissionResolvers.set(sessionId, sessionResolvers);

    return new Promise<PermissionResolution>((resolve) => {
      const finish = (action: PermissionResolution) => {
        cleanup();
        resolve(action);
      };

      const cleanup = () => {
        clearTimeout(timer);
        sessionResolvers.delete(toolCallId);
        if (sessionResolvers.size === 0) {
          this.pendingPermissionResolvers.delete(sessionId);
        }
        if (signal) {
          signal.removeEventListener('abort', onAbort);
        }
      };

      const onAbort = () => finish('cancelled');
      const timer = setTimeout(() => finish('deny'), 30_000);

      sessionResolvers.set(toolCallId, {
        resolve: finish,
        timer,
      });

      if (signal?.aborted) {
        finish('cancelled');
        return;
      }

      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  private emitAgentEvent(sessionId: string, event: AgentEvent): void {
    this.sessions.get(sessionId)?.activeSink?.emit(event);
  }

  private translatePiEvent(
    sessionId: string,
    event: Record<string, unknown>,
  ): AgentEvent[] {
    switch (event.type) {
      case 'message_update': {
        const assistantMessageEvent = this.asRecord(
          event.assistantMessageEvent,
        );
        const delta = assistantMessageEvent?.delta;
        if (
          assistantMessageEvent?.type !== 'text_delta' ||
          typeof delta !== 'string'
        ) {
          return [];
        }

        return [
          {
            type: 'message_chunk',
            content: delta,
          },
        ];
      }

      case 'tool_execution_start':
        return [
          {
            type: 'tool_call',
            call: {
              id: this.stringOrFallback(event.toolCallId, randomUUID()),
              tool: this.stringOrFallback(event.toolName, 'unknown_tool'),
              args: this.normalizeToolArgs(event.args),
              status: 'in_progress',
            },
          },
        ];

      case 'tool_execution_end': {
        const toolCallId = this.stringOrFallback(
          event.toolCallId,
          randomUUID(),
        );
        const toolName = this.stringOrFallback(event.toolName, 'unknown_tool');

        if (this.consumeDeniedToolCall(sessionId, toolCallId)) {
          return [];
        }

        const payload = this.extractToolResultPayload(event.result);
        return [
          {
            type: 'tool_call',
            call:
              event.isError === true
                ? {
                    id: toolCallId,
                    tool: toolName,
                    args: {},
                    status: 'failed',
                    error: this.stringifyToolError(payload),
                  }
                : {
                    id: toolCallId,
                    tool: toolName,
                    args: {},
                    status: 'completed',
                    result: payload,
                  },
          },
        ];
      }

      case 'agent_end':
        return [
          {
            type: 'done',
            stopReason: this.mapStopReason(event as PiAgentEndEvent),
          },
        ];

      default:
        return [];
    }
  }

  private extractToolResultPayload(result: unknown): unknown {
    if (this.isRecord(result) && 'details' in result) {
      return result.details;
    }

    return result;
  }

  private mapStopReason(event: PiAgentEndEvent): StopReason {
    const stopReason = event.messages?.at(-1)?.stopReason;

    switch (stopReason) {
      case 'aborted':
        return 'cancelled';
      case 'length':
        return 'max_tokens';
      case 'toolUse':
      case 'tool_use':
        return 'tool_use';
      default:
        return 'end_turn';
    }
  }

  private getToolCallId(context: PiBeforeToolCallContext): string {
    const rawId = context.toolCall?.id ?? context.toolCall?.toolCallId;
    if (typeof rawId === 'string' && rawId.length > 0) {
      return rawId;
    }

    return randomUUID();
  }

  private getToolName(context: PiBeforeToolCallContext): string {
    const rawName = context.toolCall?.name ?? context.toolCall?.toolName;
    return typeof rawName === 'string' && rawName.length > 0
      ? rawName
      : 'unknown_tool';
  }

  private normalizeToolArgs(input: unknown): ToolCallEvent['args'] {
    return this.isRecord(input) ? input : {};
  }

  private extractResourcePaths(args: Record<string, unknown>): string[] {
    const resourcePaths = new Set<string>();
    const candidateKeys = [
      'path',
      'filePath',
      'paths',
      'cwd',
      'targetPath',
      'outputPath',
      'inputPath',
      'resourcePath',
      'resourcePaths',
    ] as const;

    for (const key of candidateKeys) {
      const value = args[key];
      if (typeof value === 'string' && value.length > 0) {
        resourcePaths.add(value);
        continue;
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === 'string' && item.length > 0) {
            resourcePaths.add(item);
          }
        }
      }
    }

    return [...resourcePaths];
  }

  private stringifyToolError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === 'string') {
      return error;
    }

    if (this.isRecord(error) && Array.isArray(error.content)) {
      const text = error.content
        .map((item) =>
          this.isRecord(item) && typeof item.text === 'string' ? item.text : '',
        )
        .filter((item) => item.length > 0)
        .join('\n');

      if (text.length > 0) {
        return text;
      }
    }

    return 'Tool execution failed';
  }

  private markToolCallDenied(sessionId: string, toolCallId: string): void {
    const denied = this.deniedToolCalls.get(sessionId) ?? new Set<string>();
    denied.add(toolCallId);
    this.deniedToolCalls.set(sessionId, denied);
  }

  private consumeDeniedToolCall(
    sessionId: string,
    toolCallId: string,
  ): boolean {
    const denied = this.deniedToolCalls.get(sessionId);
    if (!denied?.has(toolCallId)) {
      return false;
    }

    denied.delete(toolCallId);
    if (denied.size === 0) {
      this.deniedToolCalls.delete(sessionId);
    }

    return true;
  }

  private clearPendingPermissions(
    sessionId: string,
    resolution: PermissionResolution,
  ): void {
    const sessionResolvers = this.pendingPermissionResolvers.get(sessionId);
    if (!sessionResolvers) {
      return;
    }

    this.pendingPermissionResolvers.delete(sessionId);
    for (const gate of sessionResolvers.values()) {
      clearTimeout(gate.timer);
      gate.resolve(resolution);
    }
  }

  private clearDeniedToolCallCache(sessionId: string): void {
    this.deniedToolCalls.delete(sessionId);
  }

  private async resolveModelConfig(
    session: AgentSession,
  ): Promise<schema.LlmModelConfig> {
    if (!session.tenantId) {
      throw new Error(`Session ${session.id} 缺少 tenantId`);
    }

    const tenantId = session.tenantId;
    const llmModelConfigId = session.llmModelConfigId;

    return runInTenantTransaction(this.db, tenantId, async () => {
      if (llmModelConfigId) {
        const [modelConfig] = await this.tenantDb
          .select()
          .from(schema.llmModelConfigs)
          .where(
            and(
              eq(schema.llmModelConfigs.id, llmModelConfigId),
              eq(schema.llmModelConfigs.tenantId, tenantId),
            ),
          );

        if (!modelConfig) {
          throw new Error(`LLM 模型配置不存在: ${llmModelConfigId}`);
        }

        return modelConfig;
      }

      const [modelConfig] = await this.tenantDb
        .select()
        .from(schema.llmModelConfigs)
        .where(
          and(
            eq(schema.llmModelConfigs.tenantId, tenantId),
            eq(schema.llmModelConfigs.isDefault, true),
          ),
        );

      if (!modelConfig) {
        throw new Error(`租户 ${tenantId} 未配置默认 LLM 模型`);
      }

      session.llmModelConfigId = modelConfig.id;
      return modelConfig;
    });
  }

  private serializeContentBlocks(blocks: ContentBlock[]): string {
    return blocks
      .map((block) => {
        switch (block.type) {
          case 'text':
            return block.text;
          case 'image':
            return `[image:${block.mimeType}]`;
          case 'audio':
            return `[audio:${block.mimeType}]`;
          case 'resource':
            return block.text ?? block.blob ?? `[resource:${block.uri}]`;
          case 'resource_link':
            return block.title ?? `[resource_link:${block.uri}]`;
          default:
            return '';
        }
      })
      .join('\n\n');
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return this.isRecord(value) ? value : null;
  }

  private stringOrFallback(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.length > 0 ? value : fallback;
  }
}
