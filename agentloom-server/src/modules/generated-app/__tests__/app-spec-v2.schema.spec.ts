import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  GeneratedAppSpecDraftSchema,
  GeneratedAppSpecV2Schema,
  type GeneratedAppSpecDraft,
} from '../types/app-spec-v2.schema';
import {
  GeneratedAppBrowserAcceptanceJobSchema,
  GeneratedAppBrowserAcceptanceResultSchema,
} from '../types/browser-acceptance-job.schema';

const WORKFLOW_ID = '01a15536-d0cb-72a0-b687-72b9d721f193';
const VERSION_ID = '01a15536-d0cb-72a0-b687-72b9d721f194';
const AGENT_ID = '01a15536-4a63-757d-9077-0bbd88bfc037';
const MODEL_ID = '01a154d7-8c8f-7c7b-87f3-a94220c05251';
const UUID = '01a1553d-2841-773b-910a-5996af8ee7cc';

/** 「问答页面：输入问题，调用文档问答工作流返回答案与引用」的模型草稿 */
function qaDraft(): z.input<typeof GeneratedAppSpecDraftSchema> {
  return {
    appName: '文档问答',
    summary: '输入问题，调用文档问答工作流返回答案与引用。',
    userGoal: '终端用户提问并得到带引用的答案',
    actors: ['终端用户'],
    requirements: [
      { id: 'req-ask', text: '输入问题并返回答案与引用', source: 'prompt' },
    ],
    inputForm: {
      title: '提问',
      submitLabel: '提问',
      fields: [
        { id: 'question', label: '问题', type: 'textarea', required: true },
      ],
    },
    resultView: {
      title: '回答',
      sections: [
        { id: 'answer', label: '答案', format: 'markdown' },
        { id: 'citations', label: '引用', format: 'citations' },
      ],
    },
    binding: {
      kind: 'workflow',
      workflowDefinitionId: WORKFLOW_ID,
      inputMapping: [{ fieldId: 'question', workflowInputFieldId: 'question' }],
      outputMapping: [
        { sectionId: 'answer', nodeId: 'out-answer' },
        { sectionId: 'citations', nodeId: 'out-structured', path: 'citations' },
      ],
    },
    acceptanceScenarios: [
      {
        id: 'scenario-ask',
        title: '提问后看到答案与引用',
        scope: 'requirement',
        requirementIds: ['req-ask'],
        given: ['公开页已打开'],
        when: ['输入问题并提交'],
        then: ['展示答案', '展示引用'],
        browserSteps: [
          {
            action: 'fill',
            fieldId: 'question',
            value: '最多可以同时运行几个子 Agent？',
          },
          { action: 'submit' },
          {
            action: 'expectResult',
            sectionId: 'answer',
            assertion: 'nonEmpty',
          },
          {
            action: 'expectResult',
            sectionId: 'citations',
            assertion: 'nonEmpty',
          },
        ],
      },
    ],
  };
}

function issueMessages(schema: z.ZodType, input: unknown): string[] {
  const result = schema.safeParse(input);
  expect(result.success).toBe(false);
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.message);
}

function toSpec(draft: GeneratedAppSpecDraft) {
  return {
    version: 2 as const,
    appName: draft.appName,
    summary: draft.summary,
    userGoal: draft.userGoal,
    actors: draft.actors,
    coreRequirements: [
      ...draft.requirements,
      {
        id: 'req-platform-persist',
        text: '提交默认保存',
        source: 'platform' as const,
      },
    ],
    pages: [
      { id: 'public-runtime', name: '公开运行页', purpose: '终端用户提交' },
    ],
    inputForm: draft.inputForm,
    resultView: draft.resultView,
    binding:
      draft.binding.kind === 'workflow'
        ? { ...draft.binding, workflowVersionId: VERSION_ID }
        : { ...draft.binding, agentVersionId: VERSION_ID },
    dataPolicy: {
      publicSubmissionsPersisted: true,
      creatorCanDeleteSubmissions: true,
      endUserLoginRequired: false,
    },
    nonGoals: ['不生成自定义后端'],
    acceptanceScenarios: [
      ...draft.acceptanceScenarios,
      {
        id: 'scenario-platform-persist',
        title: '提交保存可追踪',
        scope: 'platform' as const,
        requirementIds: ['req-platform-persist'],
        given: ['应用已公开'],
        when: ['终端用户提交'],
        then: ['提交归属创建者租户'],
        browserSteps: [],
      },
    ],
    traceability: [
      {
        requirementId: 'req-ask',
        scenarioIds: ['scenario-ask'],
        fieldIds: ['question'],
        sectionIds: ['answer', 'citations'],
      },
      {
        requirementId: 'req-platform-persist',
        scenarioIds: ['scenario-platform-persist'],
        fieldIds: [],
        sectionIds: [],
      },
    ],
    generation: {
      modelConfigId: MODEL_ID,
      generatedAt: '2026-10-20T00:00:00.000Z',
      attempt: 1,
      promptSha256: 'a'.repeat(64),
    },
  };
}

describe('GeneratedAppSpecDraftSchema', () => {
  it('问答草稿通过校验并填充默认值', () => {
    const draft = GeneratedAppSpecDraftSchema.parse(qaDraft());

    expect(draft.inputForm.fields[0]).toMatchObject({
      id: 'question',
      maxLength: 2000,
      helpText: '',
    });
  });

  it('prompt 需求没有 requirement 场景时失败', () => {
    const draft = qaDraft();
    draft.requirements.push({
      id: 'req-history',
      text: '查看历史',
      source: 'prompt',
    });

    expect(issueMessages(GeneratedAppSpecDraftSchema, draft)).toContain(
      '需求 req-history 没有 requirement 验收场景',
    );
  });

  it('场景必须填写必填字段、先提交再断言', () => {
    const draft = qaDraft();
    draft.acceptanceScenarios[0].browserSteps = [
      { action: 'expectResult', sectionId: 'answer', assertion: 'nonEmpty' },
      { action: 'submit' },
    ];

    const messages = issueMessages(GeneratedAppSpecDraftSchema, draft);
    expect(messages).toEqual(
      expect.arrayContaining([
        '步骤 0 的结果断言出现在提交之前',
        '场景没有填写必填字段 question',
        '场景缺少提交后的 expectResult 断言',
      ]),
    );
  });

  it('结果断言只检查分区非空：依赖回答措辞的 contains 断言被拒绝', () => {
    const draft = qaDraft();
    draft.acceptanceScenarios[0].browserSteps[2] = {
      action: 'expectResult',
      sectionId: 'answer',
      assertion: 'contains',
      text: '10',
    } as unknown as (typeof draft.acceptanceScenarios)[0]['browserSteps'][2];

    const result = GeneratedAppSpecDraftSchema.safeParse(draft);

    expect(result.success).toBe(false);
    expect(result.error?.issues).toContainEqual(
      expect.objectContaining({
        path: ['acceptanceScenarios', 0, 'browserSteps', 2, 'assertion'],
      }),
    );
  });

  it('工作流绑定：未映射的字段与结果分区、不存在的引用都报错', () => {
    const draft = qaDraft();
    draft.inputForm.fields.push({
      id: 'topic',
      label: '主题',
      type: 'text',
      required: false,
    });
    if (draft.binding.kind !== 'workflow') throw new Error('fixture');
    draft.binding.outputMapping = [
      { sectionId: 'answer', nodeId: 'out-answer' },
    ];
    draft.binding.inputMapping.push({
      fieldId: 'missing',
      workflowInputFieldId: 'x',
    });

    expect(issueMessages(GeneratedAppSpecDraftSchema, draft)).toEqual(
      expect.arrayContaining([
        '字段 topic 没有映射到工作流输入，提交后会被丢弃',
        '结果分区 citations 没有对应的工作流输出',
        '输入映射引用了不存在的字段 missing',
      ]),
    );
  });

  it('选择字段的步骤值必须在选项内，且不能用 fill', () => {
    const draft = qaDraft();
    draft.inputForm.fields.push({
      id: 'scope',
      label: '范围',
      type: 'single_select',
      required: true,
      options: [{ value: 'docs', label: '文档' }],
    });
    if (draft.binding.kind !== 'workflow') throw new Error('fixture');
    draft.binding.inputMapping.push({
      fieldId: 'scope',
      workflowInputFieldId: 'scope',
    });
    draft.acceptanceScenarios[0].browserSteps.unshift(
      { action: 'fill', fieldId: 'scope', value: 'docs' },
      { action: 'select', fieldId: 'scope', values: ['web'] },
    );

    expect(issueMessages(GeneratedAppSpecDraftSchema, draft)).toEqual(
      expect.arrayContaining([
        '步骤 0 对选择字段 scope 应使用 select',
        '步骤 1 的值 web 不在字段 scope 的选项中',
      ]),
    );
  });

  it('Agent 绑定要求恰好一个结果分区且 replySectionId 存在', () => {
    const draft = qaDraft();
    draft.binding = {
      kind: 'agent',
      agentDefinitionId: AGENT_ID,
      replySectionId: 'reply',
    };

    expect(issueMessages(GeneratedAppSpecDraftSchema, draft)).toEqual(
      expect.arrayContaining([
        'Agent 回复分区 reply 不存在',
        'Agent 绑定只有一路回复，结果视图必须恰好一个分区',
      ]),
    );
  });

  it('Agent 回复分区只能是 text 或 markdown：citations 分区接不住文本回复', () => {
    const draft = qaDraft();
    draft.resultView.sections = [
      { id: 'citations', label: '回答与来源', format: 'citations' },
    ];
    draft.binding = {
      kind: 'agent',
      agentDefinitionId: AGENT_ID,
      replySectionId: 'citations',
    };

    expect(issueMessages(GeneratedAppSpecDraftSchema, draft)).toContain(
      'Agent 回复是文本，回复分区 citations 的 format 必须是 text 或 markdown（当前 citations）；引用请写在回复正文里',
    );
  });

  it('模型不能产出 platform 需求或 platform 场景', () => {
    const draft = qaDraft();
    const tampered: unknown = {
      ...draft,
      requirements: [{ ...draft.requirements[0], source: 'platform' }],
    };

    expect(GeneratedAppSpecDraftSchema.safeParse(tampered).success).toBe(false);
  });
});

describe('GeneratedAppSpecV2Schema', () => {
  it('由草稿补全的 AppSpec 通过校验', () => {
    const spec = GeneratedAppSpecV2Schema.parse(
      toSpec(GeneratedAppSpecDraftSchema.parse(qaDraft())),
    );

    expect(spec.binding).toMatchObject({
      kind: 'workflow',
      workflowVersionId: VERSION_ID,
    });
  });

  it('platform 场景不能带浏览器步骤，需求必须有 traceability', () => {
    const spec = toSpec(GeneratedAppSpecDraftSchema.parse(qaDraft()));
    spec.acceptanceScenarios[1].browserSteps = [{ action: 'submit' }];
    spec.traceability = spec.traceability.slice(0, 1);

    expect(issueMessages(GeneratedAppSpecV2Schema, spec)).toEqual(
      expect.arrayContaining([
        '平台流程场景 scenario-platform-persist 不应包含浏览器步骤',
        '需求 req-platform-persist 缺少 traceability',
      ]),
    );
  });

  it('v1 模板 AppSpec 不被 v2 接受', () => {
    expect(
      GeneratedAppSpecV2Schema.safeParse({ version: 1, appName: 'x' }).success,
    ).toBe(false);
  });

  it('JSON Schema 可以导出给模型结构化输出', () => {
    expect(() =>
      z.toJSONSchema(GeneratedAppSpecDraftSchema, { io: 'input' }),
    ).not.toThrow();
  });
});

describe('浏览器验收任务契约', () => {
  it('任务与结果往返解析', () => {
    const job = GeneratedAppBrowserAcceptanceJobSchema.parse({
      jobVersion: 1,
      tenantId: UUID,
      appId: UUID,
      generationRunId: UUID,
      acceptanceToken: 'f'.repeat(64),
      viewports: ['desktop', 'mobile'],
      scenarios: [
        {
          scenarioId: 'scenario-ask',
          steps: qaDraft().acceptanceScenarios[0].browserSteps,
        },
      ],
      limits: { scenarioTimeoutMs: 180000, totalTimeoutMs: 900000 },
      artifactPrefix: `tenants/${UUID}/generated-apps/${UUID}/runs/${UUID}/gate-5`,
    });
    expect(job.scenarios[0].steps).toHaveLength(4);

    const result = GeneratedAppBrowserAcceptanceResultSchema.parse({
      jobVersion: 1,
      status: 'failed',
      runnerError: null,
      browser: { name: 'chromium', version: '140.0' },
      playwrightVersion: '1.56.0',
      startedAt: '2026-10-20T00:00:00.000Z',
      completedAt: '2026-10-20T00:01:00.000Z',
      scenarios: [
        {
          scenarioId: 'scenario-ask',
          viewportId: 'mobile',
          status: 'failed',
          durationMs: 61000,
          failure: {
            stepIndex: 2,
            kind: 'result-timeout',
            message: '结果 180s 内未完成',
          },
          submissionId: UUID,
          consoleErrors: [],
          failedRequests: [],
          resultTexts: {},
          artifacts: { screenshotKey: null, traceKey: null },
        },
      ],
    });
    expect(result.scenarios[0].failure?.kind).toBe('result-timeout');
  });

  it('artifact 前缀只能落在本次运行的 gate-5 目录', () => {
    expect(
      GeneratedAppBrowserAcceptanceJobSchema.shape.artifactPrefix.safeParse(
        `tenants/${UUID}/generated-apps/${UUID}/runs/${UUID}/../../x`,
      ).success,
    ).toBe(false);
  });
});
