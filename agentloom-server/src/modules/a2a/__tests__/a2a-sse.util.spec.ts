import { EventEmitter } from 'node:events';

import type { AgentApiRun } from '@agentloom/contracts';
import type { FastifyReply } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { AgentApiStreamEntry } from '../../agent-api-runtime/agent-api-event-stream.service';
import { encodeA2aSseFrame, pipeTaskEventsToSse } from '../a2a-sse.util';

const RUN_ID = '019391d4-f000-7000-8000-000000000007';
const CONVERSATION_ID = '019391d4-e000-7000-8000-000000000005';
const ASSISTANT_MESSAGE_ID = '019391d4-f000-7000-8000-000000000009';
const IDS = { taskId: RUN_ID, contextId: CONVERSATION_ID };

function runDto(status: AgentApiRun['status']): AgentApiRun {
  return {
    id: RUN_ID,
    conversationId: CONVERSATION_ID,
    status,
    agentVersionId: null,
    input: {
      messageId: '019391d4-f000-7000-8000-000000000008',
      content: '你好',
    },
    output:
      status === 'completed'
        ? { messageId: ASSISTANT_MESSAGE_ID, content: '你好！', toolCalls: [] }
        : null,
    stopReason: status === 'completed' ? 'end_turn' : null,
    error: status === 'failed' ? { type: 'x', title: 'boom' } : null,
    createdAt: '2026-10-01T08:00:00.000Z',
    startedAt: null,
    completedAt: status === 'queued' ? null : '2026-10-01T08:00:05.000Z',
  };
}

let entrySeq = 0;
function entry(event: AgentApiStreamEntry['event']): AgentApiStreamEntry {
  entrySeq += 1;
  return { id: `1727773262000-${entrySeq}`, event };
}

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
  const reply = { raw, hijack: vi.fn(), getHeaders: () => ({}) };
  return { reply: reply as unknown as FastifyReply, raw };
}

/** 按顺序投递预置条目后一直保持订阅，直到 signal 中止 */
function createEventStream(entries: AgentApiStreamEntry[]) {
  const subscribe = vi.fn(
    async (
      _runId: string,
      _afterId: string | null,
      onEntry: (entry: AgentApiStreamEntry) => void,
      signal: AbortSignal,
    ) => {
      for (const item of entries) {
        onEntry(item);
      }
      if (!signal.aborted) {
        await new Promise<void>((resolve) =>
          signal.addEventListener('abort', () => resolve(), { once: true }),
        );
      }
    },
  );
  return { eventStream: { subscribe }, subscribe };
}

const FrameSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number(), z.null()]),
  result: z.record(z.string(), z.unknown()),
});

/** 校验每帧都是 `data: <JSON-RPC 响应>\n\n` 且 id 回显，返回各帧的 result */
function parseResults(chunks: string[], rpcId: string | number): unknown[] {
  return chunks.map((chunk) => {
    expect(chunk.startsWith('data: ')).toBe(true);
    expect(chunk.endsWith('\n\n')).toBe(true);
    const frame = FrameSchema.parse(JSON.parse(chunk.slice('data: '.length)));
    expect(frame.id).toBe(rpcId);
    return frame.result;
  });
}

describe('A2A SSE', () => {
  it('每帧是一条单行 data 的 JSON-RPC 响应', () => {
    expect(
      encodeA2aSseFrame(7, {
        statusUpdate: {
          ...IDS,
          status: {
            state: 'TASK_STATE_WORKING',
            timestamp: '2026-10-01T08:00:01.000Z',
          },
        },
      }),
    ).toBe(
      `data: {"jsonrpc":"2.0","id":7,"result":{"statusUpdate":{"taskId":"${RUN_ID}","contextId":"${CONVERSATION_ID}","status":{"state":"TASK_STATE_WORKING","timestamp":"2026-10-01T08:00:01.000Z"}}}}\n\n`,
    );
  });

  it('首帧为 Task，随后 WORKING、增量 artifact、完整 artifact、COMPLETED，终态后关闭', async () => {
    const { reply, raw } = createReply();
    const { eventStream, subscribe } = createEventStream([
      entry({ event: 'run.created', data: { run: runDto('queued') } }),
      entry({
        event: 'run.status',
        data: { runId: RUN_ID, status: 'running', phase: 'preparing' },
      }),
      entry({
        event: 'run.status',
        data: { runId: RUN_ID, status: 'running', phase: 'running' },
      }),
      entry({
        event: 'tool_call',
        data: {
          runId: RUN_ID,
          toolCallId: 't1',
          tool: 'search',
          status: 'completed',
        },
      }),
      entry({
        event: 'message.delta',
        data: { runId: RUN_ID, index: 0, delta: '你好' },
      }),
      entry({
        event: 'message.delta',
        data: { runId: RUN_ID, index: 0, delta: '！' },
      }),
      entry({ event: 'run.completed', data: { run: runDto('completed') } }),
      entry({
        event: 'message.delta',
        data: { runId: RUN_ID, index: 1, delta: 'late' },
      }),
    ]);

    await pipeTaskEventsToSse(reply, eventStream, {
      run: runDto('queued'),
      rpcId: 'req-1',
    });

    expect(raw.statusCode).toBe(200);
    expect(raw.headers['content-type']).toBe(
      'text/event-stream; charset=utf-8',
    );
    expect(subscribe).toHaveBeenCalledWith(
      RUN_ID,
      null,
      expect.any(Function),
      expect.any(AbortSignal),
    );

    const results = parseResults(raw.chunks, 'req-1');
    expect(results).toEqual([
      {
        task: expect.objectContaining({
          id: RUN_ID,
          status: expect.objectContaining({ state: 'TASK_STATE_SUBMITTED' }),
        }),
      },
      {
        statusUpdate: {
          ...IDS,
          status: {
            state: 'TASK_STATE_WORKING',
            timestamp: expect.any(String),
          },
        },
      },
      {
        artifactUpdate: {
          ...IDS,
          artifact: { artifactId: 'response', parts: [{ text: '你好' }] },
          append: false,
        },
      },
      {
        artifactUpdate: {
          ...IDS,
          artifact: { artifactId: 'response', parts: [{ text: '！' }] },
          append: true,
        },
      },
      {
        artifactUpdate: {
          ...IDS,
          artifact: {
            artifactId: ASSISTANT_MESSAGE_ID,
            name: 'response',
            parts: [{ text: '你好！', mediaType: 'text/plain' }],
          },
          lastChunk: true,
        },
      },
      {
        statusUpdate: {
          ...IDS,
          status: {
            state: 'TASK_STATE_COMPLETED',
            timestamp: '2026-10-01T08:00:05.000Z',
          },
        },
      },
    ]);
    expect(raw.writableEnded).toBe(true);
  });

  it('失败终态只发 FAILED 状态并附带错误', async () => {
    const { reply, raw } = createReply();
    const { eventStream } = createEventStream([
      entry({ event: 'run.failed', data: { run: runDto('failed') } }),
    ]);

    await pipeTaskEventsToSse(reply, eventStream, {
      run: runDto('running'),
      rpcId: 1,
    });

    const results = parseResults(raw.chunks, 1);
    expect(results).toHaveLength(2);
    expect(results[1]).toEqual({
      statusUpdate: {
        ...IDS,
        status: {
          state: 'TASK_STATE_FAILED',
          timestamp: '2026-10-01T08:00:05.000Z',
        },
        metadata: { error: { type: 'x', title: 'boom' } },
      },
    });
    expect(raw.writableEnded).toBe(true);
  });

  it('run.restarted 后的首个增量以 append=false 覆盖上一次尝试的文本', async () => {
    const { reply, raw } = createReply();
    const { eventStream } = createEventStream([
      entry({
        event: 'message.delta',
        data: { runId: RUN_ID, index: 0, delta: '旧的' },
      }),
      entry({
        event: 'run.restarted',
        data: { runId: RUN_ID, reason: 'worker_lost' },
      }),
      entry({
        event: 'message.delta',
        data: { runId: RUN_ID, index: 0, delta: '你好' },
      }),
      entry({ event: 'run.completed', data: { run: runDto('completed') } }),
    ]);

    await pipeTaskEventsToSse(reply, eventStream, {
      run: runDto('running'),
      rpcId: 2,
    });

    const artifactAppends = parseResults(raw.chunks, 2).flatMap((result) => {
      const update = z
        .object({
          artifactUpdate: z.object({
            artifact: z.object({
              parts: z.array(z.object({ text: z.string() })),
            }),
            append: z.boolean(),
          }),
        })
        .safeParse(result);
      return update.success
        ? [
            [
              update.data.artifactUpdate.artifact.parts[0]?.text,
              update.data.artifactUpdate.append,
            ],
          ]
        : [];
    });
    expect(artifactAppends).toEqual([
      ['旧的', false],
      ['你好', false],
    ]);
  });

  it('任务已终态时只写 Task 首帧即关闭，不订阅事件流', async () => {
    const { reply, raw } = createReply();
    const { eventStream, subscribe } = createEventStream([]);

    await pipeTaskEventsToSse(reply, eventStream, {
      run: runDto('completed'),
      rpcId: 1,
    });

    expect(raw.chunks).toHaveLength(1);
    expect(raw.writableEnded).toBe(true);
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('客户端断开后结束订阅', async () => {
    const { reply, raw } = createReply();
    const { eventStream } = createEventStream([]);

    const piping = pipeTaskEventsToSse(reply, eventStream, {
      run: runDto('running'),
      rpcId: 1,
    });
    raw.emit('close');
    await piping;

    expect(raw.writableEnded).toBe(true);
  });
});
