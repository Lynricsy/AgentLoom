import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type {
  GeneratedAppBrowserAcceptancePlan,
  GeneratedAppBuildUnitPlan,
  GeneratedAppGateEvidence,
  GeneratedAppGateResult,
  GeneratedAppGateRunFailure,
  GeneratedAppGenerationPlan,
  GeneratedAppIndependentVerificationPlan,
  GeneratedAppIntegrationPlan,
  GeneratedAppSpec,
  GeneratedAppStaticContracts,
} from '../../database/schema';

export type GeneratedAppGate6ExecutorMode = 'real' | 'fixture' | 'disabled';

export type GeneratedAppIndependentVerifierExecutionLevel =
  GeneratedAppIndependentVerificationPlan['executionLevel'];

export interface GeneratedAppGate6VerifierFinding {
  findingId: string;
  severity: 'blocking' | 'warning';
  category: GeneratedAppIndependentVerificationPlan['rubric'][number]['category'];
  summary: string;
  evidenceIds: string[];
  requirementIds: string[];
  scenarioIds: string[];
  repairSuggestion: string;
}

export interface GeneratedAppGate6TraceabilityCoverage {
  requirementCoveragePassed: boolean;
  scenarioCoveragePassed: boolean;
  evidenceCoveragePassed: boolean;
  gateCoveragePassed: boolean;
  coveredRequirementIds: string[];
  coveredScenarioIds: string[];
  coveredGateIds: string[];
  citedEvidenceIds: string[];
}

export interface GeneratedAppGate6VerifierVerdict {
  blockingFindings: GeneratedAppGate6VerifierFinding[];
  warnings: GeneratedAppGate6VerifierFinding[];
  decision: 'pass' | 'fail';
  traceabilityCoverage: GeneratedAppGate6TraceabilityCoverage;
  repairSuggestions: string[];
  residualRiskSummary: string;
}

export interface GeneratedAppGate6RunnerResult {
  status: 'passed' | 'failed';
  executionLevel: GeneratedAppIndependentVerifierExecutionLevel;
  summary: string;
  evidence: GeneratedAppGateEvidence[];
  failure: GeneratedAppGateRunFailure | null;
  repairInstructions: string | null;
  verdict: GeneratedAppGate6VerifierVerdict | null;
}

interface Gate6RunParams {
  appSpec: GeneratedAppSpec;
  generationPlan: GeneratedAppGenerationPlan;
  staticContracts: GeneratedAppStaticContracts;
  buildUnitPlan: GeneratedAppBuildUnitPlan;
  integrationPlan: GeneratedAppIntegrationPlan;
  browserAcceptancePlan: GeneratedAppBrowserAcceptancePlan;
  gateResults: GeneratedAppGateResult[];
  independentVerificationPlan: GeneratedAppIndependentVerificationPlan;
}

const GATE_6_RUNNER_IDS = {
  real: 'gate-6-real-independent-verifier-runner',
  fixture: 'gate-6-fixture-independent-verifier-runner',
  disabled: 'gate-6-disabled-independent-verifier-runner',
} as const;

const GATE_6_LOCAL_VERIFIER_NOTE =
  'real-local-independent-verifier 是服务端受控 deterministic 本地规则 verifier；不访问外部网络，不调用任意模型，不读取 generation transcript，不读取 public share token/API key/secret，也不代表外部模型或人工审查。';

@Injectable()
export class GeneratedAppGate6IndependentVerifierRunner {
  constructor(private readonly configService: ConfigService) {}

  getExecutionLevel(): GeneratedAppIndependentVerifierExecutionLevel {
    const mode = this.getExecutorMode();

    if (mode === 'real') return 'real-local-independent-verifier';
    if (mode === 'fixture') return 'fixture-independent-verifier';
    return 'disabled-independent-verifier';
  }

  getExecutorMode(): GeneratedAppGate6ExecutorMode {
    const rawMode =
      this.configService.get<string>('GENERATED_APP_GATE6_EXECUTOR_MODE') ??
      this.configService.get<string>('APP_GENERATED_APP_GATE6_EXECUTOR_MODE') ??
      'real';
    const normalizedMode = rawMode.trim().toLowerCase();

    if (normalizedMode === 'fixture') return 'fixture';
    if (normalizedMode === 'disabled') return 'disabled';
    return 'real';
  }

  run(params: Gate6RunParams): GeneratedAppGate6RunnerResult {
    const mode = this.getExecutorMode();
    const executionLevel = this.getExecutionLevel();
    const safetyIssues = this.collectPlanSafetyIssues(
      params.independentVerificationPlan,
      params.gateResults,
      executionLevel,
    );

    if (safetyIssues.length > 0) {
      return this.buildFailureResult({
        executionLevel,
        code: 'gate-6-independent-verifier-plan-unsafe',
        summary:
          'Gate 6 失败：independent verifier runner 输入材料或隔离边界不安全，已停止 Gate 7。',
        message:
          'Gate 6 independent verifier runner 拒绝执行不安全计划：只能读取 redacted evidence bundle，不能包含 generation transcript、public share token、authorization/API key/secret、host absolute path、Windows drive 或 traversal。',
        issues: safetyIssues,
        verdict: null,
      });
    }

    if (mode === 'disabled') {
      return {
        status: 'failed',
        executionLevel,
        summary:
          'Gate 6 失败：独立审查执行器被配置为 disabled，未执行本地规则 verifier，本次运行停止 Gate 7。',
        evidence: [
          this.buildEvidence({
            id: 'gate-6-executor-disabled',
            label: 'Gate 6 执行器禁用状态',
            summary:
              'Gate 6 executor mode=disabled；该状态不能被当作真实 independent verifier verdict，也不能继续 Gate 7。',
            details: {
              runnerId: GATE_6_RUNNER_IDS.disabled,
              executionMode: 'disabled',
              executionLevel,
              executed: false,
              realLocalIndependentRulesVerdict: false,
              externalModelExecuted: false,
              humanReviewExecuted: false,
              networkAccessed: false,
              generationTranscriptRead: false,
            },
          }),
        ],
        failure: {
          code: 'gate-6-executor-disabled',
          message: 'Gate 6 独立审查执行器被禁用，不能继续执行 Gate 7。',
          details: {
            runnerId: GATE_6_RUNNER_IDS.disabled,
            executionMode: 'disabled',
            executionLevel,
          },
        },
        repairInstructions:
          '将 Gate 6 切换为真实本地 verifier runner，或在明确标注 fixture 的测试环境中重新运行；disabled 状态不得进入后续门禁。',
        verdict: null,
      };
    }

    const verdict =
      mode === 'fixture'
        ? this.buildFixtureVerdict(params)
        : this.buildRealLocalVerdict(params);
    const citationIssues = this.collectVerdictCitationIssues(
      verdict,
      this.collectKnownEvidenceIds(params.gateResults),
    );

    if (citationIssues.length > 0) {
      return this.buildFailureResult({
        executionLevel,
        code: 'gate-6-verdict-citation-invalid',
        summary:
          'Gate 6 失败：independent verifier verdict findings 缺少有效 evidence id citation，已停止 Gate 7。',
        message:
          'Gate 6 independent verifier verdict 中每条 blocking finding/warning 都必须引用 Gate 0-5 evidence ids，不能接受无证据引用的结论。',
        issues: citationIssues,
        verdict,
      });
    }

    const runnerId =
      mode === 'fixture' ? GATE_6_RUNNER_IDS.fixture : GATE_6_RUNNER_IDS.real;
    const executionMode =
      mode === 'fixture' ? 'fixture' : 'real_local_independent_rules';
    const evidence = [
      this.buildVerdictEvidence(verdict, {
        runnerId,
        executionMode,
        executionLevel,
        executed: mode === 'real',
      }),
    ];

    if (verdict.blockingFindings.length > 0) {
      return {
        status: 'failed',
        executionLevel,
        summary:
          'Gate 6 失败：本地独立规则 verifier 发现 blocking findings，已停止 Gate 7。',
        evidence,
        failure: {
          code: 'gate-6-independent-verifier-blocking-findings',
          message:
            'Gate 6 independent verifier verdict 包含 blocking findings，不能继续执行 Gate 7。',
          details: {
            runnerId,
            executionMode,
            executionLevel,
            verdict: this.sanitizeDetailValue(verdict),
          },
        },
        repairInstructions:
          '读取 Gate 6 verdict 的 blockingFindings、evidenceIds、repairSuggestions 和 residualRiskSummary，修复对应需求/场景/证据缺口后重新运行 Gate 6。',
        verdict,
      };
    }

    if (mode === 'fixture') {
      return {
        status: 'passed',
        executionLevel,
        summary:
          'Gate 6 通过：fixture independent verifier runner 仅验证 verdict schema 形状；executed=false，不能作为真实 independent verifier verdict 或发布候选签收依据。',
        evidence,
        failure: null,
        repairInstructions: null,
        verdict,
      };
    }

    return {
      status: 'passed',
      executionLevel,
      summary: `Gate 6 通过：real-local independent verifier runner 已执行受控 deterministic 本地规则审查，输出 blockingFindings、warnings、decision、traceabilityCoverage、repairSuggestions 和 residualRiskSummary；${GATE_6_LOCAL_VERIFIER_NOTE}`,
      evidence,
      failure: null,
      repairInstructions: null,
      verdict,
    };
  }

  private buildRealLocalVerdict(
    params: Gate6RunParams,
  ): GeneratedAppGate6VerifierVerdict {
    const requirementIds = params.appSpec.coreRequirements.map(
      (requirement) => requirement.id,
    );
    const scenarioIds = params.appSpec.acceptanceScenarios.map(
      (scenario) => scenario.id,
    );
    const gateIds =
      params.independentVerificationPlan.evidenceBundle.referencedGateIds;
    const evidenceIds = [...this.collectKnownEvidenceIds(params.gateResults)];
    const missingEvidenceFinding =
      evidenceIds.length === 0
        ? [
            {
              findingId: 'gate-6-no-citable-evidence',
              severity: 'blocking' as const,
              category: 'publish_blockers' as const,
              summary:
                'Gate 6 redacted evidence bundle 没有可引用的 Gate 0-5 evidence ids。',
              evidenceIds: [],
              requirementIds,
              scenarioIds,
              repairSuggestion:
                '确保 Gate 0-5 写入 evidence ids，并重新生成 redacted evidence bundle。',
            },
          ]
        : [];
    const coverageFindings: GeneratedAppGate6VerifierFinding[] =
      evidenceIds.length === 0
        ? []
        : [
            ...(params.independentVerificationPlan.requirementCoverage.length >=
            requirementIds.length
              ? []
              : [
                  {
                    findingId: 'gate-6-requirement-coverage-incomplete',
                    severity: 'blocking' as const,
                    category: 'requirement_coverage' as const,
                    summary:
                      'Gate 6 coverage matrix 未覆盖全部 AppSpec core requirements。',
                    evidenceIds,
                    requirementIds,
                    scenarioIds,
                    repairSuggestion:
                      '补齐 independentVerificationPlan.requirementCoverage，使每个核心需求引用 Gate 0-5 evidence ids 后重新运行 Gate 6。',
                  },
                ]),
            ...(params.independentVerificationPlan.scenarioCoverage.length >=
            scenarioIds.length
              ? []
              : [
                  {
                    findingId: 'gate-6-scenario-coverage-incomplete',
                    severity: 'blocking' as const,
                    category: 'scenario_coverage' as const,
                    summary:
                      'Gate 6 coverage matrix 未覆盖全部 acceptance scenarios。',
                    evidenceIds,
                    requirementIds,
                    scenarioIds,
                    repairSuggestion:
                      '补齐 independentVerificationPlan.scenarioCoverage，使每个验收场景引用 Gate 0-5 evidence ids 后重新运行 Gate 6。',
                  },
                ]),
            ...(params.independentVerificationPlan.evidenceCoverage.length >=
            evidenceIds.length
              ? []
              : [
                  {
                    findingId: 'gate-6-evidence-coverage-incomplete',
                    severity: 'blocking' as const,
                    category: 'publish_blockers' as const,
                    summary:
                      'Gate 6 coverage matrix 未覆盖全部 Gate 0-5 evidence ids。',
                    evidenceIds,
                    requirementIds,
                    scenarioIds,
                    repairSuggestion:
                      '补齐 independentVerificationPlan.evidenceCoverage，使每条 Gate 0-5 evidence 都进入 verifier coverage matrix 后重新运行 Gate 6。',
                  },
                ]),
            ...(params.independentVerificationPlan.gateCoverage.length >=
            gateIds.length
              ? []
              : [
                  {
                    findingId: 'gate-6-gate-coverage-incomplete',
                    severity: 'blocking' as const,
                    category: 'publish_blockers' as const,
                    summary:
                      'Gate 6 coverage matrix 未覆盖全部 Gate 0-5 upstream gates。',
                    evidenceIds,
                    requirementIds,
                    scenarioIds,
                    repairSuggestion:
                      '补齐 independentVerificationPlan.gateCoverage，使 Gate 0-5 均有 evidence ids 覆盖后重新运行 Gate 6。',
                  },
                ]),
          ];
    const blockingFindings = [...missingEvidenceFinding, ...coverageFindings];

    return {
      blockingFindings,
      warnings: [],
      decision: blockingFindings.length > 0 ? 'fail' : 'pass',
      traceabilityCoverage: {
        requirementCoveragePassed:
          params.independentVerificationPlan.requirementCoverage.length >=
          requirementIds.length,
        scenarioCoveragePassed:
          params.independentVerificationPlan.scenarioCoverage.length >=
          scenarioIds.length,
        evidenceCoveragePassed:
          params.independentVerificationPlan.evidenceCoverage.length >=
          evidenceIds.length,
        gateCoveragePassed:
          params.independentVerificationPlan.gateCoverage.length >=
          gateIds.length,
        coveredRequirementIds: requirementIds,
        coveredScenarioIds: scenarioIds,
        coveredGateIds: gateIds,
        citedEvidenceIds: evidenceIds,
      },
      repairSuggestions:
        blockingFindings.length > 0
          ? blockingFindings.map((finding) => finding.repairSuggestion)
          : [
              'Gate 6 本地规则 verifier 未发现阻断项；后续仍需 Gate 7 真实 publish candidate runner、release manifest、artifact signoff 与 public-share signoff。',
            ],
      residualRiskSummary:
        '本 verdict 来自 AgentLoom 服务端本地独立规则 verifier，只基于 redacted evidence bundle 与 Gate 0-5 evidence refs；不代表外部模型审查、人工审查或生产环境运行签收。',
    };
  }

  private buildFixtureVerdict(
    params: Gate6RunParams,
  ): GeneratedAppGate6VerifierVerdict {
    const realVerdict = this.buildRealLocalVerdict(params);

    return {
      ...realVerdict,
      blockingFindings: [],
      warnings: [],
      decision: 'pass',
      repairSuggestions: [
        'fixture independent verifier 只验证 verdict schema 形状；切换到真实本地 verifier runner 后才能产出本地独立规则 verifier verdict。',
      ],
      residualRiskSummary:
        'fixture verdict shape validation only；executed=false，不得标记为真实 independent verifier verdict。',
    };
  }

  private buildVerdictEvidence(
    verdict: GeneratedAppGate6VerifierVerdict,
    context: {
      runnerId: string;
      executionMode: 'real_local_independent_rules' | 'fixture';
      executionLevel: GeneratedAppIndependentVerifierExecutionLevel;
      executed: boolean;
    },
  ): GeneratedAppGateEvidence {
    return this.buildEvidence({
      id: 'gate-6-independent-verifier-verdict',
      label: 'Gate 6 independent verifier verdict',
      summary: [
        `runnerId=${context.runnerId}`,
        `mode=${context.executionMode}`,
        `executed=${String(context.executed)}`,
        `decision=${verdict.decision}`,
        `blockingFindings=${verdict.blockingFindings.length}`,
        `warnings=${verdict.warnings.length}`,
        `requirements=${verdict.traceabilityCoverage.coveredRequirementIds.join(',')}`,
        `scenarios=${verdict.traceabilityCoverage.coveredScenarioIds.join(',')}`,
        `evidenceIds=${verdict.traceabilityCoverage.citedEvidenceIds.join(',')}`,
        GATE_6_LOCAL_VERIFIER_NOTE,
      ].join('；'),
      details: {
        runnerId: context.runnerId,
        executionMode: context.executionMode,
        executionLevel: context.executionLevel,
        executed: context.executed,
        verdict,
        realLocalIndependentRulesVerdict:
          context.executionMode === 'real_local_independent_rules',
        externalModelExecuted: false,
        humanReviewExecuted: false,
        networkAccessed: false,
        generationTranscriptRead: false,
      },
    });
  }

  private collectPlanSafetyIssues(
    independentVerificationPlan: GeneratedAppIndependentVerificationPlan,
    gateResults: GeneratedAppGateResult[],
    expectedExecutionLevel: GeneratedAppIndependentVerifierExecutionLevel,
  ): string[] {
    const issues: string[] = [];

    if (independentVerificationPlan.executionLevel !== expectedExecutionLevel) {
      issues.push(
        `independentVerificationPlan.executionLevel=${independentVerificationPlan.executionLevel} 与当前 Gate 6 executor level=${expectedExecutionLevel} 不一致`,
      );
    }

    if (
      independentVerificationPlan.verifierRunner.runner !==
      'local-independent-rules-verifier'
    ) {
      issues.push(
        'verifierRunner.runner 必须为 local-independent-rules-verifier。',
      );
    }

    if (
      independentVerificationPlan.verifierRunner.command !==
      'agentloom generated-app gate-6 local-independent-verifier'
    ) {
      issues.push(
        'Gate 6 verifierRunner.command 必须为服务端固定 local-independent-verifier 描述，不执行任意 shell。',
      );
    }

    if (
      independentVerificationPlan.verifierRunner.workingDirectory !==
      'generated-run'
    ) {
      issues.push(
        'verifierRunner.workingDirectory 必须为 generated-run relative descriptor。',
      );
    }

    if (
      independentVerificationPlan.verifierRunner.usesExternalNetwork !== false
    ) {
      issues.push('verifierRunner.usesExternalNetwork 必须为 false。');
    }

    if (
      independentVerificationPlan.verifierRunner.usesExternalModel !== false
    ) {
      issues.push('verifierRunner.usesExternalModel 必须为 false。');
    }

    if (
      independentVerificationPlan.verifierRunner.usesHumanReviewer !== false
    ) {
      issues.push('verifierRunner.usesHumanReviewer 必须为 false。');
    }

    if (
      independentVerificationPlan.verifierRunner.usesGenerationTranscript !==
      false
    ) {
      issues.push('verifierRunner.usesGenerationTranscript 必须为 false。');
    }

    if (
      independentVerificationPlan.verifierIsolationPolicy
        .acceptsGeneratorSelfAttestation !== false
    ) {
      issues.push(
        'verifierIsolationPolicy.acceptsGeneratorSelfAttestation 必须为 false。',
      );
    }

    issues.push(
      ...this.collectUnsafeInputIssues(
        independentVerificationPlan,
        'independentVerificationPlan',
      ),
      ...this.collectUnsafeInputIssues(gateResults, 'gateResults'),
    );

    return issues;
  }

  private collectVerdictCitationIssues(
    verdict: GeneratedAppGate6VerifierVerdict,
    knownEvidenceIds: Set<string>,
  ): string[] {
    return [...verdict.blockingFindings, ...verdict.warnings].flatMap(
      (finding) => {
        const issues: string[] = [];

        if (finding.evidenceIds.length === 0) {
          issues.push(`${finding.findingId} 缺少 evidenceIds citation`);
        }

        for (const evidenceId of finding.evidenceIds) {
          if (!knownEvidenceIds.has(evidenceId)) {
            issues.push(
              `${finding.findingId} 引用了未知 evidence id ${this.formatIssueValue(
                evidenceId,
              )}`,
            );
          }
        }

        return issues;
      },
    );
  }

  private collectKnownEvidenceIds(
    gateResults: GeneratedAppGateResult[],
  ): Set<string> {
    return new Set(
      gateResults
        .filter((gate) =>
          ['gate-0', 'gate-1', 'gate-2', 'gate-3', 'gate-4', 'gate-5'].includes(
            gate.gateId,
          ),
        )
        .flatMap((gate) => gate.evidence.map((evidence) => evidence.id)),
    );
  }

  private buildFailureResult(params: {
    executionLevel: GeneratedAppIndependentVerifierExecutionLevel;
    code: string;
    summary: string;
    message: string;
    issues: string[];
    verdict: GeneratedAppGate6VerifierVerdict | null;
  }): GeneratedAppGate6RunnerResult {
    const sanitizedIssues = params.issues.map((issue) =>
      this.sanitizeSummary(issue),
    );

    return {
      status: 'failed',
      executionLevel: params.executionLevel,
      summary: params.summary,
      evidence: [
        this.buildEvidence({
          id: params.code,
          label: 'Gate 6 independent verifier runner safety boundary',
          summary: `${params.message} 缺口：${sanitizedIssues.join('；')}`,
          details: {
            executionLevel: params.executionLevel,
            issues: sanitizedIssues,
            verdict:
              params.verdict === null
                ? null
                : this.sanitizeDetailValue(params.verdict),
            externalModelExecuted: false,
            humanReviewExecuted: false,
            networkAccessed: false,
            generationTranscriptRead: false,
          },
        }),
      ],
      failure: {
        code: params.code,
        message: params.message,
        details: {
          executionLevel: params.executionLevel,
          issues: sanitizedIssues,
          verdict:
            params.verdict === null
              ? null
              : this.sanitizeDetailValue(params.verdict),
        },
      },
      repairInstructions:
        '修复 generationPlan.independentVerificationPlan 的 executionLevel、verifierRunner、redacted evidence bundle、independence boundary 和 verdict evidence citation；fixture/disabled 不得标记为真实 independent verifier verdict。',
      verdict: params.verdict,
    };
  }

  private collectUnsafeInputIssues(
    value: unknown,
    path: string,
    depth = 0,
  ): string[] {
    if (depth > 8) {
      return [];
    }

    if (typeof value === 'string') {
      if (path.endsWith('.skeletonDisclaimer')) {
        return [];
      }

      return this.isUnsafeSummaryString(value)
        ? [
            `${path} 包含未脱敏 token、host path、Windows drive、traversal 或 generation transcript 片段`,
          ]
        : [];
    }

    if (Array.isArray(value)) {
      return value.flatMap((item, index) =>
        this.collectUnsafeInputIssues(item, `${path}[${index}]`, depth + 1),
      );
    }

    if (
      typeof value !== 'object' ||
      value === null ||
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      return [];
    }

    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, nestedValue]) => {
        const nextPath = `${path}.${key}`;
        const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
        const hasSensitiveKey =
          normalizedKey === 'token' ||
          normalizedKey.endsWith('token') ||
          normalizedKey.includes('apikey') ||
          normalizedKey.includes('secret') ||
          normalizedKey.includes('authorization') ||
          normalizedKey.includes('bearer') ||
          normalizedKey.includes('generatetranscript') ||
          normalizedKey.includes('generationtranscript');
        const hasGeneratorSelfAttestationKey =
          normalizedKey.includes('generatorselfattestation') ||
          normalizedKey.includes('selfattestation');
        const hasNonEmptyValue =
          nestedValue !== null &&
          nestedValue !== undefined &&
          nestedValue !== false &&
          (!Array.isArray(nestedValue) || nestedValue.length > 0) &&
          (typeof nestedValue !== 'object' ||
            Object.keys(nestedValue as Record<string, unknown>).length > 0);
        const keyIssue =
          (hasSensitiveKey || hasGeneratorSelfAttestationKey) &&
          hasNonEmptyValue
            ? [
                `${nextPath} 不能包含敏感字段、generation transcript 或 generator self-attestation`,
              ]
            : [];

        return [
          ...keyIssue,
          ...this.collectUnsafeInputIssues(nestedValue, nextPath, depth + 1),
        ];
      },
    );
  }

  private isUnsafeSummaryString(value: string): boolean {
    const normalizedValue = value.trim();
    const lowerValue = normalizedValue.toLowerCase();

    return (
      lowerValue.includes('file://') ||
      lowerValue.includes('/root/') ||
      lowerValue.includes('/tmp/') ||
      /\/(?:home|users|var|opt|workspace|mnt|etc)\//i.test(normalizedValue) ||
      /(^|[\s"'([{=])[a-zA-Z]:[\\/]/.test(normalizedValue) ||
      normalizedValue.includes('..\\') ||
      normalizedValue.includes('../') ||
      /\b[a-f0-9]{64}\b/i.test(normalizedValue) ||
      /\b(sk|pk|pat|ghp|glpat|xox[baprs])[-_][A-Za-z0-9._-]+/i.test(
        normalizedValue,
      ) ||
      /\bbearer\s+\S+/i.test(normalizedValue) ||
      /["']?(public[_-]?share[_-]?token|api[_-]?key|secret|authorization)["']?\s*[:=]\s*(?!["']?\[redacted\])["']?[^"',}\s]+/i.test(
        normalizedValue,
      ) ||
      /\bgeneration\s+transcript\b/i.test(normalizedValue)
    );
  }

  private sanitizeSummary(value: string): string {
    let sanitized = value
      .replace(/file:\/\/[^\s"']+/gi, '[redacted-host-path]')
      .replace(/\/root\/[^\s"']*/g, '[redacted-host-path]')
      .replace(/\/tmp\/[^\s"']*/g, '[redacted-host-path]')
      .replace(
        /\/(?:home|Users|var|opt|workspace|mnt|etc)\/[^\s"']*/g,
        '[redacted-host-path]',
      )
      .replace(
        /(^|[\s"'([{=])([a-zA-Z]:[\\/][^\s"']*)/g,
        '$1[redacted-host-path]',
      )
      .replace(/\.\.[\\/][^\s"']*/g, '[redacted-traversal]')
      .replace(/\b[a-f0-9]{64}\b/gi, '[redacted-token]')
      .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
      .replace(
        /\b(sk|pk|pat|ghp|glpat|xox[baprs])[-_][A-Za-z0-9._-]+/gi,
        '[redacted-token]',
      )
      .replace(
        /\bgeneration\s+transcript\b/gi,
        '[redacted-generation-transcript]',
      );

    sanitized = sanitized.replace(
      /(["']?(?:public[_-]?share[_-]?token|api[_-]?key|secret|authorization)["']?\s*[:=]\s*)(["'][^"']*["']|[^\s,;}]+)/gi,
      '$1"[redacted]"',
    );

    if (sanitized.length <= 1_000) return sanitized;
    return sanitized.slice(0, 1_000);
  }

  private sanitizeDetailValue(value: unknown, depth = 0): unknown {
    if (depth > 8) {
      return '[redacted-depth-limit]';
    }

    if (typeof value === 'string') {
      return this.sanitizeSummary(value);
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeDetailValue(item, depth + 1));
    }

    if (
      typeof value !== 'object' ||
      value === null ||
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(
        ([key, nestedValue]) => [
          key,
          this.sanitizeDetailValue(nestedValue, depth + 1),
        ],
      ),
    );
  }

  private buildEvidence(
    evidence: Omit<GeneratedAppGateEvidence, 'kind' | 'url'> & {
      kind?: GeneratedAppGateEvidence['kind'];
      url?: string | null;
    },
  ): GeneratedAppGateEvidence {
    return {
      kind: 'verifier',
      url: null,
      ...evidence,
      summary: this.sanitizeSummary(evidence.summary),
      details:
        evidence.details === undefined
          ? undefined
          : this.sanitizeDetailValue(evidence.details),
    };
  }

  private formatIssueValue(value: string): string {
    if (/\b[a-f0-9]{64}\b/i.test(value)) {
      return '[REDACTED_TOKEN]';
    }

    if (/\b(sk|pk|pat|ghp|glpat|xox[baprs])[-_][A-Za-z0-9._-]+/i.test(value)) {
      return '[REDACTED_SECRET]';
    }

    if (/\bbearer\s+\S+/i.test(value)) {
      return 'Bearer [REDACTED]';
    }

    return value;
  }
}
