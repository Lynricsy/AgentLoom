import * as crypto from 'crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, sql } from 'drizzle-orm';

import { TenantRequiredException } from '../../common/exceptions/auth.exceptions';
import { DomainException } from '../../common/exceptions/domain.exception';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import * as schema from '../../database/schema';
import { WorkflowNotFoundException } from '../workflow-definition/workflow-version.exceptions';
import type { CreateShareDto } from './dto/create-share.dto';
import { CreateShareSchema } from './dto/create-share.dto';
import type { QueryShareDto } from './dto/query-share.dto';
import { QueryShareSchema } from './dto/query-share.dto';
import type {
  PublicShareResponse,
  ShareResponse,
} from './dto/share-response.dto';
import {
  ShareExpiredException,
  ShareNotFoundException,
  ShareRevokedException,
  ShareWorkflowNotPublishedException,
} from './share.exceptions';

const DEFAULT_VIEWPORT: schema.ReactFlowViewport = {
  x: 0,
  y: 0,
  zoom: 1,
};

type ShareRecord = Pick<
  schema.WorkflowShare,
  | 'id'
  | 'workflowDefinitionId'
  | 'shareType'
  | 'shareToken'
  | 'expiresAt'
  | 'isRevoked'
  | 'viewCount'
  | 'copyCount'
  | 'createdAt'
>;

export interface ShareTokenRecord extends schema.WorkflowShare {
  workflowName: string;
  workflowDescription: string | null;
  publishedVersionId: string | null;
  snapshot: schema.WorkflowVersionSnapshot | null;
}

export interface AccessibleShareTokenRecord extends Omit<
  ShareTokenRecord,
  'publishedVersionId' | 'snapshot'
> {
  publishedVersionId: string;
  snapshot: schema.WorkflowVersionSnapshot;
}

@Injectable()
export class ShareService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly configService: ConfigService,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  async createShare(
    tenantId: string,
    userId: string,
    dto: CreateShareDto,
  ): Promise<ShareResponse> {
    this.ensureTenantId(tenantId);

    const parsedDto = CreateShareSchema.parse(dto);
    const [workflow] = await this.tenantDb
      .select({
        id: schema.workflowDefinitions.id,
        publishedVersionId: schema.workflowDefinitions.publishedVersionId,
      })
      .from(schema.workflowDefinitions)
      .where(
        and(
          eq(schema.workflowDefinitions.id, parsedDto.workflow_definition_id),
          eq(schema.workflowDefinitions.tenantId, tenantId),
        ),
      );

    if (!workflow) {
      throw new WorkflowNotFoundException(parsedDto.workflow_definition_id);
    }

    if (!workflow.publishedVersionId) {
      throw new ShareWorkflowNotPublishedException(
        parsedDto.workflow_definition_id,
      );
    }

    const shareToken = crypto.randomBytes(32).toString('hex');
    const [createdShare] = await this.db
      .insert(schema.workflowShares)
      .values({
        workflowDefinitionId: parsedDto.workflow_definition_id,
        tenantId,
        shareToken,
        shareType: parsedDto.share_type,
        createdBy: userId,
        expiresAt: parsedDto.expires_at ? new Date(parsedDto.expires_at) : null,
      })
      .returning({
        id: schema.workflowShares.id,
        workflowDefinitionId: schema.workflowShares.workflowDefinitionId,
        shareType: schema.workflowShares.shareType,
        shareToken: schema.workflowShares.shareToken,
        expiresAt: schema.workflowShares.expiresAt,
        isRevoked: schema.workflowShares.isRevoked,
        viewCount: schema.workflowShares.viewCount,
        copyCount: schema.workflowShares.copyCount,
        createdAt: schema.workflowShares.createdAt,
      });

    return this.toShareResponse(createdShare);
  }

  async findSharesByWorkflow(
    tenantId: string,
    dto: QueryShareDto,
  ): Promise<{
    data: ShareResponse[];
    meta: {
      page: number;
      pageSize: number;
      total: number;
    };
  }> {
    this.ensureTenantId(tenantId);

    const parsedDto = QueryShareSchema.parse(dto);
    const { page, page_size, workflow_definition_id } = parsedDto;
    const offset = (page - 1) * page_size;

    const conditions = [eq(schema.workflowShares.tenantId, tenantId)];

    if (workflow_definition_id) {
      conditions.push(
        eq(schema.workflowShares.workflowDefinitionId, workflow_definition_id),
      );
    }

    const whereClause = and(...conditions);

    const [shares, countResult] = await Promise.all([
      this.db
        .select({
          id: schema.workflowShares.id,
          workflowDefinitionId: schema.workflowShares.workflowDefinitionId,
          shareType: schema.workflowShares.shareType,
          shareToken: schema.workflowShares.shareToken,
          expiresAt: schema.workflowShares.expiresAt,
          isRevoked: schema.workflowShares.isRevoked,
          viewCount: schema.workflowShares.viewCount,
          copyCount: schema.workflowShares.copyCount,
          createdAt: schema.workflowShares.createdAt,
        })
        .from(schema.workflowShares)
        .where(whereClause)
        .orderBy(desc(schema.workflowShares.createdAt))
        .limit(page_size)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.workflowShares)
        .where(whereClause),
    ]);

    return {
      data: shares.map((share) => this.toShareResponse(share)),
      meta: {
        page,
        pageSize: page_size,
        total: countResult[0]?.count ?? 0,
      },
    };
  }

  async revokeShare(tenantId: string, shareId: string): Promise<void> {
    this.ensureTenantId(tenantId);

    const [revokedShare] = await this.db
      .update(schema.workflowShares)
      .set({
        isRevoked: true,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.workflowShares.id, shareId),
          eq(schema.workflowShares.tenantId, tenantId),
        ),
      )
      .returning({ id: schema.workflowShares.id });

    if (!revokedShare) {
      throw new ShareNotFoundException(shareId);
    }
  }

  async getPublicShare(token: string): Promise<PublicShareResponse> {
    const share = await this.getShareByToken(token);
    const snapshot = share.snapshot;

    await this.db
      .update(schema.workflowShares)
      .set({
        viewCount: sql`${schema.workflowShares.viewCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(schema.workflowShares.id, share.id));

    return {
      workflowName: share.workflowName,
      workflowDescription: share.workflowDescription,
      shareType: share.shareType,
      definition: {
        nodes: snapshot.nodes,
        edges: snapshot.edges,
        viewport: snapshot.viewport ?? DEFAULT_VIEWPORT,
      },
      createdAt: share.createdAt,
      expiresAt: share.expiresAt,
    };
  }

  async incrementCopyCount(token: string): Promise<ShareResponse> {
    const share = await this.getShareByToken(token);

    if (share.shareType !== 'copyable') {
      throw new DomainException({
        type: 'https://agentloom.dev/errors/share-copy-not-allowed',
        title: '分享链接不支持复制',
        status: HttpStatus.CONFLICT,
        detail: `分享链接 ${token} 不支持复制`,
      });
    }

    const [updatedShare] = await this.db
      .update(schema.workflowShares)
      .set({
        copyCount: sql`${schema.workflowShares.copyCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(schema.workflowShares.id, share.id))
      .returning({
        id: schema.workflowShares.id,
        workflowDefinitionId: schema.workflowShares.workflowDefinitionId,
        shareType: schema.workflowShares.shareType,
        shareToken: schema.workflowShares.shareToken,
        expiresAt: schema.workflowShares.expiresAt,
        isRevoked: schema.workflowShares.isRevoked,
        viewCount: schema.workflowShares.viewCount,
        copyCount: schema.workflowShares.copyCount,
        createdAt: schema.workflowShares.createdAt,
      });

    return this.toShareResponse(updatedShare ?? share);
  }

  async getShareByToken(token: string): Promise<AccessibleShareTokenRecord> {
    const share = await this.findShareByTokenOrThrow(token);

    if (share.isRevoked) {
      throw new ShareRevokedException(token);
    }

    if (this.isExpired(share.expiresAt)) {
      throw new ShareExpiredException(token);
    }

    if (!share.publishedVersionId || !share.snapshot) {
      throw new ShareWorkflowNotPublishedException(share.workflowDefinitionId);
    }

    return share as AccessibleShareTokenRecord;
  }

  private async findShareByTokenOrThrow(
    token: string,
  ): Promise<ShareTokenRecord> {
    const [share] = await this.db
      .select({
        id: schema.workflowShares.id,
        workflowDefinitionId: schema.workflowShares.workflowDefinitionId,
        tenantId: schema.workflowShares.tenantId,
        shareToken: schema.workflowShares.shareToken,
        shareType: schema.workflowShares.shareType,
        createdBy: schema.workflowShares.createdBy,
        expiresAt: schema.workflowShares.expiresAt,
        isRevoked: schema.workflowShares.isRevoked,
        viewCount: schema.workflowShares.viewCount,
        copyCount: schema.workflowShares.copyCount,
        createdAt: schema.workflowShares.createdAt,
        updatedAt: schema.workflowShares.updatedAt,
        workflowName: schema.workflowDefinitions.name,
        workflowDescription: schema.workflowDefinitions.description,
        publishedVersionId: schema.workflowDefinitions.publishedVersionId,
        snapshot: schema.workflowVersions.snapshot,
      })
      .from(schema.workflowShares)
      .innerJoin(
        schema.workflowDefinitions,
        eq(
          schema.workflowShares.workflowDefinitionId,
          schema.workflowDefinitions.id,
        ),
      )
      .leftJoin(
        schema.workflowVersions,
        eq(
          schema.workflowDefinitions.publishedVersionId,
          schema.workflowVersions.id,
        ),
      )
      .where(eq(schema.workflowShares.shareToken, token));

    if (!share) {
      throw new ShareNotFoundException(token);
    }

    return share;
  }

  private toShareResponse(share: ShareRecord): ShareResponse {
    return {
      id: share.id,
      workflowDefinitionId: share.workflowDefinitionId,
      shareType: share.shareType,
      shareToken: share.shareToken,
      expiresAt: share.expiresAt,
      isRevoked: share.isRevoked,
      viewCount: share.viewCount,
      copyCount: share.copyCount,
      createdAt: share.createdAt,
      shareUrl: `${this.getBaseUrl()}/s/${share.shareToken}`,
    };
  }

  private getBaseUrl(): string {
    const baseUrl =
      this.configService.get<string>('APP_FRONTEND_URL') ??
      process.env.APP_FRONTEND_URL ??
      'http://localhost:5173';

    return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  }

  private isExpired(expiresAt: Date | null): boolean {
    return expiresAt !== null && expiresAt.getTime() <= Date.now();
  }

  private ensureTenantId(tenantId?: string): asserts tenantId is string {
    if (!tenantId) {
      throw new TenantRequiredException();
    }
  }
}
