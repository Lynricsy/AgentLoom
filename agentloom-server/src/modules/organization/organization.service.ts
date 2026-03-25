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
  OrganizationSlugConflictException,
  InvitationNotFoundException,
  InvitationExpiredOrUsedException,
  PendingInvitationExistsException,
  AlreadyOrganizationMemberException,
  SoleOwnerConstraintException,
  AdminCannotInviteOwnerException,
  AdminCannotRemoveOwnerException,
} from './organization.exceptions';
import { generateSlug, appendSlugSuffix } from './slug.utils';
import type { CreateOrganizationDto } from './dto/create-organization.dto';
import type { InviteMemberDto } from './dto/invite-member.dto';
import type { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { RbacCacheService } from '../../common/services/rbac-cache.service';

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

      await tx
        .update(users)
        .set({ currentOrganizationId: org.id })
        .where(eq(users.id, localUser.id));

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

    return inserted ?? await this.db.query.users.findFirst({
      where: eq(users.supabaseUserId, supabaseUserId),
    });
  }

  async getOrganization(orgId: string, userId: string) {
    const org = await this.tenantDb.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
    });

    if (!org) {
      throw new OrganizationNotFoundException();
    }

    const member = await this.tenantDb.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.organizationId, orgId),
        eq(organizationMembers.userId, userId),
      ),
    });

    if (!member) {
      throw new OrganizationNotFoundException();
    }

    const [memberCountResult] = await this.tenantDb
      .select({ count: sql<number>`count(*)` })
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, orgId));

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

      const organization = await tx.query.organizations.findFirst({
        where: eq(organizations.id, invitation.organizationId),
      });

      return { organization: organization!, member };
    });
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

    const target = await this.tenantDb.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.organizationId, orgId),
        eq(organizationMembers.userId, targetUserId),
      ),
    });

    if (!target) {
      throw new OrganizationNotFoundException();
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

    const target = await this.tenantDb.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.organizationId, orgId),
        eq(organizationMembers.userId, targetUserId),
      ),
    });

    if (!target) {
      throw new OrganizationNotFoundException();
    }

    if (actorUserId !== targetUserId) {
      const actor = await this.tenantDb.query.organizationMembers.findFirst({
        where: and(
          eq(organizationMembers.organizationId, orgId),
          eq(organizationMembers.userId, actorUserId),
        ),
      });

      if (actor?.role === 'admin' && target.role === 'owner') {
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
