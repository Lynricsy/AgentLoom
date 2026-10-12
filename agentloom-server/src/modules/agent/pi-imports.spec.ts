import { describe, expect, it } from 'vitest';
import {
  importPiAgentCore,
  importPiAi,
  importPiAiBuiltinProviders,
  importPiAiCompat,
} from './pi-imports';

describe('pi-imports', () => {
  it('importPiAgentCore() resolves and exports Agent class', async () => {
    const mod = await importPiAgentCore();
    expect(mod).toBeDefined();
    expect(mod.Agent).toBeDefined();
    expect(typeof mod.Agent).toBe('function');
  });

  it('importPiAi() resolves and exports createAssistantMessageEventStream', async () => {
    const mod = await importPiAi();
    expect(mod).toBeDefined();
    expect(typeof mod.createAssistantMessageEventStream).toBe('function');
  });

  it('importPiAiCompat() resolves and exports streamSimple for Agent.streamFn', async () => {
    const mod = await importPiAiCompat();
    expect(mod).toBeDefined();
    expect(typeof mod.streamSimple).toBe('function');
  });

  it('importPiAiBuiltinProviders() resolves the builtin model catalog', async () => {
    const mod = await importPiAiBuiltinProviders();
    expect(mod.getBuiltinProviders()).toContain('openai');
    expect(mod.getBuiltinModels('openai').length).toBeGreaterThan(0);
  });

  it('both imports can be called multiple times without errors (module caching)', async () => {
    const [agentCore1, piAi1] = await Promise.all([
      importPiAgentCore(),
      importPiAi(),
    ]);
    const [agentCore2, piAi2] = await Promise.all([
      importPiAgentCore(),
      importPiAi(),
    ]);
    expect(agentCore1).toBe(agentCore2);
    expect(piAi1).toBe(piAi2);
  });
});
