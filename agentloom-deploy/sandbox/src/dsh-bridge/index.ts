/**
 * agentloom-bridge：运行在 dsh 子进程内的 Cordis 插件，取代
 * dsh-sdk-jsonrpc-server，在 unix socket 上为 guest 进程提供会话创建 / 提问 /
 * 取消 / 销毁、审批回路、PTY 代理与事件流（见 ../dsh/bridge-protocol.ts）。
 *
 * stdout / stderr 归 dsh launcher；本插件只用 ctx.logger 或 console.error 记录日志。
 */
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-agent';
import { brandString } from '@deepseek-ai/dsh-brand';
import type {} from '@deepseek-ai/dsh-llm';
import type { SessionId } from '@deepseek-ai/dsh-session';
import type {} from '@deepseek-ai/dsh-tools';
import type {} from '@deepseek-ai/dsh-user-approval';
import Schema from '@deepseek-ai/schemastery';
import { AgentLoomBridge, listenBridgeSocket } from './bridge.js';
import { findInactiveEntries, type LoaderLike } from './loader-audit.js';

export const name = 'agentloom-bridge';
export const inject = ['agents', 'tools', 'llm'];

export interface Config {
  /** guest 进程连接的 unix socket 路径 */
  socketPath: string;
  /** PTY 默认工作目录 */
  workdir: string;
}

export const Config = Schema.object({
  socketPath: Schema.string().required(),
  workdir: Schema.string().required(),
});

export function apply(ctx: Context, config: Config): void {
  let shutdown: Promise<void> | undefined;
  const bridge = new AgentLoomBridge(
    {
      awaitLoader: async () => {
        await ctx.get('loader')?.await();
      },
      resolveCallConfig: async (provider, model) => {
        await ctx.llm.resolveCallConfig({ provider, model });
      },
      inactiveEntries: async (ids) => {
        // cordis-plugin-loader 不是本包的直接依赖，只按审计用到的结构读取 Loader。
        const loader = ctx.get('loader') as LoaderLike | undefined;
        return loader ? findInactiveEntries(loader, ids) : [];
      },
      createAgent: async ({ sessionId, cwd, provider, model }) => {
        const handle = await ctx.agents.create({
          sessionId: brandString<SessionId>(sessionId),
          meta: { cwd },
          agentOptions: { provider, model },
        });
        return { agent: handle.agent, dispose: () => handle.dispose() };
      },
      registerTool: (definition) => ctx.tools.register(definition),
      guardTools: (guard) => ctx.tools.guard(guard),
      shutdownProcess: () => {
        shutdown ??= (async () => {
          await Promise.allSettled([ctx.root.fiber.dispose()]);
          process.exit(0);
        })();
      },
    },
    config.workdir,
  );

  ctx.on('session/event', (session, event) => {
    bridge.handleSessionEvent(String(session.id), event);
  });
  ctx.on('agent/assistant-stream', ({ agent, frame }) => {
    bridge.handleAssistantFrame(String(agent.session.id), frame);
  });
  ctx.on('approval/request', (request, next) =>
    bridge.handleApprovalRequest(
      {
        sessionId: String(request.agent.session.id),
        toolName: request.toolName,
        ...(request.callId !== undefined ? { callId: String(request.callId) } : {}),
        ...(request.reason !== undefined ? { reason: request.reason } : {}),
        ...(request.signal ? { signal: request.signal } : {}),
      },
      next,
    ),
  );

  ctx.effect(async () => {
    const server = await listenBridgeSocket(config.socketPath, bridge);
    return async () => {
      await server.close();
      await bridge.dispose();
    };
  }, 'agentloom.bridge');
}
