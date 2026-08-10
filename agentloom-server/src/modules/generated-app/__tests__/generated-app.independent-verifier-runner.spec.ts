import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import type {
  GeneratedAppBrowserAcceptancePlan,
  GeneratedAppBuildUnitPlan,
  GeneratedAppGateResult,
  GeneratedAppGenerationPlan,
  GeneratedAppIndependentVerificationPlan,
  GeneratedAppIntegrationPlan,
  GeneratedAppSpec,
  GeneratedAppStaticContracts,
} from '../../../database/schema';
import {
  buildBuildUnitPlan,
  buildGenerationPlan,
  buildStaticContracts,
} from '../plan-builders/generation-plan.builder';
import { buildIntegrationPlan } from '../plan-builders/integration-plan.builder';
import { GeneratedAppGate3WorkspaceRunner } from '../generated-app.workspace';
import { createInitialGeneratedAppGateResults } from '../generated-app.gates';
import { buildBrowserAcceptancePlan } from '../plan-builders/browser-acceptance-plan.builder';
import { buildIndependentVerificationPlan } from '../plan-builders/independent-verification-plan.builder';
import {
  GeneratedAppGate6IndependentVerifierRunner,
  type GeneratedAppIndependentVerifierExecutionLevel,
} from '../generated-app.independent-verifier-runner';

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

function createGateResults(withEvidence = true): GeneratedAppGateResult[] {
  return createInitialGeneratedAppGateResults('2026-04-25T00:00:00.000Z').map(
    (gate) => ({
      ...gate,
      status:
        gate.gateId === 'gate-7' ? ('pending' as const) : ('passed' as const),
      evidence:
        gate.gateId === 'gate-7' || !withEvidence
          ? []
          : [
              {
                id: `${gate.gateId}-synthetic-evidence`,
                label: `${gate.name} synthetic evidence`,
                kind: 'verifier' as const,
                url: null,
                summary: 'Gate 6 runner 单测使用的 redacted evidence。',
              },
            ],
    }),
  );
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

function buildGate6Plans(
  executionLevel: GeneratedAppIndependentVerifierExecutionLevel,
  gateResults: GeneratedAppGateResult[] = createGateResults(),
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
    'real-local-integration',
  );
  const browserAcceptancePlan = buildBrowserAcceptancePlan(
    appSpec,
    generationPlan,
    staticContracts,
    buildUnitPlan,
    integrationPlan,
    'real-local-browser-contract',
  );
  const independentVerificationPlan = buildIndependentVerificationPlan(
    appSpec,
    generationPlan,
    staticContracts,
    buildUnitPlan,
    integrationPlan,
    browserAcceptancePlan,
    gateResults,
    executionLevel,
  );

  return {
    appSpec,
    generationPlan,
    staticContracts,
    buildUnitPlan,
    integrationPlan,
    browserAcceptancePlan,
    gateResults,
    independentVerificationPlan,
  };
}

describe('GeneratedAppGate6IndependentVerifierRunner', () => {
  it('real 模式应执行受控本地规则 verifier 并输出完整 verdict schema', () => {
    const runner = new GeneratedAppGate6IndependentVerifierRunner(
      createConfigService(),
    );
    const plans = buildGate6Plans('real-local-independent-verifier');

    const result = runner.run(plans);

    expect(runner.getExecutorMode()).toBe('real');
    expect(runner.getExecutionLevel()).toBe('real-local-independent-verifier');
    expect(result.status).toBe('passed');
    expect(result.executionLevel).toBe('real-local-independent-verifier');
    expect(result.summary).toContain('real-local independent verifier runner');
    expect(result.summary).toContain('不访问外部网络');
    expect(result.summary).toContain('不调用任意模型');
    expect(result.verdict).toEqual(
      expect.objectContaining({
        blockingFindings: [],
        warnings: [],
        decision: 'pass',
        traceabilityCoverage: expect.objectContaining({
          requirementCoveragePassed: true,
          scenarioCoveragePassed: true,
          evidenceCoveragePassed: true,
          gateCoveragePassed: true,
          citedEvidenceIds: expect.arrayContaining([
            'gate-5-synthetic-evidence',
          ]),
        }),
        repairSuggestions: expect.arrayContaining([
          expect.stringContaining('Gate 7'),
        ]),
        residualRiskSummary: expect.stringContaining('本地独立规则 verifier'),
      }),
    );
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'gate-6-independent-verifier-verdict',
          kind: 'verifier',
          summary: expect.stringContaining('decision=pass'),
          details: expect.objectContaining({
            runnerId: 'gate-6-real-independent-verifier-runner',
            executionMode: 'real_local_independent_rules',
            executed: true,
            realLocalIndependentRulesVerdict: true,
            externalModelExecuted: false,
            humanReviewExecuted: false,
            networkAccessed: false,
            generationTranscriptRead: false,
          }),
        }),
      ]),
    );
  });

  it('fixture 模式只能验证 verdict 形状，不能标记为真实 independent verifier verdict', () => {
    const runner = new GeneratedAppGate6IndependentVerifierRunner(
      createConfigService({
        GENERATED_APP_GATE6_EXECUTOR_MODE: 'fixture',
      }),
    );
    const plans = buildGate6Plans('fixture-independent-verifier');

    const result = runner.run(plans);

    expect(runner.getExecutorMode()).toBe('fixture');
    expect(result.status).toBe('passed');
    expect(result.executionLevel).toBe('fixture-independent-verifier');
    expect(result.summary).toContain('executed=false');
    expect(result.summary).toContain(
      '不能作为真实 independent verifier verdict',
    );
    expect(JSON.stringify(result.verdict?.repairSuggestions)).not.toContain(
      'GENERATED_APP_GATE6_EXECUTOR_MODE',
    );
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          details: expect.objectContaining({
            runnerId: 'gate-6-fixture-independent-verifier-runner',
            executionMode: 'fixture',
            executed: false,
            realLocalIndependentRulesVerdict: false,
          }),
        }),
      ]),
    );
  });

  it('disabled 模式应失败并停止后续 Gate 7', () => {
    const runner = new GeneratedAppGate6IndependentVerifierRunner(
      createConfigService({
        GENERATED_APP_GATE6_EXECUTOR_MODE: 'disabled',
      }),
    );
    const plans = buildGate6Plans('disabled-independent-verifier');

    const result = runner.run(plans);

    expect(result.status).toBe('failed');
    expect(result.failure).toEqual(
      expect.objectContaining({
        code: 'gate-6-executor-disabled',
        message: expect.stringContaining('不能继续执行 Gate 7'),
      }),
    );
    expect(result.verdict).toBeNull();
    expect(result.repairInstructions).not.toContain(
      'GENERATED_APP_GATE6_EXECUTOR_MODE',
    );
    expect(result.evidence[0]).toEqual(
      expect.objectContaining({
        id: 'gate-6-executor-disabled',
        details: expect.objectContaining({
          executed: false,
          realLocalIndependentRulesVerdict: false,
        }),
      }),
    );
  });

  it('real 模式应把 coverage matrix 缺口转成带 Gate 0-5 evidence citation 的 blocking finding', () => {
    const runner = new GeneratedAppGate6IndependentVerifierRunner(
      createConfigService(),
    );
    const plans = buildGate6Plans('real-local-independent-verifier');
    const incompletePlan = {
      ...plans.independentVerificationPlan,
      requirementCoverage: [],
    };

    const result = runner.run({
      ...plans,
      independentVerificationPlan: incompletePlan,
    });

    expect(result.status).toBe('failed');
    expect(result.failure).toEqual(
      expect.objectContaining({
        code: 'gate-6-independent-verifier-blocking-findings',
      }),
    );
    expect(result.verdict?.blockingFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          findingId: 'gate-6-requirement-coverage-incomplete',
          evidenceIds: expect.arrayContaining(['gate-0-synthetic-evidence']),
          repairSuggestion: expect.stringContaining('requirementCoverage'),
        }),
      ]),
    );
    expect(
      result.verdict?.blockingFindings.every(
        (finding) => finding.evidenceIds.length > 0,
      ),
    ).toBe(true);
  });

  it('应拒绝包含 token、generation transcript、host path 或 traversal 的 evidence bundle', () => {
    const runner = new GeneratedAppGate6IndependentVerifierRunner(
      createConfigService(),
    );
    const plans = buildGate6Plans('real-local-independent-verifier');
    const unsafePlan = {
      ...plans.independentVerificationPlan,
      evidenceBundle: {
        ...plans.independentVerificationPlan.evidenceBundle,
        rawPublicShareToken: 'a'.repeat(64),
        generationTranscript: 'generation transcript from generator context',
        generatorSelfAttestation: 'generator claims all requirements passed',
        hostPath: '/root/AgentLoom/private',
        relativePath: '../secret.json',
      },
    } as unknown as GeneratedAppIndependentVerificationPlan;

    const result = runner.run({
      ...plans,
      independentVerificationPlan: unsafePlan,
    });

    expect(result.status).toBe('failed');
    expect(result.failure).toEqual(
      expect.objectContaining({
        code: 'gate-6-independent-verifier-plan-unsafe',
        message: expect.stringContaining('拒绝执行不安全计划'),
      }),
    );
    expect(JSON.stringify(result)).not.toContain('a'.repeat(64));
    expect(JSON.stringify(result)).not.toContain(
      'generator claims all requirements passed',
    );
    expect(JSON.stringify(result)).not.toContain('/root/AgentLoom/private');
    expect(JSON.stringify(result)).not.toContain('../secret.json');
    expect(JSON.stringify(result)).toContain(
      '[redacted-generation-transcript]',
    );
  });

  it('应拒绝缺少 evidence id citation 的 verdict findings', () => {
    const runner = new GeneratedAppGate6IndependentVerifierRunner(
      createConfigService(),
    );
    const gateResults = createGateResults(false);
    const plans = buildGate6Plans(
      'real-local-independent-verifier',
      gateResults,
    );

    const result = runner.run(plans);

    expect(result.status).toBe('failed');
    expect(result.failure).toEqual(
      expect.objectContaining({
        code: 'gate-6-verdict-citation-invalid',
        message: expect.stringContaining('evidence ids'),
      }),
    );
    expect(result.failure?.details).toEqual(
      expect.objectContaining({
        issues: expect.arrayContaining([
          expect.stringContaining('缺少 evidenceIds citation'),
        ]),
      }),
    );
  });
});
