import * as crypto from 'crypto';

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import * as schema from '../../database/schema';
import type {
  GeneratedApp,
  GeneratedAppGateEvidence,
  GeneratedAppGenerationPlan,
  GeneratedAppGenerationRun,
  GeneratedAppGateRunFailure,
  GeneratedAppGateRun,
  GeneratedAppSpec,
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

const GATE_2_7_RUNNER_INCOMPLETE_FAILURE_REASON =
  'Gate 2-7 runner 尚未接入/未执行，不能形成 publish candidate。';

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
        finalFailureReason = GATE_2_7_RUNNER_INCOMPLETE_FAILURE_REASON;
        completedSummary =
          '门禁运行器骨架完成 Gate 0 AppSpec 完整性检查和 Gate 1 架构计划门禁；Gate 2-7 runner 尚未接入/未执行，当前应用不能形成 publish candidate，保持不可发布。';
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
