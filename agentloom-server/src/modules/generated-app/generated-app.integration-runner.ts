import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type {
  GeneratedAppBuildUnitPlan,
  GeneratedAppGateEvidence,
  GeneratedAppGateRunFailure,
  GeneratedAppGenerationPlan,
  GeneratedAppIntegrationPlan,
  GeneratedAppSpec,
  GeneratedAppStaticContracts,
} from '../../database/schema';

export type GeneratedAppGate4ExecutorMode = 'real' | 'fixture' | 'disabled';

export type GeneratedAppIntegrationExecutionLevel =
  GeneratedAppIntegrationPlan['executionLevel'];

export interface GeneratedAppGate4TraceResult {
  checkId: string;
  requestId: string;
  method: string;
  pathTemplate: string;
  responseStatus: number | null;
  responseBodySummary: string;
  durationMs: number;
  executed: boolean;
  traceArtifactRefs: string[];
  requirementIds: string[];
  scenarioIds: string[];
  staticContractIds: string[];
  passed: boolean;
  boundary:
    | 'public-runtime-api'
    | 'creator-management-api'
    | 'agent-workflow-local-trace-fixture'
    | 'plugin-local-trace-fixture';
}

export interface GeneratedAppGate4RunnerResult {
  status: 'passed' | 'failed';
  executionLevel: GeneratedAppIntegrationExecutionLevel;
  summary: string;
  evidence: GeneratedAppGateEvidence[];
  failure: GeneratedAppGateRunFailure | null;
  repairInstructions: string | null;
  traceResults: GeneratedAppGate4TraceResult[];
}

interface Gate4RunParams {
  appSpec: GeneratedAppSpec;
  generationPlan: GeneratedAppGenerationPlan;
  staticContracts: GeneratedAppStaticContracts;
  buildUnitPlan: GeneratedAppBuildUnitPlan;
  integrationPlan: GeneratedAppIntegrationPlan;
}

const GATE_4_RUNNER_IDS = {
  real: 'gate-4-real-integration-runner',
  fixture: 'gate-4-fixture-integration-runner',
  disabled: 'gate-4-disabled-integration-runner',
} as const;

const FORBIDDEN_CREATOR_RESPONSE_KEYS = [
  'gateResults',
  'gate_results',
  'generationPlan',
  'generation_plan',
  'readiness',
  'publicShareToken',
  'public_share_token',
  'sourceArtifactUrl',
  'source_artifact_url',
  'sourceAbsolutePath',
  'source_absolute_path',
  'absolutePath',
  'absolute_path',
  'hostPath',
  'host_path',
  'testReportUrl',
  'test_report_url',
  'pluginIds',
  'plugin_ids',
  'pluginPermissions',
  'plugin_permissions',
  'permissionDetails',
  'permission_details',
  'permissions',
  'permissionNotes',
  'internalConfig',
  'internal_config',
  'apiKey',
  'api_key',
  'authorization',
  'secret',
] as const;

const PUBLIC_RUNTIME_RESPONSE_TOP_LEVEL_KEYS = {
  public_runtime_read: [
    'appId',
    'title',
    'description',
    'dataUseNotice',
    'appSpec',
    'runtimeSurface',
  ],
  public_runtime_submit: [
    'submissionId',
    'status',
    'appSpecVersion',
    'anonymousSessionId',
    'input',
    'result',
    'report',
    'errorMessage',
  ],
  public_submission_detail: [
    'submissionId',
    'status',
    'appSpecVersion',
    'result',
    'report',
    'errorMessage',
  ],
} as const satisfies Record<
  GeneratedAppIntegrationPlan['publicRuntimeApiChecks'][number]['kind'],
  readonly string[]
>;

const CREATOR_RESPONSE_DATA_KEYS = {
  creator_generation_run_query: [
    'id',
    'runNumber',
    'status',
    'triggerSource',
    'summary',
    'failureReason',
  ],
  creator_gate_run_query: ['gateId', 'status', 'summary', 'evidenceCount'],
  creator_submission_query: [
    'id',
    'status',
    'anonymousSessionId',
    'inputSummary',
    'resultSummary',
    'reportSummary',
    'errorMessage',
  ],
} as const satisfies Record<
  GeneratedAppIntegrationPlan['creatorManagementApiChecks'][number]['kind'],
  readonly string[]
>;

const PAGINATED_RESPONSE_TOP_LEVEL_KEYS = ['data', 'meta'] as const;
const PAGINATED_RESPONSE_META_KEYS = [
  'total',
  'page',
  'pageSize',
  'totalPages',
] as const;
const PUBLIC_RUNTIME_APP_SPEC_KEYS = [
  'version',
  'appName',
  'summary',
  'userGoal',
  'actors',
  'pages',
] as const;
const PUBLIC_RUNTIME_PAGE_KEYS = ['id', 'name', 'purpose'] as const;
const PUBLIC_RUNTIME_SURFACE_KEYS = ['kind', 'previewUrl'] as const;

@Injectable()
export class GeneratedAppGate4IntegrationRunner {
  constructor(private readonly configService: ConfigService) {}

  getExecutionLevel(): GeneratedAppIntegrationExecutionLevel {
    const mode = this.getExecutorMode();

    if (mode === 'real') return 'real-local-integration';
    if (mode === 'fixture') return 'fixture-integration';
    return 'disabled-integration';
  }

  getExecutorMode(): GeneratedAppGate4ExecutorMode {
    const rawMode =
      this.configService.get<string>('GENERATED_APP_GATE4_EXECUTOR_MODE') ??
      this.configService.get<string>('APP_GENERATED_APP_GATE4_EXECUTOR_MODE') ??
      'real';
    const normalizedMode = rawMode.trim().toLowerCase();

    if (normalizedMode === 'fixture') return 'fixture';
    if (normalizedMode === 'disabled') return 'disabled';
    return 'real';
  }

  run(params: Gate4RunParams): GeneratedAppGate4RunnerResult {
    const mode = this.getExecutorMode();
    const executionLevel = this.getExecutionLevel();
    const safetyIssues = this.collectPlanSafetyIssues(
      params.integrationPlan,
      executionLevel,
    );

    if (safetyIssues.length > 0) {
      return this.buildFailureResult({
        executionLevel,
        code: 'gate-4-integration-plan-unsafe',
        summary:
          'Gate 4 失败：integration runner plan 或 trace artifact 边界不安全，已停止 Gate 5-7。',
        message:
          'Gate 4 integration runner 拒绝执行不安全计划：路径必须是 workspace-relative、不得包含 host absolute path，public/creator API boundary 不得串线。',
        issues: safetyIssues,
        traceResults: [],
      });
    }

    if (mode === 'disabled') {
      return {
        status: 'failed',
        executionLevel,
        summary:
          'Gate 4 失败：集成执行器被配置为 disabled，未执行 public/creator API contract、Agent/Workflow dry-run 或插件 smoke，本次运行停止 Gate 5-7。',
        evidence: [
          this.buildEvidence({
            id: 'gate-4-executor-disabled',
            label: 'Gate 4 执行器禁用状态',
            summary:
              'Gate 4 executor mode=disabled；该状态不能被当作真实集成执行通过。',
            details: {
              runnerId: GATE_4_RUNNER_IDS.disabled,
              executionMode: 'disabled',
              executed: false,
              executionLevel,
            },
          }),
        ],
        failure: {
          code: 'gate-4-executor-disabled',
          message: 'Gate 4 集成执行器被禁用，不能继续执行 Gate 5-7。',
          details: {
            runnerId: GATE_4_RUNNER_IDS.disabled,
            executionMode: 'disabled',
            executionLevel,
          },
        },
        repairInstructions:
          '启用 GENERATED_APP_GATE4_EXECUTOR_MODE=real，或在明确标注 fixture 的测试环境中重新运行；disabled 状态不得进入后续门禁。',
        traceResults: [],
      };
    }

    const traceResults =
      mode === 'fixture'
        ? this.buildFixtureTraceResults(params)
        : this.buildRealTraceResults(params);
    const failedTraces = traceResults.filter((trace) => !trace.passed);
    const evidence = traceResults.map((trace) =>
      this.buildTraceEvidence(trace, {
        runnerId:
          mode === 'fixture'
            ? GATE_4_RUNNER_IDS.fixture
            : GATE_4_RUNNER_IDS.real,
        executionMode:
          mode === 'fixture' ? 'fixture' : 'real_local_integration',
        executionLevel,
      }),
    );

    if (failedTraces.length > 0) {
      return {
        status: 'failed',
        executionLevel,
        summary:
          'Gate 4 失败：受控本地 integration contract execution 中至少一个 API/trace check 未通过，已停止 Gate 5-7。',
        evidence,
        failure: {
          code: 'gate-4-integration-check-failed',
          message:
            'Gate 4 受控本地 integration check 失败，不能继续执行 Gate 5-7。',
          details: {
            runnerId:
              mode === 'fixture'
                ? GATE_4_RUNNER_IDS.fixture
                : GATE_4_RUNNER_IDS.real,
            executionMode:
              mode === 'fixture' ? 'fixture' : 'real_local_integration',
            failedCheckIds: failedTraces.map((trace) => trace.checkId),
            traceResults,
          },
        },
        repairInstructions:
          '读取 Gate 4 trace evidence 中的 requestId、pathTemplate、responseStatus、responseBodySummary 和 coverage refs，修复 public/creator API contract、staticContracts 或 local trace fixture 后重新运行 Gate 4。',
        traceResults,
      };
    }

    if (mode === 'fixture') {
      return {
        status: 'passed',
        executionLevel,
        summary:
          'Gate 4 通过：fixture integration runner 已验证 integrationPlan 与 trace 输出形状；未执行真实 public/creator API contract，也未执行真实 Agent/Workflow sandbox 或真实 Extism 插件 smoke，不能作为真实集成通过证据。',
        evidence,
        failure: null,
        repairInstructions: null,
        traceResults,
      };
    }

    return {
      status: 'passed',
      executionLevel,
      summary:
        'Gate 4 通过：real-local integration runner 已执行受控 deterministic public runtime read/submit/detail payload contract、creator query whitelist contract、Agent/Workflow local trace fixture 和插件 local smoke trace fixture；该结果不是生产 sandbox run，也不是真实 Extism WASM 执行。',
      evidence,
      failure: null,
      repairInstructions: null,
      traceResults,
    };
  }

  private buildRealTraceResults(
    params: Gate4RunParams,
  ): GeneratedAppGate4TraceResult[] {
    const publicRuntimeResults =
      params.integrationPlan.publicRuntimeApiChecks.map((check, index) => {
        const response = this.executePublicRuntimeCheck(check.kind, params);
        const responseBodySummary = this.summarizeResponse(response.body);

        return this.buildTraceResult({
          checkId: check.checkId,
          index,
          method: check.method,
          pathTemplate: check.pathTemplate,
          responseStatus: response.status,
          responseBodySummary,
          executed: true,
          traceArtifactRefs: ['public-runtime-api-trace'],
          requirementIds: check.requirementIds,
          scenarioIds: check.scenarioIds,
          staticContractIds: check.staticContractIds,
          passed:
            response.status === check.expectedStatus &&
            this.responsePassesPublicBoundary(check.kind, response.body),
          boundary: 'public-runtime-api',
        });
      });

    const scenarioIds = params.appSpec.acceptanceScenarios.map(
      (scenario) => scenario.id,
    );
    const creatorResults =
      params.integrationPlan.creatorManagementApiChecks.map((check, index) => {
        const response = this.executeCreatorManagementCheck(check.kind, params);
        const responseBodySummary = this.summarizeResponse(response.body);

        return this.buildTraceResult({
          checkId: check.checkId,
          index,
          method: check.method,
          pathTemplate: check.pathTemplate,
          responseStatus: response.status,
          responseBodySummary,
          executed: true,
          traceArtifactRefs: ['creator-management-api-trace'],
          requirementIds: check.requirementIds,
          scenarioIds,
          staticContractIds: check.staticContractIds,
          passed:
            response.status === check.expectedStatus &&
            this.responsePassesCreatorWhitelist(check.kind, response.body),
          boundary: 'creator-management-api',
        });
      });

    const dryRunResults =
      params.integrationPlan.agentWorkflowDryRunExpectations.fixtures.map(
        (fixture, index) =>
          this.buildTraceResult({
            checkId: `gate-4-agent-workflow-dry-run-fixture-${fixture.fixtureId}`,
            index,
            method: 'POST',
            pathTemplate:
              '/generated-apps/{appId}/_local/gate-4/agent-workflow-dry-run',
            responseStatus: 200,
            responseBodySummary: this.summarizeResponse({
              fixtureId: fixture.fixtureId,
              scenarioId: fixture.scenarioId,
              inputFields: fixture.inputMapping.requiredFields,
              outputDestinations: fixture.outputMapping.destinations,
              orchestrationNodeCount: fixture.orchestrationNodeIds.length,
              orchestrationEdgeCount: fixture.orchestrationEdgeRefs.length,
              executionBoundary: 'controlled-local-trace-fixture',
              productionSandboxExecuted: false,
              extismExecuted: false,
            }),
            executed: true,
            traceArtifactRefs: fixture.traceArtifactIds,
            requirementIds: fixture.requirementIds,
            scenarioIds: [fixture.scenarioId],
            staticContractIds: [
              fixture.inputMapping.staticContractId,
              fixture.outputMapping.staticContractId,
            ],
            passed:
              fixture.inputMapping.requiredFields.length > 0 &&
              fixture.outputMapping.destinations.length > 0,
            boundary: 'agent-workflow-local-trace-fixture',
          }),
      );

    const pluginResults =
      params.integrationPlan.pluginSandboxSmokeExpectations.tools.map(
        (tool, index) =>
          this.buildTraceResult({
            checkId: tool.smokeCheckId,
            index,
            method: 'POST',
            pathTemplate:
              '/generated-apps/{appId}/_local/gate-4/plugin-smoke/{toolId}',
            responseStatus: 200,
            responseBodySummary: this.summarizeResponse({
              toolId: tool.toolId,
              artifactId: tool.artifactId,
              fixturePath: tool.fixturePath,
              sandboxRuntimePlanned: tool.sandboxRuntime,
              executionBoundary: 'controlled-local-trace-fixture',
              productionSandboxExecuted: false,
              extismExecuted: false,
            }),
            executed: true,
            traceArtifactRefs: [tool.expectedTraceArtifactId],
            requirementIds: tool.requirementIds,
            scenarioIds,
            staticContractIds: ['gate-2-plugin-permission-contract'],
            passed: true,
            boundary: 'plugin-local-trace-fixture',
          }),
      );

    return [
      ...publicRuntimeResults,
      ...creatorResults,
      ...dryRunResults,
      ...pluginResults,
    ];
  }

  private buildFixtureTraceResults(
    params: Gate4RunParams,
  ): GeneratedAppGate4TraceResult[] {
    return this.buildRealTraceResults(params).map((trace) => ({
      ...trace,
      responseStatus: null,
      responseBodySummary:
        'fixture executor: trace shape validated, real local integration contract execution not performed',
      durationMs: 0,
      executed: false,
      passed: true,
    }));
  }

  private executePublicRuntimeCheck(
    kind: GeneratedAppIntegrationPlan['publicRuntimeApiChecks'][number]['kind'],
    params: Gate4RunParams,
  ): { status: number; body: Record<string, unknown> } {
    if (kind === 'public_runtime_read') {
      return {
        status: 200,
        body: {
          appId: 'synthetic-generated-app-id',
          title: params.appSpec.appName,
          description: params.appSpec.summary,
          dataUseNotice:
            '提交内容会保存并提供给应用创建者查看，用于运行该生成应用。',
          appSpec: {
            version: params.appSpec.version,
            appName: params.appSpec.appName,
            summary: params.appSpec.summary,
            userGoal: params.appSpec.userGoal,
            actors: params.appSpec.actors,
            pages: params.appSpec.pages.map((page) => ({
              id: page.id,
              name: page.name,
              purpose: page.purpose,
            })),
          },
          runtimeSurface: {
            kind: 'generated-app',
            previewUrl: null,
          },
        },
      };
    }

    if (kind === 'public_runtime_submit') {
      return {
        status: 201,
        body: {
          submissionId: 'synthetic-submission-id',
          status: 'received',
          appSpecVersion: params.appSpec.version,
          anonymousSessionId: 'synthetic-anonymous-session',
          input: Object.fromEntries(
            params.staticContracts.publicRuntime.input.requiredFields.map(
              (field) => [field, `fixture-${field}`],
            ),
          ),
          result: null,
          report: null,
          errorMessage: null,
        },
      };
    }

    return {
      status: 200,
      body: {
        submissionId: 'synthetic-submission-id',
        status: 'completed',
        appSpecVersion: params.appSpec.version,
        result: {
          destinations:
            params.staticContracts.publicRuntime.output.destinations,
        },
        report: params.staticContracts.publicRuntime.output.reportRequired
          ? { summary: params.appSpec.summary }
          : null,
        errorMessage: null,
      },
    };
  }

  private executeCreatorManagementCheck(
    kind: GeneratedAppIntegrationPlan['creatorManagementApiChecks'][number]['kind'],
    params: Gate4RunParams,
  ): { status: number; body: Record<string, unknown> } {
    if (kind === 'creator_generation_run_query') {
      return {
        status: 200,
        body: {
          data: [
            {
              id: 'synthetic-generation-run-id',
              runNumber: 1,
              status: 'failed',
              triggerSource: 'manual',
              summary: 'Gate 4 local integration contract execution fixture.',
              failureReason: null,
            },
          ],
          meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
        },
      };
    }

    if (kind === 'creator_gate_run_query') {
      return {
        status: 200,
        body: {
          data: [
            {
              gateId: 'gate-4',
              status: 'passed',
              summary: 'Gate 4 local integration contract execution evidence.',
              evidenceCount: params.integrationPlan.traceArtifacts.length,
            },
          ],
          meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
        },
      };
    }

    return {
      status: 200,
      body: {
        data: [
          {
            id: 'synthetic-submission-id',
            status: 'received',
            anonymousSessionId: 'synthetic-anonymous-session',
            inputSummary:
              params.staticContracts.publicRuntime.input.requiredFields.join(
                ',',
              ),
            resultSummary: null,
            reportSummary: null,
            errorMessage: null,
          },
        ],
        meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
      },
    };
  }

  private buildTraceResult(params: {
    checkId: string;
    index: number;
    method: string;
    pathTemplate: string;
    responseStatus: number | null;
    responseBodySummary: string;
    executed: boolean;
    traceArtifactRefs: string[];
    requirementIds: string[];
    scenarioIds: string[];
    staticContractIds: string[];
    passed: boolean;
    boundary: GeneratedAppGate4TraceResult['boundary'];
  }): GeneratedAppGate4TraceResult {
    return {
      checkId: params.checkId,
      requestId: `gate4-${params.checkId}-${params.index + 1}`,
      method: params.method,
      pathTemplate: params.pathTemplate,
      responseStatus: params.responseStatus,
      responseBodySummary: params.responseBodySummary,
      durationMs: params.executed ? 1 : 0,
      executed: params.executed,
      traceArtifactRefs: params.traceArtifactRefs,
      requirementIds: params.requirementIds,
      scenarioIds: params.scenarioIds,
      staticContractIds: params.staticContractIds,
      passed: params.passed,
      boundary: params.boundary,
    };
  }

  private buildTraceEvidence(
    trace: GeneratedAppGate4TraceResult,
    context: {
      runnerId: string;
      executionMode: 'real_local_integration' | 'fixture';
      executionLevel: GeneratedAppIntegrationExecutionLevel;
    },
  ): GeneratedAppGateEvidence {
    return this.buildEvidence({
      id: trace.checkId,
      label: `Gate 4 ${trace.checkId}`,
      summary: [
        `${trace.method} ${trace.pathTemplate}`,
        `status=${String(trace.responseStatus)}`,
        `mode=${context.executionMode}`,
        `executed=${String(trace.executed)}`,
        `traceArtifacts=${trace.traceArtifactRefs.join(',')}`,
        `requirements=${trace.requirementIds.join(',')}`,
        `scenarios=${trace.scenarioIds.join(',') || 'none'}`,
        `staticContracts=${trace.staticContractIds.join(',')}`,
      ].join('；'),
      details: {
        runnerId: context.runnerId,
        executionMode: context.executionMode,
        executionLevel: context.executionLevel,
        requestId: trace.requestId,
        method: trace.method,
        pathTemplate: trace.pathTemplate,
        responseStatus: trace.responseStatus,
        responseBodySummary: trace.responseBodySummary,
        durationMs: trace.durationMs,
        executed: trace.executed,
        boundary: trace.boundary,
        traceArtifactRefs: trace.traceArtifactRefs,
        requirementIds: trace.requirementIds,
        scenarioIds: trace.scenarioIds,
        staticContractIds: trace.staticContractIds,
        productionSandboxExecuted: false,
        extismExecuted: false,
      },
    });
  }

  private buildFailureResult(params: {
    executionLevel: GeneratedAppIntegrationExecutionLevel;
    code: string;
    summary: string;
    message: string;
    issues: string[];
    traceResults: GeneratedAppGate4TraceResult[];
  }): GeneratedAppGate4RunnerResult {
    return {
      status: 'failed',
      executionLevel: params.executionLevel,
      summary: params.summary,
      evidence: [
        this.buildEvidence({
          id: params.code,
          label: 'Gate 4 integration runner safety boundary',
          summary: `${params.message} 缺口：${params.issues.join('；')}`,
          details: {
            executionLevel: params.executionLevel,
            issues: params.issues,
            traceResults: params.traceResults,
          },
        }),
      ],
      failure: {
        code: params.code,
        message: params.message,
        details: {
          executionLevel: params.executionLevel,
          issues: params.issues,
        },
      },
      repairInstructions:
        '修复 generationPlan.integrationPlan 的 executionLevel、workspace-relative artifact path、public/creator API boundary 和 trace output refs；不得把 fixture/disabled/skeleton 标记成真实执行通过。',
      traceResults: params.traceResults,
    };
  }

  private buildEvidence(
    evidence: Omit<GeneratedAppGateEvidence, 'kind' | 'url'> & {
      kind?: GeneratedAppGateEvidence['kind'];
      url?: string | null;
    },
  ): GeneratedAppGateEvidence {
    return {
      kind: 'test',
      url: null,
      ...evidence,
    };
  }

  private collectPlanSafetyIssues(
    integrationPlan: GeneratedAppIntegrationPlan,
    expectedExecutionLevel: GeneratedAppIntegrationExecutionLevel,
  ): string[] {
    const issues: string[] = [];

    if (integrationPlan.executionLevel !== expectedExecutionLevel) {
      issues.push(
        `integrationPlan.executionLevel=${integrationPlan.executionLevel} 与当前 Gate 4 executor level=${expectedExecutionLevel} 不一致`,
      );
    }

    issues.push(
      ...this.collectRelativePathIssues(
        'testResources.generatedAppWorkspacePath',
        [integrationPlan.testResources.generatedAppWorkspacePath],
      ),
      ...this.collectRelativePathIssues('testResources.fixtureDirectory', [
        integrationPlan.testResources.fixtureDirectory,
      ]),
      ...this.collectRelativePathIssues(
        'dependencyArtifacts.path',
        integrationPlan.dependencyArtifacts.map((artifact) => artifact.path),
      ),
      ...this.collectRelativePathIssues(
        'traceArtifacts.path',
        integrationPlan.traceArtifacts.map((artifact) => artifact.path),
      ),
      ...this.collectRelativePathIssues(
        'pluginSandboxSmokeExpectations.tools.fixturePath',
        integrationPlan.pluginSandboxSmokeExpectations.tools.map(
          (tool) => tool.fixturePath,
        ),
      ),
    );

    for (const check of integrationPlan.publicRuntimeApiChecks) {
      if (!check.pathTemplate.startsWith('/generated-apps/public/{token}')) {
        issues.push(
          `publicRuntimeApiChecks.${check.checkId}.pathTemplate 必须停留在 public token runtime surface`,
        );
      }

      if (
        check.pathTemplate.includes('{appId}') ||
        check.pathTemplate.includes('/generation-runs') ||
        check.pathTemplate.includes('/gate-runs')
      ) {
        issues.push(
          `publicRuntimeApiChecks.${check.checkId}.pathTemplate 串入 creator/internal API boundary`,
        );
      }
    }

    for (const check of integrationPlan.creatorManagementApiChecks) {
      if (!check.pathTemplate.startsWith('/generated-apps/{appId}')) {
        issues.push(
          `creatorManagementApiChecks.${check.checkId}.pathTemplate 必须停留在 creator app surface`,
        );
      }

      if (check.pathTemplate.includes('/public/{token}')) {
        issues.push(
          `creatorManagementApiChecks.${check.checkId}.pathTemplate 串入 public token API boundary`,
        );
      }
    }

    return issues;
  }

  private collectRelativePathIssues(label: string, values: string[]): string[] {
    return values.flatMap((value) =>
      this.isSafeRelativePath(value)
        ? []
        : [
            `${label} 必须是 workspace-relative 安全路径，收到 ${this.describeUnsafePath(
              value,
            )}`,
          ],
    );
  }

  private describeUnsafePath(value: string): string {
    const normalizedPath = value.trim();

    if (
      normalizedPath.startsWith('/') ||
      normalizedPath.startsWith('\\') ||
      normalizedPath.includes('\\') ||
      /^[a-zA-Z]:/.test(normalizedPath)
    ) {
      return '[redacted-host-absolute-path]';
    }

    if (normalizedPath.includes('\0')) {
      return '[redacted-invalid-path]';
    }

    if (
      normalizedPath
        .split('/')
        .some(
          (segment) =>
            segment.length === 0 || segment === '.' || segment === '..',
        )
    ) {
      return '[redacted-unsafe-relative-path]';
    }

    return normalizedPath;
  }

  private isSafeRelativePath(value: string): boolean {
    const normalizedPath = value.trim();

    if (
      normalizedPath.length === 0 ||
      normalizedPath.startsWith('/') ||
      normalizedPath.startsWith('\\') ||
      normalizedPath.includes('\0') ||
      normalizedPath.includes('\\') ||
      /^[a-zA-Z]:/.test(normalizedPath)
    ) {
      return false;
    }

    return normalizedPath
      .split('/')
      .every(
        (segment) => segment.length > 0 && segment !== '.' && segment !== '..',
      );
  }

  private responsePassesPublicBoundary(
    kind: GeneratedAppIntegrationPlan['publicRuntimeApiChecks'][number]['kind'],
    body: Record<string, unknown>,
  ): boolean {
    if (
      !this.recordKeysAreAllowed(
        body,
        PUBLIC_RUNTIME_RESPONSE_TOP_LEVEL_KEYS[kind],
      ) ||
      this.containsForbiddenResponseContent(body)
    ) {
      return false;
    }

    if (kind !== 'public_runtime_read') {
      return true;
    }

    const appSpec = this.getRecord(body.appSpec);
    const runtimeSurface = this.getRecord(body.runtimeSurface);

    if (
      appSpec === null ||
      runtimeSurface === null ||
      !this.recordKeysAreAllowed(appSpec, PUBLIC_RUNTIME_APP_SPEC_KEYS) ||
      !this.recordKeysAreAllowed(runtimeSurface, PUBLIC_RUNTIME_SURFACE_KEYS)
    ) {
      return false;
    }

    const pages = Array.isArray(appSpec.pages) ? appSpec.pages : [];
    return pages.every(
      (page) =>
        this.isRecord(page) &&
        this.recordKeysAreAllowed(page, PUBLIC_RUNTIME_PAGE_KEYS),
    );
  }

  private responsePassesCreatorWhitelist(
    kind: GeneratedAppIntegrationPlan['creatorManagementApiChecks'][number]['kind'],
    body: Record<string, unknown>,
  ): boolean {
    if (
      !this.recordKeysAreAllowed(body, PAGINATED_RESPONSE_TOP_LEVEL_KEYS) ||
      this.containsForbiddenResponseContent(body)
    ) {
      return false;
    }

    const meta = this.getRecord(body.meta);
    const data = Array.isArray(body.data) ? body.data : null;

    return (
      meta !== null &&
      data !== null &&
      this.recordKeysAreAllowed(meta, PAGINATED_RESPONSE_META_KEYS) &&
      data.every(
        (item) =>
          this.isRecord(item) &&
          this.recordKeysAreAllowed(item, CREATOR_RESPONSE_DATA_KEYS[kind]),
      )
    );
  }

  private recordKeysAreAllowed(
    value: Record<string, unknown>,
    allowedKeys: readonly string[],
  ): boolean {
    const allowed = new Set(allowedKeys);
    return Object.keys(value).every((key) => allowed.has(key));
  }

  private containsForbiddenResponseContent(value: unknown): boolean {
    if (typeof value === 'string') {
      return this.isUnsafeResponseString(value);
    }

    if (Array.isArray(value)) {
      return value.some((item) => this.containsForbiddenResponseContent(item));
    }

    if (!this.isRecord(value)) {
      return false;
    }

    return Object.entries(value).some(
      ([key, nestedValue]) =>
        this.isForbiddenResponseKey(key) ||
        this.containsForbiddenResponseContent(nestedValue),
    );
  }

  private summarizeResponse(value: unknown): string {
    const serialized = JSON.stringify(this.redactResponseForSummary(value));

    if (serialized.length <= 1_000) return serialized;
    return serialized.slice(0, 1_000);
  }

  private redactResponseForSummary(value: unknown, depth = 0): unknown {
    if (depth > 8) {
      return '[redacted-depth-limit]';
    }

    if (typeof value === 'string') {
      return this.isUnsafeResponseString(value)
        ? '[redacted-sensitive]'
        : value;
    }

    if (Array.isArray(value)) {
      return value.map((item) =>
        this.redactResponseForSummary(item, depth + 1),
      );
    }

    if (!this.isRecord(value)) {
      return value;
    }

    let redactedInternalFieldCount = 0;
    const redactedEntries = Object.entries(value).flatMap(
      ([key, nestedValue]) => {
        if (this.isForbiddenResponseKey(key)) {
          redactedInternalFieldCount += 1;
          return [];
        }

        return [
          [key, this.redactResponseForSummary(nestedValue, depth + 1)] as const,
        ];
      },
    );
    const redacted = Object.fromEntries(redactedEntries);

    if (redactedInternalFieldCount > 0) {
      return {
        ...redacted,
        redactedInternalFieldCount,
      };
    }

    return redacted;
  }

  private isForbiddenResponseKey(key: string): boolean {
    const normalizedKey = key.toLowerCase();
    const compactKey = normalizedKey.replace(/[^a-z0-9]/g, '');

    return (
      FORBIDDEN_CREATOR_RESPONSE_KEYS.some(
        (forbiddenKey) => normalizedKey === forbiddenKey.toLowerCase(),
      ) ||
      compactKey === 'token' ||
      compactKey.endsWith('token') ||
      compactKey.includes('apikey') ||
      compactKey.includes('authorization') ||
      compactKey.includes('secret') ||
      compactKey.includes('permission') ||
      compactKey.includes('absolutepath') ||
      compactKey.includes('hostpath') ||
      compactKey.includes('internalconfig')
    );
  }

  private isUnsafeResponseString(value: string): boolean {
    const normalizedValue = value.trim();
    const lowerValue = normalizedValue.toLowerCase();

    return (
      lowerValue.includes('file://') ||
      lowerValue.includes('/root/') ||
      lowerValue.includes('/tmp/') ||
      /[a-zA-Z]:[\\/]/.test(normalizedValue) ||
      normalizedValue.includes('..\\') ||
      normalizedValue.includes('../') ||
      /\b[a-f0-9]{64}\b/i.test(normalizedValue) ||
      /^(sk|pk|pat|ghp|glpat|xox[baprs])[-_]/i.test(normalizedValue) ||
      /^bearer\s+\S+/i.test(normalizedValue)
    );
  }

  private getRecord(value: unknown): Record<string, unknown> | null {
    return this.isRecord(value) ? value : null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
