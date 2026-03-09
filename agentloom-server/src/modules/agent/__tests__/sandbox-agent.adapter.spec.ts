import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SandboxAgentAdapter } from '../sandbox-agent.adapter';
import type { CreateSessionParams } from '../types/agent-session.types';
import type { AgentEvent } from '../types/agent-event.types';

vi.mock('@nestjs/common', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nestjs/common')>();
  class MockLogger {
    debug = vi.fn();
    error = vi.fn();
    log = vi.fn();
    warn = vi.fn();
  }
  return {
    ...actual,
    Logger: MockLogger,
  };
});

describe('SandboxAgentAdapter', () => {
  let adapter: SandboxAgentAdapter;
  let mockSandboxService: {
    getSandboxSession: ReturnType<typeof vi.fn>;
  };

  const defaultParams: CreateSessionParams = {
    agentId: 'agent-001',
    mode: 'workflow',
    tenantId: 'tenant-001',
    llmModelConfigId: 'model-config-001',
    systemPrompt: 'You are a sandbox agent.',
    mcpServers: [],
    context: { executionId: 'exec-001' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSandboxService = {
      getSandboxSession: vi.fn(),
    };
    adapter = new SandboxAgentAdapter(mockSandboxService as never);
  });

  describe('createSession', () => {
    it('应创建具有 sandbox 工作区路径的会话', async () => {
      const session = await adapter.createSession(defaultParams);

      expect(session.id).toBeDefined();
      expect(session.agentId).toBe('agent-001');
      expect(session.mode).toBe('workflow');
      expect(session.context.cwd).toBe('/workspace/');
      expect(session.status).toBe('active');
      expect(session.tenantId).toBe('tenant-001');
      expect(session.context.workflowState).toEqual({
        executionId: 'exec-001',
      });
    });

    it('应保留 mcpServers 配置', async () => {
      const session = await adapter.createSession({
        ...defaultParams,
        mcpServers: [{ url: 'http://mcp:3000' } as never],
      });

      expect(session.context.mcpServers).toHaveLength(1);
    });
  });

  describe('loadSession', () => {
    it('应加载已存在的会话', async () => {
      const created = await adapter.createSession(defaultParams);
      const loaded = await adapter.loadSession(created.id);
      expect(loaded.id).toBe(created.id);
    });

    it('不存在的会话应抛出 SandboxNotFoundException', async () => {
      await expect(
        adapter.loadSession('non-existent-id'),
      ).rejects.toThrow();
    });
  });

  describe('prompt', () => {
    it('无容器时应直接返回 done 事件', async () => {
      const session = await adapter.createSession(defaultParams);
      mockSandboxService.getSandboxSession.mockResolvedValue(null);

      const events: AgentEvent[] = [];
      for await (const event of adapter.prompt(session.id, [
        { type: 'text', text: 'hello' },
      ])) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ type: 'done', stopReason: 'end_turn' });
    });

    it('容器无 containerId 时应直接返回 done 事件', async () => {
      const session = await adapter.createSession(defaultParams);
      mockSandboxService.getSandboxSession.mockResolvedValue({
        containerId: null,
      });

      const events: AgentEvent[] = [];
      for await (const event of adapter.prompt(session.id, [
        { type: 'text', text: 'hello' },
      ])) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ type: 'done', stopReason: 'end_turn' });
    });

    it('fetch 失败时应返回错误消息和 done 事件', async () => {
      const session = await adapter.createSession(defaultParams);
      mockSandboxService.getSandboxSession.mockResolvedValue({
        containerId: 'abc123def456',
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

      const events: AgentEvent[] = [];
      for await (const event of adapter.prompt(session.id, [
        { type: 'text', text: 'hello' },
      ])) {
        events.push(event);
      }

      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({
        type: 'message_chunk',
        content: 'Sandbox execution error: Connection refused',
      });
      expect(events[1]).toEqual({ type: 'done', stopReason: 'end_turn' });

      globalThis.fetch = originalFetch;
    });

    it('AbortError 应返回 cancelled stopReason', async () => {
      const session = await adapter.createSession(defaultParams);
      mockSandboxService.getSandboxSession.mockResolvedValue({
        containerId: 'abc123def456',
      });

      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(abortError);

      const events: AgentEvent[] = [];
      for await (const event of adapter.prompt(session.id, [
        { type: 'text', text: 'hello' },
      ])) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ type: 'done', stopReason: 'cancelled' });

      globalThis.fetch = originalFetch;
    });

    it('应将 content 推入 session history', async () => {
      const session = await adapter.createSession(defaultParams);
      mockSandboxService.getSandboxSession.mockResolvedValue(null);

      const content = [{ type: 'text' as const, text: 'hello' }];
      const events: AgentEvent[] = [];
      for await (const event of adapter.prompt(session.id, content)) {
        events.push(event);
      }

      const loaded = await adapter.loadSession(session.id);
      expect(loaded.context.history).toHaveLength(1);
    });
  });

  describe('cancel', () => {
    it('应将会话状态设为 completed', async () => {
      const session = await adapter.createSession(defaultParams);
      await adapter.cancel(session.id);

      const loaded = await adapter.loadSession(session.id);
      expect(loaded.status).toBe('completed');
    });

    it('不存在的会话取消不应抛出异常', async () => {
      await expect(adapter.cancel('non-existent')).resolves.toBeUndefined();
    });
  });
});
