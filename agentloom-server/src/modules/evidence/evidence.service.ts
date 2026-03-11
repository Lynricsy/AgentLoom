import { createHash, timingSafeEqual } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';

import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { RedisCacheService } from '../../common/redis/redis-cache.service';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import {
  documentChunks,
  evidenceRecords,
  executionSteps,
  type NewEvidenceRecord,
} from '../../database/schema';
import {
  ExecutionEventName,
  type InterventionResolvedPayload,
  type StepAgentEventPayload,
  type ToolCallStatusPayload,
} from '../execution/types/execution-event.types';

import type {
  CreateEvidenceRecordDto,
  EvidenceChainNode,
  EvidenceChainResponse,
  EvidencePacketDto,
  EvidencePacketInputDto,
  EvidenceSourceType,
  IntegrityIssue,
} from './dto/evidence.dto';
import {
  EvidenceChainResponseSchema,
  EvidencePacketInputSchema,
  EvidencePacketSchema,
} from './dto/evidence.dto';
import {
  EvidenceEventName,
  type EvidenceBatchCreatePayload,
  type EvidenceCreatePayload,
  type RagEvidenceRetrievedPayload,
  type RagEvidenceResultPayload,
} from './evidence.events';
import {
  EvidenceNotFoundException,
  InvalidEvidencePacketException,
} from './evidence.exceptions';

type EvidenceRecord = typeof evidenceRecords.$inferSelect;
type ExecutionStepRecord = typeof executionSteps.$inferSelect;

export interface PaginatedEvidenceResult {
  data: EvidenceRecord[];
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
  resolve: (value: EvidenceRecord) => void;
  reject: (reason: unknown) => void;
}

interface AutomaticEventContext {
  tenantId: string;
  executionId: string;
}

type StepAgentEvidencePayload = StepAgentEventPayload & AutomaticEventContext;
type ToolCallEvidencePayload = ToolCallStatusPayload & AutomaticEventContext;
type InterventionEvidencePayload = InterventionResolvedPayload &
  AutomaticEventContext;

interface PreparedEvidenceInsert {
  evidenceId: string;
  insertValue: NewEvidenceRecord;
  packet: EvidencePacketDto;
}

interface FlatChainRecord {
  id: string;
  executionId: string;
  stepId: string;
  tenantId: string;
  sourceType: string;
  packet: EvidencePacketDto;
  contentHash: string;
  parentEvidenceId: string | null;
  createdAt: Date;
  depth: number;
}

interface SourceStatus {
  sourceUnavailable: boolean;
  sourceModified: boolean;
  unavailableReason?: string;
  originalSnapshot?: string;
}

@Injectable()
export class EvidenceService {
  private readonly logger = new Logger(EvidenceService.name);
  private batchBuffer: BatchEntry[] = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;

  private static readonly BATCH_DELAY_MS = 50;
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly cacheService: RedisCacheService,
  ) {}

  async createEvidenceRecord(
    tenantId: string,
    executionId: string,
    dto: CreateEvidenceRecordDto,
  ): Promise<EvidenceRecord> {
    return runInTenantTransaction(this.db, tenantId, async (tenantDb) => {
      const prepared = this.prepareEvidenceInsert(tenantId, executionId, dto);
      const [record] = await this.insertEvidenceRecords(tenantDb, [prepared]);

      this.logger.debug(
        `Created evidence record ${record.id} for execution ${executionId}`,
      );

      return record;
    });
  }

  async createBatchEvidenceRecords(
    tenantId: string,
    executionId: string,
    dtos: CreateEvidenceRecordDto[],
  ): Promise<EvidenceRecord[]> {
    const promises = dtos.map(
      (dto) =>
        new Promise<EvidenceRecord>((resolve, reject) => {
          this.batchBuffer.push({
            tenantId,
            executionId,
            dto,
            resolve,
            reject,
          });
        }),
    );

    this.scheduleBatchFlush();

    return Promise.all(promises);
  }

  async findByExecution(
    tenantId: string,
    executionId: string,
    options: {
      page: number;
      limit: number;
      stepId?: string;
      sourceType?: EvidenceSourceType;
      nodeId?: string;
      includeChunkContent?: boolean;
    },
  ): Promise<PaginatedEvidenceResult> {
    const { page, limit, stepId, sourceType, nodeId, includeChunkContent } =
      options;
    const offset = (page - 1) * limit;

    const tenantDb = getTenantDb(this.db);
    const conditions = [
      eq(evidenceRecords.executionId, executionId),
      eq(evidenceRecords.tenantId, tenantId),
    ];

    if (stepId) {
      conditions.push(eq(evidenceRecords.stepId, stepId));
    }

    if (sourceType) {
      conditions.push(eq(evidenceRecords.sourceType, sourceType));
    }

    if (nodeId) {
      const matchingSteps = await tenantDb
        .select({ id: executionSteps.id })
        .from(executionSteps)
        .where(
          and(
            eq(executionSteps.executionId, executionId),
            eq(executionSteps.nodeId, nodeId),
          ),
        );

      if (matchingSteps.length === 0) {
        return {
          data: [],
          meta: { page, pageSize: limit, total: 0, totalPages: 0 },
        };
      }

      conditions.push(
        inArray(
          evidenceRecords.stepId,
          matchingSteps.map((s) => s.id),
        ),
      );
    }

    const whereClause = and(...conditions);

    const [data, [{ total }]] = await Promise.all([
      tenantDb
        .select()
        .from(evidenceRecords)
        .where(whereClause)
        .orderBy(asc(evidenceRecords.createdAt), asc(evidenceRecords.id))
        .limit(limit)
        .offset(offset),
      tenantDb
        .select({ total: sql<number>`count(*)::int` })
        .from(evidenceRecords)
        .where(whereClause),
    ]);

    return {
      data: includeChunkContent
        ? await this.enrichWithChunkContent(tenantDb, data)
        : data,
      meta: {
        page,
        pageSize: limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private async enrichWithChunkContent(
    tenantDb: ReturnType<typeof getTenantDb>,
    records: EvidenceRecord[],
  ): Promise<EvidenceRecord[]> {
    const ragRecords = records.filter(
      (r) => r.sourceType === 'rag_retrieval',
    );
    if (ragRecords.length === 0) return records;

    const chunkIds = ragRecords
      .map((r) => {
        const packet = r.packet as { physicalLocation?: { chunkId?: string } };
        return packet.physicalLocation?.chunkId;
      })
      .filter((id): id is string => !!id);

    if (chunkIds.length === 0) return records;

    const uniqueChunkIds = [...new Set(chunkIds)];
    const chunks = await tenantDb
      .select({ id: documentChunks.id, content: documentChunks.content })
      .from(documentChunks)
      .where(inArray(documentChunks.id, uniqueChunkIds));

    const chunkMap = new Map(chunks.map((c) => [c.id, c.content]));

    return records.map((record) => {
      if (record.sourceType !== 'rag_retrieval') return record;

      const packet = record.packet as {
        physicalLocation?: { chunkId?: string };
      };
      const chunkId = packet.physicalLocation?.chunkId;
      if (!chunkId || !chunkMap.has(chunkId)) return record;

      return {
        ...record,
        packet: {
          ...(record.packet as Record<string, unknown>),
          physicalLocation: {
            ...packet.physicalLocation,
            chunkContent: chunkMap.get(chunkId),
          },
        },
      };
    });
  }

  async findById(
    tenantId: string,
    executionId: string,
    evidenceId: string,
  ): Promise<EvidenceRecord> {
    const tenantDb = getTenantDb(this.db);
    const [record] = await tenantDb
      .select()
      .from(evidenceRecords)
      .where(
        and(
          eq(evidenceRecords.id, evidenceId),
          eq(evidenceRecords.executionId, executionId),
          eq(evidenceRecords.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!record) {
      throw new EvidenceNotFoundException(evidenceId);
    }

    return record;
  }

  async verifyContentHash(
    tenantId: string,
    executionId: string,
    evidenceId: string,
  ): Promise<{
    evidenceId: string;
    valid: boolean;
    integrityWarning: boolean;
    currentHash: string;
  }> {
    const record = await this.findById(tenantId, executionId, evidenceId);
    const packet = this.validateStoredPacket(record.packet);
    const computedHash = this.computeContentHash(packet);
    const valid = this.compareHashes(record.contentHash, computedHash);

    return {
      evidenceId,
      valid,
      integrityWarning: !valid,
      currentHash: computedHash,
    };
  }

  @OnEvent(EvidenceEventName.CREATE)
  async handleEvidenceCreate(payload: EvidenceCreatePayload): Promise<void> {
    await this.createEvidenceRecord(
      payload.tenantId,
      payload.executionId,
      payload.dto,
    );
  }

  @OnEvent(EvidenceEventName.BATCH_CREATE)
  async handleEvidenceBatchCreate(
    payload: EvidenceBatchCreatePayload,
  ): Promise<void> {
    await this.createBatchEvidenceRecords(
      payload.tenantId,
      payload.executionId,
      payload.dtos,
    );
  }

  @OnEvent(EvidenceEventName.RAG_RETRIEVED)
  async handleRagRetrieved(
    payload: RagEvidenceRetrievedPayload,
  ): Promise<void> {
    if (payload.results.length === 0) {
      return;
    }

    await runInTenantTransaction(
      this.db,
      payload.tenantId,
      async (tenantDb) => {
        const step = await this.findExecutionStep(tenantDb, payload.stepId);
        if (!step || step.executionId !== payload.executionId) {
          this.logger.warn(
            `Skip RAG evidence creation because step ${payload.stepId} is unavailable for execution ${payload.executionId}`,
          );
          return;
        }

        let parentEvidenceId =
          payload.parentEvidenceId ??
          (await this.findLatestEvidenceIdForStep(
            tenantDb,
            payload.executionId,
            payload.stepId,
          ));

        const prepared = payload.results.map((result) => {
          const dto = this.buildRagEvidenceDto(
            payload.stepId,
            result,
            parentEvidenceId,
          );
          const next = this.prepareEvidenceInsert(
            payload.tenantId,
            payload.executionId,
            dto,
            parentEvidenceId,
          );
          parentEvidenceId = next.evidenceId;
          return next;
        });

        await this.insertEvidenceRecords(tenantDb, prepared);
      },
    );
  }

  @OnEvent(ExecutionEventName.STEP_AGENT_EVENT)
  async handleStepAgentEvent(payload: StepAgentEvidencePayload): Promise<void> {
    const decisionEvent = payload.event;
    if (decisionEvent.type !== 'decision') {
      return;
    }

    await runInTenantTransaction(
      this.db,
      payload.tenantId,
      async (tenantDb) => {
        const step = await this.findExecutionStep(tenantDb, payload.stepId);
        if (!step || step.executionId !== payload.executionId) {
          this.logger.warn(
            `Skip decision evidence creation because step ${payload.stepId} is unavailable for execution ${payload.executionId}`,
          );
          return;
        }

        const parentEvidenceId = await this.findLatestEvidenceIdForStep(
          tenantDb,
          payload.executionId,
          payload.stepId,
        );

        const dto: CreateEvidenceRecordDto = {
          stepId: payload.stepId,
          sourceType: 'agent_decision',
          ...(parentEvidenceId ? { parentEvidenceId } : {}),
          packet: {
            sourceType: 'agent_decision',
            ...(parentEvidenceId ? { parentEvidenceId } : {}),
            agentDecision: {
              nodeId: step.nodeId,
              agentName: this.resolveAgentName(step),
              autonomyMode:
                decisionEvent.autonomyMode ?? this.resolveAutonomyMode(step),
              suggestedContent: decisionEvent.suggestedContent,
              reasoning:
                decisionEvent.rationale ?? 'Agent decision emitted by runtime',
              selectedAction:
                decisionEvent.selectedAction ?? 'request_intervention',
              alternatives: decisionEvent.alternatives
                ? [...decisionEvent.alternatives]
                : ['approve', 'modify', 'reject'],
              ...(decisionEvent.confidence !== undefined
                ? { confidence: decisionEvent.confidence }
                : {}),
            },
          },
        };

        const prepared = this.prepareEvidenceInsert(
          payload.tenantId,
          payload.executionId,
          dto,
          parentEvidenceId,
        );
        await this.insertEvidenceRecords(tenantDb, [prepared]);
      },
    );
  }

  @OnEvent(ExecutionEventName.NODE_TOOL_CALL_STATUS)
  async handleToolCallStatus(payload: ToolCallEvidencePayload): Promise<void> {
    if (!this.isToolEvidenceStatus(payload.status)) {
      return;
    }

    await runInTenantTransaction(
      this.db,
      payload.tenantId,
      async (tenantDb) => {
        const step = await this.findExecutionStep(tenantDb, payload.stepId);
        if (!step || step.executionId !== payload.executionId) {
          this.logger.warn(
            `Skip tool evidence creation because step ${payload.stepId} is unavailable for execution ${payload.executionId}`,
          );
          return;
        }

        const parentEvidenceId = await this.findLatestEvidenceIdForStep(
          tenantDb,
          payload.executionId,
          payload.stepId,
        );

        const dto: CreateEvidenceRecordDto = {
          stepId: payload.stepId,
          sourceType: 'tool_output',
          ...(parentEvidenceId ? { parentEvidenceId } : {}),
          packet: {
            sourceType: 'tool_output',
            ...(parentEvidenceId ? { parentEvidenceId } : {}),
            toolOutput: {
              toolCallId: payload.toolCallId,
              toolName: payload.tool,
              toolInput: payload.args ?? {},
              toolOutput:
                payload.result ??
                (payload.error
                  ? { error: payload.error }
                  : { status: payload.status }),
              ...(payload.transitions
                ? {
                    transitions: payload.transitions.map((transition) => ({
                      ...(transition.from ? { from: transition.from } : {}),
                      to: transition.to,
                      source: transition.source,
                      timestamp: transition.timestamp,
                    })),
                  }
                : {}),
            },
          },
        };

        const prepared = this.prepareEvidenceInsert(
          payload.tenantId,
          payload.executionId,
          dto,
          parentEvidenceId,
        );
        await this.insertEvidenceRecords(tenantDb, [prepared]);
      },
    );
  }

  @OnEvent(ExecutionEventName.NODE_INTERVENTION_RESOLVED)
  async handleInterventionResolved(
    payload: InterventionEvidencePayload,
  ): Promise<void> {
    await runInTenantTransaction(
      this.db,
      payload.tenantId,
      async (tenantDb) => {
        const step = await this.findExecutionStep(tenantDb, payload.stepId);
        if (!step || step.executionId !== payload.executionId) {
          this.logger.warn(
            `Skip intervention evidence creation because step ${payload.stepId} is unavailable for execution ${payload.executionId}`,
          );
          return;
        }

        const checkpoint = step.checkpointData ?? {};
        const requestedAt =
          typeof checkpoint.interventionRequestedAt === 'string'
            ? checkpoint.interventionRequestedAt
            : undefined;
        const parentEvidenceId = await this.findLatestEvidenceIdForStep(
          tenantDb,
          payload.executionId,
          payload.stepId,
        );

        const dto: CreateEvidenceRecordDto = {
          stepId: payload.stepId,
          sourceType: 'intervention',
          ...(parentEvidenceId ? { parentEvidenceId } : {}),
          packet: {
            sourceType: 'intervention',
            ...(parentEvidenceId ? { parentEvidenceId } : {}),
            intervention: {
              action: payload.action,
              ...(payload.feedback ? { feedback: payload.feedback } : {}),
              ...(payload.modifiedContent !== undefined
                ? { modifiedContent: payload.modifiedContent }
                : {}),
              ...(requestedAt ? { requestedAt } : {}),
              resolvedAt: payload.resolvedAt,
              resolvedBy: payload.resolvedBy,
              ...(payload.timeout ? { timeout: true } : {}),
            },
          },
        };

        const prepared = this.prepareEvidenceInsert(
          payload.tenantId,
          payload.executionId,
          dto,
          parentEvidenceId,
        );
        await this.insertEvidenceRecords(tenantDb, [prepared]);
      },
    );
  }

  private scheduleBatchFlush(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }

    this.batchTimer = setTimeout(() => {
      void this.flushBatch();
    }, EvidenceService.BATCH_DELAY_MS);
  }

  private async flushBatch(): Promise<void> {
    const entries = [...this.batchBuffer];
    this.batchBuffer = [];
    this.batchTimer = null;

    if (entries.length === 0) {
      return;
    }

    const groupedEntries = new Map<string, BatchEntry[]>();
    for (const entry of entries) {
      const key = `${entry.tenantId}:${entry.executionId}`;
      const group = groupedEntries.get(key);
      if (group) {
        group.push(entry);
      } else {
        groupedEntries.set(key, [entry]);
      }
    }

    const grouped = Array.from(groupedEntries.values());
    const results = await Promise.allSettled(
      grouped.map(async (group) => {
        const [{ tenantId, executionId }] = group;
        await runInTenantTransaction(this.db, tenantId, async (tenantDb) => {
          const prepared = group.map((entry) =>
            this.prepareEvidenceInsert(entry.tenantId, executionId, entry.dto),
          );
          const records = await this.insertEvidenceRecords(tenantDb, prepared);

          records.forEach((record, index) => {
            group[index]?.resolve(record);
          });

          this.logger.debug(
            `Flushed batch of ${records.length} evidence records for execution ${executionId}`,
          );
        });
      }),
    );

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        grouped[index]?.forEach((entry) => {
          entry.reject(result.reason);
        });
      }
    });
  }

  private prepareEvidenceInsert(
    tenantId: string,
    executionId: string,
    dto: CreateEvidenceRecordDto,
    overrideParentEvidenceId?: string,
  ): PreparedEvidenceInsert {
    const inputPacket = this.validateInputPacket(dto.packet);
    const parentEvidenceId =
      overrideParentEvidenceId ??
      dto.parentEvidenceId ??
      inputPacket.parentEvidenceId;

    if (dto.sourceType !== inputPacket.sourceType) {
      throw new InvalidEvidencePacketException(
        'packet.sourceType must match sourceType',
      );
    }

    const evidenceId = uuidv7();
    const timestamp = new Date().toISOString();
    const packetWithoutMetadata = {
      ...inputPacket,
      ...(parentEvidenceId ? { parentEvidenceId } : {}),
    } satisfies EvidencePacketInputDto;
    const contentHash = this.computeContentHash(packetWithoutMetadata);

    const storedPacket = this.validateStoredPacket({
      ...packetWithoutMetadata,
      evidenceId,
      contentHash,
      timestamp,
    });

    return {
      evidenceId,
      packet: storedPacket,
      insertValue: {
        id: evidenceId,
        executionId,
        stepId: dto.stepId,
        tenantId,
        sourceType: dto.sourceType,
        packet: storedPacket,
        contentHash,
        parentEvidenceId: parentEvidenceId ?? null,
      },
    };
  }

  private async insertEvidenceRecords(
    tenantDb: DrizzleDB,
    prepared: PreparedEvidenceInsert[],
  ): Promise<EvidenceRecord[]> {
    if (prepared.length === 0) {
      return [];
    }

    const records = await tenantDb
      .insert(evidenceRecords)
      .values(prepared.map((entry) => entry.insertValue))
      .returning();

    const executionId = prepared[0]?.insertValue.executionId;
    if (executionId) {
      void this.invalidateChainCache(executionId);
    }

    return records;
  }

  private async findExecutionStep(
    tenantDb: DrizzleDB,
    stepId: string,
  ): Promise<ExecutionStepRecord | undefined> {
    const [step] = await tenantDb
      .select()
      .from(executionSteps)
      .where(eq(executionSteps.id, stepId))
      .limit(1);

    return step;
  }

  private async findLatestEvidenceIdForStep(
    tenantDb: DrizzleDB,
    executionId: string,
    stepId: string,
  ): Promise<string | undefined> {
    const [record] = await tenantDb
      .select({ id: evidenceRecords.id })
      .from(evidenceRecords)
      .where(
        and(
          eq(evidenceRecords.executionId, executionId),
          eq(evidenceRecords.stepId, stepId),
        ),
      )
      .orderBy(desc(evidenceRecords.createdAt), desc(evidenceRecords.id))
      .limit(1);

    return record?.id;
  }

  private buildRagEvidenceDto(
    stepId: string,
    result: RagEvidenceResultPayload,
    parentEvidenceId?: string,
  ): CreateEvidenceRecordDto {
    return {
      stepId,
      sourceType: 'rag_retrieval',
      ...(parentEvidenceId ? { parentEvidenceId } : {}),
      packet: {
        sourceType: 'rag_retrieval',
        ...(parentEvidenceId ? { parentEvidenceId } : {}),
        physicalLocation: this.buildRagPhysicalLocation(result),
        semanticLocation: this.buildRagSemanticLocation(result),
        retrievedContent: result.content,
      },
    };
  }

  private buildRagPhysicalLocation(result: RagEvidenceResultPayload) {
    const location = result.location ?? {};
    const page = this.readInteger(location, ['page']);
    const paragraph = this.readInteger(location, ['paragraph']);

    return {
      documentId: result.documentId,
      knowledgeBaseId: result.knowledgeBaseId,
      fileName:
        this.readString(location, [
          'fileName',
          'file_name',
          'documentName',
          'source',
        ]) ?? result.documentId,
      ...(page !== undefined ? { page } : {}),
      ...(paragraph !== undefined ? { paragraph } : {}),
      offset:
        this.readInteger(location, ['offset', 'startOffset', 'start_offset']) ??
        0,
      length: this.readInteger(location, ['length']) ?? result.content.length,
      chunkId: result.chunkId,
    };
  }

  private buildRagSemanticLocation(result: RagEvidenceResultPayload) {
    const location = result.location ?? {};
    const sectionTitle = this.readString(location, [
      'sectionTitle',
      'section_title',
    ]);
    const context = this.truncateContext(
      this.readString(location, ['context', 'excerpt']) ?? result.content,
    );

    return {
      ...(sectionTitle ? { sectionTitle } : {}),
      context,
      relevanceScore: this.clampScore(result.score),
    };
  }

  private resolveAgentName(step: ExecutionStepRecord): string {
    const nodeData = step.nodeData ?? {};

    return (
      this.readString(nodeData, ['agentName', 'name', 'label']) ?? step.nodeId
    );
  }

  private resolveAutonomyMode(step: ExecutionStepRecord): string {
    const nodeData = step.nodeData ?? {};

    return (
      this.readString(nodeData, ['autonomyMode', 'autonomy_mode']) ??
      'human_in_the_loop'
    );
  }

  private validateInputPacket(packet: unknown): EvidencePacketInputDto {
    const result = EvidencePacketInputSchema.safeParse(packet);
    if (!result.success) {
      throw new InvalidEvidencePacketException(
        `Invalid evidence packet: ${result.error.issues.map((issue) => issue.message).join(', ')}`,
      );
    }

    return result.data;
  }

  private validateStoredPacket(packet: unknown): EvidencePacketDto {
    const result = EvidencePacketSchema.safeParse(packet);
    if (!result.success) {
      throw new InvalidEvidencePacketException(
        `Invalid stored evidence packet: ${result.error.issues.map((issue) => issue.message).join(', ')}`,
      );
    }

    return result.data;
  }

  private computeContentHash(
    packet: EvidencePacketInputDto | EvidencePacketDto,
  ): string {
    const hashSource = this.extractHashSource(packet);
    const normalized = this.normalizeForHash(hashSource);
    const serialized = JSON.stringify(normalized);

    return createHash('sha256').update(serialized).digest('hex');
  }

  private extractHashSource(
    packet: EvidencePacketInputDto | EvidencePacketDto,
  ): Record<string, unknown> {
    switch (packet.sourceType) {
      case 'rag_retrieval':
        return {
          sourceType: packet.sourceType,
          physicalLocation: packet.physicalLocation,
          semanticLocation: packet.semanticLocation,
          retrievedContent: packet.retrievedContent,
        };
      case 'agent_decision':
        return {
          sourceType: packet.sourceType,
          agentDecision: packet.agentDecision,
        };
      case 'tool_output':
        return {
          sourceType: packet.sourceType,
          toolOutput: packet.toolOutput,
        };
      case 'user_input':
        return {
          sourceType: packet.sourceType,
          userInput: packet.userInput,
        };
      case 'intervention':
        return {
          sourceType: packet.sourceType,
          intervention: packet.intervention,
        };
    }
  }

  private normalizeForHash(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.normalizeForHash(item));
    }

    if (value && typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .reduce<Record<string, unknown>>((acc, [key, entryValue]) => {
          acc[key] = this.normalizeForHash(entryValue);
          return acc;
        }, {});
    }

    return value;
  }

  private compareHashes(storedHash: string, computedHash: string): boolean {
    if (storedHash.length !== computedHash.length) {
      return false;
    }

    const storedBuffer = Buffer.from(storedHash, 'hex');
    const computedBuffer = Buffer.from(computedHash, 'hex');

    if (storedBuffer.length !== computedBuffer.length) {
      return false;
    }

    return timingSafeEqual(storedBuffer, computedBuffer);
  }

  private computeTextHash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private readString(
    source: Record<string, unknown>,
    keys: string[],
  ): string | undefined {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
    }

    return undefined;
  }

  private readInteger(
    source: Record<string, unknown>,
    keys: string[],
  ): number | undefined {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'number' && Number.isInteger(value)) {
        return value;
      }
    }

    return undefined;
  }

  private truncateContext(value: string): string {
    return value.length <= 500 ? value : value.slice(0, 500);
  }

  private clampScore(value: number): number {
    return Math.max(0, Math.min(1, value));
  }

  private isToolEvidenceStatus(
    status: ToolCallEvidencePayload['status'],
  ): status is 'completed' | 'failed' | 'denied' {
    return ['completed', 'failed', 'denied'].includes(status);
  }

  // -- Chain methods (Story 6-2) --

  private static readonly CHAIN_CACHE_TTL = 300;
  private static readonly CHAIN_MAX_DEPTH = 50;

  async buildChain(
    tenantId: string,
    executionId: string,
    nodeId?: string,
    options?: { bypassCache?: boolean },
  ): Promise<{ response: EvidenceChainResponse; cached: boolean }> {
    const cacheKey = `evidence:chain:${executionId}:${nodeId ?? 'all'}`;
    const bypassCache = options?.bypassCache ?? false;

    if (!bypassCache) {
      try {
        const cached = await this.cacheService.get(cacheKey);
        if (cached) {
          const parsedCached: unknown = JSON.parse(cached);

          return {
            response: EvidenceChainResponseSchema.parse(parsedCached),
            cached: true,
          };
        }
      } catch {
        this.logger.warn(
          'Redis cache read failed for chain, proceeding without cache',
        );
      }
    }

    const flatRecords = await this.fetchChainRecords(
      tenantId,
      executionId,
      nodeId,
    );
    const sourceStatusMap = await this.checkSourceAvailability(flatRecords);

    const hashResults = new Map<string, boolean>();
    for (const record of flatRecords) {
      try {
        const computedHash = this.computeContentHash(record.packet);
        hashResults.set(
          record.id,
          this.compareHashes(record.contentHash, computedHash),
        );
      } catch {
        hashResults.set(record.id, false);
      }
    }

    const { roots, integrityIssues } = this.flatToTree(
      flatRecords,
      sourceStatusMap,
      hashResults,
    );

    const totalNodes = flatRecords.length;
    const chainCompleteness =
      totalNodes === 0
        ? 1
        : flatRecords.filter((record) =>
            this.hasPhysicalLocation(record.packet),
          ).length / totalNodes;
    const nodesWithPhysicalLocation = flatRecords.filter((record) =>
      this.hasPhysicalLocation(record.packet),
    ).length;
    const completenessLabel =
      chainCompleteness >= 0.95
        ? 'complete'
        : `evidence_completeness: ${chainCompleteness.toFixed(2)}`;

    const response: EvidenceChainResponse = {
      roots,
      chainCompleteness,
      totalNodes,
      integrityStatus: {
        chainCompleteness,
        totalNodes,
        nodesWithPhysicalLocation,
        completenessLabel,
        integrityIssues,
      },
      cachedAt: new Date().toISOString(),
    };

    if (!bypassCache) {
      try {
        await this.cacheService.set(
          cacheKey,
          JSON.stringify(response),
          EvidenceService.CHAIN_CACHE_TTL,
        );
      } catch {
        this.logger.warn('Redis cache write failed for chain');
      }
    }

    return { response, cached: false };
  }

  async verifyChainIntegrity(
    tenantId: string,
    executionId: string,
    nodeId?: string,
  ): Promise<EvidenceChainResponse> {
    const { response } = await this.buildChain(tenantId, executionId, nodeId, {
      bypassCache: true,
    });
    return response;
  }

  private async fetchChainRecords(
    tenantId: string,
    executionId: string,
    nodeId?: string,
  ): Promise<FlatChainRecord[]> {
    const tenantDb = getTenantDb(this.db);
    const anchorJoin = nodeId
      ? sql`INNER JOIN execution_steps es ON es.id = er.step_id`
      : sql``;
    const anchorCondition = nodeId
      ? sql`es.node_id = ${nodeId}`
      : sql`NOT EXISTS (
          SELECT 1
          FROM evidence_records child
          WHERE child.parent_evidence_id = er.id
            AND child.execution_id = er.execution_id
            AND child.tenant_id = er.tenant_id
        )`;

    const result = await tenantDb.execute(sql`
      WITH RECURSIVE chain AS (
        SELECT er.id,
               er.execution_id,
               er.step_id,
               er.tenant_id,
               er.source_type,
               er.packet,
               er.content_hash,
               er.parent_evidence_id,
               er.created_at,
               0 AS depth,
               ARRAY[er.id]::uuid[] AS path
        FROM evidence_records er
        ${anchorJoin}
        WHERE er.execution_id = ${executionId}
          AND er.tenant_id = ${tenantId}
          AND ${anchorCondition}

        UNION ALL

        SELECT parent.id,
               parent.execution_id,
               parent.step_id,
               parent.tenant_id,
               parent.source_type,
               parent.packet,
               parent.content_hash,
               parent.parent_evidence_id,
               parent.created_at,
               c.depth + 1,
               c.path || parent.id
        FROM evidence_records parent
        INNER JOIN chain c ON c.parent_evidence_id = parent.id
        WHERE parent.execution_id = ${executionId}
          AND parent.tenant_id = ${tenantId}
          AND c.depth < ${EvidenceService.CHAIN_MAX_DEPTH}
          AND NOT parent.id = ANY(c.path)
      )
      SELECT id,
             execution_id,
             step_id,
             tenant_id,
             source_type,
             packet,
             content_hash,
             parent_evidence_id,
             created_at,
             MIN(depth)::int AS depth
      FROM chain
      GROUP BY id,
               execution_id,
               step_id,
               tenant_id,
               source_type,
               packet,
               content_hash,
               parent_evidence_id,
               created_at
      ORDER BY created_at ASC, id ASC
    `);

    const rows = (result as { rows?: unknown[] }).rows ?? result;
    return (rows as Record<string, unknown>[]).map<FlatChainRecord>((row) => {
      const packet = this.validateStoredPacket(row.packet);

      return {
        id: String(row.id),
        executionId: String(row.execution_id),
        stepId: String(row.step_id),
        tenantId: String(row.tenant_id),
        sourceType: String(row.source_type),
        packet,
        contentHash: String(row.content_hash),
        parentEvidenceId:
          row.parent_evidence_id == null
            ? null
            : this.serializePreview(row.parent_evidence_id),
        createdAt:
          row.created_at instanceof Date
            ? row.created_at
            : new Date(String(row.created_at)),
        depth: Number(row.depth),
      };
    });
  }

  private async checkSourceAvailability(
    records: FlatChainRecord[],
  ): Promise<Map<string, SourceStatus>> {
    const statusMap = new Map<string, SourceStatus>();
    const chunkLookups = new Map<
      string,
      Array<{
        evidenceId: string;
        retrievedContent: string;
        originalSnapshot?: string;
      }>
    >();

    for (const record of records) {
      if (record.packet.sourceType === 'rag_retrieval') {
        const chunkId = record.packet.physicalLocation.chunkId;
        if (chunkId) {
          const lookups = chunkLookups.get(chunkId) ?? [];
          lookups.push({
            evidenceId: record.id,
            retrievedContent: record.packet.retrievedContent,
            originalSnapshot: record.packet.semanticLocation.context,
          });
          chunkLookups.set(chunkId, lookups);
        } else {
          statusMap.set(record.id, {
            sourceUnavailable: false,
            sourceModified: false,
          });
        }
      } else {
        statusMap.set(record.id, {
          sourceUnavailable: false,
          sourceModified: false,
        });
      }
    }

    if (chunkLookups.size === 0) {
      return statusMap;
    }

    const tenantDb = getTenantDb(this.db);
    const chunkIds = Array.from(chunkLookups.keys());
    const chunks = await tenantDb
      .select({ id: documentChunks.id, content: documentChunks.content })
      .from(documentChunks)
      .where(inArray(documentChunks.id, chunkIds));

    const chunkContentMap = new Map<string, string>();
    for (const chunk of chunks) {
      chunkContentMap.set(chunk.id, chunk.content);
    }

    for (const [chunkId, infos] of chunkLookups) {
      const chunkContent = chunkContentMap.get(chunkId);
      for (const info of infos) {
        if (chunkContent === undefined) {
          statusMap.set(info.evidenceId, {
            sourceUnavailable: true,
            sourceModified: false,
            unavailableReason: '来源不可用—原始文档已删除',
          });
          continue;
        }

        const modified = !this.compareHashes(
          this.computeTextHash(info.retrievedContent),
          this.computeTextHash(chunkContent),
        );
        statusMap.set(info.evidenceId, {
          sourceUnavailable: false,
          sourceModified: modified,
          ...(modified
            ? {
                unavailableReason: '来源已修改—原始文档内容发生变化',
                originalSnapshot: info.originalSnapshot,
              }
            : {}),
        });
      }
    }

    return statusMap;
  }

  private flatToTree(
    records: FlatChainRecord[],
    sourceStatus: Map<string, SourceStatus>,
    hashResults: Map<string, boolean>,
  ): { roots: EvidenceChainNode[]; integrityIssues: IntegrityIssue[] } {
    const nodeMap = new Map<string, EvidenceChainNode>();
    const integrityIssues: IntegrityIssue[] = [];

    for (const record of records) {
      const status = sourceStatus.get(record.id) ?? {
        sourceUnavailable: false,
        sourceModified: false,
      };
      const hashValid = hashResults.get(record.id) ?? false;

      const node: EvidenceChainNode = {
        evidenceId: record.id,
        executionId: record.executionId,
        stepId: record.stepId,
        sourceType: record.sourceType as EvidenceChainNode['sourceType'],
        packetSummary: this.buildPacketSummary(record.packet),
        contentHash: record.contentHash,
        parentEvidenceId: record.parentEvidenceId,
        createdAt: record.createdAt.toISOString(),
        depth: 0,
        ...(status.sourceUnavailable ? { sourceUnavailable: true } : {}),
        ...(status.sourceModified ? { sourceModified: true } : {}),
        ...(status.unavailableReason
          ? { unavailableReason: status.unavailableReason }
          : {}),
        ...(status.originalSnapshot
          ? { originalSnapshot: status.originalSnapshot }
          : {}),
        hashValid,
        children: [],
      };

      if (!hashValid) {
        integrityIssues.push({
          evidenceId: record.id,
          issueType: 'hash_mismatch',
          description: '证据内容哈希校验失败',
        });
      }
      if (status.sourceUnavailable) {
        integrityIssues.push({
          evidenceId: record.id,
          issueType: 'source_unavailable',
          description: status.unavailableReason ?? '来源不可用',
        });
      }
      if (status.sourceModified) {
        integrityIssues.push({
          evidenceId: record.id,
          issueType: 'source_modified',
          description: status.unavailableReason ?? '来源已修改',
        });
      }

      nodeMap.set(record.id, node);
    }

    const roots: EvidenceChainNode[] = [];
    for (const record of records) {
      const node = nodeMap.get(record.id);
      if (!node) {
        continue;
      }

      if (record.parentEvidenceId && nodeMap.has(record.parentEvidenceId)) {
        nodeMap.get(record.parentEvidenceId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    this.sortChainNodes(roots);
    this.assignDepths(roots);

    return { roots, integrityIssues };
  }

  private sortChainNodes(nodes: EvidenceChainNode[]): void {
    nodes.sort((left, right) => {
      if (left.createdAt === right.createdAt) {
        return left.evidenceId.localeCompare(right.evidenceId);
      }

      return left.createdAt.localeCompare(right.createdAt);
    });

    for (const node of nodes) {
      this.sortChainNodes(node.children);
    }
  }

  private assignDepths(nodes: EvidenceChainNode[], depth = 0): void {
    for (const node of nodes) {
      node.depth = depth;
      this.assignDepths(node.children, depth + 1);
    }
  }

  private hasPhysicalLocation(packet: EvidencePacketDto): boolean {
    return packet.sourceType === 'rag_retrieval';
  }

  private buildPacketSummary(
    packet: EvidencePacketDto,
  ): EvidenceChainNode['packetSummary'] {
    switch (packet.sourceType) {
      case 'rag_retrieval':
        return {
          title: `RAG 检索 · ${packet.physicalLocation.fileName}`,
          excerpt: this.truncatePreview(packet.retrievedContent),
          metadata: {
            documentId: packet.physicalLocation.documentId,
            ...(packet.physicalLocation.knowledgeBaseId
              ? { knowledgeBaseId: packet.physicalLocation.knowledgeBaseId }
              : {}),
            chunkId: packet.physicalLocation.chunkId,
            relevanceScore: packet.semanticLocation.relevanceScore.toFixed(2),
            ...(packet.semanticLocation.sectionTitle
              ? { sectionTitle: packet.semanticLocation.sectionTitle }
              : {}),
          },
        };
      case 'agent_decision':
        return {
          title: `Agent 决策 · ${packet.agentDecision.agentName}`,
          excerpt: this.truncatePreview(packet.agentDecision.reasoning),
          metadata: {
            nodeId: packet.agentDecision.nodeId,
            selectedAction: packet.agentDecision.selectedAction,
            autonomyMode: packet.agentDecision.autonomyMode,
            ...(packet.agentDecision.confidence !== undefined
              ? { confidence: packet.agentDecision.confidence.toFixed(2) }
              : {}),
          },
        };
      case 'tool_output':
        return {
          title: `工具输出 · ${packet.toolOutput.toolName}`,
          excerpt: this.truncatePreview(
            this.serializePreview(packet.toolOutput.toolOutput),
          ),
          metadata: {
            ...(packet.toolOutput.toolCallId
              ? { toolCallId: packet.toolOutput.toolCallId }
              : {}),
          },
        };
      case 'user_input':
        return {
          title: '用户输入',
          excerpt: this.truncatePreview(
            this.serializePreview(packet.userInput.content),
          ),
        };
      case 'intervention':
        return {
          title: `人工介入 · ${packet.intervention.action}`,
          excerpt: this.truncatePreview(
            packet.intervention.feedback ??
              this.serializePreview(packet.intervention.modifiedContent),
          ),
          metadata: {
            resolvedBy: packet.intervention.resolvedBy,
            resolvedAt: packet.intervention.resolvedAt,
          },
        };
    }
  }

  private truncatePreview(
    value: string | undefined,
    maxLength = 200,
  ): string | undefined {
    if (!value) {
      return undefined;
    }

    return value.length <= maxLength ? value : `${value.slice(0, maxLength)}…`;
  }

  private serializePreview(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }

    if (value === undefined) {
      return 'undefined';
    }

    try {
      return JSON.stringify(value);
    } catch {
      return Object.prototype.toString.call(value);
    }
  }

  private async invalidateChainCache(executionId: string): Promise<void> {
    try {
      await this.cacheService.delByPattern(`evidence:chain:${executionId}:*`);
    } catch {
      this.logger.warn('Failed to invalidate chain cache');
    }
  }
}
