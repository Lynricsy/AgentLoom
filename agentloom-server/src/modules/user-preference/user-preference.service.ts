import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { userPreferences } from '../../database/schema';
import type { UserPreference } from '../../database/schema';
import type { UpdateUserPreferenceDto } from './dto';
import {
  toUserPreferenceResponse,
  type UserPreferenceResponseDto,
} from './dto';

@Injectable()
export class UserPreferenceService {
  private readonly logger = new Logger(UserPreferenceService.name);

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /**
   * 查找用户偏好设置，不存在返回 null
   */
  async findByUser(
    userId: string,
    tenantId: string,
  ): Promise<UserPreference | null> {
    const [row] = await this.tenantDb
      .select()
      .from(userPreferences)
      .where(
        and(
          eq(userPreferences.userId, userId),
          eq(userPreferences.tenantId, tenantId),
        ),
      );

    return row ?? null;
  }

  /**
   * 获取用户偏好设置，不存在时自动创建默认记录
   */
  async getOrCreate(
    userId: string,
    tenantId: string,
  ): Promise<UserPreferenceResponseDto> {
    const existing = await this.findByUser(userId, tenantId);
    if (existing) {
      return toUserPreferenceResponse(existing);
    }

    this.logger.log(
      `为用户创建默认偏好设置 ${JSON.stringify({ userId, tenantId })}`,
    );

    const [created] = await this.tenantDb
      .insert(userPreferences)
      .values({
        userId,
        tenantId,
        preferences: {},
      })
      .onConflictDoNothing({
        target: [userPreferences.userId, userPreferences.tenantId],
      })
      .returning();

    // onConflictDoNothing 可能不返回行（并发创建时），此时重新查询
    if (!created) {
      const [refetched] = await this.tenantDb
        .select()
        .from(userPreferences)
        .where(
          and(
            eq(userPreferences.userId, userId),
            eq(userPreferences.tenantId, tenantId),
          ),
        );
      return toUserPreferenceResponse(refetched);
    }

    return toUserPreferenceResponse(created);
  }

  /**
   * 更新用户偏好设置（upsert 语义）
   */
  async upsert(
    userId: string,
    tenantId: string,
    dto: UpdateUserPreferenceDto,
  ): Promise<UserPreferenceResponseDto> {
    const now = new Date();

    // 构建更新字段集
    const updateFields: Record<string, unknown> = { updatedAt: now };
    if (dto.titleModelConfigId !== undefined) {
      updateFields.titleModelConfigId = dto.titleModelConfigId;
    }
    if (dto.preferences !== undefined) {
      updateFields.preferences = dto.preferences;
    }

    const [upserted] = await this.tenantDb
      .insert(userPreferences)
      .values({
        userId,
        tenantId,
        titleModelConfigId: dto.titleModelConfigId ?? undefined,
        preferences: dto.preferences ?? {},
      })
      .onConflictDoUpdate({
        target: [userPreferences.userId, userPreferences.tenantId],
        set: updateFields,
      })
      .returning();

    this.logger.log(
      `用户偏好设置已更新 ${JSON.stringify({ userId, tenantId, preferenceId: upserted.id })}`,
    );

    return toUserPreferenceResponse(upserted);
  }
}
