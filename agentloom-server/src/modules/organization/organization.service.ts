import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import {
  organizations,
  organizationMembers,
  organizationInvitations,
  users,
} from '../../database/schema';
import {
  OrganizationNotFoundException,
  OrganizationMemberNotFoundException,
  OrganizationSlugConflictException,
  InvitationNotFoundException,
  InvitationEmailMismatchException,
  InvitationExpiredOrUsedException,
  PendingInvitationExistsException,
  AlreadyOrganizationMemberException,
  SoleOwnerConstraintException,
  AdminCannotInviteOwnerException,
  AdminCannotGrantOwnerException,
  AdminCannotRemoveOwnerException,
} from './organization.exceptions';
import { generateSlug, appendSlugSuffix } from './slug.utils';
import type { CreateOrganizationDto } from './dto/create-organization.dto';
import type { InviteMemberDto } from './dto/invite-member.dto';
import type { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { RbacCacheService } from '../../common/services/rbac-cache.service';
import { AuditLogService } from '../evidence/audit-log.service';

const INVITATION_EXPIRY_DAYS = 7;

@Injectable()
export class OrganizationService {
  private readonly logger = new Logger(OrganizationService.name);

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly rbacCacheService: RbacCacheService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async createOrganization(userId: string, dto: CreateOrganizationDto) {
    // userId 来自 JWT sub（auth.users.id），需要解析为 public.users.id
    // 新注册用户可能还没有 public.users 行（通过 Supabase GoTrue 直接注册时）
    const localUser = await this.resolveOrBackfillUser(userId);

    let slug = generateSlug(dto.name);

    // 使用 base DB 而非 tenantDb，因为新用户还没有 tenant 上下文
    const existingOrg = await this.db.query.organizations.findFirst({
      where: eq(organizations.slug, slug),
    });

    if (existingOrg) {
      slug = appendSlugSuffix(slug);
      const stillExists = await this.db.query.organizations.findFirst({
        where: eq(organizations.slug, slug),
      });
      if (stillExists) {
        throw new OrganizationSlugConflictException(slug);
      }
    }

    return await this.db.transaction(async (tx) => {
      const [org] = await tx
        .insert(organizations)
        .values({
          name: dto.name,
          slug,
          ownerId: localUser.id,
          description: dto.description,
        })
        .returning();

      await tx.insert(organizationMembers).values({
        organizationId: org.id,
        userId: localUser.id,
        role: 'owner',
        invitedBy: null,
      });

      // 已属于其他组织的用户同样允许新建，并切换到新组织（与接受邀请一致）：
      // custom_access_token_hook 按 current_organization_id 签发下一次刷新的 tenant claim
      await tx
        .update(users)
        .set({ currentOrganizationId: org.id })
        .where(eq(users.id, localUser.id));

      // 审计记录属于新组织租户，而请求事务处在创建者原组织的租户上下文（或没有租户），
      // 必须随组织在同一事务内写入，不能交给 HTTP 审计拦截器
      await this.auditLogService.recordWithin(tx as unknown as DrizzleDB, {
        tenantId: org.tenantId,
        actorId: localUser.id,
        actorType: 'user',
        eventType: 'organization.created',
        resourceType: 'organization',
        resourceId: org.id,
        summary: 'Organization created',
        after: { ...org },
      });

      return org;
    });
  }

  private async resolveOrBackfillUser(supabaseUserId: string) {
    const existing = await this.db.query.users.findFirst({
      where: eq(users.supabaseUserId, supabaseUserId),
    });
    if (existing) return existing;

    const [authRow] = await this.db.execute<{ email: string }>(
      sql`SELECT email FROM auth.users WHERE id = ${supabaseUserId}`,
    );
    if (!authRow) {
      throw new OrganizationNotFoundException();
    }

    const [inserted] = await this.db
      .insert(users)
      .values({
        supabaseUserId,
        email: authRow.email,
      })
      .onConflictDoNothing()
      .returning();

    return (
      inserted ??
      (await this.db.query.users.findFirst({
        where: eq(users.supabaseUserId, supabaseUserId),
      }))
    );
  }

  async getCurrentOrganization(tenantId: string, userId: string) {
    const org = await this.tenantDb.query.organizations.findFirst({
      where: eq(organizations.tenantId, tenantId),
    });

    if (!org) {
      throw new OrganizationNotFoundException();
    }

    return this.getOrganizationDetails(org, userId);
  }

  async getOrganization(orgId: string, userId: string) {
    const org = await this.tenantDb.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
    });

    if (!org) {
      throw new OrganizationNotFoundException();
    }

    return this.getOrganizationDetails(org, userId);
  }

  private async getOrganizationDetails<T extends { id: string }>(
    org: T,
    userId: string,
  ) {
    const member = await this.tenantDb.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.organizationId, org.id),
        eq(organizationMembers.userId, userId),
      ),
    });

    if (!member) {
      throw new OrganizationNotFoundException();
    }

    const [memberCountResult] = await this.tenantDb
      .select({ count: sql<number>`count(*)` })
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, org.id));

    return { ...org, memberCount: Number(memberCountResult.count) };
  }

  async inviteMember(
    orgId: string,
    dto: InviteMemberDto,
    invitedByUserId: string,
  ) {
    const org = await this.tenantDb.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
    });
    if (!org) {
      throw new OrganizationNotFoundException();
    }

    const actor = await this.tenantDb.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.organizationId, orgId),
        eq(organizationMembers.userId, invitedByUserId),
      ),
    });

    if (actor?.role === 'admin' && dto.role === 'owner') {
      throw new AdminCannotInviteOwnerException();
    }

    const existingInvitation =
      await this.tenantDb.query.organizationInvitations.findFirst({
        where: and(
          eq(organizationInvitations.organizationId, orgId),
          eq(organizationInvitations.email, dto.email),
          eq(organizationInvitations.status, 'pending'),
        ),
      });

    if (existingInvitation) {
      throw new PendingInvitationExistsException(dto.email);
    }

    const existingUser = await this.tenantDb.query.users.findFirst({
      where: eq(users.email, dto.email),
    });

    if (existingUser) {
      const existingMember =
        await this.tenantDb.query.organizationMembers.findFirst({
          where: and(
            eq(organizationMembers.organizationId, orgId),
            eq(organizationMembers.userId, existingUser.id),
          ),
        });
      if (existingMember) {
        throw new AlreadyOrganizationMemberException();
      }
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    );

    const [invitation] = await this.tenantDb
      .insert(organizationInvitations)
      .values({
        organizationId: orgId,
        email: dto.email,
        role: dto.role,
        token,
        invitedBy: invitedByUserId,
        expiresAt,
      })
      .returning();

    return invitation;
  }

  async acceptInvitation(token: string, userId: string) {
    const invitation =
      await this.tenantDb.query.organizationInvitations.findFirst({
        where: eq(organizationInvitations.token, token),
      });

    if (!invitation) {
      throw new InvitationNotFoundException();
    }

    if (invitation.status !== 'pending') {
      throw new InvitationExpiredOrUsedException();
    }

    if (new Date(invitation.expiresAt) < new Date()) {
      await this.tenantDb
        .update(organizationInvitations)
        .set({ status: 'expired' })
        .where(eq(organizationInvitations.id, invitation.id));
      throw new InvitationExpiredOrUsedException();
    }

    // 邀请只对受邀邮箱有效：链接一旦外泄，其他登录用户不能凭 token 以该角色加入
    const acceptingUser = await this.tenantDb.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (
      !acceptingUser ||
      acceptingUser.email.trim().toLowerCase() !==
        invitation.email.trim().toLowerCase()
    ) {
      throw new InvitationEmailMismatchException();
    }

    const existingMember =
      await this.tenantDb.query.organizationMembers.findFirst({
        where: and(
          eq(organizationMembers.organizationId, invitation.organizationId),
          eq(organizationMembers.userId, userId),
        ),
      });

    if (existingMember) {
      throw new AlreadyOrganizationMemberException();
    }

    return await this.tenantDb.transaction(async (tx) => {
      await tx
        .update(organizationInvitations)
        .set({
          status: 'accepted',
          acceptedAt: new Date(),
          acceptedBy: userId,
        })
        .where(eq(organizationInvitations.id, invitation.id));

      const [member] = await tx
        .insert(organizationMembers)
        .values({
          organizationId: invitation.organizationId,
          userId,
          role: invitation.role,
          invitedBy: invitation.invitedBy,
        })
        .returning();

      // 接受邀请即切换到该组织：custom_access_token_hook 依赖
      // users.current_organization_id 推导 tenant_id/tenant_role claim，Studio 接受后
      // refreshSession 拿到新组织的 token。已有组织的用户同样切换——接受邀请是明确意图，
      // 否则新成员在没有组织切换器的情况下永远进不了该组织。
      await tx
        .update(users)
        .set({ currentOrganizationId: invitation.organizationId })
        .where(eq(users.id, userId));

      const organization = await tx.query.organizations.findFirst({
        where: eq(organizations.id, invitation.organizationId),
      });

      return { organization: organization!, member };
    });
  }

  async listMembers(orgId: string) {
    const org = await this.tenantDb.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
    });
    if (!org) {
      throw new OrganizationNotFoundException();
    }

    return this.tenantDb
      .select({
        userId: organizationMembers.userId,
        email: users.email,
        displayName: users.displayName,
        role: organizationMembers.role,
        createdAt: organizationMembers.joinedAt,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .where(eq(organizationMembers.organizationId, orgId));
  }

  async updateMemberRole(
    orgId: string,
    targetUserId: string,
    dto: UpdateMemberRoleDto,
    actorUserId: string,
  ) {
    const org = await this.tenantDb.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
    });
    if (!org) {
      throw new OrganizationNotFoundException();
    }

    const target = await this.findMember(orgId, targetUserId);

    if (!target) {
      throw new OrganizationMemberNotFoundException();
    }

    // 只有 owner 能授予 owner 或改动其他 owner；admin 只能在 owner 以下的角色之间调整
    const actor =
      actorUserId === targetUserId
        ? target
        : await this.findMember(orgId, actorUserId);
    if (actor?.role !== 'owner') {
      if (target.role === 'owner') {
        throw new AdminCannotRemoveOwnerException();
      }
      if (dto.role === 'owner') {
        throw new AdminCannotGrantOwnerException();
      }
    }

    if (target.role === 'owner' && dto.role !== 'owner') {
      await this.verifySoleOwnerConstraint(orgId);
    }

    const [updated] = await this.tenantDb
      .update(organizationMembers)
      .set({ role: dto.role })
      .where(
        and(
          eq(organizationMembers.organizationId, orgId),
          eq(organizationMembers.userId, targetUserId),
        ),
      )
      .returning();

    await this.rbacCacheService.invalidateUserRole(org.tenantId, targetUserId);

    return updated;
  }

  async removeMember(orgId: string, targetUserId: string, actorUserId: string) {
    const org = await this.tenantDb.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
    });
    if (!org) {
      throw new OrganizationNotFoundException();
    }

    const target = await this.findMember(orgId, targetUserId);

    if (!target) {
      throw new OrganizationMemberNotFoundException();
    }

    if (actorUserId !== targetUserId && target.role === 'owner') {
      const actor = await this.findMember(orgId, actorUserId);
      if (actor?.role !== 'owner') {
        throw new AdminCannotRemoveOwnerException();
      }
    }

    if (target.role === 'owner') {
      await this.verifySoleOwnerConstraint(orgId);
    }

    await this.tenantDb.transaction(async (tx) => {
      await tx
        .delete(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, orgId),
            eq(organizationMembers.userId, targetUserId),
          ),
        );

      await tx
        .update(users)
        .set({ currentOrganizationId: null })
        .where(
          and(
            eq(users.id, targetUserId),
            eq(users.currentOrganizationId, orgId),
          ),
        );
    });

    await this.rbacCacheService.invalidateUserRole(org.tenantId, targetUserId);
  }

  private findMember(orgId: string, userId: string) {
    return this.tenantDb.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.organizationId, orgId),
        eq(organizationMembers.userId, userId),
      ),
    });
  }

  private async verifySoleOwnerConstraint(orgId: string) {
    const ownerCount = await this.tenantDb
      .select({ count: sql<number>`count(*)` })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, orgId),
          eq(organizationMembers.role, 'owner'),
        ),
      );

    if (Number(ownerCount[0].count) <= 1) {
      throw new SoleOwnerConstraintException();
    }
  }
}
