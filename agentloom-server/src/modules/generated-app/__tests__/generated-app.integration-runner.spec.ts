import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import type { DrizzleDB } from '../../../database/database.module';
import type {
  GeneratedAppBuildUnitPlan,
  GeneratedAppGenerationPlan,
  GeneratedAppIntegrationPlan,
  GeneratedAppSpec,
  GeneratedAppStaticContracts,
} from '../../../database/schema';
import { GeneratedAppService } from '../generated-app.service';
import { GeneratedAppGate4IntegrationRunner } from '../generated-app.integration-runner';

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

function buildGate4Plans(
  executionLevel: GeneratedAppIntegrationPlan['executionLevel'],
) {
  const appSpec = createAppSpec();
  const service = new GeneratedAppService(
    {} as unknown as DrizzleDB,
    createConfigService(),
  );
  const internals = service as unknown as {
    buildGenerationPlan(appSpec: GeneratedAppSpec): GeneratedAppGenerationPlan;
    buildStaticContracts(
      appSpec: GeneratedAppSpec,
      generationPlan: GeneratedAppGenerationPlan,
    ): GeneratedAppStaticContracts;
    buildBuildUnitPlan(
      appSpec: GeneratedAppSpec,
      generationPlan: GeneratedAppGenerationPlan,
      staticContracts: GeneratedAppStaticContracts,
    ): GeneratedAppBuildUnitPlan;
    buildIntegrationPlan(
      appSpec: GeneratedAppSpec,
      generationPlan: GeneratedAppGenerationPlan,
      staticContracts: GeneratedAppStaticContracts,
      buildUnitPlan: GeneratedAppBuildUnitPlan,
      executionLevel: GeneratedAppIntegrationPlan['executionLevel'],
    ): GeneratedAppIntegrationPlan;
  };
  const generationPlan = internals.buildGenerationPlan(appSpec);
  const staticContracts = internals.buildStaticContracts(
    appSpec,
    generationPlan,
  );
  const buildUnitPlan = {
    ...internals.buildBuildUnitPlan(appSpec, generationPlan, staticContracts),
    executionLevel: 'real-local-command-plan' as const,
  };
  const integrationPlan = internals.buildIntegrationPlan(
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
});
