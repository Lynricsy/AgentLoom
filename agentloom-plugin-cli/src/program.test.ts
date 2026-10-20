import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { runCli } from './program';

const tempDirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop();
    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe('runCli', () => {
  it('命令出错时只输出错误信息（不含堆栈）并返回退出码 1', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'agentloom-plugin-cli-program-'));
    tempDirs.push(outputDir);
    const errors: string[] = [];

    const exitCode = await runCli(
      ['node', 'agentloom-plugin', 'keys', 'generate', '-b', '1024', '-o', outputDir],
      { error: (message) => errors.push(message) },
    );

    expect(exitCode).toBe(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(
      '不支持的 RSA 密钥位数: 1024。仅支持 2048 / 3072 / 4096。',
    );
    expect(errors[0]).not.toContain('    at ');
  });
});
