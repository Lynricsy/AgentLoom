import { describe, expect, it, vi } from 'vitest';

import plugin from './index';

function createLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe('text-to-uppercase plugin', () => {
  it('executes with basic text input', async () => {
    const logger = createLogger();
    const result = await plugin.nodes[0].execute({
      inputs: { 'text-in': 'hello world' },
      config: {},
      logger,
    });

    expect(result.outputs['text-out']).toBe('HELLO WORLD');
  });

  it('executes with prefix and suffix', async () => {
    const logger = createLogger();
    const result = await plugin.nodes[0].execute({
      inputs: { 'text-in': 'agentloom' },
      config: { prefix: '[', suffix: ']' },
      logger,
    });

    expect(result.outputs['text-out']).toBe('[AGENTLOOM]');
  });

  it('handles empty input safely', async () => {
    const logger = createLogger();
    const result = await plugin.nodes[0].execute({
      inputs: {},
      config: {},
      logger,
    });

    expect(result.outputs['text-out']).toBe('');
  });

  it('exposes the expected plugin manifest id', () => {
    expect(plugin.manifest.id).toBe('com.agentloom.text-to-uppercase');
  });

  it('registers exactly one node definition', () => {
    expect(plugin.nodes).toHaveLength(1);
    expect(plugin.nodes[0].type).toBe('text-to-uppercase');
  });
});
