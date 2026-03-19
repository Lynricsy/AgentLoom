import 'reflect-metadata';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { NestFactory } from '@nestjs/core';
import { AcpGatewayService } from './modules/acp-gateway/acp-gateway.service';
import {
  AcpJsonRpcError,
  buildJsonRpcError,
  buildJsonRpcRequest,
  type JsonRpcId,
} from './modules/acp-gateway/acp-jsonrpc';
import { AcpStdioModule } from './modules/acp-gateway/acp-stdio.module';
import type { AcpConnectionState } from './modules/acp-gateway/acp-types';

interface PendingClientRequest<TResult = unknown> {
  resolve: (result: TResult) => void;
  reject: (error: unknown) => void;
}

function isJsonRpcId(value: unknown): value is JsonRpcId {
  return (
    value === null || typeof value === 'string' || typeof value === 'number'
  );
}

function tryParseClientResponse(rawMessage: string):
  | {
      id: JsonRpcId;
      result?: unknown;
      error?: {
        code: number;
        message: string;
        data?: unknown;
      };
    }
  | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawMessage);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  if ('method' in parsed) {
    return null;
  }

  const candidate = parsed as {
    jsonrpc?: unknown;
    id?: unknown;
    result?: unknown;
    error?: unknown;
  };

  if (candidate.jsonrpc !== '2.0' || !isJsonRpcId(candidate.id)) {
    return null;
  }

  const hasResult = Object.hasOwn(candidate, 'result');
  const hasError = Object.hasOwn(candidate, 'error');

  if (hasResult === hasError) {
    return null;
  }

  if (hasResult) {
    return {
      id: candidate.id,
      result: candidate.result,
    };
  }

  if (
    typeof candidate.error === 'object' &&
    candidate.error !== null &&
    typeof (candidate.error as { code?: unknown }).code === 'number' &&
    typeof (candidate.error as { message?: unknown }).message === 'string'
  ) {
    return {
      id: candidate.id,
      error: {
        code: (candidate.error as { code: number }).code,
        message: (candidate.error as { message: string }).message,
        ...('data' in (candidate.error as object)
          ? {
              data: (candidate.error as { data?: unknown }).data,
            }
          : {}),
      },
    };
  }

  return null;
}

async function writeProtocolMessage(message: unknown) {
  const payload = `${JSON.stringify(message)}\n`;

  if (process.stdout.write(payload)) {
    return;
  }

  await once(process.stdout, 'drain');
}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AcpStdioModule, {
    abortOnError: false,
    logger: false,
  });
  const gateway = app.get(AcpGatewayService);
  let writeChain = Promise.resolve();
  const inFlight = new Set<Promise<void>>();
  let nextServerRequestId = 0;
  const pendingClientRequests = new Map<JsonRpcId, PendingClientRequest>();
  const enqueueProtocolWrite = async (message: unknown) => {
    writeChain = writeChain.then(() => writeProtocolMessage(message));
    await writeChain;
  };
  const requestClient = <TParams, TResult>(method: string, params: TParams) => {
    const requestId = `acp-server-${++nextServerRequestId}`;
    let resolveRequest!: (result: TResult) => void;
    let rejectRequest!: (error: unknown) => void;

    const response = new Promise<TResult>((resolve, reject) => {
      resolveRequest = resolve;
      rejectRequest = reject;
    });

    pendingClientRequests.set(requestId, {
      resolve: resolveRequest as PendingClientRequest['resolve'],
      reject: rejectRequest,
    });

    void enqueueProtocolWrite(buildJsonRpcRequest(requestId, method, params)).catch(
      (error: unknown) => {
        pendingClientRequests.delete(requestId);
        rejectRequest(error);
      },
    );

    return {
      requestId,
      response,
    };
  };
  const cancelClientRequest = <TResult>(
    requestId: JsonRpcId,
    result: TResult,
  ) => {
    const pendingRequest = pendingClientRequests.get(requestId);
    if (!pendingRequest) {
      return false;
    }

    pendingClientRequests.delete(requestId);
    pendingRequest.resolve(result);
    return true;
  };
  const state: AcpConnectionState = {
    initialized: false,
    emitNotification: async (notification) => {
      await enqueueProtocolWrite(notification);
    },
    requestClient,
    cancelClientRequest,
  };
  const readline = createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
    terminal: false,
  });
  let shuttingDown = false;
  let resolveClosed!: () => void;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });

  const shutdown = async (exitCode = 0) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    process.stdin.pause();
    readline.close();

    try {
      await Promise.allSettled([...inFlight]);
      for (const [requestId, pendingRequest] of pendingClientRequests) {
        pendingRequest.reject(
          new Error(
            `ACP stdio connection closed while waiting for client response: ${String(requestId)}`,
          ),
        );
      }
      pendingClientRequests.clear();
      await writeChain;
    } finally {
      await app.close();
      process.exitCode = exitCode;
      resolveClosed();
    }
  };

  process.stdin.setEncoding('utf8');
  process.stdin.resume();
  process.once('SIGINT', () => {
    void shutdown(0);
  });
  process.once('SIGTERM', () => {
    void shutdown(0);
  });

  readline.on('line', (line) => {
    if (shuttingDown || line.trim().length === 0) {
      return;
    }

    const task = (async () => {
      try {
        const clientResponse = tryParseClientResponse(line);
        if (clientResponse) {
          const pendingRequest = pendingClientRequests.get(clientResponse.id);
          if (!pendingRequest) {
            return;
          }

          pendingClientRequests.delete(clientResponse.id);
          if (clientResponse.error) {
            pendingRequest.reject(
              new AcpJsonRpcError(
                clientResponse.error.code,
                clientResponse.error.message,
                clientResponse.error.data,
              ),
            );
          } else {
            pendingRequest.resolve(clientResponse.result);
          }
          return;
        }

        const response = await gateway.handleMessage(line, state);
        if (response) {
          await enqueueProtocolWrite(response);
        }
      } catch {
        await enqueueProtocolWrite(buildJsonRpcError(null, -32603, 'Internal error'));
      }
    })().finally(() => {
      inFlight.delete(task);
    });

    inFlight.add(task);
  });

  readline.once('close', () => {
    void shutdown(0);
  });

  await closed;
}

void bootstrap().catch(async (error: unknown) => {
  const message =
    error instanceof Error
      ? `${error.stack ?? error.message}\n`
      : 'ACP stdio bootstrap failed\n';

  if (error instanceof Error) {
    if (!process.stderr.write(message)) {
      await once(process.stderr, 'drain');
    }
  } else if (!process.stderr.write(message)) {
    await once(process.stderr, 'drain');
  }

  process.exitCode = 1;
});
