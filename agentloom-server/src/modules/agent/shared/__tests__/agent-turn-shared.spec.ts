/**
 * Agent 单轮事件聚合与 memory 工具会话绑定的公开行为测试。
 */
import { describe, expect, it, vi } from 'vitest';
import { AgentTurnEventAccumulator } from '../agent-turn-event-accumulator';
import {
  bindMemoryToolSession,
  unbindMemoryToolSession,
} from '../memory-tool-session-binder';

describe('AgentTurnEventAccumulator', () => {
  it('按事件顺序聚合正文、思考、工具、决策与结束原因', () => {
    const accumulator = new AgentTurnEventAccumulator({
      chunkIndex: 2,
      outputChunkIndexOffset: 1,
      mapDecision: (event) => ({ content: event.suggestedContent }),
    });

    expect(
      accumulator.consume({ type: 'message_chunk', content: '第一段' }),
    ).toEqual({ kind: 'message_chunk', chunk: '第一段', index: 3 });
    accumulator.consume({ type: 'plan', title: '计划', content: '先分析' });
    accumulator.consume({
      type: 'tool_call',
      call: {
        id: 'tool-1',
        tool: 'search',
        args: { query: 'AgentLoom' },
        status: 'in_progress',
      },
    });
    accumulator.consume({
      type: 'tool_call',
      call: {
        id: 'tool-1',
        tool: 'unknown_tool',
        args: {},
        status: 'completed',
        result: { hits: 1 },
      },
    });
    accumulator.consume({
      type: 'decision',
      suggestedContent: '采用结果',
      confidence: 0.9,
    });
    accumulator.consume({ type: 'message_chunk', content: '第二段' });
    accumulator.consume({ type: 'done', stopReason: 'end_turn' });

    expect(accumulator.assistantText).toBe('第一段第二段');
    expect(accumulator.chunkIndex).toBe(4);
    expect(accumulator.decision).toEqual({ content: '采用结果' });
    expect(accumulator.stopReason).toBe('end_turn');
    expect(accumulator.toolCalls).toEqual([
      expect.objectContaining({
        id: 'tool-1',
        tool: 'search',
        args: { query: 'AgentLoom' },
        status: 'completed',
        result: { hits: 1 },
      }),
    ]);
    expect(accumulator.segments).toEqual([
      { type: 'text', content: '第一段' },
      { type: 'thinking', content: '先分析' },
      { type: 'tool_call', toolCallId: 'tool-1' },
      { type: 'thinking', content: '采用结果' },
      { type: 'text', content: '第二段' },
    ]);
  });

  it('工作流可委托工具状态机聚合，同时仍统一维护 segment', () => {
    const accumulator = new AgentTurnEventAccumulator({
      toolCalls: [
        { id: 'existing', tool: 'read', args: {}, status: 'pending' },
      ],
      mapDecision: (event) => event,
    });

    accumulator.consume(
      {
        type: 'tool_call',
        call: { id: 'new', tool: 'write', args: {}, status: 'pending' },
      },
      { aggregateToolCall: false },
    );

    expect(accumulator.toolCalls).toEqual([
      { id: 'existing', tool: 'read', args: {}, status: 'pending' },
    ]);
    expect(accumulator.segments).toEqual([
      { type: 'tool_call', toolCallId: 'new' },
    ]);
    accumulator.beginRound();
    expect(accumulator.stopReason).toBeUndefined();
  });
});

describe('memory tool session binder', () => {
  it('对同一 session 完成 bind/unbind 配对', () => {
    const provider = vi.fn();
    const runtime = {
      registerSessionToolProvider: vi.fn(),
      unregisterSessionToolProvider: vi.fn(),
    };
    const memoryToolsService = {
      createSessionToolProvider: vi.fn().mockReturnValue(provider),
    };
    const binding = {
      runtime: runtime as never,
      memoryToolsService: memoryToolsService as never,
      sessionId: 'session-1',
      memorySessionIds: ['memory-1'],
    };

    expect(bindMemoryToolSession(binding)).toBe(true);
    expect(unbindMemoryToolSession(binding)).toBe(true);
    expect(runtime.registerSessionToolProvider).toHaveBeenCalledWith(
      'session-1',
      provider,
    );
    expect(runtime.unregisterSessionToolProvider).toHaveBeenCalledWith(
      'session-1',
    );
  });

  it('缺少绑定条件时无副作用，解绑异常交给调用方记录', () => {
    const onError = vi.fn();
    const runtime = {
      registerSessionToolProvider: vi.fn(),
      unregisterSessionToolProvider: vi.fn(() => {
        throw new Error('unbind failed');
      }),
    };
    const memoryToolsService = {
      createSessionToolProvider: vi.fn().mockReturnValue(vi.fn()),
    };

    expect(
      bindMemoryToolSession({
        runtime: runtime as never,
        memoryToolsService: memoryToolsService as never,
        sessionId: 'session-1',
        memorySessionIds: [],
      }),
    ).toBe(false);
    expect(runtime.registerSessionToolProvider).not.toHaveBeenCalled();

    expect(
      unbindMemoryToolSession(
        {
          runtime: runtime as never,
          memoryToolsService: memoryToolsService as never,
          sessionId: 'session-1',
          memorySessionIds: ['memory-1'],
        },
        onError,
      ),
    ).toBe(true);
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });
});
