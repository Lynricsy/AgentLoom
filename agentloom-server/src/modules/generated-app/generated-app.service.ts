import * as crypto from 'crypto';

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import * as schema from '../../database/schema';
import type {
  GeneratedApp,
  GeneratedAppBuildUnitPlan,
  GeneratedAppGateEvidence,
  GeneratedAppGenerationPlan,
  GeneratedAppGenerationRun,
  GeneratedAppIntegrationPlan,
  GeneratedAppGateRunFailure,
  GeneratedAppGateRun,
  GeneratedAppSpec,
  GeneratedAppStaticContracts,
  GeneratedAppGateResult,
  GeneratedAppPreview,
  GeneratedAppReadiness,
  GeneratedAppRepairAttempt,
  GeneratedAppStatus,
  GeneratedAppSubmission,
} from '../../database/schema';
import {
  CreateGeneratedAppGenerationRunSchema,
  type CreateGeneratedAppGenerationRunDtoType,
  CreateGeneratedAppGateRunSchema,
  type CreateGeneratedAppGateRunDtoType,
  CreateGeneratedAppRepairAttemptSchema,
  type CreateGeneratedAppRepairAttemptDtoType,
  type CreateGeneratedAppSubmissionDtoType,
  type CreateGeneratedAppDtoType,
  type DeleteGeneratedAppSubmissionsResponseDto,
  type DeleteGeneratedAppSubmissionsDtoType,
  type GeneratedAppGenerationRunResponseDto,
  type GeneratedAppGateRunResponseDto,
  type GeneratedAppRepairAttemptResponseDto,
  type GeneratedAppResponseDto,
  type GeneratedAppSubmissionResponseDto,
  type PublicGeneratedAppSubmissionResponseDto,
  type PublicGeneratedAppResponseDto,
  type QueryGeneratedAppGenerationRunsDtoType,
  type QueryGeneratedAppGateRunsDtoType,
  type QueryGeneratedAppRepairAttemptsDtoType,
  type QueryGeneratedAppSubmissionsDtoType,
  type QueryGeneratedAppsDtoType,
  RecordGeneratedAppGateResultsSchema,
  type RecordGeneratedAppGateRunResponseDto,
  type RecordGeneratedAppGateResultsDtoType,
  StartGeneratedAppGenerationRunSchema,
  type StartGeneratedAppGenerationRunDtoType,
  type StartGeneratedAppGenerationRunResponseDto,
  UpdateGeneratedAppGenerationRunSchema,
  type UpdateGeneratedAppGenerationRunDtoType,
  UpdateGeneratedAppRepairAttemptSchema,
  type UpdateGeneratedAppRepairAttemptDtoType,
} from './dto';
import {
  createInitialGeneratedAppGateResults,
  evaluateGeneratedAppReadiness,
  getGeneratedAppGateDefinition,
  getGeneratedAppStatusForReadiness,
  normalizeGeneratedAppGateResults,
} from './generated-app.gates';
import {
  GeneratedAppGateDefinitionNotFoundException,
  GeneratedAppGenerationRunNotFoundException,
  GeneratedAppNotFoundException,
  GeneratedAppPublicShareNotReadyException,
  GeneratedAppRepairAttemptNotFoundException,
  GeneratedAppSubmissionNotFoundException,
} from './generated-app.exceptions';

const DEFAULT_PREVIEW: GeneratedAppPreview = {
  previewUrl: null,
  sourceArtifactUrl: null,
  testReportUrl: null,
};

const GATE_5_7_RUNNER_INCOMPLETE_FAILURE_REASON =
  'Gate 5-7 runner 尚未接入/未执行，不能形成 publish candidate。';

const GATE_2_STATIC_CONTRACT_IDS = [
  'gate-2-public-runtime-contract',
  'gate-2-frontend-route-contract',
  'gate-2-orchestration-contract',
  'gate-2-plugin-permission-contract',
  'gate-2-submission-persistence-contract',
  'gate-2-test-entry-contract',
  'gate-2-traceability-contract',
] as const;

const GATE_3_CORE_ARTIFACT_IDS = [
  'frontend-build-output',
  'unit-test-report',
  'component-golden-report',
  'coverage-report',
] as const;

const GATE_3_ARTIFACT_KINDS = [
  'frontend_build',
  'unit_test_report',
  'component_golden_report',
  'coverage_report',
  'plugin_bundle',
] as const;

const GATE_3_REQUIRED_FAILURE_CAPTURE_FIELDS = [
  'command',
  'exitCode',
  'stdout',
  'stderr',
  'durationMs',
  'artifactPath',
] as const;

const GATE_3_COVERAGE_TARGET_IDS = [
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

const GATE_3_SKELETON_EVIDENCE_NOTE =
  'Gate 3 当前只做 contract-skeleton 完整性检查；未执行真实前端构建、插件构建、单元测试、组件测试或 golden test。';

const GATE_4_SKELETON_EVIDENCE_NOTE =
  'Gate 4 当前只做 integration-skeleton 完整性检查；未执行真实 API 调用、真实 Agent/Workflow dry-run、真实插件 WASM/Extism smoke test 或真实 sandbox run。';

const GATE_4_PUBLIC_RUNTIME_API_CHECK_IDS = [
  'gate-4-public-runtime-read',
  'gate-4-public-runtime-submit-input',
  'gate-4-public-submission-detail',
] as const;

const GATE_4_CREATOR_MANAGEMENT_API_CHECK_IDS = [
  'gate-4-creator-generation-run-query',
  'gate-4-creator-gate-run-query',
  'gate-4-creator-submission-query',
] as const;

const GATE_4_ALLOWED_PUBLIC_RUNTIME_CHECK_KINDS = [
  'public_runtime_read',
  'public_runtime_submit',
  'public_submission_detail',
] as const;

const GATE_4_ALLOWED_CREATOR_MANAGEMENT_CHECK_KINDS = [
  'creator_generation_run_query',
  'creator_gate_run_query',
  'creator_submission_query',
] as const;

const GATE_4_TRACE_ARTIFACT_KINDS = [
  'public_runtime_api_trace',
  'creator_management_api_trace',
  'agent_workflow_dry_run_trace',
  'plugin_sandbox_smoke_trace',
] as const;

const GATE_4_REQUIRED_FAILURE_CAPTURE_FIELDS = [
  'checkId',
  'requestId',
  'method',
  'pathTemplate',
  'responseStatus',
  'responseBodySummary',
  'errorMessage',
  'traceArtifactPath',
  'durationMs',
] as const;

const GATE_4_CORE_TRACE_ARTIFACT_IDS = [
  'public-runtime-api-trace',
  'creator-management-api-trace',
  'agent-workflow-dry-run-trace',
] as const;

const GATE_4_PUBLIC_RUNTIME_CHECK_STATIC_CONTRACTS: Record<string, string[]> = {
  public_runtime_read: [
    'gate-2-public-runtime-contract',
    'gate-2-frontend-route-contract',
  ],
  public_runtime_submit: [
    'gate-2-public-runtime-contract',
    'gate-2-submission-persistence-contract',
  ],
  public_submission_detail: [
    'gate-2-public-runtime-contract',
    'gate-2-submission-persistence-contract',
  ],
};

const GATE_4_CREATOR_CHECK_STATIC_CONTRACTS: Record<string, string[]> = {
  creator_generation_run_query: [
    'gate-2-test-entry-contract',
    'gate-2-traceability-contract',
  ],
  creator_gate_run_query: [
    'gate-2-test-entry-contract',
    'gate-2-traceability-contract',
  ],
  creator_submission_query: [
    'gate-2-submission-persistence-contract',
    'gate-2-traceability-contract',
  ],
};

const GATE_4_PUBLIC_RUNTIME_CHECK_PAYLOAD_CONTRACT_REFS: Record<
  string,
  string[]
> = {
  public_runtime_read: [
    'staticContracts.publicRuntime.input',
    'staticContracts.publicRuntime.output',
  ],
  public_runtime_submit: [
    'staticContracts.publicRuntime.input',
    'staticContracts.submissionPersistence',
  ],
  public_submission_detail: [
    'staticContracts.publicRuntime.output',
    'staticContracts.submissionPersistence',
  ],
};

const GATE_4_ALLOWED_PAYLOAD_CONTRACT_REFS = [
  'staticContracts.publicRuntime.input',
  'staticContracts.publicRuntime.output',
  'staticContracts.submissionPersistence',
] as const;

interface Gate0Check {
  id: string;
  label: string;
  passed: boolean;
  summary: string;
  issues: string[];
}

interface Gate0Evaluation {
  status: 'passed' | 'failed';
  summary: string;
  evidence: GeneratedAppGateEvidence[];
  failure: GeneratedAppGateRunFailure | null;
  repairInstructions: string | null;
}

interface Gate1Check {
  id: string;
  label: string;
  passed: boolean;
  summary: string;
  issues: string[];
}

interface Gate1Evaluation {
  status: 'passed' | 'failed';
  summary: string;
  evidence: GeneratedAppGateEvidence[];
  failure: GeneratedAppGateRunFailure | null;
  repairInstructions: string | null;
}

interface Gate2Check {
  id: string;
  label: string;
  passed: boolean;
  summary: string;
  issues: string[];
}

interface Gate2Evaluation {
  status: 'passed' | 'failed';
  summary: string;
  evidence: GeneratedAppGateEvidence[];
  failure: GeneratedAppGateRunFailure | null;
  repairInstructions: string | null;
}

interface Gate3Check {
  id: string;
  label: string;
  passed: boolean;
  summary: string;
  issues: string[];
}

interface Gate3Evaluation {
  status: 'passed' | 'failed';
  summary: string;
  evidence: GeneratedAppGateEvidence[];
  failure: GeneratedAppGateRunFailure | null;
  repairInstructions: string | null;
}

interface Gate4Check {
  id: string;
  label: string;
  passed: boolean;
  summary: string;
  issues: string[];
}

interface Gate4Evaluation {
  status: 'passed' | 'failed';
  summary: string;
  evidence: GeneratedAppGateEvidence[];
  failure: GeneratedAppGateRunFailure | null;
  repairInstructions: string | null;
}

@Injectable()
export class GeneratedAppService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly configService: ConfigService,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  async create(
    tenantId: string,
    userId: string,
    dto: CreateGeneratedAppDtoType,
  ): Promise<GeneratedAppResponseDto> {
    const prompt = dto.prompt.trim();
    const appSpec = this.buildInitialAppSpec(prompt);
    const gateResults = createInitialGeneratedAppGateResults();
    const readiness = evaluateGeneratedAppReadiness(gateResults);
    const status: GeneratedAppStatus = 'app_spec_ready';

    const [created] = await this.tenantDb
      .insert(schema.generatedApps)
      .values({
        tenantId,
        prompt,
        appName: appSpec.appName,
        description: appSpec.summary,
        status,
        appSpec,
        generationPlan: null,
        gateResults,
        readiness,
        preview: DEFAULT_PREVIEW,
        pluginIds: [],
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    return this.toResponseDto(created);
  }

  async list(
    tenantId: string,
    query: QueryGeneratedAppsDtoType,
  ): Promise<{
    data: GeneratedAppResponseDto[];
    meta: {
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    };
  }> {
    const page = query.page;
    const pageSize = query.pageSize;
    const offset = (page - 1) * pageSize;
    const filters = query.status
      ? and(
          eq(schema.generatedApps.tenantId, tenantId),
          eq(schema.generatedApps.status, query.status),
        )
      : eq(schema.generatedApps.tenantId, tenantId);

    const [apps, countRows] = await Promise.all([
      this.tenantDb
        .select()
        .from(schema.generatedApps)
        .where(filters)
        .orderBy(desc(schema.generatedApps.updatedAt))
        .limit(pageSize)
        .offset(offset),
      this.tenantDb
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.generatedApps)
        .where(filters),
    ]);

    const total = countRows[0]?.count ?? 0;

    return {
      data: apps.map((app) => this.toResponseDto(app)),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findOne(
    tenantId: string,
    appId: string,
  ): Promise<GeneratedAppResponseDto> {
    const app = await this.findGeneratedAppRecord(tenantId, appId);
    return this.toResponseDto(app);
  }

  async recordGateResults(
    tenantId: string,
    userId: string,
    appId: string,
    dto: RecordGeneratedAppGateResultsDtoType,
  ): Promise<GeneratedAppResponseDto> {
    await this.findGeneratedAppRecord(tenantId, appId);

    const parsed = RecordGeneratedAppGateResultsSchema.parse(dto);
    const gateResults = normalizeGeneratedAppGateResults(
      parsed.gateResults as GeneratedAppGateResult[],
    );
    const updatePayload = this.buildGateResultsUpdatePayload(
      userId,
      gateResults,
      {
        generationPlan: parsed.generationPlan,
        preview: parsed.preview,
      },
    );

    const [updated] = await this.tenantDb
      .update(schema.generatedApps)
      .set(updatePayload)
      .where(
        and(
          eq(schema.generatedApps.id, appId),
          eq(schema.generatedApps.tenantId, tenantId),
        ),
      )
      .returning();

    if (!updated) {
      throw new GeneratedAppNotFoundException(appId);
    }

    return this.toResponseDto(updated);
  }

  async listGenerationRuns(
    tenantId: string,
    appId: string,
    query: QueryGeneratedAppGenerationRunsDtoType,
  ): Promise<{
    data: GeneratedAppGenerationRunResponseDto[];
    meta: {
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    };
  }> {
    const page = query.page;
    const pageSize = query.pageSize;
    const offset = (page - 1) * pageSize;
    const baseFilters = [
      eq(schema.generatedAppGenerationRuns.tenantId, tenantId),
      eq(schema.generatedAppGenerationRuns.generatedAppId, appId),
    ];

    if (query.status) {
      baseFilters.push(
        eq(schema.generatedAppGenerationRuns.status, query.status),
      );
    }

    const filters = and(...baseFilters);
    const [runs, countRows] = await Promise.all([
      this.tenantDb
        .select()
        .from(schema.generatedAppGenerationRuns)
        .where(filters)
        .orderBy(desc(schema.generatedAppGenerationRuns.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.tenantDb
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.generatedAppGenerationRuns)
        .where(filters),
    ]);

    const total = countRows[0]?.count ?? 0;

    return {
      data: runs.map((run) => this.toGenerationRunResponseDto(run)),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async createGenerationRun(
    tenantId: string,
    userId: string,
    appId: string,
    dto: CreateGeneratedAppGenerationRunDtoType,
  ): Promise<GeneratedAppGenerationRunResponseDto> {
    await this.findGeneratedAppRecord(tenantId, appId);
    const parsed = CreateGeneratedAppGenerationRunSchema.parse(dto);
    const startedAt = parsed.startedAt
      ? new Date(parsed.startedAt)
      : new Date();
    const completedAt =
      parsed.completedAt === undefined
        ? null
        : parsed.completedAt === null
          ? null
          : new Date(parsed.completedAt);

    const [run] = await this.tenantDb
      .insert(schema.generatedAppGenerationRuns)
      .values({
        tenantId,
        generatedAppId: appId,
        runNumber: parsed.runNumber,
        status: parsed.status,
        triggerSource: parsed.triggerSource,
        maxRepairAttempts: parsed.maxRepairAttempts,
        maxRuntimeSeconds: parsed.maxRuntimeSeconds,
        summary: parsed.summary,
        failureReason: parsed.failureReason ?? null,
        startedAt,
        completedAt,
        createdBy: userId,
      })
      .returning();

    return this.toGenerationRunResponseDto(run);
  }

  async startGenerationRun(
    tenantId: string,
    userId: string,
    appId: string,
    dto: StartGeneratedAppGenerationRunDtoType,
  ): Promise<StartGeneratedAppGenerationRunResponseDto> {
    const app = await this.findGeneratedAppRecord(tenantId, appId);
    const parsed = StartGeneratedAppGenerationRunSchema.parse(dto);
    const startedAt = new Date();
    const runNumber = await this.resolveNextGenerationRunNumber(
      tenantId,
      appId,
    );

    const [run] = await this.tenantDb
      .insert(schema.generatedAppGenerationRuns)
      .values({
        tenantId,
        generatedAppId: appId,
        runNumber,
        status: 'running',
        triggerSource: parsed.triggerSource,
        maxRepairAttempts: parsed.maxRepairAttempts,
        maxRuntimeSeconds: parsed.maxRuntimeSeconds,
        summary: '门禁运行器骨架已启动，正在执行 Gate 0 AppSpec 完整性检查。',
        failureReason: null,
        startedAt,
        completedAt: null,
        createdBy: userId,
      })
      .returning();

    const gate0Evaluation = this.evaluateGate0AppSpec(app.appSpec);
    const gateCompletedAt = new Date();
    const gateRunResult = await this.createGateRunAndUpdateApp(
      tenantId,
      userId,
      app,
      {
        gateId: 'gate-0',
        generationRunId: run.id,
        attemptNumber: 1,
        status: gate0Evaluation.status,
        summary: gate0Evaluation.summary,
        evidence: gate0Evaluation.evidence,
        failure: gate0Evaluation.failure,
        repairInstructions: gate0Evaluation.repairInstructions,
        startedAt: startedAt.toISOString(),
        completedAt: gateCompletedAt.toISOString(),
      },
      {
        buildGateResults: (gateResult, nowIso) =>
          this.buildRunnerGateResults(app, [gateResult], nowIso),
      },
    );
    const producedGateRuns: GeneratedAppGateRunResponseDto[] = [
      gateRunResult.gateRun,
    ];
    let latestApp = gateRunResult.app;
    let finalFailureReason =
      gate0Evaluation.failure?.message ??
      'Gate 0 AppSpec 完整性检查失败，不能继续执行 Gate 1 架构计划门禁。';
    let completedSummary =
      '门禁运行器骨架在 Gate 0 AppSpec 完整性检查失败；当前应用保持不可发布。';
    let completedAt = gateCompletedAt;

    if (gate0Evaluation.status === 'passed') {
      const generationPlan = this.buildGenerationPlan(app.appSpec);
      const gate1Evaluation = this.evaluateGate1GenerationPlan(
        app.appSpec,
        generationPlan,
      );
      const gate0Result = latestApp.gateResults.find(
        (gate) => gate.gateId === 'gate-0',
      );
      const gate1StartedAt = new Date();
      const gate1CompletedAt = new Date();
      const gate1AppSnapshot: GeneratedApp = {
        ...app,
        gateResults: latestApp.gateResults,
        generationPlan: latestApp.generationPlan,
      };
      const gate1RunResult = await this.createGateRunAndUpdateApp(
        tenantId,
        userId,
        gate1AppSnapshot,
        {
          gateId: 'gate-1',
          generationRunId: run.id,
          attemptNumber: 1,
          status: gate1Evaluation.status,
          summary: gate1Evaluation.summary,
          evidence: gate1Evaluation.evidence,
          failure: gate1Evaluation.failure,
          repairInstructions: gate1Evaluation.repairInstructions,
          startedAt: gate1StartedAt.toISOString(),
          completedAt: gate1CompletedAt.toISOString(),
        },
        {
          generationPlan,
          buildGateResults: (gate1Result, nowIso) =>
            this.buildRunnerGateResults(
              app,
              gate0Result ? [gate0Result, gate1Result] : [gate1Result],
              nowIso,
            ),
        },
      );

      producedGateRuns.push(gate1RunResult.gateRun);
      latestApp = gate1RunResult.app;
      completedAt = gate1CompletedAt;

      if (gate1Evaluation.status === 'failed') {
        finalFailureReason =
          gate1Evaluation.failure?.message ??
          'Gate 1 架构计划门禁失败，不能继续执行 Gate 2-7。';
        completedSummary =
          '门禁运行器骨架完成 Gate 0，但 Gate 1 架构计划门禁失败；当前应用保持不可发布。';
      } else {
        const staticContracts = this.buildStaticContracts(
          app.appSpec,
          generationPlan,
        );
        const generationPlanWithStaticContracts: GeneratedAppGenerationPlan = {
          ...generationPlan,
          staticContracts,
        };
        const gate2Evaluation = this.evaluateGate2StaticContracts(
          app.appSpec,
          generationPlan,
          staticContracts,
        );
        const gate1Result = latestApp.gateResults.find(
          (gate) => gate.gateId === 'gate-1',
        );
        const gate2StartedAt = new Date();
        const gate2CompletedAt = new Date();
        const gate2AppSnapshot: GeneratedApp = {
          ...app,
          gateResults: latestApp.gateResults,
          generationPlan: latestApp.generationPlan,
        };
        const gate2RunResult = await this.createGateRunAndUpdateApp(
          tenantId,
          userId,
          gate2AppSnapshot,
          {
            gateId: 'gate-2',
            generationRunId: run.id,
            attemptNumber: 1,
            status: gate2Evaluation.status,
            summary: gate2Evaluation.summary,
            evidence: gate2Evaluation.evidence,
            failure: gate2Evaluation.failure,
            repairInstructions: gate2Evaluation.repairInstructions,
            startedAt: gate2StartedAt.toISOString(),
            completedAt: gate2CompletedAt.toISOString(),
          },
          {
            generationPlan: generationPlanWithStaticContracts,
            buildGateResults: (gate2Result, nowIso) =>
              this.buildRunnerGateResults(
                app,
                [
                  ...(gate0Result ? [gate0Result] : []),
                  ...(gate1Result ? [gate1Result] : []),
                  gate2Result,
                ],
                nowIso,
              ),
          },
        );

        producedGateRuns.push(gate2RunResult.gateRun);
        latestApp = gate2RunResult.app;
        completedAt = gate2CompletedAt;

        if (gate2Evaluation.status === 'failed') {
          finalFailureReason =
            gate2Evaluation.failure?.message ??
            'Gate 2 静态合约门禁失败，不能继续执行 Gate 3-7。';
          completedSummary =
            '门禁运行器骨架完成 Gate 0 和 Gate 1，但 Gate 2 静态合约门禁失败；当前应用保持不可发布。';
        } else {
          const buildUnitPlan = this.buildBuildUnitPlan(
            app.appSpec,
            generationPlan,
            staticContracts,
          );
          const generationPlanWithBuildUnitPlan: GeneratedAppGenerationPlan = {
            ...generationPlanWithStaticContracts,
            buildUnitPlan,
          };
          const gate3Evaluation = this.evaluateGate3BuildUnitPlan(
            app.appSpec,
            generationPlan,
            staticContracts,
            buildUnitPlan,
          );
          const gate2Result = latestApp.gateResults.find(
            (gate) => gate.gateId === 'gate-2',
          );
          const gate3StartedAt = new Date();
          const gate3CompletedAt = new Date();
          const gate3AppSnapshot: GeneratedApp = {
            ...app,
            gateResults: latestApp.gateResults,
            generationPlan: latestApp.generationPlan,
          };
          const gate3RunResult = await this.createGateRunAndUpdateApp(
            tenantId,
            userId,
            gate3AppSnapshot,
            {
              gateId: 'gate-3',
              generationRunId: run.id,
              attemptNumber: 1,
              status: gate3Evaluation.status,
              summary: gate3Evaluation.summary,
              evidence: gate3Evaluation.evidence,
              failure: gate3Evaluation.failure,
              repairInstructions: gate3Evaluation.repairInstructions,
              startedAt: gate3StartedAt.toISOString(),
              completedAt: gate3CompletedAt.toISOString(),
            },
            {
              generationPlan: generationPlanWithBuildUnitPlan,
              buildGateResults: (gate3Result, nowIso) =>
                this.buildRunnerGateResults(
                  app,
                  [
                    ...(gate0Result ? [gate0Result] : []),
                    ...(gate1Result ? [gate1Result] : []),
                    ...(gate2Result ? [gate2Result] : []),
                    gate3Result,
                  ],
                  nowIso,
                ),
            },
          );

          producedGateRuns.push(gate3RunResult.gateRun);
          latestApp = gate3RunResult.app;
          completedAt = gate3CompletedAt;

          if (gate3Evaluation.status === 'failed') {
            finalFailureReason =
              gate3Evaluation.failure?.message ??
              'Gate 3 构建与单元门禁失败，不能继续执行 Gate 4-7。';
            completedSummary =
              '门禁运行器骨架完成 Gate 0、Gate 1 和 Gate 2，但 Gate 3 构建与单元门禁 skeleton 检查失败；当前应用保持不可发布。';
          } else {
            const integrationPlan = this.buildIntegrationPlan(
              app.appSpec,
              generationPlan,
              staticContracts,
              buildUnitPlan,
            );
            const generationPlanWithIntegrationPlan: GeneratedAppGenerationPlan =
              {
                ...generationPlanWithBuildUnitPlan,
                integrationPlan,
              };
            const gate4Evaluation = this.evaluateGate4IntegrationPlan(
              app.appSpec,
              generationPlan,
              staticContracts,
              buildUnitPlan,
              integrationPlan,
            );
            const gate3Result = latestApp.gateResults.find(
              (gate) => gate.gateId === 'gate-3',
            );
            const gate4StartedAt = new Date();
            const gate4CompletedAt = new Date();
            const gate4AppSnapshot: GeneratedApp = {
              ...app,
              gateResults: latestApp.gateResults,
              generationPlan: latestApp.generationPlan,
            };
            const gate4RunResult = await this.createGateRunAndUpdateApp(
              tenantId,
              userId,
              gate4AppSnapshot,
              {
                gateId: 'gate-4',
                generationRunId: run.id,
                attemptNumber: 1,
                status: gate4Evaluation.status,
                summary: gate4Evaluation.summary,
                evidence: gate4Evaluation.evidence,
                failure: gate4Evaluation.failure,
                repairInstructions: gate4Evaluation.repairInstructions,
                startedAt: gate4StartedAt.toISOString(),
                completedAt: gate4CompletedAt.toISOString(),
              },
              {
                generationPlan: generationPlanWithIntegrationPlan,
                buildGateResults: (gate4Result, nowIso) =>
                  this.buildRunnerGateResults(
                    app,
                    [
                      ...(gate0Result ? [gate0Result] : []),
                      ...(gate1Result ? [gate1Result] : []),
                      ...(gate2Result ? [gate2Result] : []),
                      ...(gate3Result ? [gate3Result] : []),
                      gate4Result,
                    ],
                    nowIso,
                  ),
              },
            );

            producedGateRuns.push(gate4RunResult.gateRun);
            latestApp = gate4RunResult.app;
            completedAt = gate4CompletedAt;

            if (gate4Evaluation.status === 'failed') {
              finalFailureReason =
                gate4Evaluation.failure?.message ??
                'Gate 4 集成 skeleton 门禁失败，不能继续执行 Gate 5-7。';
              completedSummary =
                '门禁运行器骨架完成 Gate 0、Gate 1、Gate 2 和 Gate 3，但 Gate 4 integration skeleton 检查失败；当前应用保持不可发布。';
            } else {
              finalFailureReason = GATE_5_7_RUNNER_INCOMPLETE_FAILURE_REASON;
              completedSummary =
                '门禁运行器骨架完成 Gate 0 AppSpec 完整性检查、Gate 1 架构计划门禁、Gate 2 静态合约门禁、Gate 3 构建与单元 skeleton 完整性检查和 Gate 4 integration skeleton 完整性检查；Gate 5-7 runner 尚未接入/未执行，当前应用不能形成 publish candidate，保持不可发布。';
            }
          }
        }
      }
    }

    const [completedRun] = await this.tenantDb
      .update(schema.generatedAppGenerationRuns)
      .set({
        status: 'failed',
        summary: completedSummary,
        failureReason: finalFailureReason,
        completedAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.generatedAppGenerationRuns.id, run.id),
          eq(schema.generatedAppGenerationRuns.tenantId, tenantId),
          eq(schema.generatedAppGenerationRuns.generatedAppId, appId),
        ),
      )
      .returning();

    if (!completedRun) {
      throw new GeneratedAppGenerationRunNotFoundException(run.id);
    }

    return {
      generationRun: this.toGenerationRunResponseDto(completedRun),
      gateRuns: producedGateRuns,
      app: latestApp,
    };
  }

  async updateGenerationRun(
    tenantId: string,
    appId: string,
    runId: string,
    dto: UpdateGeneratedAppGenerationRunDtoType,
  ): Promise<GeneratedAppGenerationRunResponseDto> {
    const parsed = UpdateGeneratedAppGenerationRunSchema.parse(dto);
    const updatePayload: Partial<schema.NewGeneratedAppGenerationRun> = {
      updatedAt: new Date(),
    };

    if (parsed.status !== undefined) {
      updatePayload.status = parsed.status;
    }

    if (parsed.summary !== undefined) {
      updatePayload.summary = parsed.summary;
    }

    if (parsed.failureReason !== undefined) {
      updatePayload.failureReason = parsed.failureReason;
    }

    if (parsed.startedAt !== undefined) {
      updatePayload.startedAt = new Date(parsed.startedAt);
    }

    if (parsed.completedAt !== undefined) {
      updatePayload.completedAt =
        parsed.completedAt === null ? null : new Date(parsed.completedAt);
    }

    const [updated] = await this.tenantDb
      .update(schema.generatedAppGenerationRuns)
      .set(updatePayload)
      .where(
        and(
          eq(schema.generatedAppGenerationRuns.id, runId),
          eq(schema.generatedAppGenerationRuns.tenantId, tenantId),
          eq(schema.generatedAppGenerationRuns.generatedAppId, appId),
        ),
      )
      .returning();

    if (!updated) {
      throw new GeneratedAppGenerationRunNotFoundException(runId);
    }

    return this.toGenerationRunResponseDto(updated);
  }

  async listRepairAttempts(
    tenantId: string,
    appId: string,
    runId: string,
    query: QueryGeneratedAppRepairAttemptsDtoType,
  ): Promise<{
    data: GeneratedAppRepairAttemptResponseDto[];
    meta: {
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    };
  }> {
    const page = query.page;
    const pageSize = query.pageSize;
    const offset = (page - 1) * pageSize;
    const baseFilters = [
      eq(schema.generatedAppRepairAttempts.tenantId, tenantId),
      eq(schema.generatedAppRepairAttempts.generatedAppId, appId),
      eq(schema.generatedAppRepairAttempts.generationRunId, runId),
    ];

    if (query.status) {
      baseFilters.push(
        eq(schema.generatedAppRepairAttempts.status, query.status),
      );
    }

    if (query.targetGateId) {
      baseFilters.push(
        eq(schema.generatedAppRepairAttempts.targetGateId, query.targetGateId),
      );
    }

    const filters = and(...baseFilters);
    const [attempts, countRows] = await Promise.all([
      this.tenantDb
        .select()
        .from(schema.generatedAppRepairAttempts)
        .where(filters)
        .orderBy(desc(schema.generatedAppRepairAttempts.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.tenantDb
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.generatedAppRepairAttempts)
        .where(filters),
    ]);

    const total = countRows[0]?.count ?? 0;

    return {
      data: attempts.map((attempt) => this.toRepairAttemptResponseDto(attempt)),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async createRepairAttempt(
    tenantId: string,
    userId: string,
    appId: string,
    runId: string,
    dto: CreateGeneratedAppRepairAttemptDtoType,
  ): Promise<GeneratedAppRepairAttemptResponseDto> {
    await this.findGenerationRunRecord(tenantId, appId, runId);
    const parsed = CreateGeneratedAppRepairAttemptSchema.parse(dto);
    const startedAt = parsed.startedAt
      ? new Date(parsed.startedAt)
      : new Date();
    const completedAt =
      parsed.completedAt === undefined
        ? null
        : parsed.completedAt === null
          ? null
          : new Date(parsed.completedAt);

    const [attempt] = await this.tenantDb
      .insert(schema.generatedAppRepairAttempts)
      .values({
        tenantId,
        generatedAppId: appId,
        generationRunId: runId,
        attemptNumber: parsed.attemptNumber,
        targetGateId: parsed.targetGateId,
        status: parsed.status,
        failureSummary: parsed.failureSummary,
        changeSummary: parsed.changeSummary ?? null,
        verificationSummary: parsed.verificationSummary ?? null,
        startedAt,
        completedAt,
        createdBy: userId,
      })
      .returning();

    return this.toRepairAttemptResponseDto(attempt);
  }

  async updateRepairAttempt(
    tenantId: string,
    appId: string,
    runId: string,
    repairAttemptId: string,
    dto: UpdateGeneratedAppRepairAttemptDtoType,
  ): Promise<GeneratedAppRepairAttemptResponseDto> {
    const parsed = UpdateGeneratedAppRepairAttemptSchema.parse(dto);
    const updatePayload: Partial<schema.NewGeneratedAppRepairAttempt> = {
      updatedAt: new Date(),
    };

    if (parsed.status !== undefined) {
      updatePayload.status = parsed.status;
    }

    if (parsed.failureSummary !== undefined) {
      updatePayload.failureSummary = parsed.failureSummary;
    }

    if (parsed.changeSummary !== undefined) {
      updatePayload.changeSummary = parsed.changeSummary;
    }

    if (parsed.verificationSummary !== undefined) {
      updatePayload.verificationSummary = parsed.verificationSummary;
    }

    if (parsed.startedAt !== undefined) {
      updatePayload.startedAt = new Date(parsed.startedAt);
    }

    if (parsed.completedAt !== undefined) {
      updatePayload.completedAt =
        parsed.completedAt === null ? null : new Date(parsed.completedAt);
    }

    const [updated] = await this.tenantDb
      .update(schema.generatedAppRepairAttempts)
      .set(updatePayload)
      .where(
        and(
          eq(schema.generatedAppRepairAttempts.id, repairAttemptId),
          eq(schema.generatedAppRepairAttempts.tenantId, tenantId),
          eq(schema.generatedAppRepairAttempts.generatedAppId, appId),
          eq(schema.generatedAppRepairAttempts.generationRunId, runId),
        ),
      )
      .returning();

    if (!updated) {
      throw new GeneratedAppRepairAttemptNotFoundException(repairAttemptId);
    }

    return this.toRepairAttemptResponseDto(updated);
  }

  async listGateRuns(
    tenantId: string,
    appId: string,
    query: QueryGeneratedAppGateRunsDtoType,
  ): Promise<{
    data: GeneratedAppGateRunResponseDto[];
    meta: {
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    };
  }> {
    const page = query.page;
    const pageSize = query.pageSize;
    const offset = (page - 1) * pageSize;
    const baseFilters = [
      eq(schema.generatedAppGateRuns.tenantId, tenantId),
      eq(schema.generatedAppGateRuns.generatedAppId, appId),
    ];

    if (query.gateId) {
      baseFilters.push(eq(schema.generatedAppGateRuns.gateId, query.gateId));
    }

    if (query.status) {
      baseFilters.push(eq(schema.generatedAppGateRuns.status, query.status));
    }

    if (query.generationRunId) {
      baseFilters.push(
        eq(schema.generatedAppGateRuns.generationRunId, query.generationRunId),
      );
    }

    if (query.repairAttemptId) {
      baseFilters.push(
        eq(schema.generatedAppGateRuns.repairAttemptId, query.repairAttemptId),
      );
    }

    const filters = and(...baseFilters);
    const [gateRuns, countRows] = await Promise.all([
      this.tenantDb
        .select()
        .from(schema.generatedAppGateRuns)
        .where(filters)
        .orderBy(desc(schema.generatedAppGateRuns.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.tenantDb
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.generatedAppGateRuns)
        .where(filters),
    ]);

    const total = countRows[0]?.count ?? 0;

    return {
      data: gateRuns.map((gateRun) => this.toGateRunResponseDto(gateRun)),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async recordGateRun(
    tenantId: string,
    userId: string,
    appId: string,
    dto: CreateGeneratedAppGateRunDtoType,
  ): Promise<RecordGeneratedAppGateRunResponseDto> {
    const app = await this.findGeneratedAppRecord(tenantId, appId);
    const parsed = CreateGeneratedAppGateRunSchema.parse(dto);
    await this.assertGateRunLinks(tenantId, appId, parsed);

    return this.createGateRunAndUpdateApp(tenantId, userId, app, parsed);
  }

  async enablePublicShare(
    tenantId: string,
    userId: string,
    appId: string,
  ): Promise<GeneratedAppResponseDto> {
    const app = await this.findGeneratedAppRecord(tenantId, appId);
    return this.activatePublicShare(tenantId, userId, app, {
      forceNewToken: false,
    });
  }

  async regeneratePublicShare(
    tenantId: string,
    userId: string,
    appId: string,
  ): Promise<GeneratedAppResponseDto> {
    const app = await this.findGeneratedAppRecord(tenantId, appId);
    return this.activatePublicShare(tenantId, userId, app, {
      forceNewToken: true,
    });
  }

  async disablePublicShare(
    tenantId: string,
    userId: string,
    appId: string,
  ): Promise<GeneratedAppResponseDto> {
    const app = await this.findGeneratedAppRecord(tenantId, appId);
    const status = this.resolveStatusForShareDisabled(app.readiness);

    const [updated] = await this.tenantDb
      .update(schema.generatedApps)
      .set({
        status,
        publicShareToken: null,
        publicShareEnabled: false,
        publicShareDisabledAt: new Date(),
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.generatedApps.id, appId),
          eq(schema.generatedApps.tenantId, tenantId),
        ),
      )
      .returning();

    if (!updated) {
      throw new GeneratedAppNotFoundException(appId);
    }

    return this.toResponseDto(updated);
  }

  async getPublicApp(token: string): Promise<PublicGeneratedAppResponseDto> {
    const app = await this.findPublicGeneratedAppRecord(token);

    await this.db
      .update(schema.generatedApps)
      .set({
        publicViewCount: sql`${schema.generatedApps.publicViewCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(schema.generatedApps.id, app.id));

    return {
      token,
      appId: app.id,
      title: app.appName,
      description: app.description,
      dataUseNotice:
        '你在此公开应用中提交的内容、运行结果和最终报告会被保存，并提供给应用创建者查看。',
      appSpec: {
        version: app.appSpec.version,
        appName: app.appSpec.appName,
        summary: app.appSpec.summary,
        userGoal: app.appSpec.userGoal,
        actors: app.appSpec.actors,
        pages: this.getPublicRuntimePages(app.appSpec),
      },
      runtimeSurface: {
        kind: 'generated-app',
        previewUrl: app.preview.previewUrl,
      },
      createdAt: app.createdAt,
    };
  }

  async createPublicSubmission(
    token: string,
    dto: CreateGeneratedAppSubmissionDtoType,
  ): Promise<PublicGeneratedAppSubmissionResponseDto> {
    const app = await this.findPublicGeneratedAppRecord(token);
    const anonymousSessionId =
      dto.anonymousSessionId?.trim() || crypto.randomUUID();

    const [submission] = await this.db
      .insert(schema.generatedAppSubmissions)
      .values({
        tenantId: app.tenantId,
        generatedAppId: app.id,
        appSpecVersion: app.appSpec.version,
        publicShareToken: token,
        anonymousSessionId,
        status: 'received',
        input: dto.input ?? {},
        result: null,
        report: null,
        errorMessage: null,
      })
      .returning();

    return this.toPublicSubmissionResponseDto(submission);
  }

  async getPublicSubmission(
    token: string,
    submissionId: string,
  ): Promise<PublicGeneratedAppSubmissionResponseDto> {
    const app = await this.findPublicGeneratedAppRecord(token);
    const [submission] = await this.db
      .select()
      .from(schema.generatedAppSubmissions)
      .where(
        and(
          eq(schema.generatedAppSubmissions.id, submissionId),
          eq(schema.generatedAppSubmissions.generatedAppId, app.id),
          eq(schema.generatedAppSubmissions.publicShareToken, token),
          isNull(schema.generatedAppSubmissions.deletedAt),
        ),
      )
      .limit(1);

    if (!submission) {
      throw new GeneratedAppSubmissionNotFoundException(submissionId);
    }

    return this.toPublicSubmissionResponseDto(submission);
  }

  async listSubmissions(
    tenantId: string,
    appId: string,
    query: QueryGeneratedAppSubmissionsDtoType,
  ): Promise<{
    data: GeneratedAppSubmissionResponseDto[];
    meta: {
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    };
  }> {
    const page = query.page;
    const pageSize = query.pageSize;
    const offset = (page - 1) * pageSize;
    const baseFilters = [
      eq(schema.generatedAppSubmissions.tenantId, tenantId),
      eq(schema.generatedAppSubmissions.generatedAppId, appId),
      isNull(schema.generatedAppSubmissions.deletedAt),
    ];
    const filters = query.status
      ? and(
          ...baseFilters,
          eq(schema.generatedAppSubmissions.status, query.status),
        )
      : and(...baseFilters);

    const [submissions, countRows] = await Promise.all([
      this.tenantDb
        .select()
        .from(schema.generatedAppSubmissions)
        .where(filters)
        .orderBy(desc(schema.generatedAppSubmissions.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.tenantDb
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.generatedAppSubmissions)
        .where(filters),
    ]);

    const total = countRows[0]?.count ?? 0;

    return {
      data: submissions.map((submission) =>
        this.toSubmissionResponseDto(submission),
      ),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findSubmission(
    tenantId: string,
    appId: string,
    submissionId: string,
  ): Promise<GeneratedAppSubmissionResponseDto> {
    const submission = await this.findSubmissionRecord(
      tenantId,
      appId,
      submissionId,
    );

    return this.toSubmissionResponseDto(submission);
  }

  async deleteSubmission(
    tenantId: string,
    appId: string,
    submissionId: string,
  ): Promise<DeleteGeneratedAppSubmissionsResponseDto> {
    const [deleted] = await this.tenantDb
      .update(schema.generatedAppSubmissions)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.generatedAppSubmissions.id, submissionId),
          eq(schema.generatedAppSubmissions.tenantId, tenantId),
          eq(schema.generatedAppSubmissions.generatedAppId, appId),
          isNull(schema.generatedAppSubmissions.deletedAt),
        ),
      )
      .returning({ id: schema.generatedAppSubmissions.id });

    if (!deleted) {
      throw new GeneratedAppSubmissionNotFoundException(submissionId);
    }

    return { deletedCount: 1 };
  }

  async deleteSubmissions(
    tenantId: string,
    appId: string,
    dto: DeleteGeneratedAppSubmissionsDtoType,
  ): Promise<DeleteGeneratedAppSubmissionsResponseDto> {
    const ids = [...new Set(dto.ids)];
    const deleted = await this.tenantDb
      .update(schema.generatedAppSubmissions)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.generatedAppSubmissions.tenantId, tenantId),
          eq(schema.generatedAppSubmissions.generatedAppId, appId),
          inArray(schema.generatedAppSubmissions.id, ids),
          isNull(schema.generatedAppSubmissions.deletedAt),
        ),
      )
      .returning({ id: schema.generatedAppSubmissions.id });

    return { deletedCount: deleted.length };
  }

  assertCanEnablePublicShare(app: Pick<GeneratedApp, 'id' | 'readiness'>) {
    if (
      app.readiness.state !== 'publish_candidate' ||
      !app.readiness.canCreatePublicShare
    ) {
      throw new GeneratedAppPublicShareNotReadyException(
        app.id,
        app.readiness.summary,
      );
    }
  }

  private async assertGateRunLinks(
    tenantId: string,
    appId: string,
    parsed: CreateGeneratedAppGateRunDtoType,
  ) {
    const gateDefinition = getGeneratedAppGateDefinition(parsed.gateId);

    if (!gateDefinition) {
      throw new GeneratedAppGateDefinitionNotFoundException(parsed.gateId);
    }

    if (parsed.generationRunId) {
      await this.findGenerationRunRecord(
        tenantId,
        appId,
        parsed.generationRunId,
      );
    }

    if (parsed.repairAttemptId) {
      const repairAttempt = await this.findRepairAttemptRecord(
        tenantId,
        appId,
        parsed.repairAttemptId,
      );

      if (
        parsed.generationRunId &&
        repairAttempt.generationRunId !== parsed.generationRunId
      ) {
        throw new GeneratedAppRepairAttemptNotFoundException(
          parsed.repairAttemptId,
        );
      }
    }
  }

  private async createGateRunAndUpdateApp(
    tenantId: string,
    userId: string,
    app: GeneratedApp,
    parsed: CreateGeneratedAppGateRunDtoType,
    options: {
      buildGateResults?: (
        gateResult: GeneratedAppGateResult,
        nowIso: string,
      ) => GeneratedAppGateResult[];
      generationPlan?: GeneratedAppGenerationPlan | null;
    } = {},
  ): Promise<RecordGeneratedAppGateRunResponseDto> {
    const gateDefinition = getGeneratedAppGateDefinition(parsed.gateId);

    if (!gateDefinition) {
      throw new GeneratedAppGateDefinitionNotFoundException(parsed.gateId);
    }

    const now = new Date();
    const startedAt = parsed.startedAt ? new Date(parsed.startedAt) : now;
    const completedAt =
      parsed.completedAt !== undefined
        ? parsed.completedAt === null
          ? null
          : new Date(parsed.completedAt)
        : parsed.status === 'running'
          ? null
          : now;

    const [gateRun] = await this.tenantDb
      .insert(schema.generatedAppGateRuns)
      .values({
        tenantId,
        generatedAppId: app.id,
        generationRunId: parsed.generationRunId ?? null,
        repairAttemptId: parsed.repairAttemptId ?? null,
        gateId: gateDefinition.gateId,
        gateOrder: gateDefinition.order,
        gateName: gateDefinition.name,
        blocking: gateDefinition.blocking,
        attemptNumber: parsed.attemptNumber,
        status: parsed.status,
        summary: parsed.summary,
        evidence: parsed.evidence,
        failure: parsed.failure ?? null,
        repairInstructions: parsed.repairInstructions ?? null,
        startedAt,
        completedAt,
        createdBy: userId,
      })
      .returning();

    const updatedAt = completedAt ?? now;
    const gateResult: GeneratedAppGateResult = {
      gateId: gateDefinition.gateId,
      order: gateDefinition.order,
      name: gateDefinition.name,
      blocking: gateDefinition.blocking,
      status: parsed.status,
      summary: parsed.summary,
      evidence: parsed.evidence,
      updatedAt: updatedAt.toISOString(),
    };
    const gateResults =
      options.buildGateResults?.(gateResult, updatedAt.toISOString()) ??
      normalizeGeneratedAppGateResults([
        ...app.gateResults.filter((gate) => gate.gateId !== gateResult.gateId),
        gateResult,
      ]);
    const updatePayload = this.buildGateResultsUpdatePayload(
      userId,
      gateResults,
      {
        generationPlan: options.generationPlan,
      },
    );

    const [updated] = await this.tenantDb
      .update(schema.generatedApps)
      .set(updatePayload)
      .where(
        and(
          eq(schema.generatedApps.id, app.id),
          eq(schema.generatedApps.tenantId, tenantId),
        ),
      )
      .returning();

    if (!updated) {
      throw new GeneratedAppNotFoundException(app.id);
    }

    return {
      gateRun: this.toGateRunResponseDto(gateRun),
      app: this.toResponseDto(updated),
    };
  }

  private buildRunnerGateResults(
    app: GeneratedApp,
    executedGateResults: GeneratedAppGateResult[],
    nowIso: string,
  ): GeneratedAppGateResult[] {
    const initialGateResults = createInitialGeneratedAppGateResults(nowIso);
    const canonicalGateIds = new Set(
      initialGateResults.map((gate) => gate.gateId),
    );
    const executedByGateId = new Map(
      executedGateResults.map((gate) => [gate.gateId, gate]),
    );
    const extensionGateResults = app.gateResults.filter(
      (gate) => !canonicalGateIds.has(gate.gateId),
    );

    return normalizeGeneratedAppGateResults(
      [
        ...initialGateResults.map(
          (gate) => executedByGateId.get(gate.gateId) ?? gate,
        ),
        ...extensionGateResults,
      ],
      nowIso,
    );
  }

  private buildGenerationPlan(
    appSpec: GeneratedAppSpec,
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
          .filter((scenario) =>
            scenario.requirementIds.includes(requirement.id),
          )
          .map((scenario) => scenario.id);

      scenarioIdsByRequirementId.set(requirement.id, scenarioIds);
    }

    return {
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
          route: this.buildPlanRoute(page.id),
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
          stepId: `step-${index + 1}-${this.buildPlanSegment(requirement.id)}`,
          label: `实现 ${requirement.id}`,
          purpose: requirement.text,
          requirementIds: [requirement.id],
          scenarioIds: scenarioIdsByRequirementId.get(requirement.id) ?? [],
        })),
      },
      pluginTools: {
        tools: [],
        emptyReason:
          '当前 AppSpec 未声明需要平台现有能力之外的私有插件或外部工具；后续 Gate 2-4 可在发现缺口时补充受控插件计划。',
        permissionPolicy: [
          '插件/工具必须显式声明权限。',
          '未通过 manifest、构建、签名、权限审计和 sandbox smoke test 前不得绑定到 Agent/Workflow。',
          '禁止隐式放开网络、存储、知识库或 LLM 权限。',
        ],
      },
      dataPersistence: {
        publicSubmissionsPersisted:
          appSpec.dataPolicy.publicSubmissionsPersisted,
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
          }-${this.buildPlanSegment(requirement.id)}`,
        ],
        planEvidenceIds: [
          'gate-1-frontend-plan',
          'gate-1-orchestration-plan',
          'gate-1-plugin-tool-plan',
          'gate-1-data-persistence-plan',
          'gate-1-test-gate-plan',
        ],
      })),
    };
  }

  private buildStaticContracts(
    appSpec: GeneratedAppSpec,
    generationPlan: GeneratedAppGenerationPlan,
  ): GeneratedAppStaticContracts {
    const orchestrationNodes = generationPlan.orchestration.steps.map(
      (step) => ({
        nodeId: `node-${this.buildPlanSegment(step.stepId)}`,
        stepId: step.stepId,
        label: step.label,
        requirementIds: step.requirementIds,
        scenarioIds: step.scenarioIds,
        inputHandle: 'input',
        outputHandle: 'output',
      }),
    );

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
          destinations:
            generationPlan.orchestration.outputContract.destinations,
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
          (stepId) => `node-${this.buildPlanSegment(stepId)}`,
        ),
        staticContractIds: [...GATE_2_STATIC_CONTRACT_IDS],
      })),
    };
  }

  private evaluateGate2StaticContracts(
    appSpec: GeneratedAppSpec,
    generationPlan: GeneratedAppGenerationPlan,
    staticContracts: unknown,
  ): Gate2Evaluation {
    const checks = this.buildGate2Checks(
      appSpec,
      generationPlan,
      staticContracts,
    );
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

  private buildBuildUnitPlan(
    appSpec: GeneratedAppSpec,
    generationPlan: GeneratedAppGenerationPlan,
    staticContracts: GeneratedAppStaticContracts,
  ): GeneratedAppBuildUnitPlan {
    const requirementIds = appSpec.coreRequirements.map(
      (requirement) => requirement.id,
    );
    const scenarioIds = appSpec.acceptanceScenarios.map(
      (scenario) => scenario.id,
    );
    const routeIds = staticContracts.frontendRoutes.map(
      (route) => route.pageId,
    );
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

    return {
      planVersion: 1,
      appSpecVersion: appSpec.version,
      generationPlanVersion: generationPlan.planVersion,
      staticContractsVersion: staticContracts.contractVersion,
      executionLevel: 'contract-skeleton',
      frontendBuild: {
        command: staticContracts.testEntry.buildGateCommand,
        workingDirectory: '/workspace/generated-app',
        routeIds,
        requirementIds,
        scenarioIds,
        expectedArtifacts: ['dist/index.html', 'dist/assets/manifest.json'],
      },
      typecheck: {
        command: 'agentloom generated-app gate-3 typecheck',
        tsconfigPath: 'tsconfig.generated-app.json',
        requirementIds,
      },
      unitTests: {
        command: staticContracts.testEntry.unitGateCommand,
        entry: 'src/generated-app/__tests__/runtime.contract.spec.ts',
        requirementIds,
        scenarioIds,
      },
      componentGoldenTests: {
        command: 'agentloom generated-app gate-3 component-golden',
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
      acceptanceScenarioCoverage: appSpec.acceptanceScenarios.map(
        (scenario) => ({
          scenarioId: scenario.id,
          requirementIds: scenario.requirementIds,
          coveredBy: [
            'gate-3-unit-test-command',
            'gate-3-component-golden-test-entry',
          ],
        }),
      ),
      pluginBuildExpectations: {
        tools: generationPlan.pluginTools.tools.map((tool) => ({
          toolId: tool.toolId,
          command: `agentloom generated-app gate-3 plugin-build ${tool.toolId}`,
          manifestPath: `plugins/${tool.toolId}/agentloom.plugin.json`,
          artifactPath: `artifacts/gate-3/plugins/${tool.toolId}.alp`,
          goldenTestCommand: `agentloom generated-app gate-3 plugin-golden ${tool.toolId}`,
          requirementIds: tool.requirementIds,
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

  private evaluateGate3BuildUnitPlan(
    appSpec: GeneratedAppSpec,
    generationPlan: GeneratedAppGenerationPlan,
    staticContracts: GeneratedAppStaticContracts,
    buildUnitPlan: unknown,
  ): Gate3Evaluation {
    const checks = this.buildGate3Checks(
      appSpec,
      generationPlan,
      staticContracts,
      buildUnitPlan,
    );
    const failedChecks = checks.filter((check) => !check.passed);
    const evidence = checks.map((check) => ({
      id: `gate-3-${check.id}`,
      label: check.label,
      kind: (check.id.includes('test') ||
      check.id.includes('acceptance-scenario')
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

  private buildIntegrationPlan(
    appSpec: GeneratedAppSpec,
    generationPlan: GeneratedAppGenerationPlan,
    staticContracts: GeneratedAppStaticContracts,
    buildUnitPlan: GeneratedAppBuildUnitPlan,
  ): GeneratedAppIntegrationPlan {
    const requirementIds = appSpec.coreRequirements.map(
      (requirement) => requirement.id,
    );
    const scenarioIds = appSpec.acceptanceScenarios.map(
      (scenario) => scenario.id,
    );
    const orchestrationNodeIds = staticContracts.orchestration.nodes.map(
      (node) => node.nodeId,
    );
    const orchestrationEdgeRefs = staticContracts.orchestration.edges.map(
      (edge) => `${edge.fromNodeId}->${edge.toNodeId}`,
    );
    const dependencyArtifacts = buildUnitPlan.artifactExpectations.map(
      (artifact) => ({
        artifactId: artifact.artifactId,
        kind: artifact.kind,
        sourceGateId: 'gate-3' as const,
        path: artifact.path,
        required: true,
      }),
    );
    const publicRuntimeApiChecks: GeneratedAppIntegrationPlan['publicRuntimeApiChecks'] =
      [
        {
          checkId: 'gate-4-public-runtime-read',
          kind: 'public_runtime_read',
          method: 'GET',
          pathTemplate: '/generated-apps/public/{token}',
          staticContractIds: [
            'gate-2-public-runtime-contract',
            'gate-2-frontend-route-contract',
          ],
          requirementIds,
          scenarioIds,
          expectedStatus: 200,
          payloadContractRefs: [
            'staticContracts.publicRuntime.input',
            'staticContracts.publicRuntime.output',
          ],
        },
        {
          checkId: 'gate-4-public-runtime-submit-input',
          kind: 'public_runtime_submit',
          method: 'POST',
          pathTemplate: '/generated-apps/public/{token}/submissions',
          staticContractIds: [
            'gate-2-public-runtime-contract',
            'gate-2-submission-persistence-contract',
          ],
          requirementIds,
          scenarioIds,
          expectedStatus: 201,
          payloadContractRefs: [
            'staticContracts.publicRuntime.input',
            'staticContracts.submissionPersistence',
          ],
        },
        {
          checkId: 'gate-4-public-submission-detail',
          kind: 'public_submission_detail',
          method: 'GET',
          pathTemplate:
            '/generated-apps/public/{token}/submissions/{submissionId}',
          staticContractIds: [
            'gate-2-public-runtime-contract',
            'gate-2-submission-persistence-contract',
          ],
          requirementIds,
          scenarioIds,
          expectedStatus: 200,
          payloadContractRefs: [
            'staticContracts.publicRuntime.output',
            'staticContracts.submissionPersistence',
          ],
        },
      ];
    const creatorManagementApiChecks: GeneratedAppIntegrationPlan['creatorManagementApiChecks'] =
      [
        {
          checkId: 'gate-4-creator-generation-run-query',
          kind: 'creator_generation_run_query',
          method: 'GET',
          pathTemplate: '/generated-apps/{appId}/generation-runs',
          staticContractIds: [
            'gate-2-test-entry-contract',
            'gate-2-traceability-contract',
          ],
          requirementIds,
          expectedStatus: 200,
        },
        {
          checkId: 'gate-4-creator-gate-run-query',
          kind: 'creator_gate_run_query',
          method: 'GET',
          pathTemplate:
            '/generated-apps/{appId}/gate-runs?generationRunId={runId}',
          staticContractIds: [
            'gate-2-test-entry-contract',
            'gate-2-traceability-contract',
          ],
          requirementIds,
          expectedStatus: 200,
        },
        {
          checkId: 'gate-4-creator-submission-query',
          kind: 'creator_submission_query',
          method: 'GET',
          pathTemplate: '/generated-apps/{appId}/submissions',
          staticContractIds: [
            'gate-2-submission-persistence-contract',
            'gate-2-traceability-contract',
          ],
          requirementIds,
          expectedStatus: 200,
        },
      ];
    const fixtureIdsByScenarioId = new Map(
      appSpec.acceptanceScenarios.map((scenario) => [
        scenario.id,
        `fixture-${this.buildPlanSegment(scenario.id)}`,
      ]),
    );
    const dryRunFixtures = appSpec.acceptanceScenarios.map<
      GeneratedAppIntegrationPlan['agentWorkflowDryRunExpectations']['fixtures'][number]
    >((scenario) => ({
      fixtureId:
        fixtureIdsByScenarioId.get(scenario.id) ??
        `fixture-${this.buildPlanSegment(scenario.id)}`,
      scenarioId: scenario.id,
      requirementIds: scenario.requirementIds,
      orchestrationNodeIds,
      orchestrationEdgeRefs,
      inputMapping: {
        staticContractId: 'gate-2-public-runtime-contract',
        requiredFields: staticContracts.publicRuntime.input.requiredFields,
      },
      outputMapping: {
        staticContractId: 'gate-2-public-runtime-contract',
        destinations: staticContracts.publicRuntime.output.destinations,
      },
      traceArtifactIds: ['agent-workflow-dry-run-trace'],
    }));
    const pluginSmokeTools = generationPlan.pluginTools.tools.map<
      GeneratedAppIntegrationPlan['pluginSandboxSmokeExpectations']['tools'][number]
    >((tool) => ({
      toolId: tool.toolId,
      smokeCheckId: `gate-4-plugin-smoke-${tool.toolId}`,
      artifactId: `plugin-bundle-${tool.toolId}`,
      fixturePath: `artifacts/gate-4/plugins/${tool.toolId}-smoke-fixture.json`,
      expectedTraceArtifactId: `plugin-smoke-trace-${tool.toolId}`,
      requirementIds: tool.requirementIds,
      sandboxRuntime: 'wasm-extism',
    }));
    const pluginSmokeCheckIds = pluginSmokeTools.map(
      (tool) => tool.smokeCheckId,
    );
    const coreCheckIds = [
      ...GATE_4_PUBLIC_RUNTIME_API_CHECK_IDS,
      ...GATE_4_CREATOR_MANAGEMENT_API_CHECK_IDS,
      'gate-4-agent-workflow-dry-run-fixture',
    ];
    const traceArtifacts: GeneratedAppIntegrationPlan['traceArtifacts'] = [
      {
        artifactId: 'public-runtime-api-trace',
        kind: 'public_runtime_api_trace',
        path: 'artifacts/gate-4/public-runtime-api-trace.json',
        producedByCheckIds: [...GATE_4_PUBLIC_RUNTIME_API_CHECK_IDS],
      },
      {
        artifactId: 'creator-management-api-trace',
        kind: 'creator_management_api_trace',
        path: 'artifacts/gate-4/creator-management-api-trace.json',
        producedByCheckIds: [...GATE_4_CREATOR_MANAGEMENT_API_CHECK_IDS],
      },
      {
        artifactId: 'agent-workflow-dry-run-trace',
        kind: 'agent_workflow_dry_run_trace',
        path: 'artifacts/gate-4/agent-workflow-dry-run-trace.json',
        producedByCheckIds: ['gate-4-agent-workflow-dry-run-fixture'],
      },
      ...pluginSmokeTools.map((tool) => ({
        artifactId: tool.expectedTraceArtifactId,
        kind: 'plugin_sandbox_smoke_trace' as const,
        path: `artifacts/gate-4/plugins/${tool.toolId}-smoke-trace.json`,
        producedByCheckIds: [tool.smokeCheckId],
      })),
    ];
    const coverageCheckIds = [...coreCheckIds, ...pluginSmokeCheckIds];

    return {
      planVersion: 1,
      appSpecVersion: appSpec.version,
      generationPlanVersion: generationPlan.planVersion,
      staticContractsVersion: staticContracts.contractVersion,
      buildUnitPlanVersion: buildUnitPlan.planVersion,
      executionLevel: 'integration-skeleton',
      skeletonDisclaimer: GATE_4_SKELETON_EVIDENCE_NOTE,
      testTenant: {
        tenantKind: 'synthetic',
        tenantAlias: 'generated-app-gate-4-test-tenant',
        authMode: 'tenant-scoped-synthetic-no-real-token',
        usesRealTokens: false,
        noProductionResources: true,
      },
      testResources: {
        resourceIsolation: 'ephemeral-test-resources-only',
        usesRealTokens: false,
        generatedAppWorkspacePath: '/workspace/generated-app',
        fixtureDirectory: 'artifacts/gate-4/fixtures',
        requiredScenarioIds: scenarioIds,
      },
      publicRuntimeApiChecks,
      creatorManagementApiChecks,
      agentWorkflowDryRunExpectations: {
        expectationLevel: 'dry-run-fixture-skeleton',
        orchestrationNodeIds,
        orchestrationEdgeRefs,
        fixtures: dryRunFixtures,
      },
      pluginSandboxSmokeExpectations: {
        tools: pluginSmokeTools,
        emptyReason:
          generationPlan.pluginTools.tools.length === 0
            ? '当前 generationPlan.pluginTools 未声明私有插件；Gate 4 不需要插件 WASM/Extism smoke skeleton，但明确记录无插件原因。'
            : null,
      },
      dependencyArtifacts,
      acceptanceScenarioCoverage: appSpec.acceptanceScenarios.map(
        (scenario) => ({
          scenarioId: scenario.id,
          requirementIds: scenario.requirementIds,
          coveredByCheckIds: [
            'gate-4-public-runtime-submit-input',
            'gate-4-agent-workflow-dry-run-fixture',
            ...pluginSmokeCheckIds,
          ],
          fixtureIds: [
            fixtureIdsByScenarioId.get(scenario.id) ??
              `fixture-${this.buildPlanSegment(scenario.id)}`,
          ],
        }),
      ),
      requirementCoverage: appSpec.coreRequirements.map((requirement) => ({
        requirementId: requirement.id,
        scenarioIds:
          appSpec.traceability.find(
            (entry) => entry.requirementId === requirement.id,
          )?.scenarioIds ?? [],
        coveredByCheckIds: coverageCheckIds,
        dependencyArtifactIds: dependencyArtifacts.map(
          (artifact) => artifact.artifactId,
        ),
      })),
      orchestrationCoverage: orchestrationNodeIds.map((nodeId) => ({
        nodeId,
        edgeRefs: orchestrationEdgeRefs,
        coveredByFixtureIds: dryRunFixtures.map((fixture) => fixture.fixtureId),
        coveredByCheckIds: ['gate-4-agent-workflow-dry-run-fixture'],
      })),
      traceArtifacts,
      failureCaptureFields: [
        ...GATE_4_REQUIRED_FAILURE_CAPTURE_FIELDS,
        'assertionSummary',
        'redactedPayloadPreview',
      ],
    };
  }

  private evaluateGate4IntegrationPlan(
    appSpec: GeneratedAppSpec,
    generationPlan: GeneratedAppGenerationPlan,
    staticContracts: GeneratedAppStaticContracts,
    buildUnitPlan: GeneratedAppBuildUnitPlan,
    integrationPlan: unknown,
  ): Gate4Evaluation {
    const checks = this.buildGate4Checks(
      appSpec,
      generationPlan,
      staticContracts,
      buildUnitPlan,
      integrationPlan,
    );
    const failedChecks = checks.filter((check) => !check.passed);
    const evidence = checks.map((check) => ({
      id: `gate-4-${check.id}`,
      label: check.label,
      kind: 'test' as const,
      url: null,
      summary:
        check.issues.length === 0
          ? `${check.summary} ${GATE_4_SKELETON_EVIDENCE_NOTE}`
          : `${check.summary} 缺口：${check.issues.join(
              '；',
            )} ${GATE_4_SKELETON_EVIDENCE_NOTE}`,
    }));

    if (failedChecks.length > 0) {
      const failure: GeneratedAppGateRunFailure = {
        code: 'integration-plan-incomplete',
        message: `IntegrationPlan 集成 skeleton 检查失败：${failedChecks
          .map((check) => check.label)
          .join(
            '、',
          )}；本失败只来自 integration-skeleton 合约完整性检查，不代表真实 API 调用、真实 Agent/Workflow dry-run、真实插件 WASM/Extism smoke test 或真实 sandbox run 已经执行。`,
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
          'Gate 4 失败：integrationPlan 未完整覆盖测试租户/资源、公开 runtime API、创建者管理 API、Agent/Workflow dry-run fixture、插件 sandbox smoke、Gate 3 依赖 artifact、覆盖矩阵、trace artifact 或失败捕获字段；本结果仅表示契约级 integration skeleton 检查失败，不代表真实 API 调用、真实 Agent/Workflow dry-run、真实插件 WASM/Extism smoke test 或真实 sandbox run 已经执行。',
        evidence,
        failure,
        repairInstructions:
          '修复 generationPlan.integrationPlan，使其覆盖测试租户/资源、public runtime API checks、creator management API checks、Agent/Workflow dry-run fixture、plugin sandbox smoke expectations、Gate 3 dependency artifacts、需求/场景/编排覆盖、trace artifacts 和 failure capture fields；当前 Gate 4 仍只检查 integration-skeleton 合约，不代表真实 API 调用、真实 Agent/Workflow dry-run、真实插件 WASM/Extism smoke test 或真实 sandbox run 已经执行。',
      };
    }

    return {
      status: 'passed',
      summary:
        'Gate 4 通过：integrationPlan 集成 skeleton 已完整覆盖测试租户/资源、公开 runtime API、创建者管理 API、Agent/Workflow dry-run fixture、插件 sandbox smoke、Gate 3 依赖 artifact、覆盖矩阵、trace artifact 和失败捕获字段；本结果仅表示契约级 integration skeleton 完整，不代表真实 API 调用、真实 Agent/Workflow dry-run、真实插件 WASM/Extism smoke test 或真实 sandbox run 已经执行。',
      evidence,
      failure: null,
      repairInstructions: null,
    };
  }

  private buildGate4Checks(
    appSpec: GeneratedAppSpec,
    generationPlan: GeneratedAppGenerationPlan,
    staticContracts: GeneratedAppStaticContracts,
    buildUnitPlan: GeneratedAppBuildUnitPlan,
    integrationPlan: unknown,
  ): Gate4Check[] {
    if (!this.isRecord(integrationPlan)) {
      return [
        {
          id: 'integration-plan-object',
          label: 'IntegrationPlan JSON 对象',
          passed: false,
          summary:
            '检查 generationPlan.integrationPlan 是否为结构化 JSON 对象。',
          issues: ['integrationPlan 不是对象'],
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
    const knownStaticContractIds = new Set<string>([
      ...GATE_2_STATIC_CONTRACT_IDS,
    ]);
    const orchestrationNodeIds = staticContracts.orchestration.nodes.map(
      (node) => node.nodeId,
    );
    const knownOrchestrationNodeIds = new Set(orchestrationNodeIds);
    const orchestrationEdgeRefs = staticContracts.orchestration.edges.map(
      (edge) => `${edge.fromNodeId}->${edge.toNodeId}`,
    );
    const knownOrchestrationEdgeRefs = new Set(orchestrationEdgeRefs);
    const expectedDependencyArtifactIds =
      buildUnitPlan.artifactExpectations.map((artifact) => artifact.artifactId);
    const knownDependencyArtifactIds = new Set(expectedDependencyArtifactIds);
    const plannedToolIds = new Set(
      generationPlan.pluginTools.tools.map((tool) => tool.toolId),
    );
    const plannedToolById = new Map(
      generationPlan.pluginTools.tools.map((tool) => [tool.toolId, tool]),
    );
    const expectedTraceArtifactIds = [
      ...GATE_4_CORE_TRACE_ARTIFACT_IDS,
      ...generationPlan.pluginTools.tools.map(
        (tool) => `plugin-smoke-trace-${tool.toolId}`,
      ),
    ];
    const expectedPluginSmokeCheckIds = generationPlan.pluginTools.tools.map(
      (tool) => `gate-4-plugin-smoke-${tool.toolId}`,
    );
    const expectedArtifactKindById = new Map(
      buildUnitPlan.artifactExpectations.map((artifact) => [
        artifact.artifactId,
        artifact.kind,
      ]),
    );
    const expectedTraceArtifactKindById = new Map<string, string>([
      ['public-runtime-api-trace', 'public_runtime_api_trace'],
      ['creator-management-api-trace', 'creator_management_api_trace'],
      ['agent-workflow-dry-run-trace', 'agent_workflow_dry_run_trace'],
      ...generationPlan.pluginTools.tools.map(
        (tool) =>
          [
            `plugin-smoke-trace-${tool.toolId}`,
            'plugin_sandbox_smoke_trace',
          ] as const,
      ),
    ]);

    const testTenant = this.getRecord(integrationPlan.testTenant);
    const testResources = this.getRecord(integrationPlan.testResources);
    const publicRuntimeApiChecks = this.getRecordArray(
      integrationPlan.publicRuntimeApiChecks,
    );
    const creatorManagementApiChecks = this.getRecordArray(
      integrationPlan.creatorManagementApiChecks,
    );
    const dryRunExpectations = this.getRecord(
      integrationPlan.agentWorkflowDryRunExpectations,
    );
    const dryRunFixtures = this.getRecordArray(dryRunExpectations?.fixtures);
    const pluginSmokeExpectations = this.getRecord(
      integrationPlan.pluginSandboxSmokeExpectations,
    );
    const pluginSmokeTools = this.getRecordArray(
      pluginSmokeExpectations?.tools,
    );
    const dependencyArtifacts = this.getRecordArray(
      integrationPlan.dependencyArtifacts,
    );
    const acceptanceScenarioCoverage = this.getRecordArray(
      integrationPlan.acceptanceScenarioCoverage,
    );
    const requirementCoverage = this.getRecordArray(
      integrationPlan.requirementCoverage,
    );
    const orchestrationCoverage = this.getRecordArray(
      integrationPlan.orchestrationCoverage,
    );
    const traceArtifacts = this.getRecordArray(integrationPlan.traceArtifacts);

    const publicCheckIds = publicRuntimeApiChecks
      .map((check) => this.getNonEmptyString(check.checkId))
      .filter((checkId): checkId is string => checkId !== null);
    const creatorCheckIds = creatorManagementApiChecks
      .map((check) => this.getNonEmptyString(check.checkId))
      .filter((checkId): checkId is string => checkId !== null);
    const pluginSmokeCheckIds = pluginSmokeTools
      .map((tool) => this.getNonEmptyString(tool.smokeCheckId))
      .filter((checkId): checkId is string => checkId !== null);
    const dryRunFixtureIds = dryRunFixtures
      .map((fixture) => this.getNonEmptyString(fixture.fixtureId))
      .filter((fixtureId): fixtureId is string => fixtureId !== null);
    const dependencyArtifactIds = dependencyArtifacts
      .map((artifact) => this.getNonEmptyString(artifact.artifactId))
      .filter((artifactId): artifactId is string => artifactId !== null);
    const traceArtifactIds = traceArtifacts
      .map((artifact) => this.getNonEmptyString(artifact.artifactId))
      .filter((artifactId): artifactId is string => artifactId !== null);
    const knownActualTraceArtifactIds = new Set(traceArtifactIds);
    const knownDryRunFixtureIds = new Set(dryRunFixtureIds);
    const knownGate4CheckIds = new Set<string>([
      ...publicCheckIds,
      ...creatorCheckIds,
      'gate-4-agent-workflow-dry-run-fixture',
      ...pluginSmokeCheckIds,
    ]);
    const expectedPublicCheckKinds = new Map<string, string>([
      ['gate-4-public-runtime-read', 'public_runtime_read'],
      ['gate-4-public-runtime-submit-input', 'public_runtime_submit'],
      ['gate-4-public-submission-detail', 'public_submission_detail'],
    ]);
    const expectedCreatorCheckKinds = new Map<string, string>([
      ['gate-4-creator-generation-run-query', 'creator_generation_run_query'],
      ['gate-4-creator-gate-run-query', 'creator_gate_run_query'],
      ['gate-4-creator-submission-query', 'creator_submission_query'],
    ]);
    const expectedGate4CheckIds = [
      ...GATE_4_PUBLIC_RUNTIME_API_CHECK_IDS,
      ...GATE_4_CREATOR_MANAGEMENT_API_CHECK_IDS,
      'gate-4-agent-workflow-dry-run-fixture',
      ...expectedPluginSmokeCheckIds,
    ];

    const versionIssues = [
      ...(integrationPlan.planVersion === 1 ? [] : ['planVersion 必须为 1']),
      ...(integrationPlan.appSpecVersion === appSpec.version
        ? []
        : [
            `appSpecVersion=${String(
              integrationPlan.appSpecVersion,
            )} 与 AppSpec version=${appSpec.version} 不一致`,
          ]),
      ...(integrationPlan.generationPlanVersion === generationPlan.planVersion
        ? []
        : [
            `generationPlanVersion=${String(
              integrationPlan.generationPlanVersion,
            )} 与 generationPlan.planVersion=${generationPlan.planVersion} 不一致`,
          ]),
      ...(integrationPlan.staticContractsVersion ===
      staticContracts.contractVersion
        ? []
        : [
            `staticContractsVersion=${String(
              integrationPlan.staticContractsVersion,
            )} 与 staticContracts.contractVersion=${staticContracts.contractVersion} 不一致`,
          ]),
      ...(integrationPlan.buildUnitPlanVersion === buildUnitPlan.planVersion
        ? []
        : [
            `buildUnitPlanVersion=${String(
              integrationPlan.buildUnitPlanVersion,
            )} 与 buildUnitPlan.planVersion=${buildUnitPlan.planVersion} 不一致`,
          ]),
      ...(integrationPlan.executionLevel === 'integration-skeleton'
        ? []
        : ['executionLevel 必须为 integration-skeleton']),
      ...(!this.getNonEmptyString(integrationPlan.skeletonDisclaimer)
        ? ['skeletonDisclaimer 缺失']
        : []),
    ];
    const testTenantIssues = [
      ...this.requireRecord(testTenant, 'testTenant'),
      ...(testTenant?.tenantKind === 'synthetic'
        ? []
        : ['testTenant.tenantKind 必须为 synthetic']),
      ...(!this.getNonEmptyString(testTenant?.tenantAlias)
        ? ['testTenant.tenantAlias 缺失']
        : []),
      ...(testTenant?.authMode === 'tenant-scoped-synthetic-no-real-token'
        ? []
        : ['testTenant.authMode 必须为 tenant-scoped-synthetic-no-real-token']),
      ...(testTenant?.usesRealTokens === false
        ? []
        : ['testTenant.usesRealTokens 必须为 false']),
      ...(testTenant?.noProductionResources === true
        ? []
        : ['testTenant.noProductionResources 必须为 true']),
      ...this.collectSensitiveTokenIssues(integrationPlan),
    ];
    const testResourceIssues = [
      ...this.requireRecord(testResources, 'testResources'),
      ...(testResources?.resourceIsolation === 'ephemeral-test-resources-only'
        ? []
        : [
            'testResources.resourceIsolation 必须为 ephemeral-test-resources-only',
          ]),
      ...(testResources?.usesRealTokens === false
        ? []
        : ['testResources.usesRealTokens 必须为 false']),
      ...(!this.getNonEmptyString(testResources?.generatedAppWorkspacePath)
        ? ['testResources.generatedAppWorkspacePath 缺失']
        : []),
      ...(!this.getNonEmptyString(testResources?.fixtureDirectory)
        ? ['testResources.fixtureDirectory 缺失']
        : []),
      ...this.buildMissingItemsIssues(
        'testResources.requiredScenarioIds',
        this.getStringArray(testResources?.requiredScenarioIds),
        scenarioIds,
      ),
      ...this.buildUnknownReferenceIssues(
        'testResources.requiredScenarioIds',
        this.getStringArray(testResources?.requiredScenarioIds),
        knownScenarioIds,
      ),
    ];
    const publicRuntimeApiIssues = [
      ...(publicRuntimeApiChecks.length === 0
        ? ['publicRuntimeApiChecks 不能为空']
        : []),
      ...this.buildMissingItemsIssues(
        'publicRuntimeApiChecks.checkId',
        publicCheckIds,
        [...GATE_4_PUBLIC_RUNTIME_API_CHECK_IDS],
      ),
      ...this.buildDuplicateItemIssues(
        'publicRuntimeApiChecks.checkId',
        publicCheckIds,
      ),
      ...publicRuntimeApiChecks.flatMap((check, index) => {
        const checkId = this.getNonEmptyString(check.checkId);
        const kind = this.getNonEmptyString(check.kind);
        const expectedKind = checkId
          ? expectedPublicCheckKinds.get(checkId)
          : undefined;
        const requiredStaticContractIds = kind
          ? (GATE_4_PUBLIC_RUNTIME_CHECK_STATIC_CONTRACTS[kind] ?? [])
          : [];
        const requiredPayloadContractRefs = kind
          ? (GATE_4_PUBLIC_RUNTIME_CHECK_PAYLOAD_CONTRACT_REFS[kind] ?? [])
          : [];

        return [
          ...(!checkId
            ? [`publicRuntimeApiChecks[${index}].checkId 缺失`]
            : []),
          ...(checkId && !expectedPublicCheckKinds.has(checkId)
            ? [
                `publicRuntimeApiChecks[${index}].checkId 引用了未知 API check ${this.formatIssueValue(
                  checkId,
                )}`,
              ]
            : []),
          ...(!kind ? [`publicRuntimeApiChecks[${index}].kind 缺失`] : []),
          ...(kind &&
          !GATE_4_ALLOWED_PUBLIC_RUNTIME_CHECK_KINDS.includes(
            kind as (typeof GATE_4_ALLOWED_PUBLIC_RUNTIME_CHECK_KINDS)[number],
          )
            ? [
                `publicRuntimeApiChecks[${index}].kind 必须是 ${GATE_4_ALLOWED_PUBLIC_RUNTIME_CHECK_KINDS.join(
                  ' | ',
                )} 之一`,
              ]
            : []),
          ...(expectedKind && kind !== expectedKind
            ? [
                `publicRuntimeApiChecks[${index}].kind 与 checkId ${checkId} 不一致`,
              ]
            : []),
          ...(!['GET', 'POST'].includes(String(check.method))
            ? [`publicRuntimeApiChecks[${index}].method 必须为 GET 或 POST`]
            : []),
          ...(!this.getNonEmptyString(check.pathTemplate)
            ? [`publicRuntimeApiChecks[${index}].pathTemplate 缺失`]
            : []),
          ...(typeof check.expectedStatus === 'number' &&
          check.expectedStatus >= 200 &&
          check.expectedStatus < 300
            ? []
            : [
                `publicRuntimeApiChecks[${index}].expectedStatus 必须是 2xx number`,
              ]),
          ...this.buildMissingItemsIssues(
            `publicRuntimeApiChecks[${index}].staticContractIds`,
            this.getStringArray(check.staticContractIds),
            requiredStaticContractIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `publicRuntimeApiChecks[${index}].staticContractIds`,
            this.getStringArray(check.staticContractIds),
            knownStaticContractIds,
          ),
          ...this.buildMissingItemsIssues(
            `publicRuntimeApiChecks[${index}].requirementIds`,
            this.getStringArray(check.requirementIds),
            requirementIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `publicRuntimeApiChecks[${index}].requirementIds`,
            this.getStringArray(check.requirementIds),
            knownRequirementIds,
          ),
          ...this.buildMissingItemsIssues(
            `publicRuntimeApiChecks[${index}].scenarioIds`,
            this.getStringArray(check.scenarioIds),
            scenarioIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `publicRuntimeApiChecks[${index}].scenarioIds`,
            this.getStringArray(check.scenarioIds),
            knownScenarioIds,
          ),
          ...(this.getStringArray(check.payloadContractRefs).length === 0
            ? [`publicRuntimeApiChecks[${index}].payloadContractRefs 不能为空`]
            : []),
          ...this.buildMissingItemsIssues(
            `publicRuntimeApiChecks[${index}].payloadContractRefs`,
            this.getStringArray(check.payloadContractRefs),
            requiredPayloadContractRefs,
          ),
          ...this.buildUnknownReferenceIssues(
            `publicRuntimeApiChecks[${index}].payloadContractRefs`,
            this.getStringArray(check.payloadContractRefs),
            new Set([...GATE_4_ALLOWED_PAYLOAD_CONTRACT_REFS]),
          ),
        ];
      }),
    ];
    const creatorApiIssues = [
      ...(creatorManagementApiChecks.length === 0
        ? ['creatorManagementApiChecks 不能为空']
        : []),
      ...this.buildMissingItemsIssues(
        'creatorManagementApiChecks.checkId',
        creatorCheckIds,
        [...GATE_4_CREATOR_MANAGEMENT_API_CHECK_IDS],
      ),
      ...this.buildDuplicateItemIssues(
        'creatorManagementApiChecks.checkId',
        creatorCheckIds,
      ),
      ...creatorManagementApiChecks.flatMap((check, index) => {
        const checkId = this.getNonEmptyString(check.checkId);
        const kind = this.getNonEmptyString(check.kind);
        const expectedKind = checkId
          ? expectedCreatorCheckKinds.get(checkId)
          : undefined;
        const requiredStaticContractIds = kind
          ? (GATE_4_CREATOR_CHECK_STATIC_CONTRACTS[kind] ?? [])
          : [];

        return [
          ...(!checkId
            ? [`creatorManagementApiChecks[${index}].checkId 缺失`]
            : []),
          ...(checkId && !expectedCreatorCheckKinds.has(checkId)
            ? [
                `creatorManagementApiChecks[${index}].checkId 引用了未知 API check ${this.formatIssueValue(
                  checkId,
                )}`,
              ]
            : []),
          ...(!kind ? [`creatorManagementApiChecks[${index}].kind 缺失`] : []),
          ...(kind &&
          !GATE_4_ALLOWED_CREATOR_MANAGEMENT_CHECK_KINDS.includes(
            kind as (typeof GATE_4_ALLOWED_CREATOR_MANAGEMENT_CHECK_KINDS)[number],
          )
            ? [
                `creatorManagementApiChecks[${index}].kind 必须是 ${GATE_4_ALLOWED_CREATOR_MANAGEMENT_CHECK_KINDS.join(
                  ' | ',
                )} 之一`,
              ]
            : []),
          ...(expectedKind && kind !== expectedKind
            ? [
                `creatorManagementApiChecks[${index}].kind 与 checkId ${checkId} 不一致`,
              ]
            : []),
          ...(check.method === 'GET'
            ? []
            : [`creatorManagementApiChecks[${index}].method 必须为 GET`]),
          ...(!this.getNonEmptyString(check.pathTemplate)
            ? [`creatorManagementApiChecks[${index}].pathTemplate 缺失`]
            : []),
          ...(check.expectedStatus === 200
            ? []
            : [
                `creatorManagementApiChecks[${index}].expectedStatus 必须为 200`,
              ]),
          ...this.buildMissingItemsIssues(
            `creatorManagementApiChecks[${index}].staticContractIds`,
            this.getStringArray(check.staticContractIds),
            requiredStaticContractIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `creatorManagementApiChecks[${index}].staticContractIds`,
            this.getStringArray(check.staticContractIds),
            knownStaticContractIds,
          ),
          ...this.buildMissingItemsIssues(
            `creatorManagementApiChecks[${index}].requirementIds`,
            this.getStringArray(check.requirementIds),
            requirementIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `creatorManagementApiChecks[${index}].requirementIds`,
            this.getStringArray(check.requirementIds),
            knownRequirementIds,
          ),
        ];
      }),
    ];
    const dryRunIssues = [
      ...this.requireRecord(
        dryRunExpectations,
        'agentWorkflowDryRunExpectations',
      ),
      ...(dryRunExpectations?.expectationLevel === 'dry-run-fixture-skeleton'
        ? []
        : [
            'agentWorkflowDryRunExpectations.expectationLevel 必须为 dry-run-fixture-skeleton',
          ]),
      ...this.buildMissingItemsIssues(
        'agentWorkflowDryRunExpectations.orchestrationNodeIds',
        this.getStringArray(dryRunExpectations?.orchestrationNodeIds),
        orchestrationNodeIds,
      ),
      ...this.buildUnknownReferenceIssues(
        'agentWorkflowDryRunExpectations.orchestrationNodeIds',
        this.getStringArray(dryRunExpectations?.orchestrationNodeIds),
        knownOrchestrationNodeIds,
      ),
      ...this.buildMissingItemsIssues(
        'agentWorkflowDryRunExpectations.orchestrationEdgeRefs',
        this.getStringArray(dryRunExpectations?.orchestrationEdgeRefs),
        orchestrationEdgeRefs,
      ),
      ...this.buildUnknownReferenceIssues(
        'agentWorkflowDryRunExpectations.orchestrationEdgeRefs',
        this.getStringArray(dryRunExpectations?.orchestrationEdgeRefs),
        knownOrchestrationEdgeRefs,
      ),
      ...(dryRunFixtures.length === 0
        ? ['agentWorkflowDryRunExpectations.fixtures 不能为空']
        : []),
      ...this.buildDuplicateItemIssues(
        'agentWorkflowDryRunExpectations.fixtures.fixtureId',
        dryRunFixtureIds,
      ),
      ...scenarioIds.flatMap((scenarioId) =>
        dryRunFixtures.some(
          (fixture) =>
            this.getNonEmptyString(fixture.scenarioId) === scenarioId,
        )
          ? []
          : [`场景 ${scenarioId} 缺少 Agent/Workflow dry-run fixture`],
      ),
      ...dryRunFixtures.flatMap((fixture, index) => {
        const scenarioId = this.getNonEmptyString(fixture.scenarioId);
        const scenario = scenarioId
          ? appSpec.acceptanceScenarios.find(
              (candidate) => candidate.id === scenarioId,
            )
          : null;
        const inputMapping = this.getRecord(fixture.inputMapping);
        const outputMapping = this.getRecord(fixture.outputMapping);

        return [
          ...(!this.getNonEmptyString(fixture.fixtureId)
            ? [
                `agentWorkflowDryRunExpectations.fixtures[${index}].fixtureId 缺失`,
              ]
            : []),
          ...(!scenarioId
            ? [
                `agentWorkflowDryRunExpectations.fixtures[${index}].scenarioId 缺失`,
              ]
            : []),
          ...(scenarioId && !knownScenarioIds.has(scenarioId)
            ? [
                `agentWorkflowDryRunExpectations.fixtures[${index}].scenarioId 引用了未知场景 ${this.formatIssueValue(
                  scenarioId,
                )}`,
              ]
            : []),
          ...(scenario
            ? this.buildMissingItemsIssues(
                `agentWorkflowDryRunExpectations.fixtures[${index}].requirementIds`,
                this.getStringArray(fixture.requirementIds),
                scenario.requirementIds,
              )
            : []),
          ...this.buildUnknownReferenceIssues(
            `agentWorkflowDryRunExpectations.fixtures[${index}].requirementIds`,
            this.getStringArray(fixture.requirementIds),
            knownRequirementIds,
          ),
          ...this.buildMissingItemsIssues(
            `agentWorkflowDryRunExpectations.fixtures[${index}].orchestrationNodeIds`,
            this.getStringArray(fixture.orchestrationNodeIds),
            orchestrationNodeIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `agentWorkflowDryRunExpectations.fixtures[${index}].orchestrationNodeIds`,
            this.getStringArray(fixture.orchestrationNodeIds),
            knownOrchestrationNodeIds,
          ),
          ...this.buildMissingItemsIssues(
            `agentWorkflowDryRunExpectations.fixtures[${index}].orchestrationEdgeRefs`,
            this.getStringArray(fixture.orchestrationEdgeRefs),
            orchestrationEdgeRefs,
          ),
          ...this.buildUnknownReferenceIssues(
            `agentWorkflowDryRunExpectations.fixtures[${index}].orchestrationEdgeRefs`,
            this.getStringArray(fixture.orchestrationEdgeRefs),
            knownOrchestrationEdgeRefs,
          ),
          ...this.requireRecord(
            inputMapping,
            `agentWorkflowDryRunExpectations.fixtures[${index}].inputMapping`,
          ),
          ...(inputMapping?.staticContractId ===
          'gate-2-public-runtime-contract'
            ? []
            : [
                `agentWorkflowDryRunExpectations.fixtures[${index}].inputMapping.staticContractId 必须绑定 gate-2-public-runtime-contract`,
              ]),
          ...this.buildMissingItemsIssues(
            `agentWorkflowDryRunExpectations.fixtures[${index}].inputMapping.requiredFields`,
            this.getStringArray(inputMapping?.requiredFields),
            staticContracts.publicRuntime.input.requiredFields,
          ),
          ...this.requireRecord(
            outputMapping,
            `agentWorkflowDryRunExpectations.fixtures[${index}].outputMapping`,
          ),
          ...(outputMapping?.staticContractId ===
          'gate-2-public-runtime-contract'
            ? []
            : [
                `agentWorkflowDryRunExpectations.fixtures[${index}].outputMapping.staticContractId 必须绑定 gate-2-public-runtime-contract`,
              ]),
          ...this.buildMissingItemsIssues(
            `agentWorkflowDryRunExpectations.fixtures[${index}].outputMapping.destinations`,
            this.getStringArray(outputMapping?.destinations),
            staticContracts.publicRuntime.output.destinations,
          ),
          ...(this.getStringArray(fixture.traceArtifactIds).length === 0
            ? [
                `agentWorkflowDryRunExpectations.fixtures[${index}].traceArtifactIds 不能为空`,
              ]
            : []),
          ...this.buildUnknownReferenceIssues(
            `agentWorkflowDryRunExpectations.fixtures[${index}].traceArtifactIds`,
            this.getStringArray(fixture.traceArtifactIds),
            knownActualTraceArtifactIds,
          ),
        ];
      }),
    ];
    const pluginSmokeIssues = [
      ...this.requireRecord(
        pluginSmokeExpectations,
        'pluginSandboxSmokeExpectations',
      ),
      ...(generationPlan.pluginTools.tools.length === 0 &&
      pluginSmokeTools.length > 0
        ? ['无插件计划时 pluginSandboxSmokeExpectations.tools 必须为空']
        : []),
      ...(generationPlan.pluginTools.tools.length === 0 &&
      !this.getNonEmptyString(pluginSmokeExpectations?.emptyReason)
        ? [
            '无插件计划时 pluginSandboxSmokeExpectations.emptyReason 必须说明原因',
          ]
        : []),
      ...(generationPlan.pluginTools.tools.length > 0 &&
      pluginSmokeExpectations?.emptyReason !== null
        ? [
            '有插件计划时 pluginSandboxSmokeExpectations.emptyReason 必须为 null',
          ]
        : []),
      ...generationPlan.pluginTools.tools
        .filter(
          (plannedTool) =>
            !pluginSmokeTools.some(
              (tool) =>
                this.getNonEmptyString(tool.toolId) === plannedTool.toolId,
            ),
        )
        .map(
          (plannedTool) =>
            `插件/工具 ${this.formatIssueValue(
              plannedTool.toolId,
            )} 缺少 Gate 4 sandbox smoke 期望`,
        ),
      ...(generationPlan.pluginTools.tools.length > 0
        ? [
            ...this.buildMissingItemsIssues(
              'pluginSandboxSmokeExpectations.tools.smokeCheckId',
              pluginSmokeCheckIds,
              expectedPluginSmokeCheckIds,
            ),
            ...this.buildDuplicateItemIssues(
              'pluginSandboxSmokeExpectations.tools.smokeCheckId',
              pluginSmokeCheckIds,
            ),
          ]
        : []),
      ...pluginSmokeTools.flatMap((tool, index) => {
        const toolId = this.getNonEmptyString(tool.toolId);
        const plannedTool = toolId ? plannedToolById.get(toolId) : null;
        const expectedSmokeCheckId = plannedTool
          ? `gate-4-plugin-smoke-${plannedTool.toolId}`
          : null;
        const expectedArtifactId = plannedTool
          ? `plugin-bundle-${plannedTool.toolId}`
          : null;
        const expectedTraceArtifactId = plannedTool
          ? `plugin-smoke-trace-${plannedTool.toolId}`
          : null;

        return [
          ...(!toolId
            ? [`pluginSandboxSmokeExpectations.tools[${index}].toolId 缺失`]
            : []),
          ...(toolId && !plannedToolIds.has(toolId)
            ? [
                `pluginSandboxSmokeExpectations.tools[${index}].toolId 引用了未知插件/工具 ${this.formatIssueValue(
                  toolId,
                )}`,
              ]
            : []),
          ...(!this.getNonEmptyString(tool.smokeCheckId)
            ? [
                `pluginSandboxSmokeExpectations.tools[${index}].smokeCheckId 缺失`,
              ]
            : []),
          ...(expectedSmokeCheckId && tool.smokeCheckId !== expectedSmokeCheckId
            ? [
                `pluginSandboxSmokeExpectations.tools[${index}].smokeCheckId 必须为 ${expectedSmokeCheckId}`,
              ]
            : []),
          ...(!this.getNonEmptyString(tool.artifactId)
            ? [`pluginSandboxSmokeExpectations.tools[${index}].artifactId 缺失`]
            : []),
          ...(expectedArtifactId && tool.artifactId !== expectedArtifactId
            ? [
                `pluginSandboxSmokeExpectations.tools[${index}].artifactId 必须引用 ${expectedArtifactId}`,
              ]
            : []),
          ...this.buildUnknownReferenceIssues(
            `pluginSandboxSmokeExpectations.tools[${index}].artifactId`,
            this.getStringArray([tool.artifactId]),
            knownDependencyArtifactIds,
          ),
          ...(!this.getNonEmptyString(tool.fixturePath)
            ? [
                `pluginSandboxSmokeExpectations.tools[${index}].fixturePath 缺失`,
              ]
            : []),
          ...(!this.getNonEmptyString(tool.expectedTraceArtifactId)
            ? [
                `pluginSandboxSmokeExpectations.tools[${index}].expectedTraceArtifactId 缺失`,
              ]
            : []),
          ...(expectedTraceArtifactId &&
          tool.expectedTraceArtifactId !== expectedTraceArtifactId
            ? [
                `pluginSandboxSmokeExpectations.tools[${index}].expectedTraceArtifactId 必须引用 ${expectedTraceArtifactId}`,
              ]
            : []),
          ...this.buildUnknownReferenceIssues(
            `pluginSandboxSmokeExpectations.tools[${index}].expectedTraceArtifactId`,
            this.getStringArray([tool.expectedTraceArtifactId]),
            knownActualTraceArtifactIds,
          ),
          ...(tool.sandboxRuntime === 'wasm-extism'
            ? []
            : [
                `pluginSandboxSmokeExpectations.tools[${index}].sandboxRuntime 必须为 wasm-extism`,
              ]),
          ...(plannedTool
            ? this.buildMissingItemsIssues(
                `pluginSandboxSmokeExpectations.tools[${index}].requirementIds`,
                this.getStringArray(tool.requirementIds),
                plannedTool.requirementIds,
              )
            : []),
          ...this.buildUnknownReferenceIssues(
            `pluginSandboxSmokeExpectations.tools[${index}].requirementIds`,
            this.getStringArray(tool.requirementIds),
            knownRequirementIds,
          ),
        ];
      }),
    ];
    const dependencyArtifactIssues = [
      ...(dependencyArtifacts.length === 0
        ? ['dependencyArtifacts 不能为空']
        : []),
      ...this.buildMissingItemsIssues(
        'dependencyArtifacts.artifactId',
        dependencyArtifactIds,
        expectedDependencyArtifactIds,
      ),
      ...this.buildUnknownReferenceIssues(
        'dependencyArtifacts.artifactId',
        dependencyArtifactIds,
        knownDependencyArtifactIds,
      ),
      ...this.buildDuplicateItemIssues(
        'dependencyArtifacts.artifactId',
        dependencyArtifactIds,
      ),
      ...dependencyArtifacts.flatMap((artifact, index) => [
        ...(!this.getNonEmptyString(artifact.artifactId)
          ? [`dependencyArtifacts[${index}].artifactId 缺失`]
          : []),
        ...(!this.getNonEmptyString(artifact.kind)
          ? [`dependencyArtifacts[${index}].kind 缺失`]
          : []),
        ...(this.getNonEmptyString(artifact.kind) &&
        !GATE_3_ARTIFACT_KINDS.includes(
          this.getNonEmptyString(
            artifact.kind,
          ) as (typeof GATE_3_ARTIFACT_KINDS)[number],
        )
          ? [
              `dependencyArtifacts[${index}].kind 必须是 ${GATE_3_ARTIFACT_KINDS.join(
                ' | ',
              )} 之一`,
            ]
          : []),
        ...(this.getNonEmptyString(artifact.artifactId) &&
        this.getNonEmptyString(artifact.kind) &&
        expectedArtifactKindById.get(
          this.getNonEmptyString(artifact.artifactId) ?? '',
        ) !== undefined &&
        expectedArtifactKindById.get(
          this.getNonEmptyString(artifact.artifactId) ?? '',
        ) !== this.getNonEmptyString(artifact.kind)
          ? [
              `dependencyArtifacts[${index}].kind 与 Gate 3 artifact ${this.formatIssueValue(
                this.getNonEmptyString(artifact.artifactId) ?? '',
              )} 不一致`,
            ]
          : []),
        ...(artifact.sourceGateId === 'gate-3'
          ? []
          : [`dependencyArtifacts[${index}].sourceGateId 必须为 gate-3`]),
        ...(!this.getNonEmptyString(artifact.path)
          ? [`dependencyArtifacts[${index}].path 缺失`]
          : []),
        ...(artifact.required === true
          ? []
          : [`dependencyArtifacts[${index}].required 必须为 true`]),
      ]),
    ];
    const scenarioCoverageById = new Map(
      acceptanceScenarioCoverage
        .map((entry) => {
          const scenarioId = this.getNonEmptyString(entry.scenarioId);
          return scenarioId ? ([scenarioId, entry] as const) : null;
        })
        .filter(
          (entry): entry is readonly [string, Record<string, unknown>] =>
            entry !== null,
        ),
    );
    const acceptanceCoverageIssues = [
      ...(acceptanceScenarioCoverage.length === 0
        ? ['acceptanceScenarioCoverage 不能为空']
        : []),
      ...acceptanceScenarioCoverage.flatMap((entry, index) => {
        const scenarioId = this.getNonEmptyString(entry.scenarioId);

        return [
          ...(!scenarioId
            ? [`acceptanceScenarioCoverage[${index}].scenarioId 缺失`]
            : []),
          ...(scenarioId && !knownScenarioIds.has(scenarioId)
            ? [
                `acceptanceScenarioCoverage[${index}].scenarioId 引用了未知场景 ${this.formatIssueValue(
                  scenarioId,
                )}`,
              ]
            : []),
          ...this.buildUnknownReferenceIssues(
            `acceptanceScenarioCoverage[${index}].coveredByCheckIds`,
            this.getStringArray(entry.coveredByCheckIds),
            knownGate4CheckIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `acceptanceScenarioCoverage[${index}].fixtureIds`,
            this.getStringArray(entry.fixtureIds),
            knownDryRunFixtureIds,
          ),
        ];
      }),
      ...scenarioIds.flatMap((scenarioId) => {
        const entry = scenarioCoverageById.get(scenarioId);
        const scenario = appSpec.acceptanceScenarios.find(
          (candidate) => candidate.id === scenarioId,
        );

        if (!entry) {
          return [`场景 ${scenarioId} 缺少 Gate 4 覆盖声明`];
        }

        return [
          ...this.buildMissingItemsIssues(
            `acceptanceScenarioCoverage[${scenarioId}].requirementIds`,
            this.getStringArray(entry.requirementIds),
            scenario?.requirementIds ?? [],
          ),
          ...this.buildUnknownReferenceIssues(
            `acceptanceScenarioCoverage[${scenarioId}].requirementIds`,
            this.getStringArray(entry.requirementIds),
            knownRequirementIds,
          ),
          ...(this.getStringArray(entry.coveredByCheckIds).length === 0
            ? [
                `acceptanceScenarioCoverage[${scenarioId}].coveredByCheckIds 不能为空`,
              ]
            : []),
          ...(this.getStringArray(entry.fixtureIds).length === 0
            ? [`acceptanceScenarioCoverage[${scenarioId}].fixtureIds 不能为空`]
            : []),
        ];
      }),
    ];
    const requirementCoverageById = new Map(
      requirementCoverage
        .map((entry) => {
          const requirementId = this.getNonEmptyString(entry.requirementId);
          return requirementId ? ([requirementId, entry] as const) : null;
        })
        .filter(
          (entry): entry is readonly [string, Record<string, unknown>] =>
            entry !== null,
        ),
    );
    const requirementCoverageIssues = [
      ...(requirementCoverage.length === 0
        ? ['requirementCoverage 不能为空']
        : []),
      ...requirementCoverage.flatMap((entry, index) => {
        const requirementId = this.getNonEmptyString(entry.requirementId);

        return [
          ...(!requirementId
            ? [`requirementCoverage[${index}].requirementId 缺失`]
            : []),
          ...(requirementId && !knownRequirementIds.has(requirementId)
            ? [
                `requirementCoverage[${index}].requirementId 引用了未知需求 ${this.formatIssueValue(
                  requirementId,
                )}`,
              ]
            : []),
          ...this.buildUnknownReferenceIssues(
            `requirementCoverage[${index}].scenarioIds`,
            this.getStringArray(entry.scenarioIds),
            knownScenarioIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `requirementCoverage[${index}].coveredByCheckIds`,
            this.getStringArray(entry.coveredByCheckIds),
            knownGate4CheckIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `requirementCoverage[${index}].dependencyArtifactIds`,
            this.getStringArray(entry.dependencyArtifactIds),
            knownDependencyArtifactIds,
          ),
        ];
      }),
      ...requirementIds.flatMap((requirementId) => {
        const entry = requirementCoverageById.get(requirementId);

        if (!entry) {
          return [`需求 ${requirementId} 缺少 Gate 4 覆盖声明`];
        }

        const expectedScenarioIds =
          appSpec.traceability.find(
            (candidate) => candidate.requirementId === requirementId,
          )?.scenarioIds ?? [];

        return [
          ...this.buildMissingItemsIssues(
            `requirementCoverage[${requirementId}].scenarioIds`,
            this.getStringArray(entry.scenarioIds),
            expectedScenarioIds,
          ),
          ...(this.getStringArray(entry.coveredByCheckIds).length === 0
            ? [
                `requirementCoverage[${requirementId}].coveredByCheckIds 不能为空`,
              ]
            : []),
          ...this.buildMissingItemsIssues(
            `requirementCoverage[${requirementId}].coveredByCheckIds`,
            this.getStringArray(entry.coveredByCheckIds),
            expectedGate4CheckIds,
          ),
          ...this.buildMissingItemsIssues(
            `requirementCoverage[${requirementId}].dependencyArtifactIds`,
            this.getStringArray(entry.dependencyArtifactIds),
            expectedDependencyArtifactIds,
          ),
        ];
      }),
    ];
    const orchestrationCoverageByNodeId = new Map(
      orchestrationCoverage
        .map((entry) => {
          const nodeId = this.getNonEmptyString(entry.nodeId);
          return nodeId ? ([nodeId, entry] as const) : null;
        })
        .filter(
          (entry): entry is readonly [string, Record<string, unknown>] =>
            entry !== null,
        ),
    );
    const orchestrationCoverageIssues = [
      ...(orchestrationCoverage.length === 0
        ? ['orchestrationCoverage 不能为空']
        : []),
      ...orchestrationCoverage.flatMap((entry, index) => {
        const nodeId = this.getNonEmptyString(entry.nodeId);

        return [
          ...(!nodeId ? [`orchestrationCoverage[${index}].nodeId 缺失`] : []),
          ...(nodeId && !knownOrchestrationNodeIds.has(nodeId)
            ? [
                `orchestrationCoverage[${index}].nodeId 引用了未知编排节点 ${this.formatIssueValue(
                  nodeId,
                )}`,
              ]
            : []),
          ...this.buildUnknownReferenceIssues(
            `orchestrationCoverage[${index}].edgeRefs`,
            this.getStringArray(entry.edgeRefs),
            knownOrchestrationEdgeRefs,
          ),
          ...this.buildUnknownReferenceIssues(
            `orchestrationCoverage[${index}].coveredByFixtureIds`,
            this.getStringArray(entry.coveredByFixtureIds),
            knownDryRunFixtureIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `orchestrationCoverage[${index}].coveredByCheckIds`,
            this.getStringArray(entry.coveredByCheckIds),
            knownGate4CheckIds,
          ),
        ];
      }),
      ...orchestrationNodeIds.flatMap((nodeId) => {
        const entry = orchestrationCoverageByNodeId.get(nodeId);

        if (!entry) {
          return [`编排节点 ${nodeId} 缺少 Gate 4 覆盖声明`];
        }

        return [
          ...this.buildMissingItemsIssues(
            `orchestrationCoverage[${nodeId}].edgeRefs`,
            this.getStringArray(entry.edgeRefs),
            orchestrationEdgeRefs,
          ),
          ...(this.getStringArray(entry.coveredByFixtureIds).length === 0
            ? [`orchestrationCoverage[${nodeId}].coveredByFixtureIds 不能为空`]
            : []),
          ...(this.getStringArray(entry.coveredByCheckIds).length === 0
            ? [`orchestrationCoverage[${nodeId}].coveredByCheckIds 不能为空`]
            : []),
        ];
      }),
    ];
    const traceArtifactIssues = [
      ...(traceArtifacts.length === 0 ? ['traceArtifacts 不能为空'] : []),
      ...this.buildMissingItemsIssues(
        'traceArtifacts.artifactId',
        traceArtifactIds,
        expectedTraceArtifactIds,
      ),
      ...this.buildUnknownReferenceIssues(
        'traceArtifacts.artifactId',
        traceArtifactIds,
        new Set(expectedTraceArtifactIds),
      ),
      ...this.buildDuplicateItemIssues(
        'traceArtifacts.artifactId',
        traceArtifactIds,
      ),
      ...traceArtifacts.flatMap((artifact, index) => [
        ...(!this.getNonEmptyString(artifact.artifactId)
          ? [`traceArtifacts[${index}].artifactId 缺失`]
          : []),
        ...(!this.getNonEmptyString(artifact.kind)
          ? [`traceArtifacts[${index}].kind 缺失`]
          : []),
        ...(this.getNonEmptyString(artifact.kind) &&
        !GATE_4_TRACE_ARTIFACT_KINDS.includes(
          this.getNonEmptyString(
            artifact.kind,
          ) as (typeof GATE_4_TRACE_ARTIFACT_KINDS)[number],
        )
          ? [
              `traceArtifacts[${index}].kind 必须是 ${GATE_4_TRACE_ARTIFACT_KINDS.join(
                ' | ',
              )} 之一`,
            ]
          : []),
        ...(this.getNonEmptyString(artifact.artifactId) &&
        this.getNonEmptyString(artifact.kind) &&
        expectedTraceArtifactKindById.get(
          this.getNonEmptyString(artifact.artifactId) ?? '',
        ) !== undefined &&
        expectedTraceArtifactKindById.get(
          this.getNonEmptyString(artifact.artifactId) ?? '',
        ) !== this.getNonEmptyString(artifact.kind)
          ? [
              `traceArtifacts[${index}].kind 与 trace artifact ${this.formatIssueValue(
                this.getNonEmptyString(artifact.artifactId) ?? '',
              )} 不一致`,
            ]
          : []),
        ...(!this.getNonEmptyString(artifact.path)
          ? [`traceArtifacts[${index}].path 缺失`]
          : []),
        ...(this.getStringArray(artifact.producedByCheckIds).length === 0
          ? [`traceArtifacts[${index}].producedByCheckIds 不能为空`]
          : []),
        ...this.buildUnknownReferenceIssues(
          `traceArtifacts[${index}].producedByCheckIds`,
          this.getStringArray(artifact.producedByCheckIds),
          knownGate4CheckIds,
        ),
      ]),
    ];
    const failureCaptureIssues = [
      ...this.buildMissingItemsIssues(
        'failureCaptureFields',
        this.getStringArray(integrationPlan.failureCaptureFields),
        [...GATE_4_REQUIRED_FAILURE_CAPTURE_FIELDS],
      ),
    ];

    return [
      {
        id: 'integration-plan-version',
        label: 'IntegrationPlan 版本绑定',
        passed: versionIssues.length === 0,
        summary:
          '检查 integrationPlan 是否绑定当前 AppSpec、generationPlan、staticContracts 和 buildUnitPlan。',
        issues: versionIssues,
      },
      {
        id: 'test-tenant-and-resources',
        label: '测试租户与测试资源计划',
        passed:
          testTenantIssues.length === 0 && testResourceIssues.length === 0,
        summary:
          '检查 Gate 4 测试租户和测试资源是否使用合成上下文、无真实 token 且覆盖全部场景 fixture。',
        issues: [...testTenantIssues, ...testResourceIssues],
      },
      {
        id: 'public-runtime-api-checks',
        label: 'public runtime API checks',
        passed: publicRuntimeApiIssues.length === 0,
        summary:
          '检查公开 runtime 读取、提交 input、读取 submission detail 是否绑定 Gate 2 public input/output/submission persistence contract。',
        issues: publicRuntimeApiIssues,
      },
      {
        id: 'creator-management-api-checks',
        label: 'creator management API checks',
        passed: creatorApiIssues.length === 0,
        summary:
          '检查创建者侧 generation run、gate run 和 submission 查询集成 skeleton。',
        issues: creatorApiIssues,
      },
      {
        id: 'agent-workflow-dry-run-fixtures',
        label: 'Agent/Workflow dry-run fixture 期望',
        passed: dryRunIssues.length === 0,
        summary:
          '检查 Agent/Workflow dry-run fixture 是否覆盖编排节点、边、输入输出映射和 trace artifact。',
        issues: dryRunIssues,
      },
      {
        id: 'plugin-sandbox-smoke-expectations',
        label: '插件 sandbox smoke 期望',
        passed: pluginSmokeIssues.length === 0,
        summary:
          '检查每个计划插件/工具是否有 WASM/Extism smoke expectation 和 trace artifact；无插件时必须说明原因。',
        issues: pluginSmokeIssues,
      },
      {
        id: 'dependency-artifacts',
        label: 'Gate 3 依赖 artifacts',
        passed: dependencyArtifactIssues.length === 0,
        summary:
          '检查 Gate 4 integration skeleton 是否引用 Gate 3 build/unit artifacts。',
        issues: dependencyArtifactIssues,
      },
      {
        id: 'acceptance-scenario-coverage',
        label: 'acceptance scenario 覆盖',
        passed: acceptanceCoverageIssues.length === 0,
        summary:
          '检查每条 acceptance scenario 是否连接到 Gate 4 API check 和 dry-run fixture。',
        issues: acceptanceCoverageIssues,
      },
      {
        id: 'requirement-coverage',
        label: '需求覆盖',
        passed: requirementCoverageIssues.length === 0,
        summary:
          '检查每条核心需求是否连接到 Gate 4 checks 和 Gate 3 依赖 artifacts。',
        issues: requirementCoverageIssues,
      },
      {
        id: 'orchestration-coverage',
        label: '编排覆盖',
        passed: orchestrationCoverageIssues.length === 0,
        summary:
          '检查每个 Agent/Workflow 编排节点和边是否连接到 dry-run fixture 与 Gate 4 check。',
        issues: orchestrationCoverageIssues,
      },
      {
        id: 'trace-artifacts',
        label: 'trace artifacts',
        passed: traceArtifactIssues.length === 0,
        summary:
          '检查 public API、creator API、dry-run 和插件 smoke trace artifact 期望。',
        issues: traceArtifactIssues,
      },
      {
        id: 'failure-capture-fields',
        label: '失败捕获字段',
        passed: failureCaptureIssues.length === 0,
        summary:
          '检查后续真实 Gate 4 runner 失败时必须捕获 requestId、状态码、错误摘要、trace artifact 和耗时。',
        issues: failureCaptureIssues,
      },
    ];
  }

  private buildGate3Checks(
    appSpec: GeneratedAppSpec,
    generationPlan: GeneratedAppGenerationPlan,
    staticContracts: GeneratedAppStaticContracts,
    buildUnitPlan: unknown,
  ): Gate3Check[] {
    if (!this.isRecord(buildUnitPlan)) {
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
    const routeIds = staticContracts.frontendRoutes.map(
      (route) => route.pageId,
    );
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
    const plannedToolIds = new Set(
      generationPlan.pluginTools.tools.map((tool) => tool.toolId),
    );
    const plannedToolById = new Map(
      generationPlan.pluginTools.tools.map((tool) => [tool.toolId, tool]),
    );

    const frontendBuild = this.getRecord(buildUnitPlan.frontendBuild);
    const typecheck = this.getRecord(buildUnitPlan.typecheck);
    const unitTests = this.getRecord(buildUnitPlan.unitTests);
    const componentGoldenTests = this.getRecord(
      buildUnitPlan.componentGoldenTests,
    );
    const artifactExpectations = this.getRecordArray(
      buildUnitPlan.artifactExpectations,
    );
    const staticContractsCoverage = this.getRecordArray(
      buildUnitPlan.staticContractsCoverage,
    );
    const acceptanceScenarioCoverage = this.getRecordArray(
      buildUnitPlan.acceptanceScenarioCoverage,
    );
    const pluginBuildExpectations = this.getRecord(
      buildUnitPlan.pluginBuildExpectations,
    );
    const pluginBuildTools = this.getRecordArray(
      pluginBuildExpectations?.tools,
    );

    const artifactIds = artifactExpectations
      .map((artifact) => this.getNonEmptyString(artifact.artifactId))
      .filter((artifactId): artifactId is string => artifactId !== null);
    const coveredStaticContractIds = new Set(
      staticContractsCoverage
        .map((entry) => this.getNonEmptyString(entry.staticContractId))
        .filter((staticContractId): staticContractId is string => {
          return staticContractId !== null;
        }),
    );
    const scenarioCoverageById = new Map(
      acceptanceScenarioCoverage
        .map((entry) => {
          const scenarioId = this.getNonEmptyString(entry.scenarioId);
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
      ...(buildUnitPlan.staticContractsVersion ===
      staticContracts.contractVersion
        ? []
        : [
            `staticContractsVersion=${String(
              buildUnitPlan.staticContractsVersion,
            )} 与 staticContracts.contractVersion=${staticContracts.contractVersion} 不一致`,
          ]),
      ...(buildUnitPlan.executionLevel === 'contract-skeleton'
        ? []
        : ['executionLevel 必须为 contract-skeleton']),
    ];
    const frontendBuildIssues = [
      ...this.requireRecord(frontendBuild, 'frontendBuild'),
      ...(!this.getNonEmptyString(frontendBuild?.command)
        ? ['frontendBuild.command 缺失']
        : []),
      ...(!this.getNonEmptyString(frontendBuild?.workingDirectory)
        ? ['frontendBuild.workingDirectory 缺失']
        : []),
      ...this.buildMissingItemsIssues(
        'frontendBuild.routeIds',
        this.getStringArray(frontendBuild?.routeIds),
        routeIds,
      ),
      ...this.buildUnknownReferenceIssues(
        'frontendBuild.routeIds',
        this.getStringArray(frontendBuild?.routeIds),
        knownRouteIds,
      ),
      ...this.buildMissingItemsIssues(
        'frontendBuild.requirementIds',
        this.getStringArray(frontendBuild?.requirementIds),
        requirementIds,
      ),
      ...this.buildUnknownReferenceIssues(
        'frontendBuild.requirementIds',
        this.getStringArray(frontendBuild?.requirementIds),
        knownRequirementIds,
      ),
      ...this.buildMissingItemsIssues(
        'frontendBuild.scenarioIds',
        this.getStringArray(frontendBuild?.scenarioIds),
        scenarioIds,
      ),
      ...this.buildUnknownReferenceIssues(
        'frontendBuild.scenarioIds',
        this.getStringArray(frontendBuild?.scenarioIds),
        knownScenarioIds,
      ),
      ...this.buildMissingItemsIssues(
        'frontendBuild.expectedArtifacts',
        this.getStringArray(frontendBuild?.expectedArtifacts),
        ['dist/index.html', 'dist/assets/manifest.json'],
      ),
    ];
    const typecheckIssues = [
      ...this.requireRecord(typecheck, 'typecheck'),
      ...(!this.getNonEmptyString(typecheck?.command)
        ? ['typecheck.command 缺失']
        : []),
      ...(!this.getNonEmptyString(typecheck?.tsconfigPath)
        ? ['typecheck.tsconfigPath 缺失']
        : []),
      ...this.buildMissingItemsIssues(
        'typecheck.requirementIds',
        this.getStringArray(typecheck?.requirementIds),
        requirementIds,
      ),
      ...this.buildUnknownReferenceIssues(
        'typecheck.requirementIds',
        this.getStringArray(typecheck?.requirementIds),
        knownRequirementIds,
      ),
    ];
    const unitTestIssues = [
      ...this.requireRecord(unitTests, 'unitTests'),
      ...(!this.getNonEmptyString(unitTests?.command)
        ? ['unitTests.command 缺失']
        : []),
      ...(!this.getNonEmptyString(unitTests?.entry)
        ? ['unitTests.entry 缺失']
        : []),
      ...this.buildMissingItemsIssues(
        'unitTests.requirementIds',
        this.getStringArray(unitTests?.requirementIds),
        requirementIds,
      ),
      ...this.buildUnknownReferenceIssues(
        'unitTests.requirementIds',
        this.getStringArray(unitTests?.requirementIds),
        knownRequirementIds,
      ),
      ...this.buildMissingItemsIssues(
        'unitTests.scenarioIds',
        this.getStringArray(unitTests?.scenarioIds),
        scenarioIds,
      ),
      ...this.buildUnknownReferenceIssues(
        'unitTests.scenarioIds',
        this.getStringArray(unitTests?.scenarioIds),
        knownScenarioIds,
      ),
    ];
    const componentGoldenIssues = [
      ...this.requireRecord(componentGoldenTests, 'componentGoldenTests'),
      ...(!this.getNonEmptyString(componentGoldenTests?.command)
        ? ['componentGoldenTests.command 缺失']
        : []),
      ...(!this.getNonEmptyString(componentGoldenTests?.entry)
        ? ['componentGoldenTests.entry 缺失']
        : []),
      ...(!this.getNonEmptyString(componentGoldenTests?.goldenArtifactPath)
        ? ['componentGoldenTests.goldenArtifactPath 缺失']
        : []),
      ...this.buildMissingItemsIssues(
        'componentGoldenTests.scenarioIds',
        this.getStringArray(componentGoldenTests?.scenarioIds),
        scenarioIds,
      ),
      ...this.buildUnknownReferenceIssues(
        'componentGoldenTests.scenarioIds',
        this.getStringArray(componentGoldenTests?.scenarioIds),
        knownScenarioIds,
      ),
    ];
    const artifactIssues = [
      ...(artifactExpectations.length === 0
        ? ['artifactExpectations 不能为空']
        : []),
      ...this.buildMissingItemsIssues(
        'artifactExpectations.artifactId',
        artifactIds,
        expectedArtifactIds,
      ),
      ...this.buildUnknownReferenceIssues(
        'artifactExpectations.artifactId',
        artifactIds,
        expectedArtifactIdSet,
      ),
      ...this.buildDuplicateItemIssues(
        'artifactExpectations.artifactId',
        artifactIds,
      ),
      ...artifactExpectations.flatMap((artifact, index) => [
        ...(!this.getNonEmptyString(artifact.artifactId)
          ? [`artifactExpectations[${index}].artifactId 缺失`]
          : []),
        ...(!this.getNonEmptyString(artifact.kind)
          ? [`artifactExpectations[${index}].kind 缺失`]
          : []),
        ...(this.getNonEmptyString(artifact.kind) &&
        !knownArtifactKinds.has(this.getNonEmptyString(artifact.kind) ?? '')
          ? [
              `artifactExpectations[${index}].kind 必须是 ${GATE_3_ARTIFACT_KINDS.join(
                ' | ',
              )} 之一`,
            ]
          : []),
        ...(!this.getNonEmptyString(artifact.path)
          ? [`artifactExpectations[${index}].path 缺失`]
          : []),
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
        ...(!this.getNonEmptyString(entry.staticContractId)
          ? [`staticContractsCoverage[${index}].staticContractId 缺失`]
          : []),
        ...this.buildUnknownReferenceIssues(
          `staticContractsCoverage[${index}].staticContractId`,
          this.getStringArray([entry.staticContractId]),
          knownStaticContractIds,
        ),
        ...(this.getStringArray(entry.coveredBy).length === 0
          ? [`staticContractsCoverage[${index}].coveredBy 不能为空`]
          : []),
        ...this.buildUnknownReferenceIssues(
          `staticContractsCoverage[${index}].coveredBy`,
          this.getStringArray(entry.coveredBy),
          knownGate3CoverageIds,
        ),
      ]),
    ];
    const scenarioCoverageUnknownScenarioIssues = acceptanceScenarioCoverage
      .map((entry, index) => ({
        index,
        scenarioId: this.getNonEmptyString(entry.scenarioId),
      }))
      .filter(
        (entry): entry is { index: number; scenarioId: string } =>
          entry.scenarioId !== null && !knownScenarioIds.has(entry.scenarioId),
      )
      .map(
        (entry) =>
          `acceptanceScenarioCoverage[${entry.index}].scenarioId 引用了未知场景 ${this.formatIssueValue(
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
          ...this.buildMissingItemsIssues(
            `acceptanceScenarioCoverage[${scenarioId}].requirementIds`,
            this.getStringArray(entry.requirementIds),
            expectedRequirementIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `acceptanceScenarioCoverage[${scenarioId}].requirementIds`,
            this.getStringArray(entry.requirementIds),
            knownRequirementIds,
          ),
          ...(this.getStringArray(entry.coveredBy).length === 0
            ? [`acceptanceScenarioCoverage[${scenarioId}].coveredBy 不能为空`]
            : []),
          ...this.buildUnknownReferenceIssues(
            `acceptanceScenarioCoverage[${scenarioId}].coveredBy`,
            this.getStringArray(entry.coveredBy),
            knownGate3CoverageIds,
          ),
        ];
      }),
    ];
    const pluginBuildIssues = [
      ...this.requireRecord(pluginBuildExpectations, 'pluginBuildExpectations'),
      ...(generationPlan.pluginTools.tools.length === 0 &&
      pluginBuildTools.length > 0
        ? ['无插件计划时 pluginBuildExpectations.tools 必须为空']
        : []),
      ...(generationPlan.pluginTools.tools.length === 0 &&
      !this.getNonEmptyString(pluginBuildExpectations?.emptyReason)
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
              (tool) =>
                this.getNonEmptyString(tool.toolId) === plannedTool.toolId,
            ),
        )
        .map(
          (plannedTool) =>
            `插件/工具 ${this.formatIssueValue(
              plannedTool.toolId,
            )} 缺少 Gate 3 构建期望`,
        ),
      ...pluginBuildTools.flatMap((tool, index) => {
        const toolId = this.getNonEmptyString(tool.toolId);
        const plannedTool = toolId ? plannedToolById.get(toolId) : null;

        return [
          ...(!toolId
            ? [`pluginBuildExpectations.tools[${index}].toolId 缺失`]
            : []),
          ...(toolId && !plannedToolIds.has(toolId)
            ? [
                `pluginBuildExpectations.tools[${index}].toolId 引用了未知插件/工具 ${this.formatIssueValue(
                  toolId,
                )}`,
              ]
            : []),
          ...(!this.getNonEmptyString(tool.command)
            ? [`pluginBuildExpectations.tools[${index}].command 缺失`]
            : []),
          ...(!this.getNonEmptyString(tool.manifestPath)
            ? [`pluginBuildExpectations.tools[${index}].manifestPath 缺失`]
            : []),
          ...(!this.getNonEmptyString(tool.artifactPath)
            ? [`pluginBuildExpectations.tools[${index}].artifactPath 缺失`]
            : []),
          ...(!this.getNonEmptyString(tool.goldenTestCommand)
            ? [`pluginBuildExpectations.tools[${index}].goldenTestCommand 缺失`]
            : []),
          ...(plannedTool
            ? this.buildMissingItemsIssues(
                `pluginBuildExpectations.tools[${index}].requirementIds`,
                this.getStringArray(tool.requirementIds),
                plannedTool.requirementIds,
              )
            : []),
          ...this.buildUnknownReferenceIssues(
            `pluginBuildExpectations.tools[${index}].requirementIds`,
            this.getStringArray(tool.requirementIds),
            knownRequirementIds,
          ),
        ];
      }),
    ];
    const failureCaptureIssues = [
      ...this.buildMissingItemsIssues(
        'failureCaptureFields',
        this.getStringArray(buildUnitPlan.failureCaptureFields),
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

  private buildGate2Checks(
    appSpec: GeneratedAppSpec,
    generationPlan: GeneratedAppGenerationPlan,
    staticContracts: unknown,
  ): Gate2Check[] {
    if (!this.isRecord(staticContracts)) {
      return [
        {
          id: 'static-contracts-object',
          label: 'StaticContracts JSON 对象',
          passed: false,
          summary:
            '检查 generationPlan.staticContracts 是否为结构化 JSON 对象。',
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

    const publicRuntime = this.getRecord(staticContracts.publicRuntime);
    const publicRuntimeInput = this.getRecord(publicRuntime?.input);
    const publicRuntimeOutput = this.getRecord(publicRuntime?.output);
    const frontendRoutes = this.getRecordArray(staticContracts.frontendRoutes);
    const orchestration = this.getRecord(staticContracts.orchestration);
    const orchestrationNodes = this.getRecordArray(orchestration?.nodes);
    const orchestrationEdges = this.getRecordArray(orchestration?.edges);
    const pluginToolPermissions = this.getRecord(
      staticContracts.pluginToolPermissions,
    );
    const pluginTools = this.getRecordArray(pluginToolPermissions?.tools);
    const submissionPersistence = this.getRecord(
      staticContracts.submissionPersistence,
    );
    const testEntry = this.getRecord(staticContracts.testEntry);
    const traceability = this.getRecordArray(staticContracts.traceability);

    const routePageIds = new Set(
      frontendRoutes
        .map((route) => this.getNonEmptyString(route.pageId))
        .filter((pageId): pageId is string => pageId !== null),
    );
    const nodeIds = orchestrationNodes
      .map((node) => this.getNonEmptyString(node.nodeId))
      .filter((nodeId): nodeId is string => nodeId !== null);
    const nodeIdsSet = new Set(nodeIds);
    const stepIdsInNodes = new Set(
      orchestrationNodes
        .map((node) => this.getNonEmptyString(node.stepId))
        .filter((stepId): stepId is string => stepId !== null),
    );
    const graphEdges = orchestrationEdges.map((edge) => ({
      fromNodeId: this.getNonEmptyString(edge.fromNodeId),
      toNodeId: this.getNonEmptyString(edge.toNodeId),
    }));
    const traceabilityByRequirementId = new Map(
      traceability
        .map((entry) => {
          const requirementId = this.getNonEmptyString(entry.requirementId);
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
      ...this.requireRecord(publicRuntime, 'publicRuntime'),
      ...this.requireRecord(publicRuntimeInput, 'publicRuntime.input'),
      ...this.requireRecord(publicRuntimeOutput, 'publicRuntime.output'),
      ...(publicRuntimeInput?.source ===
      generationPlan.orchestration.inputContract.source
        ? []
        : ['publicRuntime.input.source 与 orchestration inputContract 不一致']),
      ...this.buildMissingItemsIssues(
        'publicRuntime.input.requiredFields',
        this.getStringArray(publicRuntimeInput?.requiredFields),
        generationPlan.orchestration.inputContract.requiredFields,
      ),
      ...(this.getStringArray(publicRuntimeInput?.requiredFields).length > 0
        ? []
        : ['publicRuntime.input.requiredFields 不能为空']),
      ...this.buildMissingItemsIssues(
        'publicRuntime.input.scenarioIds',
        this.getStringArray(publicRuntimeInput?.scenarioIds),
        generationPlan.orchestration.inputContract.scenarioIds,
      ),
      ...this.buildUnknownReferenceIssues(
        'publicRuntime.input.scenarioIds',
        this.getStringArray(publicRuntimeInput?.scenarioIds),
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
        : [
            'publicRuntime.input.endUserLoginRequired 与 AppSpec 登录策略不一致',
          ]),
      ...this.buildMissingItemsIssues(
        'publicRuntime.output.destinations',
        this.getStringArray(publicRuntimeOutput?.destinations),
        generationPlan.orchestration.outputContract.destinations,
      ),
      ...(this.getStringArray(publicRuntimeOutput?.destinations).length > 0
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
        const pageId = this.getNonEmptyString(route.pageId);
        const routePath = this.getNonEmptyString(route.route);
        const plannedPage = pageId ? plannedPageById.get(pageId) : null;

        if (!pageId) {
          issues.push(`frontendRoutes[${index}].pageId 缺失`);
        } else if (!plannedPageIds.has(pageId) || !knownPageIds.has(pageId)) {
          issues.push(
            `frontendRoutes[${index}].pageId 引用了未知页面 ${this.formatIssueValue(
              pageId,
            )}`,
          );
        }

        if (!routePath) {
          issues.push(`frontendRoutes[${index}].route 缺失`);
        }

        issues.push(
          ...this.buildUnknownReferenceIssues(
            `frontendRoutes[${index}].requirementIds`,
            this.getStringArray(route.requirementIds),
            knownRequirementIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `frontendRoutes[${index}].scenarioIds`,
            this.getStringArray(route.scenarioIds),
            knownScenarioIds,
          ),
          ...(plannedPage
            ? [
                ...this.buildMissingItemsIssues(
                  `frontendRoutes[${index}].requirementIds`,
                  this.getStringArray(route.requirementIds),
                  plannedPage.requirementIds,
                ),
                ...this.buildMissingItemsIssues(
                  `frontendRoutes[${index}].scenarioIds`,
                  this.getStringArray(route.scenarioIds),
                  plannedPage.scenarioIds,
                ),
              ]
            : []),
        );

        return issues;
      }),
    ];
    const orchestrationIssues = [
      ...this.requireRecord(orchestration, 'orchestration'),
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
        ...(!this.getNonEmptyString(node.nodeId)
          ? [`orchestration.nodes[${index}].nodeId 缺失`]
          : []),
        ...(!this.getNonEmptyString(node.stepId)
          ? [`orchestration.nodes[${index}].stepId 缺失`]
          : []),
        ...(this.getNonEmptyString(node.stepId) &&
        !plannedStepIds.has(this.getNonEmptyString(node.stepId) ?? '')
          ? [
              `orchestration.nodes[${index}].stepId 引用了未知编排步骤 ${this.formatIssueValue(
                this.getNonEmptyString(node.stepId) ?? '',
              )}`,
            ]
          : []),
        ...(!this.getNonEmptyString(node.inputHandle)
          ? [`orchestration.nodes[${index}].inputHandle 缺失`]
          : []),
        ...(!this.getNonEmptyString(node.outputHandle)
          ? [`orchestration.nodes[${index}].outputHandle 缺失`]
          : []),
        ...this.buildUnknownReferenceIssues(
          `orchestration.nodes[${index}].requirementIds`,
          this.getStringArray(node.requirementIds),
          knownRequirementIds,
        ),
        ...this.buildUnknownReferenceIssues(
          `orchestration.nodes[${index}].scenarioIds`,
          this.getStringArray(node.scenarioIds),
          knownScenarioIds,
        ),
        ...(this.getNonEmptyString(node.stepId) &&
        plannedStepById.has(this.getNonEmptyString(node.stepId) ?? '')
          ? [
              ...this.buildMissingItemsIssues(
                `orchestration.nodes[${index}].requirementIds`,
                this.getStringArray(node.requirementIds),
                plannedStepById.get(this.getNonEmptyString(node.stepId) ?? '')
                  ?.requirementIds ?? [],
              ),
              ...this.buildMissingItemsIssues(
                `orchestration.nodes[${index}].scenarioIds`,
                this.getStringArray(node.scenarioIds),
                plannedStepById.get(this.getNonEmptyString(node.stepId) ?? '')
                  ?.scenarioIds ?? [],
              ),
            ]
          : []),
      ]),
      ...this.buildDuplicateItemIssues('orchestration.nodes.nodeId', nodeIds),
      ...graphEdges.flatMap((edge, index) => [
        ...(!edge.fromNodeId || !nodeIdsSet.has(edge.fromNodeId)
          ? [`orchestration.edges[${index}].fromNodeId 引用了未知节点`]
          : []),
        ...(!edge.toNodeId || !nodeIdsSet.has(edge.toNodeId)
          ? [`orchestration.edges[${index}].toNodeId 引用了未知节点`]
          : []),
      ]),
      ...(this.isAcyclicGraph(nodeIds, graphEdges)
        ? []
        : ['orchestration.edges 必须形成 DAG，不能存在环']),
    ];
    const pluginPermissionIssues = [
      ...this.requireRecord(pluginToolPermissions, 'pluginToolPermissions'),
      ...(pluginToolPermissions?.implicitPermissionsAllowed === false
        ? []
        : ['implicitPermissionsAllowed 必须为 false']),
      ...(this.getStringArray(pluginToolPermissions?.permissionPolicy).length >
      0
        ? []
        : ['permissionPolicy 不能为空']),
      ...(generationPlan.pluginTools.tools.length === 0 &&
      !this.getNonEmptyString(pluginToolPermissions?.emptyReason)
        ? ['插件/工具为空时必须保留 emptyReason']
        : []),
      ...generationPlan.pluginTools.tools
        .filter(
          (plannedTool) =>
            !pluginTools.some(
              (tool) =>
                this.getNonEmptyString(tool.toolId) === plannedTool.toolId,
            ),
        )
        .map(
          (plannedTool) =>
            `插件/工具 ${this.formatIssueValue(
              plannedTool.toolId,
            )} 缺少权限合约`,
        ),
      ...pluginTools.flatMap((tool, index) => {
        const toolId = this.getNonEmptyString(tool.toolId);
        const plannedTool = toolId ? plannedToolById.get(toolId) : null;

        return [
          ...(!toolId
            ? [`pluginToolPermissions.tools[${index}].toolId 缺失`]
            : []),
          ...(toolId && !plannedToolIds.has(toolId)
            ? [
                `pluginToolPermissions.tools[${index}].toolId 引用了未知插件/工具 ${this.formatIssueValue(
                  toolId,
                )}`,
              ]
            : []),
          ...(!this.getNonEmptyString(tool.purpose)
            ? [`pluginToolPermissions.tools[${index}].purpose 缺失`]
            : []),
          ...(this.getStringArray(tool.permissions).length === 0
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
          ...this.buildUnknownReferenceIssues(
            `pluginToolPermissions.tools[${index}].requirementIds`,
            this.getStringArray(tool.requirementIds),
            knownRequirementIds,
          ),
          ...(plannedTool
            ? [
                ...this.buildMissingItemsIssues(
                  `pluginToolPermissions.tools[${index}].requirementIds`,
                  this.getStringArray(tool.requirementIds),
                  plannedTool.requirementIds,
                ),
                ...this.buildMissingItemsIssues(
                  `pluginToolPermissions.tools[${index}].permissions`,
                  this.getStringArray(tool.permissions),
                  plannedTool.permissionNotes,
                ),
              ]
            : []),
        ];
      }),
    ];
    const submissionPersistenceIssues = [
      ...this.requireRecord(submissionPersistence, 'submissionPersistence'),
      ...this.buildBooleanMirrorIssue(
        submissionPersistence,
        'publicSubmissionsPersisted',
        generationPlan.dataPersistence.publicSubmissionsPersisted,
      ),
      ...this.buildBooleanMirrorIssue(
        submissionPersistence,
        'creatorCanDeleteSubmissions',
        generationPlan.dataPersistence.creatorCanDeleteSubmissions,
      ),
      ...this.buildBooleanMirrorIssue(
        submissionPersistence,
        'endUserLoginRequired',
        generationPlan.dataPersistence.endUserLoginRequired,
      ),
      ...[
        'tenantScoped',
        'tokenSnapshotRequired',
        'softDeleteRequired',
      ].flatMap((field) =>
        this.buildBooleanMirrorIssue(submissionPersistence, field, true),
      ),
      ...this.buildMissingItemsIssues(
        'submissionPersistence.fields',
        this.getStringArray(submissionPersistence?.fields),
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
      ...this.requireRecord(testEntry, 'testEntry'),
      ...[
        'staticCheckCommand',
        'buildGateCommand',
        'unitGateCommand',
        'integrationGateCommand',
        'browserGateCommand',
        'verifierGateCommand',
        'publishCandidateGateCommand',
      ].flatMap((field) =>
        this.getNonEmptyString(testEntry?.[field])
          ? []
          : [`testEntry.${field} 缺失`],
      ),
      ...this.buildMissingItemsIssues(
        'testEntry.blockingGateIds',
        this.getStringArray(testEntry?.blockingGateIds),
        requiredFutureGateIds,
      ),
      ...this.buildUnknownReferenceIssues(
        'testEntry.blockingGateIds',
        this.getStringArray(testEntry?.blockingGateIds),
        new Set(requiredFutureGateIds),
      ),
      ...this.buildMissingItemsIssues(
        'testEntry.acceptanceScenarioIds',
        this.getStringArray(testEntry?.acceptanceScenarioIds),
        scenarioIds,
      ),
      ...this.buildUnknownReferenceIssues(
        'testEntry.acceptanceScenarioIds',
        this.getStringArray(testEntry?.acceptanceScenarioIds),
        knownScenarioIds,
      ),
    ];
    const traceabilityUnknownRequirementIssues = traceability
      .map((entry, index) => ({
        index,
        requirementId: this.getNonEmptyString(entry.requirementId),
      }))
      .filter(
        (entry): entry is { index: number; requirementId: string } =>
          entry.requirementId !== null &&
          !knownRequirementIds.has(entry.requirementId),
      )
      .map(
        (entry) =>
          `traceability[${entry.index}].requirementId 引用了未知需求 ${this.formatIssueValue(
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
            (stepId) => `node-${this.buildPlanSegment(stepId)}`,
          ) ?? [];

        if (!entry) {
          return [`需求 ${requirementId} 缺少 static contract traceability`];
        }

        return [
          ...this.buildMissingItemsIssues(
            `traceability[${requirementId}].scenarioIds`,
            this.getStringArray(entry.scenarioIds),
            plannedTraceability?.scenarioIds ?? [],
          ),
          ...this.buildMissingItemsIssues(
            `traceability[${requirementId}].pageIds`,
            this.getStringArray(entry.pageIds),
            plannedTraceability?.pageIds ?? [],
          ),
          ...this.buildMissingItemsIssues(
            `traceability[${requirementId}].orchestrationNodeIds`,
            this.getStringArray(entry.orchestrationNodeIds),
            expectedNodeIds,
          ),
          ...this.buildMissingItemsIssues(
            `traceability[${requirementId}].staticContractIds`,
            this.getStringArray(entry.staticContractIds),
            [...GATE_2_STATIC_CONTRACT_IDS],
          ),
          ...this.buildUnknownReferenceIssues(
            `traceability[${requirementId}].staticContractIds`,
            this.getStringArray(entry.staticContractIds),
            knownStaticContractIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `traceability[${requirementId}].scenarioIds`,
            this.getStringArray(entry.scenarioIds),
            knownScenarioIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `traceability[${requirementId}].pageIds`,
            this.getStringArray(entry.pageIds),
            routePageIds,
          ),
          ...this.buildUnknownReferenceIssues(
            `traceability[${requirementId}].orchestrationNodeIds`,
            this.getStringArray(entry.orchestrationNodeIds),
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
        summary:
          '检查 staticContracts 是否绑定当前 AppSpec 和 generationPlan。',
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
        summary:
          '检查插件/工具 manifest、权限策略和 sandbox smoke test 硬门槛。',
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

  private evaluateGate1GenerationPlan(
    appSpec: GeneratedAppSpec,
    generationPlan: GeneratedAppGenerationPlan,
  ): Gate1Evaluation {
    const checks = this.buildGate1Checks(appSpec, generationPlan);
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

  private buildGate1Checks(
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
        : [
            'runtimeSurface.dataUseNoticeRequired 与 AppSpec 数据保存策略不一致',
          ]),
    ];
    const orchestrationIssues = [
      ...(generationPlan.orchestration.steps.length === 0
        ? ['orchestration.steps 不能为空']
        : []),
      ...requirementIds
        .filter((requirementId) => !plannedRequirementIds.has(requirementId))
        .map(
          (requirementId) =>
            `需求 ${requirementId} 未映射到 orchestration step`,
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
    ];
  }

  private evaluateGate0AppSpec(appSpec: GeneratedAppSpec): Gate0Evaluation {
    const checks = this.buildGate0Checks(appSpec);
    const failedChecks = checks.filter((check) => !check.passed);
    const evidence = checks.map((check) => ({
      id: `gate-0-${check.id}`,
      label: check.label,
      kind: 'app_spec' as const,
      url: null,
      summary:
        check.issues.length === 0
          ? check.summary
          : `${check.summary} 缺口：${check.issues.join('；')}`,
    }));

    if (failedChecks.length > 0) {
      const failure: GeneratedAppGateRunFailure = {
        code: 'app-spec-incomplete',
        message: `AppSpec 完整性检查失败：${failedChecks
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
          'Gate 0 失败：AppSpec 缺少可验证生成所需的结构化字段或需求覆盖证据。',
        evidence,
        failure,
        repairInstructions:
          '补齐 AppSpec 的核心需求、页面/流程、数据策略、acceptance scenarios 与 traceability 后重新启动门禁运行器。',
      };
    }

    return {
      status: 'passed',
      summary:
        'Gate 0 通过：AppSpec 结构完整，核心需求均有 acceptance scenario 与 traceability 覆盖。',
      evidence,
      failure: null,
      repairInstructions: null,
    };
  }

  private buildGate0Checks(appSpec: unknown): Gate0Check[] {
    if (!this.isRecord(appSpec)) {
      return [
        {
          id: 'app-spec-object',
          label: 'AppSpec JSON 对象',
          passed: false,
          summary: 'AppSpec 必须是结构化 JSON 对象。',
          issues: ['appSpec 不是对象'],
        },
      ];
    }

    const coreRequirements = this.getRecordArray(appSpec.coreRequirements);
    const requirementIds = coreRequirements
      .map((requirement) => this.getNonEmptyString(requirement.id))
      .filter((id): id is string => id !== null);
    const pages = this.getRecordArray(appSpec.pages);
    const acceptanceScenarios = this.getRecordArray(
      appSpec.acceptanceScenarios,
    );
    const scenarioIds = new Set(
      acceptanceScenarios
        .map((scenario) => this.getNonEmptyString(scenario.id))
        .filter((id): id is string => id !== null),
    );
    const coveredRequirementIds = new Set<string>();

    for (const scenario of acceptanceScenarios) {
      for (const requirementId of this.getStringArray(
        scenario.requirementIds,
      )) {
        coveredRequirementIds.add(requirementId);
      }
    }

    const traceability = this.getRecordArray(appSpec.traceability);
    const traceabilityRequirementIds = new Set(
      traceability
        .filter((entry) => {
          const scenarioRefs = this.getStringArray(entry.scenarioIds);
          const evidenceRefs = this.getStringArray(entry.evidenceIds);
          return (
            scenarioRefs.length > 0 &&
            scenarioRefs.every((scenarioId) => scenarioIds.has(scenarioId)) &&
            evidenceRefs.length > 0
          );
        })
        .map((entry) => this.getNonEmptyString(entry.requirementId))
        .filter((id): id is string => id !== null),
    );

    const textIssues = ['appName', 'summary', 'userGoal'].filter(
      (field) => this.getNonEmptyString(appSpec[field]) === null,
    );
    const actorIssues =
      this.getStringArray(appSpec.actors).length === 0
        ? ['actors 至少需要一个角色']
        : [];
    const requirementIssues = [
      ...(coreRequirements.length === 0 ? ['coreRequirements 不能为空'] : []),
      ...coreRequirements.flatMap((requirement, index) => {
        const issues: string[] = [];

        if (this.getNonEmptyString(requirement.id) === null) {
          issues.push(`coreRequirements[${index}].id 缺失`);
        }

        if (this.getNonEmptyString(requirement.text) === null) {
          issues.push(`coreRequirements[${index}].text 缺失`);
        }

        return issues;
      }),
    ];
    const pageIssues = [
      ...(pages.length === 0 ? ['pages 不能为空'] : []),
      ...pages.flatMap((page, index) => {
        const issues: string[] = [];

        for (const field of ['id', 'name', 'purpose']) {
          if (this.getNonEmptyString(page[field]) === null) {
            issues.push(`pages[${index}].${field} 缺失`);
          }
        }

        return issues;
      }),
    ];
    const policyIssues = this.buildDataPolicyIssues(appSpec);
    const scenarioIssues = [
      ...(acceptanceScenarios.length === 0
        ? ['acceptanceScenarios 不能为空']
        : []),
      ...acceptanceScenarios.flatMap((scenario, index) =>
        this.buildScenarioIssues(scenario, index),
      ),
    ];
    const uncoveredRequirementIds = requirementIds.filter(
      (requirementId) => !coveredRequirementIds.has(requirementId),
    );
    const traceabilityIssues = [
      ...(traceability.length === 0 ? ['traceability 不能为空'] : []),
      ...requirementIds
        .filter(
          (requirementId) => !traceabilityRequirementIds.has(requirementId),
        )
        .map((requirementId) => `需求 ${requirementId} 缺少有效 traceability`),
    ];

    return [
      {
        id: 'identity',
        label: 'AppSpec 基本摘要',
        passed: textIssues.length === 0 && actorIssues.length === 0,
        summary: '检查 appName、summary、userGoal 与 actors 是否完整。',
        issues: [...textIssues.map((field) => `${field} 缺失`), ...actorIssues],
      },
      {
        id: 'core-requirements',
        label: '核心需求列表',
        passed: requirementIssues.length === 0,
        summary: `检查 ${coreRequirements.length} 条核心需求是否具备 id 和 text。`,
        issues: requirementIssues,
      },
      {
        id: 'pages',
        label: '页面/流程定义',
        passed: pageIssues.length === 0,
        summary: `检查 ${pages.length} 个页面或流程是否具备 id、name 和 purpose。`,
        issues: pageIssues,
      },
      {
        id: 'risk-boundary',
        label: '数据策略与范围边界',
        passed: policyIssues.length === 0,
        summary:
          '检查 dataPolicy 和 nonGoals 是否能表达数据保存、登录要求与初始风险/范围边界。',
        issues: policyIssues,
      },
      {
        id: 'acceptance-scenarios',
        label: '验收场景结构',
        passed: scenarioIssues.length === 0,
        summary: `检查 ${acceptanceScenarios.length} 条 acceptance scenario 是否可执行。`,
        issues: scenarioIssues,
      },
      {
        id: 'requirement-coverage',
        label: '需求到验收场景覆盖',
        passed:
          uncoveredRequirementIds.length === 0 && requirementIds.length > 0,
        summary: `检查 ${requirementIds.length} 条核心需求是否至少被一个 acceptance scenario 覆盖。`,
        issues:
          requirementIds.length === 0
            ? ['没有可覆盖的核心需求 id']
            : uncoveredRequirementIds.map(
                (requirementId) =>
                  `需求 ${requirementId} 未被 acceptance scenario 引用`,
              ),
      },
      {
        id: 'traceability',
        label: '需求证据 traceability',
        passed: traceabilityIssues.length === 0 && requirementIds.length > 0,
        summary: `检查 ${traceability.length} 条 traceability 是否连接需求、场景和证据。`,
        issues: traceabilityIssues,
      },
    ];
  }

  private buildDataPolicyIssues(appSpec: Record<string, unknown>): string[] {
    const dataPolicy = appSpec.dataPolicy;
    const issues: string[] = [];

    if (!this.isRecord(dataPolicy)) {
      issues.push('dataPolicy 缺失');
    } else {
      for (const field of [
        'publicSubmissionsPersisted',
        'creatorCanDeleteSubmissions',
        'endUserLoginRequired',
      ]) {
        if (typeof dataPolicy[field] !== 'boolean') {
          issues.push(`dataPolicy.${field} 必须是 boolean`);
        }
      }
    }

    if (this.getStringArray(appSpec.nonGoals).length === 0) {
      issues.push('nonGoals 至少需要一条范围边界');
    }

    return issues;
  }

  private buildScenarioIssues(
    scenario: Record<string, unknown>,
    index: number,
  ): string[] {
    const issues: string[] = [];

    for (const field of ['id', 'title']) {
      if (this.getNonEmptyString(scenario[field]) === null) {
        issues.push(`acceptanceScenarios[${index}].${field} 缺失`);
      }
    }

    if (this.getStringArray(scenario.requirementIds).length === 0) {
      issues.push(`acceptanceScenarios[${index}].requirementIds 不能为空`);
    }

    for (const field of ['given', 'when', 'then']) {
      if (this.getStringArray(scenario[field]).length === 0) {
        issues.push(`acceptanceScenarios[${index}].${field} 不能为空`);
      }
    }

    return issues;
  }

  private async resolveNextGenerationRunNumber(
    tenantId: string,
    appId: string,
  ): Promise<number> {
    const [latestRun] = await this.tenantDb
      .select({ runNumber: schema.generatedAppGenerationRuns.runNumber })
      .from(schema.generatedAppGenerationRuns)
      .where(
        and(
          eq(schema.generatedAppGenerationRuns.tenantId, tenantId),
          eq(schema.generatedAppGenerationRuns.generatedAppId, appId),
        ),
      )
      .orderBy(desc(schema.generatedAppGenerationRuns.runNumber))
      .limit(1);

    return (latestRun?.runNumber ?? 0) + 1;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private getRecord(value: unknown): Record<string, unknown> | null {
    return this.isRecord(value) ? value : null;
  }

  private getRecordArray(value: unknown): Record<string, unknown>[] {
    return Array.isArray(value)
      ? value.filter((item) => this.isRecord(item))
      : [];
  }

  private getStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter(
          (item): item is string =>
            typeof item === 'string' && item.trim().length > 0,
        )
      : [];
  }

  private getNonEmptyString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : null;
  }

  private requireRecord(
    value: Record<string, unknown> | null,
    label: string,
  ): string[] {
    return value ? [] : [`${label} 必须是对象`];
  }

  private buildMissingItemsIssues(
    label: string,
    actual: string[],
    expected: string[],
  ): string[] {
    return expected
      .filter((item) => !actual.includes(item))
      .map((item) => `${label} 缺少 ${item}`);
  }

  private buildUnknownReferenceIssues(
    label: string,
    values: string[],
    knownValues: ReadonlySet<string>,
  ): string[] {
    return values
      .filter((value) => !knownValues.has(value))
      .map(
        (value) => `${label} 引用了未知对象 ${this.formatIssueValue(value)}`,
      );
  }

  private buildDuplicateItemIssues(label: string, values: string[]): string[] {
    const seen = new Set<string>();
    const duplicates = new Set<string>();

    for (const value of values) {
      if (seen.has(value)) {
        duplicates.add(value);
      } else {
        seen.add(value);
      }
    }

    return [...duplicates].map(
      (value) => `${label} 存在重复值 ${this.formatIssueValue(value)}`,
    );
  }

  private collectSensitiveTokenIssues(
    value: unknown,
    path = 'integrationPlan',
    depth = 0,
  ): string[] {
    if (depth > 8) {
      return [];
    }

    if (typeof value === 'string') {
      return this.isSensitiveTokenLike(value)
        ? [
            `${path} 含有疑似真实 token/secret，必须改为合成测试占位且不得写入 evidence`,
          ]
        : [];
    }

    if (Array.isArray(value)) {
      return value.flatMap((item, index) =>
        this.collectSensitiveTokenIssues(item, `${path}[${index}]`, depth + 1),
      );
    }

    if (!this.isRecord(value)) {
      return [];
    }

    return Object.entries(value).flatMap(([key, nestedValue]) => {
      const nextPath = `${path}.${key}`;
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      const hasSensitiveKey =
        normalizedKey === 'token' ||
        normalizedKey.endsWith('token') ||
        normalizedKey.includes('apikey') ||
        normalizedKey.includes('secret') ||
        normalizedKey.includes('authorization') ||
        normalizedKey.includes('bearer');
      const sensitiveKeyIssue =
        hasSensitiveKey &&
        nestedValue !== null &&
        nestedValue !== undefined &&
        (!Array.isArray(nestedValue) || nestedValue.length > 0) &&
        (!this.isRecord(nestedValue) || Object.keys(nestedValue).length > 0)
          ? [
              `${nextPath} 不能包含真实 token/secret 字段；Gate 4 测试资源必须使用合成无密钥上下文`,
            ]
          : [];

      return [
        ...sensitiveKeyIssue,
        ...this.collectSensitiveTokenIssues(nestedValue, nextPath, depth + 1),
      ];
    });
  }

  private isSensitiveTokenLike(value: string): boolean {
    const trimmed = value.trim();

    return (
      /^[a-f0-9]{64}$/i.test(trimmed) ||
      /^(sk|pk|pat|ghp|glpat|xox[baprs])[-_]/.test(trimmed) ||
      /^bearer\s+\S+/i.test(trimmed)
    );
  }

  private formatIssueValue(value: string): string {
    if (/^[a-f0-9]{64}$/i.test(value)) {
      return '[REDACTED_TOKEN]';
    }

    if (/^(sk|pk|pat|ghp|glpat|xox[baprs])[-_]/.test(value)) {
      return '[REDACTED_SECRET]';
    }

    return value;
  }

  private buildBooleanMirrorIssue(
    source: Record<string, unknown> | null,
    field: string,
    expected: boolean,
  ): string[] {
    return source?.[field] === expected
      ? []
      : [`${field} 必须为 ${String(expected)}`];
  }

  private isAcyclicGraph(
    nodeIds: string[],
    edges: Array<{ fromNodeId: string | null; toNodeId: string | null }>,
  ): boolean {
    const nodeSet = new Set(nodeIds);
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const adjacency = new Map<string, string[]>(
      nodeIds.map((nodeId) => [nodeId, []]),
    );

    for (const edge of edges) {
      if (
        edge.fromNodeId &&
        edge.toNodeId &&
        nodeSet.has(edge.fromNodeId) &&
        nodeSet.has(edge.toNodeId)
      ) {
        adjacency.get(edge.fromNodeId)?.push(edge.toNodeId);
      }
    }

    const visit = (nodeId: string): boolean => {
      if (visited.has(nodeId)) {
        return true;
      }

      if (visiting.has(nodeId)) {
        return false;
      }

      visiting.add(nodeId);

      for (const nextNodeId of adjacency.get(nodeId) ?? []) {
        if (!visit(nextNodeId)) {
          return false;
        }
      }

      visiting.delete(nodeId);
      visited.add(nodeId);
      return true;
    };

    return nodeIds.every((nodeId) => visit(nodeId));
  }

  private buildGateResultsUpdatePayload(
    userId: string,
    gateResults: GeneratedAppGateResult[],
    options: {
      generationPlan?: GeneratedApp['generationPlan'];
      preview?: GeneratedAppPreview;
    } = {},
  ): Partial<schema.NewGeneratedApp> {
    const readiness = evaluateGeneratedAppReadiness(gateResults);
    const status = getGeneratedAppStatusForReadiness(readiness);
    const updatePayload: Partial<schema.NewGeneratedApp> = {
      gateResults,
      readiness,
      status,
      updatedBy: userId,
      updatedAt: new Date(),
    };

    if (options.generationPlan !== undefined) {
      updatePayload.generationPlan = options.generationPlan;
    }

    if (options.preview !== undefined) {
      updatePayload.preview = options.preview;
    }

    if (!readiness.canCreatePublicShare) {
      updatePayload.publicShareToken = null;
      updatePayload.publicShareEnabled = false;
      updatePayload.publicShareDisabledAt = new Date();
    }

    return updatePayload;
  }

  private async activatePublicShare(
    tenantId: string,
    userId: string,
    app: GeneratedApp,
    options: { forceNewToken: boolean },
  ): Promise<GeneratedAppResponseDto> {
    this.assertCanEnablePublicShare(app);

    const currentPublicShareToken = app.publicShareEnabled
      ? app.publicShareToken
      : null;
    const shouldReuseCurrentToken =
      !options.forceNewToken && currentPublicShareToken !== null;
    const publicShareToken = shouldReuseCurrentToken
      ? currentPublicShareToken
      : crypto.randomBytes(32).toString('hex');
    const now = new Date();

    const [updated] = await this.tenantDb
      .update(schema.generatedApps)
      .set({
        status: 'published',
        publicShareToken,
        publicShareEnabled: true,
        publicShareCreatedAt: shouldReuseCurrentToken
          ? (app.publicShareCreatedAt ?? now)
          : now,
        publicShareDisabledAt: null,
        updatedBy: userId,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.generatedApps.id, app.id),
          eq(schema.generatedApps.tenantId, tenantId),
        ),
      )
      .returning();

    if (!updated) {
      throw new GeneratedAppNotFoundException(app.id);
    }

    return this.toResponseDto(updated);
  }

  private async findGeneratedAppRecord(
    tenantId: string,
    appId: string,
  ): Promise<GeneratedApp> {
    const [app] = await this.tenantDb
      .select()
      .from(schema.generatedApps)
      .where(
        and(
          eq(schema.generatedApps.id, appId),
          eq(schema.generatedApps.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!app) {
      throw new GeneratedAppNotFoundException(appId);
    }

    return app;
  }

  private async findGenerationRunRecord(
    tenantId: string,
    appId: string,
    runId: string,
  ): Promise<GeneratedAppGenerationRun> {
    const [run] = await this.tenantDb
      .select()
      .from(schema.generatedAppGenerationRuns)
      .where(
        and(
          eq(schema.generatedAppGenerationRuns.id, runId),
          eq(schema.generatedAppGenerationRuns.tenantId, tenantId),
          eq(schema.generatedAppGenerationRuns.generatedAppId, appId),
        ),
      )
      .limit(1);

    if (!run) {
      throw new GeneratedAppGenerationRunNotFoundException(runId);
    }

    return run;
  }

  private async findRepairAttemptRecord(
    tenantId: string,
    appId: string,
    repairAttemptId: string,
  ): Promise<GeneratedAppRepairAttempt> {
    const [attempt] = await this.tenantDb
      .select()
      .from(schema.generatedAppRepairAttempts)
      .where(
        and(
          eq(schema.generatedAppRepairAttempts.id, repairAttemptId),
          eq(schema.generatedAppRepairAttempts.tenantId, tenantId),
          eq(schema.generatedAppRepairAttempts.generatedAppId, appId),
        ),
      )
      .limit(1);

    if (!attempt) {
      throw new GeneratedAppRepairAttemptNotFoundException(repairAttemptId);
    }

    return attempt;
  }

  private async findPublicGeneratedAppRecord(
    token: string,
  ): Promise<GeneratedApp> {
    const [app] = await this.db
      .select()
      .from(schema.generatedApps)
      .where(
        and(
          eq(schema.generatedApps.publicShareToken, token),
          eq(schema.generatedApps.publicShareEnabled, true),
          eq(schema.generatedApps.status, 'published'),
        ),
      )
      .limit(1);

    if (!app) {
      throw new GeneratedAppNotFoundException(token);
    }

    this.assertCanEnablePublicShare(app);

    return app;
  }

  private async findSubmissionRecord(
    tenantId: string,
    appId: string,
    submissionId: string,
  ): Promise<GeneratedAppSubmission> {
    const [submission] = await this.tenantDb
      .select()
      .from(schema.generatedAppSubmissions)
      .where(
        and(
          eq(schema.generatedAppSubmissions.id, submissionId),
          eq(schema.generatedAppSubmissions.tenantId, tenantId),
          eq(schema.generatedAppSubmissions.generatedAppId, appId),
          isNull(schema.generatedAppSubmissions.deletedAt),
        ),
      )
      .limit(1);

    if (!submission) {
      throw new GeneratedAppSubmissionNotFoundException(submissionId);
    }

    return submission;
  }

  private toResponseDto(app: GeneratedApp): GeneratedAppResponseDto {
    const publicShareUrl =
      app.publicShareEnabled && app.publicShareToken
        ? `${this.getBaseUrl()}/generated-apps/public/${app.publicShareToken}`
        : null;

    return {
      id: app.id,
      tenantId: app.tenantId,
      prompt: app.prompt,
      appName: app.appName,
      description: app.description,
      status: app.status,
      appSpec: app.appSpec,
      generationPlan: app.generationPlan,
      gateResults: app.gateResults,
      readiness: app.readiness,
      preview: app.preview,
      agentDefinitionId: app.agentDefinitionId,
      workflowDefinitionId: app.workflowDefinitionId,
      pluginIds: app.pluginIds,
      publicShareEnabled: app.publicShareEnabled,
      publicShareToken: app.publicShareToken,
      publicShareUrl,
      publicShareCreatedAt: app.publicShareCreatedAt,
      publicShareDisabledAt: app.publicShareDisabledAt,
      publicViewCount: app.publicViewCount,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
    };
  }

  private toSubmissionResponseDto(
    submission: GeneratedAppSubmission,
  ): GeneratedAppSubmissionResponseDto {
    return {
      id: submission.id,
      tenantId: submission.tenantId,
      appId: submission.generatedAppId,
      appSpecVersion: submission.appSpecVersion,
      publicShareToken: submission.publicShareToken,
      anonymousSessionId: submission.anonymousSessionId,
      status: submission.status,
      input: submission.input,
      result: submission.result,
      report: submission.report,
      errorMessage: submission.errorMessage,
      createdAt: submission.createdAt,
      updatedAt: submission.updatedAt,
      deletedAt: submission.deletedAt,
    };
  }

  private toPublicSubmissionResponseDto(
    submission: GeneratedAppSubmission,
  ): PublicGeneratedAppSubmissionResponseDto {
    return {
      id: submission.id,
      appId: submission.generatedAppId,
      appSpecVersion: submission.appSpecVersion,
      status: submission.status,
      anonymousSessionId: submission.anonymousSessionId,
      input: submission.input,
      result: submission.result,
      report: submission.report,
      errorMessage: submission.errorMessage,
      createdAt: submission.createdAt,
      updatedAt: submission.updatedAt,
    };
  }

  private toGateRunResponseDto(
    gateRun: GeneratedAppGateRun,
  ): GeneratedAppGateRunResponseDto {
    return {
      id: gateRun.id,
      tenantId: gateRun.tenantId,
      appId: gateRun.generatedAppId,
      generationRunId: gateRun.generationRunId,
      repairAttemptId: gateRun.repairAttemptId,
      gateId: gateRun.gateId,
      gateOrder: gateRun.gateOrder,
      gateName: gateRun.gateName,
      blocking: gateRun.blocking,
      attemptNumber: gateRun.attemptNumber,
      status: gateRun.status,
      summary: gateRun.summary,
      evidence: gateRun.evidence,
      failure: gateRun.failure,
      repairInstructions: gateRun.repairInstructions,
      startedAt: gateRun.startedAt,
      completedAt: gateRun.completedAt,
      createdBy: gateRun.createdBy,
      createdAt: gateRun.createdAt,
      updatedAt: gateRun.updatedAt,
    };
  }

  private toGenerationRunResponseDto(
    run: GeneratedAppGenerationRun,
  ): GeneratedAppGenerationRunResponseDto {
    return {
      id: run.id,
      tenantId: run.tenantId,
      appId: run.generatedAppId,
      runNumber: run.runNumber,
      status: run.status,
      triggerSource: run.triggerSource,
      maxRepairAttempts: run.maxRepairAttempts,
      maxRuntimeSeconds: run.maxRuntimeSeconds,
      summary: run.summary,
      failureReason: run.failureReason,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      createdBy: run.createdBy,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    };
  }

  private toRepairAttemptResponseDto(
    attempt: GeneratedAppRepairAttempt,
  ): GeneratedAppRepairAttemptResponseDto {
    return {
      id: attempt.id,
      tenantId: attempt.tenantId,
      appId: attempt.generatedAppId,
      generationRunId: attempt.generationRunId,
      attemptNumber: attempt.attemptNumber,
      targetGateId: attempt.targetGateId,
      status: attempt.status,
      failureSummary: attempt.failureSummary,
      changeSummary: attempt.changeSummary,
      verificationSummary: attempt.verificationSummary,
      startedAt: attempt.startedAt,
      completedAt: attempt.completedAt,
      createdBy: attempt.createdBy,
      createdAt: attempt.createdAt,
      updatedAt: attempt.updatedAt,
    };
  }

  private buildInitialAppSpec(prompt: string): GeneratedAppSpec {
    const appName = this.buildAppName(prompt);

    return {
      version: 1,
      appName,
      summary: `围绕“${prompt}”生成的 AppSpec 初稿。`,
      userGoal: prompt,
      actors: ['创建者', '终端用户'],
      coreRequirements: [
        {
          id: 'req-1',
          text: prompt,
        },
        {
          id: 'req-2',
          text: '公开应用提交内容默认持久化，并提供给创建者查看。',
        },
      ],
      pages: [
        {
          id: 'page-creator-workbench',
          name: '创建者工作台',
          purpose: '查看生成记录、门禁结果、预览状态和发布状态。',
        },
        {
          id: 'page-public-runtime',
          name: '公开运行页',
          purpose: '让终端用户在不登录的情况下使用通过门禁的定制业务界面。',
        },
      ],
      dataPolicy: {
        publicSubmissionsPersisted: true,
        creatorCanDeleteSubmissions: true,
        endUserLoginRequired: false,
      },
      nonGoals: [
        '第一阶段不生成自定义后端服务、数据库 schema 或部署资产。',
        '第一阶段不绕过 AgentLoom 鉴权、租户隔离、资源配额或 API 权限模型。',
      ],
      acceptanceScenarios: [
        {
          id: 'scenario-1',
          title: '创建者可以从一句话进入可验证生成流程',
          requirementIds: ['req-1'],
          given: ['创建者已登录 AgentLoom Studio'],
          when: [`创建者提交需求“${prompt}”`],
          then: [
            '系统生成结构化 AppSpec 初稿',
            '系统初始化 Gate 0-7 门禁结果',
            '系统在阻断门禁未全绿时不允许创建正式公开链接',
          ],
        },
        {
          id: 'scenario-2',
          title: '终端用户数据保存策略可追踪',
          requirementIds: ['req-2'],
          given: ['生成应用进入公开运行面'],
          when: ['终端用户提交业务输入'],
          then: [
            '公开页面展示数据用途提示',
            '提交内容和运行结果归属创建者租户',
          ],
        },
      ],
      traceability: [
        {
          requirementId: 'req-1',
          scenarioIds: ['scenario-1'],
          evidenceIds: ['app-spec-draft'],
        },
        {
          requirementId: 'req-2',
          scenarioIds: ['scenario-2'],
          evidenceIds: ['app-spec-draft'],
        },
      ],
    };
  }

  private buildAppName(prompt: string): string {
    const compact = prompt.replace(/\s+/g, ' ').trim();
    const firstSentence = compact.split(/[。！？!?]/)[0]?.trim() ?? compact;
    const baseName = firstSentence.length > 0 ? firstSentence : '定制化应用';
    return baseName.length > 48 ? `${baseName.slice(0, 48)}...` : baseName;
  }

  private buildPlanRoute(pageId: string): string {
    return `/${this.buildPlanSegment(pageId)}`;
  }

  private buildPlanSegment(value: string): string {
    const segment = value
      .trim()
      .toLowerCase()
      .replace(/^page-/, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return segment.length > 0 ? segment : 'generated-app';
  }

  private getPublicRuntimePages(
    appSpec: GeneratedAppSpec,
  ): GeneratedAppSpec['pages'] {
    return appSpec.pages.filter((page) => {
      const id = page.id.toLowerCase();
      const name = page.name.toLowerCase();
      const purpose = page.purpose.toLowerCase();

      return (
        id.includes('public') ||
        id.includes('runtime') ||
        name.includes('公开') ||
        name.includes('终端') ||
        purpose.includes('终端用户')
      );
    });
  }

  private resolveStatusForShareDisabled(
    readiness: GeneratedAppReadiness,
  ): GeneratedAppStatus {
    if (readiness.canCreatePublicShare) {
      return 'publish_candidate';
    }

    return getGeneratedAppStatusForReadiness(readiness);
  }

  private getBaseUrl(): string {
    const baseUrl =
      this.configService.get<string>('APP_FRONTEND_URL') ??
      this.configService.get<string>('APP_BASE_URL') ??
      process.env.APP_FRONTEND_URL ??
      'http://localhost:5173';

    return baseUrl.replace(/\/+$/, '');
  }
}
