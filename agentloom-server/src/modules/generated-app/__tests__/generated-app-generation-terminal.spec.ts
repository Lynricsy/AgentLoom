import { describe, expect, it, vi } from 'vitest';

import { runGenerationToTerminal } from '../generated-app-generation-orchestrator.service';

describe('runGenerationToTerminal', () => {
  it('中途 runner 抛错时应持久化 failed 而不是遗留 running', async () => {
    let persistedStatus: 'running' | 'failed' = 'running';
    const runner = vi.fn().mockRejectedValue(new Error('gate runner crashed'));
    const persistFailure = vi.fn(async () => {
      persistedStatus = 'failed';
    });

    await expect(
      runGenerationToTerminal(async () => runner(), persistFailure),
    ).rejects.toThrow('gate runner crashed');

    expect(runner).toHaveBeenCalledOnce();
    expect(persistFailure).toHaveBeenCalledOnce();
    expect(persistedStatus).toBe('failed');
  });

  it('正常回调显式确认终态后不应重复写 failed', async () => {
    const persistFailure = vi.fn();
    const result = await runGenerationToTerminal(
      async (markTerminalPersisted) => {
        markTerminalPersisted();
        return 'passed';
      },
      persistFailure,
    );

    expect(result).toBe('passed');
    expect(persistFailure).not.toHaveBeenCalled();
  });
});
