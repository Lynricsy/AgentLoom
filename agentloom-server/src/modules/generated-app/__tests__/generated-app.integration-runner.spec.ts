import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import type {
  GeneratedAppBuildUnitPlan,
  GeneratedAppGenerationPlan,
  GeneratedAppIntegrationPlan,
  GeneratedAppSpec,
  GeneratedAppStaticContracts,
} from '../../../database/schema';
import {
  buildBuildUnitPlan,
  buildGenerationPlan,
  buildStaticContracts,
} from '../plan-builders/generation-plan.builder';
import {
  buildIntegrationPlan,
  evaluateGate4IntegrationPlan,
} from '../plan-builders/integration-plan.builder';
import { GeneratedAppGate3WorkspaceRunner } from '../generated-app.workspace';
import { GeneratedAppGate4IntegrationRunner } from '../generated-app.integration-runner';
import { buildGeneratedAppRuntimeForm } from '../generated-app.runtime';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const APP_ID = '33333333-3333-4333-8333-333333333333';

function createConfigService(
  overrides: Record<string, string | undefined> = {},
): ConfigService {
  return {
    get: (key: string) => {
      if (Object.prototype.hasOwnProperty.call(overrides, key)) {
        return overrides[key];
      }

      return undefined;
    },
  } as unknown as ConfigService;
}

function createAppSpec(): GeneratedAppSpec {
  return {
    version: 1,
    appName: '自动化中医问诊系统',
    summary: '围绕问诊需求生成的业务应用。',
    userGoal: '自动化中医问诊系统',
    actors: ['创建者', '终端用户'],
    coreRequirements: [{ id: 'req-1', text: '自动化中医问诊系统' }],
    pages: [
      {
        id: 'page-public-runtime',
        name: '公开运行页',
        purpose: '终端用户使用定制应用。',
      },
    ],
    dataPolicy: {
      publicSubmissionsPersisted: true,
      creatorCanDeleteSubmissions: true,
      endUserLoginRequired: false,
    },
    nonGoals: ['不绕过 AgentLoom 租户隔离和发布门禁。'],
    acceptanceScenarios: [
      {
        id: 'scenario-1',
        title: '提交问诊输入',
        requirementIds: ['req-1'],
        given: ['终端用户打开公开运行页'],
        when: ['提交问诊输入'],
        then: ['系统保存提交并返回处理状态'],
      },
    ],
    traceability: [
      {
        requirementId: 'req-1',
        scenarioIds: ['scenario-1'],
        evidenceIds: ['app-spec-draft'],
      },
    ],
  };
}

function buildBuildUnitPlanForTest(
  appSpec: GeneratedAppSpec,
  generationPlan: GeneratedAppGenerationPlan,
  staticContracts: GeneratedAppStaticContracts,
  gate3Runner: GeneratedAppGate3WorkspaceRunner,
  executionLevel = gate3Runner.getExecutionLevel(),
): GeneratedAppBuildUnitPlan {
  const workspace = gate3Runner.buildWorkspaceContract({
    tenantId: 'test-tenant',
    appId: 'test-app',
    generationRunId: 'test-run',
    appSpec,
    staticContracts,
  });
  const commandPlan = gate3Runner.buildCommandPlan({
    workspace,
    requirementIds: appSpec.coreRequirements.map(
      (requirement) => requirement.id,
    ),
    scenarioIds: appSpec.acceptanceScenarios.map((scenario) => scenario.id),
  });

  return buildBuildUnitPlan(
    appSpec,
    generationPlan,
    staticContracts,
    workspace,
    commandPlan,
    executionLevel,
  );
}

function buildGate4Plans(
  executionLevel: GeneratedAppIntegrationPlan['executionLevel'],
) {
  const appSpec = createAppSpec();
  const gate3Runner = new GeneratedAppGate3WorkspaceRunner(
    createConfigService(),
  );
  const generationPlan = buildGenerationPlan(appSpec);
  const staticContracts = buildStaticContracts(appSpec, generationPlan);
  const buildUnitPlan = {
    ...buildBuildUnitPlanForTest(
      appSpec,
      generationPlan,
      staticContracts,
      gate3Runner,
    ),
    executionLevel: 'real-local-command-plan' as const,
  };
  const integrationPlan = buildIntegrationPlan(
    appSpec,
    generationPlan,
    staticContracts,
    buildUnitPlan,
    executionLevel,
  );

  return {
    appSpec,
    generationPlan,
    staticContracts,
    buildUnitPlan,
    integrationPlan,
  };
}

describe('GeneratedAppGate4IntegrationRunner', () => {
  it('real 模式应执行受控本地 public/creator/API trace contract 并保留覆盖引用', () => {
    const runner = new GeneratedAppGate4IntegrationRunner(
      createConfigService(),
    );
    const plans = buildGate4Plans('real-local-integration');

    const result = runner.run(plans);

    expect(runner.getExecutorMode()).toBe('real');
    expect(runner.getExecutionLevel()).toBe('real-local-integration');
    expect(result.status).toBe('passed');
    expect(result.executionLevel).toBe('real-local-integration');
    expect(result.summary).toContain('real-local integration runner');
    expect(result.traceResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          checkId: 'gate-4-public-runtime-read',
          requestId: 'gate4-gate-4-public-runtime-read-1',
          method: 'GET',
          pathTemplate: '/generated-apps/public/{token}',
          responseStatus: 200,
          executed: true,
          boundary: 'public-runtime-api',
          traceArtifactRefs: ['public-runtime-api-trace'],
          requirementIds: ['req-1'],
          scenarioIds: ['scenario-1'],
          staticContractIds: expect.arrayContaining([
            'gate-2-public-runtime-contract',
          ]),
        }),
        expect.objectContaining({
          checkId: 'gate-4-creator-generation-run-query',
          boundary: 'creator-management-api',
          executed: true,
        }),
        expect.objectContaining({
          checkId: 'gate-4-agent-workflow-dry-run-fixture-fixture-scenario-1',
          boundary: 'agent-workflow-local-trace-fixture',
          executed: true,
        }),
      ]),
    );
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'gate-4-public-runtime-read',
          details: expect.objectContaining({
            runnerId: 'gate-4-real-integration-runner',
            executionMode: 'real_local_integration',
            responseStatus: 200,
            executed: true,
            productionSandboxExecuted: false,
            extismExecuted: false,
            traceArtifactRefs: ['public-runtime-api-trace'],
          }),
        }),
      ]),
    );
    expect(JSON.stringify(result)).not.toContain('/root/');
    expect(JSON.stringify(result)).not.toContain('/tmp/');
    expect(JSON.stringify(result)).not.toContain('publicShareToken');
    expect(JSON.stringify(result)).not.toContain('permissionNotes');
  });

  it('fixture 模式只能标记 trace shape passed，不能伪装成真实执行', () => {
    const runner = new GeneratedAppGate4IntegrationRunner(
      createConfigService({
        GENERATED_APP_GATE4_EXECUTOR_MODE: 'fixture',
      }),
    );
    const plans = buildGate4Plans('fixture-integration');

    const result = runner.run(plans);

    expect(runner.getExecutorMode()).toBe('fixture');
    expect(result.status).toBe('passed');
    expect(result.executionLevel).toBe('fixture-integration');
    expect(result.summary).toContain('不能作为真实集成通过证据');
    expect(result.traceResults.every((trace) => !trace.executed)).toBe(true);
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          details: expect.objectContaining({
            runnerId: 'gate-4-fixture-integration-runner',
            executionMode: 'fixture',
            executionLevel: 'fixture-integration',
            executed: false,
          }),
        }),
      ]),
    );
  });

  it('disabled 模式应失败并明确禁止继续后续门禁', () => {
    const runner = new GeneratedAppGate4IntegrationRunner(
      createConfigService({
        APP_GENERATED_APP_GATE4_EXECUTOR_MODE: 'disabled',
      }),
    );
    const plans = buildGate4Plans('disabled-integration');

    const result = runner.run(plans);

    expect(runner.getExecutorMode()).toBe('disabled');
    expect(result.status).toBe('failed');
    expect(result.executionLevel).toBe('disabled-integration');
    expect(result.failure).toEqual(
      expect.objectContaining({
        code: 'gate-4-executor-disabled',
        message: expect.stringContaining('不能继续执行 Gate 5-7'),
      }),
    );
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'gate-4-executor-disabled',
          details: expect.objectContaining({
            runnerId: 'gate-4-disabled-integration-runner',
            executed: false,
          }),
        }),
      ]),
    );
  });

  it('real 模式应拒绝 unsafe path 与 public/creator API boundary 串线', () => {
    const runner = new GeneratedAppGate4IntegrationRunner(
      createConfigService(),
    );
    const plans = buildGate4Plans('real-local-integration');
    const unsafePlan: GeneratedAppIntegrationPlan = {
      ...plans.integrationPlan,
      executionLevel: 'fixture-integration',
      testResources: {
        ...plans.integrationPlan.testResources,
        generatedAppWorkspacePath: `/root/${TENANT_ID}/${APP_ID}`,
        fixtureDirectory: '../fixtures',
      },
      publicRuntimeApiChecks: plans.integrationPlan.publicRuntimeApiChecks.map(
        (check, index) =>
          index === 0
            ? {
                ...check,
                pathTemplate: '/generated-apps/{appId}/gate-runs',
              }
            : check,
      ),
      creatorManagementApiChecks:
        plans.integrationPlan.creatorManagementApiChecks.map((check, index) =>
          index === 0
            ? {
                ...check,
                pathTemplate: '/generated-apps/public/{token}/submissions',
              }
            : check,
        ),
      traceArtifacts: plans.integrationPlan.traceArtifacts.map(
        (artifact, index) =>
          index === 0
            ? {
                ...artifact,
                path: '/tmp/gate-4/public-runtime-api-trace.json',
              }
            : artifact,
      ),
      dependencyArtifacts: plans.integrationPlan.dependencyArtifacts.map(
        (artifact, index) =>
          index === 0
            ? {
                ...artifact,
                path: 'C:\\temp\\generated-app\\artifact.json',
              }
            : artifact,
      ),
    };

    const result = runner.run({
      ...plans,
      integrationPlan: unsafePlan,
    });

    expect(result.status).toBe('failed');
    expect(result.failure).toEqual(
      expect.objectContaining({
        code: 'gate-4-integration-plan-unsafe',
      }),
    );
    expect(result.failure?.details).toEqual(
      expect.objectContaining({
        issues: expect.arrayContaining([
          expect.stringContaining('executionLevel=fixture-integration'),
          expect.stringContaining(
            'testResources.generatedAppWorkspacePath 必须是 workspace-relative',
          ),
          expect.stringContaining(
            'testResources.fixtureDirectory 必须是 workspace-relative',
          ),
          expect.stringContaining(
            'traceArtifacts.path 必须是 workspace-relative',
          ),
          expect.stringContaining('publicRuntimeApiChecks'),
          expect.stringContaining('creatorManagementApiChecks'),
        ]),
      }),
    );
    expect(JSON.stringify(result)).not.toContain('/root/11111111');
    expect(JSON.stringify(result)).not.toContain('/tmp/gate-4');
    expect(JSON.stringify(result)).not.toContain('../fixtures');
    expect(JSON.stringify(result)).not.toContain('C:\\temp');
  });

  it('real 模式应将 creator response whitelist 泄露判为失败并脱敏 evidence', () => {
    const runner = new GeneratedAppGate4IntegrationRunner(
      createConfigService(),
    );
    const runnerInternals = runner as unknown as {
      executeCreatorManagementCheck: () => {
        status: number;
        body: Record<string, unknown>;
      };
    };
    runnerInternals.executeCreatorManagementCheck = () => ({
      status: 200,
      body: {
        data: [
          {
            id: 'synthetic-generation-run-id',
            runNumber: 1,
            status: 'failed',
            triggerSource: 'manual',
            summary: 'Leaky creator response fixture.',
            failureReason: null,
            publicShareToken: 'a'.repeat(64),
            sourceArtifactUrl: '/root/generated-app/source.tar.zst',
            permissions: { network: true },
            internalConfig: { provider: 'fixture' },
          },
        ],
        meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
      },
    });
    const plans = buildGate4Plans('real-local-integration');

    const result = runner.run(plans);
    const failureDetails = result.failure?.details as
      | { failedCheckIds?: string[] }
      | undefined;
    const serializedResult = JSON.stringify(result);

    expect(result.status).toBe('failed');
    expect(result.failure).toEqual(
      expect.objectContaining({
        code: 'gate-4-integration-check-failed',
      }),
    );
    expect(failureDetails?.failedCheckIds).toEqual(
      expect.arrayContaining([
        'gate-4-creator-generation-run-query',
        'gate-4-creator-gate-run-query',
        'gate-4-creator-submission-query',
      ]),
    );
    expect(serializedResult).not.toContain('publicShareToken');
    expect(serializedResult).not.toContain('sourceArtifactUrl');
    expect(serializedResult).not.toContain('permissions');
    expect(serializedResult).not.toContain('internalConfig');
    expect(serializedResult).not.toContain('a'.repeat(64));
    expect(serializedResult).not.toContain('/root/generated-app');
  });

  it('real 模式应将 public runtimeForm 白名单泄露判为失败并脱敏 evidence', () => {
    const runner = new GeneratedAppGate4IntegrationRunner(
      createConfigService(),
    );
    const plans = buildGate4Plans('real-local-integration');
    const runtimeForm = buildGeneratedAppRuntimeForm({
      appSpec: plans.appSpec,
      generationPlan: plans.generationPlan,
      description: plans.appSpec.summary,
    });
    const runnerInternals = runner as unknown as {
      executePublicRuntimeCheck: (
        kind: GeneratedAppIntegrationPlan['publicRuntimeApiChecks'][number]['kind'],
      ) => {
        status: number;
        body: Record<string, unknown>;
      };
    };

    runnerInternals.executePublicRuntimeCheck = (kind) => {
      if (kind === 'public_runtime_submit') {
        return {
          status: 201,
          body: {
            submissionId: 'synthetic-submission-id',
            status: 'received',
            appSpecVersion: plans.appSpec.version,
            anonymousSessionId: 'synthetic-anonymous-session',
            input: { chiefComplaint: 'fixture-chiefComplaint' },
            result: null,
            report: null,
            errorMessage: null,
          },
        };
      }

      if (kind === 'public_submission_detail') {
        return {
          status: 200,
          body: {
            submissionId: 'synthetic-submission-id',
            status: 'completed',
            appSpecVersion: plans.appSpec.version,
            result: { summary: 'ok' },
            report: { summary: 'ok' },
            errorMessage: null,
          },
        };
      }

      return {
        status: 200,
        body: {
          appId: 'synthetic-generated-app-id',
          title: plans.appSpec.appName,
          description: plans.appSpec.summary,
          dataUseNotice:
            '提交内容会保存并提供给应用创建者查看，用于运行该生成应用。',
          appSpec: {
            version: plans.appSpec.version,
            appName: plans.appSpec.appName,
            summary: plans.appSpec.summary,
            userGoal: plans.appSpec.userGoal,
            actors: plans.appSpec.actors,
            pages: plans.appSpec.pages.map((page) => ({
              id: page.id,
              name: page.name,
              purpose: page.purpose,
            })),
          },
          runtimeSurface: {
            kind: 'generated-app',
            previewUrl: null,
          },
          runtimeForm: {
            ...runtimeForm,
            publicShareToken: 'a'.repeat(64),
            fields: runtimeForm.fields.map((field, index) =>
              index === 0
                ? {
                    ...field,
                    sourceArtifactUrl: '/root/generated-app/source.tar.zst',
                  }
                : field,
            ),
          },
        },
      };
    };

    const result = runner.run(plans);
    const failureDetails = result.failure?.details as
      | { failedCheckIds?: string[] }
      | undefined;
    const serializedResult = JSON.stringify(result);

    expect(result.status).toBe('failed');
    expect(failureDetails?.failedCheckIds).toContain(
      'gate-4-public-runtime-read',
    );
    expect(serializedResult).not.toContain('publicShareToken');
    expect(serializedResult).not.toContain('sourceArtifactUrl');
    expect(serializedResult).not.toContain('/root/generated-app');
    expect(serializedResult).not.toContain('a'.repeat(64));
  });

  it('real 模式遇到受控 contract check 不匹配时应返回 runner failure', () => {
    const runner = new GeneratedAppGate4IntegrationRunner(
      createConfigService(),
    );
    const plans = buildGate4Plans('real-local-integration');
    const failingPlan: GeneratedAppIntegrationPlan = {
      ...plans.integrationPlan,
      publicRuntimeApiChecks: plans.integrationPlan.publicRuntimeApiChecks.map(
        (check, index) =>
          index === 0 ? { ...check, expectedStatus: 202 } : check,
      ),
    };

    const result = runner.run({
      ...plans,
      integrationPlan: failingPlan,
    });

    expect(result.status).toBe('failed');
    expect(result.failure).toEqual(
      expect.objectContaining({
        code: 'gate-4-integration-check-failed',
        message: expect.stringContaining('不能继续执行 Gate 5-7'),
        details: expect.objectContaining({
          failedCheckIds: ['gate-4-public-runtime-read'],
        }),
      }),
    );
    expect(result.traceResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          checkId: 'gate-4-public-runtime-read',
          responseStatus: 200,
          passed: false,
          executed: true,
        }),
      ]),
    );
  });
  it.each([
    'integration-skeleton',
    'fixture-integration',
    'real-local-integration',
  ] as const)('builder 应接受 %s execution level 的完整计划', (level) => {
    const plans = buildGate4Plans(level);
    const evaluation = evaluateGate4IntegrationPlan(
      plans.appSpec,
      plans.generationPlan,
      plans.staticContracts,
      plans.buildUnitPlan,
      plans.integrationPlan,
    );

    expect(evaluation.status).toBe('passed');
    expect(evaluation.failure).toBeNull();
    expect(evaluation.evidence.length).toBeGreaterThan(5);
  });

  it('builder 应为私有插件与缺省 workspace/traceability 生成完整的集成引用', () => {
    const appSpec: GeneratedAppSpec = {
      ...createAppSpec(),
      traceability: [],
    };
    const generationPlan = buildGenerationPlan(appSpec);
    const generationPlanWithPlugin: GeneratedAppGenerationPlan = {
      ...generationPlan,
      pluginTools: {
        ...generationPlan.pluginTools,
        tools: [
          {
            toolId: 'tool-intake-score',
            purpose: '对公开问诊输入生成结构化评分。',
            requirementIds: ['req-1'],
            permissionNotes: ['禁止隐式网络、存储、知识库或 LLM 权限。'],
          },
        ],
        emptyReason: null,
      },
    };
    const staticContracts = buildStaticContracts(
      appSpec,
      generationPlanWithPlugin,
    );
    const gate3Runner = new GeneratedAppGate3WorkspaceRunner(
      createConfigService(),
    );
    const builtUnitPlan = buildBuildUnitPlanForTest(
      appSpec,
      generationPlanWithPlugin,
      staticContracts,
      gate3Runner,
    );
    const buildUnitPlan = {
      ...builtUnitPlan,
      generationWorkspace: undefined,
    } as unknown as GeneratedAppBuildUnitPlan;

    const integrationPlan = buildIntegrationPlan(
      appSpec,
      generationPlanWithPlugin,
      staticContracts,
      buildUnitPlan,
      'real-local-integration',
    );
    const evaluation = evaluateGate4IntegrationPlan(
      appSpec,
      generationPlanWithPlugin,
      staticContracts,
      buildUnitPlan,
      integrationPlan,
    );

    expect(integrationPlan.testResources.generatedAppWorkspacePath).toBe(
      'generated-app-workspace',
    );
    expect(integrationPlan.requirementCoverage).toEqual([
      expect.objectContaining({
        requirementId: 'req-1',
        scenarioIds: [],
        coveredByCheckIds: expect.arrayContaining([
          'gate-4-plugin-smoke-tool-intake-score',
        ]),
      }),
    ]);
    expect(integrationPlan.pluginSandboxSmokeExpectations).toEqual({
      tools: [
        expect.objectContaining({
          toolId: 'tool-intake-score',
          artifactId: 'plugin-bundle-tool-intake-score',
          expectedTraceArtifactId: 'plugin-smoke-trace-tool-intake-score',
          sandboxRuntime: 'wasm-extism',
        }),
      ],
      emptyReason: null,
    });
    expect(integrationPlan.traceArtifacts).toContainEqual(
      expect.objectContaining({
        artifactId: 'plugin-smoke-trace-tool-intake-score',
        kind: 'plugin_sandbox_smoke_trace',
      }),
    );
    expect(evaluation.status).toBe('passed');
    expect(evaluation.repairInstructions).toBeNull();
  });

  it('builder 应聚合缺省 route、workspace、command、evidence 与 plugin policy 缺口', () => {
    const plans = buildGate4Plans('real-local-integration');
    const malformedPlan = {
      ...plans.integrationPlan,
      planVersion: 2,
      appSpecVersion: 2,
      generationPlanVersion: 2,
      staticContractsVersion: 2,
      buildUnitPlanVersion: 2,
      skeletonDisclaimer: '',
      testTenant: {
        tenantKind: 'production',
        tenantAlias: '',
        authMode: 'bearer',
        usesRealTokens: true,
        noProductionResources: false,
      },
      testResources: {
        resourceIsolation: 'shared',
        usesRealTokens: true,
        generatedAppWorkspacePath: '',
        fixtureDirectory: '',
        requiredScenarioIds: [],
      },
      publicRuntimeApiChecks: [
        {
          checkId: '',
          kind: '',
          method: 'DELETE',
          pathTemplate: '',
          staticContractIds: [],
          requirementIds: [],
          scenarioIds: [],
          expectedStatus: 500,
          payloadContractRefs: [],
        },
        {
          ...plans.integrationPlan.publicRuntimeApiChecks[0],
          checkId: 'unknown-public-check',
          kind: 'public_runtime_submit',
          pathTemplate: '/generated-apps/{appId}/generation-runs',
        },
      ],
      creatorManagementApiChecks: [
        {
          checkId: '',
          kind: '',
          method: 'POST',
          pathTemplate: '',
          staticContractIds: [],
          requirementIds: [],
          expectedStatus: 201,
        },
        {
          ...plans.integrationPlan.creatorManagementApiChecks[0],
          checkId: 'unknown-creator-check',
          kind: 'creator_gate_run_query',
          pathTemplate: '/generated-apps/public/{token}',
        },
      ],
      agentWorkflowDryRunExpectations: {
        expectationLevel: 'production',
        orchestrationNodeIds: [],
        orchestrationEdgeRefs: [],
        fixtures: [
          {
            fixtureId: '',
            scenarioId: '',
            requirementIds: [],
            orchestrationNodeIds: [],
            orchestrationEdgeRefs: [],
            inputMapping: null,
            outputMapping: null,
            traceArtifactIds: [],
          },
        ],
      },
      pluginSandboxSmokeExpectations: {
        tools: [
          {
            toolId: '',
            smokeCheckId: '',
            artifactId: '',
            fixturePath: '',
            expectedTraceArtifactId: '',
            requirementIds: [],
            sandboxRuntime: 'node',
          },
        ],
        emptyReason: '',
      },
      dependencyArtifacts: [
        {
          artifactId: '',
          kind: '',
          sourceGateId: 'gate-2',
          path: '',
          required: false,
        },
      ],
      acceptanceScenarioCoverage: [
        {
          scenarioId: '',
          requirementIds: [],
          coveredByCheckIds: [],
          fixtureIds: [],
        },
      ],
      requirementCoverage: [
        {
          requirementId: '',
          scenarioIds: [],
          coveredByCheckIds: [],
          dependencyArtifactIds: [],
        },
      ],
      orchestrationCoverage: [
        {
          nodeId: '',
          edgeRefs: [],
          coveredByFixtureIds: [],
          coveredByCheckIds: [],
        },
      ],
      traceArtifacts: [
        {
          artifactId: '',
          kind: '',
          path: '',
          producedByCheckIds: [],
        },
      ],
      failureCaptureFields: [],
    } as unknown as GeneratedAppIntegrationPlan;

    const evaluation = evaluateGate4IntegrationPlan(
      plans.appSpec,
      plans.generationPlan,
      plans.staticContracts,
      plans.buildUnitPlan,
      malformedPlan,
    );
    const failureDetails = JSON.stringify(evaluation.failure?.details);

    expect(evaluation.status).toBe('failed');
    expect(evaluation.failure?.code).toBe('integration-plan-incomplete');
    expect(evaluation.repairInstructions).toContain('integrationPlan');
    expect(failureDetails).toContain('planVersion 必须为 1');
    expect(failureDetails).toContain('testTenant.tenantAlias 缺失');
    expect(failureDetails).toContain(
      'testResources.generatedAppWorkspacePath 缺失',
    );
    expect(failureDetails).toContain(
      'publicRuntimeApiChecks[0].pathTemplate 缺失',
    );
    expect(failureDetails).toContain(
      'creatorManagementApiChecks[0].method 必须为 GET',
    );
    expect(failureDetails).toContain(
      'agentWorkflowDryRunExpectations.fixtures[0].inputMapping',
    );
    expect(failureDetails).toContain(
      'pluginSandboxSmokeExpectations.tools[0].sandboxRuntime 必须为 wasm-extism',
    );
    expect(failureDetails).toContain(
      'dependencyArtifacts[0].required 必须为 true',
    );
    expect(failureDetails).toContain(
      'acceptanceScenarioCoverage[0].scenarioId 缺失',
    );
    expect(failureDetails).toContain(
      'requirementCoverage[0].requirementId 缺失',
    );
    expect(failureDetails).toContain('orchestrationCoverage[0].nodeId 缺失');
    expect(failureDetails).toContain(
      'traceArtifacts[0].producedByCheckIds 不能为空',
    );
    expect(failureDetails).toContain('failureCaptureFields');
  });
  it.each([
    {
      name: '非对象计划',
      mutate: () => null,
      issue: 'integrationPlan 不是对象',
    },
    {
      name: '未知且缺失 public check id',
      mutate: (plan: GeneratedAppIntegrationPlan) => ({
        ...plan,
        publicRuntimeApiChecks: plan.publicRuntimeApiChecks.map(
          (check, index) =>
            index === 0
              ? { ...check, checkId: 'gate-4-unknown-public' }
              : check,
        ),
      }),
      issue: 'gate-4-unknown-public',
    },
    {
      name: '重复 creator check id',
      mutate: (plan: GeneratedAppIntegrationPlan) => ({
        ...plan,
        creatorManagementApiChecks: [
          ...plan.creatorManagementApiChecks,
          plan.creatorManagementApiChecks[0],
        ],
      }),
      issue: '重复',
    },
    {
      name: '缺少 trace artifacts',
      mutate: (plan: GeneratedAppIntegrationPlan) => ({
        ...plan,
        traceArtifacts: [],
      }),
      issue: 'traceArtifacts',
    },
    {
      name: '未知 dependency artifact',
      mutate: (plan: GeneratedAppIntegrationPlan) => ({
        ...plan,
        dependencyArtifacts: plan.dependencyArtifacts.map((artifact, index) =>
          index === 0
            ? { ...artifact, artifactId: 'unknown-build-artifact' }
            : artifact,
        ),
      }),
      issue: 'unknown-build-artifact',
    },
    {
      name: '非法 execution level',
      mutate: (plan: GeneratedAppIntegrationPlan) => ({
        ...plan,
        executionLevel: 'production-integration',
      }),
      issue: 'executionLevel',
    },
  ])('builder 应聚合$name缺口并 fail closed', ({ mutate, issue }) => {
    const plans = buildGate4Plans('real-local-integration');
    const evaluation = evaluateGate4IntegrationPlan(
      plans.appSpec,
      plans.generationPlan,
      plans.staticContracts,
      plans.buildUnitPlan,
      mutate(plans.integrationPlan),
    );

    expect(evaluation.status).toBe('failed');
    expect(evaluation.failure?.code).toBe('integration-plan-incomplete');
    expect(
      evaluation.evidence.some((item) => item.summary.includes(issue)),
    ).toBe(true);
    expect(evaluation.repairInstructions).toContain('integrationPlan');
  });
});
