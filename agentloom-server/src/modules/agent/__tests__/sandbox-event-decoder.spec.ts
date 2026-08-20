/**
 * Sandbox 事件解码纯函数回归：直接断言 SSE 输入到 AgentEvent/错误输出，
 * 不构造 adapter、容器 transport 或 Nest 依赖。
 */
import { describe, expect, it } from 'vitest';
import {
  decodeSandboxServerSentEvent,
  SandboxPromptError,
} from '../sandbox-event-decoder';

const context = {
  fallbackToolCallId: 'fallback-call',
  fallbackTransitionTimestamp: '2026-08-20T00:00:00.000Z',
};

function decode(value: unknown) {
  return decodeSandboxServerSentEvent(
    `data: ${typeof value === 'string' ? value : JSON.stringify(value)}\n\n`,
    context,
  );
}

describe('decodeSandboxServerSentEvent', () => {
  it('空帧与 [DONE] 不产生事件', () => {
    expect(decodeSandboxServerSentEvent('', context)).toEqual({ events: [] });
    expect(decode('[DONE]')).toEqual({ events: [] });
  });

  it('直接 AgentEvent 原样透传', () => {
    expect(decode({ type: 'message_chunk', content: 'hello' })).toEqual({
      events: [{ type: 'message_chunk', content: 'hello' }],
    });
  });

  it('JSON-RPC text_delta 转成 message_chunk', () => {
    expect(
      decode({
        jsonrpc: '2.0',
        method: 'event',
        params: { type: 'text_delta', data: { delta: 'hello' } },
      }),
    ).toEqual({ events: [{ type: 'message_chunk', content: 'hello' }] });
  });

  it('顶层 tool call 字段与显式 fallback ID 被确定性映射', () => {
    const result = decode({
      type: 'tool_call_start',
      toolName: 'bash',
      input: { command: 'pwd' },
    });
    expect(result.events).toEqual([
      {
        type: 'tool_call',
        call: {
          id: 'fallback-call',
          tool: 'bash',
          args: { command: 'pwd' },
          status: 'in_progress',
        },
      },
    ]);
  });

  it('transition 缺少 timestamp 时使用调用方显式值', () => {
    const result = decode({
      type: 'tool_call_end',
      data: {
        toolCallId: 'call-1',
        toolName: 'bash',
        transitions: [{ from: 'in_progress', to: 'completed' }],
      },
    });
    expect(result.events[0]).toHaveProperty(
      'call.transitions.0.timestamp',
      '2026-08-20T00:00:00.000Z',
    );
  });

  it('permissionRequest 完整映射并过滤无效资源路径', () => {
    const result = decode({
      type: 'tool_call_update',
      data: {
        toolCallId: 'call-2',
        toolName: 'fs/write',
        permissionRequest: {
          resourcePaths: ['/workspace/a', '', 1],
          riskLevel: 'high',
          rememberable: false,
        },
      },
    });
    expect(result.events[0]).toHaveProperty('call.permissionRequest', {
      description: '允许工具 fs/write 执行',
      resourcePaths: ['/workspace/a'],
      riskLevel: 'high',
      rememberable: false,
    });
    expect(result.events[0]).toHaveProperty(
      'call.status',
      'awaiting_permission',
    );
  });

  it('工具错误对象保留错误消息和失败状态', () => {
    const result = decode({
      type: 'tool_call_end',
      data: { toolName: 'bash', error: { message: 'boom' } },
    });
    expect(result.events[0]).toHaveProperty('call.error', 'boom');
    expect(result.events[0]).toHaveProperty('call.status', 'failed');
  });

  it('done stopReason alias 被规范化', () => {
    expect(decode({ type: 'done', data: { stopReason: 'toolUse' } })).toEqual({
      events: [{ type: 'done', stopReason: 'tool_use' }],
    });
  });

  it('error 产出结构化错误并声明权限清理效果', () => {
    const result = decode({
      type: 'error',
      message: 'permission denied',
      code: 'PERMISSION_DENIED',
    });
    expect(result.events).toEqual([]);
    expect(result.denyPendingPermissions).toBe(true);
    expect(result.error).toBeInstanceOf(SandboxPromptError);
    expect(result.error).toMatchObject({
      message: 'permission denied',
      rawMessage: 'permission denied',
      code: 'PERMISSION_DENIED',
    });
  });

  it.each([
    ['pty_spawned', { sessionId: 'pty-1', info: {} }, 'pty.spawned'],
    ['pty_output', { sessionId: 'pty-1', data: 'hello' }, 'pty.output'],
    ['pty_exit', { sessionId: 'pty-1', exitCode: 0 }, 'pty.exit'],
    ['pty_killed', { sessionId: 'pty-1' }, 'pty.killed'],
  ])('%s 事件映射为 %s AgentEvent', (type, data, expectedType) => {
    expect(decode({ type, data }).events[0]).toMatchObject({
      type: expectedType,
      sessionId: 'pty-1',
    });
  });
});
