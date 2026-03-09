import { Inject, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import * as schema from '../../database/schema';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import {
  NOTIFICATION_DISPATCH_JOB,
  NOTIFICATION_QUEUE,
  type NotificationDispatchJobData,
} from './notification.constants';

export interface CreateNotificationInput {
  userId: string;
  type: schema.Notification['type'];
  title: string;
  body?: schema.NewNotification['body'];
}

export interface ListNotificationsQuery {
  page: number;
  pageSize: number;
  isRead?: boolean;
}

export interface UpsertNotificationPreferenceInput {
  type: schema.NotificationPreference['type'];
  channel: string;
  enabled: boolean;
}

@Injectable()
export class NotificationService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    @InjectQueue(NOTIFICATION_QUEUE)
    private readonly notificationQueue: Queue<NotificationDispatchJobData>,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  async create(
    tenantId: string,
    data: CreateNotificationInput,
  ): Promise<schema.Notification> {
    const [notification] = await this.tenantDb
      .insert(schema.notifications)
      .values({
        tenantId,
        userId: data.userId,
        type: data.type,
        title: data.title,
        body: data.body,
      })
      .returning();

    await this.notificationQueue.add(
      NOTIFICATION_DISPATCH_JOB,
      {
        tenantId,
        userId: data.userId,
        notificationId: notification.id,
        type: data.type,
      },
      {
        jobId: notification.id,
      },
    );

    return notification;
  }

  async findAll(
    tenantId: string,
    userId: string,
    query: ListNotificationsQuery,
  ): Promise<{
    data: schema.Notification[];
    meta: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  }> {
    const whereClause = this.buildNotificationWhereClause(
      tenantId,
      userId,
      query.isRead,
    );
    const offset = (query.page - 1) * query.pageSize;

    const [data, countResult] = await Promise.all([
      this.tenantDb
        .select()
        .from(schema.notifications)
        .where(whereClause)
        .orderBy(desc(schema.notifications.createdAt))
        .limit(query.pageSize)
        .offset(offset),
      this.tenantDb
        .select({ total: sql<number>`count(*)::int` })
        .from(schema.notifications)
        .where(whereClause),
    ]);

    const total = countResult[0]?.total ?? 0;

    return {
      data,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
      },
    };
  }

  async markAsRead(
    tenantId: string,
    userId: string,
    notificationId: string,
  ): Promise<schema.Notification | null> {
    const [notification] = await this.tenantDb
      .update(schema.notifications)
      .set({
        isRead: true,
      })
      .where(
        and(
          eq(schema.notifications.id, notificationId),
          eq(schema.notifications.userId, userId),
          eq(schema.notifications.tenantId, tenantId),
        ),
      )
      .returning();

    return notification ?? null;
  }

  async markAllAsRead(
    tenantId: string,
    userId: string,
  ): Promise<{ updatedCount: number }> {
    const updatedRows = await this.tenantDb
      .update(schema.notifications)
      .set({
        isRead: true,
      })
      .where(
        and(
          eq(schema.notifications.userId, userId),
          eq(schema.notifications.tenantId, tenantId),
        ),
      )
      .returning({ id: schema.notifications.id });

    return { updatedCount: updatedRows.length };
  }

  async getUnreadCount(
    tenantId: string,
    userId: string,
  ): Promise<{ count: number }> {
    const [result] = await this.tenantDb
      .select({ count: count(schema.notifications.id) })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.tenantId, tenantId),
          eq(schema.notifications.userId, userId),
          eq(schema.notifications.isRead, false),
        ),
      );

    return { count: Number(result?.count ?? 0) };
  }

  async getPreferences(
    tenantId: string,
    userId: string,
  ): Promise<schema.NotificationPreference[]> {
    return this.tenantDb
      .select()
      .from(schema.notificationPreferences)
      .where(
        and(
          eq(schema.notificationPreferences.tenantId, tenantId),
          eq(schema.notificationPreferences.userId, userId),
        ),
      )
      .orderBy(
        schema.notificationPreferences.type,
        schema.notificationPreferences.channel,
      );
  }

  async upsertPreference(
    tenantId: string,
    userId: string,
    data: UpsertNotificationPreferenceInput,
  ): Promise<schema.NotificationPreference> {
    const [preference] = await this.tenantDb
      .insert(schema.notificationPreferences)
      .values({
        tenantId,
        userId,
        type: data.type,
        channel: data.channel,
        enabled: data.enabled,
      })
      .onConflictDoUpdate({
        target: [
          schema.notificationPreferences.userId,
          schema.notificationPreferences.tenantId,
          schema.notificationPreferences.type,
          schema.notificationPreferences.channel,
        ],
        set: {
          enabled: data.enabled,
        },
      })
      .returning();

    return preference;
  }

  async getById(
    tenantId: string,
    userId: string,
    notificationId: string,
  ): Promise<schema.Notification | null> {
    const [notification] = await this.tenantDb
      .select()
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.id, notificationId),
          eq(schema.notifications.userId, userId),
          eq(schema.notifications.tenantId, tenantId),
        ),
      );

    return notification ?? null;
  }

  private buildNotificationWhereClause(
    tenantId: string,
    userId: string,
    isRead?: boolean,
  ) {
    const conditions = [
      eq(schema.notifications.tenantId, tenantId),
      eq(schema.notifications.userId, userId),
    ];

    if (isRead !== undefined) {
      conditions.push(eq(schema.notifications.isRead, isRead));
    }

    return and(...conditions);
  }
}
