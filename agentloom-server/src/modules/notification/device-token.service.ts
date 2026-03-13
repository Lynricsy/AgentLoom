import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { deviceTokens } from '../../database/schema';

@Injectable()
export class DeviceTokenService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async register(userId: string, deviceToken: string, platform: string) {
    const [record] = await this.db
      .insert(deviceTokens)
      .values({
        userId,
        deviceToken,
        platform,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [deviceTokens.userId, deviceTokens.deviceToken],
        set: {
          platform,
          isActive: true,
          updatedAt: new Date(),
        },
      })
      .returning();

    return record;
  }

  async unregister(userId: string, deviceToken: string): Promise<void> {
    await this.db
      .update(deviceTokens)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(deviceTokens.userId, userId),
          eq(deviceTokens.deviceToken, deviceToken),
        ),
      );
  }

  async findActiveByUserId(
    userId: string,
  ): Promise<Array<{ deviceToken: string; platform: string }>> {
    return this.db
      .select({
        deviceToken: deviceTokens.deviceToken,
        platform: deviceTokens.platform,
      })
      .from(deviceTokens)
      .where(
        and(eq(deviceTokens.userId, userId), eq(deviceTokens.isActive, true)),
      );
  }

  async deactivateTokens(tokens: string[]): Promise<void> {
    if (tokens.length === 0) {
      return;
    }

    await this.db
      .update(deviceTokens)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(inArray(deviceTokens.deviceToken, tokens));
  }
}
