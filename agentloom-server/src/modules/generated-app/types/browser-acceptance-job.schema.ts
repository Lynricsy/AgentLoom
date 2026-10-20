/**
 * Gate 5 浏览器验收任务契约（ADR-0007）：worker 中的生成编排把任务投递到
 * `generated-app-browser-acceptance` 队列，独立的 browser-runner 容器用 Playwright 执行并
 * 以 BullMQ 任务返回值回传结果。两端都在任务边界用本文件的 schema 解析。
 *
 * runner 不访问数据库：只拿到入口 URL、验收令牌、要执行的步骤与 artifact 存储前缀。
 */
import { z } from 'zod';

import {
  GENERATED_APP_SPEC_LIMITS,
  GeneratedAppBrowserStepSchema,
} from './app-spec-v2.schema';

export const GENERATED_APP_BROWSER_ACCEPTANCE_QUEUE =
  'generated-app-browser-acceptance';

export const GENERATED_APP_BROWSER_VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 390, height: 844 },
} as const;

export const GeneratedAppBrowserViewportIdSchema = z.enum([
  'desktop',
  'mobile',
]);

export const GeneratedAppBrowserAcceptanceJobSchema = z.object({
  jobVersion: z.literal(1),
  tenantId: z.string().uuid(),
  appId: z.string().uuid(),
  generationRunId: z.string().uuid(),
  /** runner 侧拼接 `${baseUrl}/generated-apps/public/${acceptanceToken}`；baseUrl 来自 runner 自己的配置 */
  acceptanceToken: z.string().regex(/^[0-9a-f]{64}$/),
  viewports: z.array(GeneratedAppBrowserViewportIdSchema).min(1),
  scenarios: z
    .array(
      z.object({
        scenarioId: z.string().min(1),
        steps: z
          .array(GeneratedAppBrowserStepSchema)
          .min(2)
          .max(GENERATED_APP_SPEC_LIMITS.browserStepsMax),
      }),
    )
    .min(1)
    .max(GENERATED_APP_SPEC_LIMITS.browserScenariosMax),
  limits: z.object({
    scenarioTimeoutMs: z.number().int().positive(),
    totalTimeoutMs: z.number().int().positive(),
  }),
  /** MinIO 对象前缀：tenants/<tenantId>/generated-apps/<appId>/runs/<generationRunId>/gate-5 */
  artifactPrefix: z
    .string()
    .regex(
      /^tenants\/[0-9a-f-]+\/generated-apps\/[0-9a-f-]+\/runs\/[0-9a-f-]+\/gate-5$/,
    ),
});

export const GENERATED_APP_BROWSER_STEP_FAILURE_KINDS = [
  'navigation',
  'element-not-found',
  'submission-rejected',
  'result-timeout',
  'result-failed',
  'assertion-failed',
] as const;

export const GeneratedAppBrowserScenarioResultSchema = z.object({
  scenarioId: z.string().min(1),
  viewportId: GeneratedAppBrowserViewportIdSchema,
  status: z.enum(['passed', 'failed']),
  durationMs: z.number().int().nonnegative(),
  failure: z
    .object({
      stepIndex: z.number().int().nonnegative(),
      kind: z.enum(GENERATED_APP_BROWSER_STEP_FAILURE_KINDS),
      /** 已脱敏（令牌、宿主路径），≤500 字符 */
      message: z.string().max(500),
    })
    .nullable(),
  /** 公开提交 id（由验收令牌创建，origin=gate-acceptance） */
  submissionId: z.string().uuid().nullable(),
  /** 脱敏后的 console error / pageerror，最多 20 条 */
  consoleErrors: z.array(z.string().max(300)).max(20),
  /** 同源请求中状态 ≥ 400 或失败的请求（方法 + 去掉令牌的路径 + 状态） */
  failedRequests: z
    .array(
      z.object({
        method: z.string(),
        path: z.string().max(300),
        status: z.number().int().nullable(),
      }),
    )
    .max(20),
  /** 每个结果分区在页面上读到的文本（截断到 500 字符），供 Gate 6 复核 */
  resultTexts: z.record(z.string(), z.string().max(500)),
  artifacts: z.object({
    screenshotKey: z.string().nullable(),
    traceKey: z.string().nullable(),
  }),
});

export const GeneratedAppBrowserAcceptanceResultSchema = z.object({
  jobVersion: z.literal(1),
  status: z.enum(['passed', 'failed']),
  /** runner 本身失败（浏览器启动失败、总超时）时的原因；场景失败不算 */
  runnerError: z
    .object({
      code: z.enum([
        'browser-launch-failed',
        'total-timeout',
        'artifact-upload-failed',
      ]),
      message: z.string().max(500),
    })
    .nullable(),
  browser: z.object({ name: z.literal('chromium'), version: z.string() }),
  playwrightVersion: z.string(),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime(),
  scenarios: z.array(GeneratedAppBrowserScenarioResultSchema),
});

export type GeneratedAppBrowserViewportId = z.infer<
  typeof GeneratedAppBrowserViewportIdSchema
>;
export type GeneratedAppBrowserAcceptanceJob = z.infer<
  typeof GeneratedAppBrowserAcceptanceJobSchema
>;
export type GeneratedAppBrowserScenarioResult = z.infer<
  typeof GeneratedAppBrowserScenarioResultSchema
>;
export type GeneratedAppBrowserAcceptanceResult = z.infer<
  typeof GeneratedAppBrowserAcceptanceResultSchema
>;
