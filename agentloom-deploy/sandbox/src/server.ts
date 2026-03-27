import { existsSync } from 'node:fs';
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
    const { sessionId, text, permissionCallbackUrl } = request.body;

    if (!sessionId || !text) {
      return reply.code(400).send({ error: 'sessionId and text are required' });
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

    request.raw.on('close', () => {
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

    factory = async (cwd, config) => {
      const { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager, AuthStorage } = piAgent;

      // PTY extension（每个 session 创建独立的 PTYManager）
      const ptyExt = createPtyExtension({
        onPtyEvent: () => {},
        workdir: cwd,
      });
      currentPtyManager = ptyExt.manager;

      // MCP extension（根据配置连接 MCP 服务器，发现并注册工具）
      const mcpExt = createMcpExtension({
        mcpServers: config.mcpServers,
      });

      // 构建 DefaultResourceLoader，注入所有 extension factories
      // 结构化类型与 pi-coding-agent 的 ExtensionFactory 运行时兼容，使用 as any 桥接
      const resourceLoader = new DefaultResourceLoader({
        cwd,
        extensionFactories: [mcpExt.register, ptyExt.register] as any,
      });
      await resourceLoader.reload();

      // 创建 agent session，传入 resourceLoader
      // model 类型在 SandboxConfig 中是 string，pi-coding-agent 在内部解析
      const { session } = await createAgentSession({
        cwd,
        sessionManager: SessionManager.inMemory(cwd),
        settingsManager: SettingsManager.inMemory(config.settings ?? {}),
        authStorage: AuthStorage.inMemory(),
        model: config.model as any,
        resourceLoader,
      });

      // AgentSession 与 IAgentSession 结构兼容（subscribe 事件类型是超集）
      return session as unknown as import('./types.js').IAgentSession;
    };
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
