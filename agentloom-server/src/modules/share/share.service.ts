import * as crypto from 'crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, sql } from 'drizzle-orm';

import { TenantRequiredException } from '../../common/exceptions/auth.exceptions';
import { DomainException } from '../../common/exceptions/domain.exception';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import * as schema from '../../database/schema';
import type { AgentRuntimeMode } from '../../database/schema/agent-definitions.schema';
import { AgentNotFoundException } from '../agent-definition/agent-definition.exceptions';
import { WorkflowNotFoundException } from '../workflow-definition/workflow-version.exceptions';
import type { CreateAgentShareDto } from './dto/create-agent-share.dto';
import { CreateAgentShareSchema } from './dto/create-agent-share.dto';
import type { CreateShareDto } from './dto/create-share.dto';
import { CreateShareSchema } from './dto/create-share.dto';
import type { QueryAgentShareDto } from './dto/query-agent-share.dto';
import { QueryAgentShareSchema } from './dto/query-agent-share.dto';
import type { QueryShareDto } from './dto/query-share.dto';
import { QueryShareSchema } from './dto/query-share.dto';
import type {
  PublicAgentShareResponse,
  PublicShareResponse,
  PublicWorkflowShareResponse,
  ShareAuthorResponse,
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

type WorkflowShareRecord = Pick<
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
  | 'createdBy'
>;

type AgentShareRecord = Pick<
  schema.AgentShare,
  | 'id'
  | 'agentDefinitionId'
  | 'shareType'
  | 'shareToken'
  | 'expiresAt'
  | 'isRevoked'
  | 'viewCount'
  | 'copyCount'
  | 'createdAt'
  | 'createdBy'
>;

interface WorkflowShareTokenRecord extends schema.WorkflowShare {
  workflowName: string;
  workflowDescription: string | null;
  publishedVersionId: string | null;
  snapshot: schema.WorkflowVersionSnapshot | null;
  authorDisplayName: string | null;
  authorEmail: string | null;
  authorAvatarUrl: string | null;
}

interface AgentShareTokenRecord extends schema.AgentShare {
  agentName: string;
  agentDescription: string | null;
  agentRuntimeMode: AgentRuntimeMode;
  publishedVersionId: string | null;
  snapshot: schema.AgentVersionSnapshot | null;
  authorDisplayName: string | null;
  authorEmail: string | null;
  authorAvatarUrl: string | null;
}

export interface AccessibleWorkflowShareTokenRecord extends Omit<
  WorkflowShareTokenRecord,
  'publishedVersionId' | 'snapshot'
> {
  publishedVersionId: string;
  snapshot: schema.WorkflowVersionSnapshot;
}

export interface AccessibleAgentShareTokenRecord extends Omit<
  AgentShareTokenRecord,
  'publishedVersionId' | 'snapshot'
> {
  publishedVersionId: string;
  snapshot: schema.AgentVersionSnapshot;
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
        name: schema.workflowDefinitions.name,
        description: schema.workflowDefinitions.description,
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
        createdBy: schema.workflowShares.createdBy,
      });

    return this.toWorkflowShareResponse(
      createdShare,
      workflow.name,
      workflow.description,
    );
  }

  async createAgentShare(
    tenantId: string,
    userId: string,
    dto: CreateAgentShareDto,
  ): Promise<ShareResponse> {
    this.ensureTenantId(tenantId);

    const parsedDto = CreateAgentShareSchema.parse(dto);
    const [agent] = await this.tenantDb
      .select({
        id: schema.agentDefinitions.id,
        name: schema.agentDefinitions.name,
        description: schema.agentDefinitions.description,
        publishedVersionId: schema.agentDefinitions.publishedVersionId,
      })
      .from(schema.agentDefinitions)
      .where(
        and(
          eq(schema.agentDefinitions.id, parsedDto.agent_definition_id),
          eq(schema.agentDefinitions.tenantId, tenantId),
        ),
      );

    if (!agent) {
      throw new AgentNotFoundException(parsedDto.agent_definition_id);
    }

    if (!agent.publishedVersionId) {
      throw new DomainException({
        type: 'https://agentloom.dev/errors/share-agent-not-published',
        title: 'Agent 尚未发布',
        status: HttpStatus.CONFLICT,
        detail: `Agent ${parsedDto.agent_definition_id} 尚未发布，无法创建或访问分享链接`,
      });
    }

    const shareToken = crypto.randomBytes(32).toString('hex');
    const [createdShare] = await this.db
      .insert(schema.agentShares)
      .values({
        agentDefinitionId: parsedDto.agent_definition_id,
        tenantId,
        shareToken,
        shareType: parsedDto.share_type,
        createdBy: userId,
        expiresAt: parsedDto.expires_at ? new Date(parsedDto.expires_at) : null,
      })
      .returning({
        id: schema.agentShares.id,
        agentDefinitionId: schema.agentShares.agentDefinitionId,
        shareType: schema.agentShares.shareType,
        shareToken: schema.agentShares.shareToken,
        expiresAt: schema.agentShares.expiresAt,
        isRevoked: schema.agentShares.isRevoked,
        viewCount: schema.agentShares.viewCount,
        copyCount: schema.agentShares.copyCount,
        createdAt: schema.agentShares.createdAt,
        createdBy: schema.agentShares.createdBy,
      });

    return this.toAgentShareResponse(
      createdShare,
      agent.name,
      agent.description,
    );
  }

  async findSharesByWorkflow(
    tenantId: string,
    dto: QueryShareDto,
  ): Promise<{
    data: ShareResponse[];
    meta: { page: number; pageSize: number; total: number; totalPages: number };
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
          createdBy: schema.workflowShares.createdBy,
          title: schema.workflowDefinitions.name,
          description: schema.workflowDefinitions.description,
        })
        .from(schema.workflowShares)
        .innerJoin(
          schema.workflowDefinitions,
          eq(
            schema.workflowShares.workflowDefinitionId,
            schema.workflowDefinitions.id,
          ),
        )
        .where(whereClause)
        .orderBy(desc(schema.workflowShares.createdAt))
        .limit(page_size)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.workflowShares)
        .where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;

    return {
      data: shares.map((share) =>
        this.toWorkflowShareResponse(share, share.title, share.description),
      ),
      meta: {
        page,
        pageSize: page_size,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / page_size),
      },
    };
  }

  async findSharesByAgent(
    tenantId: string,
    dto: QueryAgentShareDto,
  ): Promise<{
    data: ShareResponse[];
    meta: { page: number; pageSize: number; total: number; totalPages: number };
  }> {
    this.ensureTenantId(tenantId);

    const parsedDto = QueryAgentShareSchema.parse(dto);
    const { page, page_size, agent_definition_id } = parsedDto;
    const offset = (page - 1) * page_size;

    const conditions = [eq(schema.agentShares.tenantId, tenantId)];

    if (agent_definition_id) {
      conditions.push(
        eq(schema.agentShares.agentDefinitionId, agent_definition_id),
      );
    }

    const whereClause = and(...conditions);

    const [shares, countResult] = await Promise.all([
      this.db
        .select({
          id: schema.agentShares.id,
          agentDefinitionId: schema.agentShares.agentDefinitionId,
          shareType: schema.agentShares.shareType,
          shareToken: schema.agentShares.shareToken,
          expiresAt: schema.agentShares.expiresAt,
          isRevoked: schema.agentShares.isRevoked,
          viewCount: schema.agentShares.viewCount,
          copyCount: schema.agentShares.copyCount,
          createdAt: schema.agentShares.createdAt,
          createdBy: schema.agentShares.createdBy,
          title: schema.agentDefinitions.name,
          description: schema.agentDefinitions.description,
        })
        .from(schema.agentShares)
        .innerJoin(
          schema.agentDefinitions,
          eq(schema.agentShares.agentDefinitionId, schema.agentDefinitions.id),
        )
        .where(whereClause)
        .orderBy(desc(schema.agentShares.createdAt))
        .limit(page_size)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.agentShares)
        .where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;

    return {
      data: shares.map((share) =>
        this.toAgentShareResponse(share, share.title, share.description),
      ),
      meta: {
        page,
        pageSize: page_size,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / page_size),
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

  async revokeAgentShare(tenantId: string, shareId: string): Promise<void> {
    this.ensureTenantId(tenantId);

    const [revokedShare] = await this.db
      .update(schema.agentShares)
      .set({
        isRevoked: true,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.agentShares.id, shareId),
          eq(schema.agentShares.tenantId, tenantId),
        ),
      )
      .returning({ id: schema.agentShares.id });

    if (!revokedShare) {
      throw new ShareNotFoundException(shareId);
    }
  }

  async getPublicShare(token: string): Promise<PublicShareResponse> {
    const workflowShare = await this.findWorkflowShareByTokenRaw(token);
    if (workflowShare) {
      const share = this.assertAccessibleWorkflowShare(workflowShare, token);

      await this.db
        .update(schema.workflowShares)
        .set({
          viewCount: sql`${schema.workflowShares.viewCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(schema.workflowShares.id, share.id));

      return this.toPublicWorkflowShareResponse(share, token);
    }

    const agentShare = await this.findAgentShareByTokenRaw(token);
    if (agentShare) {
      const share = this.assertAccessibleAgentShare(agentShare, token);

      await this.db
        .update(schema.agentShares)
        .set({
          viewCount: sql`${schema.agentShares.viewCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(schema.agentShares.id, share.id));

      return this.toPublicAgentShareResponse(share, token);
    }

    throw new ShareNotFoundException(token);
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
        createdBy: schema.workflowShares.createdBy,
      });

    return this.toWorkflowShareResponse(
      updatedShare ?? share,
      share.workflowName,
      share.workflowDescription,
    );
  }

  async getShareByToken(
    token: string,
  ): Promise<AccessibleWorkflowShareTokenRecord> {
    const share = await this.findWorkflowShareByTokenRaw(token);
    if (!share) {
      throw new ShareNotFoundException(token);
    }

    return this.assertAccessibleWorkflowShare(share, token);
  }

  async getAgentShareByToken(
    token: string,
  ): Promise<AccessibleAgentShareTokenRecord> {
    const share = await this.findAgentShareByTokenRaw(token);
    if (!share) {
      throw new ShareNotFoundException(token);
    }

    return this.assertAccessibleAgentShare(share, token);
  }

  private async findWorkflowShareByTokenRaw(
    token: string,
  ): Promise<WorkflowShareTokenRecord | null> {
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
        authorDisplayName: sql<string>`coalesce(${schema.users.displayName}, ${schema.users.email})`,
        authorEmail: schema.users.email,
        authorAvatarUrl: schema.users.avatarUrl,
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
      .leftJoin(
        schema.users,
        eq(schema.workflowShares.createdBy, schema.users.id),
      )
      .where(eq(schema.workflowShares.shareToken, token));

    return share ?? null;
  }

  private async findAgentShareByTokenRaw(
    token: string,
  ): Promise<AgentShareTokenRecord | null> {
    const [share] = await this.db
      .select({
        id: schema.agentShares.id,
        agentDefinitionId: schema.agentShares.agentDefinitionId,
        tenantId: schema.agentShares.tenantId,
        shareToken: schema.agentShares.shareToken,
        shareType: schema.agentShares.shareType,
        createdBy: schema.agentShares.createdBy,
        expiresAt: schema.agentShares.expiresAt,
        isRevoked: schema.agentShares.isRevoked,
        viewCount: schema.agentShares.viewCount,
        copyCount: schema.agentShares.copyCount,
        createdAt: schema.agentShares.createdAt,
        updatedAt: schema.agentShares.updatedAt,
        agentName: schema.agentDefinitions.name,
        agentDescription: schema.agentDefinitions.description,
        agentRuntimeMode: schema.agentDefinitions.runtimeMode,
        publishedVersionId: schema.agentDefinitions.publishedVersionId,
        snapshot: schema.agentVersions.snapshot,
        authorDisplayName: sql<string>`coalesce(${schema.users.displayName}, ${schema.users.email})`,
        authorEmail: schema.users.email,
        authorAvatarUrl: schema.users.avatarUrl,
      })
      .from(schema.agentShares)
      .innerJoin(
        schema.agentDefinitions,
        eq(schema.agentShares.agentDefinitionId, schema.agentDefinitions.id),
      )
      .leftJoin(
        schema.agentVersions,
        eq(schema.agentDefinitions.publishedVersionId, schema.agentVersions.id),
      )
      .leftJoin(schema.users, eq(schema.agentShares.createdBy, schema.users.id))
      .where(eq(schema.agentShares.shareToken, token));

    return share ?? null;
  }

  private assertAccessibleWorkflowShare(
    share: WorkflowShareTokenRecord,
    token: string,
  ): AccessibleWorkflowShareTokenRecord {
    if (share.isRevoked) {
      throw new ShareRevokedException(token);
    }

    if (share.expiresAt && share.expiresAt.getTime() <= Date.now()) {
      throw new ShareExpiredException(token);
    }

    if (!share.publishedVersionId || !share.snapshot) {
      throw new ShareWorkflowNotPublishedException(share.workflowDefinitionId);
    }

    return share as AccessibleWorkflowShareTokenRecord;
  }

  private assertAccessibleAgentShare(
    share: AgentShareTokenRecord,
    token: string,
  ): AccessibleAgentShareTokenRecord {
    if (share.isRevoked) {
      throw new ShareRevokedException(token);
    }

    if (share.expiresAt && share.expiresAt.getTime() <= Date.now()) {
      throw new ShareExpiredException(token);
    }

    if (!share.publishedVersionId || !share.snapshot) {
      throw new DomainException({
        type: 'https://agentloom.dev/errors/share-agent-not-published',
        title: 'Agent 尚未发布',
        status: HttpStatus.CONFLICT,
        detail: `Agent ${share.agentDefinitionId} 尚未发布，无法访问分享链接`,
      });
    }

    return share as AccessibleAgentShareTokenRecord;
  }

  private toWorkflowShareResponse(
    share: WorkflowShareRecord,
    title: string,
    description: string | null,
  ): ShareResponse {
    return {
      id: share.id,
      resourceType: 'workflow',
      resourceId: share.workflowDefinitionId,
      workflowDefinitionId: share.workflowDefinitionId,
      shareType: share.shareType,
      shareToken: share.shareToken,
      expiresAt: share.expiresAt,
      isRevoked: share.isRevoked,
      viewCount: share.viewCount,
      copyCount: share.copyCount,
      createdAt: share.createdAt,
      createdBy: share.createdBy,
      title,
      description,
      shareUrl: `${this.getBaseUrl()}/s/${share.shareToken}`,
    } as ShareResponse;
  }

  private toAgentShareResponse(
    share: AgentShareRecord,
    title: string,
    description: string | null,
  ): ShareResponse {
    return {
      id: share.id,
      resourceType: 'agent',
      resourceId: share.agentDefinitionId,
      agentDefinitionId: share.agentDefinitionId,
      shareType: share.shareType,
      shareToken: share.shareToken,
      expiresAt: share.expiresAt,
      isRevoked: share.isRevoked,
      viewCount: share.viewCount,
      copyCount: share.copyCount,
      createdAt: share.createdAt,
      createdBy: share.createdBy,
      title,
      description,
      shareUrl: `${this.getBaseUrl()}/s/${share.shareToken}`,
    } as ShareResponse;
  }

  private buildAuthor(
    displayName: string | null,
    email: string | null,
    avatarUrl: string | null,
  ): ShareAuthorResponse {
    return {
      displayName: displayName ?? email ?? '未知作者',
      email: email ?? null,
      avatarUrl: avatarUrl ?? null,
    };
  }

  private toPublicWorkflowShareResponse(
    share: AccessibleWorkflowShareTokenRecord,
    token: string,
  ): PublicWorkflowShareResponse {
    return {
      token,
      resourceType: 'workflow',
      workflowDefinitionId: share.workflowDefinitionId,
      workflowName: share.workflowName,
      workflowDescription: share.workflowDescription,
      title: share.workflowName,
      description: share.workflowDescription,
      shareType: share.shareType,
      author: this.buildAuthor(
        share.authorDisplayName,
        share.authorEmail,
        share.authorAvatarUrl,
      ),
      definition: {
        nodes: share.snapshot.nodes,
        edges: share.snapshot.edges,
        viewport: share.snapshot.viewport ?? DEFAULT_VIEWPORT,
      },
      nodeCount: share.snapshot.nodes.length,
      edgeCount: share.snapshot.edges.length,
      createdAt: share.createdAt,
      expiresAt: share.expiresAt,
    };
  }

  private toPublicAgentShareResponse(
    share: AccessibleAgentShareTokenRecord,
    token: string,
  ): PublicAgentShareResponse {
    const metadata = asRecord(share.snapshot.metadata) ?? {};
    const inputSchema = asRecord(metadata.inputSchema);
    const metadataSandboxLifecycle = metadata.sandboxLifecycle;
    const sandboxLifecycle =
      metadataSandboxLifecycle === 'session' ||
      metadataSandboxLifecycle === 'persistent'
        ? metadataSandboxLifecycle
        : share.snapshot.sandboxConfig?.lifecycleMode === 'session' ||
            share.snapshot.sandboxConfig?.lifecycleMode === 'persistent'
          ? share.snapshot.sandboxConfig.lifecycleMode
          : null;

    return {
      token,
      resourceType: 'agent',
      agentDefinitionId: share.agentDefinitionId,
      agentName: share.agentName,
      agentDescription: share.agentDescription,
      title: share.agentName,
      description: share.agentDescription,
      shareType: share.shareType,
      author: this.buildAuthor(
        share.authorDisplayName,
        share.authorEmail,
        share.authorAvatarUrl,
      ),
      definition: {
        nodes: share.snapshot.nodes,
        edges: share.snapshot.edges,
        viewport: share.snapshot.viewport ?? DEFAULT_VIEWPORT,
      },
      nodeCount: share.snapshot.nodes.length,
      edgeCount: share.snapshot.edges.length,
      createdAt: share.createdAt,
      expiresAt: share.expiresAt,
      runtimeMode: share.agentRuntimeMode,
      inputSchema,
      sandboxLifecycle,
    };
  }

  private getBaseUrl(): string {
    const baseUrl =
      this.configService.get<string>('APP_FRONTEND_URL') ??
      this.configService.get<string>('APP_BASE_URL') ??
      process.env.APP_FRONTEND_URL ??
      'http://localhost:5173';

    return baseUrl.replace(/\/+$/, '');
  }

  private ensureTenantId(
    tenantId: string | undefined,
  ): asserts tenantId is string {
    if (!tenantId) {
      throw new TenantRequiredException();
    }
  }
}
