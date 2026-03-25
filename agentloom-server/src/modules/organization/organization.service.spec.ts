import { Test } from '@nestjs/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DRIZZLE } from '../../database/database.module';
import { RbacCacheService } from '../../common/services/rbac-cache.service';
import {
  organizationInvitations,
  organizationMembers,
  organizations,
  users,
} from '../../database/schema';
import { OrganizationService } from './organization.service';
import {
  AdminCannotInviteOwnerException,
  AdminCannotRemoveOwnerException,
  AlreadyOrganizationMemberException,
  InvitationExpiredOrUsedException,
  InvitationNotFoundException,
  OrganizationNotFoundException,
  OrganizationSlugConflictException,
  PendingInvitationExistsException,
  SoleOwnerConstraintException,
} from './organization.exceptions';
import { appendSlugSuffix, generateSlug } from './slug.utils';

const mockedModules = vi.hoisted(() => ({
  generateSlug: vi.fn(),
  appendSlugSuffix: vi.fn(),
  randomBytes: vi.fn(),
}));

vi.mock('./slug.utils', () => ({
  generateSlug: mockedModules.generateSlug,
  appendSlugSuffix: mockedModules.appendSlugSuffix,
}));

vi.mock('crypto', () => ({
  randomBytes: mockedModules.randomBytes,
}));

type MockFunction = ReturnType<typeof vi.fn>;
type OrgRole = 'owner' | 'admin' | 'creator' | 'operator' | 'viewer';
type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'cancelled';

interface OrganizationRecord {
  id: string;
  name: string;
  slug: string;
  tenantId: string;
  ownerId: string;
  description: string | null;
  settings: Record<string, unknown> | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface OrganizationMemberRecord {
  id: string;
  organizationId: string;
  userId: string;
  role: OrgRole;
  invitedBy: string | null;
  joinedAt: Date;
}

interface UserRecord {
  id: string;
  supabaseUserId: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  currentOrganizationId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface InvitationRecord {
  id: string;
  organizationId: string;
  email: string;
  role: OrgRole;
  token: string;
  invitedBy: string;
  expiresAt: string;
  status: InvitationStatus;
  acceptedAt: string | null;
  acceptedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface QueryMockGroup {
  organizations: { findFirst: MockFunction };
  organizationMembers: { findFirst: MockFunction };
  organizationInvitations: { findFirst: MockFunction };
  users: { findFirst: MockFunction };
}

interface MockDb {
  query: QueryMockGroup;
  insert: MockFunction;
  update: MockFunction;
  delete: MockFunction;
  select: MockFunction;
  execute: MockFunction;
  from: MockFunction;
  set: MockFunction;
  values: MockFunction;
  where: MockFunction;
  returning: MockFunction;
  transaction: MockFunction;
}

interface TransactionDb {
  query: QueryMockGroup;
  insert: MockFunction;
  update: MockFunction;
  delete: MockFunction;
  select: MockFunction;
}

interface InsertChain {
  values: MockFunction;
  returning: MockFunction;
}

interface UpdateChain {
  set: MockFunction;
  where: MockFunction;
  returning: MockFunction;
}

interface DeleteChain {
  where: MockFunction;
}

interface SelectChain {
  from: MockFunction;
  where: MockFunction;
}

const NOW = new Date('2026-01-01T00:00:00.000Z');
const SUPABASE_USER_ID = 'supabase-user-1';
const USER_ID = 'user-1';
const TARGET_USER_ID = 'user-2';
const ORG_ID = 'org-1';
const INVITATION_ID = 'inv-1';
const TOKEN_BUFFER = Buffer.from('11'.repeat(32), 'hex');
const TOKEN_BASE64URL = TOKEN_BUFFER.toString('base64url');

function createMockDb(): MockDb {
  return {
    query: {
      organizations: { findFirst: vi.fn() },
      organizationMembers: { findFirst: vi.fn() },
      organizationInvitations: { findFirst: vi.fn() },
      users: { findFirst: vi.fn() },
    },
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    select: vi.fn(),
    execute: vi.fn(),
    from: vi.fn(),
    set: vi.fn(),
    values: vi.fn(),
    where: vi.fn(),
    returning: vi.fn(),
    transaction: vi.fn(),
  };
}

function createTransactionDb(): TransactionDb {
  return {
    query: {
      organizations: { findFirst: vi.fn() },
      organizationMembers: { findFirst: vi.fn() },
      organizationInvitations: { findFirst: vi.fn() },
      users: { findFirst: vi.fn() },
    },
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    select: vi.fn(),
  };
}

function createInsertChain(result: unknown[] = []): InsertChain {
  const chain: InsertChain = {
    values: vi.fn(),
    returning: vi.fn().mockResolvedValue(result),
  };
  chain.values.mockReturnValue(chain);
  return chain;
}

function createUpdateChain(result: unknown[] = []): UpdateChain {
  const chain: UpdateChain = {
    set: vi.fn(),
    where: vi.fn(),
    returning: vi.fn().mockResolvedValue(result),
  };
  chain.set.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

function createDeleteChain(result: unknown = undefined): DeleteChain {
  return {
    where: vi.fn().mockResolvedValue(result),
  };
}

function createSelectChain(result: unknown[] = []): SelectChain {
  const chain: SelectChain = {
    from: vi.fn(),
    where: vi.fn().mockResolvedValue(result),
  };
  chain.from.mockReturnValue(chain);
  return chain;
}

function createOrganizationRecord(
  overrides: Partial<OrganizationRecord> = {},
): OrganizationRecord {
  return {
    id: ORG_ID,
    name: 'Acme Team',
    slug: 'acme-team',
    tenantId: 'tenant-1',
    ownerId: USER_ID,
    description: '默认组织描述',
    settings: null,
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function createMemberRecord(
  overrides: Partial<OrganizationMemberRecord> = {},
): OrganizationMemberRecord {
  return {
    id: 'member-1',
    organizationId: ORG_ID,
    userId: USER_ID,
    role: 'owner',
    invitedBy: null,
    joinedAt: NOW,
    ...overrides,
  };
}

function createUserRecord(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: TARGET_USER_ID,
    supabaseUserId: 'supabase-user-2',
    email: 'invitee@example.com',
    displayName: null,
    avatarUrl: null,
    isActive: true,
    currentOrganizationId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function createInvitationRecord(
  overrides: Partial<InvitationRecord> = {},
): InvitationRecord {
  return {
    id: INVITATION_ID,
    organizationId: ORG_ID,
    email: 'invitee@example.com',
    role: 'viewer',
    token: TOKEN_BASE64URL,
    invitedBy: USER_ID,
    expiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    status: 'pending',
    acceptedAt: null,
    acceptedBy: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function setupTransaction(db: MockDb, tx: TransactionDb) {
  db.transaction.mockImplementation(
    async (callback: (transaction: TransactionDb) => Promise<unknown>) =>
      callback(tx),
  );
}

function setupCreateOrganizationTransaction(
  db: MockDb,
  org: OrganizationRecord,
) {
  const tx = createTransactionDb();
  const orgInsertChain = createInsertChain([org]);
  const memberInsertChain = createInsertChain();
  const userUpdateChain = createUpdateChain();

  tx.insert
    .mockReturnValueOnce(orgInsertChain)
    .mockReturnValueOnce(memberInsertChain);
  tx.update.mockReturnValue(userUpdateChain);
  setupTransaction(db, tx);

  return { tx, orgInsertChain, memberInsertChain, userUpdateChain };
}

/** Consumes the first db.query.users.findFirst call for resolveOrBackfillUser */
function setupResolveUser(
  db: MockDb,
  localUserId: string = USER_ID,
  supabaseId: string = SUPABASE_USER_ID,
) {
  const localUser = createUserRecord({
    id: localUserId,
    supabaseUserId: supabaseId,
    email: 'owner@example.com',
  });
  db.query.users.findFirst.mockResolvedValueOnce(localUser);
  return localUser;
}

function setupAcceptInvitationTransaction(
  db: MockDb,
  member: OrganizationMemberRecord,
) {
  const tx = createTransactionDb();
  const invitationUpdateChain = createUpdateChain();
  const memberInsertChain = createInsertChain([member]);

  tx.update.mockReturnValue(invitationUpdateChain);
  tx.insert.mockReturnValue(memberInsertChain);
  setupTransaction(db, tx);

  return { tx, invitationUpdateChain, memberInsertChain };
}

describe('OrganizationService', () => {
  let service: OrganizationService;
  let db: MockDb;
  let rbacCacheService: {
    getUserRole: MockFunction;
    invalidateUserRole: MockFunction;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useRealTimers();

    db = createMockDb();

    const module = await Test.createTestingModule({
      providers: [
        OrganizationService,
        { provide: DRIZZLE, useValue: db },
        {
          provide: RbacCacheService,
          useValue: {
            getUserRole: vi.fn(),
            invalidateUserRole: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get(OrganizationService);
    rbacCacheService = module.get(RbacCacheService);

    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.mocked(generateSlug).mockReturnValue('acme-team');
    vi.mocked(appendSlugSuffix).mockReturnValue('acme-team-abcd');
    mockedModules.randomBytes.mockReturnValue(TOKEN_BUFFER);
  });

  describe('createOrganization', () => {
    it('正常创建组织并返回组织信息', async () => {
      const org = createOrganizationRecord({ description: '新的组织' });
      setupResolveUser(db);
      const { orgInsertChain } = setupCreateOrganizationTransaction(db, org);
      db.query.organizations.findFirst.mockResolvedValue(undefined);

      const result = await service.createOrganization(SUPABASE_USER_ID, {
        name: 'Acme Team',
        description: '新的组织',
      });

      expect(result).toEqual(org);
      expect(generateSlug).toHaveBeenCalledWith('Acme Team');
      expect(db.query.organizations.findFirst).toHaveBeenCalledTimes(1);
      expect(orgInsertChain.values).toHaveBeenCalledWith({
        name: 'Acme Team',
        slug: 'acme-team',
        ownerId: USER_ID,
        description: '新的组织',
      });
    });

    it('slug 冲突时使用 appendSlugSuffix', async () => {
      const org = createOrganizationRecord({ slug: 'acme-team-abcd' });
      setupResolveUser(db);
      const { orgInsertChain } = setupCreateOrganizationTransaction(db, org);
      db.query.organizations.findFirst
        .mockResolvedValueOnce(createOrganizationRecord())
        .mockResolvedValueOnce(undefined);

      const result = await service.createOrganization(SUPABASE_USER_ID, {
        name: 'Acme Team',
        description: '冲突重试',
      });

      expect(result).toEqual(org);
      expect(appendSlugSuffix).toHaveBeenCalledWith('acme-team');
      expect(db.query.organizations.findFirst).toHaveBeenCalledTimes(2);
      expect(orgInsertChain.values).toHaveBeenCalledWith({
        name: 'Acme Team',
        slug: 'acme-team-abcd',
        ownerId: USER_ID,
        description: '冲突重试',
      });
    });

    it('slug 冲突且后缀也冲突时抛出 OrganizationSlugConflictException', async () => {
      setupResolveUser(db);
      db.query.organizations.findFirst
        .mockResolvedValueOnce(createOrganizationRecord())
        .mockResolvedValueOnce(
          createOrganizationRecord({ slug: 'acme-team-abcd' }),
        );

      await expect(
        service.createOrganization(SUPABASE_USER_ID, {
          name: 'Acme Team',
          description: '重复 slug',
        }),
      ).rejects.toBeInstanceOf(OrganizationSlugConflictException);

      expect(appendSlugSuffix).toHaveBeenCalledWith('acme-team');
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('创建时同时创建 owner 成员记录', async () => {
      const org = createOrganizationRecord();
      setupResolveUser(db);
      const { tx, memberInsertChain } = setupCreateOrganizationTransaction(
        db,
        org,
      );
      db.query.organizations.findFirst.mockResolvedValue(undefined);

      await service.createOrganization(SUPABASE_USER_ID, {
        name: 'Acme Team',
        description: '成员写入',
      });

      expect(tx.insert).toHaveBeenNthCalledWith(1, organizations);
      expect(tx.insert).toHaveBeenNthCalledWith(2, organizationMembers);
      expect(memberInsertChain.values).toHaveBeenCalledWith({
        organizationId: org.id,
        userId: USER_ID,
        role: 'owner',
        invitedBy: null,
      });
    });

    it('创建时设置 currentOrganizationId', async () => {
      const org = createOrganizationRecord();
      setupResolveUser(db);
      const { tx, userUpdateChain } = setupCreateOrganizationTransaction(
        db,
        org,
      );
      db.query.organizations.findFirst.mockResolvedValue(undefined);

      await service.createOrganization(SUPABASE_USER_ID, {
        name: 'Acme Team',
        description: '更新当前组织',
      });

      expect(tx.update).toHaveBeenCalledWith(users);
      expect(userUpdateChain.set).toHaveBeenCalledWith({
        currentOrganizationId: org.id,
      });
      expect(userUpdateChain.where).toHaveBeenCalledTimes(1);
    });
  });

  describe('getOrganization', () => {
    it('正常获取组织详情和成员数量', async () => {
      const org = createOrganizationRecord();
      const actor = createMemberRecord();
      const selectChain = createSelectChain([{ count: 2 }]);

      db.query.organizations.findFirst.mockResolvedValue(org);
      db.query.organizationMembers.findFirst.mockResolvedValue(actor);
      db.select.mockReturnValue(selectChain);

      const result = await service.getOrganization(ORG_ID, USER_ID);

      expect(result).toEqual({ ...org, memberCount: 2 });
      expect(db.select).toHaveBeenCalledWith(expect.anything());
      expect(selectChain.from).toHaveBeenCalledWith(organizationMembers);
      expect(selectChain.where).toHaveBeenCalledTimes(1);
    });

    it('组织不存在时抛出 OrganizationNotFoundException', async () => {
      db.query.organizations.findFirst.mockResolvedValue(undefined);

      await expect(
        service.getOrganization(ORG_ID, USER_ID),
      ).rejects.toBeInstanceOf(OrganizationNotFoundException);

      expect(db.query.organizationMembers.findFirst).not.toHaveBeenCalled();
    });

    it('非成员访问时抛出 OrganizationNotFoundException', async () => {
      db.query.organizations.findFirst.mockResolvedValue(
        createOrganizationRecord(),
      );
      db.query.organizationMembers.findFirst.mockResolvedValue(undefined);

      await expect(
        service.getOrganization(ORG_ID, USER_ID),
      ).rejects.toBeInstanceOf(OrganizationNotFoundException);

      expect(db.select).not.toHaveBeenCalled();
    });
  });

  describe('inviteMember', () => {
    it('owner 正常邀请成员', async () => {
      const org = createOrganizationRecord();
      const actor = createMemberRecord({ role: 'owner' });
      const invitation = createInvitationRecord();
      const insertChain = createInsertChain([invitation]);

      db.query.organizations.findFirst.mockResolvedValue(org);
      db.query.organizationMembers.findFirst.mockResolvedValue(actor);
      db.query.organizationInvitations.findFirst.mockResolvedValue(undefined);
      db.query.users.findFirst.mockResolvedValue(undefined);
      db.insert.mockReturnValue(insertChain);

      const result = await service.inviteMember(
        ORG_ID,
        { email: 'invitee@example.com', role: 'viewer' },
        USER_ID,
      );

      expect(result).toEqual(invitation);
      expect(mockedModules.randomBytes).toHaveBeenCalledWith(32);
      expect(db.insert).toHaveBeenCalledWith(organizationInvitations);
      expect(insertChain.values).toHaveBeenCalledWith({
        organizationId: ORG_ID,
        email: 'invitee@example.com',
        role: 'viewer',
        token: TOKEN_BASE64URL,
        invitedBy: USER_ID,
        expiresAt: expect.any(Date),
      });
    });

    it('admin 邀请非 owner 角色成员', async () => {
      const invitation = createInvitationRecord({ role: 'admin' });
      const insertChain = createInsertChain([invitation]);

      db.query.organizations.findFirst.mockResolvedValue(
        createOrganizationRecord(),
      );
      db.query.organizationMembers.findFirst.mockResolvedValue(
        createMemberRecord({ role: 'admin' }),
      );
      db.query.organizationInvitations.findFirst.mockResolvedValue(undefined);
      db.query.users.findFirst.mockResolvedValue(undefined);
      db.insert.mockReturnValue(insertChain);

      const result = await service.inviteMember(
        ORG_ID,
        { email: 'invitee@example.com', role: 'admin' },
        USER_ID,
      );

      expect(result).toEqual(invitation);
      expect(insertChain.values).toHaveBeenCalledWith({
        organizationId: ORG_ID,
        email: 'invitee@example.com',
        role: 'admin',
        token: TOKEN_BASE64URL,
        invitedBy: USER_ID,
        expiresAt: expect.any(Date),
      });
    });

    it('admin 尝试邀请 owner 角色时抛出 AdminCannotInviteOwnerException', async () => {
      db.query.organizations.findFirst.mockResolvedValue(
        createOrganizationRecord(),
      );
      db.query.organizationMembers.findFirst.mockResolvedValue(
        createMemberRecord({ role: 'admin' }),
      );

      await expect(
        service.inviteMember(
          ORG_ID,
          { email: 'invitee@example.com', role: 'owner' },
          USER_ID,
        ),
      ).rejects.toBeInstanceOf(AdminCannotInviteOwnerException);

      expect(db.query.organizationInvitations.findFirst).not.toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('已有待处理邀请时抛出 PendingInvitationExistsException', async () => {
      db.query.organizations.findFirst.mockResolvedValue(
        createOrganizationRecord(),
      );
      db.query.organizationMembers.findFirst.mockResolvedValue(
        createMemberRecord(),
      );
      db.query.organizationInvitations.findFirst.mockResolvedValue(
        createInvitationRecord(),
      );

      await expect(
        service.inviteMember(
          ORG_ID,
          { email: 'invitee@example.com', role: 'viewer' },
          USER_ID,
        ),
      ).rejects.toBeInstanceOf(PendingInvitationExistsException);

      expect(db.query.users.findFirst).not.toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('已是组织成员时抛出 AlreadyOrganizationMemberException', async () => {
      db.query.organizations.findFirst.mockResolvedValue(
        createOrganizationRecord(),
      );
      db.query.organizationMembers.findFirst
        .mockResolvedValueOnce(createMemberRecord({ role: 'owner' }))
        .mockResolvedValueOnce(
          createMemberRecord({ userId: TARGET_USER_ID, role: 'viewer' }),
        );
      db.query.organizationInvitations.findFirst.mockResolvedValue(undefined);
      db.query.users.findFirst.mockResolvedValue(createUserRecord());

      await expect(
        service.inviteMember(
          ORG_ID,
          { email: 'invitee@example.com', role: 'viewer' },
          USER_ID,
        ),
      ).rejects.toBeInstanceOf(AlreadyOrganizationMemberException);

      expect(db.insert).not.toHaveBeenCalled();
    });

    it('组织不存在时抛出 OrganizationNotFoundException', async () => {
      db.query.organizations.findFirst.mockResolvedValue(undefined);

      await expect(
        service.inviteMember(
          ORG_ID,
          { email: 'invitee@example.com', role: 'viewer' },
          USER_ID,
        ),
      ).rejects.toBeInstanceOf(OrganizationNotFoundException);

      expect(db.query.organizationMembers.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('acceptInvitation', () => {
    it('正常接受邀请并创建成员', async () => {
      const invitation = createInvitationRecord({ role: 'admin' });
      const org = createOrganizationRecord();
      const member = createMemberRecord({
        userId: TARGET_USER_ID,
        role: 'admin',
      });
      const { tx, invitationUpdateChain, memberInsertChain } =
        setupAcceptInvitationTransaction(db, member);

      db.query.organizationInvitations.findFirst.mockResolvedValue(invitation);
      db.query.organizationMembers.findFirst.mockResolvedValue(undefined);
      tx.query.organizations.findFirst.mockResolvedValue(org);

      const result = await service.acceptInvitation(
        TOKEN_BASE64URL,
        TARGET_USER_ID,
      );

      expect(result).toEqual({ organization: org, member });
      expect(tx.update).toHaveBeenCalledWith(organizationInvitations);
      expect(invitationUpdateChain.set).toHaveBeenCalledWith({
        status: 'accepted',
        acceptedAt: expect.any(Date),
        acceptedBy: TARGET_USER_ID,
      });
      expect(tx.insert).toHaveBeenCalledWith(organizationMembers);
      expect(memberInsertChain.values).toHaveBeenCalledWith({
        organizationId: ORG_ID,
        userId: TARGET_USER_ID,
        role: 'admin',
        invitedBy: USER_ID,
      });
    });

    it('邀请不存在时抛出 InvitationNotFoundException', async () => {
      db.query.organizationInvitations.findFirst.mockResolvedValue(undefined);

      await expect(
        service.acceptInvitation(TOKEN_BASE64URL, TARGET_USER_ID),
      ).rejects.toBeInstanceOf(InvitationNotFoundException);

      expect(db.query.organizationMembers.findFirst).not.toHaveBeenCalled();
    });

    it('邀请已使用时抛出 InvitationExpiredOrUsedException', async () => {
      db.query.organizationInvitations.findFirst.mockResolvedValue(
        createInvitationRecord({ status: 'accepted' }),
      );

      await expect(
        service.acceptInvitation(TOKEN_BASE64URL, TARGET_USER_ID),
      ).rejects.toBeInstanceOf(InvitationExpiredOrUsedException);

      expect(db.query.organizationMembers.findFirst).not.toHaveBeenCalled();
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('邀请过期时更新状态为 expired 并抛出', async () => {
      const updateChain = createUpdateChain();
      db.query.organizationInvitations.findFirst.mockResolvedValue(
        createInvitationRecord({ expiresAt: '2025-12-31T00:00:00.000Z' }),
      );
      db.update.mockReturnValue(updateChain);

      await expect(
        service.acceptInvitation(TOKEN_BASE64URL, TARGET_USER_ID),
      ).rejects.toBeInstanceOf(InvitationExpiredOrUsedException);

      expect(db.update).toHaveBeenCalledWith(organizationInvitations);
      expect(updateChain.set).toHaveBeenCalledWith({ status: 'expired' });
      expect(updateChain.where).toHaveBeenCalledTimes(1);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('已是成员时抛出 AlreadyOrganizationMemberException', async () => {
      db.query.organizationInvitations.findFirst.mockResolvedValue(
        createInvitationRecord(),
      );
      db.query.organizationMembers.findFirst.mockResolvedValue(
        createMemberRecord({ userId: TARGET_USER_ID }),
      );

      await expect(
        service.acceptInvitation(TOKEN_BASE64URL, TARGET_USER_ID),
      ).rejects.toBeInstanceOf(AlreadyOrganizationMemberException);

      expect(db.transaction).not.toHaveBeenCalled();
    });
  });

  describe('updateMemberRole', () => {
    it('owner 正常更新成员角色', async () => {
      const updatedMember = createMemberRecord({
        userId: TARGET_USER_ID,
        role: 'admin',
      });
      const updateChain = createUpdateChain([updatedMember]);

      db.query.organizations.findFirst.mockResolvedValue(
        createOrganizationRecord(),
      );
      db.query.organizationMembers.findFirst.mockResolvedValueOnce(
        createMemberRecord({ userId: TARGET_USER_ID, role: 'viewer' }),
      );
      db.update.mockReturnValue(updateChain);

      const result = await service.updateMemberRole(
        ORG_ID,
        TARGET_USER_ID,
        { role: 'admin' },
        USER_ID,
      );

      expect(result).toEqual(updatedMember);
      expect(db.update).toHaveBeenCalledWith(organizationMembers);
      expect(updateChain.set).toHaveBeenCalledWith({ role: 'admin' });
      expect(updateChain.returning).toHaveBeenCalledTimes(1);
      expect(rbacCacheService.invalidateUserRole).toHaveBeenCalledWith(
        createOrganizationRecord().tenantId,
        TARGET_USER_ID,
      );
    });

    it('唯一 owner 降级时抛出 SoleOwnerConstraintException', async () => {
      const selectChain = createSelectChain([{ count: 1 }]);

      db.query.organizations.findFirst.mockResolvedValue(
        createOrganizationRecord(),
      );
      db.query.organizationMembers.findFirst.mockResolvedValueOnce(
        createMemberRecord({ role: 'owner' }),
      );
      db.select.mockReturnValue(selectChain);

      await expect(
        service.updateMemberRole(ORG_ID, USER_ID, { role: 'admin' }, USER_ID),
      ).rejects.toBeInstanceOf(SoleOwnerConstraintException);

      expect(db.select).toHaveBeenCalledTimes(1);
      expect(selectChain.from).toHaveBeenCalledWith(organizationMembers);
      expect(db.update).not.toHaveBeenCalled();
    });
  });

  describe('removeMember', () => {
    it('管理员移除普通成员（事务 + 清除 currentOrganizationId）', async () => {
      const tx = createTransactionDb();
      const deleteChain = createDeleteChain();
      const updateChain = createUpdateChain();

      db.query.organizations.findFirst.mockResolvedValue(
        createOrganizationRecord(),
      );
      db.query.organizationMembers.findFirst
        .mockResolvedValueOnce(
          createMemberRecord({ userId: TARGET_USER_ID, role: 'viewer' }),
        )
        .mockResolvedValueOnce(createMemberRecord({ role: 'admin' }));
      tx.delete.mockReturnValue(deleteChain);
      tx.update.mockReturnValue(updateChain);
      setupTransaction(db, tx);

      await expect(
        service.removeMember(ORG_ID, TARGET_USER_ID, USER_ID),
      ).resolves.toBeUndefined();

      expect(db.transaction).toHaveBeenCalledTimes(1);
      expect(tx.delete).toHaveBeenCalledWith(organizationMembers);
      expect(deleteChain.where).toHaveBeenCalledTimes(1);
      expect(tx.update).toHaveBeenCalledWith(users);
      expect(updateChain.set).toHaveBeenCalledWith({
        currentOrganizationId: null,
      });
      expect(rbacCacheService.invalidateUserRole).toHaveBeenCalledWith(
        createOrganizationRecord().tenantId,
        TARGET_USER_ID,
      );
    });

    it('成员自行退出', async () => {
      const tx = createTransactionDb();
      const deleteChain = createDeleteChain();
      const updateChain = createUpdateChain();

      db.query.organizations.findFirst.mockResolvedValue(
        createOrganizationRecord(),
      );
      db.query.organizationMembers.findFirst.mockResolvedValue(
        createMemberRecord({ userId: USER_ID, role: 'viewer' }),
      );
      tx.delete.mockReturnValue(deleteChain);
      tx.update.mockReturnValue(updateChain);
      setupTransaction(db, tx);

      await expect(
        service.removeMember(ORG_ID, USER_ID, USER_ID),
      ).resolves.toBeUndefined();

      expect(db.query.organizationMembers.findFirst).toHaveBeenCalledTimes(1);
      expect(db.transaction).toHaveBeenCalledTimes(1);
      expect(tx.delete).toHaveBeenCalledWith(organizationMembers);
      expect(tx.update).toHaveBeenCalledWith(users);
      expect(rbacCacheService.invalidateUserRole).toHaveBeenCalledWith(
        createOrganizationRecord().tenantId,
        USER_ID,
      );
    });

    it('admin 尝试移除 owner 时抛出 AdminCannotRemoveOwnerException', async () => {
      db.query.organizations.findFirst.mockResolvedValue(
        createOrganizationRecord(),
      );
      db.query.organizationMembers.findFirst
        .mockResolvedValueOnce(
          createMemberRecord({ userId: TARGET_USER_ID, role: 'owner' }),
        )
        .mockResolvedValueOnce(createMemberRecord({ role: 'admin' }));

      await expect(
        service.removeMember(ORG_ID, TARGET_USER_ID, USER_ID),
      ).rejects.toBeInstanceOf(AdminCannotRemoveOwnerException);

      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('唯一 owner 退出时抛出 SoleOwnerConstraintException', async () => {
      const selectChain = createSelectChain([{ count: 1 }]);

      db.query.organizations.findFirst.mockResolvedValue(
        createOrganizationRecord(),
      );
      db.query.organizationMembers.findFirst.mockResolvedValue(
        createMemberRecord({ userId: USER_ID, role: 'owner' }),
      );
      db.select.mockReturnValue(selectChain);

      await expect(
        service.removeMember(ORG_ID, USER_ID, USER_ID),
      ).rejects.toBeInstanceOf(SoleOwnerConstraintException);

      expect(db.select).toHaveBeenCalledTimes(1);
      expect(db.transaction).not.toHaveBeenCalled();
    });
  });
});
