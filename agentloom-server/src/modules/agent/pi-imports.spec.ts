import { describe, expect, it } from 'vitest';
import { importPiAgentCore, importPiAi } from './pi-imports';

describe('pi-imports', () => {
  it('importPiAgentCore() resolves and exports Agent class', async () => {
    const mod = await importPiAgentCore();
    expect(mod).toBeDefined();
    expect(mod.Agent).toBeDefined();
    expect(typeof mod.Agent).toBe('function');
  });

  it('importPiAi() resolves and exports getModel and complete functions', async () => {
    const mod = await importPiAi();
    expect(mod).toBeDefined();
    expect(typeof mod.getModel).toBe('function');
    expect(typeof mod.complete).toBe('function');
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
