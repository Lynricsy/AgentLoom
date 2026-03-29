import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Fastify from 'fastify';
import { AcpAdapter, type SessionFactory } from './acp-adapter.js';
import { streamSessionEvents } from './event-stream.js';
import { createPtyExtension } from './pty-extension.js';
import { createMcpExtension } from './mcp-extension.js';
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

export interface PiCodingAgentBindings {
  createAgentSession: (...args: any[]) => Promise<{ session: unknown }>;
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
    inMemory: (...args: any[]) => unknown;
  };
  ModelRegistry: new (...args: any[]) => unknown;
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
  return async (cwd, config) => {
    const {
      createAgentSession,
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

    // MCP extension（根据配置连接 MCP 服务器，发现并注册工具）
    const mcpExt = createMcpExtension({
      mcpServers: config.mcpServers,
    });

    // 使用 /config 作为 pi 的 agentDir，确保 models/settings/skills 均参与真实运行时装配。
    const settingsManager = SettingsManager.inMemory(config.settings ?? {});
    const authStorage = AuthStorage.inMemory();
    const modelRegistry = new ModelRegistry(authStorage, SANDBOX_MODELS_PATH);
    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir: SANDBOX_AGENT_DIR,
      settingsManager,
      systemPrompt: config.systemPrompt,
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
      resourceLoader,
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
