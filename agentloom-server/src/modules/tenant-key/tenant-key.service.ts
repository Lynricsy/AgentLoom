import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

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
} from './exceptions/tenant-key.exceptions';
import {
  computeKeyFingerprint,
  validateRsaPublicKey,
} from './rsa-key-utils';

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

  async findByOrg(tenantId: string, orgId: string): Promise<TenantEncryptionKey[]> {
    return this.tenantDb
      .select()
      .from(tenantEncryptionKeys)
      .where(
        and(
          eq(tenantEncryptionKeys.tenantId, tenantId),
          eq(tenantEncryptionKeys.organizationId, orgId),
        ),
      );
  }

  async findById(tenantId: string, keyId: string): Promise<TenantEncryptionKey> {
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

    const [updated] = await this.tenantDb
      .update(tenantEncryptionKeys)
      .set({
        publicKey: dto.publicKey,
        keyFingerprint,
        status: 'active',
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

    if (!updated) {
      throw new TenantKeyNotFoundException(keyId);
    }

    this.logger.log(
      JSON.stringify({
        action: 'tenant_key_rotated',
        keyId: updated.id,
        tenantId,
      }),
    );

    return updated;
  }

  async revokeKey(tenantId: string, keyId: string): Promise<TenantEncryptionKey> {
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
}
