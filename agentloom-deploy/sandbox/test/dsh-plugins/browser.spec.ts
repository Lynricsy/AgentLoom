import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime, { type ToolExecutionInput, type ToolExecutionResult } from '@deepseek-ai/dsh-tools';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import * as browserPlugin from '../../src/dsh-plugins/browser/index.js';

/** 本机 Chromium 路径；未设置时跳过真实浏览器流程 */
const CHROMIUM = process.env.AGENTLOOM_TEST_CHROMIUM ?? '';

const PAGE = 'data:text/html,<title>demo</title><h1 id=t>hi</h1><input id=i>';
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

describe.skipIf(CHROMIUM === '')('agentloom-browser (real Chromium)', () => {
  let workdir: string;
  let ctx: Context;
  let disposePlugin: () => Promise<unknown>;
  let callSeq = 0;
  const acceptsImages = vi.fn(async () => false);
  const saveImages = vi.fn(async (inputs: readonly { mediaType: string; name?: string }[]) =>
    inputs.map((input, index) => ({
      attachmentId: `att-${index}`,
      mediaType: input.mediaType,
      bytes: 100,
      width: 1280,
      height: 800,
      ...(input.name === undefined ? {} : { name: input.name }),
    })),
  );
  /** 模型路由：image-output 从 exec.agent 的会话路由头解析 */
  const agent = {
    session: { requestHeader: () => ({ config: { provider: 'test', model: 'vision' } }) },
    options: {},
  } as unknown as ToolExecutionInput['agent'];

  async function run(args: Record<string, unknown>): Promise<ToolExecutionResult> {
    callSeq += 1;
    return ctx.tools.execute({
      callId: ToolCallId(`call-${callSeq}`),
      name: 'browser',
      arguments: args,
      agent,
      signal: new AbortController().signal,
    });
  }

  async function runText(args: Record<string, unknown>): Promise<string> {
    const result = await run(args);
    const text = result.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
    if (result.isError) throw new Error(`browser ${String(args.action)} failed: ${text}`);
    return text;
  }

  beforeAll(async () => {
    workdir = mkdtempSync(join(tmpdir(), 'agentloom-browser-'));
    ctx = new Context();
    ctx.provide('llm', {
      resolveModelInfo: async () => ({ inputModalities: (await acceptsImages()) ? ['image'] : ['text'] }),
    });
    ctx.provide('attachments', { saveImages });
    await ctx.plugin(SystemPrompt);
    await ctx.plugin(ToolRuntime);
    const fiber = await ctx.plugin(browserPlugin, {
      workdir,
      stateDir: join(workdir, '.state'),
      chromiumPath: CHROMIUM,
    });
    disposePlugin = () => fiber.dispose();
  }, 30_000);

  afterAll(async () => {
    await disposePlugin?.();
    rmSync(workdir, { recursive: true, force: true });
  }, 30_000);

  it('registers the browser tool and prompt section', async () => {
    expect(ctx.tools.get('browser')).toBeDefined();
    const assembly = await ctx.systemPrompt.assemble();
    expect(assembly.sections.some((section) => section.name === 'tool:browser')).toBe(true);
  });

  it('opens, reads, types, evaluates and screenshots a page', async () => {
    expect(await runText({ action: 'open', url: PAGE })).toMatch(/^tab t1: demo — data:text\/html/);
    expect(await runText({ action: 'text', tab: 't1', selector: '#t' })).toBe('hi');
    expect(await runText({ action: 'type', tab: 't1', selector: '#i', text: 'abc' })).toMatch(/^ok — demo/);
    expect(
      await runText({ action: 'evaluate', tab: 't1', expression: "document.getElementById('i').value" }),
    ).toBe('"abc"');
    expect(await runText({ action: 'type', tab: 't1', selector: '#i', text: 'xy', clear: true })).toMatch(
      /^ok/,
    );
    expect(
      await runText({ action: 'evaluate', tab: 't1', expression: "document.getElementById('i').value" }),
    ).toBe('"xy"');

    const snapshot = await runText({ action: 'snapshot', tab: 't1' });
    expect(snapshot).toContain('heading "hi" (level 1)');
    expect(snapshot).toContain('textbox');

    const shot = await run({ action: 'screenshot', tab: 't1' });
    expect(shot.isError).toBe(false);
    const file = join(workdir, 'browser-output', 't1-1.png');
    expect(shot.content).toEqual([{ type: 'text', text: file }]);
    expect(existsSync(file)).toBe(true);
    expect([...readFileSync(file).subarray(0, 4)]).toEqual(PNG_MAGIC);
    expect(saveImages).not.toHaveBeenCalled();
  }, 60_000);

  it('attaches the screenshot as an image block when the model accepts images', async () => {
    acceptsImages.mockResolvedValue(true);
    const shot = await run({ action: 'screenshot', tab: 't1', full_page: true });
    acceptsImages.mockResolvedValue(false);
    const file = join(workdir, 'browser-output', 't1-2.png');
    expect(shot.content[0]).toEqual({ type: 'text', text: file });
    expect(shot.content[1]).toMatchObject({
      type: 'image',
      attachment: { attachmentId: 'att-0', mediaType: 'image/png', name: 't1-2.png' },
    });
    expect(saveImages).toHaveBeenCalledTimes(1);
  }, 30_000);

  it('reports page errors as text and usage errors as tool errors', async () => {
    expect(
      await runText({ action: 'click', tab: 't1', selector: '#missing', timeout_ms: 1000 }),
    ).toMatch(/^error: /);
    expect(await runText({ action: 'text', tab: 't1', selector: '#missing' })).toBe(
      'error: no element matches selector #missing',
    );

    const badUrl = await run({ action: 'goto', tab: 't1', url: 'file:///etc/passwd' });
    expect(badUrl.isError).toBe(true);
    const unknownTab = await run({ action: 'text', tab: 't9' });
    expect(unknownTab.isError).toBe(true);
  }, 30_000);

  it('lists and closes tabs', async () => {
    expect(await runText({ action: 'open' })).toBe('tab t2: about:blank');
    expect(await runText({ action: 'tabs' })).toMatch(/^t1 {2}demo — data:text\/html.*\nt2 {2}/s);
    expect(await runText({ action: 'close', tab: 't2' })).toBe('closed t2');
    expect(await runText({ action: 'close' })).toBe('closed all tabs');
    expect(await runText({ action: 'tabs' })).toBe('No open tabs.');
  }, 30_000);
});

describe('agentloom-browser launch failure', () => {
  it('returns the launch error text when Chromium is missing', async () => {
    const workdir = mkdtempSync(join(tmpdir(), 'agentloom-browser-'));
    const ctx = new Context();
    ctx.provide('llm', { resolveModelInfo: async () => ({ inputModalities: ['text'] }) });
    await ctx.plugin(SystemPrompt);
    await ctx.plugin(ToolRuntime);
    const fiber = await ctx.plugin(browserPlugin, {
      workdir,
      stateDir: join(workdir, '.state'),
      chromiumPath: join(workdir, 'no-such-chromium'),
    });
    try {
      const result = await ctx.tools.execute({
        callId: ToolCallId('launch-1'),
        name: 'browser',
        arguments: { action: 'open' },
        signal: new AbortController().signal,
      });
      expect(result.isError).toBe(false);
      const text = result.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
      expect(text).toMatch(/^Chromium failed to launch \(.*\); 沙箱镜像需包含 chromium$/s);
      expect(text).toContain('retry with --single-process');
    } finally {
      await fiber.dispose();
      rmSync(workdir, { recursive: true, force: true });
    }
  }, 30_000);
});
