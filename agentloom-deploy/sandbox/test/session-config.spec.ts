import { mkdtempSync, readFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { prepareSessionConfig } from '../src/session-config.js';

const temporaryRoots: string[] = [];

function createRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'agentloom-session-config-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('prepareSessionConfig', () => {
  it('将配置和 skill 文件写入 0700 session 目录并可清理', () => {
    const root = createRoot();
    const prepared = prepareSessionConfig(
      {
        sessionId: 'session-123',
        settings: { theme: 'dark' },
        models: { providers: {} },
        systemPrompt: 'system prompt',
        mcpServers: {},
        runtimeApiKeys: { openai: 'must-not-be-written' },
        files: { 'skills/review/SKILL.md': '# Review' },
      },
      root,
    );

    expect(statSync(prepared.directory).mode & 0o777).toBe(0o700);
    expect(statSync(join(prepared.directory, 'settings.json')).mode & 0o777).toBe(
      0o600,
    );
    expect(readFileSync(join(prepared.directory, 'system-prompt.md'), 'utf8')).toBe(
      'system prompt',
    );
    expect(
      readFileSync(join(prepared.directory, 'skills/review/SKILL.md'), 'utf8'),
    ).toBe('# Review');
    expect(
      readFileSync(join(prepared.directory, 'settings.json'), 'utf8'),
    ).not.toContain('must-not-be-written');

    prepared.dispose();
    expect(() => statSync(prepared.directory)).toThrow();
  });

  it.each([
    '../outside',
    '/absolute',
    'skills/../secret',
    'skills//duplicate',
    '',
  ])('拒绝非 canonical 相对路径 %s', (path) => {
    expect(() =>
      prepareSessionConfig(
        { sessionId: 'session-123', files: { [path]: 'content' } },
        createRoot(),
      ),
    ).toThrow(/Invalid session config path/);
  });

  it('拒绝覆盖保留配置文件', () => {
    expect(() =>
      prepareSessionConfig(
        { sessionId: 'session-123', files: { 'settings.json': '{}' } },
        createRoot(),
      ),
    ).toThrow(/Duplicate session config path/);
  });

  it('拒绝超过 1 MiB 的单文件', () => {
    expect(() =>
      prepareSessionConfig(
        {
          sessionId: 'session-123',
          files: { 'skills/large/SKILL.md': 'x'.repeat(1024 * 1024 + 1) },
        },
        createRoot(),
      ),
    ).toThrow(/exceeds 1 MiB/);
  });
});
