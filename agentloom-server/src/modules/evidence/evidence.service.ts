import { createHash } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { and, count, desc, eq, sql } from 'drizzle-orm';

import { DRIZZLE } from '../../database/database.module';
import { evidenceRecords } from '../../database/schema';
import type { DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';

import type { CreateEvidenceRecordDto } from './dto/evidence.dto';
import { EvidencePacketSchema } from './dto/evidence.dto';
import {
  EvidenceIntegrityException,
  EvidenceNotFoundException,
  InvalidEvidencePacketException,
} from './evidence.exceptions';

export interface PaginatedEvidenceResult {
  data: (typeof evidenceRecords.$inferSelect)[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

interface BatchEntry {
  tenantId: string;
  executionId: string;
  dto: CreateEvidenceRecordDto;
  resolve: (value: typeof evidenceRecords.$inferSelect) => void;
  reject: (reason: unknown) => void;
}

@Injectable()
export class EvidenceService {
  private readonly logger = new Logger(EvidenceService.name);
  private batchBuffer: BatchEntry[] = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;

  private static readonly BATCH_DELAY_MS = 50;

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async createEvidenceRecord(
    tenantId: string,
    executionId: string,
    dto: CreateEvidenceRecordDto,
  ): Promise<typeof evidenceRecords.$inferSelect> {
    const packet = this.validateAndEnrichPacket(dto);
    const contentHash = this.computeContentHash(packet);

    const tenantDb = getTenantDb(this.db);
    const [record] = await tenantDb
      .insert(evidenceRecords)
      .values({
        executionId,
        stepId: dto.stepId,
        tenantId,
        sourceType: dto.sourceType,
        packet,
        contentHash,
        parentEvidenceId: dto.parentEvidenceId ?? null,
      })
      .returning();

    this.logger.debug(
      `Created evidence record ${record.id} for execution ${executionId}`,
    );

    return record;
  }

  async createBatchEvidenceRecords(
    tenantId: string,
    executionId: string,
    dtos: CreateEvidenceRecordDto[],
  ): Promise<(typeof evidenceRecords.$inferSelect)[]> {
    return new Promise((resolve, reject) => {
      const entries: BatchEntry[] = dtos.map((dto) => {
        let entryResolve!: (
          value: typeof evidenceRecords.$inferSelect,
        ) => void;
        let entryReject!: (reason: unknown) => void;
        const promise = new Promise<typeof evidenceRecords.$inferSelect>(
          (res, rej) => {
            entryResolve = res;
            entryReject = rej;
          },
        );
        void promise;
        return {
          tenantId,
          executionId,
          dto,
          resolve: entryResolve,
          reject: entryReject,
        };
      });

      this.batchBuffer.push(...entries);

      if (this.batchTimer) {
        clearTimeout(this.batchTimer);
      }

      this.batchTimer = setTimeout(() => {
        void this.flushBatch();
      }, EvidenceService.BATCH_DELAY_MS);

      const allPromises = entries.map(
        (e) =>
          new Promise<typeof evidenceRecords.$inferSelect>((res, rej) => {
            e.resolve = res;
            e.reject = rej;
          }),
      );

      Promise.all(allPromises).then(resolve).catch(reject);
    });
  }

  private async flushBatch(): Promise<void> {
    const entries = [...this.batchBuffer];
    this.batchBuffer = [];
    this.batchTimer = null;

    if (entries.length === 0) return;

    try {
      const values = entries.map((entry) => {
        const packet = this.validateAndEnrichPacket(entry.dto);
        const contentHash = this.computeContentHash(packet);
        return {
          executionId: entry.executionId,
          stepId: entry.dto.stepId,
          tenantId: entry.tenantId,
          sourceType: entry.dto.sourceType,
          packet,
          contentHash,
          parentEvidenceId: entry.dto.parentEvidenceId ?? null,
        };
      });

      const tenantDb = getTenantDb(this.db);
      const records = await tenantDb
        .insert(evidenceRecords)
        .values(values)
        .returning();

      records.forEach((record, i) => {
        entries[i].resolve(record);
      });

      this.logger.debug(`Flushed batch of ${records.length} evidence records`);
    } catch (error) {
      entries.forEach((entry) => entry.reject(error));
    }
  }

  async findByExecution(
    tenantId: string,
    executionId: string,
    options: { page: number; limit: number; stepId?: string },
  ): Promise<PaginatedEvidenceResult> {
    const { page, limit, stepId } = options;
    const offset = (page - 1) * limit;

    const tenantDb = getTenantDb(this.db);

    const conditions = [
      eq(evidenceRecords.executionId, executionId),
      eq(evidenceRecords.tenantId, tenantId),
    ];

    if (stepId) {
      conditions.push(eq(evidenceRecords.stepId, stepId));
    }

    const whereClause = and(...conditions);

    const [data, [{ total }]] = await Promise.all([
      tenantDb
        .select()
        .from(evidenceRecords)
        .where(whereClause)
        .orderBy(desc(evidenceRecords.createdAt))
        .limit(limit)
        .offset(offset),
      tenantDb
        .select({ total: sql<number>`count(*)::int` })
        .from(evidenceRecords)
        .where(whereClause),
    ]);

    return {
      data,
      meta: {
        page,
        pageSize: limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(
    tenantId: string,
    evidenceId: string,
  ): Promise<typeof evidenceRecords.$inferSelect> {
    const tenantDb = getTenantDb(this.db);
    const [record] = await tenantDb
      .select()
      .from(evidenceRecords)
      .where(
        and(
          eq(evidenceRecords.id, evidenceId),
          eq(evidenceRecords.tenantId, tenantId),
        ),
      );

    if (!record) {
      throw new EvidenceNotFoundException(evidenceId);
    }

    return record;
  }

  async verifyContentHash(
    tenantId: string,
    evidenceId: string,
  ): Promise<{ valid: boolean; evidenceId: string }> {
    const record = await this.findById(tenantId, evidenceId);
    const computedHash = this.computeContentHash(record.packet);
    const valid = computedHash === record.contentHash;

    if (!valid) {
      throw new EvidenceIntegrityException(evidenceId);
    }

    return { valid, evidenceId };
  }

  @OnEvent('evidence.create')
  async handleEvidenceCreate(payload: {
    tenantId: string;
    executionId: string;
    dto: CreateEvidenceRecordDto;
  }): Promise<void> {
    await this.createEvidenceRecord(
      payload.tenantId,
      payload.executionId,
      payload.dto,
    );
  }

  @OnEvent('evidence.batch-create')
  async handleEvidenceBatchCreate(payload: {
    tenantId: string;
    executionId: string;
    dtos: CreateEvidenceRecordDto[];
  }): Promise<void> {
    await this.createBatchEvidenceRecords(
      payload.tenantId,
      payload.executionId,
      payload.dtos,
    );
  }

  private validateAndEnrichPacket(dto: CreateEvidenceRecordDto) {
    const result = EvidencePacketSchema.safeParse(dto.packet);
    if (!result.success) {
      throw new InvalidEvidencePacketException(
        `Invalid evidence packet: ${result.error.issues.map((i) => i.message).join(', ')}`,
      );
    }
    return result.data;
  }

  private computeContentHash(packet: unknown): string {
    const serialized = JSON.stringify(packet, Object.keys(packet as object).sort());
    return createHash('sha256').update(serialized).digest('hex');
  }
}
