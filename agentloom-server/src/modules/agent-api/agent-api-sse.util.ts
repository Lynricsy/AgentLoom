import type { AgentApiStreamEvent } from '@agentloom/contracts';
import type { FastifyReply } from 'fastify';

import type {
  AgentApiEventStreamService,
  AgentApiStreamEntry,
} from '../agent-api-runtime/agent-api-event-stream.service';

/** 心跳间隔：远小于 nginx `/api/` 的 300s 读超时 */
export const AGENT_API_SSE_PING_INTERVAL_MS = 15_000;

export const AGENT_API_SSE_PING_FRAME = ': ping\n\n';

export const AGENT_API_SSE_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
};

/** 按事件名穷举：契约新增事件时类型检查会要求在此表态 */
const TERMINAL_EVENT_NAMES: Record<AgentApiStreamEvent['event'], boolean> = {
  'run.created': false,
  'run.status': false,
  'message.delta': false,
  tool_call: false,
  'run.completed': true,
  'run.failed': true,
  'run.cancelled': true,
};

export function isTerminalStreamEvent(
  event: AgentApiStreamEvent,
): event is Extract<
  AgentApiStreamEvent,
  { event: 'run.completed' | 'run.failed' | 'run.cancelled' }
> {
  return TERMINAL_EVENT_NAMES[event.event] === true;
}

/** 编码一个 SSE 帧：`id` 为 Redis Stream entry id，可作为 Last-Event-ID 续传 */
export function encodeSseFrame(entry: AgentApiStreamEntry): string {
  return `id: ${entry.id}\nevent: ${entry.event.event}\ndata: ${JSON.stringify(
    entry.event.data,
  )}\n\n`;
}

/**
 * 接管 Fastify 响应并把 run 事件流写成 SSE：
 * `afterId` 为 null 时从流的开头读取；终态事件写出后或客户端断开时结束。
 * `completed` 为 true 表示调用方已确认不会再有新事件，只写响应头后立即关闭。
 */
export async function pipeRunEventsToSse(
  reply: FastifyReply,
  eventStream: Pick<AgentApiEventStreamService, 'subscribe'>,
  params: {
    runId: string;
    afterId: string | null;
    completed?: boolean;
    pingIntervalMs?: number;
  },
): Promise<void> {
  reply.hijack();
  const raw = reply.raw;
  // hijack 之后 reply 上已设置的头（CORS 等）不会自动写出，需要逐个写到原始响应
  for (const [name, value] of Object.entries({
    ...reply.getHeaders(),
    ...AGENT_API_SSE_HEADERS,
  })) {
    if (value !== undefined) {
      raw.setHeader(name, value);
    }
  }
  raw.writeHead(200);
  raw.flushHeaders();

  if (params.completed) {
    raw.end();
    return;
  }

  const abort = new AbortController();
  const onClose = () => abort.abort();
  raw.on('close', onClose);

  const ping = setInterval(() => {
    if (!raw.writableEnded) {
      raw.write(AGENT_API_SSE_PING_FRAME);
    }
  }, params.pingIntervalMs ?? AGENT_API_SSE_PING_INTERVAL_MS);

  try {
    await eventStream.subscribe(
      params.runId,
      params.afterId,
      (entry) => {
        if (abort.signal.aborted || raw.writableEnded) {
          return;
        }

        raw.write(encodeSseFrame(entry));
        if (isTerminalStreamEvent(entry.event)) {
          abort.abort();
        }
      },
      abort.signal,
    );
  } finally {
    clearInterval(ping);
    raw.off('close', onClose);
    if (!raw.writableEnded) {
      raw.end();
    }
  }
}
