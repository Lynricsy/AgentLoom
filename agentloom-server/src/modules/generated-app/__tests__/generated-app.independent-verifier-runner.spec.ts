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
import {
  buildIndependentVerificationPlan,
  evaluateGate6IndependentVerificationPlan,
} from '../plan-builders/independent-verification-plan.builder';
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
  it.each([
    'independent-verifier-skeleton',
    'fixture-independent-verifier',
    'real-local-independent-verifier',
  ] as const)('builder 对完整 %s 计划应聚合通过 evidence', (level) => {
    const plans = buildGate6Plans(level);
    const evaluation = evaluateGate6IndependentVerificationPlan(
      plans.appSpec,
      plans.generationPlan,
      plans.staticContracts,
      plans.buildUnitPlan,
      plans.integrationPlan,
      plans.browserAcceptancePlan,
      plans.gateResults,
      plans.independentVerificationPlan,
    );

    expect(evaluation.status).toBe('passed');
    expect(evaluation.failure).toBeNull();
    expect(evaluation.evidence.length).toBeGreaterThan(5);
    expect(evaluation.evidence.every((item) => item.kind === 'verifier')).toBe(
      true,
    );
  });

  it.each([
    {
      name: '非对象计划',
      mutate: () => undefined,
      issue: 'independentVerificationPlan 不是对象',
    },
    {
      name: '缺少 Gate evidence refs',
      mutate: (plan: GeneratedAppIndependentVerificationPlan) => ({
        ...plan,
        evidenceBundle: { ...plan.evidenceBundle, gateEvidenceRefs: [] },
      }),
      issue: 'gateEvidenceRefs',
    },
    {
      name: '重复 rubric category',
      mutate: (plan: GeneratedAppIndependentVerificationPlan) => ({
        ...plan,
        rubric: [...plan.rubric, plan.rubric[0]],
      }),
      issue: '重复',
    },
    {
      name: '未知 requirement coverage id',
      mutate: (plan: GeneratedAppIndependentVerificationPlan) => ({
        ...plan,
        requirementCoverage: plan.requirementCoverage.map((coverage, index) =>
          index === 0
            ? { ...coverage, requirementId: 'req-unknown' }
            : coverage,
        ),
      }),
      issue: 'req-unknown',
    },
    {
      name: '缺少 verdict artifact',
      mutate: (plan: GeneratedAppIndependentVerificationPlan) => ({
        ...plan,
        verdictArtifact: null,
      }),
      issue: 'verdictArtifact',
    },
    {
      name: '非法 execution level',
      mutate: (plan: GeneratedAppIndependentVerificationPlan) => ({
        ...plan,
        executionLevel: 'external-model-verifier',
      }),
      issue: 'executionLevel',
    },
  ])('builder 应聚合$name并拒绝生成 verdict', ({ mutate, issue }) => {
    const plans = buildGate6Plans('real-local-independent-verifier');
    const evaluation = evaluateGate6IndependentVerificationPlan(
      plans.appSpec,
      plans.generationPlan,
      plans.staticContracts,
      plans.buildUnitPlan,
      plans.integrationPlan,
      plans.browserAcceptancePlan,
      plans.gateResults,
      mutate(plans.independentVerificationPlan),
    );

    expect(evaluation.status).toBe('failed');
    expect(evaluation.failure?.code).toBe(
      'independent-verifier-plan-incomplete',
    );
    expect(
      evaluation.evidence.some((item) => item.summary.includes(issue)),
    ).toBe(true);
  });

  it.each([{ gateId: 'gate-0' as const }, { gateId: 'gate-5' as const }])(
    'builder 应拒绝 $gateId 缺失的上游 evidence',
    ({ gateId }) => {
      const plans = buildGate6Plans('real-local-independent-verifier');
      const gateResults = plans.gateResults.map((gate) =>
        gate.gateId === gateId ? { ...gate, evidence: [] } : gate,
      );
      const evaluation = evaluateGate6IndependentVerificationPlan(
        plans.appSpec,
        plans.generationPlan,
        plans.staticContracts,
        plans.buildUnitPlan,
        plans.integrationPlan,
        plans.browserAcceptancePlan,
        gateResults,
        plans.independentVerificationPlan,
      );

      expect(evaluation.status).toBe('failed');
      expect(
        evaluation.evidence.some((item) => item.summary.includes('evidence')),
      ).toBe(true);
    },
  );
  it('builder 应为缺失的上游 Gate evidence 和 traceability 使用安全默认值', () => {
    const plans = buildGate6Plans('real-local-independent-verifier');
    const appSpec = { ...plans.appSpec, traceability: [] };
    const plan = buildIndependentVerificationPlan(
      appSpec,
      plans.generationPlan,
      plans.staticContracts,
      plans.buildUnitPlan,
      plans.integrationPlan,
      plans.browserAcceptancePlan,
      plans.gateResults.filter((gate) => gate.gateId !== 'gate-0'),
    );

    expect(plan.executionLevel).toBe('independent-verifier-skeleton');
    expect(
      plan.evidenceBundle.gateEvidenceRefs.find(
        (entry) => entry.gateId === 'gate-0',
      )?.evidenceIds,
    ).toEqual([]);
    expect(plan.requirementCoverage[0]?.scenarioIds).toEqual([]);
    expect(plan.verdictArtifact.materialized).toBe(false);
  });

  it('builder 应聚合 requirements、scenarios、contracts、artifacts、commands、evidence 和 unknown 引用缺口', () => {
    const plans = buildGate6Plans('real-local-independent-verifier');
    const cases: Array<{
      name: string;
      mutate: (plan: GeneratedAppIndependentVerificationPlan) => unknown;
      issues: string[];
    }> = [
      {
        name: '版本和受控 verifier command',
        mutate: (plan) => ({
          ...plan,
          planVersion: 0,
          appSpecVersion: 0,
          generationPlanVersion: 0,
          staticContractsVersion: 0,
          buildUnitPlanVersion: 0,
          integrationPlanVersion: 0,
          browserAcceptancePlanVersion: 0,
          skeletonDisclaimer: '',
          verifierRunner: {
            runner: 'external-verifier',
            command: 'uncontrolled command',
            workingDirectory: '/',
            usesExternalNetwork: true,
            usesExternalModel: true,
            usesHumanReviewer: true,
            usesGenerationTranscript: true,
            inputBundleId: 'unknown-bundle',
            verdictArtifactPath: '/tmp/verdict.json',
          },
        }),
        issues: [
          'planVersion 必须为 1',
          'verifierRunner.command 必须为',
          'verifierRunner.usesExternalNetwork 必须为 false',
          'skeletonDisclaimer 缺失',
        ],
      },
      {
        name: '隔离控制',
        mutate: (plan) => ({
          ...plan,
          verifierIsolationPolicy: {
            verifierContext: 'generation-context',
            reuseGenerationContext: true,
            acceptsGeneratorSelfAttestation: true,
            readsPublicShareToken: true,
            readsRealSecrets: true,
            inputMaterialPolicy: 'raw-generation-context',
            requiredControls: [],
          },
        }),
        issues: [
          'verifierIsolationPolicy.requiredControls 不能为空',
          'reuseGenerationContext 必须为 false',
          'readsRealSecrets 必须为 false',
        ],
      },
      {
        name: 'contracts 和 artifacts',
        mutate: (plan) => ({
          ...plan,
          evidenceBundle: {
            ...plan.evidenceBundle,
            referencedGateIds: [],
            gateEvidenceRefs: [],
            staticContractIds: [],
            buildUnitArtifactIds: [],
            integrationTraceArtifactIds: [],
            browserArtifactIds: [],
            coverageMatrixRefs: [],
            forbiddenSensitiveFields: [],
          },
        }),
        issues: [
          'evidenceBundle.staticContractIds 不能为空',
          'evidenceBundle.buildUnitArtifactIds 不能为空',
          'evidenceBundle.integrationTraceArtifactIds 不能为空',
          'evidenceBundle.browserArtifactIds 不能为空',
        ],
      },
      {
        name: 'unknown evidence 和 coverage matrix 引用',
        mutate: (plan) => ({
          ...plan,
          evidenceBundle: {
            ...plan.evidenceBundle,
            referencedGateIds: ['gate-unknown'],
            gateEvidenceRefs: [
              {
                gateId: 'gate-1',
                evidenceIds: ['gate-0-synthetic-evidence', 'evidence-unknown'],
              },
              { evidenceIds: [] },
            ],
            coverageMatrixRefs: [
              {
                matrixId: 'matrix-unknown',
                sourcePlan: 'unknownPlan',
                requirementIds: ['req-unknown'],
                scenarioIds: ['scenario-unknown'],
                gateIds: ['gate-unknown'],
              },
              {
                matrixId: '',
                sourcePlan: '',
                requirementIds: [],
                scenarioIds: [],
                gateIds: [],
              },
            ],
          },
        }),
        issues: [
          '引用了未知对象 gate-unknown',
          'evidence-unknown',
          '不属于 gate-1',
          '非法 coverage matrix',
          '非法 source plan',
          'matrixId 缺失',
        ],
      },
      {
        name: 'rubric',
        mutate: (plan) => ({
          ...plan,
          rubric: [
            {
              category: 'unknown-category',
              label: '',
              requirementIds: [],
              scenarioIds: [],
              evidenceIds: [],
              blocking: 'yes',
            },
          ],
        }),
        issues: [
          '非法 rubric category',
          'label 缺失',
          'requirementIds 不能为空',
          'blocking 必须为 boolean',
        ],
      },
      {
        name: 'verdict schema 和 artifact',
        mutate: (plan) => ({
          ...plan,
          verdictSchema: {
            requiredFields: ['unknown-field'],
            findingSeverities: ['fatal'],
            decisionValues: ['maybe'],
            requiresEvidenceIds: false,
            requiresRepairSuggestions: false,
            residualRiskSummaryRequired: false,
          },
          verdictArtifact: {
            artifactId: 'unknown-artifact',
            kind: 'log',
            path: '/tmp/verdict.json',
            required: false,
            materialized: 'yes',
            containsSecrets: true,
          },
        }),
        issues: [
          'requiredFields 包含非法字段',
          'findingSeverities 包含非法 severity',
          'decisionValues 包含非法 decision',
          'verdictArtifact.artifactId 必须为',
          'verdictArtifact.materialized 必须是 boolean',
        ],
      },
      {
        name: 'independence checks',
        mutate: (plan) => ({
          ...plan,
          independenceChecks: [
            {
              checkId: '',
              kind: 'unknown-check',
              required: false,
              gateIds: [],
              evidenceIds: [],
            },
            {},
          ],
        }),
        issues: [
          'checkId 缺失',
          '非法 independence check kind',
          'required 必须为 true',
          'evidenceIds 不能为空',
          'kind 缺失',
        ],
      },
      {
        name: 'requirements coverage',
        mutate: (plan) => ({
          ...plan,
          requirementCoverage: [
            {
              requirementId: 'req-unknown',
              scenarioIds: ['scenario-unknown'],
              rubricCategories: ['rubric-unknown'],
              evidenceIds: ['evidence-unknown'],
              gateIds: ['gate-unknown'],
              staticContractIds: ['contract-unknown'],
              browserArtifactIds: ['artifact-unknown'],
            },
            {},
          ],
        }),
        issues: [
          '引用了未知需求',
          'scenario-unknown',
          'contract-unknown',
          'requirementId 缺失',
          '需求 req-1 缺少 Gate 6 覆盖声明',
        ],
      },
      {
        name: 'scenarios coverage',
        mutate: (plan) => ({
          ...plan,
          scenarioCoverage: [
            {
              scenarioId: 'scenario-unknown',
              requirementIds: ['req-unknown'],
              rubricCategories: ['rubric-unknown'],
              evidenceIds: ['evidence-unknown'],
              gateIds: ['gate-unknown'],
              browserArtifactIds: ['artifact-unknown'],
            },
            {},
          ],
        }),
        issues: [
          '引用了未知场景',
          'req-unknown',
          'scenarioId 缺失',
          '场景 scenario-1 缺少 Gate 6 覆盖声明',
        ],
      },
      {
        name: 'evidence coverage',
        mutate: (plan) => ({
          ...plan,
          evidenceCoverage: [
            {
              evidenceId: 'gate-0-synthetic-evidence',
              gateId: 'gate-1',
              usedByRubricCategories: [],
              requirementIds: [],
              scenarioIds: [],
            },
            {
              evidenceId: 'evidence-unknown',
              gateId: 'gate-unknown',
              usedByRubricCategories: ['rubric-unknown'],
              requirementIds: ['req-unknown'],
              scenarioIds: ['scenario-unknown'],
            },
            {},
          ],
        }),
        issues: [
          '所属 gate gate-0 不一致',
          'usedByRubricCategories 不能为空',
          '引用了未知 evidence',
          'evidenceId 缺失',
          'gateId 缺失',
        ],
      },
      {
        name: 'gate coverage',
        mutate: (plan) => ({
          ...plan,
          gateCoverage: [
            {
              gateId: 'gate-unknown',
              evidenceIds: [],
              required: false,
              coveredByRubricCategories: [],
            },
            {},
          ],
        }),
        issues: [
          '引用了未知 gate',
          'required 必须为 true',
          'evidenceIds 不能为空',
          'coveredByRubricCategories 不能为空',
          'gate gate-0 缺少 Gate 6 覆盖声明',
        ],
      },
    ];

    for (const testCase of cases) {
      const evaluation = evaluateGate6IndependentVerificationPlan(
        plans.appSpec,
        plans.generationPlan,
        plans.staticContracts,
        plans.buildUnitPlan,
        plans.integrationPlan,
        plans.browserAcceptancePlan,
        plans.gateResults,
        testCase.mutate(plans.independentVerificationPlan),
      );
      const evidenceSummary = evaluation.evidence
        .map((item) => item.summary)
        .join('\n');

      expect(evaluation.status, testCase.name).toBe('failed');
      for (const issue of testCase.issues) {
        expect(evidenceSummary, `${testCase.name}: ${issue}`).toContain(issue);
      }
    }
  });
});
