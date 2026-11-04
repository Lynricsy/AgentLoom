import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

  it('回调返回 problem+json 时错误文本应带状态、type 与 detail', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          type: 'https://agentloom.dev/errors/mcp/stdio-disabled',
          title: 'stdio MCP 未启用',
          status: 403,
          detail: '当前部署禁止在服务端启动 stdio MCP 进程',
        }),
        { status: 403, headers: { 'Content-Type': 'application/problem+json' } },
      ),
    );

    await expect(
      invokeRemoteTool({ config, toolName: 't', toolCallId: 'c', input: {}, onUpdate: vi.fn() }),
    ).rejects.toThrow(
      'Remote tool callback failed with status 403 (https://agentloom.dev/errors/mcp/stdio-disabled): 当前部署禁止在服务端启动 stdio MCP 进程',
    );
  });

  it('回调错误体不可解析时退回 HTTP 状态', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('bad gateway', { status: 502 }));

    await expect(
      invokeRemoteTool({ config, toolName: 't', toolCallId: 'c', input: {}, onUpdate: vi.fn() }),
    ).rejects.toThrow('Remote tool callback failed with status 502');
  });

  describe('__agentloomImages 图片通道', () => {
    const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);
    let workdir: string;

    afterEach(() => {
      rmSync(workdir, { recursive: true, force: true });
    });

    function invokeWithImages(images: unknown[]) {
      workdir = mkdtempSync(join(tmpdir(), 'remote-tools-'));
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({ outcome: 'completed', result: { model: 'm', __agentloomImages: images } }),
      );
      return invokeRemoteTool({
        config,
        toolName: 'generate_image',
        toolCallId: 'c',
        input: {},
        workdir,
        onUpdate: vi.fn(),
      });
    }

    it('应把图片写到 generated/，同名追加序号，文本与 details 不含 base64', async () => {
      const base64 = PNG.toString('base64');
      const result = await invokeWithImages([
        { fileName: 'fox.png', mediaType: 'image/png', base64 },
        { fileName: 'fox.png', mediaType: 'image/png', base64 },
      ]);

      const first = join(workdir, 'generated', 'fox.png');
      const second = join(workdir, 'generated', 'fox-1.png');
      expect(result.images?.map((image) => image.path)).toEqual([first, second]);
      expect(readFileSync(second)).toEqual(PNG);
      expect(result.text).not.toContain(base64);
      expect(result.details).toEqual({
        model: 'm',
        files: [
          { path: first, mediaType: 'image/png', bytes: PNG.length },
          { path: second, mediaType: 'image/png', bytes: PNG.length },
        ],
      });
    });

    it('非法文件名应跳过并在文本末尾提示', async () => {
      const result = await invokeWithImages([
        { fileName: '../escape.png', mediaType: 'image/png', base64: PNG.toString('base64') },
      ]);

      expect(result.images).toBeUndefined();
      expect(result.details).toEqual({ model: 'm', files: [] });
      expect(result.text).toMatch(/\[image skipped: invalid fileName "\.\.\/escape\.png"\]$/);
    });
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
