import { describe, expect, it } from 'vitest';

import type { GeneratedApp, GeneratedAppSpec } from '../../../database/schema';
import {
  buildGeneratedAppRuntimeForm,
  buildPublicGeneratedAppRuntimeDescription,
  buildPublicGeneratedAppRuntimeSpec,
  evaluateGeneratedAppLocalRuntime,
} from '../generated-app.runtime';

function createRuntimeApp(
  generationPlan: GeneratedApp['generationPlan'] = null,
): Pick<
  GeneratedApp,
  'appName' | 'description' | 'appSpec' | 'generationPlan'
> {
  return {
    appName: '自动化中医问诊系统',
    description: '围绕问诊需求生成本地报告。',
    appSpec: {
      version: 1,
      appName: '自动化中医问诊系统',
      summary: '围绕问诊需求生成本地报告。',
      userGoal: '自动化中医问诊系统',
      actors: ['终端用户'],
      coreRequirements: [{ id: 'req-1', text: '自动化中医问诊系统' }],
      pages: [
        {
          id: 'page-public-runtime',
          name: '公开运行页',
          purpose: '终端用户提交问诊信息。',
        },
      ],
      dataPolicy: {
        publicSubmissionsPersisted: true,
        creatorCanDeleteSubmissions: true,
        endUserLoginRequired: false,
      },
      nonGoals: ['不输出医疗诊断结论。'],
      acceptanceScenarios: [
        {
          id: 'scenario-1',
          title: '提交问诊输入',
          requirementIds: ['req-1'],
          given: ['终端用户打开公开运行页'],
          when: ['提交问诊输入'],
          then: ['系统生成本地运行报告'],
        },
      ],
      traceability: [
        {
          requirementId: 'req-1',
          scenarioIds: ['scenario-1'],
          evidenceIds: ['app-spec-draft'],
        },
      ],
    },
    generationPlan,
  };
}

function createGeneralAppSpec(): GeneratedAppSpec {
  return {
    version: 1,
    appName: '客户线索分级助手',
    summary: '根据客户背景和业务目标生成线索分级报告。',
    userGoal: '快速整理客户线索并给出下一步跟进建议。',
    actors: ['销售顾问', '业务负责人'],
    coreRequirements: [
      { id: 'req-1', text: '整理客户背景并输出结构化分级报告' },
      { id: 'req-2', text: '根据客户类型和预算给出下一步跟进建议' },
    ],
    pages: [
      {
        id: 'page-public-runtime',
        name: '线索分级页',
        purpose: '终端用户提交客户线索并查看分级报告。',
      },
      {
        id: 'page-result',
        name: '报告页',
        purpose: '展示结构化报告和下一步建议。',
      },
    ],
    dataPolicy: {
      publicSubmissionsPersisted: true,
      creatorCanDeleteSubmissions: true,
      endUserLoginRequired: false,
    },
    nonGoals: ['不替代人工商务判断。'],
    acceptanceScenarios: [
      {
        id: 'scenario-1',
        title: '提交客户线索',
        requirementIds: ['req-1', 'req-2'],
        given: ['终端用户打开公开运行页'],
        when: ['填写客户背景和预算'],
        then: ['系统返回结构化分级报告'],
      },
    ],
    traceability: [
      {
        requirementId: 'req-1',
        scenarioIds: ['scenario-1'],
        evidenceIds: ['app-spec-draft'],
      },
      {
        requirementId: 'req-2',
        scenarioIds: ['scenario-1'],
        evidenceIds: ['app-spec-draft'],
      },
    ],
  };
}

function createGenerationPlanWithRequiredFields(
  appSpec: GeneratedAppSpec,
  requiredFields: string[],
): GeneratedApp['generationPlan'] {
  return {
    planVersion: 1,
    appSpecVersion: appSpec.version,
    frontend: {
      stack: 'react-vite-agentloom-runtime',
      runtimeSurface: {
        kind: 'generated-app',
        publicAccess: 'private-token-after-gates',
        dataUseNoticeRequired: true,
      },
      pages: appSpec.pages.map((page) => ({
        pageId: page.id,
        name: page.name,
        purpose: page.purpose,
        route: '/public-runtime',
        requirementIds: ['req-1'],
        scenarioIds: ['scenario-1'],
      })),
    },
    orchestration: {
      target: 'workflow',
      strategy: 'generated-workflow-with-agent-capability',
      inputContract: {
        source: 'public-runtime-submission',
        requiredFields,
        scenarioIds: ['scenario-1'],
      },
      outputContract: {
        destinations: ['public-runtime-report'],
        reportRequired: true,
      },
      steps: [
        {
          stepId: 'step-1',
          label: '生成报告',
          purpose: '整理公开提交并生成报告。',
          requirementIds: ['req-1'],
          scenarioIds: ['scenario-1'],
        },
      ],
    },
    pluginTools: {
      tools: [],
      emptyReason: '当前应用不需要插件工具。',
      permissionPolicy: [],
    },
    dataPersistence: {
      publicSubmissionsPersisted: true,
      creatorCanDeleteSubmissions: true,
      endUserLoginRequired: false,
      tenantScoped: true,
      tokenSnapshotRequired: true,
      softDeleteRequired: true,
    },
    testGates: {
      blockingGateIds: ['gate-0'],
      gatePlan: [],
      acceptanceScenarioIds: ['scenario-1'],
    },
    traceability: [
      {
        requirementId: 'req-1',
        scenarioIds: ['scenario-1'],
        pageIds: ['page-public-runtime'],
        orchestrationStepIds: ['step-1'],
        planEvidenceIds: ['plan-1'],
      },
    ],
    staticContracts: {
      contractVersion: 1,
      appSpecVersion: appSpec.version,
      generationPlanVersion: 1,
      publicRuntime: {
        input: {
          source: 'public-runtime-submission',
          requiredFields,
          scenarioIds: ['scenario-1'],
          dataUseNoticeRequired: true,
          anonymousSessionRequired: true,
          endUserLoginRequired: false,
        },
        output: {
          destinations: ['public-runtime-report'],
          reportRequired: true,
          errorStateRequired: true,
        },
      },
      frontendRoutes: [],
      orchestration: {
        target: 'workflow',
        strategy: 'generated-workflow-with-agent-capability',
        inputContract: {
          source: 'public-runtime-submission',
          requiredFields,
          scenarioIds: ['scenario-1'],
        },
        outputContract: {
          destinations: ['public-runtime-report'],
          reportRequired: true,
        },
        nodes: [],
        edges: [],
      },
      pluginToolPermissions: {
        tools: [],
        emptyReason: '当前应用不需要插件工具。',
        permissionPolicy: [],
        implicitPermissionsAllowed: false,
      },
      submissionPersistence: {
        fields: ['tenantId', 'generatedAppId', 'publicShareToken'],
        tokenSnapshotRequired: true,
        softDeleteRequired: true,
        creatorTenantOwnership: true,
      },
      testEntries: [],
      traceability: [],
    },
  } as GeneratedApp['generationPlan'];
}

describe('Generated App local runtime evaluator', () => {
  it('应为医疗问诊应用派生问诊采集字段且过滤诊断处方类合约字段', () => {
    const app = createRuntimeApp();
    const generationPlan = createGenerationPlanWithRequiredFields(app.appSpec, [
      'chiefComplaint',
      'diagnosis',
      'prescriptionPlan',
      'treatmentAdvice',
      'drugName',
      'publicShareToken',
      'sourceArtifactUrl',
    ]);

    const form = buildGeneratedAppRuntimeForm({
      appSpec: app.appSpec,
      generationPlan,
      description: app.description,
    });
    const serialized = JSON.stringify(form);

    expect(form.title).toContain('问诊采集表');
    expect(form.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'chiefComplaint',
          type: 'text',
          required: true,
        }),
        expect.objectContaining({
          id: 'duration',
          type: 'text',
          required: true,
        }),
        expect.objectContaining({
          id: 'symptoms',
          type: 'multi_select',
          required: true,
        }),
        expect.objectContaining({
          id: 'severity',
          type: 'range',
          min: 1,
          max: 10,
        }),
      ]),
    );
    expect(form.fields.map((field) => field.id)).not.toEqual(
      expect.arrayContaining([
        'diagnosis',
        'prescriptionPlan',
        'treatmentAdvice',
        'drugName',
        'publicShareToken',
        'sourceArtifactUrl',
      ]),
    );
    expect(serialized).not.toContain('publicShareToken');
    expect(serialized).not.toContain('sourceArtifactUrl');
  });

  it('医疗问诊运行报告不应从静态合约引导诊断、处方、药物或治疗字段', () => {
    const app = createRuntimeApp(
      createGenerationPlanWithRequiredFields(createRuntimeApp().appSpec, [
        'chiefComplaint',
        'diagnosis',
        'prescriptionPlan',
        'drugName',
        'treatmentAdvice',
      ]),
    );

    const evaluation = evaluateGeneratedAppLocalRuntime({
      app,
      input: { chiefComplaint: '头痛' },
      now: new Date('2026-04-28T00:00:00.000Z'),
    });
    const serialized = JSON.stringify({
      result: evaluation.result,
      report: evaluation.report,
    });

    expect(evaluation.status).toBe('completed');
    expect(serialized).not.toContain('diagnosis');
    expect(serialized).not.toContain('prescriptionPlan');
    expect(serialized).not.toContain('drugName');
    expect(serialized).not.toContain('treatmentAdvice');
    expect(evaluation.report?.nextStepQuestions).toEqual(
      expect.arrayContaining([
        expect.stringContaining('主要不适从什么时候开始'),
      ]),
    );
  });

  it('应从一般业务 AppSpec 和 staticContracts 派生文本、选项、数字、范围和长文本字段', () => {
    const appSpec = createGeneralAppSpec();
    const generationPlan = createGenerationPlanWithRequiredFields(appSpec, [
      'leadAge',
      'leadCategory',
      'featureTags',
      'detailNotes',
      'publicShareToken',
      '/root/AgentLoom/internal.json',
    ]);

    const form = buildGeneratedAppRuntimeForm({
      appSpec,
      generationPlan,
      description: '客户线索公开运行表单。',
    });

    expect(form.title).toBe('客户线索分级助手业务表单');
    expect(form.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'primaryGoal',
          type: 'text',
          required: true,
        }),
        expect.objectContaining({
          id: 'businessContext',
          type: 'textarea',
          required: true,
        }),
        expect.objectContaining({
          id: 'workflowStep',
          type: 'single_select',
          options: expect.arrayContaining([
            expect.objectContaining({ value: 'page-public-runtime' }),
          ]),
        }),
        expect.objectContaining({
          id: 'priority',
          type: 'range',
          min: 1,
          max: 5,
        }),
        expect.objectContaining({
          id: 'leadAge',
          type: 'number',
          min: 0,
          step: 1,
        }),
        expect.objectContaining({
          id: 'leadCategory',
          type: 'single_select',
          options: expect.arrayContaining([
            expect.objectContaining({ value: 'yes' }),
          ]),
        }),
        expect.objectContaining({
          id: 'featureTags',
          type: 'multi_select',
          options: expect.arrayContaining([
            expect.objectContaining({ value: 'primary' }),
          ]),
        }),
        expect.objectContaining({
          id: 'detailNotes',
          type: 'textarea',
        }),
      ]),
    );
    expect(JSON.stringify(form)).not.toContain('publicShareToken');
    expect(JSON.stringify(form)).not.toContain('/root/AgentLoom');
  });

  it('runtimeForm 文案应脱敏 token、内部字段和宿主机路径', () => {
    const appSpec = {
      ...createGeneralAppSpec(),
      appName: 'publicShareToken sk-test-redacted',
      summary: 'sourceArtifactUrl /root/AgentLoom/source.zip',
      userGoal:
        '读取 generationPlan、gateResults 和 /root/AgentLoom/.env 生成报告',
      pages: [
        {
          id: 'page-public-runtime',
          name: 'testReportUrl',
          purpose: 'pluginIds Bearer real-secret-token-value',
        },
      ],
    };

    const form = buildGeneratedAppRuntimeForm({
      appSpec,
      generationPlan: null,
      description: 'sourceArtifactUrl /root/AgentLoom/internal/source.zip',
    });
    const serialized = JSON.stringify(form);

    expect(form.title).toBe('Generated App业务表单');
    expect(serialized).not.toContain('publicShareToken');
    expect(serialized).not.toContain('generationPlan');
    expect(serialized).not.toContain('gateResults');
    expect(serialized).not.toContain('sourceArtifactUrl');
    expect(serialized).not.toContain('testReportUrl');
    expect(serialized).not.toContain('pluginIds');
    expect(serialized).not.toContain('real-secret-token-value');
    expect(serialized).not.toContain('/root/AgentLoom');
    expect(form.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'workflowStep',
          options: expect.arrayContaining([
            expect.objectContaining({ value: 'main-flow' }),
          ]),
        }),
      ]),
    );
  });

  it('应基于提交内容生成 completed 本地报告且不伪装真实执行', () => {
    const evaluation = evaluateGeneratedAppLocalRuntime({
      app: createRuntimeApp(),
      input: { chiefComplaint: '头痛', duration: '2 天' },
      now: new Date('2026-04-28T00:00:00.000Z'),
    });

    expect(evaluation.status).toBe('completed');
    expect(evaluation.result).toEqual(
      expect.objectContaining({
        runtimeKind: 'local-generated-app-deterministic-report',
        inputSummary: expect.objectContaining({
          textPreview: expect.stringContaining('头痛'),
        }),
        nextStepQuestions: expect.arrayContaining([
          expect.stringContaining('主要不适从什么时候开始'),
        ]),
        runtimeNotice: expect.stringContaining('未调用外部模型'),
      }),
    );
    expect(evaluation.report).toEqual(
      expect.objectContaining({
        disclaimers: expect.arrayContaining([
          expect.stringContaining('不提供诊断结论'),
        ]),
      }),
    );
  });

  it('应从静态合约摘要中移除 token、secret 和宿主机路径字段', () => {
    const generationPlan = {
      planVersion: 1,
      appSpecVersion: 1,
      frontend: {},
      orchestration: {
        inputContract: {
          source: 'public-runtime-submission',
          requiredFields: ['publicShareToken', 'chiefComplaint'],
          scenarioIds: ['scenario-1', 'sk-test-redacted'],
        },
        outputContract: {
          destinations: [
            'secret-report',
            'public-runtime-report',
            '/root/AgentLoom/internal.json',
          ],
          reportRequired: true,
        },
      },
      dataPersistence: {},
      testGates: {},
    } as unknown as GeneratedApp['generationPlan'];

    const evaluation = evaluateGeneratedAppLocalRuntime({
      app: createRuntimeApp(generationPlan),
      input: { chiefComplaint: '头痛' },
      now: new Date('2026-04-28T00:00:00.000Z'),
    });
    const serialized = JSON.stringify(evaluation.result);

    expect(serialized).toContain('chiefComplaint');
    expect(serialized).toContain('public-runtime-report');
    expect(serialized).not.toContain('publicShareToken');
    expect(serialized).not.toContain('secret-report');
    expect(serialized).not.toContain('/root/AgentLoom');
    expect(serialized).not.toContain('sk-test-redacted');
  });

  it('应从 AppSpec 文本和 result/report 中移除内部字段、token-like 值和宿主机路径', () => {
    const app = createRuntimeApp();
    const evaluation = evaluateGeneratedAppLocalRuntime({
      app: {
        ...app,
        appName: 'publicShareToken sk-test-redacted',
        appSpec: {
          ...app.appSpec,
          appName: 'publicShareToken sk-test-redacted',
          summary: 'sourceArtifactUrl /root/AgentLoom/internal/source.zip',
          userGoal:
            '读取 generationPlan、gateResults 和 /root/AgentLoom/.env 生成报告',
          coreRequirements: [
            {
              id: 'req-1',
              text: '把 testReportUrl、pluginIds 和 Bearer real-secret-token-value 写入结果',
            },
          ],
          acceptanceScenarios: [
            {
              id: 'scenario-1',
              title: 'internalConfig 输出',
              requirementIds: ['req-1'],
              given: ['存在 sourceArtifactUrl'],
              when: ['读取 /root/AgentLoom/.env'],
              then: ['输出 gateResults'],
            },
          ],
        },
      },
      input: { normal: '公开输入' },
      now: new Date('2026-04-28T00:00:00.000Z'),
    });
    const serialized = JSON.stringify({
      input: evaluation.input,
      result: evaluation.result,
      report: evaluation.report,
    });

    expect(evaluation.status).toBe('completed');
    expect(evaluation.result).toEqual(
      expect.objectContaining({
        appName: 'Generated App',
        userGoal: '整理公开提交内容并生成本地运行报告',
      }),
    );
    expect(serialized).not.toContain('publicShareToken');
    expect(serialized).not.toContain('generationPlan');
    expect(serialized).not.toContain('gateResults');
    expect(serialized).not.toContain('sourceArtifactUrl');
    expect(serialized).not.toContain('testReportUrl');
    expect(serialized).not.toContain('pluginIds');
    expect(serialized).not.toContain('real-secret-token-value');
    expect(serialized).not.toContain('/root/AgentLoom');
  });

  it('无法安全处理的输入结构应返回 failed 且错误信息不泄露内部细节', () => {
    const evaluation = evaluateGeneratedAppLocalRuntime({
      app: createRuntimeApp(),
      input: { ['__proto__']: { polluted: true }, safe: 'value' },
      now: new Date('2026-04-28T00:00:00.000Z'),
    });

    expect(evaluation.status).toBe('failed');
    expect(evaluation.result).toBeNull();
    expect(evaluation.report).toBeNull();
    expect(evaluation.errorMessage).toContain('无法处理的结构');
    expect(JSON.stringify(evaluation.input)).not.toContain('__proto__');
  });

  it('医疗问诊类 report sections 只保留提交摘要、下一步问题和免责声明', () => {
    const evaluation = evaluateGeneratedAppLocalRuntime({
      app: createRuntimeApp(),
      input: {
        chiefComplaint: '头痛',
        requestedAdvice: '请给诊断结论和处方',
      },
      now: new Date('2026-04-28T00:00:00.000Z'),
    });

    expect(evaluation.status).toBe('completed');
    expect(evaluation.report?.sections).toEqual([
      expect.objectContaining({ id: 'submitted-information' }),
      expect.objectContaining({ id: 'recommended-next-steps' }),
      expect.objectContaining({ id: 'runtime-boundary' }),
    ]);
    expect(JSON.stringify(evaluation.report?.sections)).not.toContain(
      'requirement-mapping',
    );
    expect(JSON.stringify(evaluation.report?.sections)).not.toContain(
      'scenario-coverage',
    );
    expect(evaluation.report?.disclaimers).toEqual(
      expect.arrayContaining([expect.stringContaining('不提供诊断结论')]),
    );
  });
  it('应为一般应用构建安全的公开 runtime 描述和页面规格并采用公开默认值', () => {
    const appSpec = {
      ...createGeneralAppSpec(),
      appName: '',
      summary: '',
      userGoal: '',
      actors: [],
    };

    expect(
      buildPublicGeneratedAppRuntimeDescription({
        appSpec,
        description: '',
      }),
    ).toBe('请填写业务输入，提交后查看结构化报告和下一步建议。');

    const runtimeSpec = buildPublicGeneratedAppRuntimeSpec({
      appSpec,
      pages: [
        {
          id: 'custom page',
          name: '',
          purpose: '',
        },
      ],
    });

    expect(runtimeSpec).toEqual(
      expect.objectContaining({
        appName: 'Generated App',
        summary: '整理公开提交内容并生成本地运行报告',
        userGoal: '整理公开提交内容并生成本地运行报告',
        actors: ['终端用户'],
        pages: [
          expect.objectContaining({
            id: 'custom-page',
            name: '公开运行页',
            purpose: '终端用户填写业务输入并查看结构化报告。',
          }),
        ],
      }),
    );
  });

  it('应保留 JSON 标量和集合、限制超长内容与数组并标记脱敏字段', () => {
    const longText = 'long public content '.repeat(60);
    const evaluation = evaluateGeneratedAppLocalRuntime({
      app: {
        ...createRuntimeApp(),
        appSpec: createGeneralAppSpec(),
      },
      input: {
        nullable: null,
        enabled: true,
        score: 7,
        longText,
        items: Array.from({ length: 22 }, (_, index) => index),
        nested: { label: '公开值' },
        apiKey: 'secret-value',
      },
      now: new Date('2026-04-28T00:00:00.000Z'),
    });

    expect(evaluation.status).toBe('completed');
    expect(evaluation.input).toEqual(
      expect.objectContaining({
        nullable: null,
        enabled: true,
        score: 7,
        longText: `${longText.slice(0, 1000)}...`,
        items: [
          ...Array.from({ length: 20 }, (_, index) => index),
          '[TRUNCATED_ARRAY_ITEMS:2]',
        ],
        nested: { label: '公开值' },
        redactedField1: '[REDACTED]',
      }),
    );
    expect(evaluation.result?.inputSummary).toEqual(
      expect.objectContaining({
        redactedFieldCount: 1,
        truncated: true,
      }),
    );
  });

  it('应拒绝过深、字段过多和非 JSON 输入，同时仅返回安全的失败结果', () => {
    const deeplyNested = {
      level1: {
        level2: {
          level3: {
            level4: {
              level5: {
                level6: {
                  level7: {
                    value: 'too deep',
                  },
                },
              },
            },
          },
        },
      },
    };
    const tooManyFields = Object.fromEntries(
      Array.from({ length: 82 }, (_, index) => [`field${index}`, index]),
    );

    for (const input of [
      deeplyNested,
      tooManyFields,
      { createdAt: new Date('2026-04-28T00:00:00.000Z') },
    ]) {
      const evaluation = evaluateGeneratedAppLocalRuntime({
        app: createRuntimeApp(),
        input,
        now: new Date('2026-04-28T00:00:00.000Z'),
      });

      expect(evaluation).toEqual(
        expect.objectContaining({
          status: 'failed',
          result: null,
          report: null,
          errorMessage: expect.stringContaining('无法处理的结构'),
        }),
      );
      expect(JSON.stringify(evaluation.input)).not.toContain('too deep');
    }
  });

  it('应在无静态合约时使用 runtime 默认输出，并区分部分覆盖和待补充场景', () => {
    const appSpec: GeneratedAppSpec = {
      ...createGeneralAppSpec(),
      pages: [],
      coreRequirements: [
        { id: 'req-covered', text: '生成公开报告' },
        { id: 'req-missing', text: '客户偏好' },
      ],
      acceptanceScenarios: [
        {
          id: 'scenario-partial',
          title: '部分覆盖场景',
          requirementIds: ['req-covered', 'req-missing'],
          given: [],
          when: [],
          then: [],
        },
        {
          id: 'scenario-missing',
          title: '待补充场景',
          requirementIds: ['req-missing'],
          given: [],
          when: [],
          then: [],
        },
      ],
    };
    const generationPlan = createGenerationPlanWithRequiredFields(appSpec, []);
    const orchestration = generationPlan?.orchestration as Record<
      string,
      unknown
    >;
    const withoutStaticContracts = {
      ...generationPlan,
      staticContracts: undefined,
      orchestration: {
        ...orchestration,
        inputContract: undefined,
        outputContract: {
          reportRequired: false,
        },
      },
    } as unknown as GeneratedApp['generationPlan'];

    const evaluation = evaluateGeneratedAppLocalRuntime({
      app: {
        appName: appSpec.appName,
        description: appSpec.summary,
        appSpec,
        generationPlan: withoutStaticContracts,
      },
      input: {},
      now: new Date('2026-04-28T00:00:00.000Z'),
    });

    expect(evaluation.status).toBe('completed');
    expect(evaluation.result?.contractSummary).toEqual({
      appSpecVersion: 1,
      requiredInputFields: ['input'],
      outputDestinations: [
        'public-runtime-report',
        'creator-submission-detail',
      ],
      reportRequired: false,
      scenarioIds: [],
    });
    expect(evaluation.result?.inputSummary).toEqual(
      expect.objectContaining({
        empty: true,
        textPreview: '未提供可分析字段。',
      }),
    );
    expect(evaluation.result?.scenarioCoverage).toEqual([
      expect.objectContaining({
        id: 'scenario-partial',
        coverage: 'partially_covered',
        summary: expect.stringContaining('已部分覆盖'),
      }),
      expect.objectContaining({
        id: 'scenario-missing',
        coverage: 'needs_more_input',
        summary: expect.stringContaining('尚无足够输入'),
      }),
    ]);
    expect(evaluation.result?.nextStepQuestions).toHaveLength(2);
  });
});
