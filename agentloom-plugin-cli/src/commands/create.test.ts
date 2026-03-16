import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createPluginProject, runCreateCommand, type CreatePromptRunner } from './create';

const tempDirs: string[] = [];

function createTempRoot(): string {
  const directory = mkdtempSync(join(tmpdir(), 'agentloom-plugin-cli-create-'));
  tempDirs.push(directory);
  return directory;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

afterEach(() => {
  vi.restoreAllMocks();

  while (tempDirs.length > 0) {
    const directory = tempDirs.pop();
    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe('createPluginProject', () => {
  it('creates the expected directory structure', () => {
    const targetDir = createTempRoot();
    const result = createPluginProject({
      name: 'demo-plugin',
      author: 'AgentLoom Team',
      description: 'Demo plugin',
      license: 'MIT',
      targetDir,
    });

    expect(existsSync(result.projectDir)).toBe(true);
    expect(existsSync(join(result.projectDir, 'manifest.json'))).toBe(true);
    expect(existsSync(join(result.projectDir, 'package.json'))).toBe(true);
    expect(existsSync(join(result.projectDir, 'tsconfig.json'))).toBe(true);
    expect(existsSync(join(result.projectDir, 'src', 'index.ts'))).toBe(true);
    expect(existsSync(join(result.projectDir, 'tests', 'index.test.ts'))).toBe(true);
  });

  it('generates a valid manifest with the required fields', () => {
    const targetDir = createTempRoot();
    const result = createPluginProject({
      name: 'text-transformer',
      author: 'Wine Fox',
      description: 'Transforms text',
      license: 'MIT',
      targetDir,
    });

    const manifest = readJson<Record<string, unknown>>(result.manifestPath);

    expect(manifest.id).toBe('com.agentloom.text-transformer');
    expect(manifest.name).toBe('text-transformer');
    expect(manifest.author).toBe('Wine Fox');
    expect(manifest.description).toBe('Transforms text');
    expect(manifest.license).toBe('MIT');
    expect(manifest.permissions).toEqual([]);
  });

  it('writes package.json with the SDK dependency and expected scripts', () => {
    const targetDir = createTempRoot();
    const result = createPluginProject({
      name: 'sdk-consumer',
      author: 'AgentLoom Team',
      description: 'Consumes SDK',
      license: 'MIT',
      targetDir,
    });

    const packageJson = readJson<Record<string, Record<string, string>>>(result.packageJsonPath);

    expect(packageJson.dependencies?.['@agentloom/plugin-sdk']).toBe(
      'file:../agentloom-plugin-sdk',
    );
    expect(packageJson.scripts?.build).toBe('tsc');
    expect(packageJson.scripts?.test).toBe('vitest run');
    expect(packageJson.scripts?.dev).toBe('agentloom-plugin dev');
  });

  it('normalizes the plugin name into the reverse-domain plugin id', () => {
    const targetDir = createTempRoot();
    const result = createPluginProject({
      name: 'Fancy Plugin!!!',
      author: 'AgentLoom Team',
      description: 'Fancy',
      license: 'MIT',
      targetDir,
    });

    expect(result.pluginId).toBe('com.agentloom.fancy-plugin');
    expect(result.projectDir).toBe(join(targetDir, 'fancy-plugin'));
  });

  it('throws when the target directory already exists', () => {
    const targetDir = createTempRoot();

    createPluginProject({
      name: 'duplicate-plugin',
      author: 'AgentLoom Team',
      description: 'First project',
      license: 'MIT',
      targetDir,
    });

    expect(() =>
      createPluginProject({
        name: 'duplicate-plugin',
        author: 'AgentLoom Team',
        description: 'Second project',
        license: 'MIT',
        targetDir,
      }),
    ).toThrow(/目标目录已存在/);
  });
});

describe('runCreateCommand', () => {
  it('collects prompt answers and prints the next steps', async () => {
    const targetDir = createTempRoot();
    const promptRunner: CreatePromptRunner = vi.fn(async () => ({
      author: 'AgentLoom Team',
      description: 'Prompted plugin',
      license: 'Apache-2.0',
    }));
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    const result = await runCreateCommand('Prompt Plugin', targetDir, promptRunner);

    expect(promptRunner).toHaveBeenCalledTimes(1);
    expect(result.pluginId).toBe('com.agentloom.prompt-plugin');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('cd prompt-plugin && pnpm install && pnpm dev'),
    );
  });
});
