import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from 'playwright';
import { z } from 'zod';

import type { StorageService } from '../../infrastructure/storage';
import type { GeneratedAppBrowserAcceptanceExecutor } from '../generated-app/types/generation-v2.ports';
import {
  GENERATED_APP_BROWSER_VIEWPORTS,
  type GeneratedAppBrowserAcceptanceJob,
  type GeneratedAppBrowserAcceptanceResult,
  type GeneratedAppBrowserScenarioResult,
  type GeneratedAppBrowserViewportId,
} from '../generated-app/types/browser-acceptance-job.schema';
import {
  redactBrowserText,
  redactRequestPath,
} from './generated-app-browser-redaction.util';
import {
  interpretGeneratedAppBrowserScenario,
  type GeneratedAppBrowserPageDriver,
  type GeneratedAppBrowserScenarioOutcome,
} from './generated-app-browser-scenario.interpreter';

/** 写进结果的 Playwright 版本，与镜像中安装的浏览器版本一一对应 */
const PLAYWRIGHT_VERSION = z
  .object({ version: z.string() })
  .parse(createRequire(__filename)('playwright/package.json')).version;

/** 等待单个页面元素的上限：元素缺失时不必耗尽整个场景预算 */
const ELEMENT_WAIT_MAX_MS = 15_000;
/** 打开入口（含 SPA 拉取公开表单）的上限 */
const NAVIGATION_WAIT_MAX_MS = 60_000;
/** 点击提交到提交接口响应的上限；之后的执行时长由 waitForResult 按场景预算等待 */
const SUBMIT_RESPONSE_WAIT_MAX_MS = 60_000;
/** 截图与 trace 落盘的上限，失败场景也要留下证据 */
const EVIDENCE_CAPTURE_MAX_MS = 20_000;
const BROWSER_LAUNCH_TIMEOUT_MS = 60_000;
const CONSOLE_ENTRY_MAX_LENGTH = 300;
const REQUEST_PATH_MAX_LENGTH = 300;
const RUNNER_MESSAGE_MAX_LENGTH = 500;
const MAX_COLLECTED_ENTRIES = 20;
const PUBLIC_SUBMISSION_PATH = /\/generated-apps\/public\/[^/]+\/submissions$/;
const PUBLIC_RUNTIME_ERROR_SELECTOR =
  '[data-testid="generated-app-public-runtime-error"]';
const SUBMIT_BUTTON_SELECTOR = 'form button[type="submit"]';

/** CSS 属性选择器里的字符串字面量 */
function cssString(value: string): string {
  return `"${value.replace(/["\\]/g, '\\$&').replace(/\n/g, '\\a ')}"`;
}

/** Playwright 页面上的 {@link GeneratedAppBrowserPageDriver} */
class PlaywrightPublicPageDriver implements GeneratedAppBrowserPageDriver {
  constructor(
    private readonly page: Page,
    private readonly entryUrl: string,
  ) {}

  async open(timeoutMs: number) {
    const timeout = Math.min(timeoutMs, NAVIGATION_WAIT_MAX_MS);
    try {
      const response = await this.page.goto(this.entryUrl, {
        waitUntil: 'domcontentloaded',
        timeout,
      });
      if (response && response.status() >= 400) {
        return {
          ok: false as const,
          message: `入口返回 HTTP ${response.status()}`,
        };
      }
      await this.page
        .locator(`${SUBMIT_BUTTON_SELECTOR}, ${PUBLIC_RUNTIME_ERROR_SELECTOR}`)
        .first()
        .waitFor({ state: 'visible', timeout });
    } catch (error) {
      return { ok: false as const, message: errorMessage(error) };
    }
    if (await this.page.locator(PUBLIC_RUNTIME_ERROR_SELECTOR).isVisible()) {
      return { ok: false as const, message: '公开页显示错误，应用不可访问' };
    }
    return { ok: true as const };
  }

  async fill(fieldId: string, value: string, timeoutMs: number) {
    const field = this.page
      .locator(`[data-field-id=${cssString(fieldId)}]`)
      .first();
    const timeout = Math.min(timeoutMs, ELEMENT_WAIT_MAX_MS);
    try {
      await field.waitFor({ state: 'visible', timeout });
      await field.fill(value, { timeout });
      return 'ok' as const;
    } catch {
      return 'not-found' as const;
    }
  }

  async select(fieldId: string, values: string[], timeoutMs: number) {
    const container = this.page
      .locator(`[data-field-id=${cssString(fieldId)}]`)
      .first();
    const timeout = Math.min(timeoutMs, ELEMENT_WAIT_MAX_MS);
    try {
      await container.waitFor({ state: 'visible', timeout });
      const tagName = await container.evaluate((element) => element.tagName);
      if (tagName === 'SELECT') {
        const selected = await container.selectOption(values, { timeout });
        return selected.length === values.length
          ? ('ok' as const)
          : ('not-found' as const);
      }
      for (const value of values) {
        const option = container
          .locator(`[data-option-value=${cssString(value)}]`)
          .first();
        if ((await option.count()) === 0) {
          return 'not-found' as const;
        }
        if ((await option.getAttribute('aria-checked')) !== 'true') {
          await option.click({ timeout });
        }
      }
      return 'ok' as const;
    } catch {
      return 'not-found' as const;
    }
  }

  async submit(timeoutMs: number) {
    const button = this.page.locator(SUBMIT_BUTTON_SELECTOR).first();
    if ((await button.count()) === 0) {
      return { status: 'not-found' as const };
    }
    const responsePromise = this.page
      .waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          PUBLIC_SUBMISSION_PATH.test(new URL(response.url()).pathname),
        { timeout: Math.min(timeoutMs, SUBMIT_RESPONSE_WAIT_MAX_MS) },
      )
      .catch(() => null);
    try {
      await button.click({ timeout: Math.min(timeoutMs, ELEMENT_WAIT_MAX_MS) });
    } catch {
      return { status: 'not-found' as const };
    }
    const response = await responsePromise;
    if (!response) {
      return { status: 'rejected' as const, httpStatus: null };
    }
    if (response.status() >= 400) {
      return { status: 'rejected' as const, httpStatus: response.status() };
    }
    return { status: 'accepted' as const };
  }

  async waitForResult(timeoutMs: number) {
    const container = this.page.locator('[data-result-status]').first();
    let settled = true;
    try {
      await this.page
        .locator(
          '[data-result-status="completed"], [data-result-status="failed"]',
        )
        .first()
        .waitFor({ state: 'attached', timeout: Math.max(1, timeoutMs) });
    } catch {
      settled = false;
    }
    const attached = (await container.count()) > 0;
    const submissionId = attached
      ? await container.getAttribute('data-submission-id')
      : null;
    if (!settled) {
      return { status: 'timeout' as const, submissionId };
    }
    const status = await container.getAttribute('data-result-status');
    return {
      status:
        status === 'completed' ? ('completed' as const) : ('failed' as const),
      submissionId,
    };
  }

  async readSection(sectionId: string, timeoutMs: number) {
    const section = this.page
      .locator(`[data-result-section-id=${cssString(sectionId)}]`)
      .first();
    if ((await section.count()) === 0) {
      return null;
    }
    return section.innerText({
      timeout: Math.min(timeoutMs, ELEMENT_WAIT_MAX_MS),
    });
  }

  async readAllSections() {
    const entries = await this.page
      .locator('[data-result-section-id]')
      .evaluateAll((elements) =>
        elements.map((element) => [
          element.getAttribute('data-result-section-id') ?? '',
          element instanceof HTMLElement ? element.innerText : '',
        ]),
      );
    return Object.fromEntries(
      entries.filter(([sectionId]) => sectionId.length > 0),
    );
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface PlaywrightBrowserAcceptanceExecutorOptions {
  /** 证据上传；runner 进程中为 StorageService */
  storage: Pick<StorageService, 'upload'>;
  /** Studio 入口基址，来自 APP_GENERATED_APP_BROWSER_BASE_URL */
  baseUrl: string;
  /** 浏览器启动；单测用它模拟启动失败 */
  launchBrowser?: () => Promise<Browser>;
  now?: () => number;
}

interface ScenarioRunContext {
  job: GeneratedAppBrowserAcceptanceJob;
  scenario: GeneratedAppBrowserAcceptanceJob['scenarios'][number];
  viewportId: GeneratedAppBrowserViewportId;
  deadline: number;
}

/**
 * runner 侧 Gate 5 执行器：每个场景 × 视口一个全新 BrowserContext，打开 Studio 公开页按步骤操作，
 * 每个组合留下整页截图与 trace 上传到任务的 artifactPrefix。浏览器以 `chromiumSandbox: false`
 * 启动，隔离靠容器（非 root、只读根文件系统、无额外 capability）；页面请求只放行入口同源。
 */
export class PlaywrightBrowserAcceptanceExecutor implements GeneratedAppBrowserAcceptanceExecutor {
  private readonly baseUrl: string;
  private readonly origin: string;
  private readonly launchBrowser: () => Promise<Browser>;
  private readonly now: () => number;

  constructor(
    private readonly options: PlaywrightBrowserAcceptanceExecutorOptions,
  ) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.origin = new URL(options.baseUrl).origin;
    this.launchBrowser =
      options.launchBrowser ??
      (() =>
        chromium.launch({
          headless: true,
          chromiumSandbox: false,
          timeout: BROWSER_LAUNCH_TIMEOUT_MS,
        }));
    this.now = options.now ?? Date.now;
  }

  async execute(
    job: GeneratedAppBrowserAcceptanceJob,
  ): Promise<GeneratedAppBrowserAcceptanceResult> {
    const startedAt = new Date(this.now());
    const totalDeadline = startedAt.getTime() + job.limits.totalTimeoutMs;
    const redact = (value: string, maxLength: number) =>
      redactBrowserText(value, job.acceptanceToken, maxLength);

    let browser: Browser;
    try {
      browser = await this.launchBrowser();
    } catch (error) {
      return {
        jobVersion: 1,
        status: 'failed',
        runnerError: {
          code: 'browser-launch-failed',
          message: redact(
            `Chromium 启动失败：${errorMessage(error)}`,
            RUNNER_MESSAGE_MAX_LENGTH,
          ),
        },
        browser: { name: 'chromium', version: 'unavailable' },
        playwrightVersion: PLAYWRIGHT_VERSION,
        startedAt: startedAt.toISOString(),
        completedAt: new Date(this.now()).toISOString(),
        scenarios: [],
      };
    }

    const scenarios: GeneratedAppBrowserScenarioResult[] = [];
    let runnerError: GeneratedAppBrowserAcceptanceResult['runnerError'] = null;
    try {
      for (const scenario of job.scenarios) {
        for (const viewportId of job.viewports) {
          const now = this.now();
          if (now >= totalDeadline) {
            runnerError ??= {
              code: 'total-timeout',
              message: `验收任务超过总时限 ${job.limits.totalTimeoutMs}ms，剩余场景未执行。`,
            };
            break;
          }
          const { result, uploadError } = await this.runScenario(browser, {
            job,
            scenario,
            viewportId,
            deadline: Math.min(
              now + job.limits.scenarioTimeoutMs,
              totalDeadline,
            ),
          });
          scenarios.push(result);
          if (uploadError) {
            runnerError ??= {
              code: 'artifact-upload-failed',
              message: redact(
                `截图或 trace 上传失败：${uploadError}`,
                RUNNER_MESSAGE_MAX_LENGTH,
              ),
            };
          }
        }
      }
      if (
        !runnerError &&
        scenarios.length < job.scenarios.length * job.viewports.length &&
        this.now() >= totalDeadline
      ) {
        runnerError = {
          code: 'total-timeout',
          message: `验收任务超过总时限 ${job.limits.totalTimeoutMs}ms，剩余场景未执行。`,
        };
      }
    } finally {
      await browser.close().catch(() => undefined);
    }

    const allPassed =
      scenarios.length === job.scenarios.length * job.viewports.length &&
      scenarios.every((scenario) => scenario.status === 'passed');
    return {
      jobVersion: 1,
      status: runnerError === null && allPassed ? 'passed' : 'failed',
      runnerError,
      browser: { name: 'chromium', version: browser.version() },
      playwrightVersion: PLAYWRIGHT_VERSION,
      startedAt: startedAt.toISOString(),
      completedAt: new Date(this.now()).toISOString(),
      scenarios,
    };
  }

  private async runScenario(
    browser: Browser,
    { job, scenario, viewportId, deadline }: ScenarioRunContext,
  ): Promise<{
    result: GeneratedAppBrowserScenarioResult;
    uploadError: string | null;
  }> {
    const startedAt = this.now();
    const token = job.acceptanceToken;
    const consoleErrors: string[] = [];
    const failedRequests: GeneratedAppBrowserScenarioResult['failedRequests'] =
      [];
    const pushConsole = (text: string) => {
      if (consoleErrors.length < MAX_COLLECTED_ENTRIES) {
        consoleErrors.push(
          redactBrowserText(text, token, CONSOLE_ENTRY_MAX_LENGTH),
        );
      }
    };
    const pushFailedRequest = (
      method: string,
      url: string,
      status: number | null,
    ) => {
      if (failedRequests.length < MAX_COLLECTED_ENTRIES) {
        failedRequests.push({
          method,
          path: redactRequestPath(url, token, REQUEST_PATH_MAX_LENGTH),
          status,
        });
      }
    };
    const isSameOrigin = (url: string) => {
      try {
        return new URL(url).origin === this.origin;
      } catch {
        return false;
      }
    };

    const isMobile = viewportId === 'mobile';
    const context: BrowserContext = await browser.newContext({
      viewport: GENERATED_APP_BROWSER_VIEWPORTS[viewportId],
      isMobile,
      hasTouch: isMobile,
      serviceWorkers: 'block',
      acceptDownloads: false,
    });
    const evidenceDir = await mkdtemp(join(tmpdir(), 'agentloom-gate5-'));
    let outcome: GeneratedAppBrowserScenarioOutcome;
    let screenshot: Buffer | null = null;
    let trace: Buffer | null = null;
    try {
      // 入口同源以外的请求一律拦截：生成内容不能借验收浏览器访问内网或外部地址
      await context.route('**/*', (route) =>
        isSameOrigin(route.request().url())
          ? route.continue()
          : route.abort('blockedbyclient'),
      );
      await context.tracing.start({ screenshots: true, snapshots: true });
      const page = await context.newPage();
      page.on('console', (message) => {
        if (message.type() === 'error') {
          pushConsole(message.text());
        }
      });
      page.on('pageerror', (error) => pushConsole(error.message));
      page.on('requestfailed', (request) => {
        if (isSameOrigin(request.url())) {
          pushFailedRequest(request.method(), request.url(), null);
        }
      });
      page.on('response', (response) => {
        if (response.status() >= 400 && isSameOrigin(response.url())) {
          pushFailedRequest(
            response.request().method(),
            response.url(),
            response.status(),
          );
        }
      });

      outcome = await interpretGeneratedAppBrowserScenario(
        new PlaywrightPublicPageDriver(
          page,
          `${this.baseUrl}/generated-apps/public/${token}`,
        ),
        scenario.steps,
        {
          deadline,
          now: this.now,
          redact: (message) =>
            redactBrowserText(message, token, RUNNER_MESSAGE_MAX_LENGTH),
        },
      );

      screenshot = await page
        .screenshot({ fullPage: true, timeout: EVIDENCE_CAPTURE_MAX_MS })
        .catch(() => null);
    } catch (error) {
      outcome = {
        status: 'failed',
        failure: {
          stepIndex: 0,
          kind: 'navigation',
          message: redactBrowserText(
            `浏览器上下文异常：${errorMessage(error)}`,
            token,
            RUNNER_MESSAGE_MAX_LENGTH,
          ),
        },
        submissionId: null,
        resultTexts: {},
      };
    }

    const tracePath = join(evidenceDir, 'trace.zip');
    try {
      await context.tracing.stop({ path: tracePath });
      trace = await readFile(tracePath);
    } catch {
      trace = null;
    }
    await context.close().catch(() => undefined);
    await rm(evidenceDir, { recursive: true, force: true });

    const keyBase = `${job.artifactPrefix}/${scenario.scenarioId}/${viewportId}`;
    let uploadError: string | null = null;
    const upload = async (
      body: Buffer | null,
      key: string,
      contentType: string,
    ): Promise<string | null> => {
      if (!body) {
        return null;
      }
      try {
        await this.options.storage.upload(key, body, body.length, contentType);
        return key;
      } catch (error) {
        uploadError ??= errorMessage(error);
        return null;
      }
    };
    const screenshotKey = await upload(
      screenshot,
      `${keyBase}/screenshot.png`,
      'image/png',
    );
    const traceKey = await upload(
      trace,
      `${keyBase}/trace.zip`,
      'application/zip',
    );

    return {
      result: {
        scenarioId: scenario.scenarioId,
        viewportId,
        status: outcome.status,
        durationMs: Math.max(0, Math.round(this.now() - startedAt)),
        failure: outcome.failure,
        submissionId: outcome.submissionId,
        consoleErrors,
        failedRequests,
        resultTexts: outcome.resultTexts,
        artifacts: { screenshotKey, traceKey },
      },
      uploadError,
    };
  }
}
