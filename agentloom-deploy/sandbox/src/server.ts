import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Fastify from 'fastify';
import { AcpAdapter, type SessionFactory } from './acp-adapter.js';
import { streamSessionEvents } from './event-stream.js';
import { createPtyExtension } from './pty-extension.js';
import { createMcpExtension } from './mcp-extension.js';
import { createRemoteToolDefinitions } from './remote-tools.js';
import type { PTYManager } from './pty/pty-manager.js';
import type {
  CreateSessionRequest,
  PromptRequest,
  AbortRequest,
  HealthResponse,
} from './types.js';

export interface SandboxServerOptions {
  host?: string;
  port?: number;
  sessionFactory: SessionFactory;
  /** 获取当前 PTY manager（支持 session factory 动态设置） */
  getPtyManager?: () => PTYManager | null;
}

const SANDBOX_AGENT_DIR = '/config';
const SANDBOX_MODELS_PATH = join(SANDBOX_AGENT_DIR, 'models.json');
const DEFAULT_SESSION_MODEL_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
} as const;
const DEFAULT_SESSION_MODEL_INPUT = ['text'] as const;
const DEFAULT_SESSION_MODEL_CONTEXT_WINDOW = 128_000;
const DEFAULT_SESSION_MODEL_MAX_TOKENS = 16_384;

export interface PiCodingAgentBindings {
  createAgentSession: (...args: any[]) => Promise<{ session: unknown }>;
  createReadTool?: (cwd: string, options?: Record<string, unknown>) => unknown;
  createBashTool?: (cwd: string, options?: Record<string, unknown>) => unknown;
  createEditTool?: (cwd: string, options?: Record<string, unknown>) => unknown;
  createWriteTool?: (cwd: string, options?: Record<string, unknown>) => unknown;
  DefaultResourceLoader: new (options: Record<string, unknown>) => {
    reload: () => Promise<void>;
  };
  SessionManager: {
    inMemory: (...args: any[]) => unknown;
  };
  SettingsManager: {
    inMemory: (...args: any[]) => unknown;
  };
  AuthStorage: {
    inMemory: (...args: any[]) => {
      setRuntimeApiKey?: (provider: string, apiKey: string) => void;
    };
  };
  ModelRegistry: new (...args: any[]) => {
    registerProvider?: (providerName: string, config: Record<string, unknown>) => void;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (Array.isArray(entry)) {
        return [
          key,
          entry.map((item) =>
            isRecord(item) ? cloneRecord(item) : item,
          ),
        ];
      }

      return [key, isRecord(entry) ? cloneRecord(entry) : entry];
    }),
  );
}

function mergeRecords(
  base?: Record<string, unknown>,
  override?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!base && !override) {
    return undefined;
  }

  const merged = cloneRecord(base ?? {});
  if (!override) {
    return merged;
  }

  for (const [key, value] of Object.entries(override)) {
    const current = merged[key];
    if (isRecord(current) && isRecord(value)) {
      merged[key] = mergeRecords(current, value) ?? {};
      continue;
    }

    if (Array.isArray(value)) {
      merged[key] = value.map((item) =>
        isRecord(item) ? cloneRecord(item) : item,
      );
      continue;
    }

    merged[key] = isRecord(value) ? cloneRecord(value) : value;
  }

  return merged;
}

function resolveNativeToolPolicy(
  value: CreateSessionRequest['nativeToolPolicy'],
): Required<NonNullable<CreateSessionRequest['nativeToolPolicy']>> {
  return {
    readEnabled: value?.readEnabled ?? true,
    writeEnabled: value?.writeEnabled ?? true,
    editEnabled: value?.editEnabled ?? true,
    terminalEnabled: value?.terminalEnabled ?? true,
  };
}

function buildNativeTools(
  piAgent: PiCodingAgentBindings,
  cwd: string,
  nativeToolPolicy: CreateSessionRequest['nativeToolPolicy'],
): unknown[] {
  const policy = resolveNativeToolPolicy(nativeToolPolicy);
  const tools: unknown[] = [];

  if (policy.readEnabled && piAgent.createReadTool) {
    tools.push(piAgent.createReadTool(cwd));
  }
  if (policy.terminalEnabled && piAgent.createBashTool) {
    tools.push(piAgent.createBashTool(cwd));
  }
  if (policy.editEnabled && piAgent.createEditTool) {
    tools.push(piAgent.createEditTool(cwd));
  }
  if (policy.writeEnabled && piAgent.createWriteTool) {
    tools.push(piAgent.createWriteTool(cwd));
  }

  return tools;
}

function normalizeDynamicModelDefinition(
  value: unknown,
): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = normalizeString(value.id);
  if (!id) {
    return null;
  }

  const name = normalizeString(value.name) ?? id;
  const reasoning =
    typeof value.reasoning === 'boolean' ? value.reasoning : false;
  const input = Array.isArray(value.input)
    ? value.input.filter((entry): entry is string => typeof entry === 'string')
    : [...DEFAULT_SESSION_MODEL_INPUT];
  const cost = isRecord(value.cost)
    ? {
        input:
          typeof value.cost.input === 'number'
            ? value.cost.input
            : DEFAULT_SESSION_MODEL_COST.input,
        output:
          typeof value.cost.output === 'number'
            ? value.cost.output
            : DEFAULT_SESSION_MODEL_COST.output,
        cacheRead:
          typeof value.cost.cacheRead === 'number'
            ? value.cost.cacheRead
            : DEFAULT_SESSION_MODEL_COST.cacheRead,
        cacheWrite:
          typeof value.cost.cacheWrite === 'number'
            ? value.cost.cacheWrite
            : DEFAULT_SESSION_MODEL_COST.cacheWrite,
      }
    : { ...DEFAULT_SESSION_MODEL_COST };
  const contextWindow =
    typeof value.contextWindow === 'number' && value.contextWindow > 0
      ? value.contextWindow
      : DEFAULT_SESSION_MODEL_CONTEXT_WINDOW;
  const maxTokens =
    typeof value.maxTokens === 'number' && value.maxTokens > 0
      ? value.maxTokens
      : DEFAULT_SESSION_MODEL_MAX_TOKENS;

  return {
    ...cloneRecord(value),
    id,
    name,
    reasoning,
    input: input.length > 0 ? input : [...DEFAULT_SESSION_MODEL_INPUT],
    cost,
    contextWindow,
    maxTokens,
  };
}

function normalizeDynamicProviderConfig(
  value: unknown,
): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null;
  }

  const providerConfig = cloneRecord(value);
  if (!Array.isArray(value.models)) {
    return providerConfig;
  }

  providerConfig.models = value.models
    .map((entry) => normalizeDynamicModelDefinition(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null);

  return providerConfig;
}

function applyRuntimeApiKeys(
  authStorage: {
    setRuntimeApiKey?: (provider: string, apiKey: string) => void;
  },
  runtimeApiKeys?: Record<string, string>,
): void {
  if (!runtimeApiKeys || !authStorage.setRuntimeApiKey) {
    return;
  }

  for (const [provider, apiKey] of Object.entries(runtimeApiKeys)) {
    if (!normalizeString(provider) || !normalizeString(apiKey)) {
      continue;
    }

    authStorage.setRuntimeApiKey(provider, apiKey);
  }
}

function applyDynamicProviders(
  modelRegistry: {
    registerProvider?: (providerName: string, config: Record<string, unknown>) => void;
  },
  models?: CreateSessionRequest['models'],
): void {
  if (!models?.providers || !modelRegistry.registerProvider) {
    return;
  }

  for (const [providerName, providerConfig] of Object.entries(models.providers)) {
    const normalizedProviderName = normalizeString(providerName);
    const normalizedConfig = normalizeDynamicProviderConfig(providerConfig);

    if (!normalizedProviderName || !normalizedConfig) {
      continue;
    }

    modelRegistry.registerProvider(normalizedProviderName, normalizedConfig);
  }
}

function resolveSessionSystemPrompt(
  config: { systemPrompt?: string },
  request: CreateSessionRequest,
): string | undefined {
  return normalizeString(request.systemPrompt) ?? config.systemPrompt;
}

function resolvePromptText(body: PromptRequest | undefined): string | null {
  if (typeof body?.text === 'string' && body.text.trim().length > 0) {
    return body.text;
  }

  if (!Array.isArray(body?.content)) {
    return null;
  }

  const text = body.content
    .flatMap((block) =>
      block?.type === 'text' && typeof block.text === 'string'
        ? [block.text]
        : [],
    )
    .join('\n\n')
    .trim();

  return text.length > 0 ? text : null;
}

export async function createSandboxServer(options: SandboxServerOptions) {
  const { host = '0.0.0.0', port = 8080, sessionFactory, getPtyManager } = options;

  const app = Fastify({ logger: true });
  const adapter = new AcpAdapter(sessionFactory);
  await adapter.init();

  app.post<{ Body: CreateSessionRequest }>('/v1/session', async (request, reply) => {
    const result = await adapter.createNewSession(request.body ?? {});
    return reply.code(200).send(result);
  });

  app.post<{ Body: PromptRequest }>('/v1/prompt', async (request, reply) => {
    const sessionId = request.body?.sessionId;
    const text = resolvePromptText(request.body);
    // 工具权限回调必须由上层显式开启，避免未接好的人机授权链路误伤普通对话。
    const permissionCallbackUrl = request.body?.permissionCallbackUrl;

    if (!sessionId || !text) {
      return reply
        .code(400)
        .send({ error: 'sessionId and text/content are required' });
    }

    const entry = adapter.getSession(sessionId);
    if (!entry) {
      return reply.code(404).send({ error: `Session '${sessionId}' not found` });
    }

    if (entry.isStreaming) {
      return reply.code(409).send({ error: 'Session is already streaming' });
    }

    adapter.markStreaming(sessionId, true, permissionCallbackUrl);

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const cleanup = streamSessionEvents({
      session: entry.session,
      sessionId,
      permissionCallbackUrl,
      write: (chunk) => reply.raw.write(chunk),
      end: () => {
        adapter.markStreaming(sessionId, false);
        reply.raw.end();
      },
    });

    // 对 SSE 来说，request body 很快读完，IncomingMessage 的 close 会过早触发。
    // 必须绑定到 response/socket 生命周期，避免在真正的流式事件开始前就提前 cleanup。
    reply.raw.on('close', () => {
      cleanup();
      adapter.markStreaming(sessionId, false);
    });

    entry.session.prompt(text).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Unknown prompt error';
      reply.raw.write(`data: ${JSON.stringify({
        jsonrpc: '2.0',
        method: 'event',
        params: { type: 'error', message },
      })}\n\n`);
      adapter.markStreaming(sessionId, false);
      reply.raw.end();
    });
  });

  app.post<{ Body: AbortRequest }>('/v1/abort', async (request, reply) => {
    const { sessionId } = request.body;
    if (!sessionId) {
      return reply.code(400).send({ error: 'sessionId is required' });
    }
    try {
      const result = await adapter.abort(sessionId);
      return reply.code(200).send(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Abort failed';
      return reply.code(404).send({ error: message });
    }
  });

  // --- PTY endpoints ---

  app.post<{ Body: { sessionId?: string } }>('/v1/pty/buffer-dump', async (request, reply) => {
    const { sessionId } = request.body ?? {};
    if (!sessionId) {
      return reply.code(400).send({ error: 'sessionId is required' });
    }
    const ptyManager = getPtyManager?.() ?? null;
    if (!ptyManager) {
      return reply.code(503).send({ error: 'PTY manager not available' });
    }
    const session = ptyManager.getSession(sessionId);
    if (!session) {
      return reply.code(404).send({ error: `PTY session '${sessionId}' not found` });
    }
    const content = ptyManager.getBufferDump(sessionId);
    const lines = content ? content.split('\n') : [];
    return reply.code(200).send({ lines, totalLines: lines.length });
  });

  app.get('/v1/pty/sessions', async (_request, reply) => {
    const ptyManager = getPtyManager?.() ?? null;
    if (!ptyManager) {
      return reply.code(200).send([]);
    }
    return reply.code(200).send(ptyManager.list());
  });

  app.post<{ Body: { sessionId?: string; data?: string } }>('/v1/pty/write', async (request, reply) => {
    const { sessionId, data } = request.body ?? {};
    if (!sessionId || !data) {
      return reply.code(400).send({ error: 'sessionId and data are required' });
    }
    const ptyManager = getPtyManager?.() ?? null;
    if (!ptyManager) {
      return reply.code(503).send({ error: 'PTY manager not available' });
    }
    try {
      ptyManager.write(sessionId, data);
      return reply.code(200).send({ success: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Write failed';
      return reply.code(404).send({ error: message });
    }
  });

  app.get('/health', async (_request, reply) => {
    const healthy = existsSync('/workspace');
    const status: HealthResponse = { status: healthy ? 'healthy' : 'unhealthy' };
    return reply.code(healthy ? 200 : 503).send(status);
  });

  app.addHook('onClose', () => {
    adapter.disposeAll();
  });

  await app.listen({ host, port });
  return app;
}

export function createPiSessionFactory(
  piAgent: PiCodingAgentBindings,
  setPtyManager?: (manager: PTYManager | null) => void,
): SessionFactory {
  return async (cwd, config, request) => {
    const {
      createAgentSession,
      createReadTool,
      createBashTool,
      createEditTool,
      createWriteTool,
      DefaultResourceLoader,
      SessionManager,
      SettingsManager,
      AuthStorage,
      ModelRegistry,
    } = piAgent;

    // PTY extension（每个 session 创建独立的 PTYManager）
    const ptyExt = createPtyExtension({
      onPtyEvent: () => {},
      workdir: cwd,
    });
    setPtyManager?.(ptyExt.manager);

    const sessionMcpServers = request.mcpServers ?? config.mcpServers;
    // MCP extension（根据配置连接 MCP 服务器，发现并注册工具）
    const mcpExt = createMcpExtension({
      mcpServers: sessionMcpServers,
    });

    // 使用 /config 作为 pi 的 agentDir，确保 models/settings/skills 均参与真实运行时装配。
    const mergedSettings =
      mergeRecords(config.settings, request.settings) ?? {};
    const settingsManager = SettingsManager.inMemory(mergedSettings);
    const authStorage = AuthStorage.inMemory();
    applyRuntimeApiKeys(authStorage, request.runtimeApiKeys);
    const modelRegistry = new ModelRegistry(authStorage, SANDBOX_MODELS_PATH);
    applyDynamicProviders(modelRegistry, request.models);
    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir: SANDBOX_AGENT_DIR,
      settingsManager,
      systemPrompt: resolveSessionSystemPrompt(config, request),
      extensionFactories: [mcpExt.register, ptyExt.register] as any,
    });
    await resourceLoader.reload();

    const { session } = await createAgentSession({
      cwd,
      agentDir: SANDBOX_AGENT_DIR,
      sessionManager: SessionManager.inMemory(cwd),
      settingsManager,
      authStorage,
      modelRegistry,
      tools: buildNativeTools(
        {
          ...piAgent,
          createReadTool,
          createBashTool,
          createEditTool,
          createWriteTool,
        },
        cwd,
        request.nativeToolPolicy,
      ),
      resourceLoader,
      customTools: createRemoteToolDefinitions(request.remoteToolExecution),
    });

    // AgentSession 与 IAgentSession 结构兼容（subscribe 事件类型是超集）
    return session as unknown as import('./types.js').IAgentSession;
  };
}

async function defaultSessionFactory(): Promise<never> {
  throw new Error(
    'pi-coding-agent not available. Install @mariozechner/pi-coding-agent to use the sandbox.',
  );
}

export async function startServer() {
  let factory: SessionFactory = defaultSessionFactory;
  let currentPtyManager: PTYManager | null = null;

  try {
    const piAgent = await import('@mariozechner/pi-coding-agent');
    factory = createPiSessionFactory(piAgent, (manager) => {
      currentPtyManager = manager;
    });
  } catch {
    console.warn('pi-coding-agent not found, using stub factory');
  }

  await createSandboxServer({
    sessionFactory: factory,
    getPtyManager: () => currentPtyManager,
  });
}

const isMainModule =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));

if (isMainModule) {
  startServer().catch((err) => {
    console.error('Failed to start sandbox server:', err);
    process.exit(1);
  });
}
