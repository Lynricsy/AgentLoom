import { describe, expect, it, vi } from 'vitest';

import { AgentAdapterFactory } from '../agent-adapter.factory';
import type { InProcessAgentAdapter } from '../in-process-agent.adapter';
import type { SandboxAgentAdapter } from '../sandbox-agent.adapter';

describe('AgentAdapterFactory', () => {
  const mockInProcessAdapter = {
    createSession: vi.fn(),
    loadSession: vi.fn(),
    prompt: vi.fn(),
    cancel: vi.fn(),
  } as unknown as InProcessAgentAdapter;

  const mockSandboxAdapter = {
    createSession: vi.fn(),
    loadSession: vi.fn(),
    prompt: vi.fn(),
    cancel: vi.fn(),
  } as unknown as SandboxAgentAdapter;

  const factory = new AgentAdapterFactory(
    mockInProcessAdapter,
    mockSandboxAdapter,
  );

  it('hasSandbox=true 时应返回 SandboxAgentAdapter', () => {
    const adapter = factory.selectAdapter(true);
    expect(adapter).toBe(mockSandboxAdapter);
  });

  it('hasSandbox=false 时应返回 InProcessAgentAdapter', () => {
    const adapter = factory.selectAdapter(false);
    expect(adapter).toBe(mockInProcessAdapter);
  });
});
