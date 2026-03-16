import { type Server } from 'node:http';
import { resolve } from 'node:path';

import chokidar, { type FSWatcher } from 'chokidar';
import { Command } from 'commander';
import express, { type Express } from 'express';

import { loadManifest, type BasicPluginManifest } from '../utils/manifest';
import { loadPlugin, serializeNodes, type RuntimeNodeDefinition } from '../utils/plugin';

export interface DevCommandLogger {
  info(message: string): void;
  error(message: string): void;
}

export interface StartDevServerOptions {
  cwd?: string;
  port?: number;
  logger?: DevCommandLogger;
  handleSignals?: boolean;
}

export interface StartedDevServer {
  app: Express;
  manifest: BasicPluginManifest;
  port: number;
  server: Server;
  stop(): Promise<void>;
  watcher: FSWatcher;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePort(portValue: string): number {
  const parsedPort = Number.parseInt(portValue, 10);

  if (!Number.isInteger(parsedPort) || parsedPort < 0) {
    throw new Error(`无效端口号：${portValue}`);
  }

  return parsedPort;
}

function createExecutionLogger(logger: DevCommandLogger) {
  return {
    debug: (message: string) => logger.info(`[debug] ${message}`),
    info: (message: string) => logger.info(message),
    warn: (message: string) => logger.info(`[warn] ${message}`),
    error: (message: string) => logger.error(message),
  };
}

function normalizeExecutionContext(
  value: unknown,
  logger: DevCommandLogger,
): Record<string, unknown> {
  const context = isRecord(value) ? { ...value } : {};

  context.inputs = isRecord(context.inputs) ? context.inputs : {};
  context.config = isRecord(context.config) ? context.config : {};
  context.logger = isRecord(context.logger)
    ? context.logger
    : createExecutionLogger(logger);

  return context;
}

export async function startDevServer(
  options: StartDevServerOptions = {},
): Promise<StartedDevServer> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const logger = options.logger ?? console;
  const manifest = loadManifest(cwd);
  const app = express();
  app.use(express.json());

  let nodes: RuntimeNodeDefinition[] = (await loadPlugin(cwd)).nodes;

  const reloadNodes = async (): Promise<void> => {
    nodes = (await loadPlugin(cwd)).nodes;
    logger.info(`检测到变更，已重新加载插件，共 ${nodes.length} 个节点。`);
  };

  app.get('/manifest', (_request, response) => {
    response.json(manifest);
  });

  app.get('/nodes', (_request, response) => {
    response.json(serializeNodes(nodes));
  });

  app.post('/nodes/:type/execute', async (request, response) => {
    const node = nodes.find((candidate) => candidate.type === request.params.type);

    if (!node || typeof node.execute !== 'function') {
      response.status(404).json({ error: `未找到节点类型：${request.params.type}` });
      return;
    }

    try {
      const result = await node.execute(normalizeExecutionContext(request.body, logger));
      response.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : '节点执行失败。';
      response.status(500).json({ error: message });
    }
  });

  const watcher = chokidar.watch(resolve(cwd, 'src'), {
    ignoreInitial: true,
  });

  watcher.on('all', async (eventName, changedPath) => {
    logger.info(`检测到 ${eventName}: ${changedPath}`);

    try {
      await reloadNodes();
    } catch (error) {
      logger.error(error instanceof Error ? error.message : '插件重载失败。');
    }
  });

  const server = await new Promise<Server>((resolveServer, rejectServer) => {
    const httpServer = app
      .listen(options.port ?? 4400, () => {
        resolveServer(httpServer);
      })
      .on('error', rejectServer);
  });

  const address = server.address();
  const resolvedPort = typeof address === 'object' && address ? address.port : options.port ?? 4400;

  let signalHandlersRegistered = false;

  const stop = async (): Promise<void> => {
    if (signalHandlersRegistered) {
      process.off('SIGINT', signalHandler);
      process.off('SIGTERM', signalHandler);
      signalHandlersRegistered = false;
    }

    await watcher.close();

    await new Promise<void>((resolveClose, rejectClose) => {
      server.close((error) => {
        if (error) {
          rejectClose(error);
          return;
        }

        resolveClose();
      });
    });
  };

  const signalHandler = async (): Promise<void> => {
    logger.info('正在关闭插件开发服务器...');
    await stop();
    process.exit(0);
  };

  if (options.handleSignals !== false) {
    process.on('SIGINT', signalHandler);
    process.on('SIGTERM', signalHandler);
    signalHandlersRegistered = true;
  }

  return {
    app,
    manifest,
    port: resolvedPort,
    server,
    stop,
    watcher,
  };
}

export const devCommand = new Command('dev')
  .description('启动插件本地开发服务器')
  .option('-p, --port <port>', 'Dev server port', '4400')
  .action(async (options: { port: string }) => {
    const server = await startDevServer({ port: parsePort(options.port) });
    console.info(`Plugin dev server running at http://localhost:${server.port}`);
  });
