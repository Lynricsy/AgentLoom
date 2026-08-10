import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import type {
  GeneratedAppBuildUnitPlan,
  GeneratedAppGenerationPlan,
  GeneratedAppGenerationRepairContext,
  GeneratedAppSpec,
  GeneratedAppStaticContracts,
} from '../../../database/schema';
import { GeneratedAppGate3WorkspaceRunner } from '../generated-app.workspace';
import {
  buildBuildUnitPlan,
  buildGate1Checks,
  buildGate2Checks,
  buildGate3Checks,
  buildGenerationPlan,
  buildPluginToolPlan,
  buildStaticContracts,
  evaluateGate1GenerationPlan,
  evaluateGate2StaticContracts,
  evaluateGate3BuildUnitPlan,
  requirementNeedsPrivatePluginTool,
} from './generation-plan.builder';

function createAppSpec(
  overrides: Partial<GeneratedAppSpec> = {},
): GeneratedAppSpec {
  return {
    version: 1,
    appName: '表单应用',
    summary: '收集输入并生成报告。',
    userGoal: '收集公开输入并生成结果',
    actors: ['创建者', '终端用户'],
    coreRequirements: [
      { id: 'req/alpha', text: '收集表单内容' },
      { id: 'req-beta', text: '生成结果报告' },
    ],
    pages: [
      { id: 'page/home', name: '首页', purpose: '提交内容' },
      { id: 'page-report', name: '报告页', purpose: '查看结果' },
    ],
    dataPolicy: {
      publicSubmissionsPersisted: true,
      creatorCanDeleteSubmissions: true,
      endUserLoginRequired: false,
    },
    nonGoals: ['不访问外部网络'],
    acceptanceScenarios: [
      {
        id: 'scenario-submit',
        title: '提交内容',
        requirementIds: ['req/alpha'],
        given: ['打开首页'],
        when: ['提交内容'],
        then: ['保存提交'],
      },
      {
        id: 'scenario-report',
        title: '查看报告',
        requirementIds: ['req-beta'],
        given: ['已有提交'],
        when: ['打开报告'],
        then: ['显示结果'],
      },
    ],
    traceability: [
      {
        requirementId: 'req/alpha',
        scenarioIds: ['scenario-submit'],
        evidenceIds: ['app-spec-draft'],
      },
    ],
    ...overrides,
  };
}

const configService = {
  get: () => undefined,
} as unknown as ConfigService;
const workspaceRunner = new GeneratedAppGate3WorkspaceRunner(configService);

function createPlans(appSpec = createAppSpec()) {
  const generationPlan = buildGenerationPlan(appSpec);
  const staticContracts = buildStaticContracts(appSpec, generationPlan);
  const workspace = workspaceRunner.buildWorkspaceContract({
    tenantId: 'tenant-test',
    appId: 'app-test',
    generationRunId: 'run-test',
    appSpec,
    staticContracts,
  });
  const commandPlan = workspaceRunner.buildCommandPlan({
    workspace,
    requirementIds: appSpec.coreRequirements.map(({ id }) => id),
    scenarioIds: appSpec.acceptanceScenarios.map(({ id }) => id),
  });
  const buildUnitPlan = buildBuildUnitPlan(
    appSpec,
    generationPlan,
    staticContracts,
    workspace,
    commandPlan,
    'fixture-execution',
  );
  return { appSpec, generationPlan, staticContracts, buildUnitPlan };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function issuesFor(
  checks: Array<{ id: string; issues: string[] }>,
  id: string,
): string[] {
  return checks.find((check) => check.id === id)?.issues ?? [];
}

describe('generation plan builder', () => {
  it.each([
    {
      name: '保存公开提交',
      dataPolicy: {
        publicSubmissionsPersisted: true,
        creatorCanDeleteSubmissions: false,
        endUserLoginRequired: true,
      },
    },
    {
      name: '不保存公开提交',
      dataPolicy: {
        publicSubmissionsPersisted: false,
        creatorCanDeleteSubmissions: true,
        endUserLoginRequired: false,
      },
    },
  ])('完整映射 AppSpec route/data/action：$name', ({ dataPolicy }) => {
    const appSpec = createAppSpec({ dataPolicy });
    const plan = buildGenerationPlan(appSpec);

    expect(plan.frontend.pages).toEqual([
      {
        pageId: 'page/home',
        name: '首页',
        purpose: '提交内容',
        route: '/page-home',
        requirementIds: ['req/alpha', 'req-beta'],
        scenarioIds: ['scenario-submit', 'scenario-report'],
      },
      {
        pageId: 'page-report',
        name: '报告页',
        purpose: '查看结果',
        route: '/report',
        requirementIds: ['req/alpha', 'req-beta'],
        scenarioIds: ['scenario-submit', 'scenario-report'],
      },
    ]);
    expect(plan.orchestration.steps).toEqual([
      {
        stepId: 'step-1-req-alpha',
        label: '实现 req/alpha',
        purpose: '收集表单内容',
        requirementIds: ['req/alpha'],
        scenarioIds: ['scenario-submit'],
      },
      {
        stepId: 'step-2-req-beta',
        label: '实现 req-beta',
        purpose: '生成结果报告',
        requirementIds: ['req-beta'],
        scenarioIds: ['scenario-report'],
      },
    ]);
    expect(plan.dataPersistence).toEqual({
      ...dataPolicy,
      tenantScoped: true,
      tokenSnapshotRequired: true,
      softDeleteRequired: true,
    });
    expect(plan.frontend.runtimeSurface.dataUseNoticeRequired).toBe(
      dataPolicy.publicSubmissionsPersisted,
    );
    expect(plan.traceability).toEqual([
      expect.objectContaining({
        requirementId: 'req/alpha',
        scenarioIds: ['scenario-submit'],
        pageIds: ['page/home', 'page-report'],
      }),
      expect.objectContaining({
        requirementId: 'req-beta',
        scenarioIds: ['scenario-report'],
        pageIds: ['page/home', 'page-report'],
      }),
    ]);
  });

  it('过滤 traceability 的未知场景，并在缺少 trace entry 时回退到 scenario requirementIds', () => {
    const appSpec = createAppSpec({
      traceability: [
        {
          requirementId: 'req/alpha',
          scenarioIds: ['scenario-submit', 'scenario-unknown'],
          evidenceIds: [],
        },
      ],
    });

    expect(
      buildGenerationPlan(appSpec).orchestration.steps.map((step) => ({
        requirementIds: step.requirementIds,
        scenarioIds: step.scenarioIds,
      })),
    ).toEqual([
      { requirementIds: ['req/alpha'], scenarioIds: ['scenario-submit'] },
      { requirementIds: ['req-beta'], scenarioIds: ['scenario-report'] },
    ]);
  });

  it.each([
    ['普通表单', '收集表单内容', false],
    ['问诊', '支持自动问诊', true],
    ['英文 API', '调用 External API', true],
    ['结构化', '执行结构化分析', true],
  ])('识别私有工具关键词：%s', (_name, text, expected) => {
    expect(requirementNeedsPrivatePluginTool(text)).toBe(expected);
  });

  it.each([
    {
      userGoal: '为患者提供中医问诊风险筛查',
      expected:
        '对问诊输入做租户私有的结构化整理、风险提示和下一步追问候选生成，不输出诊断、处方、剂量或治疗指令。',
    },
    {
      userGoal: '为公开提交执行量表评分',
      expected: '对公开提交输入执行租户私有的规则化评分、校验和结果解释生成。',
    },
    {
      userGoal: '转换公开输入',
      expected: '对公开提交输入执行租户私有的结构化转换、校验和追问建议生成。',
    },
  ])(
    '生成受硬门禁约束的 tool/plugin policy：$userGoal',
    ({ userGoal, expected }) => {
      const appSpec = createAppSpec({
        userGoal,
        coreRequirements: [{ id: 'req-tool', text: '使用插件逐步生成结果' }],
        acceptanceScenarios: [
          {
            id: 'scenario-tool',
            title: '调用工具',
            requirementIds: ['req-tool'],
            given: ['已有输入'],
            when: ['提交'],
            then: ['返回结果'],
          },
        ],
        traceability: [
          {
            requirementId: 'req-tool',
            scenarioIds: ['scenario-tool'],
            evidenceIds: [],
          },
        ],
      });
      const tool = buildGenerationPlan(appSpec).pluginTools.tools[0];

      expect(tool).toEqual({
        toolId: 'tool-guided-intake-analysis',
        purpose: expected,
        requirementIds: ['req-tool'],
        permissionNotes: [
          '租户私有生成插件，默认不发布到 Marketplace。',
          'manifest.permissions 必须为空数组；禁止隐式网络、存储、知识库或 LLM 权限。',
          '仅处理本次 public-runtime-submission 的结构化输入，输出追问、评分或摘要建议。',
          '必须通过 manifest 校验、插件构建、签名/验签、权限审计、WASM/Extism sandbox smoke test 和生成安全扫描后才可自动激活。',
          '覆盖验收场景：scenario-tool。',
        ],
        activationPolicy: {
          scope: 'tenant-private',
          autoActivateAfterHardGates: true,
          requiredHardGates: [
            'manifest-validation',
            'build',
            'signature-verification',
            'permission-policy',
            'sandbox-smoke',
            'generation-safety-scan',
          ],
        },
      });
    },
  );

  it('无工具需求时提供明确 emptyReason，工具没有场景时不伪造场景说明', () => {
    const noToolPlan = buildGenerationPlan(createAppSpec());
    expect(noToolPlan.pluginTools).toEqual({
      tools: [],
      emptyReason:
        '当前 AppSpec 未声明需要平台现有能力之外的私有插件或外部工具；后续 Gate 2-4 可在发现缺口时补充受控插件计划。',
      permissionPolicy: [
        '插件/工具必须显式声明权限。',
        '未通过 manifest、构建、签名、权限审计和 sandbox smoke test 前不得绑定到 Agent/Workflow。',
        '生成插件默认只能自动激活为当前租户私有资源，不能自动发布到 Marketplace。',
        '禁止隐式放开网络、存储、知识库或 LLM 权限。',
      ],
    });

    const appSpec = createAppSpec({
      coreRequirements: [{ id: 'req-tool', text: '调用 API' }],
      acceptanceScenarios: [],
      traceability: [],
    });
    expect(
      buildPluginToolPlan(appSpec, new Map())[0]?.permissionNotes,
    ).toHaveLength(4);
  });

  it('只在 retry 时保留完整修复 context 并增加修复证据', () => {
    const repairContext: GeneratedAppGenerationRepairContext = {
      source: 'previous-failed-repair-attempt',
      sourceGenerationRunId: 'run-previous',
      sourceRepairAttemptId: 'repair-previous',
      targetGateId: 'gate-3',
      attemptNumber: 2,
      status: 'failed',
      failureSummary: '构建失败',
      changeSummary: null,
      verificationSummary: null,
      repairPlan: null,
      reverificationPlan: null,
      capturedAt: '2026-08-11T00:00:00.000Z',
    };
    const withoutRepair = buildGenerationPlan(createAppSpec());
    const withRepair = buildGenerationPlan(createAppSpec(), repairContext);

    expect(withoutRepair).not.toHaveProperty('repairContext');
    expect(withRepair.repairContext).toEqual(repairContext);
    expect(
      withRepair.traceability.every((entry) =>
        entry.planEvidenceIds.includes('gate-1-retry-repair-context'),
      ),
    ).toBe(true);
  });

  it('静态合约保留 route、数据、action、tool 和顺序边的完整绑定', () => {
    const appSpec = createAppSpec({
      coreRequirements: [
        { id: 'req-one', text: '调用工具评分' },
        { id: 'req-two', text: '显示报告' },
      ],
    });
    const plan = buildGenerationPlan(appSpec);
    const contracts = buildStaticContracts(appSpec, plan);

    expect(contracts.frontendRoutes).toEqual(
      plan.frontend.pages.map((page) => ({
        pageId: page.pageId,
        name: page.name,
        route: page.route,
        requirementIds: page.requirementIds,
        scenarioIds: page.scenarioIds,
      })),
    );
    expect(contracts.orchestration.edges).toEqual([
      {
        fromNodeId: 'node-step-1-req-one',
        toNodeId: 'node-step-2-req-two',
      },
    ]);
    expect(contracts.pluginToolPermissions.tools[0]).toEqual(
      expect.objectContaining({
        toolId: 'tool-guided-intake-analysis',
        manifestRequired: true,
        sandboxSmokeTestRequired: true,
      }),
    );
    expect(contracts.submissionPersistence.fields).toEqual([
      'input',
      'result',
      'report',
      'errorMessage',
      'anonymousSessionId',
      'publicShareToken',
    ]);
  });

  it('BuildUnitPlan 使用 command plan 优先级，并在命令缺失时使用受控默认值', () => {
    const { appSpec, generationPlan, staticContracts, buildUnitPlan } =
      createPlans();
    expect(buildUnitPlan.frontendBuild.command).toBe(
      'node scripts/gate3-build.mjs',
    );
    expect(buildUnitPlan.typecheck.command).toBe(
      'node scripts/gate3-typecheck.mjs',
    );
    expect(buildUnitPlan.unitTests.command).toBe('node scripts/gate3-unit.mjs');
    expect(buildUnitPlan.componentGoldenTests.command).toBe(
      'node scripts/gate3-component-golden.mjs',
    );

    const fallback = buildBuildUnitPlan(
      appSpec,
      generationPlan,
      staticContracts,
      buildUnitPlan.generationWorkspace!,
      [],
      'contract-skeleton',
    );
    expect({
      executionLevel: fallback.executionLevel,
      commands: [
        fallback.frontendBuild.command,
        fallback.typecheck.command,
        fallback.unitTests.command,
        fallback.componentGoldenTests.command,
      ],
      commandPlan: fallback.commandPlan,
      pluginEmptyReason: fallback.pluginBuildExpectations.emptyReason,
    }).toEqual({
      executionLevel: 'contract-skeleton',
      commands: [
        'agentloom generated-app gate-3 build-and-unit',
        'agentloom generated-app gate-3 typecheck',
        'agentloom generated-app gate-3 unit-tests',
        'agentloom generated-app gate-3 component-golden',
      ],
      commandPlan: [],
      pluginEmptyReason:
        '当前 generationPlan.pluginTools 未声明私有插件；Gate 3 不需要执行插件构建，但仍保留插件构建期望空原因。',
    });
  });
});

describe('Gate 1 generation plan behavior validation', () => {
  it('接受 builder 产出的完整计划，并返回完整通过结果', () => {
    const appSpec = createAppSpec();
    const result = evaluateGate1GenerationPlan(
      appSpec,
      buildGenerationPlan(appSpec),
    );
    expect(result).toEqual({
      status: 'passed',
      summary:
        'Gate 1 通过：generationPlan 已覆盖 AppSpec 页面、Agent/Workflow 编排、插件/工具策略、数据持久化、Gate 2-7 测试计划和需求 traceability。',
      evidence: expect.arrayContaining([
        expect.objectContaining({
          id: 'gate-1-app-spec-version',
          kind: 'plan',
        }),
        expect.objectContaining({
          id: 'gate-1-retry-repair-context',
          kind: 'plan',
        }),
      ]),
      failure: null,
      repairInstructions: null,
    });
    expect(result.evidence).toHaveLength(8);
  });

  it('报告 route/data/action/tool/policy、未知引用和重复缺口的完整问题集合', () => {
    const appSpec = createAppSpec();
    const plan = clone(
      buildGenerationPlan(appSpec),
    ) as GeneratedAppGenerationPlan;
    plan.appSpecVersion = 2;
    plan.frontend.pages = [
      {
        ...plan.frontend.pages[0]!,
        route: '',
        requirementIds: [],
        scenarioIds: [],
      },
      {
        ...plan.frontend.pages[1]!,
        requirementIds: ['req-unknown'],
        scenarioIds: ['scenario-unknown'],
      },
    ];
    plan.frontend.runtimeSurface.dataUseNoticeRequired = false;
    plan.orchestration.steps = [
      {
        ...plan.orchestration.steps[0]!,
        requirementIds: ['req-unknown'],
        scenarioIds: ['scenario-unknown'],
      },
    ];
    plan.orchestration.inputContract.scenarioIds = [];
    plan.orchestration.outputContract.destinations = [];
    plan.pluginTools.emptyReason = null;
    plan.pluginTools.permissionPolicy = [];
    plan.dataPersistence = {
      publicSubmissionsPersisted: false,
      creatorCanDeleteSubmissions: false,
      endUserLoginRequired: true,
      tenantScoped: false,
      tokenSnapshotRequired: false,
      softDeleteRequired: false,
    };
    plan.testGates = {
      blockingGateIds: [],
      gatePlan: [],
      acceptanceScenarioIds: [],
    };
    plan.traceability = [
      {
        requirementId: 'req/alpha',
        scenarioIds: [],
        pageIds: [],
        orchestrationStepIds: [],
        planEvidenceIds: [],
      },
      {
        requirementId: 'req-beta',
        scenarioIds: ['scenario-unknown'],
        pageIds: ['page-unknown'],
        orchestrationStepIds: ['step-unknown'],
        planEvidenceIds: ['evidence-unknown'],
      },
    ];

    const checks = buildGate1Checks(appSpec, plan);
    expect(issuesFor(checks, 'app-spec-version')).toEqual([
      'appSpecVersion=2 与 AppSpec version=1 不一致',
    ]);
    expect(issuesFor(checks, 'frontend-plan')).toEqual([
      'frontend.pages[0].route 缺失',
      'frontend.pages[0].requirementIds 不能为空',
      'frontend.pages[0].scenarioIds 不能为空',
      'frontend.pages[1].requirementIds 引用了未知需求 req-unknown',
      'frontend.pages[1].scenarioIds 引用了未知场景 scenario-unknown',
      'runtimeSurface.dataUseNoticeRequired 与 AppSpec 数据保存策略不一致',
    ]);
    expect(issuesFor(checks, 'orchestration-plan')).toEqual([
      '需求 req/alpha 未映射到 orchestration step',
      '需求 req-beta 未映射到 orchestration step',
      'orchestration.steps[0].requirementIds 引用了未知需求 req-unknown',
      'orchestration.steps[0].scenarioIds 引用了未知场景 scenario-unknown',
      'inputContract.scenarioIds 不能为空',
      'outputContract.destinations 不能为空',
    ]);
    expect(issuesFor(checks, 'plugin-tool-plan')).toEqual([
      '插件/工具计划为空时必须给出 emptyReason',
      'permissionPolicy 不能为空',
    ]);
    expect(issuesFor(checks, 'data-persistence-plan')).toHaveLength(6);
    expect(issuesFor(checks, 'test-gate-plan')).toHaveLength(14);
    expect(issuesFor(checks, 'traceability')).toEqual([
      '需求 req/alpha 缺少 scenarioIds',
      '需求 req/alpha 缺少 pageIds',
      '需求 req/alpha 缺少 orchestrationStepIds',
      '需求 req/alpha 缺少 planEvidenceIds',
      '需求 req-beta 引用了未知场景 scenario-unknown',
      '需求 req-beta 引用了未知页面 page-unknown',
      '需求 req-beta 引用了未知编排步骤 step-unknown',
      '需求 req-beta 引用了未知计划证据 evidence-unknown',
    ]);
    expect(evaluateGate1GenerationPlan(appSpec, plan)).toEqual(
      expect.objectContaining({
        status: 'failed',
        failure: expect.objectContaining({
          code: 'generation-plan-incomplete',
        }),
      }),
    );
  });

  it('区分空 orchestration、缺失 traceability 和每个无效 repair context 字段', () => {
    const appSpec = createAppSpec();
    const plan = clone(
      buildGenerationPlan(appSpec),
    ) as GeneratedAppGenerationPlan;
    plan.orchestration.steps = [];
    plan.traceability = [];
    plan.repairContext = {
      source: 'invalid',
      sourceGenerationRunId: '',
      sourceRepairAttemptId: '',
      targetGateId: 'gate-99',
      attemptNumber: 0,
      status: 'running',
      failureSummary: '',
      repairPlan: 'invalid',
      reverificationPlan: 'invalid',
      capturedAt: '',
    } as unknown as GeneratedAppGenerationRepairContext;
    const checks = buildGate1Checks(appSpec, plan);

    expect(issuesFor(checks, 'orchestration-plan')).toEqual([
      'orchestration.steps 不能为空',
      '需求 req/alpha 未映射到 orchestration step',
      '需求 req-beta 未映射到 orchestration step',
    ]);
    expect(issuesFor(checks, 'traceability')).toEqual([
      '需求 req/alpha 缺少 plan traceability',
      '需求 req-beta 缺少 plan traceability',
    ]);
    expect(issuesFor(checks, 'retry-repair-context')).toEqual([
      'repairContext.source 必须为 previous-failed-repair-attempt',
      'repairContext.sourceGenerationRunId 缺失',
      'repairContext.sourceRepairAttemptId 缺失',
      'repairContext.targetGateId 必须指向 Gate 0-7',
      'repairContext.attemptNumber 必须为正整数',
      'repairContext.status 必须为 failed',
      'repairContext.failureSummary 缺失',
      'repairContext.repairPlan 必须为对象或 null',
      'repairContext.reverificationPlan 必须为对象或 null',
      'repairContext.capturedAt 缺失',
    ]);
  });
});

describe('Gate 2 static contract behavior validation', () => {
  it('拒绝非对象并保留单一结构错误', () => {
    const { appSpec, generationPlan } = createPlans();
    expect(buildGate2Checks(appSpec, generationPlan, null)).toEqual([
      {
        id: 'static-contracts-object',
        label: 'StaticContracts JSON 对象',
        passed: false,
        summary: '检查 generationPlan.staticContracts 是否为结构化 JSON 对象。',
        issues: ['staticContracts 不是对象'],
      },
    ]);
  });

  it.each([
    ['contractVersion', 2, 'contractVersion 必须为 1'],
    ['appSpecVersion', 2, 'appSpecVersion=2 与 AppSpec version=1 不一致'],
    [
      'generationPlanVersion',
      2,
      'generationPlanVersion=2 与 generationPlan.planVersion=1 不一致',
    ],
  ] as const)('报告版本绑定错误：%s', (field, value, issue) => {
    const { appSpec, generationPlan, staticContracts } = createPlans();
    const invalid = clone(staticContracts) as unknown as Record<
      string,
      unknown
    >;
    invalid[field] = value;
    expect(
      issuesFor(
        buildGate2Checks(appSpec, generationPlan, invalid),
        'version-binding',
      ),
    ).toEqual([issue]);
  });

  it('报告 public runtime 输入输出和数据策略的完整错误', () => {
    const { appSpec, generationPlan, staticContracts } = createPlans();
    const invalid = clone(staticContracts) as unknown as Record<
      string,
      unknown
    >;
    invalid.publicRuntime = { input: {}, output: {} };
    expect(
      issuesFor(
        buildGate2Checks(appSpec, generationPlan, invalid),
        'public-runtime-contract',
      ),
    ).toEqual([
      'publicRuntime.input.source 与 orchestration inputContract 不一致',
      'publicRuntime.input.requiredFields 缺少 input',
      'publicRuntime.input.requiredFields 不能为空',
      'publicRuntime.input.scenarioIds 缺少 scenario-submit',
      'publicRuntime.input.scenarioIds 缺少 scenario-report',
      'publicRuntime.input.dataUseNoticeRequired 与 AppSpec 数据保存策略不一致',
      'publicRuntime.input.anonymousSessionRequired 必须为 true',
      'publicRuntime.input.endUserLoginRequired 与 AppSpec 登录策略不一致',
      'publicRuntime.output.destinations 缺少 public-runtime-report',
      'publicRuntime.output.destinations 缺少 creator-submission-detail',
      'publicRuntime.output.destinations 不能为空',
      'publicRuntime.output.reportRequired 与 orchestration outputContract 不一致',
      'publicRuntime.output.errorStateRequired 必须为 true',
    ]);
  });

  it('报告 route 缺失、未知页面、未知需求和未知场景', () => {
    const { appSpec, generationPlan, staticContracts } = createPlans();
    const invalid = clone(staticContracts);
    invalid.frontendRoutes = [
      { pageId: '', name: '', route: '', requirementIds: [], scenarioIds: [] },
      {
        pageId: 'page-unknown',
        name: '未知',
        route: '/unknown',
        requirementIds: ['req-unknown'],
        scenarioIds: ['scenario-unknown'],
      },
    ];
    expect(
      issuesFor(
        buildGate2Checks(appSpec, generationPlan, invalid),
        'frontend-route-contract',
      ),
    ).toEqual([
      '页面 page/home 缺少 frontend route contract',
      '页面 page-report 缺少 frontend route contract',
      'frontendRoutes[0].pageId 缺失',
      'frontendRoutes[0].route 缺失',
      'frontendRoutes[1].pageId 引用了未知页面 page-unknown',
      'frontendRoutes[1].requirementIds 引用了未知对象 req-unknown',
      'frontendRoutes[1].scenarioIds 引用了未知对象 scenario-unknown',
    ]);
  });

  it('报告 action/orchestration 节点缺失、重复、未知边和环', () => {
    const { appSpec, generationPlan, staticContracts } = createPlans();
    const invalid = clone(staticContracts);
    invalid.orchestration.target = 'agent' as never;
    invalid.orchestration.strategy = 'unknown' as never;
    invalid.orchestration.nodes = [
      {
        nodeId: 'node-a',
        stepId: 'step-unknown',
        label: '',
        requirementIds: ['req-unknown'],
        scenarioIds: ['scenario-unknown'],
        inputHandle: '',
        outputHandle: '',
      },
      {
        nodeId: 'node-a',
        stepId: '',
        label: '',
        requirementIds: [],
        scenarioIds: [],
        inputHandle: 'input',
        outputHandle: 'output',
      },
    ];
    invalid.orchestration.edges = [
      { fromNodeId: 'node-a', toNodeId: 'node-a' },
      { fromNodeId: 'node-missing', toNodeId: 'node-missing' },
    ];
    const issues = issuesFor(
      buildGate2Checks(appSpec, generationPlan, invalid),
      'orchestration-contract',
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        'orchestration.target 与 generationPlan 不一致',
        'orchestration.strategy 与 generationPlan 不一致',
        '编排步骤 step-1-req-alpha 缺少 orchestration node',
        '编排步骤 step-2-req-beta 缺少 orchestration node',
        'orchestration.nodes[0].stepId 引用了未知编排步骤 step-unknown',
        'orchestration.nodes[0].inputHandle 缺失',
        'orchestration.nodes[0].outputHandle 缺失',
        'orchestration.nodes[0].requirementIds 引用了未知对象 req-unknown',
        'orchestration.nodes[0].scenarioIds 引用了未知对象 scenario-unknown',
        'orchestration.nodes[1].stepId 缺失',
        'orchestration.nodes.nodeId 存在重复值 node-a',
        'orchestration.edges[1].fromNodeId 引用了未知节点',
        'orchestration.edges[1].toNodeId 引用了未知节点',
        'orchestration.edges 必须形成 DAG，不能存在环',
      ]),
    );
    expect(issues).toHaveLength(14);
  });

  it('报告 plugin policy 的缺失、未知工具、权限和硬门禁问题', () => {
    const appSpec = createAppSpec({
      coreRequirements: [{ id: 'req-tool', text: '调用 API 评分' }],
      acceptanceScenarios: [
        {
          id: 'scenario-tool',
          title: '工具',
          requirementIds: ['req-tool'],
          given: [],
          when: [],
          then: [],
        },
      ],
      traceability: [
        {
          requirementId: 'req-tool',
          scenarioIds: ['scenario-tool'],
          evidenceIds: [],
        },
      ],
    });
    const generationPlan = buildGenerationPlan(appSpec);
    const invalid = buildStaticContracts(appSpec, generationPlan);
    invalid.pluginToolPermissions = {
      implicitPermissionsAllowed: true,
      permissionPolicy: [],
      emptyReason: null,
      tools: [
        {
          toolId: '',
          purpose: '',
          requirementIds: [],
          permissions: [],
          manifestRequired: false,
          sandboxSmokeTestRequired: false,
        },
        {
          toolId: 'tool-unknown',
          purpose: '未知',
          requirementIds: ['req-unknown'],
          permissions: ['x'],
          manifestRequired: true,
          sandboxSmokeTestRequired: true,
        },
      ],
    } as never;
    const issues = issuesFor(
      buildGate2Checks(appSpec, generationPlan, invalid),
      'plugin-permission-contract',
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        'implicitPermissionsAllowed 必须为 false',
        'permissionPolicy 不能为空',
        '插件/工具 tool-guided-intake-analysis 缺少权限合约',
        'pluginToolPermissions.tools[0].toolId 缺失',
        'pluginToolPermissions.tools[0].purpose 缺失',
        'pluginToolPermissions.tools[0].permissions 不能为空',
        'pluginToolPermissions.tools[0].manifestRequired 必须为 true',
        'pluginToolPermissions.tools[0].sandboxSmokeTestRequired 必须为 true',
        'pluginToolPermissions.tools[1].toolId 引用了未知插件/工具 tool-unknown',
        'pluginToolPermissions.tools[1].requirementIds 引用了未知对象 req-unknown',
      ]),
    );
    expect(issues).toHaveLength(10);
  });

  it.each([
    [
      'submission-persistence-contract',
      (value: GeneratedAppStaticContracts) => {
        value.submissionPersistence = {} as never;
      },
    ],
    [
      'test-entry-contract',
      (value: GeneratedAppStaticContracts) => {
        value.testEntry = {} as never;
      },
    ],
    [
      'traceability-contract',
      (value: GeneratedAppStaticContracts) => {
        value.traceability = [];
      },
    ],
  ] as const)('完整报告空合约段：%s', (checkId, mutate) => {
    const { appSpec, generationPlan, staticContracts } = createPlans();
    const invalid = clone(staticContracts);
    mutate(invalid);
    const issues = issuesFor(
      buildGate2Checks(appSpec, generationPlan, invalid),
      checkId,
    );
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((issue) => issue.length > 0)).toBe(true);
  });

  it('evaluateGate2StaticContracts 汇总失败 check 和 evidence', () => {
    const { appSpec, generationPlan } = createPlans();
    const result = evaluateGate2StaticContracts(appSpec, generationPlan, {});
    expect(result.status).toBe('failed');
    expect(result.failure).toEqual(
      expect.objectContaining({ code: 'static-contracts-incomplete' }),
    );
    expect(result.evidence).toHaveLength(8);
    expect(
      result.evidence.every((item) => item.summary.includes('缺口：')),
    ).toBe(true);
  });
});

describe('Gate 3 build unit behavior validation', () => {
  it('拒绝非对象，并接受全部四种 execution level', () => {
    const { appSpec, generationPlan, staticContracts, buildUnitPlan } =
      createPlans();
    expect(
      buildGate3Checks(appSpec, generationPlan, staticContracts, null),
    ).toEqual([
      {
        id: 'build-unit-plan-object',
        label: 'BuildUnitPlan JSON 对象',
        passed: false,
        summary: '检查 generationPlan.buildUnitPlan 是否为结构化 JSON 对象。',
        issues: ['buildUnitPlan 不是对象'],
      },
    ]);
    for (const executionLevel of [
      'contract-skeleton',
      'real-local-command-plan',
      'fixture-execution',
      'disabled-execution',
    ] as const) {
      const value = { ...buildUnitPlan, executionLevel };
      expect(
        issuesFor(
          buildGate3Checks(appSpec, generationPlan, staticContracts, value),
          'build-unit-plan-version',
        ),
      ).toEqual([]);
    }
  });

  it('报告版本和非法 execution level', () => {
    const { appSpec, generationPlan, staticContracts, buildUnitPlan } =
      createPlans();
    const invalid = {
      ...buildUnitPlan,
      planVersion: 2,
      appSpecVersion: 2,
      generationPlanVersion: 2,
      staticContractsVersion: 2,
      executionLevel: 'remote',
    };
    expect(
      issuesFor(
        buildGate3Checks(appSpec, generationPlan, staticContracts, invalid),
        'build-unit-plan-version',
      ),
    ).toEqual([
      'planVersion 必须为 1',
      'appSpecVersion=2 与 AppSpec version=1 不一致',
      'generationPlanVersion=2 与 generationPlan.planVersion=1 不一致',
      'staticContractsVersion=2 与 staticContracts.contractVersion=1 不一致',
      'executionLevel 必须为 contract-skeleton | real-local-command-plan | fixture-execution | disabled-execution 之一',
    ]);
  });

  it('报告 workspace 安全路径、materialized source、write policy 和 artifact path', () => {
    const { appSpec, generationPlan, staticContracts, buildUnitPlan } =
      createPlans();
    const invalid = clone(buildUnitPlan);
    invalid.generationWorkspace = {
      contractVersion: 2,
      storageKind: 'invalid',
      rootLabel: 'invalid',
      workspaceId: '',
      relativePath: '../escape',
      scaffold: 'invalid',
      materializedFrom: { appSpecVersion: 2, staticContractsVersion: 2 },
      writePolicy: {
        arbitraryPathWriteAllowed: true,
        traversalGuard: 'none',
        exposesAbsoluteHostPath: true,
      },
      files: [
        {
          path: '/etc/passwd',
          kind: 'source',
          derivedFrom: 'x',
          required: true,
        },
      ],
      artifactPaths: {},
    } as never;
    const issues = issuesFor(
      buildGate3Checks(appSpec, generationPlan, staticContracts, invalid),
      'generation-workspace-contract',
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        'generationWorkspace.contractVersion 必须为 1',
        'generationWorkspace.storageKind 必须为 server-controlled-local-workspace',
        'generationWorkspace.rootLabel 必须为 generated-app-workspaces',
        'generationWorkspace.workspaceId 缺失',
        'generationWorkspace.relativePath 不能包含空路径段、. 或 .. traversal',
        'generationWorkspace.scaffold 必须为 react-vite-typescript',
        'generationWorkspace.materializedFrom.appSpecVersion=2 与 AppSpec version=1 不一致',
        'generationWorkspace.materializedFrom.staticContractsVersion=2 与 staticContracts.contractVersion=1 不一致',
        'generationWorkspace.writePolicy.arbitraryPathWriteAllowed 必须为 false',
        'generationWorkspace.writePolicy.traversalGuard 必须为 resolve-inside-workspace-root',
        'generationWorkspace.writePolicy.exposesAbsoluteHostPath 必须为 false',
        'generationWorkspace.files[0].path 必须是 workspace 相对路径且不能是绝对路径',
        'generationWorkspace.artifactPaths.sourceManifest 缺失',
        'generationWorkspace.artifactPaths.coverageSummary 缺失',
      ]),
    );
    expect(issues.length).toBeGreaterThan(25);
  });

  it('报告 command 重复、未知命令、非受控命令、路径和引用错误', () => {
    const { appSpec, generationPlan, staticContracts, buildUnitPlan } =
      createPlans();
    const invalid = clone(buildUnitPlan);
    invalid.commandPlan = [
      {
        commandId: 'gate-3-frontend-build-command',
        command: 'rm -rf /',
        workingDirectory: '../escape',
        requirementIds: ['req-unknown'],
        scenarioIds: ['scenario-unknown'],
        producesArtifactIds: [],
      },
      {
        commandId: 'gate-3-frontend-build-command',
        command: '',
        workingDirectory: '',
        requirementIds: [],
        scenarioIds: [],
        producesArtifactIds: [],
      },
      {
        commandId: 'command-unknown',
        command: 'echo unsafe',
        workingDirectory: invalid.generationWorkspace!.relativePath,
        requirementIds: [],
        scenarioIds: [],
        producesArtifactIds: ['x'],
      },
    ];
    const issues = issuesFor(
      buildGate3Checks(appSpec, generationPlan, staticContracts, invalid),
      'command-plan',
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        'commandPlan.commandId 存在重复值 gate-3-frontend-build-command',
        'commandPlan.commandId 引用了未知对象 command-unknown',
        'commandPlan[0].command 必须为受控命令 node scripts/gate3-build.mjs',
        'commandPlan[0].workingDirectory 不能包含空路径段、. 或 .. traversal',
        'commandPlan[0].producesArtifactIds 不能为空',
        'commandPlan[0].requirementIds 引用了未知对象 req-unknown',
        'commandPlan[0].scenarioIds 引用了未知对象 scenario-unknown',
        'commandPlan[1].command 缺失',
        'commandPlan[1].workingDirectory 缺失',
      ]),
    );
  });

  it.each([
    ['frontend-build-command', 'frontendBuild'],
    ['typecheck-command', 'typecheck'],
    ['unit-test-command', 'unitTests'],
    ['component-golden-test-entry', 'componentGoldenTests'],
    ['artifact-expectations', 'artifactExpectations'],
    ['static-contracts-coverage', 'staticContractsCoverage'],
    ['acceptance-scenario-coverage', 'acceptanceScenarioCoverage'],
    ['failure-capture-fields', 'failureCaptureFields'],
  ] as const)('报告缺失的 Gate 3 contract section：%s', (checkId, field) => {
    const { appSpec, generationPlan, staticContracts, buildUnitPlan } =
      createPlans();
    const invalid = clone(buildUnitPlan) as unknown as Record<string, unknown>;
    invalid[field] = Array.isArray(invalid[field]) ? [] : {};
    const issues = issuesFor(
      buildGate3Checks(appSpec, generationPlan, staticContracts, invalid),
      checkId,
    );
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((issue) => issue.length > 0)).toBe(true);
  });

  it('报告 artifact 重复、未知 kind、安全路径和 required policy', () => {
    const { appSpec, generationPlan, staticContracts, buildUnitPlan } =
      createPlans();
    const invalid = clone(buildUnitPlan);
    invalid.artifactExpectations = [
      {
        artifactId: 'frontend-build-output',
        kind: 'unknown' as never,
        path: '../escape',
        required: false,
      },
      {
        artifactId: 'frontend-build-output',
        kind: 'frontend_build',
        path: '',
        required: true,
      },
      {
        artifactId: 'artifact-unknown',
        kind: 'frontend_build',
        path: '/absolute',
        required: true,
      },
    ];
    const issues = issuesFor(
      buildGate3Checks(appSpec, generationPlan, staticContracts, invalid),
      'artifact-expectations',
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        'artifactExpectations.artifactId 存在重复值 frontend-build-output',
        'artifactExpectations.artifactId 引用了未知对象 artifact-unknown',
        'artifactExpectations[0].kind 必须是 frontend_build | unit_test_report | component_golden_report | coverage_report | plugin_bundle 之一',
        'artifactExpectations[0].path 不能包含空路径段、. 或 .. traversal',
        'artifactExpectations[0].required 必须为 true',
        'artifactExpectations[1].path 缺失',
        'artifactExpectations[2].path 必须是 workspace 相对路径且不能是绝对路径',
      ]),
    );
  });

  it('报告有插件时的 tool build、路径、命令、activation policy 和 requirement 问题', () => {
    const appSpec = createAppSpec({
      coreRequirements: [{ id: 'req-tool', text: '调用 API 评分' }],
      acceptanceScenarios: [
        {
          id: 'scenario-tool',
          title: '工具',
          requirementIds: ['req-tool'],
          given: [],
          when: [],
          then: [],
        },
      ],
      traceability: [
        {
          requirementId: 'req-tool',
          scenarioIds: ['scenario-tool'],
          evidenceIds: [],
        },
      ],
    });
    const plans = createPlans(appSpec);
    const invalid = clone(plans.buildUnitPlan);
    invalid.pluginBuildExpectations.emptyReason = '不应存在';
    invalid.pluginBuildExpectations.tools = [
      {
        toolId: 'tool-unknown',
        command: 'unsafe',
        manifestPath: '../manifest',
        nodeDefinitionsPath: '',
        sourcePath: '/source',
        smokeFixturePath: '',
        buildReportPath: '../report',
        artifactPath: '',
        goldenTestCommand: 'unsafe',
        requirementIds: ['req-unknown'],
        activationPolicy: {
          scope: 'marketplace' as never,
          autoActivateAfterHardGates: false,
          requiredHardGates: [],
        },
      },
    ];
    const issues = issuesFor(
      buildGate3Checks(
        appSpec,
        plans.generationPlan,
        plans.staticContracts,
        invalid,
      ),
      'plugin-build-expectations',
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        '有插件计划时 pluginBuildExpectations.emptyReason 必须为 null',
        '插件/工具 tool-guided-intake-analysis 缺少 Gate 3 构建期望',
        'pluginBuildExpectations.tools[0].toolId 引用了未知插件/工具 tool-unknown',
        'pluginBuildExpectations.tools[0].command 必须为受控命令 node scripts/gate3-plugin-build.mjs',
        'pluginBuildExpectations.tools[0].manifestPath 不能包含空路径段、. 或 .. traversal',
        'pluginBuildExpectations.tools[0].nodeDefinitionsPath 缺失',
        'pluginBuildExpectations.tools[0].sourcePath 必须是 workspace 相对路径且不能是绝对路径',
        'pluginBuildExpectations.tools[0].smokeFixturePath 缺失',
        'pluginBuildExpectations.tools[0].buildReportPath 不能包含空路径段、. 或 .. traversal',
        'pluginBuildExpectations.tools[0].artifactPath 缺失',
        'pluginBuildExpectations.tools[0].goldenTestCommand 必须为受控命令 node scripts/gate3-plugin-build.mjs',
        'pluginBuildExpectations.tools[0].requirementIds 引用了未知对象 req-unknown',
      ]),
    );
  });

  it('无插件时拒绝工具构建并要求 empty reason', () => {
    const { appSpec, generationPlan, staticContracts, buildUnitPlan } =
      createPlans();
    const invalid = clone(buildUnitPlan);
    invalid.pluginBuildExpectations = {
      tools: [{ toolId: 'tool-unplanned' } as never],
      emptyReason: null,
    };
    expect(
      issuesFor(
        buildGate3Checks(appSpec, generationPlan, staticContracts, invalid),
        'plugin-build-expectations',
      ),
    ).toEqual(
      expect.arrayContaining([
        '无插件计划时 pluginBuildExpectations.tools 必须为空',
        '无插件计划时 pluginBuildExpectations.emptyReason 必须说明原因',
        'pluginBuildExpectations.tools[0].toolId 引用了未知插件/工具 tool-unplanned',
      ]),
    );
  });

  it('evaluateGate3BuildUnitPlan 汇总失败问题，并对完整计划返回通过', () => {
    const { appSpec, generationPlan, staticContracts, buildUnitPlan } =
      createPlans();
    expect(
      evaluateGate3BuildUnitPlan(
        appSpec,
        generationPlan,
        staticContracts,
        buildUnitPlan,
      ),
    ).toEqual(
      expect.objectContaining({
        status: 'passed',
        failure: null,
        repairInstructions: null,
      }),
    );
    const invalid = { ...buildUnitPlan, executionLevel: 'invalid' };
    const failed = evaluateGate3BuildUnitPlan(
      appSpec,
      generationPlan,
      staticContracts,
      invalid,
    );
    expect(failed).toEqual(
      expect.objectContaining({
        status: 'failed',
        failure: expect.objectContaining({
          code: 'build-unit-plan-incomplete',
        }),
      }),
    );
    expect(failed.evidence).toHaveLength(12);
    expect(
      failed.evidence.find(({ id }) => id === 'gate-3-build-unit-plan-version')
        ?.summary,
    ).toContain('缺口：');
  });
});
