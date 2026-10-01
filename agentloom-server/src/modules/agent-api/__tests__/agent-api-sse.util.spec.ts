import { EventEmitter } from 'node:events';

import type { AgentApiRun } from '@agentloom/contracts';
import type { FastifyReply } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AgentApiStreamEntry } from '../../agent-api-runtime/agent-api-event-stream.service';
import {
  AGENT_API_SSE_PING_FRAME,
  encodeSseFrame,
  pipeRunEventsToSse,
} from '../agent-api-sse.util';

const RUN_ID = '019391d4-f000-7000-8000-000000000007';

const RUN: AgentApiRun = {
  id: RUN_ID,
  conversationId: '019391d4-e000-7000-8000-000000000005',
  status: 'completed',
  agentVersionId: null,
  input: {
    messageId: '019391d4-f000-7000-8000-000000000008',
    content: '你好',
  },
  output: null,
  stopReason: 'end_turn',
  error: null,
  createdAt: '2026-10-01T08:00:00.000Z',
  startedAt: null,
  completedAt: '2026-10-01T08:00:05.000Z',
};

const DELTA: AgentApiStreamEntry = {
  id: '1727773262000-0',
  event: {
    event: 'message.delta',
    data: { runId: RUN_ID, index: 0, delta: '已为您\n查询' },
  },
};
const COMPLETED: AgentApiStreamEntry = {
  id: '1727773280000-0',
  event: { event: 'run.completed', data: { run: RUN } },
};
const LATE_DELTA: AgentApiStreamEntry = {
  id: '1727773281000-0',
  event: { event: 'message.delta', data: { runId: RUN_ID, index: 1, delta: 'x' } },
};

class FakeRawResponse extends EventEmitter {
  readonly headers: Record<string, unknown> = {};
  readonly chunks: string[] = [];
  statusCode = 0;
  writableEnded = false;

  setHeader(name: string, value: unknown) {
    this.headers[name.toLowerCase()] = value;
  }
  writeHead(statusCode: number) {
    this.statusCode = statusCode;
  }
  flushHeaders() {}
  write(chunk: string) {
    this.chunks.push(chunk);
    return true;
  }
  end() {
    this.writableEnded = true;
  }
}

function createReply() {
  const raw = new FakeRawResponse();
  const reply = {
    raw,
    hijack: vi.fn(),
    getHeaders: () => ({ 'access-control-allow-origin': '*' }),
  };
  return { reply: reply as unknown as FastifyReply, raw, hijack: reply.hijack };
}

/** 按顺序投递预置条目后一直保持订阅，直到 signal 中止 */
function createEventStream(entries: AgentApiStreamEntry[]) {
  const signals: AbortSignal[] = [];
  const subscribe = vi.fn(
    async (
      _runId: string,
      _afterId: string | null,
      onEntry: (entry: AgentApiStreamEntry) => void,
      signal: AbortSignal,
    ) => {
      signals.push(signal);
      for (const entry of entries) {
        onEntry(entry);
      }
      if (!signal.aborted) {
        await new Promise<void>((resolve) =>
          signal.addEventListener('abort', () => resolve(), { once: true }),
        );
      }
    },
  );
  return { eventStream: { subscribe }, subscribe, signals };
}

describe('agent-api SSE', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('帧按 id / event / data 编码，data 为单行 JSON', () => {
    expect(encodeSseFrame(DELTA)).toBe(
      `id: 1727773262000-0\nevent: message.delta\ndata: {"runId":"${RUN_ID}","index":0,"delta":"已为您\\n查询"}\n\n`,
    );
  });

  it('接管响应写出 SSE 头，终态事件写出后关闭连接且不再写后续条目', async () => {
    const { reply, raw, hijack } = createReply();
    const { eventStream, subscribe } = createEventStream([
      DELTA,
      COMPLETED,
      LATE_DELTA,
    ]);

    await pipeRunEventsToSse(reply, eventStream, {
      runId: RUN_ID,
      afterId: '1727773261000-0',
    });

    expect(hijack).toHaveBeenCalled();
    expect(raw.statusCode).toBe(200);
    expect(raw.headers).toMatchObject({
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
      'access-control-allow-origin': '*',
    });
    expect(subscribe).toHaveBeenCalledWith(
      RUN_ID,
      '1727773261000-0',
      expect.any(Function),
      expect.any(AbortSignal),
    );
    expect(raw.chunks).toEqual([
      encodeSseFrame(DELTA),
      encodeSseFrame(COMPLETED),
    ]);
    expect(raw.writableEnded).toBe(true);
  });

  it('空闲期间每 15 秒发送一次 ping，客户端断开后结束订阅', async () => {
    vi.useFakeTimers();
    const { reply, raw } = createReply();
    const { eventStream, signals } = createEventStream([DELTA]);

    const piping = pipeRunEventsToSse(reply, eventStream, {
      runId: RUN_ID,
      afterId: null,
    });
    await vi.advanceTimersByTimeAsync(30_000);

    expect(raw.chunks).toEqual([
      encodeSseFrame(DELTA),
      AGENT_API_SSE_PING_FRAME,
      AGENT_API_SSE_PING_FRAME,
    ]);

    raw.emit('close');
    await piping;

    expect(signals[0]?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(raw.chunks).toHaveLength(3);
  });

  it('调用方确认不会再有事件时只写响应头并立即关闭', async () => {
    const { reply, raw } = createReply();
    const { eventStream, subscribe } = createEventStream([]);

    await pipeRunEventsToSse(reply, eventStream, {
      runId: RUN_ID,
      afterId: COMPLETED.id,
      completed: true,
    });

    expect(raw.statusCode).toBe(200);
    expect(raw.chunks).toEqual([]);
    expect(raw.writableEnded).toBe(true);
    expect(subscribe).not.toHaveBeenCalled();
  });
});
