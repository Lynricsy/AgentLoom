import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';

import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import * as schema from '../../database/schema';
import type { WorkflowTriggerHistory } from '../../database/schema/workflow-triggers.schema';
import {
  QueryTriggerHistorySchema,
  type QueryTriggerHistoryDto,
  type TriggerHistoryStatus,
} from './trigger-dto.compat';

export type RecordTriggerHistoryInput = {
  triggerId: string;
  status: TriggerHistoryStatus;
  executionId?: string;
  errorMessage?: string;
  payload?: Record<string, unknown>;
};

type TriggerHistoryListResult = {
  data: WorkflowTriggerHistory[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

@Injectable()
export class TriggerHistoryService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  async record(
    tenantId: string,
    data: RecordTriggerHistoryInput,
  ): Promise<WorkflowTriggerHistory> {
    const [created] = await this.tenantDb
      .insert(schema.workflowTriggerHistory)
      .values({
        triggerId: data.triggerId,
        tenantId,
        status: data.status,
        executionId: data.executionId,
        errorMessage: data.errorMessage,
        payload: data.payload,
      })
      .returning();

    return created;
  }

  async findByTrigger(
    tenantId: string,
    triggerId: string,
    query: QueryTriggerHistoryDto,
  ): Promise<TriggerHistoryListResult> {
    const parsedQuery = QueryTriggerHistorySchema.parse(query);
    const page = parsedQuery.page;
    const pageSize = parsedQuery.pageSize;
    const offset = (page - 1) * pageSize;

    const conditions = [
      eq(schema.workflowTriggerHistory.tenantId, tenantId),
      eq(schema.workflowTriggerHistory.triggerId, triggerId),
    ];

    if (parsedQuery.status) {
      conditions.push(eq(schema.workflowTriggerHistory.status, parsedQuery.status));
    }

    const whereClause = and(...conditions);

    const [data, countResult] = await Promise.all([
      this.tenantDb
        .select()
        .from(schema.workflowTriggerHistory)
        .where(whereClause)
        .orderBy(desc(schema.workflowTriggerHistory.triggeredAt))
        .limit(pageSize)
        .offset(offset),
      this.tenantDb
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.workflowTriggerHistory)
        .where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;

    return {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }
}
