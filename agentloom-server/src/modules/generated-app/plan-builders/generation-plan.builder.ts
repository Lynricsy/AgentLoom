import type {
  GeneratedApp,
  GeneratedAppBrowserAcceptancePlan,
  GeneratedAppBuildUnitPlan,
  GeneratedAppGateEvidence,
  GeneratedAppGateResult,
  GeneratedAppGateRunFailure,
  GeneratedAppGenerationPlan,
  GeneratedAppGenerationRepairContext,
  GeneratedAppIndependentVerificationPlan,
  GeneratedAppIntegrationPlan,
  GeneratedAppPublishCandidatePlan,
  GeneratedAppSpec,
  GeneratedAppStaticContracts,
  GeneratedAppReadiness,
  GeneratedAppStatus,
} from '../../../database/schema';

import type {
  GeneratedAppGate3CommandPlan,
  GeneratedAppGenerationWorkspaceContract,
} from '../generated-app.workspace';

import {
  buildPlanRoute,
  buildPlanSegment,
} from '../generated-app.app-spec.util';
import { getGeneratedAppGateDefinition } from '../generated-app.gates';

import {
  isRecord,
  getRecord,
  getRecordArray,
  getStringArray,
  getNonEmptyString,
  requireRecord,
  buildMissingItemsIssues,
  buildUnknownReferenceIssues,
  buildDuplicateItemIssues,
  buildSafeRelativePathIssues,
  buildControlledCommandIssues,
  buildPluginActivationPolicyIssues,
  collectSensitiveTokenIssues,
  isSensitiveTokenLike,
  formatIssueValue,
  buildBooleanMirrorIssue,
  isAcyclicGraph,
  isNonEmptyString,
  GENERATED_APP_PRIVATE_PLUGIN_HARD_GATES,
} from '../generated-app.plan-validation.util';

export interface Gate1Check {
  id: string;
  label: string;
  passed: boolean;
  summary: string;
  issues: string[];
}

export interface Gate1Evaluation {
  status: 'passed' | 'failed';
  summary: string;
  evidence: GeneratedAppGateEvidence[];
  failure: GeneratedAppGateRunFailure | null;
  repairInstructions: string | null;
}

export interface Gate2Check {
  id: string;
  label: string;
  passed: boolean;
  summary: string;
  issues: string[];
}

export interface Gate2Evaluation {
  status: 'passed' | 'failed';
  summary: string;
  evidence: GeneratedAppGateEvidence[];
  failure: GeneratedAppGateRunFailure | null;
  repairInstructions: string | null;
}

export interface Gate3Check {
  id: string;
  label: string;
  passed: boolean;
  summary: string;
  issues: string[];
}

export interface Gate3Evaluation {
  status: 'passed' | 'failed';
  summary: string;
  evidence: GeneratedAppGateEvidence[];
  failure: GeneratedAppGateRunFailure | null;
  repairInstructions: string | null;
}

export const GATE_2_STATIC_CONTRACT_IDS = [
  'gate-2-public-runtime-contract',
  'gate-2-frontend-route-contract',
  'gate-2-orchestration-contract',
  'gate-2-plugin-permission-contract',
  'gate-2-submission-persistence-contract',
  'gate-2-test-entry-contract',
  'gate-2-traceability-contract',
] as const;

export const GATE_3_CORE_ARTIFACT_IDS = [
  'frontend-build-output',
  'unit-test-report',
  'component-golden-report',
  'coverage-report',
] as const;

export const GATE_3_ARTIFACT_KINDS = [
  'frontend_build',
  'unit_test_report',
  'component_golden_report',
  'coverage_report',
  'plugin_bundle',
] as const;

export const GATE_3_REQUIRED_FAILURE_CAPTURE_FIELDS = [
  'command',
  'exitCode',
  'stdout',
  'stderr',
  'durationMs',
  'artifactPath',
] as const;

export const GATE_3_COVERAGE_TARGET_IDS = [
  'gate-3-generation-workspace-contract',
  'gate-3-command-plan',
  'gate-3-frontend-build-command',
  'gate-3-typecheck-command',
  'gate-3-unit-test-command',
  'gate-3-component-golden-test-entry',
  'gate-3-artifact-expectations',
  'gate-3-static-contracts-coverage',
  'gate-3-acceptance-scenario-coverage',
  'gate-3-plugin-build-expectations',
  'gate-3-failure-capture-fields',
] as const;

export const GATE_3_ALLOWED_EXECUTION_LEVELS = [
  'contract-skeleton',
  'real-local-command-plan',
  'fixture-execution',
  'disabled-execution',
] as const;

export const GATE_3_REQUIRED_WORKSPACE_FILE_PATHS = [
  'package.json',
  'index.html',
  'tsconfig.json',
  'tsconfig.generated-app.json',
  'vite.config.ts',
  'src/main.tsx',
  'src/App.tsx',
  'src/generated-app/app-spec.ts',
  'src/generated-app/static-contracts.ts',
  'src/generated-app/runtime-form.ts',
  'src/generated-app/runtime.ts',
  'src/generated-app/__tests__/runtime.contract.spec.ts',
  'src/generated-app/__tests__/runtime.golden.spec.tsx',
  'generated-app.manifest.json',
  'scripts/gate3-build.mjs',
  'scripts/gate3-typecheck.mjs',
  'scripts/gate3-unit.mjs',
  'scripts/gate3-component-golden.mjs',
  'scripts/gate3-plugin-build.mjs',
] as const;

export const GATE_3_REQUIRED_COMMAND_IDS = [
  'gate-3-frontend-build-command',
  'gate-3-typecheck-command',
  'gate-3-unit-test-command',
  'gate-3-component-golden-test-entry',
  'gate-3-plugin-build-command',
] as const;

export const GATE_3_ALLOWED_COMMAND_BY_ID = {
  'gate-3-frontend-build-command': 'node scripts/gate3-build.mjs',
  'gate-3-typecheck-command': 'node scripts/gate3-typecheck.mjs',
  'gate-3-unit-test-command': 'node scripts/gate3-unit.mjs',
  'gate-3-component-golden-test-entry':
    'node scripts/gate3-component-golden.mjs',
  'gate-3-plugin-build-command': 'node scripts/gate3-plugin-build.mjs',
} as const satisfies Record<
  (typeof GATE_3_REQUIRED_COMMAND_IDS)[number],
  string
>;

export const GENERATED_APP_BUILD_UNIT_EXECUTION_LEVELS = [
  'contract-skeleton',
  'real-local-command-plan',
  'fixture-execution',
  'disabled-execution',
] as const satisfies ReadonlyArray<GeneratedAppBuildUnitPlan['executionLevel']>;

export const GATE_3_SKELETON_EVIDENCE_NOTE =
  'Gate 3 contract-skeleton 只检查计划完整性；fixture-execution 不执行真实命令；real-local-command-plan 才表示受控本地命令已执行。';

export function buildGenerationPlan(
  appSpec: GeneratedAppSpec,
  repairContext: GeneratedAppGenerationRepairContext | null = null,
): GeneratedAppGenerationPlan {
  const allRequirementIds = appSpec.coreRequirements.map(
    (requirement) => requirement.id,
  );
  const allScenarioIds = appSpec.acceptanceScenarios.map(
    (scenario) => scenario.id,
  );
  const allPageIds = appSpec.pages.map((page) => page.id);
  const scenarioIdsByRequirementId = new Map<string, string[]>();

  for (const requirement of appSpec.coreRequirements) {
    const traceEntry = appSpec.traceability.find(
      (entry) => entry.requirementId === requirement.id,
    );
    const scenarioIds =
      traceEntry?.scenarioIds.filter((scenarioId) =>
        allScenarioIds.includes(scenarioId),
      ) ??
      appSpec.acceptanceScenarios
        .filter((scenario) => scenario.requirementIds.includes(requirement.id))
        .map((scenario) => scenario.id);

    scenarioIdsByRequirementId.set(requirement.id, scenarioIds);
  }

  const pluginTools = buildPluginToolPlan(appSpec, scenarioIdsByRequirementId);
  const generationPlan: GeneratedAppGenerationPlan = {
    planVersion: 1,
    appSpecVersion: appSpec.version,
    frontend: {
      stack: 'react-vite-agentloom-runtime',
      runtimeSurface: {
        kind: 'generated-app',
        publicAccess: 'private-token-after-gates',
        dataUseNoticeRequired: appSpec.dataPolicy.publicSubmissionsPersisted,
      },
      pages: appSpec.pages.map((page) => ({
        pageId: page.id,
        name: page.name,
        purpose: page.purpose,
        route: buildPlanRoute(page.id),
        requirementIds: allRequirementIds,
        scenarioIds: allScenarioIds,
      })),
    },
    orchestration: {
      target: 'workflow',
      strategy: 'generated-workflow-with-agent-capability',
      inputContract: {
        source: 'public-runtime-submission',
        requiredFields: ['input'],
        scenarioIds: allScenarioIds,
      },
      outputContract: {
        destinations: ['public-runtime-report', 'creator-submission-detail'],
        reportRequired: true,
      },
      steps: appSpec.coreRequirements.map((requirement, index) => ({
        stepId: `step-${index + 1}-${buildPlanSegment(requirement.id)}`,
        label: `实现 ${requirement.id}`,
        purpose: requirement.text,
        requirementIds: [requirement.id],
        scenarioIds: scenarioIdsByRequirementId.get(requirement.id) ?? [],
      })),
    },
    pluginTools: {
      tools: pluginTools,
      emptyReason:
        pluginTools.length === 0
          ? '当前 AppSpec 未声明需要平台现有能力之外的私有插件或外部工具；后续 Gate 2-4 可在发现缺口时补充受控插件计划。'
          : null,
      permissionPolicy: [
        '插件/工具必须显式声明权限。',
        '未通过 manifest、构建、签名、权限审计和 sandbox smoke test 前不得绑定到 Agent/Workflow。',
        '生成插件默认只能自动激活为当前租户私有资源，不能自动发布到 Marketplace。',
        '禁止隐式放开网络、存储、知识库或 LLM 权限。',
      ],
    },
    dataPersistence: {
      publicSubmissionsPersisted: appSpec.dataPolicy.publicSubmissionsPersisted,
      creatorCanDeleteSubmissions:
        appSpec.dataPolicy.creatorCanDeleteSubmissions,
      endUserLoginRequired: appSpec.dataPolicy.endUserLoginRequired,
      tenantScoped: true,
      tokenSnapshotRequired: true,
      softDeleteRequired: true,
    },
    testGates: {
      blockingGateIds: [
        'gate-2',
        'gate-3',
        'gate-4',
        'gate-5',
        'gate-6',
        'gate-7',
      ],
      gatePlan: [
        {
          gateId: 'gate-2',
          purpose:
            '校验前端类型、API contract、Agent/Workflow 图 schema、DAG、端口兼容和插件 manifest。',
          evidenceKind: 'static_check',
        },
        {
          gateId: 'gate-3',
          purpose:
            '执行前端构建、单元测试、组件测试、插件构建和 golden tests。',
          evidenceKind: 'build',
        },
        {
          gateId: 'gate-4',
          purpose:
            '运行生成应用与 Agent/Workflow dry-run、插件 WASM/Extism sandbox smoke test。',
          evidenceKind: 'test',
        },
        {
          gateId: 'gate-5',
          purpose:
            '用浏览器自动化覆盖核心 acceptance scenarios、console 和 network 失败检查。',
          evidenceKind: 'browser',
        },
        {
          gateId: 'gate-6',
          purpose: '独立 verifier 审查 AppSpec、计划、证据矩阵与运行结果。',
          evidenceKind: 'verifier',
        },
        {
          gateId: 'gate-7',
          purpose:
            '确认所有阻断门禁通过且无 warning 后才形成 publish candidate。',
          evidenceKind: 'manual',
        },
      ],
      acceptanceScenarioIds: allScenarioIds,
    },
    traceability: appSpec.coreRequirements.map((requirement) => ({
      requirementId: requirement.id,
      scenarioIds: scenarioIdsByRequirementId.get(requirement.id) ?? [],
      pageIds: allPageIds,
      orchestrationStepIds: [
        `step-${
          appSpec.coreRequirements.findIndex(
            (candidate) => candidate.id === requirement.id,
          ) + 1
        }-${buildPlanSegment(requirement.id)}`,
      ],
      planEvidenceIds: [
        'gate-1-frontend-plan',
        'gate-1-orchestration-plan',
        'gate-1-plugin-tool-plan',
        'gate-1-data-persistence-plan',
        'gate-1-test-gate-plan',
        ...(repairContext ? ['gate-1-retry-repair-context'] : []),
      ],
    })),
  };

  if (repairContext) {
    generationPlan.repairContext = repairContext;
  }

  return generationPlan;
}

export function buildPluginToolPlan(
  appSpec: GeneratedAppSpec,
  scenarioIdsByRequirementId: Map<string, string[]>,
): GeneratedAppGenerationPlan['pluginTools']['tools'] {
  const requiresPrivateTool = appSpec.coreRequirements.some((requirement) =>
    requirementNeedsPrivatePluginTool(requirement.text),
  );

  if (!requiresPrivateTool) {
    return [];
  }

  const requirementIds = appSpec.coreRequirements.map(
    (requirement) => requirement.id,
  );
  const primaryRequirement =
    appSpec.coreRequirements.find((requirement) =>
      requirementNeedsPrivatePluginTool(requirement.text),
    ) ?? appSpec.coreRequirements[0];
  const scenarioIds =
    primaryRequirement === undefined
      ? []
      : (scenarioIdsByRequirementId.get(primaryRequirement.id) ?? []);

  return [
    {
      toolId: 'tool-guided-intake-analysis',
      purpose: buildPrivatePluginToolPurpose(appSpec),
      requirementIds:
        requirementIds.length > 0
          ? requirementIds
          : primaryRequirement
            ? [primaryRequirement.id]
            : [],
      permissionNotes: [
        '租户私有生成插件，默认不发布到 Marketplace。',
        'manifest.permissions 必须为空数组；禁止隐式网络、存储、知识库或 LLM 权限。',
        '仅处理本次 public-runtime-submission 的结构化输入，输出追问、评分或摘要建议。',
        '必须通过 manifest 校验、插件构建、签名/验签、权限审计、WASM/Extism sandbox smoke test 和生成安全扫描后才可自动激活。',
        ...(scenarioIds.length > 0
          ? [`覆盖验收场景：${scenarioIds.join('、')}。`]
          : []),
      ],
      activationPolicy: {
        scope: 'tenant-private',
        autoActivateAfterHardGates: true,
        requiredHardGates: [...GENERATED_APP_PRIVATE_PLUGIN_HARD_GATES],
      },
    },
  ];
}

export function requirementNeedsPrivatePluginTool(text: string): boolean {
  return /问诊|评分|量表|计算|校验|评估|分诊|风险|筛查|自动追问|逐步生成|选择题|结构化分析|插件|工具|外部接口|API/i.test(
    text,
  );
}

export function buildPrivatePluginToolPurpose(
  appSpec: GeneratedAppSpec,
): string {
  if (/问诊|中医|医疗|症状|患者|分诊|风险|筛查/.test(appSpec.userGoal)) {
    return '对问诊输入做租户私有的结构化整理、风险提示和下一步追问候选生成，不输出诊断、处方、剂量或治疗指令。';
  }

  if (/评分|量表|计算|评估/.test(appSpec.userGoal)) {
    return '对公开提交输入执行租户私有的规则化评分、校验和结果解释生成。';
  }

  return '对公开提交输入执行租户私有的结构化转换、校验和追问建议生成。';
}

export function buildStaticContracts(
  appSpec: GeneratedAppSpec,
  generationPlan: GeneratedAppGenerationPlan,
): GeneratedAppStaticContracts {
  const orchestrationNodes = generationPlan.orchestration.steps.map((step) => ({
    nodeId: `node-${buildPlanSegment(step.stepId)}`,
    stepId: step.stepId,
    label: step.label,
    requirementIds: step.requirementIds,
    scenarioIds: step.scenarioIds,
    inputHandle: 'input',
    outputHandle: 'output',
  }));

  return {
    contractVersion: 1,
    appSpecVersion: appSpec.version,
    generationPlanVersion: generationPlan.planVersion,
    publicRuntime: {
      input: {
        source: generationPlan.orchestration.inputContract.source,
        requiredFields:
          generationPlan.orchestration.inputContract.requiredFields,
        scenarioIds: generationPlan.orchestration.inputContract.scenarioIds,
        dataUseNoticeRequired:
          generationPlan.frontend.runtimeSurface.dataUseNoticeRequired,
        anonymousSessionRequired: true,
        endUserLoginRequired: appSpec.dataPolicy.endUserLoginRequired,
      },
      output: {
        destinations: generationPlan.orchestration.outputContract.destinations,
        reportRequired:
          generationPlan.orchestration.outputContract.reportRequired,
        errorStateRequired: true,
      },
    },
    frontendRoutes: generationPlan.frontend.pages.map((page) => ({
      pageId: page.pageId,
      name: page.name,
      route: page.route,
      requirementIds: page.requirementIds,
      scenarioIds: page.scenarioIds,
    })),
    orchestration: {
      target: generationPlan.orchestration.target,
      strategy: generationPlan.orchestration.strategy,
      inputContract: generationPlan.orchestration.inputContract,
      outputContract: generationPlan.orchestration.outputContract,
      nodes: orchestrationNodes,
      edges: orchestrationNodes.slice(1).map((node, index) => ({
        fromNodeId: orchestrationNodes[index]?.nodeId ?? node.nodeId,
        toNodeId: node.nodeId,
      })),
    },
    pluginToolPermissions: {
      tools: generationPlan.pluginTools.tools.map((tool) => ({
        toolId: tool.toolId,
        purpose: tool.purpose,
        requirementIds: tool.requirementIds,
        permissions: tool.permissionNotes,
        manifestRequired: true,
        sandboxSmokeTestRequired: true,
      })),
      emptyReason: generationPlan.pluginTools.emptyReason,
      permissionPolicy: generationPlan.pluginTools.permissionPolicy,
      implicitPermissionsAllowed: false,
    },
    submissionPersistence: {
      ...generationPlan.dataPersistence,
      fields: [
        'input',
        'result',
        'report',
        'errorMessage',
        'anonymousSessionId',
        'publicShareToken',
      ],
    },
    testEntry: {
      staticCheckCommand:
        'agentloom generated-app gate-2 static-contracts --deterministic',
      buildGateCommand: 'agentloom generated-app gate-3 build-and-unit',
      unitGateCommand: 'agentloom generated-app gate-3 unit-tests',
      integrationGateCommand: 'agentloom generated-app gate-4 integration',
      browserGateCommand: 'agentloom generated-app gate-5 browser-acceptance',
      verifierGateCommand:
        'agentloom generated-app gate-6 independent-verifier',
      publishCandidateGateCommand:
        'agentloom generated-app gate-7 publish-candidate',
      acceptanceScenarioIds: generationPlan.testGates.acceptanceScenarioIds,
      blockingGateIds: ['gate-3', 'gate-4', 'gate-5', 'gate-6', 'gate-7'],
    },
    traceability: generationPlan.traceability.map((entry) => ({
      requirementId: entry.requirementId,
      scenarioIds: entry.scenarioIds,
      pageIds: entry.pageIds,
      orchestrationNodeIds: entry.orchestrationStepIds.map(
        (stepId) => `node-${buildPlanSegment(stepId)}`,
      ),
      staticContractIds: [...GATE_2_STATIC_CONTRACT_IDS],
    })),
  };
}

export function evaluateGate2StaticContracts(
  appSpec: GeneratedAppSpec,
  generationPlan: GeneratedAppGenerationPlan,
  staticContracts: unknown,
): Gate2Evaluation {
  const checks = buildGate2Checks(appSpec, generationPlan, staticContracts);
  const failedChecks = checks.filter((check) => !check.passed);
  const evidence = checks.map((check) => ({
    id: `gate-2-${check.id}`,
    label: check.label,
    kind: 'static_check' as const,
    url: null,
    summary:
      check.issues.length === 0
        ? check.summary
        : `${check.summary} 缺口：${check.issues.join('；')}`,
  }));

  if (failedChecks.length > 0) {
    const failure: GeneratedAppGateRunFailure = {
      code: 'static-contracts-incomplete',
      message: `StaticContracts 静态合约检查失败：${failedChecks
        .map((check) => check.label)
        .join('、')}。`,
      details: {
        checks: checks.map((check) => ({
          id: check.id,
          label: check.label,
          passed: check.passed,
          issues: check.issues,
        })),
      },
    };

    return {
      status: 'failed',
      summary:
        'Gate 2 失败：staticContracts 未完整覆盖公开运行、前端路由、编排、插件权限、提交持久化、测试入口或 traceability。',
      evidence,
      failure,
      repairInstructions:
        '修复 generationPlan.staticContracts，使其覆盖 public runtime 输入输出、frontend route/page、Workflow/Agent 编排、插件/工具权限、submission persistence、Gate 3-7 测试入口和每条核心需求 traceability。',
    };
  }

  return {
    status: 'passed',
    summary:
      'Gate 2 通过：staticContracts 已覆盖公开运行输入输出、前端路由、Workflow/Agent 编排、插件权限、提交持久化、测试入口和需求 traceability。',
    evidence,
    failure: null,
    repairInstructions: null,
  };
}

export function buildBuildUnitPlan(
  appSpec: GeneratedAppSpec,
  generationPlan: GeneratedAppGenerationPlan,
  staticContracts: GeneratedAppStaticContracts,
  generationWorkspace: GeneratedAppGenerationWorkspaceContract,
  commandPlan: GeneratedAppGate3CommandPlan[],
  executionLevel: GeneratedAppBuildUnitPlan['executionLevel'],
): GeneratedAppBuildUnitPlan {
  const requirementIds = appSpec.coreRequirements.map(
    (requirement) => requirement.id,
  );
  const scenarioIds = appSpec.acceptanceScenarios.map(
    (scenario) => scenario.id,
  );
  const routeIds = staticContracts.frontendRoutes.map((route) => route.pageId);
  const staticContractCoverage = GATE_2_STATIC_CONTRACT_IDS.map(
    (staticContractId) => ({
      staticContractId,
      coveredBy: [
        'gate-3-frontend-build-command',
        'gate-3-typecheck-command',
        'gate-3-unit-test-command',
      ],
    }),
  );
  const pluginBundleArtifacts = generationPlan.pluginTools.tools.map(
    (tool) => ({
      artifactId: `plugin-bundle-${tool.toolId}`,
      kind: 'plugin_bundle' as const,
      path: `artifacts/gate-3/plugins/${tool.toolId}.alp`,
      required: true,
    }),
  );

  const resolvedWorkspace = generationWorkspace;
  const resolvedExecutionLevel = executionLevel;
  const resolvedCommandPlan = commandPlan;
  const commandById = new Map(
    resolvedCommandPlan.map((command) => [command.commandId, command]),
  );
  const frontendBuildCommand =
    commandById.get('gate-3-frontend-build-command')?.command ??
    staticContracts.testEntry.buildGateCommand;
  const typecheckCommand =
    commandById.get('gate-3-typecheck-command')?.command ??
    'agentloom generated-app gate-3 typecheck';
  const unitTestCommand =
    commandById.get('gate-3-unit-test-command')?.command ??
    staticContracts.testEntry.unitGateCommand;
  const componentGoldenCommand =
    commandById.get('gate-3-component-golden-test-entry')?.command ??
    'agentloom generated-app gate-3 component-golden';

  return {
    planVersion: 1,
    appSpecVersion: appSpec.version,
    generationPlanVersion: generationPlan.planVersion,
    staticContractsVersion: staticContracts.contractVersion,
    executionLevel: resolvedExecutionLevel,
    generationWorkspace: resolvedWorkspace,
    commandPlan: resolvedCommandPlan.map((command) => ({
      commandId: command.commandId,
      command: command.command,
      workingDirectory: command.workingDirectory,
      requirementIds: command.requirementIds,
      scenarioIds: command.scenarioIds,
      producesArtifactIds: command.producesArtifactIds,
    })),
    frontendBuild: {
      command: frontendBuildCommand,
      workingDirectory: resolvedWorkspace.relativePath,
      routeIds,
      requirementIds,
      scenarioIds,
      expectedArtifacts: ['dist/index.html', 'dist/assets/manifest.json'],
    },
    typecheck: {
      command: typecheckCommand,
      tsconfigPath: 'tsconfig.generated-app.json',
      requirementIds,
    },
    unitTests: {
      command: unitTestCommand,
      entry: 'src/generated-app/__tests__/runtime.contract.spec.ts',
      requirementIds,
      scenarioIds,
    },
    componentGoldenTests: {
      command: componentGoldenCommand,
      entry: 'src/generated-app/__tests__/runtime.golden.spec.tsx',
      scenarioIds,
      goldenArtifactPath: 'artifacts/gate-3/component-golden-report.json',
    },
    artifactExpectations: [
      {
        artifactId: 'frontend-build-output',
        kind: 'frontend_build',
        path: 'dist/index.html',
        required: true,
      },
      {
        artifactId: 'unit-test-report',
        kind: 'unit_test_report',
        path: 'artifacts/gate-3/unit-test-report.json',
        required: true,
      },
      {
        artifactId: 'component-golden-report',
        kind: 'component_golden_report',
        path: 'artifacts/gate-3/component-golden-report.json',
        required: true,
      },
      {
        artifactId: 'coverage-report',
        kind: 'coverage_report',
        path: 'coverage/generated-app/coverage-summary.json',
        required: true,
      },
      ...pluginBundleArtifacts,
    ],
    staticContractsCoverage: staticContractCoverage,
    acceptanceScenarioCoverage: appSpec.acceptanceScenarios.map((scenario) => ({
      scenarioId: scenario.id,
      requirementIds: scenario.requirementIds,
      coveredBy: [
        'gate-3-unit-test-command',
        'gate-3-component-golden-test-entry',
      ],
    })),
    pluginBuildExpectations: {
      tools: generationPlan.pluginTools.tools.map((tool) => ({
        toolId: tool.toolId,
        command: 'node scripts/gate3-plugin-build.mjs',
        manifestPath: `plugins/${tool.toolId}/agentloom.plugin.json`,
        nodeDefinitionsPath: `plugins/${tool.toolId}/node-definitions.json`,
        sourcePath: `plugins/${tool.toolId}/src/index.ts`,
        smokeFixturePath: `plugins/${tool.toolId}/smoke-fixture.json`,
        buildReportPath: `artifacts/gate-3/plugins/${tool.toolId}-build-report.json`,
        artifactPath: `artifacts/gate-3/plugins/${tool.toolId}.alp`,
        goldenTestCommand: 'node scripts/gate3-plugin-build.mjs',
        requirementIds: tool.requirementIds,
        activationPolicy: {
          scope: 'tenant-private',
          autoActivateAfterHardGates: true,
          requiredHardGates: [...GENERATED_APP_PRIVATE_PLUGIN_HARD_GATES],
        },
      })),
      emptyReason:
        generationPlan.pluginTools.tools.length === 0
          ? '当前 generationPlan.pluginTools 未声明私有插件；Gate 3 不需要执行插件构建，但仍保留插件构建期望空原因。'
          : null,
    },
    failureCaptureFields: [
      ...GATE_3_REQUIRED_FAILURE_CAPTURE_FIELDS,
      'failedTestNames',
      'coverageSummary',
    ],
  };
}

export function evaluateGate3BuildUnitPlan(
  appSpec: GeneratedAppSpec,
  generationPlan: GeneratedAppGenerationPlan,
  staticContracts: GeneratedAppStaticContracts,
  buildUnitPlan: unknown,
): Gate3Evaluation {
  const checks = buildGate3Checks(
    appSpec,
    generationPlan,
    staticContracts,
    buildUnitPlan,
  );
  const failedChecks = checks.filter((check) => !check.passed);
  const evidence = checks.map((check) => ({
    id: `gate-3-${check.id}`,
    label: check.label,
    kind: (check.id.includes('test') || check.id.includes('acceptance-scenario')
      ? 'test'
      : 'build') as GeneratedAppGateEvidence['kind'],
    url: null,
    summary:
      check.issues.length === 0
        ? `${check.summary} ${GATE_3_SKELETON_EVIDENCE_NOTE}`
        : `${check.summary} 缺口：${check.issues.join(
            '；',
          )} ${GATE_3_SKELETON_EVIDENCE_NOTE}`,
  }));

  if (failedChecks.length > 0) {
    const failure: GeneratedAppGateRunFailure = {
      code: 'build-unit-plan-incomplete',
      message: `BuildUnitPlan 构建与单元 skeleton 检查失败：${failedChecks
        .map((check) => check.label)
        .join('、')}。`,
      details: {
        checks: checks.map((check) => ({
          id: check.id,
          label: check.label,
          passed: check.passed,
          issues: check.issues,
        })),
      },
    };

    return {
      status: 'failed',
      summary:
        'Gate 3 失败：buildUnitPlan 未完整覆盖构建命令、类型检查、单元/组件/golden 测试、artifact 期望、插件构建期望、合约覆盖、场景覆盖或失败捕获字段。',
      evidence,
      failure,
      repairInstructions:
        '修复 generationPlan.buildUnitPlan，使其覆盖前端 build/typecheck/unit/component/golden 测试入口、artifact expectations、staticContracts coverage、acceptanceScenario coverage、插件构建期望和失败捕获字段；当前 Gate 3 仍只检查 contract-skeleton 合约，不代表真实前端构建、插件构建、单元测试、组件测试或 golden test 已经执行。',
    };
  }

  return {
    status: 'passed',
    summary:
      'Gate 3 通过：buildUnitPlan 构建与单元 skeleton 已完整覆盖命令、预期产物、测试入口、合约/场景覆盖、插件构建期望和失败捕获字段；本结果仅表示契约级 skeleton 完整，不代表真实前端构建、插件构建、单元测试、组件测试或 golden test 已经执行。',
    evidence,
    failure: null,
    repairInstructions: null,
  };
}

export function evaluateGate1GenerationPlan(
  appSpec: GeneratedAppSpec,
  generationPlan: GeneratedAppGenerationPlan,
): Gate1Evaluation {
  const checks = buildGate1Checks(appSpec, generationPlan);
  const failedChecks = checks.filter((check) => !check.passed);
  const evidence = checks.map((check) => ({
    id: `gate-1-${check.id}`,
    label: check.label,
    kind: 'plan' as const,
    url: null,
    summary:
      check.issues.length === 0
        ? check.summary
        : `${check.summary} 缺口：${check.issues.join('；')}`,
  }));

  if (failedChecks.length > 0) {
    const failure: GeneratedAppGateRunFailure = {
      code: 'generation-plan-incomplete',
      message: `GenerationPlan 架构计划检查失败：${failedChecks
        .map((check) => check.label)
        .join('、')}。`,
      details: {
        checks: checks.map((check) => ({
          id: check.id,
          label: check.label,
          passed: check.passed,
          issues: check.issues,
        })),
      },
    };

    return {
      status: 'failed',
      summary:
        'Gate 1 失败：generationPlan 未完整覆盖 AppSpec 的页面、编排、插件/工具、数据、测试门禁或 traceability。',
      evidence,
      failure,
      repairInstructions:
        '修复 generationPlan，使其覆盖 AppSpec 版本、页面计划、Agent/Workflow 编排计划、插件/工具策略、数据持久化策略、Gate 2-7 测试计划和每条核心需求 traceability。',
    };
  }

  return {
    status: 'passed',
    summary:
      'Gate 1 通过：generationPlan 已覆盖 AppSpec 页面、Agent/Workflow 编排、插件/工具策略、数据持久化、Gate 2-7 测试计划和需求 traceability。',
    evidence,
    failure: null,
    repairInstructions: null,
  };
}

export function buildGate1Checks(
  appSpec: GeneratedAppSpec,
  generationPlan: GeneratedAppGenerationPlan,
): Gate1Check[] {
  const requirementIds = appSpec.coreRequirements.map(
    (requirement) => requirement.id,
  );
  const pageIds = appSpec.pages.map((page) => page.id);
  const scenarioIds = appSpec.acceptanceScenarios.map(
    (scenario) => scenario.id,
  );
  const plannedPageIds = new Set(
    generationPlan.frontend.pages.map((page) => page.pageId),
  );
  const knownScenarioIds = new Set(scenarioIds);
  const knownRequirementIds = new Set(requirementIds);
  const plannedScenarioIds = new Set(
    generationPlan.testGates.acceptanceScenarioIds,
  );
  const plannedBlockingGateIds = new Set(
    generationPlan.testGates.blockingGateIds,
  );
  const plannedGateIds = new Set(
    generationPlan.testGates.gatePlan.map((gate) => gate.gateId),
  );
  const plannedStepIds = new Set(
    generationPlan.orchestration.steps.map((step) => step.stepId),
  );
  const plannedRequirementIds = new Set(
    generationPlan.orchestration.steps.flatMap((step) => step.requirementIds),
  );
  const planEvidenceIds = new Set([
    'gate-1-app-spec-version',
    'gate-1-frontend-plan',
    'gate-1-orchestration-plan',
    'gate-1-plugin-tool-plan',
    'gate-1-data-persistence-plan',
    'gate-1-test-gate-plan',
    'gate-1-traceability',
    'gate-1-retry-repair-context',
  ]);
  const traceabilityByRequirementId = new Map(
    generationPlan.traceability.map((entry) => [entry.requirementId, entry]),
  );

  const versionIssues =
    generationPlan.appSpecVersion === appSpec.version
      ? []
      : [
          `appSpecVersion=${generationPlan.appSpecVersion} 与 AppSpec version=${appSpec.version} 不一致`,
        ];
  const frontendIssues = [
    ...pageIds
      .filter((pageId) => !plannedPageIds.has(pageId))
      .map((pageId) => `页面 ${pageId} 未进入 frontend.pages`),
    ...generationPlan.frontend.pages.flatMap((page, index) => {
      const issues: string[] = [];

      if (page.route.trim().length === 0) {
        issues.push(`frontend.pages[${index}].route 缺失`);
      }

      if (page.requirementIds.length === 0) {
        issues.push(`frontend.pages[${index}].requirementIds 不能为空`);
      }

      for (const requirementId of page.requirementIds) {
        if (!knownRequirementIds.has(requirementId)) {
          issues.push(
            `frontend.pages[${index}].requirementIds 引用了未知需求 ${requirementId}`,
          );
        }
      }

      if (page.scenarioIds.length === 0) {
        issues.push(`frontend.pages[${index}].scenarioIds 不能为空`);
      }

      for (const scenarioId of page.scenarioIds) {
        if (!knownScenarioIds.has(scenarioId)) {
          issues.push(
            `frontend.pages[${index}].scenarioIds 引用了未知场景 ${scenarioId}`,
          );
        }
      }

      return issues;
    }),
    ...(generationPlan.frontend.runtimeSurface.dataUseNoticeRequired ===
    appSpec.dataPolicy.publicSubmissionsPersisted
      ? []
      : ['runtimeSurface.dataUseNoticeRequired 与 AppSpec 数据保存策略不一致']),
  ];
  const orchestrationIssues = [
    ...(generationPlan.orchestration.steps.length === 0
      ? ['orchestration.steps 不能为空']
      : []),
    ...requirementIds
      .filter((requirementId) => !plannedRequirementIds.has(requirementId))
      .map(
        (requirementId) => `需求 ${requirementId} 未映射到 orchestration step`,
      ),
    ...generationPlan.orchestration.steps.flatMap((step, index) => {
      const issues: string[] = [];

      for (const requirementId of step.requirementIds) {
        if (!knownRequirementIds.has(requirementId)) {
          issues.push(
            `orchestration.steps[${index}].requirementIds 引用了未知需求 ${requirementId}`,
          );
        }
      }

      for (const scenarioId of step.scenarioIds) {
        if (!knownScenarioIds.has(scenarioId)) {
          issues.push(
            `orchestration.steps[${index}].scenarioIds 引用了未知场景 ${scenarioId}`,
          );
        }
      }

      return issues;
    }),
    ...(generationPlan.orchestration.inputContract.scenarioIds.length === 0
      ? ['inputContract.scenarioIds 不能为空']
      : []),
    ...generationPlan.orchestration.inputContract.scenarioIds
      .filter((scenarioId) => !knownScenarioIds.has(scenarioId))
      .map(
        (scenarioId) =>
          `inputContract.scenarioIds 引用了未知场景 ${scenarioId}`,
      ),
    ...(generationPlan.orchestration.outputContract.destinations.length === 0
      ? ['outputContract.destinations 不能为空']
      : []),
  ];
  const pluginToolIssues = [
    ...(generationPlan.pluginTools.tools.length === 0 &&
    !generationPlan.pluginTools.emptyReason
      ? ['插件/工具计划为空时必须给出 emptyReason']
      : []),
    ...(generationPlan.pluginTools.permissionPolicy.length === 0
      ? ['permissionPolicy 不能为空']
      : []),
  ];
  const dataIssues = [
    ...(generationPlan.dataPersistence.publicSubmissionsPersisted ===
    appSpec.dataPolicy.publicSubmissionsPersisted
      ? []
      : ['dataPersistence.publicSubmissionsPersisted 与 AppSpec 不一致']),
    ...(generationPlan.dataPersistence.creatorCanDeleteSubmissions ===
    appSpec.dataPolicy.creatorCanDeleteSubmissions
      ? []
      : ['dataPersistence.creatorCanDeleteSubmissions 与 AppSpec 不一致']),
    ...(generationPlan.dataPersistence.endUserLoginRequired ===
    appSpec.dataPolicy.endUserLoginRequired
      ? []
      : ['dataPersistence.endUserLoginRequired 与 AppSpec 不一致']),
    ...(generationPlan.dataPersistence.tenantScoped
      ? []
      : ['dataPersistence.tenantScoped 必须为 true']),
    ...(generationPlan.dataPersistence.tokenSnapshotRequired
      ? []
      : ['dataPersistence.tokenSnapshotRequired 必须为 true']),
    ...(generationPlan.dataPersistence.softDeleteRequired
      ? []
      : ['dataPersistence.softDeleteRequired 必须为 true']),
  ];
  const requiredFutureGateIds = [
    'gate-2',
    'gate-3',
    'gate-4',
    'gate-5',
    'gate-6',
    'gate-7',
  ];
  const testGateIssues = [
    ...requiredFutureGateIds
      .filter((gateId) => !plannedBlockingGateIds.has(gateId))
      .map((gateId) => `${gateId} 缺少 blocking gate 声明`),
    ...requiredFutureGateIds
      .filter((gateId) => !plannedGateIds.has(gateId))
      .map((gateId) => `${gateId} 缺少 test gate plan`),
    ...scenarioIds
      .filter((scenarioId) => !plannedScenarioIds.has(scenarioId))
      .map(
        (scenarioId) =>
          `场景 ${scenarioId} 未进入 testGates.acceptanceScenarioIds`,
      ),
  ];
  const traceabilityIssues = requirementIds.flatMap((requirementId) => {
    const entry = traceabilityByRequirementId.get(requirementId);

    if (!entry) {
      return [`需求 ${requirementId} 缺少 plan traceability`];
    }

    const issues: string[] = [];

    if (entry.scenarioIds.length === 0) {
      issues.push(`需求 ${requirementId} 缺少 scenarioIds`);
    }

    for (const scenarioId of entry.scenarioIds) {
      if (!knownScenarioIds.has(scenarioId)) {
        issues.push(`需求 ${requirementId} 引用了未知场景 ${scenarioId}`);
      }
    }

    if (entry.pageIds.length === 0) {
      issues.push(`需求 ${requirementId} 缺少 pageIds`);
    }

    for (const pageId of entry.pageIds) {
      if (!plannedPageIds.has(pageId)) {
        issues.push(`需求 ${requirementId} 引用了未知页面 ${pageId}`);
      }
    }

    if (entry.orchestrationStepIds.length === 0) {
      issues.push(`需求 ${requirementId} 缺少 orchestrationStepIds`);
    }

    for (const stepId of entry.orchestrationStepIds) {
      if (!plannedStepIds.has(stepId)) {
        issues.push(`需求 ${requirementId} 引用了未知编排步骤 ${stepId}`);
      }
    }

    if (entry.planEvidenceIds.length === 0) {
      issues.push(`需求 ${requirementId} 缺少 planEvidenceIds`);
    }

    for (const evidenceId of entry.planEvidenceIds) {
      if (!planEvidenceIds.has(evidenceId)) {
        issues.push(`需求 ${requirementId} 引用了未知计划证据 ${evidenceId}`);
      }
    }

    return issues;
  });
  const repairContext = getRecord(generationPlan.repairContext);
  const repairContextIssues =
    repairContext === null
      ? []
      : [
          ...(repairContext.source === 'previous-failed-repair-attempt'
            ? []
            : ['repairContext.source 必须为 previous-failed-repair-attempt']),
          ...(getNonEmptyString(repairContext.sourceGenerationRunId)
            ? []
            : ['repairContext.sourceGenerationRunId 缺失']),
          ...(getNonEmptyString(repairContext.sourceRepairAttemptId)
            ? []
            : ['repairContext.sourceRepairAttemptId 缺失']),
          ...(getNonEmptyString(repairContext.targetGateId) &&
          getGeneratedAppGateDefinition(String(repairContext.targetGateId))
            ? []
            : ['repairContext.targetGateId 必须指向 Gate 0-7']),
          ...(typeof repairContext.attemptNumber === 'number' &&
          Number.isInteger(repairContext.attemptNumber) &&
          repairContext.attemptNumber > 0
            ? []
            : ['repairContext.attemptNumber 必须为正整数']),
          ...(repairContext.status === 'failed'
            ? []
            : ['repairContext.status 必须为 failed']),
          ...(getNonEmptyString(repairContext.failureSummary)
            ? []
            : ['repairContext.failureSummary 缺失']),
          ...(repairContext.repairPlan === null ||
          isRecord(repairContext.repairPlan)
            ? []
            : ['repairContext.repairPlan 必须为对象或 null']),
          ...(repairContext.reverificationPlan === null ||
          isRecord(repairContext.reverificationPlan)
            ? []
            : ['repairContext.reverificationPlan 必须为对象或 null']),
          ...(getNonEmptyString(repairContext.capturedAt)
            ? []
            : ['repairContext.capturedAt 缺失']),
        ];

  return [
    {
      id: 'app-spec-version',
      label: 'AppSpec 版本绑定',
      passed: versionIssues.length === 0,
      summary: '检查 generationPlan.appSpecVersion 是否绑定当前 AppSpec。',
      issues: versionIssues,
    },
    {
      id: 'frontend-plan',
      label: '前端页面计划',
      passed: frontendIssues.length === 0,
      summary: `检查 ${appSpec.pages.length} 个 AppSpec 页面是否进入 frontend plan。`,
      issues: frontendIssues,
    },
    {
      id: 'orchestration-plan',
      label: 'Agent/Workflow 编排计划',
      passed: orchestrationIssues.length === 0,
      summary: `检查 ${appSpec.coreRequirements.length} 条核心需求是否映射到 orchestration steps。`,
      issues: orchestrationIssues,
    },
    {
      id: 'plugin-tool-plan',
      label: '插件/工具计划',
      passed: pluginToolIssues.length === 0,
      summary: '检查插件/工具计划为空时是否说明原因，并固定权限策略。',
      issues: pluginToolIssues,
    },
    {
      id: 'data-persistence-plan',
      label: '数据持久化计划',
      passed: dataIssues.length === 0,
      summary: '检查数据保存、租户归属、token 快照和软删除策略。',
      issues: dataIssues,
    },
    {
      id: 'test-gate-plan',
      label: 'Gate 2-7 测试计划',
      passed: testGateIssues.length === 0,
      summary: '检查 Gate 2-7 和 acceptance scenarios 是否都有后续验证计划。',
      issues: testGateIssues,
    },
    {
      id: 'traceability',
      label: '需求到计划证据 traceability',
      passed: traceabilityIssues.length === 0,
      summary: `检查 ${appSpec.coreRequirements.length} 条核心需求是否连接到场景、页面、编排步骤和计划证据。`,
      issues: traceabilityIssues,
    },
    {
      id: 'retry-repair-context',
      label: 'Retry 修复上下文',
      passed: repairContextIssues.length === 0,
      summary:
        repairContext === null
          ? '当前 generation run 没有携带上一轮失败修复上下文。'
          : `当前 retry 已携带 ${String(repairContext.targetGateId)} 的上一轮失败修复上下文。`,
      issues: repairContextIssues,
    },
  ];
}

export function buildGate3Checks(
  appSpec: GeneratedAppSpec,
  generationPlan: GeneratedAppGenerationPlan,
  staticContracts: GeneratedAppStaticContracts,
  buildUnitPlan: unknown,
): Gate3Check[] {
  if (!isRecord(buildUnitPlan)) {
    return [
      {
        id: 'build-unit-plan-object',
        label: 'BuildUnitPlan JSON 对象',
        passed: false,
        summary: '检查 generationPlan.buildUnitPlan 是否为结构化 JSON 对象。',
        issues: ['buildUnitPlan 不是对象'],
      },
    ];
  }

  const requirementIds = appSpec.coreRequirements.map(
    (requirement) => requirement.id,
  );
  const scenarioIds = appSpec.acceptanceScenarios.map(
    (scenario) => scenario.id,
  );
  const knownRequirementIds = new Set(requirementIds);
  const knownScenarioIds = new Set(scenarioIds);
  const routeIds = staticContracts.frontendRoutes.map((route) => route.pageId);
  const knownRouteIds = new Set(routeIds);
  const knownStaticContractIds = new Set<string>([
    ...GATE_2_STATIC_CONTRACT_IDS,
  ]);
  const expectedArtifactIds = [
    ...GATE_3_CORE_ARTIFACT_IDS,
    ...generationPlan.pluginTools.tools.map(
      (tool) => `plugin-bundle-${tool.toolId}`,
    ),
  ];
  const expectedArtifactIdSet = new Set<string>(expectedArtifactIds);
  const knownArtifactKinds = new Set<string>(GATE_3_ARTIFACT_KINDS);
  const knownGate3CoverageIds = new Set<string>(GATE_3_COVERAGE_TARGET_IDS);
  const expectedRequiredCommandIds =
    generationPlan.pluginTools.tools.length > 0
      ? [...GATE_3_REQUIRED_COMMAND_IDS]
      : GATE_3_REQUIRED_COMMAND_IDS.filter(
          (commandId) => commandId !== 'gate-3-plugin-build-command',
        );
  const plannedToolIds = new Set(
    generationPlan.pluginTools.tools.map((tool) => tool.toolId),
  );
  const plannedToolById = new Map(
    generationPlan.pluginTools.tools.map((tool) => [tool.toolId, tool]),
  );

  const frontendBuild = getRecord(buildUnitPlan.frontendBuild);
  const typecheck = getRecord(buildUnitPlan.typecheck);
  const unitTests = getRecord(buildUnitPlan.unitTests);
  const componentGoldenTests = getRecord(buildUnitPlan.componentGoldenTests);
  const generationWorkspace = getRecord(buildUnitPlan.generationWorkspace);
  const workspaceMaterializedFrom = getRecord(
    generationWorkspace?.materializedFrom,
  );
  const workspaceWritePolicy = getRecord(generationWorkspace?.writePolicy);
  const workspaceFiles = getRecordArray(generationWorkspace?.files);
  const workspaceArtifactPaths = getRecord(generationWorkspace?.artifactPaths);
  const commandPlan = getRecordArray(buildUnitPlan.commandPlan);
  const artifactExpectations = getRecordArray(
    buildUnitPlan.artifactExpectations,
  );
  const staticContractsCoverage = getRecordArray(
    buildUnitPlan.staticContractsCoverage,
  );
  const acceptanceScenarioCoverage = getRecordArray(
    buildUnitPlan.acceptanceScenarioCoverage,
  );
  const pluginBuildExpectations = getRecord(
    buildUnitPlan.pluginBuildExpectations,
  );
  const pluginBuildTools = getRecordArray(pluginBuildExpectations?.tools);

  const artifactIds = artifactExpectations
    .map((artifact) => getNonEmptyString(artifact.artifactId))
    .filter((artifactId): artifactId is string => artifactId !== null);
  const coveredStaticContractIds = new Set(
    staticContractsCoverage
      .map((entry) => getNonEmptyString(entry.staticContractId))
      .filter((staticContractId): staticContractId is string => {
        return staticContractId !== null;
      }),
  );
  const scenarioCoverageById = new Map(
    acceptanceScenarioCoverage
      .map((entry) => {
        const scenarioId = getNonEmptyString(entry.scenarioId);
        return scenarioId ? ([scenarioId, entry] as const) : null;
      })
      .filter(
        (entry): entry is readonly [string, Record<string, unknown>] =>
          entry !== null,
      ),
  );

  const versionIssues = [
    ...(buildUnitPlan.planVersion === 1 ? [] : ['planVersion 必须为 1']),
    ...(buildUnitPlan.appSpecVersion === appSpec.version
      ? []
      : [
          `appSpecVersion=${String(
            buildUnitPlan.appSpecVersion,
          )} 与 AppSpec version=${appSpec.version} 不一致`,
        ]),
    ...(buildUnitPlan.generationPlanVersion === generationPlan.planVersion
      ? []
      : [
          `generationPlanVersion=${String(
            buildUnitPlan.generationPlanVersion,
          )} 与 generationPlan.planVersion=${generationPlan.planVersion} 不一致`,
        ]),
    ...(buildUnitPlan.staticContractsVersion === staticContracts.contractVersion
      ? []
      : [
          `staticContractsVersion=${String(
            buildUnitPlan.staticContractsVersion,
          )} 与 staticContracts.contractVersion=${staticContracts.contractVersion} 不一致`,
        ]),
    ...(typeof buildUnitPlan.executionLevel === 'string' &&
    GATE_3_ALLOWED_EXECUTION_LEVELS.includes(
      buildUnitPlan.executionLevel as (typeof GATE_3_ALLOWED_EXECUTION_LEVELS)[number],
    )
      ? []
      : [
          `executionLevel 必须为 ${GATE_3_ALLOWED_EXECUTION_LEVELS.join(
            ' | ',
          )} 之一`,
        ]),
  ];
  const workspaceRelativePath = getNonEmptyString(
    generationWorkspace?.relativePath,
  );
  const workspaceFilePaths = workspaceFiles
    .map((file) => getNonEmptyString(file.path))
    .filter((path): path is string => path !== null);
  const workspaceIssues = [
    ...requireRecord(generationWorkspace, 'generationWorkspace'),
    ...(generationWorkspace?.contractVersion === 1
      ? []
      : ['generationWorkspace.contractVersion 必须为 1']),
    ...(generationWorkspace?.storageKind === 'server-controlled-local-workspace'
      ? []
      : [
          'generationWorkspace.storageKind 必须为 server-controlled-local-workspace',
        ]),
    ...(generationWorkspace?.rootLabel === 'generated-app-workspaces'
      ? []
      : ['generationWorkspace.rootLabel 必须为 generated-app-workspaces']),
    ...(!getNonEmptyString(generationWorkspace?.workspaceId)
      ? ['generationWorkspace.workspaceId 缺失']
      : []),
    ...(!workspaceRelativePath
      ? ['generationWorkspace.relativePath 缺失']
      : []),
    ...buildSafeRelativePathIssues(
      'generationWorkspace.relativePath',
      workspaceRelativePath,
    ),
    ...(generationWorkspace?.scaffold === 'react-vite-typescript'
      ? []
      : ['generationWorkspace.scaffold 必须为 react-vite-typescript']),
    ...requireRecord(
      workspaceMaterializedFrom,
      'generationWorkspace.materializedFrom',
    ),
    ...(workspaceMaterializedFrom?.appSpecVersion === appSpec.version
      ? []
      : [
          `generationWorkspace.materializedFrom.appSpecVersion=${String(
            workspaceMaterializedFrom?.appSpecVersion,
          )} 与 AppSpec version=${appSpec.version} 不一致`,
        ]),
    ...(workspaceMaterializedFrom?.staticContractsVersion ===
    staticContracts.contractVersion
      ? []
      : [
          `generationWorkspace.materializedFrom.staticContractsVersion=${String(
            workspaceMaterializedFrom?.staticContractsVersion,
          )} 与 staticContracts.contractVersion=${staticContracts.contractVersion} 不一致`,
        ]),
    ...requireRecord(workspaceWritePolicy, 'generationWorkspace.writePolicy'),
    ...(workspaceWritePolicy?.arbitraryPathWriteAllowed === false
      ? []
      : [
          'generationWorkspace.writePolicy.arbitraryPathWriteAllowed 必须为 false',
        ]),
    ...(workspaceWritePolicy?.traversalGuard === 'resolve-inside-workspace-root'
      ? []
      : [
          'generationWorkspace.writePolicy.traversalGuard 必须为 resolve-inside-workspace-root',
        ]),
    ...(workspaceWritePolicy?.exposesAbsoluteHostPath === false
      ? []
      : [
          'generationWorkspace.writePolicy.exposesAbsoluteHostPath 必须为 false',
        ]),
    ...buildMissingItemsIssues(
      'generationWorkspace.files.path',
      workspaceFilePaths,
      [...GATE_3_REQUIRED_WORKSPACE_FILE_PATHS],
    ),
    ...workspaceFilePaths.flatMap((path, index) =>
      buildSafeRelativePathIssues(
        `generationWorkspace.files[${index}].path`,
        path,
      ),
    ),
    ...requireRecord(
      workspaceArtifactPaths,
      'generationWorkspace.artifactPaths',
    ),
    ...[
      'sourceManifest',
      'sourceArchive',
      'buildOutput',
      'buildManifest',
      'unitReport',
      'componentGoldenReport',
      'coverageSummary',
    ].flatMap((field) =>
      getNonEmptyString(workspaceArtifactPaths?.[field])
        ? buildSafeRelativePathIssues(
            `generationWorkspace.artifactPaths.${field}`,
            getNonEmptyString(workspaceArtifactPaths?.[field]),
          )
        : [`generationWorkspace.artifactPaths.${field} 缺失`],
    ),
  ];
  const commandIds = commandPlan
    .map((command) => getNonEmptyString(command.commandId))
    .filter((commandId): commandId is string => commandId !== null);
  const knownCommandIds = new Set<string>([...GATE_3_REQUIRED_COMMAND_IDS]);
  const commandPlanIssues = [
    ...(commandPlan.length === 0 ? ['commandPlan 不能为空'] : []),
    ...buildMissingItemsIssues('commandPlan.commandId', commandIds, [
      ...expectedRequiredCommandIds,
    ]),
    ...buildUnknownReferenceIssues(
      'commandPlan.commandId',
      commandIds,
      knownCommandIds,
    ),
    ...buildDuplicateItemIssues('commandPlan.commandId', commandIds),
    ...commandPlan.flatMap((command, index) => {
      const commandId = getNonEmptyString(command.commandId);
      const commandText = getNonEmptyString(command.command);
      const expectedCommand =
        commandId && commandId in GATE_3_ALLOWED_COMMAND_BY_ID
          ? GATE_3_ALLOWED_COMMAND_BY_ID[
              commandId as (typeof GATE_3_REQUIRED_COMMAND_IDS)[number]
            ]
          : null;
      const workingDirectory = getNonEmptyString(command.workingDirectory);

      return [
        ...(!commandId ? [`commandPlan[${index}].commandId 缺失`] : []),
        ...(!commandText ? [`commandPlan[${index}].command 缺失`] : []),
        ...(expectedCommand && commandText !== expectedCommand
          ? [`commandPlan[${index}].command 必须为受控命令 ${expectedCommand}`]
          : []),
        ...(!workingDirectory
          ? [`commandPlan[${index}].workingDirectory 缺失`]
          : []),
        ...buildSafeRelativePathIssues(
          `commandPlan[${index}].workingDirectory`,
          workingDirectory,
        ),
        ...(workspaceRelativePath &&
        workingDirectory &&
        workingDirectory !== workspaceRelativePath
          ? [
              `commandPlan[${index}].workingDirectory 必须等于 generationWorkspace.relativePath`,
            ]
          : []),
        ...(getStringArray(command.producesArtifactIds).length === 0
          ? [`commandPlan[${index}].producesArtifactIds 不能为空`]
          : []),
        ...buildUnknownReferenceIssues(
          `commandPlan[${index}].requirementIds`,
          getStringArray(command.requirementIds),
          knownRequirementIds,
        ),
        ...buildUnknownReferenceIssues(
          `commandPlan[${index}].scenarioIds`,
          getStringArray(command.scenarioIds),
          knownScenarioIds,
        ),
      ];
    }),
  ];
  const frontendBuildIssues = [
    ...requireRecord(frontendBuild, 'frontendBuild'),
    ...buildControlledCommandIssues(
      'frontendBuild.command',
      getNonEmptyString(frontendBuild?.command),
      GATE_3_ALLOWED_COMMAND_BY_ID['gate-3-frontend-build-command'],
    ),
    ...(!getNonEmptyString(frontendBuild?.workingDirectory)
      ? ['frontendBuild.workingDirectory 缺失']
      : []),
    ...buildSafeRelativePathIssues(
      'frontendBuild.workingDirectory',
      getNonEmptyString(frontendBuild?.workingDirectory),
    ),
    ...(workspaceRelativePath &&
    getNonEmptyString(frontendBuild?.workingDirectory) &&
    getNonEmptyString(frontendBuild?.workingDirectory) !== workspaceRelativePath
      ? [
          'frontendBuild.workingDirectory 必须等于 generationWorkspace.relativePath',
        ]
      : []),
    ...buildMissingItemsIssues(
      'frontendBuild.routeIds',
      getStringArray(frontendBuild?.routeIds),
      routeIds,
    ),
    ...buildUnknownReferenceIssues(
      'frontendBuild.routeIds',
      getStringArray(frontendBuild?.routeIds),
      knownRouteIds,
    ),
    ...buildMissingItemsIssues(
      'frontendBuild.requirementIds',
      getStringArray(frontendBuild?.requirementIds),
      requirementIds,
    ),
    ...buildUnknownReferenceIssues(
      'frontendBuild.requirementIds',
      getStringArray(frontendBuild?.requirementIds),
      knownRequirementIds,
    ),
    ...buildMissingItemsIssues(
      'frontendBuild.scenarioIds',
      getStringArray(frontendBuild?.scenarioIds),
      scenarioIds,
    ),
    ...buildUnknownReferenceIssues(
      'frontendBuild.scenarioIds',
      getStringArray(frontendBuild?.scenarioIds),
      knownScenarioIds,
    ),
    ...buildMissingItemsIssues(
      'frontendBuild.expectedArtifacts',
      getStringArray(frontendBuild?.expectedArtifacts),
      ['dist/index.html', 'dist/assets/manifest.json'],
    ),
  ];
  const typecheckIssues = [
    ...requireRecord(typecheck, 'typecheck'),
    ...buildControlledCommandIssues(
      'typecheck.command',
      getNonEmptyString(typecheck?.command),
      GATE_3_ALLOWED_COMMAND_BY_ID['gate-3-typecheck-command'],
    ),
    ...(!getNonEmptyString(typecheck?.tsconfigPath)
      ? ['typecheck.tsconfigPath 缺失']
      : []),
    ...buildSafeRelativePathIssues(
      'typecheck.tsconfigPath',
      getNonEmptyString(typecheck?.tsconfigPath),
    ),
    ...buildMissingItemsIssues(
      'typecheck.requirementIds',
      getStringArray(typecheck?.requirementIds),
      requirementIds,
    ),
    ...buildUnknownReferenceIssues(
      'typecheck.requirementIds',
      getStringArray(typecheck?.requirementIds),
      knownRequirementIds,
    ),
  ];
  const unitTestIssues = [
    ...requireRecord(unitTests, 'unitTests'),
    ...buildControlledCommandIssues(
      'unitTests.command',
      getNonEmptyString(unitTests?.command),
      GATE_3_ALLOWED_COMMAND_BY_ID['gate-3-unit-test-command'],
    ),
    ...(!getNonEmptyString(unitTests?.entry) ? ['unitTests.entry 缺失'] : []),
    ...buildSafeRelativePathIssues(
      'unitTests.entry',
      getNonEmptyString(unitTests?.entry),
    ),
    ...buildMissingItemsIssues(
      'unitTests.requirementIds',
      getStringArray(unitTests?.requirementIds),
      requirementIds,
    ),
    ...buildUnknownReferenceIssues(
      'unitTests.requirementIds',
      getStringArray(unitTests?.requirementIds),
      knownRequirementIds,
    ),
    ...buildMissingItemsIssues(
      'unitTests.scenarioIds',
      getStringArray(unitTests?.scenarioIds),
      scenarioIds,
    ),
    ...buildUnknownReferenceIssues(
      'unitTests.scenarioIds',
      getStringArray(unitTests?.scenarioIds),
      knownScenarioIds,
    ),
  ];
  const componentGoldenIssues = [
    ...requireRecord(componentGoldenTests, 'componentGoldenTests'),
    ...buildControlledCommandIssues(
      'componentGoldenTests.command',
      getNonEmptyString(componentGoldenTests?.command),
      GATE_3_ALLOWED_COMMAND_BY_ID['gate-3-component-golden-test-entry'],
    ),
    ...(!getNonEmptyString(componentGoldenTests?.entry)
      ? ['componentGoldenTests.entry 缺失']
      : []),
    ...buildSafeRelativePathIssues(
      'componentGoldenTests.entry',
      getNonEmptyString(componentGoldenTests?.entry),
    ),
    ...(!getNonEmptyString(componentGoldenTests?.goldenArtifactPath)
      ? ['componentGoldenTests.goldenArtifactPath 缺失']
      : []),
    ...buildSafeRelativePathIssues(
      'componentGoldenTests.goldenArtifactPath',
      getNonEmptyString(componentGoldenTests?.goldenArtifactPath),
    ),
    ...buildMissingItemsIssues(
      'componentGoldenTests.scenarioIds',
      getStringArray(componentGoldenTests?.scenarioIds),
      scenarioIds,
    ),
    ...buildUnknownReferenceIssues(
      'componentGoldenTests.scenarioIds',
      getStringArray(componentGoldenTests?.scenarioIds),
      knownScenarioIds,
    ),
  ];
  const artifactIssues = [
    ...(artifactExpectations.length === 0
      ? ['artifactExpectations 不能为空']
      : []),
    ...buildMissingItemsIssues(
      'artifactExpectations.artifactId',
      artifactIds,
      expectedArtifactIds,
    ),
    ...buildUnknownReferenceIssues(
      'artifactExpectations.artifactId',
      artifactIds,
      expectedArtifactIdSet,
    ),
    ...buildDuplicateItemIssues('artifactExpectations.artifactId', artifactIds),
    ...artifactExpectations.flatMap((artifact, index) => [
      ...(!getNonEmptyString(artifact.artifactId)
        ? [`artifactExpectations[${index}].artifactId 缺失`]
        : []),
      ...(!getNonEmptyString(artifact.kind)
        ? [`artifactExpectations[${index}].kind 缺失`]
        : []),
      ...(getNonEmptyString(artifact.kind) &&
      !knownArtifactKinds.has(getNonEmptyString(artifact.kind) ?? '')
        ? [
            `artifactExpectations[${index}].kind 必须是 ${GATE_3_ARTIFACT_KINDS.join(
              ' | ',
            )} 之一`,
          ]
        : []),
      ...(!getNonEmptyString(artifact.path)
        ? [`artifactExpectations[${index}].path 缺失`]
        : []),
      ...buildSafeRelativePathIssues(
        `artifactExpectations[${index}].path`,
        getNonEmptyString(artifact.path),
      ),
      ...(artifact.required === true
        ? []
        : [`artifactExpectations[${index}].required 必须为 true`]),
    ]),
  ];
  const staticCoverageIssues = [
    ...(staticContractsCoverage.length === 0
      ? ['staticContractsCoverage 不能为空']
      : []),
    ...[...GATE_2_STATIC_CONTRACT_IDS]
      .filter(
        (staticContractId) => !coveredStaticContractIds.has(staticContractId),
      )
      .map(
        (staticContractId) =>
          `staticContractsCoverage 缺少 ${staticContractId}`,
      ),
    ...staticContractsCoverage.flatMap((entry, index) => [
      ...(!getNonEmptyString(entry.staticContractId)
        ? [`staticContractsCoverage[${index}].staticContractId 缺失`]
        : []),
      ...buildUnknownReferenceIssues(
        `staticContractsCoverage[${index}].staticContractId`,
        getStringArray([entry.staticContractId]),
        knownStaticContractIds,
      ),
      ...(getStringArray(entry.coveredBy).length === 0
        ? [`staticContractsCoverage[${index}].coveredBy 不能为空`]
        : []),
      ...buildUnknownReferenceIssues(
        `staticContractsCoverage[${index}].coveredBy`,
        getStringArray(entry.coveredBy),
        knownGate3CoverageIds,
      ),
    ]),
  ];
  const scenarioCoverageUnknownScenarioIssues = acceptanceScenarioCoverage
    .map((entry, index) => ({
      index,
      scenarioId: getNonEmptyString(entry.scenarioId),
    }))
    .filter(
      (entry): entry is { index: number; scenarioId: string } =>
        entry.scenarioId !== null && !knownScenarioIds.has(entry.scenarioId),
    )
    .map(
      (entry) =>
        `acceptanceScenarioCoverage[${entry.index}].scenarioId 引用了未知场景 ${formatIssueValue(
          entry.scenarioId,
        )}`,
    );
  const scenarioCoverageIssues = [
    ...(acceptanceScenarioCoverage.length === 0
      ? ['acceptanceScenarioCoverage 不能为空']
      : []),
    ...scenarioCoverageUnknownScenarioIssues,
    ...scenarioIds.flatMap((scenarioId) => {
      const entry = scenarioCoverageById.get(scenarioId);

      if (!entry) {
        return [`场景 ${scenarioId} 缺少 Gate 3 覆盖声明`];
      }

      const expectedRequirementIds =
        appSpec.acceptanceScenarios.find(
          (scenario) => scenario.id === scenarioId,
        )?.requirementIds ?? [];

      return [
        ...buildMissingItemsIssues(
          `acceptanceScenarioCoverage[${scenarioId}].requirementIds`,
          getStringArray(entry.requirementIds),
          expectedRequirementIds,
        ),
        ...buildUnknownReferenceIssues(
          `acceptanceScenarioCoverage[${scenarioId}].requirementIds`,
          getStringArray(entry.requirementIds),
          knownRequirementIds,
        ),
        ...(getStringArray(entry.coveredBy).length === 0
          ? [`acceptanceScenarioCoverage[${scenarioId}].coveredBy 不能为空`]
          : []),
        ...buildUnknownReferenceIssues(
          `acceptanceScenarioCoverage[${scenarioId}].coveredBy`,
          getStringArray(entry.coveredBy),
          knownGate3CoverageIds,
        ),
      ];
    }),
  ];
  const pluginBuildIssues = [
    ...requireRecord(pluginBuildExpectations, 'pluginBuildExpectations'),
    ...(generationPlan.pluginTools.tools.length === 0 &&
    pluginBuildTools.length > 0
      ? ['无插件计划时 pluginBuildExpectations.tools 必须为空']
      : []),
    ...(generationPlan.pluginTools.tools.length === 0 &&
    !getNonEmptyString(pluginBuildExpectations?.emptyReason)
      ? ['无插件计划时 pluginBuildExpectations.emptyReason 必须说明原因']
      : []),
    ...(generationPlan.pluginTools.tools.length > 0 &&
    pluginBuildExpectations?.emptyReason !== null
      ? ['有插件计划时 pluginBuildExpectations.emptyReason 必须为 null']
      : []),
    ...generationPlan.pluginTools.tools
      .filter(
        (plannedTool) =>
          !pluginBuildTools.some(
            (tool) => getNonEmptyString(tool.toolId) === plannedTool.toolId,
          ),
      )
      .map(
        (plannedTool) =>
          `插件/工具 ${formatIssueValue(
            plannedTool.toolId,
          )} 缺少 Gate 3 构建期望`,
      ),
    ...pluginBuildTools.flatMap((tool, index) => {
      const toolId = getNonEmptyString(tool.toolId);
      const plannedTool = toolId ? plannedToolById.get(toolId) : null;

      return [
        ...(!toolId
          ? [`pluginBuildExpectations.tools[${index}].toolId 缺失`]
          : []),
        ...(toolId && !plannedToolIds.has(toolId)
          ? [
              `pluginBuildExpectations.tools[${index}].toolId 引用了未知插件/工具 ${formatIssueValue(
                toolId,
              )}`,
            ]
          : []),
        ...(!getNonEmptyString(tool.command)
          ? [`pluginBuildExpectations.tools[${index}].command 缺失`]
          : []),
        ...buildControlledCommandIssues(
          `pluginBuildExpectations.tools[${index}].command`,
          getNonEmptyString(tool.command),
          GATE_3_ALLOWED_COMMAND_BY_ID['gate-3-plugin-build-command'],
        ),
        ...(!getNonEmptyString(tool.manifestPath)
          ? [`pluginBuildExpectations.tools[${index}].manifestPath 缺失`]
          : []),
        ...buildSafeRelativePathIssues(
          `pluginBuildExpectations.tools[${index}].manifestPath`,
          getNonEmptyString(tool.manifestPath),
        ),
        ...(!getNonEmptyString(tool.nodeDefinitionsPath)
          ? [`pluginBuildExpectations.tools[${index}].nodeDefinitionsPath 缺失`]
          : []),
        ...buildSafeRelativePathIssues(
          `pluginBuildExpectations.tools[${index}].nodeDefinitionsPath`,
          getNonEmptyString(tool.nodeDefinitionsPath),
        ),
        ...(!getNonEmptyString(tool.sourcePath)
          ? [`pluginBuildExpectations.tools[${index}].sourcePath 缺失`]
          : []),
        ...buildSafeRelativePathIssues(
          `pluginBuildExpectations.tools[${index}].sourcePath`,
          getNonEmptyString(tool.sourcePath),
        ),
        ...(!getNonEmptyString(tool.smokeFixturePath)
          ? [`pluginBuildExpectations.tools[${index}].smokeFixturePath 缺失`]
          : []),
        ...buildSafeRelativePathIssues(
          `pluginBuildExpectations.tools[${index}].smokeFixturePath`,
          getNonEmptyString(tool.smokeFixturePath),
        ),
        ...(!getNonEmptyString(tool.buildReportPath)
          ? [`pluginBuildExpectations.tools[${index}].buildReportPath 缺失`]
          : []),
        ...buildSafeRelativePathIssues(
          `pluginBuildExpectations.tools[${index}].buildReportPath`,
          getNonEmptyString(tool.buildReportPath),
        ),
        ...(!getNonEmptyString(tool.artifactPath)
          ? [`pluginBuildExpectations.tools[${index}].artifactPath 缺失`]
          : []),
        ...buildSafeRelativePathIssues(
          `pluginBuildExpectations.tools[${index}].artifactPath`,
          getNonEmptyString(tool.artifactPath),
        ),
        ...(!getNonEmptyString(tool.goldenTestCommand)
          ? [`pluginBuildExpectations.tools[${index}].goldenTestCommand 缺失`]
          : []),
        ...buildControlledCommandIssues(
          `pluginBuildExpectations.tools[${index}].goldenTestCommand`,
          getNonEmptyString(tool.goldenTestCommand),
          GATE_3_ALLOWED_COMMAND_BY_ID['gate-3-plugin-build-command'],
        ),
        ...buildPluginActivationPolicyIssues(
          `pluginBuildExpectations.tools[${index}].activationPolicy`,
          getRecord(tool.activationPolicy),
        ),
        ...(plannedTool
          ? buildMissingItemsIssues(
              `pluginBuildExpectations.tools[${index}].requirementIds`,
              getStringArray(tool.requirementIds),
              plannedTool.requirementIds,
            )
          : []),
        ...buildUnknownReferenceIssues(
          `pluginBuildExpectations.tools[${index}].requirementIds`,
          getStringArray(tool.requirementIds),
          knownRequirementIds,
        ),
      ];
    }),
  ];
  const failureCaptureIssues = [
    ...buildMissingItemsIssues(
      'failureCaptureFields',
      getStringArray(buildUnitPlan.failureCaptureFields),
      [...GATE_3_REQUIRED_FAILURE_CAPTURE_FIELDS],
    ),
  ];

  return [
    {
      id: 'build-unit-plan-version',
      label: 'BuildUnitPlan 版本绑定',
      passed: versionIssues.length === 0,
      summary:
        '检查 buildUnitPlan 是否绑定当前 AppSpec、generationPlan 和 staticContracts。',
      issues: versionIssues,
    },
    {
      id: 'generation-workspace-contract',
      label: 'Generation Workspace 契约',
      passed: workspaceIssues.length === 0,
      summary:
        '检查 Gate 3 是否使用受控 React/Vite/TypeScript workspace 契约、相对路径和 artifact 路径。',
      issues: workspaceIssues,
    },
    {
      id: 'command-plan',
      label: 'Gate 3 命令计划',
      passed: commandPlanIssues.length === 0,
      summary:
        '检查 Gate 3 build/typecheck/unit/component-golden 命令计划、工作目录、产物和需求/场景覆盖。',
      issues: commandPlanIssues,
    },
    {
      id: 'frontend-build-command',
      label: '前端构建命令',
      passed: frontendBuildIssues.length === 0,
      summary:
        '检查 frontend build command、工作目录、页面路由覆盖和预期构建产物。',
      issues: frontendBuildIssues,
    },
    {
      id: 'typecheck-command',
      label: '类型检查命令',
      passed: typecheckIssues.length === 0,
      summary: '检查 TypeScript typecheck command、tsconfig 和需求覆盖。',
      issues: typecheckIssues,
    },
    {
      id: 'unit-test-command',
      label: '单元测试命令',
      passed: unitTestIssues.length === 0,
      summary: '检查 unit test command、测试入口、需求和场景覆盖。',
      issues: unitTestIssues,
    },
    {
      id: 'component-golden-test-entry',
      label: '组件/golden 测试入口',
      passed: componentGoldenIssues.length === 0,
      summary: '检查组件/golden 测试命令、入口、报告 artifact 和场景覆盖。',
      issues: componentGoldenIssues,
    },
    {
      id: 'artifact-expectations',
      label: '构建与测试产物期望',
      passed: artifactIssues.length === 0,
      summary: '检查 Gate 3 期望产出的 build/test/coverage artifacts。',
      issues: artifactIssues,
    },
    {
      id: 'static-contracts-coverage',
      label: 'staticContracts 覆盖',
      passed: staticCoverageIssues.length === 0,
      summary: '检查 Gate 3 skeleton 是否覆盖 Gate 2 静态合约面。',
      issues: staticCoverageIssues,
    },
    {
      id: 'acceptance-scenario-coverage',
      label: 'acceptance scenario 覆盖',
      passed: scenarioCoverageIssues.length === 0,
      summary:
        '检查每条 acceptance scenario 是否连接到 Gate 3 单元或组件/golden 测试入口。',
      issues: scenarioCoverageIssues,
    },
    {
      id: 'plugin-build-expectations',
      label: '插件构建期望',
      passed: pluginBuildIssues.length === 0,
      summary:
        '检查插件构建、manifest、.alp artifact 和 golden test 期望；无插件时必须说明空原因。',
      issues: pluginBuildIssues,
    },
    {
      id: 'failure-capture-fields',
      label: '失败捕获字段',
      passed: failureCaptureIssues.length === 0,
      summary:
        '检查后续真实 build/unit runner 失败时必须捕获 command、exitCode、stdout、stderr、durationMs 和 artifactPath。',
      issues: failureCaptureIssues,
    },
  ];
}

export function buildGate2Checks(
  appSpec: GeneratedAppSpec,
  generationPlan: GeneratedAppGenerationPlan,
  staticContracts: unknown,
): Gate2Check[] {
  if (!isRecord(staticContracts)) {
    return [
      {
        id: 'static-contracts-object',
        label: 'StaticContracts JSON 对象',
        passed: false,
        summary: '检查 generationPlan.staticContracts 是否为结构化 JSON 对象。',
        issues: ['staticContracts 不是对象'],
      },
    ];
  }

  const requirementIds = appSpec.coreRequirements.map(
    (requirement) => requirement.id,
  );
  const pageIds = appSpec.pages.map((page) => page.id);
  const scenarioIds = appSpec.acceptanceScenarios.map(
    (scenario) => scenario.id,
  );
  const knownRequirementIds = new Set(requirementIds);
  const knownPageIds = new Set(pageIds);
  const knownScenarioIds = new Set(scenarioIds);
  const plannedPageIds = new Set(
    generationPlan.frontend.pages.map((page) => page.pageId),
  );
  const plannedPageById = new Map(
    generationPlan.frontend.pages.map((page) => [page.pageId, page]),
  );
  const plannedStepIds = new Set(
    generationPlan.orchestration.steps.map((step) => step.stepId),
  );
  const plannedStepById = new Map(
    generationPlan.orchestration.steps.map((step) => [step.stepId, step]),
  );
  const plannedToolIds = new Set(
    generationPlan.pluginTools.tools.map((tool) => tool.toolId),
  );
  const plannedToolById = new Map(
    generationPlan.pluginTools.tools.map((tool) => [tool.toolId, tool]),
  );
  const requiredFutureGateIds = [
    'gate-3',
    'gate-4',
    'gate-5',
    'gate-6',
    'gate-7',
  ];
  const knownStaticContractIds = new Set<string>([
    ...GATE_2_STATIC_CONTRACT_IDS,
  ]);

  const publicRuntime = getRecord(staticContracts.publicRuntime);
  const publicRuntimeInput = getRecord(publicRuntime?.input);
  const publicRuntimeOutput = getRecord(publicRuntime?.output);
  const frontendRoutes = getRecordArray(staticContracts.frontendRoutes);
  const orchestration = getRecord(staticContracts.orchestration);
  const orchestrationNodes = getRecordArray(orchestration?.nodes);
  const orchestrationEdges = getRecordArray(orchestration?.edges);
  const pluginToolPermissions = getRecord(
    staticContracts.pluginToolPermissions,
  );
  const pluginTools = getRecordArray(pluginToolPermissions?.tools);
  const submissionPersistence = getRecord(
    staticContracts.submissionPersistence,
  );
  const testEntry = getRecord(staticContracts.testEntry);
  const traceability = getRecordArray(staticContracts.traceability);

  const routePageIds = new Set(
    frontendRoutes
      .map((route) => getNonEmptyString(route.pageId))
      .filter((pageId): pageId is string => pageId !== null),
  );
  const nodeIds = orchestrationNodes
    .map((node) => getNonEmptyString(node.nodeId))
    .filter((nodeId): nodeId is string => nodeId !== null);
  const nodeIdsSet = new Set(nodeIds);
  const stepIdsInNodes = new Set(
    orchestrationNodes
      .map((node) => getNonEmptyString(node.stepId))
      .filter((stepId): stepId is string => stepId !== null),
  );
  const graphEdges = orchestrationEdges.map((edge) => ({
    fromNodeId: getNonEmptyString(edge.fromNodeId),
    toNodeId: getNonEmptyString(edge.toNodeId),
  }));
  const traceabilityByRequirementId = new Map(
    traceability
      .map((entry) => {
        const requirementId = getNonEmptyString(entry.requirementId);
        return requirementId ? ([requirementId, entry] as const) : null;
      })
      .filter(
        (entry): entry is readonly [string, Record<string, unknown>] =>
          entry !== null,
      ),
  );

  const versionIssues = [
    ...(staticContracts.contractVersion === 1
      ? []
      : ['contractVersion 必须为 1']),
    ...(staticContracts.appSpecVersion === appSpec.version
      ? []
      : [
          `appSpecVersion=${String(
            staticContracts.appSpecVersion,
          )} 与 AppSpec version=${appSpec.version} 不一致`,
        ]),
    ...(staticContracts.generationPlanVersion === generationPlan.planVersion
      ? []
      : [
          `generationPlanVersion=${String(
            staticContracts.generationPlanVersion,
          )} 与 generationPlan.planVersion=${generationPlan.planVersion} 不一致`,
        ]),
  ];
  const publicRuntimeIssues = [
    ...requireRecord(publicRuntime, 'publicRuntime'),
    ...requireRecord(publicRuntimeInput, 'publicRuntime.input'),
    ...requireRecord(publicRuntimeOutput, 'publicRuntime.output'),
    ...(publicRuntimeInput?.source ===
    generationPlan.orchestration.inputContract.source
      ? []
      : ['publicRuntime.input.source 与 orchestration inputContract 不一致']),
    ...buildMissingItemsIssues(
      'publicRuntime.input.requiredFields',
      getStringArray(publicRuntimeInput?.requiredFields),
      generationPlan.orchestration.inputContract.requiredFields,
    ),
    ...(getStringArray(publicRuntimeInput?.requiredFields).length > 0
      ? []
      : ['publicRuntime.input.requiredFields 不能为空']),
    ...buildMissingItemsIssues(
      'publicRuntime.input.scenarioIds',
      getStringArray(publicRuntimeInput?.scenarioIds),
      generationPlan.orchestration.inputContract.scenarioIds,
    ),
    ...buildUnknownReferenceIssues(
      'publicRuntime.input.scenarioIds',
      getStringArray(publicRuntimeInput?.scenarioIds),
      knownScenarioIds,
    ),
    ...(publicRuntimeInput?.dataUseNoticeRequired ===
    appSpec.dataPolicy.publicSubmissionsPersisted
      ? []
      : [
          'publicRuntime.input.dataUseNoticeRequired 与 AppSpec 数据保存策略不一致',
        ]),
    ...(publicRuntimeInput?.anonymousSessionRequired === true
      ? []
      : ['publicRuntime.input.anonymousSessionRequired 必须为 true']),
    ...(publicRuntimeInput?.endUserLoginRequired ===
    appSpec.dataPolicy.endUserLoginRequired
      ? []
      : ['publicRuntime.input.endUserLoginRequired 与 AppSpec 登录策略不一致']),
    ...buildMissingItemsIssues(
      'publicRuntime.output.destinations',
      getStringArray(publicRuntimeOutput?.destinations),
      generationPlan.orchestration.outputContract.destinations,
    ),
    ...(getStringArray(publicRuntimeOutput?.destinations).length > 0
      ? []
      : ['publicRuntime.output.destinations 不能为空']),
    ...(publicRuntimeOutput?.reportRequired ===
    generationPlan.orchestration.outputContract.reportRequired
      ? []
      : [
          'publicRuntime.output.reportRequired 与 orchestration outputContract 不一致',
        ]),
    ...(publicRuntimeOutput?.errorStateRequired === true
      ? []
      : ['publicRuntime.output.errorStateRequired 必须为 true']),
  ];
  const frontendRouteIssues = [
    ...(frontendRoutes.length === 0 ? ['frontendRoutes 不能为空'] : []),
    ...generationPlan.frontend.pages
      .filter((page) => !routePageIds.has(page.pageId))
      .map((page) => `页面 ${page.pageId} 缺少 frontend route contract`),
    ...frontendRoutes.flatMap((route, index) => {
      const issues: string[] = [];
      const pageId = getNonEmptyString(route.pageId);
      const routePath = getNonEmptyString(route.route);
      const plannedPage = pageId ? plannedPageById.get(pageId) : null;

      if (!pageId) {
        issues.push(`frontendRoutes[${index}].pageId 缺失`);
      } else if (!plannedPageIds.has(pageId) || !knownPageIds.has(pageId)) {
        issues.push(
          `frontendRoutes[${index}].pageId 引用了未知页面 ${formatIssueValue(
            pageId,
          )}`,
        );
      }

      if (!routePath) {
        issues.push(`frontendRoutes[${index}].route 缺失`);
      }

      issues.push(
        ...buildUnknownReferenceIssues(
          `frontendRoutes[${index}].requirementIds`,
          getStringArray(route.requirementIds),
          knownRequirementIds,
        ),
        ...buildUnknownReferenceIssues(
          `frontendRoutes[${index}].scenarioIds`,
          getStringArray(route.scenarioIds),
          knownScenarioIds,
        ),
        ...(plannedPage
          ? [
              ...buildMissingItemsIssues(
                `frontendRoutes[${index}].requirementIds`,
                getStringArray(route.requirementIds),
                plannedPage.requirementIds,
              ),
              ...buildMissingItemsIssues(
                `frontendRoutes[${index}].scenarioIds`,
                getStringArray(route.scenarioIds),
                plannedPage.scenarioIds,
              ),
            ]
          : []),
      );

      return issues;
    }),
  ];
  const orchestrationIssues = [
    ...requireRecord(orchestration, 'orchestration'),
    ...(orchestration?.target === generationPlan.orchestration.target
      ? []
      : ['orchestration.target 与 generationPlan 不一致']),
    ...(orchestration?.strategy === generationPlan.orchestration.strategy
      ? []
      : ['orchestration.strategy 与 generationPlan 不一致']),
    ...(orchestrationNodes.length === 0
      ? ['orchestration.nodes 不能为空']
      : []),
    ...generationPlan.orchestration.steps
      .filter((step) => !stepIdsInNodes.has(step.stepId))
      .map((step) => `编排步骤 ${step.stepId} 缺少 orchestration node`),
    ...orchestrationNodes.flatMap((node, index) => [
      ...(!getNonEmptyString(node.nodeId)
        ? [`orchestration.nodes[${index}].nodeId 缺失`]
        : []),
      ...(!getNonEmptyString(node.stepId)
        ? [`orchestration.nodes[${index}].stepId 缺失`]
        : []),
      ...(getNonEmptyString(node.stepId) &&
      !plannedStepIds.has(getNonEmptyString(node.stepId) ?? '')
        ? [
            `orchestration.nodes[${index}].stepId 引用了未知编排步骤 ${formatIssueValue(
              getNonEmptyString(node.stepId) ?? '',
            )}`,
          ]
        : []),
      ...(!getNonEmptyString(node.inputHandle)
        ? [`orchestration.nodes[${index}].inputHandle 缺失`]
        : []),
      ...(!getNonEmptyString(node.outputHandle)
        ? [`orchestration.nodes[${index}].outputHandle 缺失`]
        : []),
      ...buildUnknownReferenceIssues(
        `orchestration.nodes[${index}].requirementIds`,
        getStringArray(node.requirementIds),
        knownRequirementIds,
      ),
      ...buildUnknownReferenceIssues(
        `orchestration.nodes[${index}].scenarioIds`,
        getStringArray(node.scenarioIds),
        knownScenarioIds,
      ),
      ...(getNonEmptyString(node.stepId) &&
      plannedStepById.has(getNonEmptyString(node.stepId) ?? '')
        ? [
            ...buildMissingItemsIssues(
              `orchestration.nodes[${index}].requirementIds`,
              getStringArray(node.requirementIds),
              plannedStepById.get(getNonEmptyString(node.stepId) ?? '')
                ?.requirementIds ?? [],
            ),
            ...buildMissingItemsIssues(
              `orchestration.nodes[${index}].scenarioIds`,
              getStringArray(node.scenarioIds),
              plannedStepById.get(getNonEmptyString(node.stepId) ?? '')
                ?.scenarioIds ?? [],
            ),
          ]
        : []),
    ]),
    ...buildDuplicateItemIssues('orchestration.nodes.nodeId', nodeIds),
    ...graphEdges.flatMap((edge, index) => [
      ...(!edge.fromNodeId || !nodeIdsSet.has(edge.fromNodeId)
        ? [`orchestration.edges[${index}].fromNodeId 引用了未知节点`]
        : []),
      ...(!edge.toNodeId || !nodeIdsSet.has(edge.toNodeId)
        ? [`orchestration.edges[${index}].toNodeId 引用了未知节点`]
        : []),
    ]),
    ...(isAcyclicGraph(nodeIds, graphEdges)
      ? []
      : ['orchestration.edges 必须形成 DAG，不能存在环']),
  ];
  const pluginPermissionIssues = [
    ...requireRecord(pluginToolPermissions, 'pluginToolPermissions'),
    ...(pluginToolPermissions?.implicitPermissionsAllowed === false
      ? []
      : ['implicitPermissionsAllowed 必须为 false']),
    ...(getStringArray(pluginToolPermissions?.permissionPolicy).length > 0
      ? []
      : ['permissionPolicy 不能为空']),
    ...(generationPlan.pluginTools.tools.length === 0 &&
    !getNonEmptyString(pluginToolPermissions?.emptyReason)
      ? ['插件/工具为空时必须保留 emptyReason']
      : []),
    ...generationPlan.pluginTools.tools
      .filter(
        (plannedTool) =>
          !pluginTools.some(
            (tool) => getNonEmptyString(tool.toolId) === plannedTool.toolId,
          ),
      )
      .map(
        (plannedTool) =>
          `插件/工具 ${formatIssueValue(plannedTool.toolId)} 缺少权限合约`,
      ),
    ...pluginTools.flatMap((tool, index) => {
      const toolId = getNonEmptyString(tool.toolId);
      const plannedTool = toolId ? plannedToolById.get(toolId) : null;

      return [
        ...(!toolId
          ? [`pluginToolPermissions.tools[${index}].toolId 缺失`]
          : []),
        ...(toolId && !plannedToolIds.has(toolId)
          ? [
              `pluginToolPermissions.tools[${index}].toolId 引用了未知插件/工具 ${formatIssueValue(
                toolId,
              )}`,
            ]
          : []),
        ...(!getNonEmptyString(tool.purpose)
          ? [`pluginToolPermissions.tools[${index}].purpose 缺失`]
          : []),
        ...(getStringArray(tool.permissions).length === 0
          ? [`pluginToolPermissions.tools[${index}].permissions 不能为空`]
          : []),
        ...(tool.manifestRequired === true
          ? []
          : [
              `pluginToolPermissions.tools[${index}].manifestRequired 必须为 true`,
            ]),
        ...(tool.sandboxSmokeTestRequired === true
          ? []
          : [
              `pluginToolPermissions.tools[${index}].sandboxSmokeTestRequired 必须为 true`,
            ]),
        ...buildUnknownReferenceIssues(
          `pluginToolPermissions.tools[${index}].requirementIds`,
          getStringArray(tool.requirementIds),
          knownRequirementIds,
        ),
        ...(plannedTool
          ? [
              ...buildMissingItemsIssues(
                `pluginToolPermissions.tools[${index}].requirementIds`,
                getStringArray(tool.requirementIds),
                plannedTool.requirementIds,
              ),
              ...buildMissingItemsIssues(
                `pluginToolPermissions.tools[${index}].permissions`,
                getStringArray(tool.permissions),
                plannedTool.permissionNotes,
              ),
            ]
          : []),
      ];
    }),
  ];
  const submissionPersistenceIssues = [
    ...requireRecord(submissionPersistence, 'submissionPersistence'),
    ...buildBooleanMirrorIssue(
      submissionPersistence,
      'publicSubmissionsPersisted',
      generationPlan.dataPersistence.publicSubmissionsPersisted,
    ),
    ...buildBooleanMirrorIssue(
      submissionPersistence,
      'creatorCanDeleteSubmissions',
      generationPlan.dataPersistence.creatorCanDeleteSubmissions,
    ),
    ...buildBooleanMirrorIssue(
      submissionPersistence,
      'endUserLoginRequired',
      generationPlan.dataPersistence.endUserLoginRequired,
    ),
    ...['tenantScoped', 'tokenSnapshotRequired', 'softDeleteRequired'].flatMap(
      (field) => buildBooleanMirrorIssue(submissionPersistence, field, true),
    ),
    ...buildMissingItemsIssues(
      'submissionPersistence.fields',
      getStringArray(submissionPersistence?.fields),
      [
        'input',
        'result',
        'report',
        'errorMessage',
        'anonymousSessionId',
        'publicShareToken',
      ],
    ),
  ];
  const testEntryIssues = [
    ...requireRecord(testEntry, 'testEntry'),
    ...[
      'staticCheckCommand',
      'buildGateCommand',
      'unitGateCommand',
      'integrationGateCommand',
      'browserGateCommand',
      'verifierGateCommand',
      'publishCandidateGateCommand',
    ].flatMap((field) =>
      getNonEmptyString(testEntry?.[field]) ? [] : [`testEntry.${field} 缺失`],
    ),
    ...buildMissingItemsIssues(
      'testEntry.blockingGateIds',
      getStringArray(testEntry?.blockingGateIds),
      requiredFutureGateIds,
    ),
    ...buildUnknownReferenceIssues(
      'testEntry.blockingGateIds',
      getStringArray(testEntry?.blockingGateIds),
      new Set(requiredFutureGateIds),
    ),
    ...buildMissingItemsIssues(
      'testEntry.acceptanceScenarioIds',
      getStringArray(testEntry?.acceptanceScenarioIds),
      scenarioIds,
    ),
    ...buildUnknownReferenceIssues(
      'testEntry.acceptanceScenarioIds',
      getStringArray(testEntry?.acceptanceScenarioIds),
      knownScenarioIds,
    ),
  ];
  const traceabilityUnknownRequirementIssues = traceability
    .map((entry, index) => ({
      index,
      requirementId: getNonEmptyString(entry.requirementId),
    }))
    .filter(
      (entry): entry is { index: number; requirementId: string } =>
        entry.requirementId !== null &&
        !knownRequirementIds.has(entry.requirementId),
    )
    .map(
      (entry) =>
        `traceability[${entry.index}].requirementId 引用了未知需求 ${formatIssueValue(
          entry.requirementId,
        )}`,
    );
  const traceabilityIssues = [
    ...traceabilityUnknownRequirementIssues,
    ...requirementIds.flatMap((requirementId) => {
      const entry = traceabilityByRequirementId.get(requirementId);
      const plannedTraceability = generationPlan.traceability.find(
        (candidate) => candidate.requirementId === requirementId,
      );
      const expectedNodeIds =
        plannedTraceability?.orchestrationStepIds.map(
          (stepId) => `node-${buildPlanSegment(stepId)}`,
        ) ?? [];

      if (!entry) {
        return [`需求 ${requirementId} 缺少 static contract traceability`];
      }

      return [
        ...buildMissingItemsIssues(
          `traceability[${requirementId}].scenarioIds`,
          getStringArray(entry.scenarioIds),
          plannedTraceability?.scenarioIds ?? [],
        ),
        ...buildMissingItemsIssues(
          `traceability[${requirementId}].pageIds`,
          getStringArray(entry.pageIds),
          plannedTraceability?.pageIds ?? [],
        ),
        ...buildMissingItemsIssues(
          `traceability[${requirementId}].orchestrationNodeIds`,
          getStringArray(entry.orchestrationNodeIds),
          expectedNodeIds,
        ),
        ...buildMissingItemsIssues(
          `traceability[${requirementId}].staticContractIds`,
          getStringArray(entry.staticContractIds),
          [...GATE_2_STATIC_CONTRACT_IDS],
        ),
        ...buildUnknownReferenceIssues(
          `traceability[${requirementId}].staticContractIds`,
          getStringArray(entry.staticContractIds),
          knownStaticContractIds,
        ),
        ...buildUnknownReferenceIssues(
          `traceability[${requirementId}].scenarioIds`,
          getStringArray(entry.scenarioIds),
          knownScenarioIds,
        ),
        ...buildUnknownReferenceIssues(
          `traceability[${requirementId}].pageIds`,
          getStringArray(entry.pageIds),
          routePageIds,
        ),
        ...buildUnknownReferenceIssues(
          `traceability[${requirementId}].orchestrationNodeIds`,
          getStringArray(entry.orchestrationNodeIds),
          nodeIdsSet,
        ),
      ];
    }),
  ];

  return [
    {
      id: 'version-binding',
      label: '静态合约版本绑定',
      passed: versionIssues.length === 0,
      summary: '检查 staticContracts 是否绑定当前 AppSpec 和 generationPlan。',
      issues: versionIssues,
    },
    {
      id: 'public-runtime-contract',
      label: 'public runtime 输入输出合约',
      passed: publicRuntimeIssues.length === 0,
      summary: '检查公开运行输入、输出、数据用途提示和匿名提交约束。',
      issues: publicRuntimeIssues,
    },
    {
      id: 'frontend-route-contract',
      label: 'frontend route/page 合约',
      passed: frontendRouteIssues.length === 0,
      summary: `检查 ${generationPlan.frontend.pages.length} 个页面是否都有 route/page contract。`,
      issues: frontendRouteIssues,
    },
    {
      id: 'orchestration-contract',
      label: 'Workflow/Agent 编排合约',
      passed: orchestrationIssues.length === 0,
      summary: `检查 ${generationPlan.orchestration.steps.length} 个编排步骤是否有节点、边和输入输出合约。`,
      issues: orchestrationIssues,
    },
    {
      id: 'plugin-permission-contract',
      label: '插件/工具权限合约',
      passed: pluginPermissionIssues.length === 0,
      summary: '检查插件/工具 manifest、权限策略和 sandbox smoke test 硬门槛。',
      issues: pluginPermissionIssues,
    },
    {
      id: 'submission-persistence-contract',
      label: 'submission persistence 合约',
      passed: submissionPersistenceIssues.length === 0,
      summary: '检查公开提交持久化、租户归属、token 快照和软删除字段。',
      issues: submissionPersistenceIssues,
    },
    {
      id: 'test-entry-contract',
      label: '测试入口合约',
      passed: testEntryIssues.length === 0,
      summary: '检查 Gate 3-7 后续测试入口和 acceptance scenario 覆盖。',
      issues: testEntryIssues,
    },
    {
      id: 'traceability-contract',
      label: '静态合约 traceability',
      passed: traceabilityIssues.length === 0,
      summary: `检查 ${appSpec.coreRequirements.length} 条核心需求是否连接到静态合约证据。`,
      issues: traceabilityIssues,
    },
  ];
}
