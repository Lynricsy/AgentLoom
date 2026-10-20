// 本文件封装 Generated App 五张台账的全部查询、写入、行映射与租户边界。

import * as crypto from 'crypto';

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, gt, isNotNull, isNull, sql } from 'drizzle-orm';

import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import * as schema from '../../database/schema';
import type {
  GeneratedApp,
  GeneratedAppGenerationRun,
  GeneratedAppRepairPlan,
  GeneratedAppReverificationPlan,
  GeneratedAppGateRun,
  GeneratedAppSpecV2,
  GeneratedAppGateResult,
  GeneratedAppPreview,
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
  type CreateGeneratedAppDtoType,
  UpdateGeneratedAppSchema,
  type UpdateGeneratedAppDtoType,
  type GeneratedAppGenerationRunResponseDto,
  type GeneratedAppGateRunResponseDto,
  type GeneratedAppRepairAttemptResponseDto,
  type GeneratedAppResponseDto,
  type GeneratedAppSubmissionResponseDto,
  type PublicGeneratedAppSubmissionResponseDto,
  type QueryGeneratedAppGenerationRunsDtoType,
  type QueryGeneratedAppGateRunsDtoType,
  type QueryGeneratedAppRepairAttemptsDtoType,
  type QueryGeneratedAppsDtoType,
  RecordGeneratedAppGateResultsSchema,
  type RecordGeneratedAppGateRunResponseDto,
  type RecordGeneratedAppGateResultsDtoType,
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
  GeneratedAppBindingTargetNotFoundException,
  GeneratedAppGateDefinitionNotFoundException,
  GeneratedAppGenerationRunNotFoundException,
  GeneratedAppNotFoundException,
  GeneratedAppPublicShareNotReadyException,
  GeneratedAppRepairAttemptNotFoundException,
  GeneratedAppSubmissionNotFoundException,
} from './generated-app.exceptions';
import {
  LlmModelConfigNotFoundException,
  LlmModelConfigValidationException,
} from '../llm/llm.exceptions';

import { applyPublishCandidateGuard } from './generated-app.gate7-publish-candidate';
import { isAppSpecV2 } from './types/generated-app.types';
import { isRecord } from './generated-app.plan-validation.util';

import { buildAppName } from './generated-app.app-spec.util';

import { DEFAULT_PREVIEW } from './generated-app.internal';
import type { GeneratedAppRuntimeResult } from './types/generation-v2.ports';

/** 公开分享令牌与验收令牌都是 URL 段；先挡掉明显不合法的输入，不进数据库查询 */
const PUBLIC_RUNTIME_TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function hashAcceptanceToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class GeneratedAppRepository {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly configService: ConfigService,
  ) {}

  get globalDb(): DrizzleDB {
    return this.db;
  }

  public get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  async create(
    tenantId: string,
    userId: string,
    dto: CreateGeneratedAppDtoType,
  ): Promise<GeneratedAppResponseDto> {
    const prompt = dto.prompt.trim();
    await this.assertCreateReferencesInTenant(tenantId, dto);
    // AppSpec 由生成运行的 Gate 0 调用模型生成；创建时只落需求，门禁全部待运行
    const gateResults = createInitialGeneratedAppGateResults();
    const readiness = evaluateGeneratedAppReadiness(gateResults);
    const status: GeneratedAppStatus = 'app_spec_generating';

    const [created] = await this.tenantDb
      .insert(schema.generatedApps)
      .values({
        tenantId,
        prompt,
        appName: buildAppName(prompt),
        description: prompt,
        status,
        appSpec: null,
        generationPlan: null,
        gateResults,
        readiness,
        preview: DEFAULT_PREVIEW,
        pluginIds: [],
        generationModelConfigId: dto.modelConfigId ?? null,
        bindingTarget: dto.bindingTarget ?? null,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    return this.toResponseDto(created);
  }

  /**
   * Gate 0 生成通过后落库 AppSpec v2：名称与描述取自规格，记录实际使用的生成模型（repair 复用），
   * 状态从 app_spec_generating 进入 app_spec_ready（其他状态由后续门禁结果决定，不在这里改）。
   */
  async saveGeneratedAppSpec(params: {
    tenantId: string;
    userId: string;
    appId: string;
    appSpec: GeneratedAppSpecV2;
    generationModelConfigId: string;
  }): Promise<void> {
    const updated = await this.tenantDb
      .update(schema.generatedApps)
      .set({
        appSpec: params.appSpec,
        appName: params.appSpec.appName,
        description: params.appSpec.summary,
        generationModelConfigId: params.generationModelConfigId,
        status: sql`CASE WHEN ${schema.generatedApps.status} = 'app_spec_generating' THEN 'app_spec_ready'::generated_app_status ELSE ${schema.generatedApps.status} END`,
        updatedBy: params.userId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.generatedApps.tenantId, params.tenantId),
          eq(schema.generatedApps.id, params.appId),
        ),
      )
      .returning({ id: schema.generatedApps.id });

    if (updated.length === 0) {
      throw new GeneratedAppNotFoundException(params.appId);
    }
  }

  /**
   * FK 不受 RLS 约束：创建时指定的模型与绑定目标必须先在当前租户内确认，避免存下跨租户引用。
   * 模型须是已启用的 chat 模型；绑定目标须已发布（有已发布版本），否则生成运行无法固定版本。
   */
  private async assertCreateReferencesInTenant(
    tenantId: string,
    dto: CreateGeneratedAppDtoType,
  ): Promise<void> {
    if (dto.modelConfigId) {
      const [model] = await this.tenantDb
        .select({
          modelType: schema.llmModelConfigs.modelType,
          isEnabled: schema.llmModelConfigs.isEnabled,
        })
        .from(schema.llmModelConfigs)
        .where(
          and(
            eq(schema.llmModelConfigs.id, dto.modelConfigId),
            eq(schema.llmModelConfigs.tenantId, tenantId),
          ),
        )
        .limit(1);

      if (!model) {
        throw new LlmModelConfigNotFoundException(dto.modelConfigId);
      }
      if (model.modelType !== 'chat' || !model.isEnabled) {
        throw new LlmModelConfigValidationException(
          `模型配置 ${dto.modelConfigId} 不是已启用的 chat 模型，不能用于生成 AppSpec`,
        );
      }
    }

    const target = dto.bindingTarget;
    if (!target) {
      return;
    }

    const [published] =
      target.kind === 'workflow'
        ? await this.tenantDb
            .select({ id: schema.workflowDefinitions.id })
            .from(schema.workflowDefinitions)
            .where(
              and(
                eq(schema.workflowDefinitions.id, target.workflowDefinitionId),
                eq(schema.workflowDefinitions.tenantId, tenantId),
                eq(schema.workflowDefinitions.status, 'published'),
                isNotNull(schema.workflowDefinitions.publishedVersionId),
              ),
            )
            .limit(1)
        : await this.tenantDb
            .select({ id: schema.agentDefinitions.id })
            .from(schema.agentDefinitions)
            .where(
              and(
                eq(schema.agentDefinitions.id, target.agentDefinitionId),
                eq(schema.agentDefinitions.tenantId, tenantId),
                eq(schema.agentDefinitions.status, 'published'),
                isNotNull(schema.agentDefinitions.publishedVersionId),
              ),
            )
            .limit(1);

    if (!published) {
      throw new GeneratedAppBindingTargetNotFoundException(
        target.kind,
        target.kind === 'workflow'
          ? target.workflowDefinitionId
          : target.agentDefinitionId,
      );
    }
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
  // 展示信息更新保持租户条件，避免同 ID 猜测导致跨租户改写。
  async update(
    tenantId: string,
    userId: string,
    appId: string,
    dto: UpdateGeneratedAppDtoType,
  ): Promise<GeneratedAppResponseDto> {
    const parsed = UpdateGeneratedAppSchema.parse(dto);
    const [updated] = await this.tenantDb
      .update(schema.generatedApps)
      .set({
        ...parsed,
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

  // 先在同一租户事务内撤销公开 token，再删除父记录，避免删除流程留下仍可读取的公开入口。
  async delete(tenantId: string, appId: string): Promise<void> {
    await runInTenantTransaction(this.db, tenantId, async (tenantDb) => {
      const now = new Date();
      const [disabled] = await tenantDb
        .update(schema.generatedApps)
        .set({
          publicShareEnabled: false,
          publicShareToken: null,
          publicShareDisabledAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.generatedApps.id, appId),
            eq(schema.generatedApps.tenantId, tenantId),
          ),
        )
        .returning({ id: schema.generatedApps.id });

      if (!disabled) {
        throw new GeneratedAppNotFoundException(appId);
      }

      const [deleted] = await tenantDb
        .delete(schema.generatedApps)
        .where(
          and(
            eq(schema.generatedApps.id, appId),
            eq(schema.generatedApps.tenantId, tenantId),
          ),
        )
        .returning({ id: schema.generatedApps.id });

      if (!deleted) {
        throw new GeneratedAppNotFoundException(appId);
      }
    });
  }

  async recordGateResults(
    tenantId: string,
    userId: string,
    appId: string,
    dto: RecordGeneratedAppGateResultsDtoType,
  ): Promise<GeneratedAppResponseDto> {
    const app = await this.findGeneratedAppRecord(tenantId, appId);

    const parsed = RecordGeneratedAppGateResultsSchema.parse(dto);
    const gateResults = normalizeGeneratedAppGateResults(
      parsed.gateResults as GeneratedAppGateResult[],
    );
    const updatePayload = this.buildGateResultsUpdatePayload(
      userId,
      app,
      gateResults,
      { generationPlan: parsed.generationPlan, preview: parsed.preview },
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
  // 详情读取同时绑定租户、应用和运行 ID，任一父级错配都按不存在处理。
  async findGenerationRun(
    tenantId: string,
    appId: string,
    runId: string,
  ): Promise<GeneratedAppGenerationRunResponseDto> {
    const run = await this.findGenerationRunRecord(tenantId, appId, runId);
    return this.toGenerationRunResponseDto(run);
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
        repairPlan:
          (parsed.repairPlan as schema.NewGeneratedAppRepairAttempt['repairPlan']) ??
          null,
        reverificationPlan:
          (parsed.reverificationPlan as schema.NewGeneratedAppRepairAttempt['reverificationPlan']) ??
          null,
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

    if (parsed.repairPlan !== undefined) {
      updatePayload.repairPlan =
        parsed.repairPlan as schema.NewGeneratedAppRepairAttempt['repairPlan'];
    }

    if (parsed.reverificationPlan !== undefined) {
      updatePayload.reverificationPlan =
        parsed.reverificationPlan as schema.NewGeneratedAppRepairAttempt['reverificationPlan'];
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
  // 修复尝试详情必须沿完整父链过滤，避免仅凭记录 ID 穿透到其他运行或租户。
  async findRepairAttempt(
    tenantId: string,
    appId: string,
    runId: string,
    repairAttemptId: string,
  ): Promise<GeneratedAppRepairAttemptResponseDto> {
    const attempt = await this.findRepairAttemptForRunRecord(
      tenantId,
      appId,
      runId,
      repairAttemptId,
    );
    return this.toRepairAttemptResponseDto(attempt);
  }

  // 删除同样锁定完整父链，确保错配的 tenant/app/run/record 组合统一返回 404。
  async deleteRepairAttempt(
    tenantId: string,
    appId: string,
    runId: string,
    repairAttemptId: string,
  ): Promise<void> {
    const [deleted] = await this.tenantDb
      .delete(schema.generatedAppRepairAttempts)
      .where(
        and(
          eq(schema.generatedAppRepairAttempts.id, repairAttemptId),
          eq(schema.generatedAppRepairAttempts.tenantId, tenantId),
          eq(schema.generatedAppRepairAttempts.generatedAppId, appId),
          eq(schema.generatedAppRepairAttempts.generationRunId, runId),
        ),
      )
      .returning({ id: schema.generatedAppRepairAttempts.id });

    if (!deleted) {
      throw new GeneratedAppRepairAttemptNotFoundException(repairAttemptId);
    }
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

  public async assertGateRunLinks(
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

  public async createGateRunAndUpdateApp(
    tenantId: string,
    userId: string,
    app: GeneratedApp,
    parsed: CreateGeneratedAppGateRunDtoType,
    options: {
      buildGateResults?: (
        gateResult: GeneratedAppGateResult,
        nowIso: string,
      ) => GeneratedAppGateResult[];
      generationPlan?: GeneratedApp['generationPlan'];
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
      app,
      gateResults,
      { generationPlan: options.generationPlan },
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

  public buildRunnerGateResults(
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

  public async resolveNextGenerationRunNumber(
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

  public buildGateResultsUpdatePayload(
    userId: string,
    app: Pick<GeneratedApp, 'appSpec' | 'generationPlan'>,
    gateResults: GeneratedAppGateResult[],
    options: {
      generationPlan?: GeneratedApp['generationPlan'];
      preview?: GeneratedAppPreview;
    } = {},
  ): Partial<schema.NewGeneratedApp> {
    const guardedGateResults = applyPublishCandidateGuard(
      gateResults,
      options.generationPlan !== undefined
        ? options.generationPlan
        : app.generationPlan,
      isAppSpecV2(app.appSpec) ? app.appSpec : null,
    );
    const readiness = evaluateGeneratedAppReadiness(guardedGateResults);
    const status = getGeneratedAppStatusForReadiness(readiness);
    const updatePayload: Partial<schema.NewGeneratedApp> = {
      gateResults: guardedGateResults,
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

    if (!readiness.canCreatePublicShare || status === 'publish_candidate') {
      updatePayload.publicShareToken = null;
      updatePayload.publicShareEnabled = false;
      updatePayload.publicShareDisabledAt = new Date();
    }

    return updatePayload;
  }

  public async activatePublicShare(
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

  public async findGeneratedAppRecord(
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

  public async findGenerationRunRecord(
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

  public async findRepairAttemptRecord(
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
  // 路由详情需要 runId 作为父级边界，不能复用只按 appId 过滤的内部关联检查。
  private async findRepairAttemptForRunRecord(
    tenantId: string,
    appId: string,
    runId: string,
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
          eq(schema.generatedAppRepairAttempts.generationRunId, runId),
        ),
      )
      .limit(1);

    if (!attempt) {
      throw new GeneratedAppRepairAttemptNotFoundException(repairAttemptId);
    }

    return attempt;
  }

  /**
   * 公开路由按令牌取应用：先按已发布的公开分享令牌，再按未过期的 Gate 5 验收令牌
   * （库里只存 sha256）。AppSpec 版本与发布门槛由公开运行时服务按访问方式判断。
   */
  public async findByPublicOrAcceptanceToken(token: string): Promise<
    | { access: 'public'; appId: string; tenantId: string; app: GeneratedApp }
    | {
        access: 'acceptance';
        appId: string;
        tenantId: string;
        generationRunId: string;
        app: GeneratedApp;
      }
    | null
  > {
    if (!PUBLIC_RUNTIME_TOKEN_PATTERN.test(token)) {
      return null;
    }

    const [publicApp] = await this.db
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

    if (publicApp) {
      return {
        access: 'public',
        appId: publicApp.id,
        tenantId: publicApp.tenantId,
        app: publicApp,
      };
    }

    const [acceptanceApp] = await this.db
      .select()
      .from(schema.generatedApps)
      .where(
        and(
          eq(
            schema.generatedApps.acceptanceTokenHash,
            hashAcceptanceToken(token),
          ),
          gt(schema.generatedApps.acceptanceTokenExpiresAt, new Date()),
          isNotNull(schema.generatedApps.acceptanceGenerationRunId),
        ),
      )
      .limit(1);

    if (!acceptanceApp?.acceptanceGenerationRunId) {
      return null;
    }

    return {
      access: 'acceptance',
      appId: acceptanceApp.id,
      tenantId: acceptanceApp.tenantId,
      generationRunId: acceptanceApp.acceptanceGenerationRunId,
      app: acceptanceApp,
    };
  }

  /**
   * 签发 Gate 5 验收令牌：32 字节随机 hex，只存 sha256。同一应用同时只有一个有效令牌，
   * 重新签发会使旧令牌失效。自带租户事务，调用方不要在外层持有事务。
   */
  async issueAcceptanceToken(params: {
    tenantId: string;
    appId: string;
    generationRunId: string;
    ttlMs: number;
  }): Promise<{ token: string; expiresAt: Date }> {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + params.ttlMs);

    await runInTenantTransaction(this.db, params.tenantId, async (tenantDb) => {
      const [updated] = await tenantDb
        .update(schema.generatedApps)
        .set({
          acceptanceTokenHash: hashAcceptanceToken(token),
          acceptanceTokenExpiresAt: expiresAt,
          acceptanceGenerationRunId: params.generationRunId,
        })
        .where(
          and(
            eq(schema.generatedApps.id, params.appId),
            eq(schema.generatedApps.tenantId, params.tenantId),
          ),
        )
        .returning({ id: schema.generatedApps.id });

      if (!updated) {
        throw new GeneratedAppNotFoundException(params.appId);
      }
    });

    return { token, expiresAt };
  }

  /** 撤销验收令牌（幂等）。自带租户事务，调用方不要在外层持有事务 */
  async revokeAcceptanceToken(tenantId: string, appId: string): Promise<void> {
    await runInTenantTransaction(this.db, tenantId, (tenantDb) =>
      tenantDb
        .update(schema.generatedApps)
        .set({
          acceptanceTokenHash: null,
          acceptanceTokenExpiresAt: null,
          acceptanceGenerationRunId: null,
        })
        .where(
          and(
            eq(schema.generatedApps.id, appId),
            eq(schema.generatedApps.tenantId, tenantId),
          ),
        ),
    );
  }

  public async findSubmissionRecord(
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

  public toResponseDto(app: GeneratedApp): GeneratedAppResponseDto {
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
      generationModelConfigId: app.generationModelConfigId,
      bindingTarget: app.bindingTarget,
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

  public toSubmissionResponseDto(
    submission: GeneratedAppSubmission,
  ): GeneratedAppSubmissionResponseDto {
    return {
      id: submission.id,
      tenantId: submission.tenantId,
      appId: submission.generatedAppId,
      appSpecVersion: submission.appSpecVersion,
      publicShareToken: submission.publicShareToken,
      origin: submission.origin,
      generationRunId: submission.generationRunId,
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

  public toPublicSubmissionResponseDto(
    submission: GeneratedAppSubmission,
  ): PublicGeneratedAppSubmissionResponseDto {
    return {
      id: submission.id,
      appId: submission.generatedAppId,
      appSpecVersion: submission.appSpecVersion,
      status: submission.status,
      anonymousSessionId: submission.anonymousSessionId,
      input: submission.input,
      result: this.toPublicRuntimeResult(submission.result),
      errorMessage: submission.errorMessage,
      createdAt: submission.createdAt,
      updatedAt: submission.updatedAt,
    };
  }

  public toGateRunResponseDto(
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

  public toGenerationRunResponseDto(
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

  public toRepairAttemptResponseDto(
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
      repairPlan: this.getRepairPlanOrNull(attempt.repairPlan),
      reverificationPlan: this.getReverificationPlanOrNull(
        attempt.reverificationPlan,
      ),
      startedAt: attempt.startedAt,
      completedAt: attempt.completedAt,
      createdBy: attempt.createdBy,
      createdAt: attempt.createdAt,
      updatedAt: attempt.updatedAt,
    };
  }

  public getBaseUrl(): string {
    const baseUrl =
      this.configService.get<string>('APP_FRONTEND_URL') ??
      process.env.APP_FRONTEND_URL ??
      'http://localhost:5173';

    return baseUrl.replace(/\/+$/, '');
  }

  /** 公开端只返回 v2 运行结果形状；写入时已脱敏，这里只做形状把关 */
  private toPublicRuntimeResult(
    value: Record<string, unknown> | null,
  ): GeneratedAppRuntimeResult | null {
    if (
      !isRecord(value) ||
      !Array.isArray(value.sections) ||
      (value.status !== 'running' &&
        value.status !== 'completed' &&
        value.status !== 'failed')
    ) {
      return null;
    }

    return {
      status: value.status,
      sections: value.sections as GeneratedAppRuntimeResult['sections'],
      publicError:
        typeof value.publicError === 'string' ? value.publicError : null,
    };
  }

  public getRepairPlanOrNull(value: unknown): GeneratedAppRepairPlan | null {
    return isRecord(value)
      ? (value as unknown as GeneratedAppRepairPlan)
      : null;
  }

  public getReverificationPlanOrNull(
    value: unknown,
  ): GeneratedAppReverificationPlan | null {
    return isRecord(value)
      ? (value as unknown as GeneratedAppReverificationPlan)
      : null;
  }
  async markGenerationRunFailed(params: {
    tenantId: string;
    appId: string;
    runId: string;
    summary: string;
    failureReason: string;
    completedAt: Date;
  }): Promise<void> {
    await this.tenantDb
      .update(schema.generatedAppGenerationRuns)
      .set({
        status: 'failed',
        summary: params.summary,
        failureReason: params.failureReason,
        completedAt: params.completedAt,
        updatedAt: params.completedAt,
      })
      .where(
        and(
          eq(schema.generatedAppGenerationRuns.id, params.runId),
          eq(schema.generatedAppGenerationRuns.tenantId, params.tenantId),
          eq(schema.generatedAppGenerationRuns.generatedAppId, params.appId),
        ),
      );
  }
}
