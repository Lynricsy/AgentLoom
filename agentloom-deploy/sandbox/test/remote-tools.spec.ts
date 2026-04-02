import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createRemoteToolDefinitions,
  REMOTE_TOOL_CALLBACK_TOKEN_HEADER,
} from '../src/remote-tools.js';

describe('createRemoteToolDefinitions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('缺少配置时应返回空工具列表', () => {
    expect(createRemoteToolDefinitions()).toEqual([]);
  });

  it('preflight 直接完成时应把远程工具回调结果包装为 pi 原生 content/details 结构', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          result: {
            items: ['memory-a'],
            total: 1,
          },
        }),
        { status: 200 },
      ),
    );

    const [tool] = createRemoteToolDefinitions({
      sessionId: 'session-123',
      callbackUrl: 'http://callback.local/tool',
      callbackToken: 'token-123',
      tools: [
        {
          name: 'lookup_memory',
          label: 'lookup_memory',
          description: '检索记忆内容',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
            required: ['query'],
            additionalProperties: false,
          },
        },
      ],
    });

    expect(tool).toBeDefined();

    const result = await tool!.execute(
      'tool-call-1',
      { query: 'redis' },
      undefined,
      undefined,
      {},
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://callback.local/tool',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          [REMOTE_TOOL_CALLBACK_TOKEN_HEADER]: 'token-123',
        }),
        body: JSON.stringify({
          sessionId: 'session-123',
          toolCallId: 'tool-call-1',
          toolName: 'lookup_memory',
          input: { query: 'redis' },
          phase: 'preflight',
        }),
      }),
    );
    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              items: ['memory-a'],
              total: 1,
            },
            null,
            2,
          ),
        },
      ],
      details: {
        items: ['memory-a'],
        total: 1,
      },
    });
  });

  it('awaiting_permission 时应先发出 update，再执行 execute 阶段回调', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            outcome: 'awaiting_permission',
            permissionRequest: {
              description: '主人授权后，Agent 将修改自身编排',
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            result: {
              success: true,
              data: {
                applied: true,
              },
            },
          }),
          { status: 200 },
        ),
      );

    const [tool] = createRemoteToolDefinitions({
      sessionId: 'session-123',
      callbackUrl: 'http://callback.local/tool',
      callbackToken: 'token-123',
      tools: [
        {
          name: 'apply_change',
          label: 'apply_change',
          description: '应用自进化变更',
          parameters: {
            type: 'object',
            properties: {
              proposal: { type: 'object' },
            },
            required: ['proposal'],
            additionalProperties: false,
          },
        },
      ],
    });
    const onUpdate = vi.fn();

    const result = await tool!.execute(
      'tool-call-2',
      {
        proposal: { summary: '新增一个 skill 节点' },
      },
      undefined,
      onUpdate,
      {},
    );

    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      'http://callback.local/tool',
      expect.objectContaining({
        body: JSON.stringify({
          sessionId: 'session-123',
          toolCallId: 'tool-call-2',
          toolName: 'apply_change',
          input: {
            proposal: { summary: '新增一个 skill 节点' },
          },
          phase: 'preflight',
        }),
      }),
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      'http://callback.local/tool',
      expect.objectContaining({
        body: JSON.stringify({
          sessionId: 'session-123',
          toolCallId: 'tool-call-2',
          toolName: 'apply_change',
          input: {
            proposal: { summary: '新增一个 skill 节点' },
          },
          phase: 'execute',
        }),
      }),
    );
    expect(onUpdate).toHaveBeenCalledWith({
      status: 'awaiting_permission',
      permissionRequest: {
        description: '主人授权后，Agent 将修改自身编排',
      },
    });
    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              data: {
                applied: true,
              },
            },
            null,
            2,
          ),
        },
      ],
      details: {
        success: true,
        data: {
          applied: true,
        },
      },
    });
  });
});
