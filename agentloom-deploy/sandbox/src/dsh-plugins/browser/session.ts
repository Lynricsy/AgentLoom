/**
 * 浏览器会话：单例无头 Chromium（puppeteer-core），tab 以 t1、t2… 登记。
 * 首次动作时启动；空闲 10 分钟自动关闭；插件 dispose 时关闭。
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import puppeteer, { type Browser, type LaunchOptions, type Page } from 'puppeteer-core';
import type { BrowserPluginConfig } from '../shared/plugin-config.js';

/** 浏览器空闲多久后自动关闭 */
export const BROWSER_IDLE_MS = 10 * 60 * 1000;

const BASE_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--no-zygote',
  '--disable-extensions',
  '--no-first-run',
  '--disable-background-networking',
  '--lang=zh-CN,en',
];

/** Chromium 启动失败（含 --single-process 重试后仍失败） */
export class BrowserLaunchError extends Error {
  constructor(reason: string) {
    super(`Chromium failed to launch (${reason}); 沙箱镜像需包含 chromium`);
    this.name = 'BrowserLaunchError';
  }
}

/** 参数错误或未知 tab：照常抛出（isError），与以文本返回的页面级错误区分 */
export class BrowserUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrowserUsageError';
  }
}

export interface BrowserTab {
  readonly id: string;
  readonly page: Page;
  /** 已写出的截图序号 */
  screenshots: number;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class BrowserSession {
  private browser: Browser | undefined;
  private launching: Promise<Browser> | undefined;
  private readonly tabs = new Map<string, BrowserTab>();
  private nextTabId = 1;
  private idleTimer: NodeJS.Timeout | undefined;
  /** 正在执行的动作数；大于 0 时不触发空闲关闭 */
  private active = 0;

  constructor(
    private readonly config: BrowserPluginConfig,
    private readonly idleMs: number = BROWSER_IDLE_MS,
  ) {}

  /** 在会话内执行一个动作：期间暂停空闲计时，结束后重新计时 */
  async run<T>(action: () => Promise<T>): Promise<T> {
    this.active += 1;
    this.clearIdleTimer();
    try {
      return await action();
    } finally {
      this.active -= 1;
      this.scheduleIdleClose();
    }
  }

  /** 取得（必要时启动）浏览器实例 */
  async ensureBrowser(): Promise<Browser> {
    if (this.browser?.connected) return this.browser;
    this.launching ??= this.launch().finally(() => {
      this.launching = undefined;
    });
    return this.launching;
  }

  /** 新建 tab 并登记 */
  async openTab(): Promise<BrowserTab> {
    const browser = await this.ensureBrowser();
    const page = await browser.newPage();
    const tab: BrowserTab = { id: `t${this.nextTabId++}`, page, screenshots: 0 };
    this.tabs.set(tab.id, tab);
    page.once('close', () => {
      if (this.tabs.get(tab.id) === tab) this.tabs.delete(tab.id);
    });
    return tab;
  }

  getTab(id: string): BrowserTab {
    const tab = this.tabs.get(id);
    if (!tab || tab.page.isClosed()) {
      this.tabs.delete(id);
      const open = [...this.tabs.keys()];
      throw new BrowserUsageError(
        `unknown tab "${id}"; open tabs: ${open.length > 0 ? open.join(', ') : 'none (use action "open")'}`,
      );
    }
    return tab;
  }

  listTabs(): BrowserTab[] {
    return [...this.tabs.values()].filter((tab) => !tab.page.isClosed());
  }

  async closeTab(id: string): Promise<void> {
    const tab = this.getTab(id);
    this.tabs.delete(id);
    await tab.page.close();
  }

  /** 关闭浏览器与全部 tab；之后的动作会重新启动 */
  async close(): Promise<void> {
    this.clearIdleTimer();
    const browser = this.browser ?? (await this.launching?.catch(() => undefined));
    this.browser = undefined;
    this.tabs.clear();
    await browser?.close().catch(() => undefined);
  }

  private async launch(): Promise<Browser> {
    const userDataDir = path.join(this.config.stateDir, 'profile');
    await mkdir(userDataDir, { recursive: true });
    const options = (extraArgs: string[]): LaunchOptions => ({
      executablePath: this.config.chromiumPath,
      headless: true,
      args: [...BASE_ARGS, ...extraArgs],
      defaultViewport: { width: 1280, height: 800 },
      userDataDir,
      timeout: 30_000,
    });
    let browser: Browser;
    try {
      browser = await puppeteer.launch(options([]));
    } catch (first) {
      // microVM 内常规多进程模式启动失败时，以单进程模式重试一次
      try {
        browser = await puppeteer.launch(options(['--single-process']));
      } catch (second) {
        throw new BrowserLaunchError(`${errorMessage(first)}; retry with --single-process: ${errorMessage(second)}`);
      }
    }
    browser.once('disconnected', () => {
      if (this.browser === browser) {
        this.browser = undefined;
        this.tabs.clear();
      }
    });
    this.browser = browser;
    return browser;
  }

  private scheduleIdleClose(): void {
    this.clearIdleTimer();
    if (this.active > 0 || !this.browser) return;
    this.idleTimer = setTimeout(() => {
      void this.close();
    }, this.idleMs);
    this.idleTimer.unref();
  }

  private clearIdleTimer(): void {
    clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
  }
}
