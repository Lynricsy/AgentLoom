import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, and, sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { apiKeys, organizations } from '../../database/schema';
import { EncryptionService } from './encryption.service';
import {
  ApiKeyNotFoundException,
  ApiKeyLimitExceededException,
  ApiKeyRevokedException,
} from './api-key.exceptions';
import type { ApiKeyResponseDto } from './dto/api-key-response.dto';
import type { CreateApiKeyDto } from './dto/create-api-key.dto';
import type { RotateApiKeyDto } from './dto/rotate-api-key.dto';
import type { ApiKey } from '../../database/schema';

const MAX_API_KEYS_PER_TENANT = 50;

@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name);

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly encryptionService: EncryptionService,
  ) {}

  async create(
    dto: CreateApiKeyDto,
    userId: string,
    tenantId: string,
  ): Promise<ApiKeyResponseDto> {
    const existingCount = await this.countByTenant(tenantId);
    if (existingCount >= MAX_API_KEYS_PER_TENANT) {
      throw new ApiKeyLimitExceededException();
    }

    const [org] = await this.tenantDb
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.tenantId, tenantId));

    const keyPreview = this.createKeyPreview(dto.apiKey);
    const encrypted = this.encryptionService.encrypt(dto.apiKey);

    const [created] = await this.tenantDb
      .insert(apiKeys)
      .values({
        tenantId,
        organizationId: org.id,
        userId,
        provider: dto.provider,
        label: dto.label,
        keyPreview,
        encryptedKey: encrypted.encryptedKey,
        encryptedDek: encrypted.encryptedDek,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
      })
      .returning();

    this.logAuditEvent('create', userId, created.id, tenantId);

    return this.toResponseDto(created);
  }

  async findAllByTenant(tenantId: string): Promise<ApiKeyResponseDto[]> {
    const keys = await this.tenantDb
      .select({
        id: apiKeys.id,
        provider: apiKeys.provider,
        label: apiKeys.label,
        keyPreview: apiKeys.keyPreview,
        status: apiKeys.status,
        lastUsedAt: apiKeys.lastUsedAt,
        rotatedAt: apiKeys.rotatedAt,
        expiresAt: apiKeys.expiresAt,
        createdAt: apiKeys.createdAt,
        updatedAt: apiKeys.updatedAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.tenantId, tenantId));

    return keys.map((key) => this.toResponseDto(key));
  }

  async rotate(
    id: string,
    dto: RotateApiKeyDto,
    tenantId: string,
    actorId: string,
  ): Promise<ApiKeyResponseDto> {
    const existing = await this.findByIdOrThrow(id, tenantId);
    if (existing.status === 'revoked') {
      throw new ApiKeyRevokedException(id);
    }

    const keyPreview = this.createKeyPreview(dto.apiKey);
    const rotatedAt = new Date();
    const encrypted = this.encryptionService.encrypt(dto.apiKey);

    const [updated] = await this.tenantDb
      .update(apiKeys)
      .set({
        keyPreview,
        encryptedKey: encrypted.encryptedKey,
        encryptedDek: encrypted.encryptedDek,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        rotatedAt,
        updatedAt: rotatedAt,
      })
      .where(
        and(eq(apiKeys.id, existing.id), eq(apiKeys.tenantId, tenantId)),
      )
      .returning();

    this.logAuditEvent('rotate', actorId, updated.id, tenantId);

    return this.toResponseDto(updated);
  }

  async revoke(
    id: string,
    tenantId: string,
    actorId: string,
  ): Promise<ApiKeyResponseDto> {
    await this.findByIdOrThrow(id, tenantId);

    const [revoked] = await this.tenantDb
      .update(apiKeys)
      .set({
        status: 'revoked',
        encryptedKey: null,
        encryptedDek: null,
        iv: null,
        authTag: null,
        updatedAt: new Date(),
      })
      .where(and(eq(apiKeys.id, id), eq(apiKeys.tenantId, tenantId)))
      .returning();

    this.logAuditEvent('revoke', actorId, revoked.id, tenantId);

    return this.toResponseDto(revoked);
  }

  async updateLastUsedAt(id: string): Promise<void> {
    await this.tenantDb
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, id));
  }

  async findByIdInternal(
    id: string,
    tenantId: string,
  ): Promise<ApiKey | undefined> {
    const [key] = await this.tenantDb
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.id, id), eq(apiKeys.tenantId, tenantId)));

    return key;
  }

  private async findByIdOrThrow(
    id: string,
    tenantId: string,
  ): Promise<ApiKey> {
    const key = await this.findByIdInternal(id, tenantId);
    if (!key) {
      throw new ApiKeyNotFoundException(id);
    }
    return key;
  }

  private async countByTenant(tenantId: string): Promise<number> {
    const [result] = await this.tenantDb
      .select({ count: sql<number>`count(*)::int` })
      .from(apiKeys)
      .where(eq(apiKeys.tenantId, tenantId));

    return result?.count ?? 0;
  }

  private toResponseDto(
    key: Partial<ApiKey> & {
      id: string;
      provider: string;
      label: string;
      keyPreview: string;
      status: string;
      rotatedAt?: Date | null;
      createdAt: Date;
      updatedAt: Date;
    },
  ): ApiKeyResponseDto {
    return {
      id: key.id,
      provider: key.provider as ApiKeyResponseDto['provider'],
      label: key.label,
      keyPreview: key.keyPreview,
      status: key.status as ApiKeyResponseDto['status'],
      lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
      rotatedAt: key.rotatedAt?.toISOString() ?? null,
      expiresAt: key.expiresAt?.toISOString() ?? null,
      createdAt: key.createdAt.toISOString(),
      updatedAt: key.updatedAt.toISOString(),
    };
  }

  private createKeyPreview(apiKey: string): string {
    return `${apiKey.slice(0, 3)}...${apiKey.slice(-4)}`;
  }

  private logAuditEvent(
    action: 'create' | 'rotate' | 'revoke',
    actorId: string,
    keyId: string,
    tenantId: string,
  ): void {
    this.logger.log(
      `API Key 审计 ${JSON.stringify({
        action,
        actorId,
        keyId,
        tenantId,
        timestamp: new Date().toISOString(),
      })}`,
    );
  }
}
