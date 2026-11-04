import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime, { type ToolExecutionResult } from '@deepseek-ai/dsh-tools';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as astPlugin from '../../src/dsh-plugins/ast/index.js';
import { resolveWorkspacePath } from '../../src/dsh-plugins/shared/workspace-path.js';

const A_TS = `export function greet(name: string): void {
  console.log('hello');
  console.log(name);
}
`;

const B_PY = `def greet(name):
    print(name)
`;

let workdir: string;
let ctx: Context;
let disposePlugin: (() => Promise<unknown>) | undefined;
let callSeq = 0;

/** 真实 cordis Context + dsh ToolRuntime/SystemPrompt 装载插件 */
async function loadPlugin(allowEdits: boolean): Promise<Context> {
  const root = new Context();
  await root.plugin(SystemPrompt);
  await root.plugin(ToolRuntime);
  const fiber = await root.plugin(astPlugin, { workdir, allowEdits });
  disposePlugin = () => fiber.dispose();
  return root;
}

async function run(name: string, args: Record<string, unknown>): Promise<ToolExecutionResult> {
  callSeq += 1;
  return ctx.tools.execute({
    callId: ToolCallId(`call-${callSeq}`),
    name,
    arguments: args,
    signal: new AbortController().signal,
  });
}

function textOf(result: ToolExecutionResult): string {
  return result.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('');
}

async function runText(name: string, args: Record<string, unknown>): Promise<string> {
  const result = await run(name, args);
  if (result.isError) throw new Error(`tool ${name} failed: ${textOf(result)}`);
  return textOf(result);
}

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), 'agentloom-ast-'));
  writeFileSync(join(workdir, 'a.ts'), A_TS);
  writeFileSync(join(workdir, 'b.py'), B_PY);
});

afterEach(async () => {
  await disposePlugin?.();
  disposePlugin = undefined;
  rmSync(workdir, { recursive: true, force: true });
});

describe('agentloom-ast', () => {
  beforeEach(async () => {
    ctx = await loadPlugin(true);
  });

  it('registers ast_grep / ast_edit and the prompt section', async () => {
    expect(ctx.tools.get('ast_grep')).toBeDefined();
    expect(ctx.tools.get('ast_edit')).toBeDefined();
    const assembly = await ctx.systemPrompt.assemble();
    const section = assembly.sections.find((entry) => entry.name === 'tool:ast');
    expect(section?.text).toContain('ast_edit defaults to dry_run=true');
  });

  it('ast_grep searches a directory across languages', async () => {
    const text = await runText('ast_grep', { pattern: '$F($X)' });
    expect(text).toContain('== a.ts (2 matches)');
    expect(text).toContain("2:3  console.log('hello')");
    expect(text).toContain('== b.py (1 match)');
    expect(text).toContain('Total: 3 matches in 2 files');
  });

  it('ast_grep honours lang, include and limit', async () => {
    expect(await runText('ast_grep', { pattern: '$F($X)', lang: 'python' })).toContain(
      'Total: 1 matches in 1 files',
    );
    expect(await runText('ast_grep', { pattern: '$F($X)', include: '*.ts' })).toContain(
      'Total: 2 matches in 1 files',
    );
    expect(await runText('ast_grep', { pattern: '$F($X)', limit: 1 })).toContain(
      'Total: 1 matches in 1 files (truncated at limit)',
    );
    expect(await runText('ast_grep', { pattern: 'missing($X)' })).toBe('No matches.');
  });

  it('ast_grep rejects paths outside the workspace', async () => {
    const result = await run('ast_grep', { pattern: '$X', path: '../' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('path must be under');
  });

  describe('符号链接越界', () => {
    let outside: string;

    beforeEach(() => {
      outside = mkdtempSync(join(tmpdir(), 'agentloom-outside-'));
      writeFileSync(join(outside, 'x.ts'), "console.log('secret');\n");
      symlinkSync(outside, join(workdir, 'escape'));
      symlinkSync(join(outside, 'gone.ts'), join(workdir, 'dangling.ts'));
    });

    afterEach(() => {
      rmSync(outside, { recursive: true, force: true });
    });

    it('经工作区内符号链接读取外部文件被拒绝', async () => {
      const result = await run('ast_grep', { pattern: 'console.log($X)', path: 'escape/x.ts' });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain('path must be under');
    });

    it('经工作区内符号链接改写外部文件被拒绝且外部文件不变', async () => {
      const result = await run('ast_edit', {
        pattern: 'console.log($X)',
        rewrite: 'void $X',
        path: 'escape/x.ts',
        dry_run: false,
      });
      expect(result.isError).toBe(true);
      expect(readFileSync(join(outside, 'x.ts'), 'utf8')).toBe("console.log('secret');\n");
    });

    it('外部目录下尚不存在的新目标与悬空链接同样被拒绝', () => {
      expect(() => resolveWorkspacePath(workdir, 'escape/new/file.ts')).toThrow('path must be under');
      expect(() => resolveWorkspacePath(workdir, 'dangling.ts')).toThrow('dangling symlink');
      expect(resolveWorkspacePath(workdir, 'new/dir/file.ts')).toBe(join(workdir, 'new/dir/file.ts'));
    });
  });

  it('ast_edit dry_run previews without writing', async () => {
    const text = await runText('ast_edit', {
      pattern: 'console.log($X)',
      rewrite: 'logger.info($X)',
      path: 'a.ts',
    });
    expect(text).toContain('== a.ts (2 replacements)');
    expect(text).toContain("- console.log('hello')");
    expect(text).toContain("+ logger.info('hello')");
    expect(text).toContain('Total: 2 replacements in 1 files');
    expect(readFileSync(join(workdir, 'a.ts'), 'utf8')).toBe(A_TS);
  });

  it('ast_edit applies with dry_run=false', async () => {
    const text = await runText('ast_edit', {
      pattern: 'console.log($$$ARGS)',
      rewrite: 'logger.info($$$ARGS)',
      path: '.',
      include: '*.ts',
      dry_run: false,
    });
    expect(text).toBe('Applied 2 replacements in 1 files');
    const updated = readFileSync(join(workdir, 'a.ts'), 'utf8');
    expect(updated).not.toContain('console.log');
    expect(updated).toContain("logger.info('hello');\n  logger.info(name);");
    expect(readFileSync(join(workdir, 'b.py'), 'utf8')).toBe(B_PY);
  });
});

describe('agentloom-ast with editEnabled=false', () => {
  beforeEach(async () => {
    ctx = await loadPlugin(false);
  });

  it('ast_edit refuses to write but still previews', async () => {
    const applied = await runText('ast_edit', {
      pattern: 'console.log($X)',
      rewrite: 'logger.info($X)',
      path: 'a.ts',
      dry_run: false,
    });
    expect(applied).toBe("ast_edit is disabled by the agent's native tool policy (editEnabled=false)");
    expect(readFileSync(join(workdir, 'a.ts'), 'utf8')).toBe(A_TS);

    const preview = await runText('ast_edit', {
      pattern: 'console.log($X)',
      rewrite: 'logger.info($X)',
      path: 'a.ts',
    });
    expect(preview).toContain('Total: 2 replacements in 1 files');
  });
});
