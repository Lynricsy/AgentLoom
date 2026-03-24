import { existsSync } from 'node:fs';
import Fastify from 'fastify';
import { AcpAdapter, type SessionFactory } from './acp-adapter.js';
import { streamSessionEvents } from './event-stream.js';
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
  ptyManager?: PTYManager | null;
}

export async function createSandboxServer(options: SandboxServerOptions) {
  const { host = '0.0.0.0', port = 8080, sessionFactory, ptyManager = null } = options;

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

  try {
    const piAgent = await import('@mariozechner/pi-coding-agent');
    factory = async (cwd, config) => {
      const { createAgentSession, SessionManager, SettingsManager, AuthStorage } = piAgent;
      const { session } = await createAgentSession({
        cwd,
        sessionManager: SessionManager.inMemory(cwd),
        settingsManager: SettingsManager.inMemory(config.settings ?? {}),
        authStorage: AuthStorage.inMemory(),
        model: config.model,
      });
      return session;
    };
  } catch {
    console.warn('pi-coding-agent not found, using stub factory');
  }

  await createSandboxServer({ sessionFactory: factory });
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
