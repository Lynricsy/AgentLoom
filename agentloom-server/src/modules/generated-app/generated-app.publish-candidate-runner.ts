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
  GeneratedAppPublishCandidatePlan,
  GeneratedAppSpec,
  GeneratedAppStaticContracts,
} from '../../database/schema';

export type GeneratedAppGate7ExecutorMode = 'real' | 'fixture' | 'disabled';

export type GeneratedAppPublishCandidateExecutionLevel =
  GeneratedAppPublishCandidatePlan['executionLevel'];

export interface GeneratedAppGate7RunnerResult {
  status: 'passed' | 'failed';
  executionLevel: GeneratedAppPublishCandidateExecutionLevel;
  summary: string;
  evidence: GeneratedAppGateEvidence[];
  failure: GeneratedAppGateRunFailure | null;
  repairInstructions: string | null;
}

export interface GeneratedAppGate7RunParams {
  appSpec: GeneratedAppSpec;
  generationPlan: GeneratedAppGenerationPlan;
  staticContracts: GeneratedAppStaticContracts;
  buildUnitPlan: GeneratedAppBuildUnitPlan;
  integrationPlan: GeneratedAppIntegrationPlan;
  browserAcceptancePlan: GeneratedAppBrowserAcceptancePlan;
  independentVerificationPlan: GeneratedAppIndependentVerificationPlan;
  gateResults: GeneratedAppGateResult[];
  publishCandidatePlan: GeneratedAppPublishCandidatePlan;
}

const GATE_7_RUNNER_IDS = {
  real: 'gate-7-real-publish-candidate-runner',
  fixture: 'gate-7-fixture-publish-candidate-runner',
  disabled: 'gate-7-disabled-publish-candidate-runner',
} as const;

const GATE_7_UPSTREAM_GATE_IDS = [
  'gate-0',
  'gate-1',
  'gate-2',
  'gate-3',
  'gate-4',
  'gate-5',
  'gate-6',
] as const;

const GATE_7_REAL_LOCAL_NOTE =
  'real-local-publish-candidate-contract 是服务端受控 deterministic 本地发布候选 contract runner；不执行任意 shell 或用户路径，不上传真实 artifact，不生成真实 archive/signature，不创建 public share token，也不代表生产发布已完成。';

@Injectable()
export class GeneratedAppGate7PublishCandidateRunner {
  constructor(private readonly configService: ConfigService) {}

  getExecutionLevel(): GeneratedAppPublishCandidateExecutionLevel {
    const mode = this.getExecutorMode();

    if (mode === 'real') return 'real-local-publish-candidate-contract';
    if (mode === 'fixture') return 'fixture-publish-candidate-contract';
    return 'disabled-publish-candidate-contract';
  }

  getExecutorMode(): GeneratedAppGate7ExecutorMode {
    const rawMode =
      this.configService.get<string>('GENERATED_APP_GATE7_EXECUTOR_MODE') ??
      this.configService.get<string>('APP_GENERATED_APP_GATE7_EXECUTOR_MODE') ??
      'real';
    const normalizedMode = rawMode.trim().toLowerCase();

    if (normalizedMode === 'fixture') return 'fixture';
    if (normalizedMode === 'disabled') return 'disabled';
    return 'real';
  }

  run(params: GeneratedAppGate7RunParams): GeneratedAppGate7RunnerResult {
    const mode = this.getExecutorMode();
    const executionLevel = this.getExecutionLevel();
    const safetyIssues = this.collectPlanSafetyIssues(params, executionLevel);

    if (safetyIssues.length > 0) {
      return this.buildFailureResult({
        executionLevel,
        code: 'gate-7-publish-candidate-plan-unsafe',
        summary:
          'Gate 7 失败：publish candidate runner 输入计划、artifact refs、evidence citations 或 public-share signoff 不安全，已拒绝形成发布候选。',
        message:
          'Gate 7 publish candidate runner 拒绝执行不安全计划：release manifest 必须引用 Gate 0-6 evidence ids，artifact refs 不得包含 host absolute path、Windows drive、traversal、token 或 internal config，public share signoff 必须 deferred-until-enable-public-share 且不能创建 token。',
        issues: safetyIssues,
      });
    }

    if (mode === 'disabled') {
      return {
        status: 'failed',
        executionLevel,
        summary:
          'Gate 7 失败：publish candidate runner 被配置为 disabled；未执行 release manifest contract、artifact checksum placeholder signoff 或 public-share deferred signoff，不能形成 publish candidate。',
        evidence: [
          this.buildEvidence({
            id: 'gate-7-publish-runner-disabled',
            label: 'Gate 7 publish candidate runner 禁用状态',
            summary:
              'Gate 7 executor mode=disabled；executed=false，不能被当作真实 publish candidate contract。',
            details: {
              runnerId: GATE_7_RUNNER_IDS.disabled,
              executionMode: 'disabled',
              executionLevel,
              executed: false,
              realLocalPublishCandidateContract: false,
              artifactArchiveCreated: false,
              artifactSignatureCreated: false,
              publicShareTokenCreated: false,
              createdPublicShareToken: null,
            },
          }),
        ],
        failure: {
          code: 'gate-7-executor-disabled',
          message:
            'Gate 7 publish candidate runner 被禁用，不能形成 publish candidate。',
          details: {
            runnerId: GATE_7_RUNNER_IDS.disabled,
            executionMode: 'disabled',
            executionLevel,
          },
        },
        repairInstructions:
          '启用 GENERATED_APP_GATE7_EXECUTOR_MODE=real 后重新运行；disabled 状态不得进入 publish candidate，也不得创建 public share token。',
      };
    }

    if (mode === 'fixture') {
      const evidence = this.buildEvidenceSet(params, {
        runnerId: GATE_7_RUNNER_IDS.fixture,
        executionMode: 'fixture',
        executionLevel,
        executed: false,
        publishCandidateAllowed: false,
      });

      return {
        status: 'failed',
        executionLevel,
        summary:
          'Gate 7 失败：fixture publish candidate runner 仅验证 release manifest/public-share signoff 形状；executed=false，不能标记为真实 publish candidate。',
        evidence,
        failure: {
          code: 'gate-7-fixture-not-publish-candidate',
          message:
            'Gate 7 fixture 模式不能形成真实 publish candidate，也不能启用公开分享。',
          details: {
            runnerId: GATE_7_RUNNER_IDS.fixture,
            executionMode: 'fixture',
            executionLevel,
            finalVerdict: this.sanitizeDetailValue(
              params.publishCandidatePlan.finalVerdict,
            ),
          },
        },
        repairInstructions:
          '切换到 GENERATED_APP_GATE7_EXECUTOR_MODE=real 并确保 Gate 0-6 passed、Gate 3-6 均为 real-local evidence 后重新运行 Gate 7。',
      };
    }

    const blockingIssues =
      this.collectRealPublishCandidateBlockingIssues(params);
    if (blockingIssues.length > 0) {
      return this.buildFailureResult({
        executionLevel,
        code: 'gate-7-publish-candidate-contract-blocked',
        summary:
          'Gate 7 失败：real-local publish candidate contract runner 发现上游门禁、release manifest citation 或 public-share deferred signoff 仍不满足发布候选条件。',
        message:
          'Gate 7 real-local publish candidate contract runner 只允许 Gate 0-6 passed 且 Gate 3-6 均为 real-local evidence 的计划进入 publish candidate。',
        issues: blockingIssues,
      });
    }

    return {
      status: 'passed',
      executionLevel,
      summary: `Gate 7 通过：real-local publish candidate contract runner 已签收本地 release manifest contract、artifact checksum placeholders、Gate 0-6 evidence citations、rollback/public-share deferred controls 和 publishCandidateAllowed=true verdict；${GATE_7_REAL_LOCAL_NOTE}`,
      evidence: this.buildEvidenceSet(params, {
        runnerId: GATE_7_RUNNER_IDS.real,
        executionMode: 'real_local_publish_candidate_contract',
        executionLevel,
        executed: true,
        publishCandidateAllowed: true,
      }),
      failure: null,
      repairInstructions: null,
    };
  }

  private collectPlanSafetyIssues(
    params: GeneratedAppGate7RunParams,
    expectedExecutionLevel: GeneratedAppPublishCandidateExecutionLevel,
  ): string[] {
    const plan = params.publishCandidatePlan;
    const manifest = plan.artifactReleaseManifest;
    const controls = plan.rollbackShareControls;
    const upstreamEvidenceIds = this.collectUpstreamEvidenceIds(
      params.gateResults,
    );
    const publishCandidateAllowed =
      plan.finalVerdict.publishCandidateAllowed === true;
    const expectedArtifactSignoffStatus =
      this.resolveExpectedArtifactSignoffStatus(
        expectedExecutionLevel,
        publishCandidateAllowed,
      );
    const manifestEvidenceIds = new Set(
      manifest.flatMap((artifact) => artifact.evidenceIds),
    );

    return [
      ...(plan.executionLevel === expectedExecutionLevel
        ? []
        : [
            `publishCandidatePlan.executionLevel=${plan.executionLevel} 与当前 Gate 7 runner executionLevel=${expectedExecutionLevel} 不一致`,
          ]),
      ...this.collectSensitiveTokenIssues(plan, 'publishCandidatePlan'),
      ...manifest.flatMap((artifact, index) =>
        this.collectArtifactRefIssues(
          artifact,
          index,
          expectedArtifactSignoffStatus,
        ),
      ),
      ...upstreamEvidenceIds.flatMap((evidenceId) =>
        manifestEvidenceIds.has(evidenceId)
          ? []
          : [
              `artifactReleaseManifest 缺少 Gate 0-6 evidence citation ${evidenceId}`,
            ],
      ),
      ...(controls.publicTokenCreation === 'deferred-until-enable-public-share'
        ? []
        : [
            'rollbackShareControls.publicTokenCreation 必须为 deferred-until-enable-public-share',
          ]),
      ...(controls.publicShareSignoff === 'deferred-until-enable-public-share'
        ? []
        : [
            'rollbackShareControls.publicShareSignoff 必须为 deferred-until-enable-public-share',
          ]),
      ...(controls.createdPublicShareToken === null
        ? []
        : ['rollbackShareControls.createdPublicShareToken 必须为 null']),
      ...(controls.createsPublicShareToken === false
        ? []
        : ['rollbackShareControls.createsPublicShareToken 必须为 false']),
    ];
  }

  private collectRealPublishCandidateBlockingIssues(
    params: GeneratedAppGate7RunParams,
  ): string[] {
    const gateResultsById = new Map(
      params.gateResults.map((gate) => [gate.gateId, gate]),
    );
    const expectedGate5RunnerId = this.resolveGate5RequiredRunnerId(
      params.browserAcceptancePlan.executionLevel,
    );

    return [
      ...GATE_7_UPSTREAM_GATE_IDS.flatMap((gateId) => {
        const gate = gateResultsById.get(gateId);
        if (gate?.status === 'passed') return [];

        return [`${gateId} 必须为 passed 才能形成 publish candidate`];
      }),
      ...GATE_7_UPSTREAM_GATE_IDS.flatMap((gateId) => {
        const gate = gateResultsById.get(gateId);
        if ((gate?.evidence.length ?? 0) > 0) return [];

        return [`${gateId} 必须至少有一个 evidence id citation`];
      }),
      ...(params.buildUnitPlan.executionLevel === 'real-local-command-plan'
        ? []
        : ['Gate 3 executionLevel 必须为 real-local-command-plan']),
      ...(params.integrationPlan.executionLevel === 'real-local-integration'
        ? []
        : ['Gate 4 executionLevel 必须为 real-local-integration']),
      ...(params.browserAcceptancePlan.executionLevel ===
        'real-local-browser-contract' ||
      params.browserAcceptancePlan.executionLevel === 'real-browser-e2e'
        ? []
        : [
            'Gate 5 executionLevel 必须为 real-local-browser-contract 或 real-browser-e2e',
          ]),
      ...this.collectGate5RunnerEvidenceIssues(params),
      ...(params.independentVerificationPlan.executionLevel ===
      'real-local-independent-verifier'
        ? []
        : ['Gate 6 executionLevel 必须为 real-local-independent-verifier']),
      ...(params.publishCandidatePlan.finalVerdict.publishCandidateAllowed ===
      true
        ? []
        : ['finalVerdict.publishCandidateAllowed 必须为 true']),
      ...(params.publishCandidatePlan.finalVerdict.blockingReasons.length === 0
        ? []
        : ['finalVerdict.blockingReasons 通过时必须为空']),
      ...(params.publishCandidatePlan.finalVerdict.requiredGate5RealRunnerId ===
      expectedGate5RunnerId
        ? []
        : [
            `finalVerdict.requiredGate5RealRunnerId 必须为 ${expectedGate5RunnerId}`,
          ]),
      ...(params.publishCandidatePlan.publicationBlockers.length === 0
        ? []
        : ['real-local Gate 7 通过时 publicationBlockers 必须为空']),
    ];
  }

  private collectGate5RunnerEvidenceIssues(
    params: GeneratedAppGate7RunParams,
  ): string[] {
    const gate5 = params.gateResults.find((gate) => gate.gateId === 'gate-5');
    const expectedRunnerId = this.resolveGate5RequiredRunnerId(
      params.browserAcceptancePlan.executionLevel,
    );
    const trustedEvidence =
      gate5?.evidence.some((evidence) => {
        const details = this.getRecord(evidence.details);

        if (details?.runnerId !== expectedRunnerId) {
          return false;
        }

        if (
          params.browserAcceptancePlan.executionLevel === 'real-browser-e2e'
        ) {
          return (
            details.executionLevel === 'real-browser-e2e' &&
            details.executed === true &&
            details.playwrightExecuted === true &&
            details.realBrowserExecuted === true
          );
        }

        return (
          details.executionLevel === 'real-local-browser-contract' &&
          details.executed === true &&
          details.playwrightExecuted === false &&
          details.realBrowserExecuted === false
        );
      }) ?? false;

    return trustedEvidence
      ? []
      : [
          `Gate 5 必须包含 ${expectedRunnerId} 的可信执行 evidence；real-browser-e2e 需要 executed=true、playwrightExecuted=true、realBrowserExecuted=true，real-local-browser-contract 需要 executed=true 且明确未执行 Playwright/真实浏览器。`,
        ];
  }

  private resolveGate5RequiredRunnerId(
    executionLevel: GeneratedAppBrowserAcceptancePlan['executionLevel'],
  ): string {
    return executionLevel === 'real-browser-e2e'
      ? 'gate-5-real-browser-e2e-runner'
      : 'gate-5-real-browser-acceptance-runner';
  }

  private buildFailureResult(params: {
    executionLevel: GeneratedAppPublishCandidateExecutionLevel;
    code: string;
    summary: string;
    message: string;
    issues: string[];
  }): GeneratedAppGate7RunnerResult {
    const evidence = [
      this.buildEvidence({
        id: 'gate-7-publish-readiness-inputs',
        label: 'Gate 7 publish readiness 输入',
        summary: `${params.summary} 缺口：${params.issues.join('；')}`,
        details: {
          runnerId: this.resolveRunnerId(params.executionLevel),
          executionLevel: params.executionLevel,
          issues: this.sanitizeDetailValue(params.issues),
          executed: false,
          realLocalPublishCandidateContract: false,
          artifactArchiveCreated: false,
          artifactSignatureCreated: false,
          publicShareTokenCreated: false,
          createdPublicShareToken: null,
        },
      }),
    ];

    return {
      status: 'failed',
      executionLevel: params.executionLevel,
      summary: params.summary,
      evidence,
      failure: {
        code: params.code,
        message: params.message,
        details: {
          issues: this.sanitizeDetailValue(params.issues),
        },
      },
      repairInstructions:
        '修复 generationPlan.publishCandidatePlan 的 executionLevel、Gate 0-6 evidence citations、artifact refs、checksum placeholder、public-share deferred signoff 或上游 real-local gate evidence 后重新运行 Gate 7。',
    };
  }

  private buildEvidenceSet(
    params: GeneratedAppGate7RunParams,
    runner: {
      runnerId: string;
      executionMode: string;
      executionLevel: GeneratedAppPublishCandidateExecutionLevel;
      executed: boolean;
      publishCandidateAllowed: boolean;
    },
  ): GeneratedAppGateEvidence[] {
    const upstreamEvidenceRefs =
      params.publishCandidatePlan.publishReadinessInputs.upstreamEvidenceRefs;
    const checksumPlaceholders =
      params.publishCandidatePlan.artifactReleaseManifest.map((artifact) => ({
        artifactId: artifact.artifactId,
        checksum: artifact.checksum ?? {
          algorithm: 'sha256' as const,
          value: `sha256-placeholder:${artifact.artifactId}`,
          placeholder: true as const,
          materialized: false as const,
        },
      }));

    return [
      this.buildEvidence({
        id: 'gate-7-publish-readiness-inputs',
        label: 'Gate 7 publish readiness 输入',
        summary: `Gate 7 已校验 Gate 0-6 passed、Gate 3-6 real-local executionLevel、Gate 0-6 evidence citations 和 readiness preconditions；publishCandidateAllowed=${String(
          runner.publishCandidateAllowed,
        )}；executed=${String(runner.executed)}。`,
        details: {
          ...runner,
          upstreamEvidenceRefs,
          requiredGateIds:
            params.publishCandidatePlan.publishReadinessInputs.requiredGateIds,
          requiredNonSkeletonEvidenceClasses:
            params.publishCandidatePlan.publishReadinessInputs
              .requiredNonSkeletonEvidenceClasses,
        },
      }),
      this.buildEvidence({
        id: 'gate-7-artifact-release-manifest',
        label: 'Gate 7 release manifest contract',
        summary:
          'Gate 7 已生成本地 release manifest contract，覆盖 source artifact refs、build/test/integration/browser/verifier evidence refs 和 artifact checksum placeholders；未创建真实 artifact archive，未上传 artifact，未生成真实签名。',
        details: {
          ...runner,
          releaseManifest: this.sanitizeDetailValue(
            params.publishCandidatePlan.artifactReleaseManifest,
          ),
          checksumPlaceholders,
          artifactArchiveCreated: false,
          artifactSignatureCreated: false,
          realArtifactUploaded: false,
        },
      }),
      this.buildEvidence({
        id: 'gate-7-rollback-share-controls',
        label: 'Gate 7 rollback/public-share controls',
        summary:
          'Gate 7 public-share signoff=deferred-until-enable-public-share；本 runner 不创建或保留 publicShareToken，后续必须显式调用 enablePublicShare。',
        details: {
          ...runner,
          rollbackShareControls: this.sanitizeDetailValue(
            params.publishCandidatePlan.rollbackShareControls,
          ),
          publicShareSignoff: 'deferred-until-enable-public-share',
          publicShareTokenCreated: false,
          createdPublicShareToken: null,
        },
      }),
      this.buildEvidence({
        id: 'gate-7-final-verdict',
        label: 'Gate 7 publish candidate verdict',
        summary: `Gate 7 final verdict: publishCandidateAllowed=${String(
          runner.publishCandidateAllowed,
        )}; publicShareTokenCreated=false; artifactArchiveCreated=false; artifactSignatureCreated=false.`,
        details: {
          ...runner,
          finalVerdict: this.sanitizeDetailValue(
            params.publishCandidatePlan.finalVerdict,
          ),
        },
      }),
      this.buildEvidence({
        id: 'gate-7-coverage-matrices',
        label: 'Gate 7 coverage matrices',
        summary:
          'Gate 7 已校验 requirement/gate/artifact coverage 引用 release manifest artifact、Gate 0-6 evidence ids 和 Gate 7 verdict evidence。',
        details: {
          ...runner,
          requirementCoverage: this.sanitizeDetailValue(
            params.publishCandidatePlan.requirementCoverage,
          ),
          gateCoverage: this.sanitizeDetailValue(
            params.publishCandidatePlan.gateCoverage,
          ),
          artifactCoverage: this.sanitizeDetailValue(
            params.publishCandidatePlan.artifactCoverage,
          ),
        },
      }),
      this.buildEvidence({
        id: 'gate-7-failure-capture-fields',
        label: 'Gate 7 failure capture fields',
        summary:
          'Gate 7 publish candidate runner 已记录失败捕获字段，后续若 release manifest/public-share signoff 失败可保留 attempted plan 与修复指令。',
        details: {
          ...runner,
          failureCaptureFields:
            params.publishCandidatePlan.failureCaptureFields,
        },
      }),
    ];
  }

  private buildEvidence(params: {
    id: string;
    label: string;
    summary: string;
    details: Record<string, unknown>;
  }): GeneratedAppGateEvidence {
    return {
      id: params.id,
      label: params.label,
      kind: 'manual',
      url: null,
      summary: this.redactUnsafeString(params.summary),
      details: this.sanitizeDetailValue(params.details),
    };
  }

  private collectUpstreamEvidenceIds(
    gateResults: GeneratedAppGateResult[],
  ): string[] {
    return GATE_7_UPSTREAM_GATE_IDS.flatMap(
      (gateId) =>
        gateResults
          .find((gate) => gate.gateId === gateId)
          ?.evidence.map((evidence) => evidence.id) ?? [],
    );
  }

  private collectArtifactRefIssues(
    artifact: GeneratedAppPublishCandidatePlan['artifactReleaseManifest'][number],
    index: number,
    expectedSignoffStatus:
      'contract-accepted' | 'fixture-only' | 'not-executed',
  ): string[] {
    const artifactRecord = artifact as Record<string, unknown>;
    const path = artifact.path;
    const sourcePlan = artifact.sourcePlan;
    const artifactId = artifact.artifactId;

    return [
      ...(this.isUnsafeArtifactRef(path)
        ? [`artifactReleaseManifest[${index}].path 不安全`]
        : []),
      ...(this.isUnsafeArtifactRef(sourcePlan)
        ? [`artifactReleaseManifest[${index}].sourcePlan 不安全`]
        : []),
      ...(this.isUnsafeArtifactRef(artifactId)
        ? [`artifactReleaseManifest[${index}].artifactId 不安全`]
        : []),
      ...(artifact.containsSecrets === false
        ? []
        : [`artifactReleaseManifest[${index}].containsSecrets 必须为 false`]),
      ...(artifact.placeholder === true
        ? []
        : [`artifactReleaseManifest[${index}].placeholder 必须为 true`]),
      ...(artifact.checksum
        ? []
        : [`artifactReleaseManifest[${index}].checksum 缺失`]),
      ...(artifact.checksum?.algorithm === 'sha256'
        ? []
        : [
            `artifactReleaseManifest[${index}].checksum.algorithm 必须为 sha256`,
          ]),
      ...(typeof artifact.checksum?.value === 'string' &&
      artifact.checksum.value.startsWith('sha256-placeholder:')
        ? []
        : [
            `artifactReleaseManifest[${index}].checksum.value 必须为 sha256-placeholder 占位值`,
          ]),
      ...(artifact.checksum !== undefined &&
      artifact.checksum.placeholder !== true
        ? [`artifactReleaseManifest[${index}].checksum 必须是 placeholder`]
        : []),
      ...(artifact.checksum?.materialized === false
        ? []
        : [
            `artifactReleaseManifest[${index}].checksum.materialized 必须为 false`,
          ]),
      ...(artifactRecord.archiveMaterialized === false
        ? []
        : [
            `artifactReleaseManifest[${index}].archiveMaterialized 必须为 false`,
          ]),
      ...(artifact.signature
        ? []
        : [`artifactReleaseManifest[${index}].signature 缺失`]),
      ...(artifact.signature?.status === 'not-signed'
        ? []
        : [
            `artifactReleaseManifest[${index}].signature.status 必须为 not-signed`,
          ]),
      ...(artifact.signature?.signatureArtifactId === null
        ? []
        : [
            `artifactReleaseManifest[${index}].signature.signatureArtifactId 必须为 null`,
          ]),
      ...(artifact.signoffStatus === expectedSignoffStatus
        ? []
        : [
            `artifactReleaseManifest[${index}].signoffStatus 必须为 ${expectedSignoffStatus}`,
          ]),
    ];
  }

  private resolveExpectedArtifactSignoffStatus(
    executionLevel: GeneratedAppPublishCandidateExecutionLevel,
    publishCandidateAllowed: boolean,
  ): 'contract-accepted' | 'fixture-only' | 'not-executed' {
    if (
      executionLevel === 'real-local-publish-candidate-contract' &&
      publishCandidateAllowed
    ) {
      return 'contract-accepted';
    }

    if (executionLevel === 'fixture-publish-candidate-contract') {
      return 'fixture-only';
    }

    return 'not-executed';
  }

  private resolveRunnerId(
    executionLevel: GeneratedAppPublishCandidateExecutionLevel,
  ): string {
    if (executionLevel === 'fixture-publish-candidate-contract') {
      return GATE_7_RUNNER_IDS.fixture;
    }

    if (executionLevel === 'disabled-publish-candidate-contract') {
      return GATE_7_RUNNER_IDS.disabled;
    }

    return GATE_7_RUNNER_IDS.real;
  }

  private getRecord(value: unknown): Record<string, unknown> | null {
    if (
      value !== null &&
      typeof value === 'object' &&
      Object.getPrototypeOf(value) === Object.prototype
    ) {
      return value as Record<string, unknown>;
    }

    return null;
  }

  private collectSensitiveTokenIssues(value: unknown, path: string): string[] {
    if (typeof value === 'string') {
      return this.isUnsafeSummaryString(value)
        ? [
            `${path} 包含未脱敏 token、host path、Windows drive、traversal 或 internal config 片段`,
          ]
        : [];
    }

    if (Array.isArray(value)) {
      return value.flatMap((entry, index) =>
        this.collectSensitiveTokenIssues(entry, `${path}[${index}]`),
      );
    }

    if (value !== null && typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>).flatMap(
        ([key, child]) => {
          const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, '');
          const keyUnsafe =
            normalizedKey === 'token' ||
            normalizedKey.endsWith('token') ||
            normalizedKey.includes('publicsharetoken') ||
            normalizedKey.includes('apikey') ||
            normalizedKey.includes('authorization') ||
            normalizedKey.includes('secret') ||
            normalizedKey.includes('internalconfig');

          return [
            ...(keyUnsafe && child !== null && child !== false
              ? [
                  `${path}.${key} 不能包含真实 token/secret/internal config 字段`,
                ]
              : []),
            ...this.collectSensitiveTokenIssues(child, `${path}.${key}`),
          ];
        },
      );
    }

    return [];
  }

  private isUnsafeArtifactRef(value: string): boolean {
    const normalizedValue = value.replace(/\\/g, '/');
    const pathSegments = normalizedValue.split('/');

    return (
      value.startsWith('/') ||
      /^[A-Za-z]:[\\/]/.test(value) ||
      pathSegments.some(
        (segment) =>
          segment.length === 0 || segment === '.' || segment === '..',
      ) ||
      /public[_-]?share[_-]?token|api[_-]?key|secret|authorization|internal[_-]?config/i.test(
        value,
      )
    );
  }

  private isUnsafeSummaryString(value: string): boolean {
    return (
      /\b[A-Za-z]:[\\/][^\s"']*/.test(value) ||
      /(^|\s)\/(?:Users|home|root|tmp|var|etc|workspace)\b/.test(value) ||
      /(^|[\\/])\.\.([\\/]|$)/.test(value) ||
      /\b[a-f0-9]{64}\b/i.test(value) ||
      /Bearer\s+[A-Za-z0-9._~+/=-]+/i.test(value) ||
      /(sk|pk)-[A-Za-z0-9_-]{12,}/i.test(value) ||
      /["']?(public[_-]?share[_-]?token|api[_-]?key|secret|authorization|internal[_-]?config)["']?\s*[:=]\s*(?!["']?\[redacted\])["']?[^"',}\s]+/i.test(
        value,
      )
    );
  }

  private sanitizeDetailValue(value: unknown): unknown {
    if (typeof value === 'string') {
      return this.redactUnsafeString(value);
    }

    if (Array.isArray(value)) {
      return value.map((entry) => this.sanitizeDetailValue(entry));
    }

    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, child]) => {
          const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, '');
          const keyUnsafe =
            normalizedKey === 'token' ||
            normalizedKey.endsWith('token') ||
            normalizedKey.includes('publicsharetoken') ||
            normalizedKey.includes('apikey') ||
            normalizedKey.includes('authorization') ||
            normalizedKey.includes('secret') ||
            normalizedKey.includes('internalconfig');

          return [
            key,
            keyUnsafe && child !== null && child !== false
              ? '[REDACTED_SECRET]'
              : this.sanitizeDetailValue(child),
          ];
        }),
      );
    }

    return value;
  }

  private redactUnsafeString(value: string): string {
    return value
      .replace(/\b[A-Za-z]:[\\/][^\s"',;}]*/g, '[redacted-host-path]')
      .replace(
        /(^|\s)\/(?:Users|home|root|tmp|var|etc|workspace)\b[^\s"',;}]*/g,
        '$1[redacted-host-path]',
      )
      .replace(/\.\.[\\/][^\s"',;}]*/g, '[redacted-traversal]')
      .replace(/\b[a-f0-9]{64}\b/gi, '[redacted-token]')
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted-token]')
      .replace(/\b(?:sk|pk)-[A-Za-z0-9_-]{12,}\b/gi, '[redacted-token]')
      .replace(
        /(["']?(?:public[_-]?share[_-]?token|api[_-]?key|secret|authorization|internal[_-]?config)["']?\s*[:=]\s*)(["'][^"']*["']|[^\s,;}]+)/gi,
        '$1[REDACTED_SECRET]',
      );
  }
}
