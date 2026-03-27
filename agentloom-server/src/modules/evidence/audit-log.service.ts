import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, gte, lte } from 'drizzle-orm';

import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import {
  auditLogArchives,
  auditLogs,
  type AuditActorType,
  type AuditLog,
  type AuditLogArchive,
  type AuditLogJson,
  type NewAuditLog,
} from '../../database/schema';
import type { ListAuditLogsQuery } from './dto/audit-log.dto';

export interface AuditLogRecordInput {
  tenantId: string;
  actorId: string | null;
  actorType: AuditActorType;
  eventType: string;
  resourceType: string;
  resourceId: string;
  executionId?: string | null;
  summary: string;
  before?: AuditLogJson | null;
  after?: AuditLogJson | null;
  metadata?: AuditLogJson | null;
}

type AuditLogLookupFilters = Omit<ListAuditLogsQuery, 'page' | 'pageSize'> & {
  id?: string;
};

type AuditLogTable = typeof auditLogs | typeof auditLogArchives;
type AuditLogTableRow<TTable extends AuditLogTable> =
  TTable extends typeof auditLogs ? AuditLog : AuditLogArchive;

type AuditLogRecallRecord = AuditLog | AuditLogArchive;

@Injectable()
export class AuditLogService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  async record(input: AuditLogRecordInput): Promise<AuditLog> {
    return runInTenantTransaction(this.db, input.tenantId, async (tenantDb) => {
      const values: NewAuditLog = {
        tenantId: input.tenantId,
        actorId: input.actorId,
        actorType: input.actorType,
        eventType: input.eventType,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        executionId: input.executionId ?? null,
        summary: input.summary,
        before: input.before ?? null,
        after: input.after ?? null,
        metadata: input.metadata ?? null,
      };

      const [record] = await tenantDb
        .insert(auditLogs)
        .values(values)
        .returning();

      if (!record) {
        throw new Error('Failed to record audit log');
      }

      return record;
    });
  }

  async list(
    tenantId: string,
    query: ListAuditLogsQuery,
  ): Promise<{ data: AuditLogRecallRecord[]; total: number }> {
    const merged = await this.readMergedRecall(tenantId, query);
    const offset = (query.page - 1) * query.pageSize;

    return {
      data: merged.slice(offset, offset + query.pageSize),
      total: merged.length,
    };
  }

  async findById(tenantId: string, id: string): Promise<AuditLogRecallRecord> {
    const hotRecord = await this.findInTable(auditLogs, tenantId, { id });

    if (hotRecord) {
      return hotRecord;
    }

    const archivedRecord = await this.findInTable(auditLogArchives, tenantId, {
      id,
    });

    if (archivedRecord) {
      return archivedRecord;
    }

    throw new NotFoundException(`Audit log ${id} not found`);
  }

  async findResourceSequence(
    tenantId: string,
    resourceType: string,
    resourceId: string,
  ): Promise<AuditLogRecallRecord[]> {
    return this.readMergedRecall(tenantId, {
      resourceType,
      resourceId,
    });
  }

  private async readMergedRecall(
    tenantId: string,
    filters: AuditLogLookupFilters,
  ): Promise<AuditLogRecallRecord[]> {
    const [hotRows, archiveRows] = await Promise.all([
      this.findAllInTable(auditLogs, tenantId, filters),
      this.findAllInTable(auditLogArchives, tenantId, filters),
    ]);

    return this.mergeRecall(hotRows, archiveRows);
  }

  private async findInTable<TTable extends AuditLogTable>(
    table: TTable,
    tenantId: string,
    filters: AuditLogLookupFilters,
  ): Promise<AuditLogTableRow<TTable> | null> {
    const records = await this.findAllInTable(table, tenantId, filters, 1);
    return (records[0] ?? null) as AuditLogTableRow<TTable> | null;
  }

  private async findAllInTable<TTable extends AuditLogTable>(
    table: TTable,
    tenantId: string,
    filters: AuditLogLookupFilters,
    limit?: number,
  ): Promise<AuditLogTableRow<TTable>[]> {
    if (table === auditLogs) {
      const conditions = this.buildHotConditions(tenantId, filters);
      const query = this.tenantDb
        .select()
        .from(auditLogs)
        .where(and(...conditions))
        .orderBy(asc(auditLogs.createdAt), asc(auditLogs.id));

      return (limit === undefined ? query : query.limit(limit)) as Promise<
        AuditLogTableRow<TTable>[]
      >;
    }

    const conditions = this.buildArchiveConditions(tenantId, filters);
    const query = this.tenantDb
      .select()
      .from(auditLogArchives)
      .where(and(...conditions))
      .orderBy(asc(auditLogArchives.createdAt), asc(auditLogArchives.id));

    return (limit === undefined ? query : query.limit(limit)) as Promise<
      AuditLogTableRow<TTable>[]
    >;
  }

  private buildHotConditions(tenantId: string, filters: AuditLogLookupFilters) {
    const conditions = [eq(auditLogs.tenantId, tenantId)];

    if (filters.id) {
      conditions.push(eq(auditLogs.id, filters.id));
    }

    if (filters.eventType) {
      conditions.push(eq(auditLogs.eventType, filters.eventType));
    }

    if (filters.resourceType) {
      conditions.push(eq(auditLogs.resourceType, filters.resourceType));
    }

    if (filters.resourceId) {
      conditions.push(eq(auditLogs.resourceId, filters.resourceId));
    }

    if (filters.executionId) {
      conditions.push(eq(auditLogs.executionId, filters.executionId));
    }

    if (filters.actorType) {
      conditions.push(eq(auditLogs.actorType, filters.actorType));
    }

    if (filters.actorId) {
      conditions.push(eq(auditLogs.actorId, filters.actorId));
    }

    if (filters.from) {
      conditions.push(gte(auditLogs.createdAt, filters.from));
    }

    if (filters.to) {
      conditions.push(lte(auditLogs.createdAt, filters.to));
    }

    return conditions;
  }

  private buildArchiveConditions(
    tenantId: string,
    filters: AuditLogLookupFilters,
  ) {
    const conditions = [eq(auditLogArchives.tenantId, tenantId)];

    if (filters.id) {
      conditions.push(eq(auditLogArchives.id, filters.id));
    }

    if (filters.eventType) {
      conditions.push(eq(auditLogArchives.eventType, filters.eventType));
    }

    if (filters.resourceType) {
      conditions.push(eq(auditLogArchives.resourceType, filters.resourceType));
    }

    if (filters.resourceId) {
      conditions.push(eq(auditLogArchives.resourceId, filters.resourceId));
    }

    if (filters.executionId) {
      conditions.push(eq(auditLogArchives.executionId, filters.executionId));
    }

    if (filters.actorType) {
      conditions.push(eq(auditLogArchives.actorType, filters.actorType));
    }

    if (filters.actorId) {
      conditions.push(eq(auditLogArchives.actorId, filters.actorId));
    }

    if (filters.from) {
      conditions.push(gte(auditLogArchives.createdAt, filters.from));
    }

    if (filters.to) {
      conditions.push(lte(auditLogArchives.createdAt, filters.to));
    }

    return conditions;
  }

  private mergeRecall(
    hotRows: AuditLogRecallRecord[],
    archiveRows: AuditLogRecallRecord[],
  ): AuditLogRecallRecord[] {
    const merged = new Map<string, AuditLogRecallRecord>();

    for (const record of archiveRows) {
      merged.set(record.id, record);
    }

    for (const record of hotRows) {
      merged.set(record.id, record);
    }

    return [...merged.values()].sort((left, right) => {
      const createdAtDiff =
        left.createdAt.getTime() - right.createdAt.getTime();

      if (createdAtDiff !== 0) {
        return createdAtDiff;
      }

      return left.id.localeCompare(right.id);
    });
  }
}
