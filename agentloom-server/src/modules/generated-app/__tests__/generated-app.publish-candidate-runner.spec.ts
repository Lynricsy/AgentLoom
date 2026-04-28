import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import type { DrizzleDB } from '../../../database/database.module';
import type {
  GeneratedAppBrowserAcceptancePlan,
  GeneratedAppBuildUnitPlan,
  GeneratedAppGateResult,
  GeneratedAppGenerationPlan,
  GeneratedAppIndependentVerificationPlan,
  GeneratedAppIntegrationPlan,
  GeneratedAppPublishCandidatePlan,
  GeneratedAppSpec,
  GeneratedAppStaticContracts,
} from '../../../database/schema';
import { createInitialGeneratedAppGateResults } from '../generated-app.gates';
import { GeneratedAppGate7PublishCandidateRunner } from '../generated-app.publish-candidate-runner';
import { GeneratedAppService } from '../generated-app.service';

function createConfigService(
  overrides: Record<string, string | undefined> = {},
): ConfigService {
  return {
    get: (key: string) => overrides[key],
  } as unknown as ConfigService;
}

function createAppSpec(): GeneratedAppSpec {
  return {
    version: 1,
    appName: '问诊助手',
    summary: '自动化中医问诊系统。',
    userGoal: '自动化中医问诊系统',
    actors: ['创建者', '终端用户'],
    coreRequirements: [{ id: 'req-1', text: '根据回答生成问诊分析。' }],
    pages: [
      {
        id: 'page-public-runtime',
        name: '公开运行页',
        purpose: '让终端用户提交问诊信息并查看报告。',
      },
    ],
    dataPolicy: {
      publicSubmissionsPersisted: true,
      creatorCanDeleteSubmissions: true,
      endUserLoginRequired: false,
    },
    nonGoals: ['不生成自定义后端服务。'],
    acceptanceScenarios: [
      {
        id: 'scenario-1',
        title: '终端用户完成问诊',
        requirementIds: ['req-1'],
        given: ['终端用户打开公开运行页'],
        when: ['终端用户提交问诊信息'],
        then: ['系统生成问诊分析报告'],
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

function buildGateResultsThroughGate6(): GeneratedAppGateResult[] {
  return createInitialGeneratedAppGateResults().map((gate) =>
    gate.gateId === 'gate-7'
      ? gate
      : {
          ...gate,
          status: 'passed' as const,
          summary: `${gate.name} passed`,
          evidence: [
            {
              id:
                gate.gateId === 'gate-6'
                  ? 'gate-6-independent-verifier-verdict'
                  : `${gate.gateId}-evidence`,
              label: `${gate.name} evidence`,
              kind: gate.gateId === 'gate-6' ? 'verifier' : 'manual',
              url: null,
              summary: `${gate.name} evidence citation`,
            },
          ],
        },
  );
}

function buildPlans(
  configService = createConfigService(),
  overrides: {
    buildUnitExecutionLevel?: GeneratedAppBuildUnitPlan['executionLevel'];
    integrationExecutionLevel?: GeneratedAppIntegrationPlan['executionLevel'];
    browserExecutionLevel?: GeneratedAppBrowserAcceptancePlan['executionLevel'];
    verifierExecutionLevel?: GeneratedAppIndependentVerificationPlan['executionLevel'];
  } = {},
) {
  const service = new GeneratedAppService(
    {} as DrizzleDB,
    configService,
  ) as unknown as {
    buildGenerationPlan(appSpec: GeneratedAppSpec): GeneratedAppGenerationPlan;
    buildStaticContracts(
      appSpec: GeneratedAppSpec,
      generationPlan: GeneratedAppGenerationPlan,
    ): GeneratedAppStaticContracts;
    buildBuildUnitPlan(
      appSpec: GeneratedAppSpec,
      generationPlan: GeneratedAppGenerationPlan,
      staticContracts: GeneratedAppStaticContracts,
      generationWorkspace?: unknown,
      commandPlan?: unknown,
      executionLevel?: GeneratedAppBuildUnitPlan['executionLevel'],
    ): GeneratedAppBuildUnitPlan;
    buildIntegrationPlan(
      appSpec: GeneratedAppSpec,
      generationPlan: GeneratedAppGenerationPlan,
      staticContracts: GeneratedAppStaticContracts,
      buildUnitPlan: GeneratedAppBuildUnitPlan,
      executionLevel?: GeneratedAppIntegrationPlan['executionLevel'],
    ): GeneratedAppIntegrationPlan;
    buildBrowserAcceptancePlan(
      appSpec: GeneratedAppSpec,
      generationPlan: GeneratedAppGenerationPlan,
      staticContracts: GeneratedAppStaticContracts,
      buildUnitPlan: GeneratedAppBuildUnitPlan,
      integrationPlan: GeneratedAppIntegrationPlan,
      executionLevel?: GeneratedAppBrowserAcceptancePlan['executionLevel'],
    ): GeneratedAppBrowserAcceptancePlan;
    buildIndependentVerificationPlan(
      appSpec: GeneratedAppSpec,
      generationPlan: GeneratedAppGenerationPlan,
      staticContracts: GeneratedAppStaticContracts,
      buildUnitPlan: GeneratedAppBuildUnitPlan,
      integrationPlan: GeneratedAppIntegrationPlan,
      browserAcceptancePlan: GeneratedAppBrowserAcceptancePlan,
      gateResults: GeneratedAppGateResult[],
      executionLevel?: GeneratedAppIndependentVerificationPlan['executionLevel'],
    ): GeneratedAppIndependentVerificationPlan;
    buildPublishCandidatePlan(
      appSpec: GeneratedAppSpec,
      generationPlan: GeneratedAppGenerationPlan,
      staticContracts: GeneratedAppStaticContracts,
      buildUnitPlan: GeneratedAppBuildUnitPlan,
      integrationPlan: GeneratedAppIntegrationPlan,
      browserAcceptancePlan: GeneratedAppBrowserAcceptancePlan,
      independentVerificationPlan: GeneratedAppIndependentVerificationPlan,
      gateResults: GeneratedAppGateResult[],
      executionLevel?: GeneratedAppPublishCandidatePlan['executionLevel'],
    ): GeneratedAppPublishCandidatePlan;
  };
  const runner = new GeneratedAppGate7PublishCandidateRunner(configService);
  const appSpec = createAppSpec();
  const generationPlan = service.buildGenerationPlan(appSpec);
  const staticContracts = service.buildStaticContracts(appSpec, generationPlan);
  const buildUnitPlan = service.buildBuildUnitPlan(
    appSpec,
    generationPlan,
    staticContracts,
    undefined,
    undefined,
    overrides.buildUnitExecutionLevel ?? 'real-local-command-plan',
  );
  const integrationPlan = service.buildIntegrationPlan(
    appSpec,
    generationPlan,
    staticContracts,
    buildUnitPlan,
    overrides.integrationExecutionLevel ?? 'real-local-integration',
  );
  const browserAcceptancePlan = service.buildBrowserAcceptancePlan(
    appSpec,
    generationPlan,
    staticContracts,
    buildUnitPlan,
    integrationPlan,
    overrides.browserExecutionLevel ?? 'real-local-browser-contract',
  );
  const gateResults = buildGateResultsThroughGate6();
  const independentVerificationPlan = service.buildIndependentVerificationPlan(
    appSpec,
    generationPlan,
    staticContracts,
    buildUnitPlan,
    integrationPlan,
    browserAcceptancePlan,
    gateResults,
    overrides.verifierExecutionLevel ?? 'real-local-independent-verifier',
  );
  const publishCandidatePlan = service.buildPublishCandidatePlan(
    appSpec,
    generationPlan,
    staticContracts,
    buildUnitPlan,
    integrationPlan,
    browserAcceptancePlan,
    independentVerificationPlan,
    gateResults,
    runner.getExecutionLevel(),
  );

  return {
    runner,
    appSpec,
    generationPlan,
    staticContracts,
    buildUnitPlan,
    integrationPlan,
    browserAcceptancePlan,
    independentVerificationPlan,
    gateResults,
    publishCandidatePlan,
  };
}

describe('GeneratedAppGate7PublishCandidateRunner', () => {
  it('real 模式应签收本地 release manifest contract 且不创建 public token', () => {
    const plans = buildPlans();

    const result = plans.runner.run(plans);

    expect(plans.runner.getExecutorMode()).toBe('real');
    expect(result.status).toBe('passed');
    expect(result.executionLevel).toBe('real-local-publish-candidate-contract');
    expect(result.summary).toContain('publishCandidateAllowed=true');
    expect(result.summary).toContain('不创建 public share token');
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'gate-7-artifact-release-manifest',
          details: expect.objectContaining({
            artifactArchiveCreated: false,
            artifactSignatureCreated: false,
            realArtifactUploaded: false,
          }),
        }),
        expect.objectContaining({
          id: 'gate-7-rollback-share-controls',
          details: expect.objectContaining({
            publicShareSignoff: 'deferred-until-enable-public-share',
            publicShareTokenCreated: false,
            createdPublicShareToken: null,
          }),
        }),
        expect.objectContaining({
          id: 'gate-7-final-verdict',
          summary: expect.stringContaining('publishCandidateAllowed=true'),
        }),
      ]),
    );
    expect(JSON.stringify(result)).not.toContain('publicShareToken":"');
  });

  it('fixture 模式只能验证形状，不能标记为真实 publish candidate', () => {
    const plans = buildPlans(
      createConfigService({ GENERATED_APP_GATE7_EXECUTOR_MODE: 'fixture' }),
    );

    const result = plans.runner.run(plans);

    expect(result.status).toBe('failed');
    expect(result.executionLevel).toBe('fixture-publish-candidate-contract');
    expect(result.failure).toEqual(
      expect.objectContaining({
        code: 'gate-7-fixture-not-publish-candidate',
      }),
    );
    expect(result.summary).toContain('executed=false');
    expect(result.summary).toContain('不能标记为真实 publish candidate');
  });

  it('disabled 模式应失败并阻止 publish candidate', () => {
    const plans = buildPlans(
      createConfigService({ GENERATED_APP_GATE7_EXECUTOR_MODE: 'disabled' }),
    );

    const result = plans.runner.run(plans);

    expect(result.status).toBe('failed');
    expect(result.executionLevel).toBe('disabled-publish-candidate-contract');
    expect(result.failure).toEqual(
      expect.objectContaining({
        code: 'gate-7-executor-disabled',
      }),
    );
  });

  it('real 模式应拒绝 unsafe artifact refs 并脱敏敏感值', () => {
    const plans = buildPlans();
    const unsafePlan: GeneratedAppPublishCandidatePlan = {
      ...plans.publishCandidatePlan,
      artifactReleaseManifest: [
        {
          ...plans.publishCandidatePlan.artifactReleaseManifest[0],
          path: '/root/AgentLoom/secret',
          evidenceIds: ['Bearer real-secret-token'],
        },
      ],
    };

    const result = plans.runner.run({
      ...plans,
      publishCandidatePlan: unsafePlan,
    });

    expect(result.status).toBe('failed');
    expect(result.failure).toEqual(
      expect.objectContaining({
        code: 'gate-7-publish-candidate-plan-unsafe',
      }),
    );
    expect(JSON.stringify(result)).not.toContain('real-secret-token');
    expect(JSON.stringify(result)).toContain(
      'artifactReleaseManifest[0].path 不安全',
    );
  });

  it('real 模式应拒绝非占位 release manifest、materialized archive 和真实签名', () => {
    const plans = buildPlans();
    const materializedPlan: GeneratedAppPublishCandidatePlan = {
      ...plans.publishCandidatePlan,
      artifactReleaseManifest: [
        {
          ...plans.publishCandidatePlan.artifactReleaseManifest[0],
          placeholder: false,
          checksum: {
            algorithm: 'sha256',
            value: 'sha256:real-materialized-checksum',
            placeholder: false,
            materialized: true,
          },
          archiveMaterialized: true,
          signature: {
            status: 'signed',
            signatureArtifactId: 'real-signature-artifact',
            reason: '真实签名不允许由 Gate 7 local contract runner 创建。',
          },
          signoffStatus: 'not-executed',
        } as unknown as GeneratedAppPublishCandidatePlan['artifactReleaseManifest'][number],
      ],
    };

    const result = plans.runner.run({
      ...plans,
      publishCandidatePlan: materializedPlan,
    });

    expect(result.status).toBe('failed');
    expect(result.failure).toEqual(
      expect.objectContaining({
        code: 'gate-7-publish-candidate-plan-unsafe',
      }),
    );
    expect(JSON.stringify(result.failure?.details)).toContain(
      'artifactReleaseManifest[0].placeholder 必须为 true',
    );
    expect(JSON.stringify(result.failure?.details)).toContain(
      'artifactReleaseManifest[0].archiveMaterialized 必须为 false',
    );
    expect(JSON.stringify(result.failure?.details)).toContain(
      'artifactReleaseManifest[0].signature.status 必须为 not-signed',
    );
    expect(JSON.stringify(result.failure?.details)).toContain(
      'artifactReleaseManifest[0].signoffStatus 必须为 contract-accepted',
    );
  });

  it('缺少 Gate 0-6 release manifest citation 时应阻断', () => {
    const plans = buildPlans();
    const missingCitationPlan: GeneratedAppPublishCandidatePlan = {
      ...plans.publishCandidatePlan,
      artifactReleaseManifest:
        plans.publishCandidatePlan.artifactReleaseManifest.map((artifact) => ({
          ...artifact,
          evidenceIds: artifact.evidenceIds.filter(
            (evidenceId) => evidenceId !== 'gate-0-evidence',
          ),
        })),
    };

    const result = plans.runner.run({
      ...plans,
      publishCandidatePlan: missingCitationPlan,
    });

    expect(result.status).toBe('failed');
    expect(result.failure?.details).toEqual(
      expect.objectContaining({
        issues: expect.arrayContaining([
          expect.stringContaining('gate-0-evidence'),
        ]),
      }),
    );
  });

  it('real 模式应拒绝带 blockingReasons 的 publishCandidateAllowed verdict', () => {
    const plans = buildPlans();
    const inconsistentVerdictPlan: GeneratedAppPublishCandidatePlan = {
      ...plans.publishCandidatePlan,
      finalVerdict: {
        ...plans.publishCandidatePlan.finalVerdict,
        publishCandidateAllowed: true,
        blockingReasons: ['仍存在未解决发布阻断。'],
      },
    };

    const result = plans.runner.run({
      ...plans,
      publishCandidatePlan: inconsistentVerdictPlan,
    });

    expect(result.status).toBe('failed');
    expect(result.failure).toEqual(
      expect.objectContaining({
        code: 'gate-7-publish-candidate-contract-blocked',
      }),
    );
    expect(JSON.stringify(result.failure?.details)).toContain(
      'finalVerdict.blockingReasons 通过时必须为空',
    );
  });

  it('Gate 3-6 任一上游不是 real-local 时应阻断', () => {
    const plans = buildPlans(createConfigService(), {
      buildUnitExecutionLevel: 'fixture-execution',
    });

    const result = plans.runner.run(plans);

    expect(result.status).toBe('failed');
    expect(result.failure).toEqual(
      expect.objectContaining({
        code: 'gate-7-publish-candidate-contract-blocked',
      }),
    );
    expect(JSON.stringify(result.failure?.details)).toContain(
      'Gate 3 executionLevel 必须为 real-local-command-plan',
    );
  });
});
