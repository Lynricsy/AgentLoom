import { randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Fastify from 'fastify';
import { AcpAdapter, type SessionFactory } from './acp-adapter.js';
import { streamSessionEvents } from './event-stream.js';
import { createPtyExtension } from './pty-extension.js';
import { createMcpExtension } from './mcp-extension.js';
import { createRemoteToolDefinitions } from './remote-tools.js';
import { prepareSessionConfig } from './session-config.js';
import type { PTYManager } from './pty/pty-manager.js';
import type {
  IAgentSession,
  CreateSessionRequest,
  PromptRequest,
  AbortRequest,
  HealthResponse,
} from './types.js';

export interface SandboxServerOptions {
  host?: string;
  port?: number;
  socketPath?: string;
  sessionFactory: SessionFactory;
  /** 获取当前 PTY manager（支持 session factory 动态设置） */
  getPtyManager?: () => PTYManager | null;
}

const DEFAULT_SESSION_MODEL_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
} as const;
const DEFAULT_SESSION_MODEL_INPUT = ['text'] as const;
const DEFAULT_SESSION_MODEL_CONTEXT_WINDOW = 128_000;
const DEFAULT_SESSION_MODEL_MAX_TOKENS = 16_384;

/** pi-coding-agent 0.84 内置工具注册名，供 excludeTools 拒绝清单使用。 */
const NATIVE_READ_TOOLS = ['read', 'grep', 'find', 'ls'] as const;
const NATIVE_TERMINAL_TOOLS = ['bash', 'powershell'] as const;
const NATIVE_EDIT_TOOLS = ['edit'] as const;
const NATIVE_WRITE_TOOLS = ['write'] as const;

export interface PiCodingAgentBindings {
  createAgentSession: (
    options: Record<string, unknown>,
  ) => Promise<{ session: unknown }>;
  DefaultResourceLoader: new (options: Record<string, unknown>) => {
    reload: () => Promise<void>;
  };
  SessionManager: {
    inMemory: (cwd?: string) => unknown;
  };
  SettingsManager: {
    inMemory: (settings?: Record<string, unknown>) => unknown;
  };
  // 0.84 用 ModelRuntime 取代了 AuthStorage + ModelRegistry 两件套。
  ModelRuntime: {
    create: (options?: Record<string, unknown>) => Promise<PiModelRuntime>;
  };
}

interface PiModelRuntime {
  setRuntimeApiKey: (providerId: string, apiKey: string) => Promise<void>;
  registerProvider: (
    providerId: string,
    config: Record<string, unknown>,
  ) => void;
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

/**
 * pi-coding-agent 0.84 的 createAgentSession 不再接收 Tool 实例数组，只认工具名。
 * 这里返回被策略禁用的内置工具名，交给 excludeTools（拒绝清单）。
 *
 * 选 excludeTools 而不是 tools 允许清单：允许清单会连 customTools（远程工具）
 * 与扩展工具一起过滤掉，导致 remote tool 静默消失；拒绝清单只作用于命中的名字。
 *
 * 拒绝清单里附带 0.84 扩展池的名字（grep/find/ls/powershell）是 fail-closed：
 * 若默认工具集只含四个内置名，多余的名字是 no-op；若默认集含扩展池，
 * 则「禁读 / 禁终端」的策略语义仍然成立。
 */
function buildExcludedNativeTools(
  nativeToolPolicy: CreateSessionRequest['nativeToolPolicy'],
): string[] {
  const policy = resolveNativeToolPolicy(nativeToolPolicy);
  const excluded: string[] = [];

  if (!policy.readEnabled) {
    excluded.push(...NATIVE_READ_TOOLS);
  }
  if (!policy.terminalEnabled) {
    excluded.push(...NATIVE_TERMINAL_TOOLS);
  }
  if (!policy.editEnabled) {
    excluded.push(...NATIVE_EDIT_TOOLS);
  }
  if (!policy.writeEnabled) {
    excluded.push(...NATIVE_WRITE_TOOLS);
  }

  return excluded;
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

async function applyRuntimeApiKeys(
  modelRuntime: PiModelRuntime,
  runtimeApiKeys?: Record<string, string>,
): Promise<void> {
  if (!runtimeApiKeys) {
    return;
  }

  for (const [provider, apiKey] of Object.entries(runtimeApiKeys)) {
    if (!normalizeString(provider) || !normalizeString(apiKey)) {
      continue;
    }

    // 0.84 的 setRuntimeApiKey 是 async；runtime key 只写内存映射，不落盘。
    await modelRuntime.setRuntimeApiKey(provider, apiKey);
  }
}

function applyDynamicProviders(
  modelRuntime: PiModelRuntime,
  models?: CreateSessionRequest['models'],
): void {
  if (!models?.providers) {
    return;
  }

  for (const [providerName, providerConfig] of Object.entries(models.providers)) {
    const normalizedProviderName = normalizeString(providerName);
    const normalizedConfig = normalizeDynamicProviderConfig(providerConfig);

    if (!normalizedProviderName || !normalizedConfig) {
      continue;
    }

    modelRuntime.registerProvider(normalizedProviderName, normalizedConfig);
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
  const {
    host = '0.0.0.0',
    port = 8080,
    socketPath = process.env['SANDBOX_LISTEN_SOCKET'],
    sessionFactory,
    getPtyManager,
  } = options;

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

    let promptSettled = false;
    let responseEnded = false;
    let terminalEventSent = false;

    const endResponse = () => {
      if (responseEnded || reply.raw.writableEnded || reply.raw.destroyed) {
        return;
      }
      responseEnded = true;
      reply.raw.end();
    };

    const cleanup = streamSessionEvents({
      session: entry.session,
      sessionId,
      permissionCallbackUrl,
      write: (chunk) => reply.raw.write(chunk),
      end: () => {
        terminalEventSent = true;
        endResponse();
      },
    });

    // 对 SSE 来说，request body 很快读完，IncomingMessage 的 close 会过早触发。
    // 必须绑定到 response/socket 生命周期，避免在真正的流式事件开始前就提前 cleanup。
    reply.raw.on('close', () => {
      cleanup();
      if (!promptSettled && !terminalEventSent) {
        void entry.session.abort().catch(() => undefined);
      }
    });

    void entry.session
      .prompt(text)
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Unknown prompt error';
        if (!responseEnded && !reply.raw.destroyed) {
          reply.raw.write(`data: ${JSON.stringify({
            jsonrpc: '2.0',
            method: 'event',
            params: { type: 'error', message },
          })}\n\n`);
        }
        endResponse();
      })
      .finally(() => {
        promptSettled = true;
        adapter.markStreaming(sessionId, false);
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

  if (socketPath) {
    mkdirSync(dirname(socketPath), { recursive: true, mode: 0o755 });
    if (existsSync(socketPath)) {
      unlinkSync(socketPath);
    }
    await app.listen({ path: socketPath });
    chmodSync(socketPath, 0o600);
  } else {
    await app.listen({ host, port });
  }
  return app;
}

export function createPiSessionFactory(
  piAgent: PiCodingAgentBindings,
  setPtyManager?: (manager: PTYManager | null) => void,
): SessionFactory {
  return async (cwd, config, request) => {
    const sessionRequest: CreateSessionRequest = request.sessionId
      ? request
      : { ...request, sessionId: randomUUID() };
    const preparedConfig = prepareSessionConfig(sessionRequest);
    try {
      const {
        createAgentSession,
        DefaultResourceLoader,
        SessionManager,
        SettingsManager,
        ModelRuntime,
      } = piAgent;

      const ptyExt = createPtyExtension({
        onPtyEvent: () => {},
        workdir: cwd,
      });
      setPtyManager?.(ptyExt.manager);

      const sessionMcpServers = sessionRequest.mcpServers ?? config.mcpServers;
      const mcpExt = createMcpExtension({
        mcpServers: sessionMcpServers,
      });

      const mergedSettings =
        mergeRecords(config.settings, sessionRequest.settings) ?? {};
      const settingsManager = SettingsManager.inMemory(mergedSettings);
      // authPath 指向会话一次性目录，避免落到默认的 ~/.pi/agent/auth.json；
      // runtime API key 本就只写内存，不会命中这个文件。
      const modelRuntime = await ModelRuntime.create({
        authPath: join(preparedConfig.directory, 'auth.json'),
        modelsPath: preparedConfig.modelsPath,
      });
      await applyRuntimeApiKeys(modelRuntime, sessionRequest.runtimeApiKeys);
      applyDynamicProviders(modelRuntime, sessionRequest.models);
      const resourceLoader = new DefaultResourceLoader({
        cwd,
        agentDir: preparedConfig.directory,
        settingsManager,
        systemPrompt: resolveSessionSystemPrompt(config, sessionRequest),
        extensionFactories: [mcpExt.register, ptyExt.register],
      });
      await resourceLoader.reload();

      const excludeTools = buildExcludedNativeTools(
        sessionRequest.nativeToolPolicy,
      );
      const { session } = await createAgentSession({
        cwd,
        agentDir: preparedConfig.directory,
        sessionManager: SessionManager.inMemory(cwd),
        settingsManager,
        modelRuntime,
        ...(excludeTools.length > 0 ? { excludeTools } : {}),
        resourceLoader,
        customTools: createRemoteToolDefinitions(
          sessionRequest.remoteToolExecution,
        ),
      });

      const runtimeSession = session as unknown as IAgentSession;
      const disposeRuntimeSession = runtimeSession.dispose.bind(runtimeSession);
      runtimeSession.dispose = () => {
        try {
          disposeRuntimeSession();
        } finally {
          preparedConfig.dispose();
        }
      };
      return runtimeSession;
    } catch (error) {
      preparedConfig.dispose();
      throw error;
    }
  };
}

async function defaultSessionFactory(): Promise<never> {
  throw new Error(
    'pi-coding-agent not available. Install @earendil-works/pi-coding-agent to use the sandbox.',
  );
}

export async function startServer() {
  let factory: SessionFactory = defaultSessionFactory;
  let currentPtyManager: PTYManager | null = null;

  try {
    const piAgent = await import('@earendil-works/pi-coding-agent');
    // 真实模块的 createAgentSession 签名比本地 bindings 更窄（具名 options 类型），
    // 结构上兼容但参数逆变不通过；bindings 只是本地注入边界，用具名断言收口。
    factory = createPiSessionFactory(
      piAgent as unknown as PiCodingAgentBindings,
      (manager) => {
        currentPtyManager = manager;
      },
    );
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
