import type { AgentApiRun } from '@agentloom/contracts';
import { describe, expect, it } from 'vitest';

import { toAgentCard, toTask, toTaskState } from '../a2a-mapper';

const RUN_ID = '019391d4-f000-7000-8000-000000000007';
const CONVERSATION_ID = '019391d4-e000-7000-8000-000000000005';
const USER_MESSAGE_ID = '019391d4-f000-7000-8000-000000000008';
const ASSISTANT_MESSAGE_ID = '019391d4-f000-7000-8000-000000000009';
const AGENT_ID = '019391d4-c000-7000-8000-000000000003';

function runDto(overrides: Partial<AgentApiRun> = {}): AgentApiRun {
  return {
    id: RUN_ID,
    conversationId: CONVERSATION_ID,
    status: 'completed',
    agentVersionId: null,
    input: { messageId: USER_MESSAGE_ID, content: '你好' },
    output: {
      messageId: ASSISTANT_MESSAGE_ID,
      content: '你好，我是助手',
      toolCalls: [],
    },
    stopReason: 'end_turn',
    error: null,
    createdAt: '2026-10-01T08:00:00.000Z',
    startedAt: '2026-10-01T08:00:01.000Z',
    completedAt: '2026-10-01T08:00:05.000Z',
    ...overrides,
  };
}

describe('a2a-mapper', () => {
  it('run 状态映射为 A2A 任务状态', () => {
    expect(toTaskState('queued')).toBe('TASK_STATE_SUBMITTED');
    expect(toTaskState('running')).toBe('TASK_STATE_WORKING');
    expect(toTaskState('completed')).toBe('TASK_STATE_COMPLETED');
    expect(toTaskState('failed')).toBe('TASK_STATE_FAILED');
    expect(toTaskState('cancelled')).toBe('TASK_STATE_CANCELED');
  });

  it('已完成任务带回复 artifact，id/contextId 对应 run 与对话', () => {
    const task = toTask(runDto());

    expect(task).toMatchObject({
      id: RUN_ID,
      contextId: CONVERSATION_ID,
      status: {
        state: 'TASK_STATE_COMPLETED',
        timestamp: '2026-10-01T08:00:05.000Z',
      },
      artifacts: [
        {
          artifactId: ASSISTANT_MESSAGE_ID,
          name: 'response',
          parts: [{ text: '你好，我是助手', mediaType: 'text/plain' }],
        },
      ],
      metadata: { agentVersionId: null, stopReason: 'end_turn', error: null },
    });
    expect(task.history?.map((message) => message.role)).toEqual([
      'ROLE_USER',
      'ROLE_AGENT',
    ]);
  });

  it('未完成任务不带 artifact，时间戳退回开始或创建时间', () => {
    const running = toTask(
      runDto({ status: 'running', output: null, completedAt: null }),
    );
    expect(running.artifacts).toEqual([]);
    expect(running.status.timestamp).toBe('2026-10-01T08:00:01.000Z');
    expect(running.history).toHaveLength(1);

    const failed = toTask(
      runDto({
        status: 'failed',
        error: { type: 'x', title: 'boom' },
      }),
    );
    expect(failed.artifacts).toEqual([]);
    expect(failed.metadata.error).toEqual({ type: 'x', title: 'boom' });

    const queued = toTask(
      runDto({
        status: 'queued',
        output: null,
        startedAt: null,
        completedAt: null,
      }),
    );
    expect(queued.status.timestamp).toBe('2026-10-01T08:00:00.000Z');
  });

  it('historyLength 为 0 时省略 history，为 N 时只保留最后 N 条', () => {
    expect(toTask(runDto(), { historyLength: 0 }).history).toBeUndefined();

    const last = toTask(runDto(), { historyLength: 1 }).history;
    expect(last).toEqual([
      {
        messageId: ASSISTANT_MESSAGE_ID,
        contextId: CONVERSATION_ID,
        taskId: RUN_ID,
        role: 'ROLE_AGENT',
        parts: [{ text: '你好，我是助手', mediaType: 'text/plain' }],
      },
    ]);
  });

  it('Agent Card 暴露 JSON-RPC 1.0 接口与 Bearer Key 鉴权', () => {
    const card = toAgentCard(
      {
        agentDefinitionId: AGENT_ID,
        name: '客服助手',
        description: null,
        versionNumber: 3,
        organizationName: 'Acme',
      },
      'https://agentloom.example.com/',
    );

    expect(card).toEqual({
      name: '客服助手',
      description: '客服助手',
      supportedInterfaces: [
        {
          url: `https://agentloom.example.com/api/v1/a2a/agents/${AGENT_ID}/rpc`,
          protocolBinding: 'JSONRPC',
          protocolVersion: '1.0',
        },
      ],
      provider: { organization: 'Acme' },
      version: '3',
      capabilities: {
        streaming: true,
        pushNotifications: false,
        extendedAgentCard: false,
      },
      securitySchemes: {
        agentApiKey: {
          httpAuthSecurityScheme: {
            scheme: 'Bearer',
            bearerFormat: 'alak_<64 hex>',
            description: 'AgentLoom Agent API Key',
          },
        },
      },
      securityRequirements: [{ schemes: { agentApiKey: { list: [] } } }],
      defaultInputModes: ['text/plain'],
      defaultOutputModes: ['text/plain'],
      skills: [
        {
          id: AGENT_ID,
          name: '客服助手',
          description: '客服助手',
          tags: [],
          inputModes: ['text/plain'],
          outputModes: ['text/plain'],
        },
      ],
    });
  });
});
