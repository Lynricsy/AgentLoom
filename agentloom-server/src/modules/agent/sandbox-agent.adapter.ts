import {
  Inject,
  Injectable,
  Logger,
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
import type { SandboxSession } from '../../database/schema';
import type {
  AgentCodeToolBinding,
  AgentHttpToolBinding,
  AgentKnowledgeBinding,
  AgentMcpToolBinding,
  AgentRuntimeConfig,
  AgentToolBinding,
} from '../agent-definition/agent-runtime-config.interface';
import {
  ApiKeyNotFoundException,
  DefaultApiKeyNotConfiguredException,
} from '../api-key/api-key.exceptions';
import { DecryptionBoundaryService } from '../api-key/decryption-boundary.service';
import { RagService } from '../knowledge/services/rag.service';
import { McpService } from '../mcp/mcp.service';
import { SandboxNotFoundException } from '../sandbox/sandbox.exceptions';
import {
  PiConfigGeneratorService,
  resolvePiProviderApiKeyEnv,
  type PiModelConfig,
} from '../sandbox/pi-config-generator.service';
import {
  SANDBOX_RUNTIME_DRIVER,
  type SandboxRuntimeDriver,
} from '../sandbox/sandbox-runtime-driver.port';
import { SandboxService } from '../sandbox/sandbox.service';
import { CodeExecutionService } from './code-execution.service';
import { executeHttpToolRequest } from './http-tool-request.util';
import { normalizeFlexibleSchemaJson } from './tool-schema-converter';
import { SelfEvolutionService } from '../self-evolution/self-evolution.service';

import type {
  IAgentRuntime,
  SessionToolProvider,
} from './ports/agent-runtime.port';
import type {
  AgentEvent,
  AgentSession,
  ContentBlock,
  CreateSessionParams,
  McpServerConfig,
  PtySessionInfo,
  ServerSandboxBinding,
} from './types';
import type {
  StopReason,
  ToolCallEvent,
  ToolCallStatus,
  ToolPermissionRequest,
} from './types';
import type {
  ToolCallTransitionRecord,
  ToolCallTransitionSource,
} from './types/tool-call-event.types';
import type { SelfEvolutionRemoteToolOutcome } from '../self-evolution/self-evolution.types';

const CONTAINER_WORKSPACE = '/workspace/';
const REQUEST_TIMEOUT_MS = 3_600_000;
const SESSION_INIT_REQUEST_TIMEOUT_MS = 5_000;
const SESSION_INIT_REQUEST_TIMEOUT_WITH_MCP_MS = 90_000;
const ABORT_REQUEST_TIMEOUT_MS = 5_000;
const SANDBOX_READY_TIMEOUT_MS = 30_000;
const SANDBOX_READY_TIMEOUT_WITH_MCP_MS = 120_000;
const SANDBOX_READY_POLL_INTERVAL_MS = 1_000;
const TOOL_PERMISSION_TIMEOUT_MS = 30_000;
const DEFAULT_REMOTE_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: true,
} satisfies Record<string, unknown>;
const RETRYABLE_SESSION_INIT_STATUSES = new Set([
  404, 408, 425, 429, 500, 502, 503, 504,
]);
const RETRYABLE_SESSION_INIT_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

export type SandboxBinding = ServerSandboxBinding;

type PendingPermissionAction = 'approve' | 'deny' | 'cancelled';

type PendingPermissionGate = {
  resolve: (action: PendingPermissionAction) => void;
  timer: ReturnType<typeof setTimeout>;
};

type ResolvedPiModelConfig = {
  modelConfig: PiModelConfig;
  sourceModelConfig?: schema.LlmModelConfig;
  sourceProvider?: schema.LlmProvider;
};

type ContainerEventEnvelope = {
  type?: unknown;
  data?: unknown;
  [key: string]: unknown;
};

type RemoteToolDescriptor = {
  name: string;
  label: string;
  description: string;
  promptSnippet?: string;
  parameters: Record<string, unknown>;
};

type RemoteToolExecutionCallback = {
  sessionId: string;
  toolCallId: string;
  toolName: string;
  input?: unknown;
  phase?: 'preflight' | 'execute';
};

type AiJsonSchemaInput = Parameters<typeof jsonSchema>[0];

class SandboxPromptError extends Error {
  constructor(
    readonly rawMessage: string,
    readonly code?: string,
  ) {
    super(rawMessage);
    this.name = 'SandboxPromptError';
  }
}

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
    knowledgeBaseIds: {
      type: 'array',
      items: {
        type: 'string',
      },
      minItems: 1,
      description: '要检索的知识库 ID 列表，必须从当前 Agent 可用知识库中选择',
    },
    topK: {
      type: 'integer',
      minimum: 1,
      description: '可选覆盖返回条数',
    },
  },
  required: ['query', 'knowledgeBaseIds'],
  additionalProperties: false,
} satisfies AiJsonSchemaInput;

export type SandboxToolPermissionCallback = {
  sessionId?: string;
  toolCallId: string;
  toolName: string;
  input?: unknown;
  permissionRequest?: ToolPermissionRequest;
};

@Injectable()
export class SandboxAgentAdapter implements IAgentRuntime {
  private readonly logger = new Logger(SandboxAgentAdapter.name);
  private readonly sessions = new Map<string, AgentSession>();
  private readonly abortControllers = new Map<string, AbortController>();
  private readonly sessionToolProviders = new Map<
    string,
    SessionToolProvider[]
  >();
  private readonly sessionToolCallbackTokens = new Map<string, string>();
  private readonly pendingPermissionResolvers = new Map<
    string,
    Map<string, PendingPermissionGate>
  >();
  private readonly conversationSessionIds = new Map<string, string>();

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly sandboxService: SandboxService,
    @Inject(SANDBOX_RUNTIME_DRIVER)
    private readonly dockerService: SandboxRuntimeDriver,
    @Optional() private readonly mcpService?: McpService,
    @Optional() private readonly ragService?: RagService,
    @Optional() private readonly codeExecutionService?: CodeExecutionService,
    @Optional()
    private readonly decryptionBoundaryService?: DecryptionBoundaryService,
    @Optional()
    private readonly piConfigGenerator?: PiConfigGeneratorService,
    @Optional() private readonly selfEvolutionService?: SelfEvolutionService,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
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

  async createSession(params: CreateSessionParams): Promise<AgentSession> {
    const sessionId = params.sessionId ?? randomUUID();
    const session: AgentSession = {
      id: sessionId,
      agentId: params.agentId,
      mode: params.mode,
      context: {
        history: [],
        cwd: CONTAINER_WORKSPACE,
        mcpServers: params.mcpServers,
        workflowState: params.context,
      },
      status: 'active',
      tenantId: params.tenantId,
      llmModelConfigId: params.llmModelConfigId,
      systemPrompt: params.systemPrompt,
      autonomyMode: params.autonomyMode,
      runtimeConfig: params.runtimeConfig,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.sessions.set(session.id, session);
    this.abortControllers.set(session.id, new AbortController());
    this.sessionToolCallbackTokens.set(session.id, randomUUID());

    const runtimeConfigProvider = this.createRuntimeConfigToolProvider(
      session,
      params.runtimeConfig,
    );
    if (runtimeConfigProvider) {
      this.registerSessionToolProvider(session.id, runtimeConfigProvider);
    }

    const workflowState = params.context ?? {};
    const sandboxBinding = this.readSandboxBinding(workflowState);
    const tenantId = params.tenantId ?? null;

    if (sandboxBinding.agentConversationId) {
      this.conversationSessionIds.set(
        sandboxBinding.agentConversationId,
        session.id,
      );
    }

    if (tenantId && this.hasSandboxBinding(sandboxBinding)) {
      try {
        const sandboxSession = await this.waitForSandboxReady(
          sandboxBinding,
          tenantId,
        );
        const sessionUrl = await this.dockerService.getSessionUrl(
          sandboxSession.containerId,
        );
        const sessionInitPayload = await this.buildContainerSessionPayload({
          session,
          runtimeConfig: params.runtimeConfig,
          mcpServers: params.mcpServers,
        });

        await this.initializeContainerSession(sessionUrl, {
          sessionId: session.id,
          cwd: CONTAINER_WORKSPACE,
          createCodingTools: true,
          ...sessionInitPayload,
          ...(await this.buildRemoteToolExecutionPayload(session.id)),
        });
      } catch (error) {
        session.status = 'error';
        session.updatedAt = new Date();
        throw error;
      }
    }

    this.logger.debug(`创建 Sandbox 会话: ${session.id}`);
    return session;
  }

  async loadSession(sessionId: string): Promise<AgentSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SandboxNotFoundException(
        `Sandbox session not found: ${sessionId}`,
      );
    }
    return session;
  }

  async *prompt(
    sessionId: string,
    content: ContentBlock[],
  ): AsyncIterable<AgentEvent> {
    const session = await this.loadSession(sessionId);
    const abortController = this.abortControllers.get(sessionId);

    session.context.history.push(...content);
    session.updatedAt = new Date();

    const workflowState = session.context.workflowState ?? {};
    const sandboxBinding = this.readSandboxBinding(workflowState);
    const tenantId =
      typeof workflowState['tenantId'] === 'string'
        ? workflowState['tenantId']
        : (session.tenantId ?? null);

    if (!tenantId || !this.hasSandboxBinding(sandboxBinding)) {
      throw new Error(
        'Sandbox workflow context missing sandbox binding or tenantId',
      );
    }

    try {
      const sandboxSession = await this.waitForSandboxReady(
        sandboxBinding,
        tenantId,
      );
      if (!sandboxSession.containerId) {
        throw new Error(
          `Sandbox session ${sandboxSession.id} has no containerId`,
        );
      }
      const containerUrl = await this.dockerService.getPromptUrl(
        sandboxSession.containerId,
      );
      const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      const combinedSignal = abortController
        ? AbortSignal.any([abortController.signal, timeoutSignal])
        : timeoutSignal;

      const response = await fetch(containerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          content,
          cwd: CONTAINER_WORKSPACE,
        }),
        signal: combinedSignal,
      });

      if (!response.ok || !response.body) {
        throw new Error(
          `Sandbox agent request failed with status ${response.status}`,
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          const parsed = this.parseServerSentEvent(sessionId, frame);
          if (parsed.error) {
            throw parsed.error;
          }
          for (const event of parsed.events) {
            yield event;
            if (event.type === 'done') {
              await this.cancelReaderSafely(reader);
              return;
            }
          }
        }

        if (done) {
          const finalEvent = this.parseServerSentEvent(sessionId, buffer);
          if (finalEvent.error) {
            throw finalEvent.error;
          }
          for (const event of finalEvent.events) {
            yield event;
            if (event.type === 'done') {
              await this.cancelReaderSafely(reader);
              return;
            }
          }
          break;
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        yield { type: 'done', stopReason: 'cancelled' };
        return;
      }

      this.logger.error(
        `Sandbox prompt 失败: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    } finally {
      this.clearPendingPermissions(sessionId, 'cancelled');
    }
  }

  async cancel(sessionId: string): Promise<void> {
    const controller = this.abortControllers.get(sessionId);
    if (controller) {
      controller.abort();
    }

    const session = this.sessions.get(sessionId);
    if (session) {
      const workflowState = session.context.workflowState ?? {};
      const sandboxBinding = this.readSandboxBinding(workflowState);
      const tenantId =
        typeof workflowState['tenantId'] === 'string'
          ? workflowState['tenantId']
          : (session.tenantId ?? null);

      if (tenantId && this.hasSandboxBinding(sandboxBinding)) {
        await this.abortContainerPrompt(sessionId, sandboxBinding, tenantId);
      }

      session.status = 'completed';
      session.updatedAt = new Date();

      if (sandboxBinding.agentConversationId) {
        this.conversationSessionIds.delete(sandboxBinding.agentConversationId);
      }
    }

    this.clearPendingPermissions(sessionId, 'cancelled');
    this.unregisterSessionToolProvider(sessionId);
    this.sessionToolCallbackTokens.delete(sessionId);
    this.abortControllers.delete(sessionId);

    this.logger.debug(`取消 Sandbox 会话: ${sessionId}`);
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

  async awaitToolPermission(
    conversationId: string,
    callback: SandboxToolPermissionCallback,
  ): Promise<{ allowed: boolean }> {
    const sessionId =
      callback.sessionId ??
      this.resolveSessionIdForConversation(conversationId);
    const action = await this.waitForPermission(sessionId, callback.toolCallId);

    return { allowed: action === 'approve' };
  }

  async resolveConversationToolPermission(
    conversationId: string,
    toolCallId: string,
    action: 'approve' | 'deny',
  ): Promise<void> {
    const sessionId = this.resolveSessionIdForConversation(conversationId);
    await this.resolveToolPermission(sessionId, toolCallId, action);
  }

  async executeSessionToolCallback(
    sessionId: string,
    callback: RemoteToolExecutionCallback,
    callbackToken?: string,
  ): Promise<{ result: unknown } | SelfEvolutionRemoteToolOutcome> {
    if (callback.sessionId !== sessionId) {
      throw new Error(
        `Remote tool callback sessionId mismatch: expected ${sessionId}, got ${callback.sessionId}`,
      );
    }

    this.assertValidSessionToolCallbackToken(sessionId, callbackToken);

    const session = await this.loadSession(sessionId);
    const tenantId = session.tenantId;
    if (!tenantId) {
      throw new Error(`Sandbox session ${sessionId} is missing tenantId`);
    }

    const selfEvolutionService = this.selfEvolutionService;
    if (selfEvolutionService?.supportsTool(callback.toolName)) {
      return await runInTenantTransaction(this.db, tenantId, async () => {
        const phase = callback.phase === 'execute' ? 'execute' : 'preflight';

        if (phase === 'execute') {
          return selfEvolutionService.handleSessionToolExecute(
            session,
            callback.toolName as never,
            callback.toolCallId,
            this.normalizeSessionToolInput(callback.input),
          );
        }

        return selfEvolutionService.handleSessionToolPreflight(
          session,
          callback.toolName as never,
          callback.toolCallId,
          this.normalizeSessionToolInput(callback.input),
        );
      });
    }

    const tool = await this.resolveSessionTool(sessionId, callback.toolName);
    if (!tool.execute) {
      throw new Error(
        `Sandbox session tool "${callback.toolName}" is not executable`,
      );
    }

    const result = await runInTenantTransaction(this.db, tenantId, async () =>
      tool.execute?.(callback.input, {
        toolCallId: callback.toolCallId,
        messages: [],
        abortSignal: undefined,
        experimental_context: undefined,
      }),
    );

    return { result };
  }

  private normalizeSessionToolInput(input: unknown): Record<string, unknown> {
    return this.isRecord(input) ? input : {};
  }

  private async waitForSandboxReady(
    sandboxBinding: SandboxBinding,
    tenantId: string,
  ): Promise<SandboxSession & { containerId: string }> {
    const startedAt = Date.now();
    const bindingLabel = this.describeSandboxBinding(sandboxBinding);

    while (Date.now() - startedAt < SANDBOX_READY_TIMEOUT_MS) {
      const sandboxSession = sandboxBinding.executionId
        ? await this.sandboxService.getSandboxSession(
            sandboxBinding.executionId,
            tenantId,
            sandboxBinding.sandboxNodeId,
          )
        : sandboxBinding.agentConversationId
          ? await this.sandboxService.findByConversationId(
              sandboxBinding.agentConversationId,
              tenantId,
            )
          : null;

      if (!sandboxSession) {
        const latestSession = sandboxBinding.executionId
          ? await this.sandboxService.findLatestByExecutionId(
              sandboxBinding.executionId,
              tenantId,
              sandboxBinding.sandboxNodeId,
            )
          : sandboxBinding.agentConversationId
            ? await this.sandboxService.findLatestByConversationId(
                sandboxBinding.agentConversationId,
                tenantId,
              )
            : null;

        if (
          latestSession &&
          (latestSession.status === 'failed' ||
            latestSession.status === 'stopped')
        ) {
          throw new Error(
            await this.describeUnavailableSandboxSession(
              latestSession,
              bindingLabel,
            ),
          );
        }

        throw new Error(`Sandbox session not found for ${bindingLabel}`);
      }

      if (
        sandboxSession.status === 'failed' ||
        sandboxSession.status === 'stopped'
      ) {
        throw new Error(
          `Sandbox session ${sandboxSession.id} is ${sandboxSession.status}`,
        );
      }

      if (
        sandboxSession.status === 'ready' &&
        sandboxSession.containerId &&
        (await this.dockerService.healthCheck(sandboxSession.containerId))
      ) {
        return {
          ...sandboxSession,
          containerId: sandboxSession.containerId,
        };
      }

      await this.delay(SANDBOX_READY_POLL_INTERVAL_MS);
    }

    throw new Error(`Sandbox session is not ready for ${bindingLabel}`);
  }

  private async describeUnavailableSandboxSession(
    session: SandboxSession,
    bindingLabel: string,
  ): Promise<string> {
    if (session.status === 'failed') {
      try {
        const logs = await this.sandboxService.getSandboxLogs(session.id);
        const latestFailureLog = [...logs]
          .reverse()
          .find(
            (log) =>
              log.level === 'system' &&
              log.message.startsWith('Sandbox creation failed:'),
          );

        if (latestFailureLog) {
          return latestFailureLog.message;
        }
      } catch (error) {
        this.logger.warn(
          `Failed to load sandbox logs for ${session.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return `Sandbox session ${session.id} is ${session.status} for ${bindingLabel}`;
  }

  private readSandboxBinding(
    workflowState: Record<string, unknown>,
  ): SandboxBinding {
    const executionId =
      typeof workflowState['executionId'] === 'string'
        ? workflowState['executionId']
        : null;
    const agentConversationId =
      typeof workflowState['agentConversationId'] === 'string'
        ? workflowState['agentConversationId']
        : null;
    const serverSandbox = workflowState['serverSandbox'];
    const nestedExecutionId =
      this.isRecord(serverSandbox) &&
      typeof serverSandbox.executionId === 'string'
        ? serverSandbox.executionId
        : null;
    const nestedConversationId =
      this.isRecord(serverSandbox) &&
      typeof serverSandbox.agentConversationId === 'string'
        ? serverSandbox.agentConversationId
        : null;
    const sandboxNodeId =
      typeof workflowState['sandboxNodeId'] === 'string'
        ? workflowState['sandboxNodeId']
        : this.isRecord(serverSandbox) &&
            typeof serverSandbox.sandboxNodeId === 'string'
          ? serverSandbox.sandboxNodeId
          : null;

    return {
      ...((executionId ?? nestedExecutionId)
        ? { executionId: executionId ?? nestedExecutionId ?? undefined }
        : {}),
      ...((agentConversationId ?? nestedConversationId)
        ? {
            agentConversationId:
              agentConversationId ?? nestedConversationId ?? undefined,
          }
        : {}),
      ...(sandboxNodeId ? { sandboxNodeId } : {}),
    };
  }

  private hasSandboxBinding(binding: SandboxBinding): boolean {
    return Boolean(binding.executionId || binding.agentConversationId);
  }

  private describeSandboxBinding(binding: SandboxBinding): string {
    if (binding.executionId && binding.agentConversationId) {
      return `execution ${binding.executionId}${binding.sandboxNodeId ? ` / sandbox ${binding.sandboxNodeId}` : ''} / conversation ${binding.agentConversationId}`;
    }

    if (binding.executionId) {
      return `execution ${binding.executionId}${binding.sandboxNodeId ? ` / sandbox ${binding.sandboxNodeId}` : ''}`;
    }

    if (binding.agentConversationId) {
      return `conversation ${binding.agentConversationId}`;
    }

    return 'sandbox binding';
  }

  private async buildContainerSessionPayload(params: {
    session: AgentSession;
    runtimeConfig?: AgentRuntimeConfig;
    mcpServers?: Readonly<Record<string, McpServerConfig>>;
  }): Promise<Record<string, unknown>> {
    const payload: Record<string, unknown> = {};
    const systemPrompt = this.normalizeOptionalString(
      params.session.systemPrompt,
    );

    if (systemPrompt) {
      payload['systemPrompt'] = systemPrompt;
    }

    if (params.mcpServers && Object.keys(params.mcpServers).length > 0) {
      payload['mcpServers'] = params.mcpServers;
    }

    if (params.runtimeConfig?.nativeToolPolicy) {
      payload['nativeToolPolicy'] = params.runtimeConfig.nativeToolPolicy;
    }

    const piConfig = await this.resolveSessionPiConfig(
      params.session,
      params.runtimeConfig,
    );
    if (piConfig) {
      Object.assign(payload, piConfig);
    }

    return payload;
  }

  private async resolveSessionPiConfig(
    session: AgentSession,
    runtimeConfig?: AgentRuntimeConfig,
  ): Promise<Record<string, unknown> | null> {
    if (!this.piConfigGenerator) {
      return null;
    }

    const resolvedModelConfig = await this.resolvePiModelConfig(
      session,
      runtimeConfig,
    );

    if (!resolvedModelConfig) {
      return null;
    }

    const settings = this.parseJsonObject(
      this.piConfigGenerator.generateSettings({
        modelConfig: resolvedModelConfig.modelConfig,
      }),
      'pi settings',
    );
    const models = this.parseJsonObject(
      this.piConfigGenerator.generateModelsJson({
        modelConfig: resolvedModelConfig.modelConfig,
      }),
      'pi models',
    );
    const runtimeApiKeys =
      await this.resolveRuntimeApiKeys(resolvedModelConfig);

    this.ensureDynamicProviderApiKey(
      models,
      resolvedModelConfig.modelConfig,
      runtimeApiKeys,
    );

    this.logger.log(
      `Sandbox session pi config ${JSON.stringify({
        sessionId: session.id,
        tenantId: session.tenantId ?? null,
        llmModelConfigId: session.llmModelConfigId ?? null,
        provider: resolvedModelConfig.modelConfig.provider,
        model: resolvedModelConfig.modelConfig.model,
        usedStoredConfig: Boolean(resolvedModelConfig.sourceModelConfig),
        defaultProvider:
          this.normalizeOptionalString(settings['defaultProvider']) ?? null,
        defaultModel:
          this.normalizeOptionalString(settings['defaultModel']) ?? null,
        modelProviders: Object.keys(this.asRecord(models['providers']) ?? {}),
        runtimeApiKeyProviders: Object.keys(runtimeApiKeys ?? {}),
        providerApiKeyField: this.readProviderApiKeyField(
          models,
          resolvedModelConfig.modelConfig.provider,
        ),
      })}`,
    );

    return {
      settings,
      models,
      ...(runtimeApiKeys ? { runtimeApiKeys } : {}),
    };
  }

  private async resolvePiModelConfig(
    session: AgentSession,
    runtimeConfig?: AgentRuntimeConfig,
  ): Promise<ResolvedPiModelConfig | null> {
    const fallbackModelConfig = this.toPiModelConfigFromRuntimeModelConfig(
      runtimeConfig?.modelConfig,
    );

    if (!session.tenantId) {
      return fallbackModelConfig ? { modelConfig: fallbackModelConfig } : null;
    }

    try {
      return await this.resolveStoredPiModelConfig(session);
    } catch (error) {
      if (!fallbackModelConfig) {
        throw error;
      }

      this.logger.warn(
        `无法读取会话 ${session.id} 的租户模型配置，回退到 runtimeConfig 模型快照: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { modelConfig: fallbackModelConfig };
    }
  }

  private async resolveStoredPiModelConfig(
    session: AgentSession,
  ): Promise<ResolvedPiModelConfig> {
    if (!session.tenantId) {
      throw new Error(`Session ${session.id} 缺少 tenantId`);
    }

    const tenantId = session.tenantId;
    const llmModelConfigId = session.llmModelConfigId;

    return runInTenantTransaction(this.db, tenantId, async () => {
      if (llmModelConfigId) {
        const [row] = await this.tenantDb
          .select({
            config: schema.llmModelConfigs,
            provider: schema.llmProviders,
          })
          .from(schema.llmModelConfigs)
          .innerJoin(
            schema.llmProviders,
            eq(schema.llmModelConfigs.providerId, schema.llmProviders.id),
          )
          .where(
            and(
              eq(schema.llmModelConfigs.id, llmModelConfigId),
              eq(schema.llmModelConfigs.tenantId, tenantId),
            ),
          );

        if (!row) {
          throw new Error(`LLM 模型配置不存在: ${llmModelConfigId}`);
        }

        return {
          modelConfig: this.toPiModelConfig(row.config, row.provider),
          sourceModelConfig: row.config,
          sourceProvider: row.provider,
        };
      }

      const [defaultRow] = await this.tenantDb
        .select({
          config: schema.llmModelConfigs,
          provider: schema.llmProviders,
        })
        .from(schema.llmModelConfigs)
        .innerJoin(
          schema.llmProviders,
          eq(schema.llmModelConfigs.providerId, schema.llmProviders.id),
        )
        .where(
          and(
            eq(schema.llmModelConfigs.tenantId, tenantId),
            eq(schema.llmModelConfigs.isDefault, true),
          ),
        );

      if (!defaultRow) {
        throw new Error(`租户 ${tenantId} 未配置默认 LLM 模型`);
      }

      session.llmModelConfigId = defaultRow.config.id;

      return {
        modelConfig: this.toPiModelConfig(
          defaultRow.config,
          defaultRow.provider,
        ),
        sourceModelConfig: defaultRow.config,
        sourceProvider: defaultRow.provider,
      };
    });
  }

  private async resolveRuntimeApiKeys(
    resolvedModelConfig: ResolvedPiModelConfig,
  ): Promise<Record<string, string> | undefined> {
    if (!this.decryptionBoundaryService) {
      return undefined;
    }

    const apiKey = await this.resolveRuntimeApiKey(resolvedModelConfig);
    if (!apiKey) {
      return undefined;
    }

    return {
      [resolvedModelConfig.modelConfig.provider]: apiKey,
    };
  }

  private async resolveRuntimeApiKey(
    resolvedModelConfig: ResolvedPiModelConfig,
  ): Promise<string | undefined> {
    if (!this.decryptionBoundaryService) {
      return undefined;
    }

    const { modelConfig, sourceModelConfig, sourceProvider } =
      resolvedModelConfig;
    const providerApiKeyEnv = resolvePiProviderApiKeyEnv(modelConfig);

    if (!providerApiKeyEnv) {
      return undefined;
    }

    const tenantId = this.normalizeOptionalString(
      sourceModelConfig?.tenantId ?? modelConfig.tenantId,
    );
    const organizationId = this.normalizeOptionalString(
      sourceModelConfig?.orgId ?? modelConfig.organizationId,
    );
    const apiKeyId = this.normalizeOptionalString(
      sourceProvider?.apiKeyId ?? modelConfig.apiKeyId,
    );

    if (!tenantId) {
      return undefined;
    }

    try {
      if (apiKeyId) {
        return await this.decryptionBoundaryService.decryptApiKey(
          apiKeyId,
          tenantId,
          SandboxAgentAdapter.name,
        );
      }

      if (!organizationId) {
        return undefined;
      }

      return await this.decryptionBoundaryService.decryptConfiguredApiKey(
        {
          apiKeyId: null,
          organizationId,
          tenantId,
          provider: modelConfig.provider,
        },
        SandboxAgentAdapter.name,
      );
    } catch (error) {
      if (
        (error instanceof DefaultApiKeyNotConfiguredException ||
          error instanceof ApiKeyNotFoundException) &&
        process.env[providerApiKeyEnv]
      ) {
        this.logger.warn(
          `共享 sandbox 会话 ${modelConfig.provider}/${modelConfig.model} 未找到受管 API Key，回退到容器继承环境变量 ${providerApiKeyEnv}`,
        );
        return undefined;
      }

      throw error;
    }
  }

  private readProviderApiKeyField(
    models: Record<string, unknown>,
    provider: string,
  ): string | null {
    const providers = this.asRecord(models['providers']);
    if (!providers) {
      return null;
    }

    const providerConfig = this.asRecord(providers[provider]);
    if (!providerConfig) {
      return null;
    }

    return this.normalizeOptionalString(providerConfig['apiKey']) ?? null;
  }

  private ensureDynamicProviderApiKey(
    models: Record<string, unknown>,
    modelConfig: PiModelConfig,
    runtimeApiKeys?: Record<string, string>,
  ): void {
    const runtimeApiKey = this.normalizeOptionalString(
      runtimeApiKeys?.[modelConfig.provider],
    );
    if (!runtimeApiKey) {
      return;
    }

    const providers = this.asRecord(models['providers']);
    if (!providers) {
      return;
    }

    const providerConfig = this.asRecord(providers[modelConfig.provider]);
    if (!providerConfig) {
      return;
    }

    const configuredModels = providerConfig['models'];
    if (!Array.isArray(configuredModels) || configuredModels.length === 0) {
      return;
    }

    // 共享 sandbox 的 session 级 runtimeApiKey 必须优先于静态 env 占位值，
    // 否则 pi runtime 会继续尝试把 `ANTHROPIC_API_KEY` 之类的字面量当作真实密钥使用。
    providerConfig['apiKey'] = '__runtime__';
  }

  private toPiModelConfig(
    modelConfig: schema.LlmModelConfig,
    provider: schema.LlmProvider,
  ): PiModelConfig {
    const baseUrl = this.resolvePiModelBaseUrl(modelConfig, provider);

    return {
      provider: provider.slug,
      model: modelConfig.modelId,
      apiProtocol: provider.apiProtocol,
      ...(baseUrl ? { apiBaseUrl: baseUrl } : {}),
      apiKeyId: provider.apiKeyId ?? null,
      organizationId: modelConfig.orgId,
      tenantId: modelConfig.tenantId,
    };
  }

  private resolvePiModelBaseUrl(
    modelConfig: schema.LlmModelConfig,
    provider: schema.LlmProvider,
  ): string | undefined {
    const providerBaseUrl = this.normalizeOptionalString(
      provider.baseUrl ?? provider.defaultBaseUrl,
    );
    if (providerBaseUrl) {
      return providerBaseUrl;
    }

    const parameters =
      modelConfig.parameters &&
      typeof modelConfig.parameters === 'object' &&
      !Array.isArray(modelConfig.parameters)
        ? (modelConfig.parameters as Record<string, unknown>)
        : {};

    for (const candidate of [
      parameters.baseUrl,
      parameters.baseURL,
      parameters.apiBaseUrl,
      parameters.endpointUrl,
    ]) {
      const normalized = this.normalizeOptionalString(candidate);
      if (normalized) {
        return normalized;
      }
    }

    return undefined;
  }

  private toPiModelConfigFromRuntimeModelConfig(
    modelConfig?: AgentRuntimeConfig['modelConfig'],
  ): PiModelConfig | undefined {
    const provider = this.normalizeOptionalString(modelConfig?.provider);
    const model =
      this.normalizeOptionalString(modelConfig?.modelName) ??
      this.normalizeOptionalString(modelConfig?.modelId);

    if (!provider || !model) {
      return undefined;
    }

    const apiBaseUrl = this.resolvePiRuntimeModelBaseUrl(modelConfig);
    const apiProtocol = this.normalizeOptionalString(modelConfig?.apiProtocol);
    const authMethod = this.normalizeOptionalString(modelConfig?.authMethod);

    return {
      provider,
      model,
      ...(apiProtocol ? { apiProtocol } : {}),
      ...(apiBaseUrl ? { apiBaseUrl } : {}),
      ...(typeof modelConfig?.apiKeyId === 'string' ||
      modelConfig?.apiKeyId === null
        ? { apiKeyId: modelConfig.apiKeyId }
        : {}),
      ...(authMethod ? { authMethod } : {}),
    };
  }

  private resolvePiRuntimeModelBaseUrl(
    modelConfig?: AgentRuntimeConfig['modelConfig'],
  ): string | undefined {
    const endpointUrl = this.normalizeOptionalString(modelConfig?.endpointUrl);
    if (endpointUrl) {
      return endpointUrl;
    }

    const parameters =
      modelConfig?.customParameters &&
      typeof modelConfig.customParameters === 'object' &&
      !Array.isArray(modelConfig.customParameters)
        ? (modelConfig.customParameters as Record<string, unknown>)
        : {};

    for (const candidate of [
      parameters.baseUrl,
      parameters.baseURL,
      parameters.apiBaseUrl,
      parameters.endpointUrl,
    ]) {
      const normalized = this.normalizeOptionalString(candidate);
      if (normalized) {
        return normalized;
      }
    }

    return undefined;
  }

  private parseJsonObject(
    rawJson: string,
    label: string,
  ): Record<string, unknown> {
    const parsed = JSON.parse(rawJson) as unknown;

    if (!this.isRecord(parsed)) {
      throw new Error(`${label} 必须是 JSON object`);
    }

    return parsed;
  }

  private async initializeContainerSession(
    sessionUrl: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const { requestTimeoutMs, totalTimeoutMs } =
      this.resolveSessionInitTimeouts(payload);
    const startedAt = Date.now();
    let lastError: Error | null = null;
    let attempt = 0;

    while (Date.now() - startedAt < totalTimeoutMs) {
      attempt += 1;

      try {
        const response = await fetch(sessionUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(requestTimeoutMs),
        });

        if (response.ok) {
          return;
        }

        const responseError = new Error(
          `Container session init failed with status ${response.status}`,
        );
        if (!this.isRetryableSessionInitStatus(response.status)) {
          throw responseError;
        }

        lastError = responseError;
      } catch (error) {
        if (!this.isRetryableSessionInitError(error)) {
          throw error;
        }

        lastError = error instanceof Error ? error : new Error(String(error));
      }

      this.logger.warn(
        `Sandbox 容器会话初始化未就绪，${SANDBOX_READY_POLL_INTERVAL_MS}ms 后重试（第 ${attempt} 次，requestTimeout=${requestTimeoutMs}ms, totalTimeout=${totalTimeoutMs}ms）: ${lastError.message}`,
      );
      await this.delay(SANDBOX_READY_POLL_INTERVAL_MS);
    }

    throw (
      lastError ??
      new Error(
        `Container session init did not become ready within ${totalTimeoutMs}ms`,
      )
    );
  }

  private resolveSessionInitTimeouts(payload: Record<string, unknown>): {
    requestTimeoutMs: number;
    totalTimeoutMs: number;
  } {
    const hasMcpServers = this.hasConfiguredMcpServers(payload);

    if (!hasMcpServers) {
      return {
        requestTimeoutMs: SESSION_INIT_REQUEST_TIMEOUT_MS,
        totalTimeoutMs: SANDBOX_READY_TIMEOUT_MS,
      };
    }

    return {
      requestTimeoutMs: SESSION_INIT_REQUEST_TIMEOUT_WITH_MCP_MS,
      totalTimeoutMs: SANDBOX_READY_TIMEOUT_WITH_MCP_MS,
    };
  }

  private hasConfiguredMcpServers(payload: Record<string, unknown>): boolean {
    const mcpServers = payload['mcpServers'];
    return (
      typeof mcpServers === 'object' &&
      mcpServers !== null &&
      Object.keys(mcpServers).length > 0
    );
  }

  private isRetryableSessionInitStatus(status: number): boolean {
    return RETRYABLE_SESSION_INIT_STATUSES.has(status);
  }

  private isRetryableSessionInitError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return true;
    }

    if (
      error.message.includes('fetch failed') ||
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('ETIMEDOUT')
    ) {
      return true;
    }

    const { cause } = error;
    if (!cause || typeof cause !== 'object' || !('code' in cause)) {
      return false;
    }

    return (
      typeof cause.code === 'string' &&
      RETRYABLE_SESSION_INIT_ERROR_CODES.has(cause.code)
    );
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

  private async buildRemoteToolExecutionPayload(
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

  private assertValidSessionToolCallbackToken(
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

  private async resolveSessionToolSet(sessionId: string): Promise<ToolSet> {
    const providers = this.sessionToolProviders.get(sessionId) ?? [];
    const toolSet: ToolSet = {};

    for (const provider of providers) {
      Object.assign(toolSet, await provider());
    }

    return toolSet;
  }

  private async resolveSessionTool(
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

  private parseServerSentEvent(
    sessionId: string,
    frame: string,
  ): { events: AgentEvent[]; error?: Error } {
    const payload = frame
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n');

    if (!payload || payload === '[DONE]') {
      return { events: [] };
    }

    const parsed = JSON.parse(payload) as unknown;
    if (this.isAgentEvent(parsed)) {
      return { events: [parsed] };
    }

    if (
      this.isRecord(parsed) &&
      parsed.jsonrpc === '2.0' &&
      parsed.method === 'event' &&
      this.isRecord(parsed.params)
    ) {
      return this.translateContainerEvent(
        sessionId,
        parsed.params as ContainerEventEnvelope,
      );
    }

    if (this.isRecord(parsed) && typeof parsed.type === 'string') {
      return this.translateContainerEvent(
        sessionId,
        parsed as ContainerEventEnvelope,
      );
    }

    return { events: [] };
  }

  private translateContainerEvent(
    sessionId: string,
    envelope: ContainerEventEnvelope,
  ): { events: AgentEvent[]; error?: Error } {
    const eventType = typeof envelope.type === 'string' ? envelope.type : null;
    const payload = this.readContainerEventPayload(envelope);
    const data = this.isRecord(payload) ? payload : null;

    switch (eventType) {
      case 'text_delta': {
        const content = this.readTextDelta(payload);
        if (!content) {
          return { events: [] };
        }
        return { events: [{ type: 'message_chunk', content }] };
      }

      case 'tool_call_start':
        return {
          events: [
            {
              type: 'tool_call',
              call: this.buildToolCallEvent(data, 'in_progress'),
            },
          ],
        };

      case 'tool_call_update':
        return {
          events: [
            {
              type: 'tool_call',
              call: this.buildToolCallEvent(data, 'in_progress'),
            },
          ],
        };

      case 'tool_call_end':
        return {
          events: [
            {
              type: 'tool_call',
              call: this.buildToolCallEvent(
                data,
                this.readBoolean(data?.isError) || data?.error
                  ? 'failed'
                  : 'completed',
              ),
            },
          ],
        };

      case 'done':
        return {
          events: [
            {
              type: 'done',
              stopReason: this.normalizeStopReason(data?.stopReason),
            },
          ],
        };

      case 'error': {
        const message =
          this.readString(data?.message) ??
          this.readString((envelope as Record<string, unknown>)['message']) ??
          this.readString(payload) ??
          'Sandbox agent error';
        const code =
          this.readString((envelope as Record<string, unknown>)['code']) ??
          this.readString(data?.code);
        this.clearPendingPermissions(sessionId, 'deny');
        return {
          events: [],
          error: new SandboxPromptError(message, code),
        };
      }

      case 'pty_spawned': {
        const ptySessionId = this.readString(data?.sessionId);
        if (!ptySessionId) return { events: [] };
        return {
          events: [
            {
              type: 'pty.spawned' as const,
              sessionId: ptySessionId,
              info: (data?.info ?? {}) as PtySessionInfo,
            },
          ],
        };
      }

      case 'pty_output': {
        const ptySessionId = this.readString(data?.sessionId);
        const ptyData = this.readString(data?.data);
        if (!ptySessionId || ptyData == null) return { events: [] };
        return {
          events: [
            {
              type: 'pty.output' as const,
              sessionId: ptySessionId,
              data: ptyData,
            },
          ],
        };
      }

      case 'pty_exit': {
        const ptySessionId = this.readString(data?.sessionId);
        if (!ptySessionId) return { events: [] };
        const exitCode =
          typeof data?.exitCode === 'number' ? data.exitCode : undefined;
        const exitSignal =
          typeof data?.exitSignal === 'number' ||
          typeof data?.exitSignal === 'string'
            ? data.exitSignal
            : undefined;
        return {
          events: [
            {
              type: 'pty.exit' as const,
              sessionId: ptySessionId,
              ...(exitCode !== undefined && { exitCode }),
              ...(exitSignal !== undefined && { exitSignal }),
            },
          ],
        };
      }

      case 'pty_killed': {
        const ptySessionId = this.readString(data?.sessionId);
        if (!ptySessionId) return { events: [] };
        return {
          events: [{ type: 'pty.killed' as const, sessionId: ptySessionId }],
        };
      }

      default:
        return { events: [] };
    }
  }

  private async cancelReaderSafely(
    reader: ReadableStreamDefaultReader<Uint8Array>,
  ): Promise<void> {
    try {
      await reader.cancel();
    } catch {
      // 忽略 transport 关闭阶段的取消异常；terminal 事件已是上层唯一真相。
    }
  }

  private readContainerEventPayload(envelope: ContainerEventEnvelope): unknown {
    if ('data' in envelope && envelope.data !== undefined) {
      return envelope.data;
    }

    const payloadEntries = Object.entries(envelope).filter(
      ([key]) => key !== 'type' && key !== 'data',
    );
    if (payloadEntries.length === 0) {
      return null;
    }

    return Object.fromEntries(payloadEntries);
  }

  private buildToolCallEvent(
    data: Record<string, unknown> | null,
    fallbackStatus: ToolCallStatus,
  ): ToolCallEvent {
    const tool =
      this.readString(data?.toolName) ??
      this.readString(data?.tool) ??
      'unknown_tool';
    const permissionRequest = this.normalizePermissionRequest(
      data?.permissionRequest,
      tool,
      data,
    );
    const status =
      this.readToolCallStatus(
        data?.status,
        permissionRequest,
        fallbackStatus,
      ) ?? fallbackStatus;

    return {
      id:
        this.readString(data?.toolCallId) ??
        this.readString(data?.id) ??
        randomUUID(),
      tool,
      args: this.normalizeToolArgs(data),
      status,
      ...(this.normalizeTransitions(data?.transitions)
        ? { transitions: this.normalizeTransitions(data?.transitions) }
        : {}),
      ...(data && 'result' in data ? { result: data.result } : {}),
      ...(this.readToolError(data)
        ? { error: this.readToolError(data) ?? undefined }
        : {}),
      ...(permissionRequest ? { permissionRequest } : {}),
    };
  }

  private normalizeToolArgs(
    data: Record<string, unknown> | null,
  ): Record<string, unknown> {
    const candidates = [data?.args, data?.input, data?.arguments];
    for (const candidate of candidates) {
      if (this.isRecord(candidate)) {
        return candidate;
      }
    }

    return {};
  }

  private normalizeTransitions(
    value: unknown,
  ): ToolCallEvent['transitions'] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }

    const transitions: ToolCallTransitionRecord[] = value.flatMap((entry) => {
      if (!this.isRecord(entry)) {
        return [];
      }

      const to = this.readToolCallStatus(entry.to, undefined, undefined);
      const timestamp =
        this.readString(entry.timestamp) ?? new Date().toISOString();
      const source: ToolCallTransitionSource =
        entry.source === 'runtime' ||
        entry.source === 'worker' ||
        entry.source === 'user'
          ? entry.source
          : 'runtime';

      return to
        ? [
            {
              ...(this.readToolCallStatus(entry.from, undefined, undefined)
                ? {
                    from: this.readToolCallStatus(
                      entry.from,
                      undefined,
                      undefined,
                    ),
                  }
                : {}),
              to,
              timestamp,
              source,
            } satisfies ToolCallTransitionRecord,
          ]
        : [];
    });

    return transitions.length > 0 ? transitions : undefined;
  }

  private normalizePermissionRequest(
    value: unknown,
    toolName: string,
    data: Record<string, unknown> | null,
  ): ToolPermissionRequest | undefined {
    if (this.isRecord(value)) {
      const description =
        this.readString(value.description) ?? `允许工具 ${toolName} 执行`;
      const resourcePaths = this.readStringArray(value.resourcePaths);
      return {
        description,
        ...(resourcePaths.length > 0 ? { resourcePaths } : {}),
        ...(this.readString(value.domain)
          ? { domain: this.readString(value.domain) }
          : {}),
        ...(this.readString(value.category)
          ? { category: this.readString(value.category) }
          : {}),
        ...(this.readRiskLevel(value.riskLevel)
          ? { riskLevel: this.readRiskLevel(value.riskLevel) }
          : {}),
        ...(this.readString(value.sourceLabel)
          ? { sourceLabel: this.readString(value.sourceLabel) }
          : {}),
        ...(this.readString(value.targetType)
          ? { targetType: this.readString(value.targetType) }
          : {}),
        ...(this.readString(value.targetLabel)
          ? { targetLabel: this.readString(value.targetLabel) }
          : {}),
        ...(this.readString(value.approveEffect)
          ? { approveEffect: this.readString(value.approveEffect) }
          : {}),
        ...(this.readString(value.denyEffect)
          ? { denyEffect: this.readString(value.denyEffect) }
          : {}),
        ...(this.isRecord(value.diffPreview)
          ? { diffPreview: value.diffPreview }
          : {}),
        ...(typeof value.rememberable === 'boolean'
          ? { rememberable: value.rememberable }
          : {}),
      };
    }

    const description = this.readString(data?.description);
    const resourcePaths = this.readStringArray(data?.resourcePaths);
    if (!description && resourcePaths.length === 0) {
      return undefined;
    }

    return {
      description: description ?? `允许工具 ${toolName} 执行`,
      ...(resourcePaths.length > 0 ? { resourcePaths } : {}),
      ...(this.readString(data?.domain)
        ? { domain: this.readString(data?.domain) }
        : {}),
      ...(this.readString(data?.category)
        ? { category: this.readString(data?.category) }
        : {}),
      ...(this.readRiskLevel(data?.riskLevel)
        ? { riskLevel: this.readRiskLevel(data?.riskLevel) }
        : {}),
      ...(this.readString(data?.sourceLabel)
        ? { sourceLabel: this.readString(data?.sourceLabel) }
        : {}),
      ...(this.readString(data?.targetType)
        ? { targetType: this.readString(data?.targetType) }
        : {}),
      ...(this.readString(data?.targetLabel)
        ? { targetLabel: this.readString(data?.targetLabel) }
        : {}),
      ...(this.readString(data?.approveEffect)
        ? { approveEffect: this.readString(data?.approveEffect) }
        : {}),
      ...(this.readString(data?.denyEffect)
        ? { denyEffect: this.readString(data?.denyEffect) }
        : {}),
      ...(this.isRecord(data?.diffPreview)
        ? { diffPreview: data?.diffPreview }
        : {}),
      ...(typeof data?.rememberable === 'boolean'
        ? { rememberable: data.rememberable }
        : {}),
    };
  }

  private readRiskLevel(
    value: unknown,
  ): ToolPermissionRequest['riskLevel'] | undefined {
    switch (value) {
      case 'low':
      case 'medium':
      case 'high':
        return value;
      default:
        return undefined;
    }
  }

  private normalizeStopReason(value: unknown): StopReason {
    switch (value) {
      case 'cancelled':
      case 'aborted':
        return 'cancelled';
      case 'max_tokens':
      case 'length':
        return 'max_tokens';
      case 'tool_use':
      case 'toolUse':
        return 'tool_use';
      case 'intervention_required':
        return 'intervention_required';
      default:
        return 'end_turn';
    }
  }

  private readToolCallStatus(
    value: unknown,
    permissionRequest?: ToolPermissionRequest,
    fallback?: ToolCallStatus,
  ): ToolCallStatus | undefined {
    switch (value) {
      case 'pending':
      case 'awaiting_permission':
      case 'denied':
      case 'in_progress':
      case 'completed':
      case 'failed':
        return value;
      default:
        if (permissionRequest) {
          return 'awaiting_permission';
        }

        return fallback;
    }
  }

  private readTextDelta(value: unknown): string | null {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }

    if (!this.isRecord(value)) {
      return null;
    }

    return (
      this.readString(value.delta) ??
      this.readString(value.content) ??
      this.readString(value.text) ??
      null
    );
  }

  private readToolError(
    data: Record<string, unknown> | null,
  ): string | undefined {
    const errorValue = data?.error;
    if (typeof errorValue === 'string' && errorValue.length > 0) {
      return errorValue;
    }

    if (this.isRecord(errorValue)) {
      return this.readString(errorValue.message) ?? JSON.stringify(errorValue);
    }

    if (this.readBoolean(data?.isError)) {
      return this.readString(data?.message) ?? 'Sandbox tool execution failed';
    }

    return undefined;
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private readBoolean(value: unknown): boolean {
    return value === true;
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    return this.isRecord(value) ? value : undefined;
  }

  private readStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter(
      (entry): entry is string => typeof entry === 'string' && entry.length > 0,
    );
  }

  private async waitForPermission(
    sessionId: string,
    toolCallId: string,
  ): Promise<PendingPermissionAction> {
    const session = await this.loadSession(sessionId);
    const controller = this.abortControllers.get(sessionId);
    const signal = controller?.signal;
    const sessionResolvers =
      this.pendingPermissionResolvers.get(sessionId) ??
      new Map<string, PendingPermissionGate>();

    if (sessionResolvers.has(toolCallId)) {
      throw new Error(
        `Session ${sessionId} already has pending tool permission for ${toolCallId}`,
      );
    }

    this.pendingPermissionResolvers.set(sessionId, sessionResolvers);

    return await new Promise<PendingPermissionAction>((resolve) => {
      const finish = (action: PendingPermissionAction) => {
        clearTimeout(timer);
        sessionResolvers.delete(toolCallId);
        if (sessionResolvers.size === 0) {
          this.pendingPermissionResolvers.delete(sessionId);
        }
        signal?.removeEventListener('abort', onAbort);
        resolve(action);
      };

      const onAbort = () => finish('cancelled');
      const timer = setTimeout(
        () => finish('deny'),
        TOOL_PERMISSION_TIMEOUT_MS,
      );

      sessionResolvers.set(toolCallId, {
        resolve: finish,
        timer,
      });

      if (signal?.aborted || session.status !== 'active') {
        finish('cancelled');
        return;
      }

      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  private clearPendingPermissions(
    sessionId: string,
    action: PendingPermissionAction,
  ): void {
    const sessionResolvers = this.pendingPermissionResolvers.get(sessionId);
    if (!sessionResolvers) {
      return;
    }

    this.pendingPermissionResolvers.delete(sessionId);
    for (const gate of sessionResolvers.values()) {
      clearTimeout(gate.timer);
      gate.resolve(action);
    }
  }

  private resolveSessionIdForConversation(conversationId: string): string {
    const mappedSessionId = this.conversationSessionIds.get(conversationId);
    if (mappedSessionId && this.sessions.has(mappedSessionId)) {
      return mappedSessionId;
    }

    for (const [sessionId, session] of this.sessions.entries()) {
      const binding = this.readSandboxBinding(
        session.context.workflowState ?? {},
      );
      if (binding.agentConversationId === conversationId) {
        this.conversationSessionIds.set(conversationId, sessionId);
        return sessionId;
      }
    }

    throw new Error(
      `Sandbox conversation session not found for ${conversationId}`,
    );
  }

  async listPtySessions(
    sandboxBinding: SandboxBinding,
    tenantId: string,
  ): Promise<unknown> {
    const sandboxSession = await this.waitForSandboxReady(
      sandboxBinding,
      tenantId,
    );
    const baseUrl = await this.getContainerBaseUrl(sandboxSession.containerId);

    const response = await fetch(`${baseUrl}/v1/pty/sessions`, {
      method: 'GET',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`PTY sessions 查询失败: status=${response.status}`);
    }

    return response.json();
  }

  async ptyBufferDump(
    sandboxBinding: SandboxBinding,
    tenantId: string,
    ptySessionId: string,
    options?: { offset?: number; limit?: number; pattern?: string },
  ): Promise<unknown> {
    const sandboxSession = await this.waitForSandboxReady(
      sandboxBinding,
      tenantId,
    );
    const baseUrl = await this.getContainerBaseUrl(sandboxSession.containerId);

    const response = await fetch(`${baseUrl}/v1/pty/buffer-dump`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: ptySessionId, ...options }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`PTY buffer-dump 失败: status=${response.status}`);
    }

    return response.json();
  }

  async ptyWrite(
    sandboxBinding: SandboxBinding,
    tenantId: string,
    ptySessionId: string,
    data: string,
  ): Promise<unknown> {
    const sandboxSession = await this.waitForSandboxReady(
      sandboxBinding,
      tenantId,
    );
    const baseUrl = await this.getContainerBaseUrl(sandboxSession.containerId);

    const response = await fetch(`${baseUrl}/v1/pty/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: ptySessionId, data }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`PTY write 失败: status=${response.status}`);
    }

    return response.json();
  }

  private async getContainerBaseUrl(containerId: string): Promise<string> {
    const promptUrl = await this.dockerService.getPromptUrl(containerId);
    return promptUrl.replace(/\/v1\/prompt$/, '');
  }

  private async abortContainerPrompt(
    sessionId: string,
    sandboxBinding: SandboxBinding,
    tenantId: string,
  ): Promise<void> {
    try {
      const sandboxSession = await this.waitForSandboxReady(
        sandboxBinding,
        tenantId,
      );
      const promptUrl = await this.dockerService.getPromptUrl(
        sandboxSession.containerId,
      );
      const abortUrl = new URL(promptUrl);
      abortUrl.pathname = '/v1/abort';

      const response = await fetch(abortUrl.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
        signal: AbortSignal.timeout(ABORT_REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        this.logger.warn(
          `Sandbox abort 请求失败: session=${sessionId}, status=${response.status}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Sandbox abort 请求异常: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private isAgentEvent(value: unknown): value is AgentEvent {
    if (!this.isRecord(value) || typeof value.type !== 'string') {
      return false;
    }

    switch (value.type) {
      case 'plan':
        return (
          typeof value.title === 'string' && typeof value.content === 'string'
        );
      case 'message_chunk':
        return typeof value.content === 'string';
      case 'tool_call':
        return this.isRecord(value.call);
      case 'decision':
        return typeof value.suggestedContent === 'string';
      case 'done':
        return typeof value.stopReason === 'string';
      case 'pty.spawned':
        return typeof value.sessionId === 'string';
      case 'pty.output':
        return (
          typeof value.sessionId === 'string' && typeof value.data === 'string'
        );
      case 'pty.exit':
        return typeof value.sessionId === 'string';
      case 'pty.killed':
        return typeof value.sessionId === 'string';
      default:
        return false;
    }
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private normalizeOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' ? this.normalizeString(value) : undefined;
  }

  private normalizeString(value?: string | null): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
}
