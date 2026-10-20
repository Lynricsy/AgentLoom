import type { GeneratedAppBrowserStep } from '../generated-app/types/app-spec-v2.schema';
import type { GeneratedAppBrowserScenarioResult } from '../generated-app/types/browser-acceptance-job.schema';

/**
 * 解释 AppSpec 场景的浏览器步骤。页面操作经 {@link GeneratedAppBrowserPageDriver} 完成：
 * runner 用 Playwright 实现它，单测用内存实现，失败归类与超时预算在这里统一处理。
 *
 * 公开页 DOM 约定（Studio `GeneratedAppPublicRuntimePage`）：字段控件或选项容器带
 * `data-field-id`，选项带 `data-option-value`；提交是表单内 `button[type=submit]`；结果容器带
 * `data-result-status`（running/completed/failed）与 `data-submission-id`；分区带
 * `data-result-section-id`。
 */
export type GeneratedAppBrowserOpenResult =
  { ok: true } | { ok: false; message: string };

export type GeneratedAppBrowserSubmitResult =
  | { status: 'accepted' }
  | { status: 'rejected'; httpStatus: number | null }
  | { status: 'not-found' };

export interface GeneratedAppBrowserResultState {
  status: 'completed' | 'failed' | 'timeout';
  submissionId: string | null;
}

export interface GeneratedAppBrowserPageDriver {
  /** 打开入口并等到表单或公开页错误出现 */
  open(timeoutMs: number): Promise<GeneratedAppBrowserOpenResult>;
  fill(
    fieldId: string,
    value: string,
    timeoutMs: number,
  ): Promise<'ok' | 'not-found'>;
  /** 字段或其中任一选项不存在时返回 not-found */
  select(
    fieldId: string,
    values: string[],
    timeoutMs: number,
  ): Promise<'ok' | 'not-found'>;
  /** 点击提交并等待提交接口响应 */
  submit(timeoutMs: number): Promise<GeneratedAppBrowserSubmitResult>;
  /** 等待结果容器进入终态 */
  waitForResult(timeoutMs: number): Promise<GeneratedAppBrowserResultState>;
  /** 分区不存在时返回 null */
  readSection(sectionId: string, timeoutMs: number): Promise<string | null>;
  readAllSections(): Promise<Record<string, string>>;
}

export type GeneratedAppBrowserScenarioOutcome = Pick<
  GeneratedAppBrowserScenarioResult,
  'status' | 'failure' | 'submissionId' | 'resultTexts'
>;

type Failure = NonNullable<GeneratedAppBrowserScenarioResult['failure']>;

const RESULT_TEXT_MAX_LENGTH = 500;
const FAILURE_MESSAGE_MAX_LENGTH = 500;
const SUBMISSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

export interface InterpretScenarioOptions {
  /** 场景截止时刻（epoch ms）：场景超时与任务总超时取较早者 */
  deadline: number;
  now?: () => number;
  /** 写进失败原因前的脱敏 */
  redact: (message: string) => string;
}

export async function interpretGeneratedAppBrowserScenario(
  driver: GeneratedAppBrowserPageDriver,
  steps: readonly GeneratedAppBrowserStep[],
  options: InterpretScenarioOptions,
): Promise<GeneratedAppBrowserScenarioOutcome> {
  const now = options.now ?? Date.now;
  const remaining = () => options.deadline - now();
  let submissionId: string | null = null;
  let resultTexts: Record<string, string> = {};
  let resultSettled = false;

  const fail = (
    stepIndex: number,
    kind: Failure['kind'],
    message: string,
  ): GeneratedAppBrowserScenarioOutcome => ({
    status: 'failed',
    failure: {
      stepIndex,
      kind,
      message: truncate(options.redact(message), FAILURE_MESSAGE_MAX_LENGTH),
    },
    submissionId,
    resultTexts,
  });
  const opened = await driver.open(remaining());
  if (!opened.ok) {
    return fail(0, 'navigation', `公开页未能打开：${opened.message}`);
  }

  for (const [stepIndex, step] of steps.entries()) {
    if (remaining() <= 0) {
      return fail(
        stepIndex,
        'result-timeout',
        '场景超时：步骤未在时限内完成。',
      );
    }

    switch (step.action) {
      case 'fill': {
        if (
          (await driver.fill(step.fieldId, step.value, remaining())) !== 'ok'
        ) {
          return fail(
            stepIndex,
            'element-not-found',
            `页面上没有可填写的字段 ${step.fieldId}。`,
          );
        }
        break;
      }
      case 'select': {
        if (
          (await driver.select(step.fieldId, step.values, remaining())) !== 'ok'
        ) {
          return fail(
            stepIndex,
            'element-not-found',
            `页面上没有字段 ${step.fieldId} 或其选项 ${step.values.join('、')}。`,
          );
        }
        break;
      }
      case 'submit': {
        const submitted = await driver.submit(remaining());
        if (submitted.status === 'not-found') {
          return fail(stepIndex, 'element-not-found', '页面上没有提交按钮。');
        }
        if (submitted.status === 'rejected') {
          return fail(
            stepIndex,
            'submission-rejected',
            submitted.httpStatus === null
              ? '点击提交后页面没有发出提交请求（表单校验未通过或请求超时）。'
              : `提交接口返回 HTTP ${submitted.httpStatus}。`,
          );
        }
        const settled = await driver.waitForResult(Math.max(0, remaining()));
        submissionId =
          settled.submissionId &&
          SUBMISSION_ID_PATTERN.test(settled.submissionId)
            ? settled.submissionId
            : null;
        if (settled.status === 'timeout') {
          return fail(
            stepIndex,
            'result-timeout',
            '提交后结果未在场景时限内进入终态。',
          );
        }
        resultTexts = Object.fromEntries(
          Object.entries(await driver.readAllSections()).map(
            ([sectionId, text]) => [
              sectionId,
              truncate(text.trim(), RESULT_TEXT_MAX_LENGTH),
            ],
          ),
        );
        if (settled.status === 'failed') {
          return fail(stepIndex, 'result-failed', '页面显示执行失败。');
        }
        resultSettled = true;
        break;
      }
      case 'expectResult': {
        if (!resultSettled) {
          return fail(
            stepIndex,
            'assertion-failed',
            `断言分区 ${step.sectionId} 时还没有已完成的提交结果。`,
          );
        }
        const text = await driver.readSection(step.sectionId, remaining());
        if (text === null) {
          return fail(
            stepIndex,
            'element-not-found',
            `页面上没有结果分区 ${step.sectionId}。`,
          );
        }
        const normalized = text.trim();
        resultTexts[step.sectionId] = truncate(
          normalized,
          RESULT_TEXT_MAX_LENGTH,
        );
        if (normalized.length === 0) {
          return fail(
            stepIndex,
            'assertion-failed',
            `结果分区 ${step.sectionId} 为空。`,
          );
        }
        break;
      }
    }
  }

  return { status: 'passed', failure: null, submissionId, resultTexts };
}
