import * as crypto from 'crypto';

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, sql } from 'drizzle-orm';

import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import * as schema from '../../database/schema';
import type {
  GeneratedApp,
  GeneratedAppSpec,
  GeneratedAppGateResult,
  GeneratedAppPreview,
  GeneratedAppReadiness,
  GeneratedAppStatus,
} from '../../database/schema';
import {
  type CreateGeneratedAppDtoType,
  type GeneratedAppResponseDto,
  type PublicGeneratedAppResponseDto,
  type QueryGeneratedAppsDtoType,
  RecordGeneratedAppGateResultsSchema,
  type RecordGeneratedAppGateResultsDtoType,
} from './dto';
import {
  createInitialGeneratedAppGateResults,
  evaluateGeneratedAppReadiness,
  getGeneratedAppStatusForReadiness,
  normalizeGeneratedAppGateResults,
} from './generated-app.gates';
import {
  GeneratedAppNotFoundException,
  GeneratedAppPublicShareNotReadyException,
} from './generated-app.exceptions';

const DEFAULT_PREVIEW: GeneratedAppPreview = {
  previewUrl: null,
  sourceArtifactUrl: null,
  testReportUrl: null,
};

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
    const readiness = evaluateGeneratedAppReadiness(gateResults);
    const status = getGeneratedAppStatusForReadiness(readiness);
    const shouldDisablePublicShare = !readiness.canCreatePublicShare;
    const updatePayload: Partial<schema.NewGeneratedApp> = {
      gateResults,
      readiness,
      status,
      updatedBy: userId,
      updatedAt: new Date(),
    };

    if (parsed.generationPlan !== undefined) {
      updatePayload.generationPlan = parsed.generationPlan;
    }

    if (parsed.preview !== undefined) {
      updatePayload.preview = parsed.preview;
    }

    if (shouldDisablePublicShare) {
      updatePayload.publicShareToken = null;
      updatePayload.publicShareEnabled = false;
      updatePayload.publicShareDisabledAt = new Date();
    }

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
