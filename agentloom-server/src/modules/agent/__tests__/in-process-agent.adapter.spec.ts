import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger } from '@nestjs/common';
import { InProcessAgentAdapter } from '../in-process-agent.adapter';
import type { CreateSessionParams } from '../types/agent-session.types';
import type { AgentEvent } from '../types/agent-event.types';
import type { ContentBlock } from '../types/content-block.types';

vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

describe('InProcessAgentAdapter', () => {
  let adapter: InProcessAgentAdapter;
  const NOW = new Date('2025-01-01T00:00:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    adapter = new InProcessAgentAdapter();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── createSession ────────────────────────────────────────────────

  describe('createSession', () => {
    it('应创建会话并返回正确的 AgentSession 结构', async () => {
      const params: CreateSessionParams = {
        agentId: 'agent-001',
        mode: 'conversation',
      };

      const session = await adapter.createSession(params);

      expect(session).toMatchObject({
        agentId: 'agent-001',
        mode: 'conversation',
        status: 'active',
        context: {
          history: [],
          cwd: undefined,
          mcpServers: undefined,
          workflowState: undefined,
        },
        createdAt: NOW,
        updatedAt: NOW,
      });
      expect(session.id).toBeDefined();
      expect(typeof session.id).toBe('string');
      expect(session.id.length).toBeGreaterThan(0);
    });

    it('应为每次调用生成唯一 ID', async () => {
      const params: CreateSessionParams = {
        agentId: 'agent-001',
        mode: 'conversation',
      };

      const session1 = await adapter.createSession(params);
      const session2 = await adapter.createSession(params);

      expect(session1.id).not.toBe(session2.id);
    });

    it('workflow 模式应将 context 映射到 workflowState', async () => {
      const params: CreateSessionParams = {
        agentId: 'agent-002',
        mode: 'workflow',
        context: { key: 'value', nested: { a: 1 } },
      };

      const session = await adapter.createSession(params);

      expect(session.mode).toBe('workflow');
      expect(session.context.workflowState).toEqual({
        key: 'value',
        nested: { a: 1 },
      });
    });

    it('conversation 模式不应设置 workflowState', async () => {
      const params: CreateSessionParams = {
        agentId: 'agent-003',
        mode: 'conversation',
        context: { key: 'value' },
      };

      const session = await adapter.createSession(params);

      expect(session.context.workflowState).toBeUndefined();
    });

    it('应传递 cwd 和 mcpServers 参数', async () => {
      const params: CreateSessionParams = {
        agentId: 'agent-004',
        mode: 'conversation',
        cwd: '/workspace/project',
        mcpServers: {
          server1: { command: 'node', args: ['server.js'] },
        },
      };

      const session = await adapter.createSession(params);

      expect(session.context.cwd).toBe('/workspace/project');
      expect(session.context.mcpServers).toEqual({
        server1: { command: 'node', args: ['server.js'] },
      });
    });
  });

  // ── loadSession ──────────────────────────────────────────────────

  describe('loadSession', () => {
    it('应返回已创建的会话', async () => {
      const session = await adapter.createSession({
        agentId: 'agent-001',
        mode: 'conversation',
      });

      const loaded = await adapter.loadSession(session.id);

      expect(loaded).toEqual(session);
    });

    it('会话不存在时应抛出错误', async () => {
      await expect(adapter.loadSession('non-existent-id')).rejects.toThrow(
        /not found/i,
      );
    });
  });

  // ── prompt ───────────────────────────────────────────────────────

  describe('prompt', () => {
    const textBlock: ContentBlock = { type: 'text', text: 'Hello, agent!' };

    it('应为有效会话产出事件流', async () => {
      const session = await adapter.createSession({
        agentId: 'agent-001',
        mode: 'workflow',
        context: { task: 'test' },
      });

      const events: AgentEvent[] = [];
      for await (const event of adapter.prompt(session.id, [textBlock])) {
        events.push(event);
      }

      // 应至少包含一个 message_chunk 和一个 done 事件
      expect(events.length).toBeGreaterThanOrEqual(2);

      const messageChunks = events.filter((e) => e.type === 'message_chunk');
      expect(messageChunks.length).toBeGreaterThanOrEqual(1);

      const doneEvents = events.filter((e) => e.type === 'done');
      expect(doneEvents).toHaveLength(1);
      expect(doneEvents[0]).toEqual({
        type: 'done',
        stopReason: 'end_turn',
      });
    });

    it('应将 content 追加到会话历史', async () => {
      const session = await adapter.createSession({
        agentId: 'agent-001',
        mode: 'conversation',
      });

      const blocks: ContentBlock[] = [
        { type: 'text', text: 'First message' },
        { type: 'text', text: 'Second message' },
      ];

      // 消费所有事件
      for await (const _event of adapter.prompt(session.id, blocks)) {
        // 消费
      }

      const loaded = await adapter.loadSession(session.id);
      expect(loaded.context.history).toEqual(blocks);
    });

    it('会话不存在时应抛出错误', async () => {
      const collectEvents = async () => {
        for await (const _event of adapter.prompt('non-existent', [
          textBlock,
        ])) {
          // 消费
        }
      };

      await expect(collectEvents()).rejects.toThrow(/not found/i);
    });

    it('done 事件应始终是最后一个事件', async () => {
      const session = await adapter.createSession({
        agentId: 'agent-001',
        mode: 'conversation',
      });

      const events: AgentEvent[] = [];
      for await (const event of adapter.prompt(session.id, [textBlock])) {
        events.push(event);
      }

      expect(events[events.length - 1].type).toBe('done');
    });
  });

  // ── cancel ───────────────────────────────────────────────────────

  describe('cancel', () => {
    const textBlock: ContentBlock = { type: 'text', text: 'Hello' };

    it('应能取消正在运行的 prompt', async () => {
      const session = await adapter.createSession({
        agentId: 'agent-001',
        mode: 'conversation',
      });

      // 启动 prompt 但不消费所有事件
      const events: AgentEvent[] = [];
      const iterator = adapter.prompt(session.id, [textBlock]);

      // 取消后，后续迭代应产出 cancelled done 事件或结束
      await adapter.cancel(session.id);

      for await (const event of iterator) {
        events.push(event);
      }

      // 如果有 done 事件，应该是 cancelled
      const doneEvent = events.find((e) => e.type === 'done');
      if (doneEvent && doneEvent.type === 'done') {
        expect(doneEvent.stopReason).toBe('cancelled');
      }
    });

    it('取消不存在的会话不应抛出错误', async () => {
      await expect(adapter.cancel('non-existent')).resolves.not.toThrow();
    });

    it('应将会话状态更新为 completed', async () => {
      const session = await adapter.createSession({
        agentId: 'agent-001',
        mode: 'conversation',
      });

      await adapter.cancel(session.id);

      const loaded = await adapter.loadSession(session.id);
      expect(loaded.status).toBe('completed');
    });

    it('取消后应更新 updatedAt 时间戳', async () => {
      const session = await adapter.createSession({
        agentId: 'agent-001',
        mode: 'conversation',
      });

      const laterTime = new Date('2025-01-01T01:00:00.000Z');
      vi.setSystemTime(laterTime);

      await adapter.cancel(session.id);

      const loaded = await adapter.loadSession(session.id);
      expect(loaded.updatedAt).toEqual(laterTime);
    });
  });

  // ── 多会话隔离 ───────────────────────────────────────────────────

  describe('多会话隔离', () => {
    it('不同会话应独立管理', async () => {
      const session1 = await adapter.createSession({
        agentId: 'agent-001',
        mode: 'conversation',
      });
      const session2 = await adapter.createSession({
        agentId: 'agent-002',
        mode: 'workflow',
        context: { key: 'value' },
      });

      // 取消 session1 不应影响 session2
      await adapter.cancel(session1.id);

      const loaded1 = await adapter.loadSession(session1.id);
      const loaded2 = await adapter.loadSession(session2.id);

      expect(loaded1.status).toBe('completed');
      expect(loaded2.status).toBe('active');
    });
  });
});
