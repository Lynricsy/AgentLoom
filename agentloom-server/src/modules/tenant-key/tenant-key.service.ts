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
  TenantKeyNotFoundException,
  TenantKeyRevokedException,
  TenantOrganizationNotFoundException,
} from './exceptions/tenant-key.exceptions';
import { computeKeyFingerprint, validateRsaPublicKey } from './rsa-key-utils';

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

    const [created] = await this.tenantDb
      .insert(tenantEncryptionKeys)
      .values({
        organizationId: orgId,
        tenantId,
        publicKey: dto.publicKey,
        keyFingerprint,
        status: 'active',
      })
      .returning();

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

    validateRsaPublicKey(dto.publicKey);
    const keyFingerprint = computeKeyFingerprint(dto.publicKey);
    const rotatedAt = new Date();

    const [rotatingKey] = await this.tenantDb
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
        ),
      )
      .returning();

    if (!rotatingKey) {
      throw new TenantKeyNotFoundException(keyId);
    }

    try {
      const [created] = await this.tenantDb
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

      if (!created) {
        throw new TenantKeyNotFoundException(keyId);
      }

      this.logger.log(
        JSON.stringify({
          action: 'tenant_key_rotated',
          previousKeyId: rotatingKey.id,
          newKeyId: created.id,
          tenantId,
        }),
      );

      return created;
    } catch (error) {
      await this.tenantDb
        .update(tenantEncryptionKeys)
        .set({
          status: existingKey.status,
          rotatedAt: existingKey.rotatedAt,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(tenantEncryptionKeys.id, keyId),
            eq(tenantEncryptionKeys.tenantId, tenantId),
          ),
        );

      throw error;
    }
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
}
