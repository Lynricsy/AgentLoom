import { describe, expect, it } from 'vitest';

import type { GeneratedAppBrowserStep } from '../../generated-app/types/app-spec-v2.schema';
import {
  interpretGeneratedAppBrowserScenario,
  type GeneratedAppBrowserOpenResult,
  type GeneratedAppBrowserPageDriver,
  type GeneratedAppBrowserSubmitResult,
} from '../generated-app-browser-scenario.interpreter';

const SUBMISSION_ID = '01a15800-0000-7000-8000-000000000001';
const TOKEN = 'a'.repeat(64);

interface FakePageState {
  fields: string[];
  options: Record<string, string[]>;
  openResult?: GeneratedAppBrowserOpenResult;
  hasSubmit?: boolean;
  submitResult?: GeneratedAppBrowserSubmitResult;
  resultStatus?: 'completed' | 'failed' | 'timeout';
  submissionId?: string | null;
  sections: Record<string, string>;
}

/** 内存公开页：记录调用顺序，按状态回答查询 */
class FakePage implements GeneratedAppBrowserPageDriver {
  readonly calls: string[] = [];
  readonly filled: Record<string, string> = {};
  readonly selected: Record<string, string[]> = {};

  constructor(
    private readonly state: FakePageState,
    private readonly onCall: () => void = () => {},
  ) {}

  async open() {
    this.calls.push('open');
    this.onCall();
    return this.state.openResult ?? { ok: true as const };
  }

  async fill(fieldId: string, value: string) {
    this.calls.push(`fill:${fieldId}`);
    this.onCall();
    if (!this.state.fields.includes(fieldId)) return 'not-found' as const;
    this.filled[fieldId] = value;
    return 'ok' as const;
  }

  async select(fieldId: string, values: string[]) {
    this.calls.push(`select:${fieldId}`);
    this.onCall();
    const options = this.state.options[fieldId];
    if (!options || values.some((value) => !options.includes(value))) {
      return 'not-found' as const;
    }
    this.selected[fieldId] = values;
    return 'ok' as const;
  }

  async submit() {
    this.calls.push('submit');
    this.onCall();
    if (this.state.hasSubmit === false) return { status: 'not-found' as const };
    return this.state.submitResult ?? { status: 'accepted' as const };
  }

  async waitForResult() {
    this.calls.push('waitForResult');
    this.onCall();
    return {
      status: this.state.resultStatus ?? ('completed' as const),
      submissionId:
        this.state.submissionId === undefined
          ? SUBMISSION_ID
          : this.state.submissionId,
    };
  }

  async readSection(sectionId: string) {
    this.calls.push(`readSection:${sectionId}`);
    return this.state.sections[sectionId] ?? null;
  }

  async readAllSections() {
    this.calls.push('readAllSections');
    return { ...this.state.sections };
  }
}

function qaState(overrides: Partial<FakePageState> = {}): FakePageState {
  return {
    fields: ['question'],
    options: { tone: ['brief', 'detailed'] },
    sections: {
      answer: '最多可以同时运行 10 个子 Agent。',
      citations: '宣传册 第 3 页',
    },
    ...overrides,
  };
}

const QA_STEPS: GeneratedAppBrowserStep[] = [
  { action: 'fill', fieldId: 'question', value: '最多几个子 Agent？' },
  { action: 'select', fieldId: 'tone', values: ['brief'] },
  { action: 'submit' },
  { action: 'expectResult', sectionId: 'answer', assertion: 'nonEmpty' },
  { action: 'expectResult', sectionId: 'citations', assertion: 'nonEmpty' },
];

const options = {
  deadline: Number.POSITIVE_INFINITY,
  redact: (message: string) => message.split(TOKEN).join('<acceptance-token>'),
};

describe('interpretGeneratedAppBrowserScenario', () => {
  it('按顺序执行步骤并在通过时返回提交 id 与全部分区文本', async () => {
    const page = new FakePage(qaState());

    const outcome = await interpretGeneratedAppBrowserScenario(
      page,
      QA_STEPS,
      options,
    );

    expect(outcome).toEqual({
      status: 'passed',
      failure: null,
      submissionId: SUBMISSION_ID,
      resultTexts: {
        answer: '最多可以同时运行 10 个子 Agent。',
        citations: '宣传册 第 3 页',
      },
    });
    expect(page.calls).toEqual([
      'open',
      'fill:question',
      'select:tone',
      'submit',
      'waitForResult',
      'readAllSections',
      'readSection:answer',
      'readSection:citations',
    ]);
    expect(page.filled).toEqual({ question: '最多几个子 Agent？' });
    expect(page.selected).toEqual({ tone: ['brief'] });
  });

  it('公开页打不开时记为第 0 步 navigation 失败且不再操作页面', async () => {
    const page = new FakePage(
      qaState({
        openResult: { ok: false, message: `入口返回 HTTP 404 /p/${TOKEN}` },
      }),
    );

    const outcome = await interpretGeneratedAppBrowserScenario(
      page,
      QA_STEPS,
      options,
    );

    expect(outcome.status).toBe('failed');
    expect(outcome.failure).toEqual({
      stepIndex: 0,
      kind: 'navigation',
      message: '公开页未能打开：入口返回 HTTP 404 /p/<acceptance-token>',
    });
    expect(page.calls).toEqual(['open']);
  });

  it.each([
    ['字段不存在', qaState({ fields: [] }), 0, 'element-not-found'],
    [
      '选项不在页面上',
      qaState({ options: { tone: ['detailed'] } }),
      1,
      'element-not-found',
    ],
    ['没有提交按钮', qaState({ hasSubmit: false }), 2, 'element-not-found'],
    [
      '提交接口返回 422',
      qaState({ submitResult: { status: 'rejected', httpStatus: 422 } }),
      2,
      'submission-rejected',
    ],
    [
      '结果未进入终态',
      qaState({ resultStatus: 'timeout' }),
      2,
      'result-timeout',
    ],
    [
      '页面显示执行失败',
      qaState({ resultStatus: 'failed' }),
      2,
      'result-failed',
    ],
    [
      '分区为空白',
      qaState({ sections: { answer: '10', citations: '   \n' } }),
      4,
      'assertion-failed',
    ],
    [
      '分区不存在',
      qaState({ sections: { answer: '10' } }),
      4,
      'element-not-found',
    ],
  ] as const)('%s → 第 %i 步 %s', async (_label, state, stepIndex, kind) => {
    const outcome = await interpretGeneratedAppBrowserScenario(
      new FakePage(state),
      QA_STEPS,
      options,
    );

    expect(outcome.status).toBe('failed');
    expect(outcome.failure).toMatchObject({ stepIndex, kind });
  });

  it('提交请求没有发出时说明原因，而不是报告 HTTP 状态', async () => {
    const outcome = await interpretGeneratedAppBrowserScenario(
      new FakePage(
        qaState({ submitResult: { status: 'rejected', httpStatus: null } }),
      ),
      QA_STEPS,
      options,
    );

    expect(outcome.failure?.kind).toBe('submission-rejected');
    expect(outcome.failure?.message).toContain('没有发出提交请求');
  });

  it('执行失败时仍带回提交 id 与页面上已有的分区文本，供 Gate 6 排查', async () => {
    const outcome = await interpretGeneratedAppBrowserScenario(
      new FakePage(
        qaState({ resultStatus: 'failed', sections: { answer: '执行未完成' } }),
      ),
      QA_STEPS,
      options,
    );

    expect(outcome).toMatchObject({
      status: 'failed',
      submissionId: SUBMISSION_ID,
      resultTexts: { answer: '执行未完成' },
    });
  });

  it('在提交完成前断言结果分区直接判失败', async () => {
    const page = new FakePage(qaState());

    const outcome = await interpretGeneratedAppBrowserScenario(
      page,
      [
        { action: 'fill', fieldId: 'question', value: 'q' },
        { action: 'expectResult', sectionId: 'answer', assertion: 'nonEmpty' },
        { action: 'submit' },
      ],
      options,
    );

    expect(outcome.failure).toMatchObject({
      stepIndex: 1,
      kind: 'assertion-failed',
    });
    expect(page.calls).not.toContain('submit');
  });

  it('场景截止时刻已过时在下一步前以 result-timeout 停止', async () => {
    let clock = 0;
    const page = new FakePage(qaState(), () => {
      clock += 100;
    });

    const outcome = await interpretGeneratedAppBrowserScenario(page, QA_STEPS, {
      ...options,
      deadline: 250,
      now: () => clock,
    });

    // open(100) fill(200) select(300)：select 之后已过截止时刻，submit 不再执行
    expect(outcome.failure).toMatchObject({
      stepIndex: 2,
      kind: 'result-timeout',
    });
    expect(page.calls).toEqual(['open', 'fill:question', 'select:tone']);
  });

  it('丢弃不是 UUID 的提交 id，并把分区文本截断到 500 字符', async () => {
    const outcome = await interpretGeneratedAppBrowserScenario(
      new FakePage(
        qaState({
          submissionId: '<script>',
          sections: { answer: `10${'字'.repeat(800)}`, citations: 'c' },
        }),
      ),
      QA_STEPS,
      options,
    );

    expect(outcome.status).toBe('passed');
    expect(outcome.submissionId).toBeNull();
    expect(outcome.resultTexts.answer).toHaveLength(500);
    expect(outcome.resultTexts.answer.endsWith('…')).toBe(true);
  });
});
