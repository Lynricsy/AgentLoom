import { vi } from 'vitest';
import type {
  IAgentSession,
  AgentEventListener,
  SandboxAgentEvent,
  SseEventEnvelope,
} from '../src/types.js';
import type { SessionFactory } from '../src/acp-adapter.js';

export interface MockSession extends IAgentSession {
  _listeners: AgentEventListener[];
  _emit: (event: SandboxAgentEvent) => void;
}

export function createMockSession(): MockSession {
  const listeners: AgentEventListener[] = [];
  return {
    _listeners: listeners,
    _emit: (event) => {
      for (const fn of listeners) fn(event);
    },
    prompt: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn((listener: AgentEventListener) => {
      listeners.push(listener);
      return () => {
        const idx = listeners.indexOf(listener);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    }),
    dispose: vi.fn(),
  };
}

export function createMockSessionFactory(
  session?: MockSession,
): { factory: SessionFactory; session: MockSession } {
  const s = session ?? createMockSession();
  const factory: SessionFactory = vi.fn().mockResolvedValue(s);
  return { factory, session: s };
}

export function parseSseEvents(raw: string): SseEventEnvelope[] {
  return raw
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice(6)) as SseEventEnvelope);
}
