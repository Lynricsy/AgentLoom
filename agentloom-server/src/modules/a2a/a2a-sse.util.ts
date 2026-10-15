import type { AgentApiRun, AgentApiStreamEvent } from '@agentloom/contracts';
import type { FastifyReply } from 'fastify';

import type { AgentApiEventStreamService } from '../agent-api-runtime/agent-api-event-stream.service';
import {
  AGENT_API_SSE_HEADERS,
  AGENT_API_SSE_PING_FRAME,
  AGENT_API_SSE_PING_INTERVAL_MS,
  isTerminalStreamEvent,
} from '../agent-api/agent-api-sse.util';
import {
  A2A_STREAMING_ARTIFACT_ID,
  isTerminalTaskState,
  toResponseArtifact,
  toTask,
  toTaskState,
  toTaskTimestamp,
} from './a2a-mapper';
import type { A2aStreamResponse, JsonRpcId } from './a2a.types';

/** 一个 SSE 帧 = 一个 JSON-RPC 响应，`result` 为 StreamResponse */
export function encodeA2aSseFrame(
  rpcId: JsonRpcId,
  result: A2aStreamResponse,
): string {
  return `data: ${JSON.stringify({ jsonrpc: '2.0', id: rpcId, result })}\n\n`;
}

interface TaskStreamState {
  workingSent: boolean;
  deltaSent: boolean;
}

/**
 * 把一条 run 事件映射为若干 StreamResponse：`tool_call` 与 `run.created` 不外发
 * （Task 已在首帧给出）；终态事件之后流结束。
 */
function mapRunEvent(
  event: AgentApiStreamEvent,
  run: AgentApiRun,
  state: TaskStreamState,
): A2aStreamResponse[] {
  const ids = { taskId: run.id, contextId: run.conversationId };

  switch (event.event) {
    case 'run.created':
    case 'tool_call':
      return [];
    case 'run.status': {
      // queued 时 Task 已是 SUBMITTED；running 的多个 phase 只报一次 WORKING
      if (event.data.status !== 'running' || state.workingSent) {
        return [];
      }
      state.workingSent = true;
      return [
        {
          statusUpdate: {
            ...ids,
            status: {
              state: 'TASK_STATE_WORKING',
              timestamp: new Date().toISOString(),
            },
          },
        },
      ];
    }
    case 'message.delta': {
      const append = state.deltaSent;
      state.deltaSent = true;
      return [
        {
          artifactUpdate: {
            ...ids,
            artifact: {
              artifactId: A2A_STREAMING_ARTIFACT_ID,
              parts: [{ text: event.data.delta }],
            },
            append,
          },
        },
      ];
    }
    case 'run.completed':
    case 'run.failed':
    case 'run.cancelled': {
      const finalRun = event.data.run;
      const responses: A2aStreamResponse[] = [];
      const artifact =
        event.event === 'run.completed' ? toResponseArtifact(finalRun) : null;
      if (artifact) {
        responses.push({
          artifactUpdate: { ...ids, artifact, lastChunk: true },
        });
      }
      responses.push({
        statusUpdate: {
          ...ids,
          status: {
            state: toTaskState(finalRun.status),
            timestamp: toTaskTimestamp(finalRun),
          },
          ...(finalRun.error ? { metadata: { error: finalRun.error } } : {}),
        },
      });
      return responses;
    }
  }
}

/**
 * 接管 Fastify 响应，以 SSE 推送一个 A2A 任务的流：首帧为当前 Task，
 * 随后从 run 事件流开头读取并映射；任务已终态时只写首帧即关闭。
 */
export async function pipeTaskEventsToSse(
  reply: FastifyReply,
  eventStream: Pick<AgentApiEventStreamService, 'subscribe'>,
  params: { run: AgentApiRun; rpcId: JsonRpcId; pingIntervalMs?: number },
): Promise<void> {
  const { run, rpcId } = params;
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

  const initialTask = toTask(run);
  raw.write(encodeA2aSseFrame(rpcId, { task: initialTask }));
  if (isTerminalTaskState(initialTask.status.state)) {
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

  const state: TaskStreamState = {
    workingSent: initialTask.status.state === 'TASK_STATE_WORKING',
    deltaSent: false,
  };

  try {
    await eventStream.subscribe(
      run.id,
      null,
      (entry) => {
        if (abort.signal.aborted || raw.writableEnded) {
          return;
        }

        for (const response of mapRunEvent(entry.event, run, state)) {
          raw.write(encodeA2aSseFrame(rpcId, response));
        }
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
