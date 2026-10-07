import { chmodSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { AcpAdapter, type SessionFactory } from './acp-adapter.js';
import { createDshSessionFactory, type PtyBridge } from './dsh/session-factory.js';
import { streamSessionEvents } from './event-stream.js';
import type {
  CreateSessionRequest,
  PromptRequest,
  AbortRequest,
  HealthResponse,
  PermissionResolveRequest,
} from './types.js';

export interface SandboxServerOptions {
  host?: string;
  port?: number;
  socketPath?: string;
  sessionFactory: SessionFactory;
  /** 最近创建的 dsh 会话内 PTYManager 的代理（/v1/pty/* 使用） */
  getPtyBridge?: () => PtyBridge | null;
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
    getPtyBridge,
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

  // server 对 dsh 发起的工具审批（原生 / MCP / 插件工具）作出决议后回到这里。
  app.post<{ Body: Partial<PermissionResolveRequest> }>('/v1/permission', async (request, reply) => {
    const { sessionId, toolCallId, allowed } = request.body ?? {};
    if (!sessionId || !toolCallId || typeof allowed !== 'boolean') {
      return reply
        .code(400)
        .send({ error: 'sessionId, toolCallId and allowed are required' });
    }
    const entry = adapter.getSession(sessionId);
    if (!entry) {
      return reply.code(404).send({ error: `Session '${sessionId}' not found` });
    }
    const resolved = await entry.session.resolvePermission(toolCallId, allowed);
    return reply.code(200).send({ resolved });
  });

  // --- PTY endpoints（经当前会话的 dsh bridge 代理） ---

  app.post<{ Body: { sessionId?: string } }>('/v1/pty/buffer-dump', async (request, reply) => {
    const { sessionId } = request.body ?? {};
    if (!sessionId) {
      return reply.code(400).send({ error: 'sessionId is required' });
    }
    const ptyBridge = getPtyBridge?.() ?? null;
    if (!ptyBridge) {
      return reply.code(503).send({ error: 'PTY manager not available' });
    }
    const content = await ptyBridge.bufferDump(sessionId);
    if (content === null) {
      return reply.code(404).send({ error: `PTY session '${sessionId}' not found` });
    }
    const lines = content ? content.split('\n') : [];
    return reply.code(200).send({ lines, totalLines: lines.length });
  });

  app.get('/v1/pty/sessions', async (_request, reply) => {
    const ptyBridge = getPtyBridge?.() ?? null;
    if (!ptyBridge) {
      return reply.code(200).send([]);
    }
    return reply.code(200).send(await ptyBridge.list());
  });

  app.post<{ Body: { sessionId?: string; data?: string } }>('/v1/pty/write', async (request, reply) => {
    const { sessionId, data } = request.body ?? {};
    if (!sessionId || !data) {
      return reply.code(400).send({ error: 'sessionId and data are required' });
    }
    const ptyBridge = getPtyBridge?.() ?? null;
    if (!ptyBridge) {
      return reply.code(503).send({ error: 'PTY manager not available' });
    }
    try {
      await ptyBridge.write(sessionId, data);
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

export async function startServer() {
  let currentPtyBridge: PtyBridge | null = null;
  const require = createRequire(import.meta.url);

  await createSandboxServer({
    sessionFactory: createDshSessionFactory({
      dshBin:
        process.env['AGENTLOOM_DSH_BIN'] ?? require.resolve('@deepseek-ai/dsh/lib/bin.js'),
      // 从 src/（tsx 开发）与 dist/（生产）运行时都指向构建产物。
      bridgeEntry: fileURLToPath(new URL('../dist/dsh-bridge/index.js', import.meta.url)),
      onPtyBridgeChange: (bridge, state) => {
        if (state === 'opened') currentPtyBridge = bridge;
        else if (currentPtyBridge === bridge) currentPtyBridge = null;
      },
    }),
    getPtyBridge: () => currentPtyBridge,
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
