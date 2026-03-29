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

  it('应把远程工具回调结果包装为 pi 原生 content/details 结构', async () => {
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
});
