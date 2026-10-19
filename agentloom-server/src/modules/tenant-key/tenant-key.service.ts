import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';

import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import {
  tenantEncryptionKeys,
  type TenantEncryptionKey,
} from '../../database/schema';
import type { UploadPublicKeyDto } from './dto/tenant-key.dto';
import {
  TenantKeyAlreadyExistsException,
  TenantKeyFingerprintConflictException,
  TenantKeyNotActiveException,
  TenantKeyNotFoundException,
  TenantKeyRevokedException,
  TenantOrganizationNotFoundException,
} from './exceptions/tenant-key.exceptions';
import { computeKeyFingerprint, validateRsaPublicKey } from './rsa-key-utils';
import { getPostgresConstraintName } from '../../common/utils/postgres-error.utils';

@Injectable()
export class TenantKeyService {
  private readonly logger = new Logger(TenantKeyService.name);

  @Inject(DRIZZLE)
  private readonly db!: DrizzleDB;

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  async uploadPublicKey(
    tenantId: string,
    orgId: string,
    dto: UploadPublicKeyDto,
  ): Promise<TenantEncryptionKey> {
    // 控制器之外也可能直接调用服务，必须在构造 SQL 前阻断缺失组织 ID。
    this.assertOrganizationId(tenantId, orgId);
    validateRsaPublicKey(dto.publicKey);
    const keyFingerprint = computeKeyFingerprint(dto.publicKey);

    const existingActiveKey = await this.getActiveKey(tenantId, orgId);
    if (existingActiveKey) {
      throw new TenantKeyAlreadyExistsException(orgId);
    }

    await this.assertFingerprintUnused(tenantId, orgId, keyFingerprint);

    // savepoint 内插入：并发冲突只回滚这一步，不中止请求事务，便于映射为 409
    const created = await this.runUniqueGuarded(orgId, keyFingerprint, (db) =>
      db
        .insert(tenantEncryptionKeys)
        .values({
          organizationId: orgId,
          tenantId,
          publicKey: dto.publicKey,
          keyFingerprint,
          status: 'active',
        })
        .returning()
        .then(([row]) => row),
    );

    this.logger.log(
      JSON.stringify({
        action: 'tenant_key_uploaded',
        keyId: created.id,
        tenantId,
        orgId,
      }),
    );

    return created;
  }

  async findByOrg(
    tenantId: string,
    orgId: string,
  ): Promise<TenantEncryptionKey[]> {
    // 防御性校验保证缺失 claim 不会退化成 DrizzleQueryError 500。
    this.assertOrganizationId(tenantId, orgId);
    return this.tenantDb
      .select()
      .from(tenantEncryptionKeys)
      .where(
        and(
          eq(tenantEncryptionKeys.tenantId, tenantId),
          eq(tenantEncryptionKeys.organizationId, orgId),
        ),
      )
      .orderBy(
        sql`CASE ${tenantEncryptionKeys.status}
            WHEN 'active' THEN 0
            WHEN 'rotating' THEN 1
            ELSE 2
          END`,
        desc(tenantEncryptionKeys.updatedAt),
        desc(tenantEncryptionKeys.createdAt),
      );
  }

  async findById(
    tenantId: string,
    keyId: string,
  ): Promise<TenantEncryptionKey> {
    const [key] = await this.tenantDb
      .select()
      .from(tenantEncryptionKeys)
      .where(
        and(
          eq(tenantEncryptionKeys.id, keyId),
          eq(tenantEncryptionKeys.tenantId, tenantId),
        ),
      );

    if (!key) {
      throw new TenantKeyNotFoundException(keyId);
    }

    return key;
  }

  async rotateKey(
    tenantId: string,
    keyId: string,
    dto: UploadPublicKeyDto,
  ): Promise<TenantEncryptionKey> {
    const existingKey = await this.findById(tenantId, keyId);

    if (existingKey.status === 'revoked') {
      throw new TenantKeyRevokedException(keyId);
    }

    // 已在轮换中的旧 key 已有新的 active key，再轮换会违反「每组织一个 active」
    if (existingKey.status !== 'active') {
      throw new TenantKeyNotActiveException(keyId, existingKey.status);
    }

    validateRsaPublicKey(dto.publicKey);
    const keyFingerprint = computeKeyFingerprint(dto.publicKey);
    await this.assertFingerprintUnused(
      tenantId,
      existingKey.organizationId,
      keyFingerprint,
    );
    const rotatedAt = new Date();

    // 旧 key 置 rotating 与插入新 key 在同一 savepoint 内，冲突时一起回滚
    const { rotatingKey, created } = await this.runUniqueGuarded(
      existingKey.organizationId,
      keyFingerprint,
      async (db) => {
        const [rotating] = await db
          .update(tenantEncryptionKeys)
          .set({
            status: 'rotating',
            rotatedAt,
            updatedAt: rotatedAt,
          })
          .where(
            and(
              eq(tenantEncryptionKeys.id, keyId),
              eq(tenantEncryptionKeys.tenantId, tenantId),
              eq(tenantEncryptionKeys.status, 'active'),
            ),
          )
          .returning();

        if (!rotating) {
          throw new TenantKeyNotActiveException(keyId, existingKey.status);
        }

        const [inserted] = await db
          .insert(tenantEncryptionKeys)
          .values({
            organizationId: existingKey.organizationId,
            tenantId,
            publicKey: dto.publicKey,
            keyFingerprint,
            status: 'active',
            activatedAt: rotatedAt,
          })
          .returning();

        return { rotatingKey: rotating, created: inserted };
      },
    );

    this.logger.log(
      JSON.stringify({
        action: 'tenant_key_rotated',
        previousKeyId: rotatingKey.id,
        newKeyId: created.id,
        tenantId,
      }),
    );

    return created;
  }

  async revokeKey(
    tenantId: string,
    keyId: string,
  ): Promise<TenantEncryptionKey> {
    const existingKey = await this.findById(tenantId, keyId);

    if (existingKey.status === 'revoked') {
      throw new TenantKeyRevokedException(keyId);
    }

    const revokedAt = new Date();

    const [updated] = await this.tenantDb
      .update(tenantEncryptionKeys)
      .set({
        status: 'revoked',
        revokedAt,
        updatedAt: revokedAt,
      })
      .where(
        and(
          eq(tenantEncryptionKeys.id, keyId),
          eq(tenantEncryptionKeys.tenantId, tenantId),
        ),
      )
      .returning();

    if (!updated) {
      throw new TenantKeyNotFoundException(keyId);
    }

    this.logger.log(
      JSON.stringify({
        action: 'tenant_key_revoked',
        keyId: updated.id,
        tenantId,
      }),
    );

    return updated;
  }

  async getActiveKey(
    tenantId: string,
    orgId: string,
  ): Promise<TenantEncryptionKey | null> {
    // 活跃密钥查询会被上传流程复用，入口处校验可确保所有调用方都 fail-closed。
    this.assertOrganizationId(tenantId, orgId);
    const [key] = await this.tenantDb
      .select()
      .from(tenantEncryptionKeys)
      .where(
        and(
          eq(tenantEncryptionKeys.tenantId, tenantId),
          eq(tenantEncryptionKeys.organizationId, orgId),
          eq(tenantEncryptionKeys.status, 'active'),
        ),
      );

    return key ?? null;
  }

  private assertOrganizationId(tenantId: string, orgId: string): void {
    if (!orgId) {
      throw new TenantOrganizationNotFoundException(tenantId);
    }
  }

  /** (组织, 指纹) 唯一：轮换或撤销过的公钥也不能再次登记 */
  private async assertFingerprintUnused(
    tenantId: string,
    orgId: string,
    keyFingerprint: string,
  ): Promise<void> {
    const [existing] = await this.tenantDb
      .select({ id: tenantEncryptionKeys.id })
      .from(tenantEncryptionKeys)
      .where(
        and(
          eq(tenantEncryptionKeys.tenantId, tenantId),
          eq(tenantEncryptionKeys.organizationId, orgId),
          eq(tenantEncryptionKeys.keyFingerprint, keyFingerprint),
        ),
      )
      .limit(1);

    if (existing) {
      throw new TenantKeyFingerprintConflictException(keyFingerprint);
    }
  }

  /**
   * 在嵌套事务（请求事务内即 savepoint）中执行写入，并把两个唯一索引冲突映射为 409。
   * 直接在请求事务里撞唯一约束会中止整个事务，之后的任何补偿语句都会失败。
   */
  private async runUniqueGuarded<T>(
    orgId: string,
    keyFingerprint: string,
    operation: (db: DrizzleDB) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.tenantDb.transaction((tx) =>
        operation(tx as unknown as DrizzleDB),
      );
    } catch (error) {
      const constraint = getPostgresConstraintName(error, '23505');
      if (constraint === 'uq_tenant_encryption_keys_org_fingerprint') {
        throw new TenantKeyFingerprintConflictException(keyFingerprint);
      }
      if (constraint === 'uq_tenant_encryption_keys_org_active') {
        throw new TenantKeyAlreadyExistsException(orgId);
      }
      throw error;
    }
  }
}
