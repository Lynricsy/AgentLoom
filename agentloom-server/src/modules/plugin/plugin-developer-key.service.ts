import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq } from 'drizzle-orm';

import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import {
  pluginDeveloperKeys,
  type PluginDeveloperKey,
} from '../../database/schema/plugin-developer-keys.schema';
import {
  QueryDeveloperKeysSchema,
  type DeveloperKeyStatusDto,
  type QueryDeveloperKeysDtoType,
} from './dto/plugin-developer-key.dto';
import {
  PluginDeveloperKeyInvalidException,
  PluginDeveloperKeyNotFoundException,
} from './plugin.exceptions';
import { PluginSignatureService } from './plugin-signature.service';

type ListDeveloperKeysOptions = QueryDeveloperKeysDtoType;

type DeveloperKeyListResult = {
  data: PluginDeveloperKey[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
};

@Injectable()
export class PluginDeveloperKeyService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly signatureService: PluginSignatureService,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  async registerKey(
    tenantId: string,
    orgId: string,
    userId: string,
    publicKeyPem: string,
    label?: string,
  ): Promise<PluginDeveloperKey> {
    this.signatureService.validatePublicKey(publicKeyPem);

    const keyFingerprint = this.signatureService.computeKeyFingerprint(publicKeyPem);

    const [existing] = await this.tenantDb
      .select()
      .from(pluginDeveloperKeys)
      .where(
        and(
          eq(pluginDeveloperKeys.orgId, orgId),
          eq(pluginDeveloperKeys.keyFingerprint, keyFingerprint),
        ),
      )
      .limit(1);

    if (existing) {
      throw new PluginDeveloperKeyInvalidException(
        `指纹为 "${keyFingerprint.slice(0, 16)}..." 的密钥已注册。`,
      );
    }

    const [created] = await this.tenantDb
      .insert(pluginDeveloperKeys)
      .values({
        tenantId,
        orgId,
        userId,
        publicKey: publicKeyPem,
        keyFingerprint,
        label,
      })
      .returning();

    return created;
  }

  async listKeys(
    orgId: string,
    options?: Partial<ListDeveloperKeysOptions>,
  ): Promise<DeveloperKeyListResult> {
    const parsedOptions = QueryDeveloperKeysSchema.parse(options ?? {});
    const page = parsedOptions.page;
    const pageSize = parsedOptions.pageSize;
    const offset = (page - 1) * pageSize;

    const conditions = [eq(pluginDeveloperKeys.orgId, orgId)];
    if (parsedOptions.status) {
      conditions.push(eq(pluginDeveloperKeys.status, parsedOptions.status));
    }

    const whereClause = and(...conditions);

    const [keys, countRows] = await Promise.all([
      this.tenantDb
        .select()
        .from(pluginDeveloperKeys)
        .where(whereClause)
        .orderBy(desc(pluginDeveloperKeys.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.tenantDb
        .select({ total: count() })
        .from(pluginDeveloperKeys)
        .where(whereClause),
    ]);

    const total = Number(countRows[0]?.total ?? 0);

    return {
      data: keys,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findById(orgId: string, keyId: string): Promise<PluginDeveloperKey> {
    const [key] = await this.tenantDb
      .select()
      .from(pluginDeveloperKeys)
      .where(
        and(eq(pluginDeveloperKeys.id, keyId), eq(pluginDeveloperKeys.orgId, orgId)),
      )
      .limit(1);

    if (!key) {
      throw new PluginDeveloperKeyNotFoundException(keyId);
    }

    return key;
  }

  async revokeKey(orgId: string, keyId: string): Promise<PluginDeveloperKey> {
    const key = await this.findById(orgId, keyId);

    if (key.status === 'revoked') {
      throw new PluginDeveloperKeyInvalidException('该密钥已被撤销。');
    }

    const revokedAt = new Date();

    const [updated] = await this.tenantDb
      .update(pluginDeveloperKeys)
      .set({
        status: 'revoked',
        revokedAt,
        updatedAt: revokedAt,
      })
      .where(
        and(eq(pluginDeveloperKeys.id, keyId), eq(pluginDeveloperKeys.orgId, orgId)),
      )
      .returning();

    if (!updated) {
      throw new PluginDeveloperKeyNotFoundException(keyId);
    }

    return updated;
  }

  async findActiveKeyByFingerprint(
    orgId: string,
    fingerprint: string,
  ): Promise<PluginDeveloperKey | null> {
    const [key] = await this.tenantDb
      .select()
      .from(pluginDeveloperKeys)
      .where(
        and(
          eq(pluginDeveloperKeys.orgId, orgId),
          eq(pluginDeveloperKeys.keyFingerprint, fingerprint),
          eq(pluginDeveloperKeys.status, 'active' satisfies DeveloperKeyStatusDto),
        ),
      )
      .limit(1);

    return key ?? null;
  }
}
