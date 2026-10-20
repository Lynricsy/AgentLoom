import { existsSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { GeneratedAppBrowserAcceptanceJob } from '../../generated-app/types/browser-acceptance-job.schema';
import {
  GeneratedAppBrowserAcceptanceJobSchema,
  GeneratedAppBrowserAcceptanceResultSchema,
} from '../../generated-app/types/browser-acceptance-job.schema';
import { PlaywrightBrowserAcceptanceExecutor } from '../playwright-browser-acceptance.executor';

const TOKEN = 'ab'.repeat(32);
const ERROR_PAGE_TOKEN = 'cd'.repeat(32);
const TENANT_ID = '01a15800-0000-7000-8000-0000000000a1';
const APP_ID = '01a15800-0000-7000-8000-0000000000b2';
const RUN_ID = '01a15800-0000-7000-8000-0000000000c3';
const SUBMISSION_ID = '01a15800-0000-7000-8000-0000000000d4';
const ARTIFACT_PREFIX = `tenants/${TENANT_ID}/generated-apps/${APP_ID}/runs/${RUN_ID}/gate-5`;

const hasChromium = existsSync(chromium.executablePath());

/**
 * 按 Studio 公开页 DOM 约定写的静态页：文本域、Radix 风格单选组与复选组、提交后先显示 running
 * 再进入终态。它还会写一条带令牌和宿主路径的 console error、请求一个同源 404、向另一个源发 beacon，
 * 用来验证脱敏、失败请求收集与同源拦截。
 */
function publicPageHtml(beaconUrl: string): string {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body>
<form id="form">
  <textarea data-field-id="question"></textarea>
  <div role="radiogroup" data-field-id="tone">
    <button type="button" role="radio" aria-checked="false" data-option-value="brief">简短</button>
    <button type="button" role="radio" aria-checked="false" data-option-value="detailed">详细</button>
  </div>
  <fieldset data-field-id="topics">
    <button type="button" role="checkbox" aria-checked="false" data-option-value="pricing">价格</button>
    <button type="button" role="checkbox" aria-checked="false" data-option-value="limits">限制</button>
  </fieldset>
  <button type="submit">提问</button>
</form>
<div id="out"></div>
<script>
  const token = location.pathname.split('/').pop();
  console.error('debug token=' + token + ' at /root/secret/app.ts:12');
  fetch('/api/v1/missing').catch(() => {});
  fetch(${JSON.stringify(beaconUrl)}).catch(() => {});
  for (const group of document.querySelectorAll('[role=radiogroup]')) {
    for (const option of group.querySelectorAll('[role=radio]')) {
      option.addEventListener('click', () => {
        for (const other of group.querySelectorAll('[role=radio]')) other.setAttribute('aria-checked', 'false');
        option.setAttribute('aria-checked', 'true');
      });
    }
  }
  for (const option of document.querySelectorAll('[role=checkbox]')) {
    option.addEventListener('click', () => {
      option.setAttribute('aria-checked', option.getAttribute('aria-checked') === 'true' ? 'false' : 'true');
    });
  }
  document.getElementById('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = {
      question: document.querySelector('[data-field-id=question]').value,
      tone: [...document.querySelectorAll('[data-field-id=tone] [aria-checked=true]')].map((el) => el.dataset.optionValue)[0],
      topics: [...document.querySelectorAll('[data-field-id=topics] [aria-checked=true]')].map((el) => el.dataset.optionValue),
    };
    const response = await fetch('/api/v1/generated-apps/public/' + token + '/submissions', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(values),
    });
    if (!response.ok) return;
    const body = await response.json();
    const out = document.getElementById('out');
    out.innerHTML = '';
    const result = document.createElement('section');
    result.dataset.testid = 'generated-app-public-submission-result';
    result.setAttribute('data-result-status', 'running');
    result.setAttribute('data-submission-id', body.id);
    out.appendChild(result);
    setTimeout(() => {
      for (const [id, text] of Object.entries(body.sections)) {
        const section = document.createElement('div');
        section.setAttribute('data-result-section-id', id);
        section.textContent = text;
        result.appendChild(section);
      }
      const viewport = document.createElement('div');
      viewport.setAttribute('data-result-section-id', 'viewport');
      viewport.textContent = String(window.innerWidth);
      result.appendChild(viewport);
      result.setAttribute('data-result-status', body.status);
    }, body.delayMs);
  });
</script>
</body></html>`;
}

const ERROR_PAGE_HTML = `<!doctype html><html><body><div data-testid="generated-app-public-runtime-error">应用不存在或链接已失效</div></body></html>`;

interface SubmissionBody {
  question?: string;
  tone?: string;
  topics?: string[];
}

function startServer(
  handler: Parameters<typeof createServer>[1],
): Promise<Server> {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function originOf(server: Server): string {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('测试服务器未监听 TCP 端口');
  }
  return `http://127.0.0.1:${address.port}`;
}

function buildJob(
  steps: GeneratedAppBrowserAcceptanceJob['scenarios'][number]['steps'],
  overrides: Partial<GeneratedAppBrowserAcceptanceJob> = {},
): GeneratedAppBrowserAcceptanceJob {
  return GeneratedAppBrowserAcceptanceJobSchema.parse({
    jobVersion: 1,
    tenantId: TENANT_ID,
    appId: APP_ID,
    generationRunId: RUN_ID,
    acceptanceToken: TOKEN,
    viewports: ['desktop', 'mobile'],
    scenarios: [{ scenarioId: 'scenario-ask', steps }],
    limits: { scenarioTimeoutMs: 20_000, totalTimeoutMs: 60_000 },
    artifactPrefix: ARTIFACT_PREFIX,
    ...overrides,
  });
}

const ASK_STEPS: GeneratedAppBrowserAcceptanceJob['scenarios'][number]['steps'] =
  [
    {
      action: 'fill',
      fieldId: 'question',
      value: '最多可以同时运行几个子 Agent？',
    },
    { action: 'select', fieldId: 'tone', values: ['brief'] },
    { action: 'select', fieldId: 'topics', values: ['pricing', 'limits'] },
    { action: 'submit' },
    { action: 'expectResult', sectionId: 'answer', assertion: 'nonEmpty' },
    { action: 'expectResult', sectionId: 'citations', assertion: 'nonEmpty' },
  ];

class MemoryStorage {
  readonly objects = new Map<string, { body: Buffer; contentType?: string }>();
  failWith: Error | null = null;

  async upload(
    key: string,
    data: Buffer | NodeJS.ReadableStream,
    _size?: number,
    contentType?: string,
  ): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.objects.set(key, { body: data as Buffer, contentType });
  }
}

describe('PlaywrightBrowserAcceptanceExecutor：浏览器启动失败', () => {
  it('启动失败写进 runnerError 且信息已脱敏，不抛异常', async () => {
    const executor = new PlaywrightBrowserAcceptanceExecutor({
      storage: new MemoryStorage(),
      baseUrl: 'http://127.0.0.1:9',
      launchBrowser: () =>
        Promise.reject(
          new Error(
            `Executable doesn't exist at /ms-playwright/chromium-1248/chrome (token ${TOKEN})`,
          ),
        ),
    });

    const result = await executor.execute(buildJob(ASK_STEPS));

    expect(GeneratedAppBrowserAcceptanceResultSchema.parse(result)).toEqual(
      result,
    );
    expect(result.status).toBe('failed');
    expect(result.scenarios).toEqual([]);
    expect(result.runnerError?.code).toBe('browser-launch-failed');
    expect(result.runnerError?.message).not.toContain(TOKEN);
    expect(result.runnerError?.message).not.toContain('/ms-playwright');
    expect(result.runnerError?.message).toContain('<path>');
  });
});

describe.skipIf(!hasChromium)(
  'PlaywrightBrowserAcceptanceExecutor：真实 Chromium',
  () => {
    let app: Server;
    let beacon: Server;
    let beaconHits = 0;
    const submissions: SubmissionBody[] = [];

    beforeAll(async () => {
      beacon = await startServer((_req, res) => {
        beaconHits += 1;
        res.end('ok');
      });
      const html = publicPageHtml(`${originOf(beacon)}/beacon`);
      app = await startServer((req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (url.pathname === `/generated-apps/public/${ERROR_PAGE_TOKEN}`) {
          res.setHeader('content-type', 'text/html; charset=utf-8');
          res.end(ERROR_PAGE_HTML);
          return;
        }
        if (url.pathname.startsWith('/generated-apps/public/')) {
          res.setHeader('content-type', 'text/html; charset=utf-8');
          res.end(html);
          return;
        }
        if (
          req.method === 'POST' &&
          url.pathname === `/api/v1/generated-apps/public/${TOKEN}/submissions`
        ) {
          let raw = '';
          req.on('data', (chunk: Buffer) => {
            raw += chunk.toString();
          });
          req.on('end', () => {
            const body = JSON.parse(raw) as SubmissionBody;
            submissions.push(body);
            res.setHeader('content-type', 'application/json');
            if (body.question?.includes('拒绝')) {
              res.statusCode = 422;
              res.end(JSON.stringify({ code: 'validation-error' }));
              return;
            }
            res.statusCode = 201;
            res.end(
              JSON.stringify({
                id: SUBMISSION_ID,
                status: body.question?.includes('失败')
                  ? 'failed'
                  : 'completed',
                delayMs: body.question?.includes('慢') ? 30_000 : 300,
                sections: {
                  answer: '最多可以同时运行 10 个子 Agent。',
                  citations: 'AgentLoom 宣传册 第 3 页',
                },
              }),
            );
          });
          return;
        }
        res.statusCode = 404;
        res.end('not found');
      });
    });

    afterAll(async () => {
      await new Promise((resolve) => app.close(resolve));
      await new Promise((resolve) => beacon.close(resolve));
    });

    function createExecutor(storage = new MemoryStorage()) {
      return {
        storage,
        executor: new PlaywrightBrowserAcceptanceExecutor({
          storage,
          baseUrl: `${originOf(app)}/`,
        }),
      };
    }

    it('两个视口都按步骤执行通过，并上传截图与 trace', async () => {
      const { storage, executor } = createExecutor();
      submissions.length = 0;
      beaconHits = 0;

      const result = await executor.execute(buildJob(ASK_STEPS));

      expect(GeneratedAppBrowserAcceptanceResultSchema.parse(result)).toEqual(
        result,
      );
      expect(result).toMatchObject({
        status: 'passed',
        runnerError: null,
        browser: { name: 'chromium' },
      });
      expect(result.browser.version).toMatch(/^\d+\./);
      expect(result.scenarios.map((s) => [s.viewportId, s.status])).toEqual([
        ['desktop', 'passed'],
        ['mobile', 'passed'],
      ]);

      // 表单值确实经页面提交到同源接口
      expect(submissions).toEqual([
        {
          question: '最多可以同时运行几个子 Agent？',
          tone: 'brief',
          topics: ['pricing', 'limits'],
        },
        {
          question: '最多可以同时运行几个子 Agent？',
          tone: 'brief',
          topics: ['pricing', 'limits'],
        },
      ]);

      for (const scenario of result.scenarios) {
        expect(scenario.submissionId).toBe(SUBMISSION_ID);
        expect(scenario.resultTexts).toMatchObject({
          answer: '最多可以同时运行 10 个子 Agent。',
          citations: 'AgentLoom 宣传册 第 3 页',
        });
        const screenshotKey = `${ARTIFACT_PREFIX}/scenario-ask/${scenario.viewportId}/screenshot.png`;
        const traceKey = `${ARTIFACT_PREFIX}/scenario-ask/${scenario.viewportId}/trace.zip`;
        expect(scenario.artifacts).toEqual({ screenshotKey, traceKey });
        const screenshot = storage.objects.get(screenshotKey);
        const trace = storage.objects.get(traceKey);
        expect(screenshot?.contentType).toBe('image/png');
        expect(screenshot?.body.subarray(1, 4).toString()).toBe('PNG');
        expect(trace?.contentType).toBe('application/zip');
        expect(trace?.body.subarray(0, 2).toString()).toBe('PK');

        // console 中的令牌与宿主路径被脱敏
        expect(scenario.consoleErrors.join('\n')).not.toContain(TOKEN);
        expect(scenario.consoleErrors).toContainEqual(
          expect.stringContaining('debug token=<acceptance-token> at <path>'),
        );
        expect(scenario.failedRequests).toContainEqual({
          method: 'GET',
          path: '/api/v1/missing',
          status: 404,
        });
      }

      // 视口真实生效：页面报告的 innerWidth 与视口一致
      expect(result.scenarios[0].resultTexts.viewport).toBe('1280');
      expect(result.scenarios[1].resultTexts.viewport).toBe('390');
      // 入口同源以外的请求被拦截，beacon 服务器从未收到请求
      expect(beaconHits).toBe(0);
    }, 90_000);

    it('提交接口返回 422 时记为 submission-rejected，仍留下截图与 trace', async () => {
      const { storage, executor } = createExecutor();

      const result = await executor.execute(
        buildJob(
          [
            { action: 'fill', fieldId: 'question', value: '请拒绝这个提交' },
            { action: 'submit' },
          ],
          { viewports: ['desktop'] },
        ),
      );

      expect(result.status).toBe('failed');
      expect(result.runnerError).toBeNull();
      expect(result.scenarios[0].failure).toMatchObject({
        stepIndex: 1,
        kind: 'submission-rejected',
        message: '提交接口返回 HTTP 422。',
      });
      expect(result.scenarios[0].failedRequests).toContainEqual({
        method: 'POST',
        path: '/api/v1/generated-apps/public/<acceptance-token>/submissions',
        status: 422,
      });
      expect(storage.objects.size).toBe(2);
    }, 60_000);

    it('页面显示执行失败时记为 result-failed', async () => {
      const { executor } = createExecutor();

      const result = await executor.execute(
        buildJob(
          [
            { action: 'fill', fieldId: 'question', value: '这次会失败' },
            { action: 'submit' },
            {
              action: 'expectResult',
              sectionId: 'answer',
              assertion: 'nonEmpty',
            },
          ],
          { viewports: ['mobile'] },
        ),
      );

      expect(result.scenarios[0]).toMatchObject({
        status: 'failed',
        submissionId: SUBMISSION_ID,
        failure: { stepIndex: 1, kind: 'result-failed' },
      });
    }, 60_000);

    it('字段不存在时记为 element-not-found', async () => {
      const { executor } = createExecutor();

      const result = await executor.execute(
        buildJob(
          [
            { action: 'fill', fieldId: 'missingField', value: 'x' },
            { action: 'submit' },
          ],
          { viewports: ['desktop'] },
        ),
      );

      expect(result.scenarios[0].failure).toMatchObject({
        stepIndex: 0,
        kind: 'element-not-found',
      });
    }, 60_000);

    it('公开页显示错误（令牌失效）时记为 navigation 失败', async () => {
      const { executor } = createExecutor();

      const result = await executor.execute(
        buildJob(ASK_STEPS, {
          acceptanceToken: ERROR_PAGE_TOKEN,
          viewports: ['desktop'],
        }),
      );

      expect(result.scenarios[0].failure).toMatchObject({
        stepIndex: 0,
        kind: 'navigation',
      });
    }, 60_000);

    it('超过任务总时限时场景以 result-timeout 结束，runnerError 为 total-timeout，剩余视口不执行', async () => {
      const { executor } = createExecutor();

      const result = await executor.execute(
        buildJob(
          [
            { action: 'fill', fieldId: 'question', value: '这个很慢' },
            { action: 'submit' },
          ],
          { limits: { scenarioTimeoutMs: 20_000, totalTimeoutMs: 4_000 } },
        ),
      );

      expect(result.status).toBe('failed');
      expect(result.runnerError?.code).toBe('total-timeout');
      expect(result.scenarios).toHaveLength(1);
      expect(result.scenarios[0].failure).toMatchObject({
        stepIndex: 1,
        kind: 'result-timeout',
      });
    }, 60_000);

    it('证据上传失败时 runnerError 为 artifact-upload-failed，artifact key 为空', async () => {
      const storage = new MemoryStorage();
      storage.failWith = new Error('S3 Error: connect ECONNREFUSED minio:9000');
      const { executor } = createExecutor(storage);

      const result = await executor.execute(
        buildJob(ASK_STEPS, { viewports: ['desktop'] }),
      );

      expect(result.status).toBe('failed');
      expect(result.runnerError?.code).toBe('artifact-upload-failed');
      expect(result.scenarios[0]).toMatchObject({
        status: 'passed',
        artifacts: { screenshotKey: null, traceKey: null },
      });
    }, 60_000);
  },
);
