import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  invokeRemoteTool,
  normalizeRemoteToolParameters,
  REMOTE_TOOL_CALLBACK_TOKEN_HEADER,
} from '../src/remote-tools.js';
import type { RemoteToolExecutionConfig } from '../src/types.js';

const config: RemoteToolExecutionConfig = {
  sessionId: 'session-123',
  callbackUrl: 'http://callback.local/tool',
  callbackToken: 'token-123',
  tools: [],
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe('invokeRemoteTool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preflight 直接完成时应返回文本与结构化结果', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ result: { items: ['memory-a'], total: 1 } }));
    const onUpdate = vi.fn();

    const result = await invokeRemoteTool({
      config,
      toolName: 'lookup_memory',
      toolCallId: 'tool-call-1',
      input: { query: 'redis' },
      onUpdate,
    });

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
    expect(onUpdate).not.toHaveBeenCalled();
    expect(result).toEqual({
      text: JSON.stringify({ items: ['memory-a'], total: 1 }, null, 2),
      details: { items: ['memory-a'], total: 1 },
    });
  });

  it('awaiting_permission 时应先发出 update，再执行 execute 阶段回调', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          outcome: 'awaiting_permission',
          permissionRequest: { description: '主人授权后，Agent 将修改自身编排' },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ result: { success: true, data: { applied: true } } }));
    const onUpdate = vi.fn();

    const result = await invokeRemoteTool({
      config,
      toolName: 'apply_change',
      toolCallId: 'tool-call-2',
      input: { proposal: { summary: '新增一个 skill 节点' } },
      onUpdate,
    });

    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      'http://callback.local/tool',
      expect.objectContaining({
        body: JSON.stringify({
          sessionId: 'session-123',
          toolCallId: 'tool-call-2',
          toolName: 'apply_change',
          input: { proposal: { summary: '新增一个 skill 节点' } },
          phase: 'execute',
        }),
      }),
    );
    expect(onUpdate).toHaveBeenCalledWith({
      status: 'awaiting_permission',
      permissionRequest: { description: '主人授权后，Agent 将修改自身编排' },
    });
    expect(result.details).toEqual({ success: true, data: { applied: true } });
  });

  it('denied 时 details 应带 __agentloomToolStatus 供 tool_call_end 识别', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ outcome: 'denied', result: undefined, permissionRequest: { description: 'x' } }),
    );

    const result = await invokeRemoteTool({
      config,
      toolName: 'apply_change',
      toolCallId: 'tool-call-3',
      input: {},
      onUpdate: vi.fn(),
    });

    expect(result.details).toEqual({
      __agentloomToolStatus: 'denied',
      permissionRequest: { description: 'x' },
      payload: { success: false, data: { denied: true }, error: 'Permission denied' },
    });
  });

  it('回调非 2xx 时应抛出 server 返回的错误信息', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'session token invalid' }), { status: 403 }),
    );

    await expect(
      invokeRemoteTool({ config, toolName: 't', toolCallId: 'c', input: {}, onUpdate: vi.fn() }),
    ).rejects.toThrow('session token invalid');
  });
});

describe('normalizeRemoteToolParameters', () => {
  it('非对象 schema 应退化为接受任意对象', () => {
    expect(normalizeRemoteToolParameters(undefined)).toEqual({
      type: 'object',
      additionalProperties: true,
    });
    expect(normalizeRemoteToolParameters({ type: 'object' })).toEqual({ type: 'object' });
  });
});
