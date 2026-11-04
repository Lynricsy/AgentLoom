/**
 * browser 工具各动作的实现。页面级错误（超时、选择器不存在、导航失败）以
 * `error: <message>` 文本返回而不抛出，便于模型据此继续；参数错误与未知 tab 抛错。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { KeyInput, Page, PuppeteerLifeCycleEvent } from 'puppeteer-core';
import { capText } from '../shared/output-cap.js';
import { resolveWorkspacePath } from '../shared/workspace-path.js';
import { formatAccessibilityTree } from './a11y.js';
import {
  BrowserLaunchError,
  BrowserUsageError,
  errorMessage,
  type BrowserSession,
  type BrowserTab,
} from './session.js';

export const BROWSER_ACTIONS = [
  'open',
  'goto',
  'click',
  'type',
  'press',
  'wait',
  'text',
  'snapshot',
  'screenshot',
  'evaluate',
  'tabs',
  'close',
] as const;

export const WAIT_UNTIL_VALUES = ['load', 'domcontentloaded', 'networkidle0', 'networkidle2'] as const;

export interface BrowserArgs {
  action: (typeof BROWSER_ACTIONS)[number];
  tab?: string;
  url?: string;
  selector?: string;
  text?: string;
  clear?: boolean;
  key?: string;
  expression?: string;
  wait_until?: (typeof WAIT_UNTIL_VALUES)[number];
  timeout_ms?: number;
  full_page?: boolean;
}

export interface BrowserActionResult {
  text: string;
  /** 截图：已写盘的 PNG */
  screenshot?: { path: string; data: Uint8Array };
}

/** 文本类输出（innerText / 快照 / evaluate）的字符上限 */
const TEXT_OUTPUT_LIMIT = 20_000;
const DEFAULT_TIMEOUT_MS = 15_000;
/** 允许导航的协议：网页与内联 data: 页面；file: / chrome: / javascript: 一律拒绝 */
const ALLOWED_PROTOCOLS: Record<string, true> = { 'http:': true, 'https:': true, 'data:': true };

function requireArg<K extends keyof BrowserArgs>(
  args: BrowserArgs,
  key: K,
): NonNullable<BrowserArgs[K]> {
  const value = args[key];
  if (value === undefined || value === '') {
    throw new BrowserUsageError(`action "${args.action}" requires "${key}"`);
  }
  return value as NonNullable<BrowserArgs[K]>;
}

function assertNavigableUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BrowserUsageError(`invalid url: ${raw}`);
  }
  if (ALLOWED_PROTOCOLS[url.protocol] !== true) {
    throw new BrowserUsageError(`url must use http:, https: or data: — got ${url.protocol}`);
  }
  return raw;
}

async function describePage(page: Page): Promise<string> {
  const title = await page.title().catch(() => '');
  return `${title || '(untitled)'} — ${page.url()}`;
}

async function navigate(tab: BrowserTab, url: string, args: BrowserArgs, timeout: number): Promise<string> {
  const response = await tab.page.goto(assertNavigableUrl(url), {
    waitUntil: (args.wait_until ?? 'load') satisfies PuppeteerLifeCycleEvent,
    timeout,
  });
  return `tab ${tab.id}: ${await describePage(tab.page)} (status ${response?.status() ?? 'n/a'})`;
}

/** 截图文件路径：<workdir>/browser-output/<tab>-<n>.png，n 按 tab 递增 */
async function screenshotPath(workdir: string, tab: BrowserTab): Promise<string> {
  // browser-output 可能被替换成指向工作区外的符号链接，写前同样做边界校验
  const dir = resolveWorkspacePath(workdir, 'browser-output');
  await mkdir(dir, { recursive: true });
  tab.screenshots += 1;
  return resolveWorkspacePath(workdir, path.join(dir, `${tab.id}-${tab.screenshots}.png`));
}

async function runPageAction(
  session: BrowserSession,
  workdir: string,
  args: BrowserArgs,
  timeout: number,
): Promise<BrowserActionResult> {
  const tab = session.getTab(requireArg(args, 'tab'));
  const { page } = tab;
  page.setDefaultTimeout(timeout);
  switch (args.action) {
    case 'goto':
      return { text: await navigate(tab, requireArg(args, 'url'), args, timeout) };
    case 'click': {
      const element = await page.waitForSelector(requireArg(args, 'selector'), { timeout });
      await element!.click();
      await element!.dispose();
      return { text: `ok — ${await describePage(page)}` };
    }
    case 'type': {
      const element = await page.waitForSelector(requireArg(args, 'selector'), { timeout });
      const text = requireArg(args, 'text');
      if (args.clear) {
        // 输入框清空 value；其他可编辑元素清空文本内容
        await element!.evaluate((node) => {
          // 页面上下文中的 DOM 节点（本包 lib 不含 DOM 类型）：输入框有字符串 value
          const target = node as unknown as { value?: unknown; textContent: string | null };
          if (typeof target.value === 'string') target.value = '';
          else target.textContent = '';
        });
      }
      await element!.type(text);
      await element!.dispose();
      return { text: `ok — ${await describePage(page)}` };
    }
    case 'press':
      await page.keyboard.press(requireArg(args, 'key') as KeyInput);
      return { text: `ok — ${await describePage(page)}` };
    case 'wait':
      if (args.selector) await page.waitForSelector(args.selector, { timeout });
      else await page.waitForNetworkIdle({ idleTime: 500, timeout });
      return { text: `ok — ${await describePage(page)}` };
    case 'text': {
      // 选择器以 JSON 字面量嵌入页面脚本，不做字符串拼接注入
      const script = args.selector
        ? `(() => { const el = document.querySelector(${JSON.stringify(args.selector)}); return el === null ? null : el.innerText; })()`
        : 'document.body ? document.body.innerText : ""';
      const text: unknown = await page.evaluate(script);
      if (text === null) return { text: `error: no element matches selector ${args.selector}` };
      return { text: capText(String(text), TEXT_OUTPUT_LIMIT) };
    }
    case 'snapshot': {
      const tree = await page.accessibility.snapshot();
      return { text: capText(formatAccessibilityTree(tree), TEXT_OUTPUT_LIMIT) };
    }
    case 'evaluate': {
      const value: unknown = await page.evaluate(requireArg(args, 'expression'));
      let serialized: string | undefined;
      try {
        serialized = JSON.stringify(value);
      } catch {
        serialized = undefined;
      }
      return { text: capText(serialized ?? String(value), TEXT_OUTPUT_LIMIT) };
    }
    case 'screenshot': {
      const file = await screenshotPath(workdir, tab);
      const data = await page.screenshot({ type: 'png', fullPage: args.full_page ?? false });
      await writeFile(file, data, { mode: 0o644 });
      return { text: file, screenshot: { path: file, data } };
    }
    default:
      throw new BrowserUsageError(`unsupported action "${args.action}"`);
  }
}

/** 执行一个 browser 动作 */
export async function runBrowserAction(
  session: BrowserSession,
  workdir: string,
  args: BrowserArgs,
): Promise<BrowserActionResult> {
  const timeout = args.timeout_ms ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 60_000) {
    throw new Error('timeout_ms must be an integer between 1000 and 60000');
  }
  return session.run(async () => {
    try {
      switch (args.action) {
        case 'open': {
          const url = args.url === undefined ? undefined : assertNavigableUrl(args.url);
          const tab = await session.openTab();
          if (url === undefined) return { text: `tab ${tab.id}: about:blank` };
          tab.page.setDefaultTimeout(timeout);
          return { text: await navigate(tab, url, args, timeout) };
        }
        case 'tabs': {
          const tabs = session.listTabs();
          if (tabs.length === 0) return { text: 'No open tabs.' };
          const lines = await Promise.all(
            tabs.map(async (tab) => `${tab.id}  ${await describePage(tab.page)}`),
          );
          return { text: lines.join('\n') };
        }
        case 'close':
          if (args.tab === undefined) {
            await session.close();
            return { text: 'closed all tabs' };
          }
          await session.closeTab(args.tab);
          return { text: `closed ${args.tab}` };
        default:
          return await runPageAction(session, workdir, args, timeout);
      }
    } catch (error) {
      // 参数错误、未知 tab 照常抛出；启动失败与页面级错误转为文本
      if (error instanceof BrowserUsageError) throw error;
      if (error instanceof BrowserLaunchError) return { text: error.message };
      return { text: `error: ${errorMessage(error)}` };
    }
  });
}
