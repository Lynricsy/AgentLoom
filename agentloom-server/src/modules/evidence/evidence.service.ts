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
  IntegrityIssue,
} from './dto/evidence.dto';
import {
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
  packet: unknown;
  contentHash: string;
  parentEvidenceId: string | null;
  createdAt: Date;
  depth: number;
}

interface SourceStatus {
  sourceAvailable: boolean;
  sourceModified: boolean;
  unavailableReason?: string;
}

@Injectable()
export class EvidenceService {
  private readonly logger = new Logger(EvidenceService.name);
  private batchBuffer: BatchEntry[] = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;

  private static readonly BATCH_DELAY_MS = 50;
  private static readonly TOOL_EVIDENCE_STATUSES = new Set([
    'completed',
    'failed',
    'denied',
  ] as const);

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
        .orderBy(asc(evidenceRecords.createdAt), asc(evidenceRecords.id))
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
  }> {
    const record = await this.findById(tenantId, executionId, evidenceId);
    const packet = this.validateStoredPacket(record.packet);
    const computedHash = this.computeContentHash(packet);
    const valid = this.compareHashes(record.contentHash, computedHash);

    return {
      evidenceId,
      valid,
      integrityWarning: !valid,
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

    await runInTenantTransaction(this.db, payload.tenantId, async (tenantDb) => {
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
        const dto = this.buildRagEvidenceDto(payload.stepId, result, parentEvidenceId);
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
    });
  }

  @OnEvent(ExecutionEventName.STEP_AGENT_EVENT)
  async handleStepAgentEvent(payload: StepAgentEvidencePayload): Promise<void> {
    const decisionEvent = payload.event;
    if (decisionEvent.type !== 'decision') {
      return;
    }

    await runInTenantTransaction(this.db, payload.tenantId, async (tenantDb) => {
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
    });
  }

  @OnEvent(ExecutionEventName.NODE_TOOL_CALL_STATUS)
  async handleToolCallStatus(
    payload: ToolCallEvidencePayload,
  ): Promise<void> {
    if (!this.isToolEvidenceStatus(payload.status)) {
      return;
    }

    await runInTenantTransaction(this.db, payload.tenantId, async (tenantDb) => {
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
              (payload.error ? { error: payload.error } : { status: payload.status }),
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
    });
  }

  @OnEvent(ExecutionEventName.NODE_INTERVENTION_RESOLVED)
  async handleInterventionResolved(
    payload: InterventionEvidencePayload,
  ): Promise<void> {
    await runInTenantTransaction(this.db, payload.tenantId, async (tenantDb) => {
      const step = await this.findExecutionStep(tenantDb, payload.stepId);
      if (!step || step.executionId !== payload.executionId) {
        this.logger.warn(
          `Skip intervention evidence creation because step ${payload.stepId} is unavailable for execution ${payload.executionId}`,
        );
        return;
      }

      const checkpoint =
        (step.checkpointData as Record<string, unknown> | null) ?? {};
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
    });
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
        grouped[index]?.forEach((entry) => entry.reject(result.reason));
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
      overrideParentEvidenceId ?? dto.parentEvidenceId ?? inputPacket.parentEvidenceId;

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
    const nodeData =
      (step.nodeData as Record<string, unknown> | null) ?? {};

    return (
      this.readString(nodeData, ['agentName', 'name', 'label']) ?? step.nodeId
    );
  }

  private resolveAutonomyMode(step: ExecutionStepRecord): string {
    const nodeData =
      (step.nodeData as Record<string, unknown> | null) ?? {};

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
    return (
      status === 'completed' || status === 'failed' || status === 'denied'
    );
  }

  // -- Chain methods (Story 6-2) --

  private static readonly CHAIN_CACHE_TTL = 300;
  private static readonly CHAIN_MAX_DEPTH = 50;

  async buildChain(
    tenantId: string,
    executionId: string,
    nodeId?: string,
  ): Promise<{ response: EvidenceChainResponse; cached: boolean }> {
    const cacheKey = `evidence:chain:${executionId}:${nodeId ?? 'all'}`;

    try {
      const cached = await this.cacheService.get(cacheKey);
      if (cached) {
        return { response: JSON.parse(cached), cached: true };
      }
    } catch {
      this.logger.warn('Redis cache read failed for chain, proceeding without cache');
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
        const packet = this.validateStoredPacket(record.packet);
        const computedHash = this.computeContentHash(packet);
        hashResults.set(
          record.id,
          this.compareHashes(record.contentHash, computedHash),
        );
      } catch {
        hashResults.set(record.id, false);
      }
    }

    const integrityIssues: IntegrityIssue[] = [];
    const roots = this.flatToTree(
      flatRecords,
      sourceStatusMap,
      hashResults,
      integrityIssues,
    );

    const totalNodes = flatRecords.length;
    const issueNodeIds = new Set(integrityIssues.map((i) => i.evidenceId));
    const chainCompleteness =
      totalNodes === 0 ? 1 : (totalNodes - issueNodeIds.size) / totalNodes;

    const response: EvidenceChainResponse = {
      roots,
      chainCompleteness,
      totalNodes,
      integrityIssues,
    };

    try {
      await this.cacheService.set(
        cacheKey,
        JSON.stringify(response),
        EvidenceService.CHAIN_CACHE_TTL,
      );
    } catch {
      this.logger.warn('Redis cache write failed for chain');
    }

    return { response, cached: false };
  }

  async verifyChainIntegrity(
    tenantId: string,
    executionId: string,
    nodeId?: string,
  ): Promise<EvidenceChainResponse> {
    const { response } = await this.buildChain(tenantId, executionId, nodeId);
    return response;
  }

  private async fetchChainRecords(
    tenantId: string,
    executionId: string,
    nodeId?: string,
  ): Promise<FlatChainRecord[]> {
    const tenantDb = getTenantDb(this.db);
    const baseCondition = nodeId
      ? sql`er.id = ${nodeId}`
      : sql`er.parent_evidence_id IS NULL`;

    const result = await tenantDb.execute(sql`
      WITH RECURSIVE chain AS (
        SELECT er.id, er.execution_id, er.step_id, er.tenant_id,
               er.source_type, er.packet, er.content_hash,
               er.parent_evidence_id, er.created_at, 0 AS depth
        FROM evidence_records er
        WHERE er.execution_id = ${executionId}
          AND er.tenant_id = ${tenantId}
          AND ${baseCondition}

        UNION ALL

        SELECT er.id, er.execution_id, er.step_id, er.tenant_id,
               er.source_type, er.packet, er.content_hash,
               er.parent_evidence_id, er.created_at, c.depth + 1
        FROM evidence_records er
        INNER JOIN chain c ON er.parent_evidence_id = c.id
        WHERE c.depth < ${EvidenceService.CHAIN_MAX_DEPTH}
      )
      SELECT * FROM chain
      ORDER BY depth ASC, created_at ASC
    `);

    const rows = (result as { rows?: unknown[] }).rows ?? result;
    return (rows as Record<string, unknown>[]).map((row) => ({
      id: String(row.id),
      executionId: String(row.execution_id),
      stepId: String(row.step_id),
      tenantId: String(row.tenant_id),
      sourceType: String(row.source_type),
      packet: row.packet,
      contentHash: String(row.content_hash),
      parentEvidenceId: row.parent_evidence_id
        ? String(row.parent_evidence_id)
        : null,
      createdAt:
        row.created_at instanceof Date
          ? row.created_at
          : new Date(String(row.created_at)),
      depth: Number(row.depth),
    }));
  }

  private async checkSourceAvailability(
    records: FlatChainRecord[],
  ): Promise<Map<string, SourceStatus>> {
    const statusMap = new Map<string, SourceStatus>();
    const chunkLookups = new Map<
      string,
      { evidenceId: string; retrievedContent: string }
    >();

    for (const record of records) {
      if (record.sourceType === 'rag_retrieval') {
        const packet = record.packet as Record<string, unknown>;
        const physLoc = packet.physicalLocation as
          | Record<string, unknown>
          | undefined;
        const chunkId = physLoc?.chunkId as string | undefined;
        if (chunkId) {
          chunkLookups.set(chunkId, {
            evidenceId: record.id,
            retrievedContent: (packet.retrievedContent as string) ?? '',
          });
        } else {
          statusMap.set(record.id, {
            sourceAvailable: true,
            sourceModified: false,
          });
        }
      } else {
        statusMap.set(record.id, {
          sourceAvailable: true,
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

    for (const [chunkId, info] of chunkLookups) {
      const chunkContent = chunkContentMap.get(chunkId);
      if (chunkContent === undefined) {
        statusMap.set(info.evidenceId, {
          sourceAvailable: false,
          sourceModified: false,
          unavailableReason: 'Source document chunk has been deleted',
        });
      } else {
        const modified = chunkContent !== info.retrievedContent;
        statusMap.set(info.evidenceId, {
          sourceAvailable: true,
          sourceModified: modified,
          ...(modified
            ? {
                unavailableReason:
                  'Source document chunk content has been modified',
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
    integrityIssues: IntegrityIssue[],
  ): EvidenceChainNode[] {
    const nodeMap = new Map<string, EvidenceChainNode>();

    for (const record of records) {
      const status = sourceStatus.get(record.id) ?? {
        sourceAvailable: true,
        sourceModified: false,
      };
      const hashValid = hashResults.get(record.id) ?? false;

      const node: EvidenceChainNode = {
        evidenceId: record.id,
        executionId: record.executionId,
        stepId: record.stepId,
        sourceType: record.sourceType as EvidenceChainNode['sourceType'],
        contentHash: record.contentHash,
        parentEvidenceId: record.parentEvidenceId,
        createdAt: record.createdAt.toISOString(),
        depth: record.depth,
        sourceAvailable: status.sourceAvailable,
        sourceModified: status.sourceModified,
        ...(status.unavailableReason
          ? { unavailableReason: status.unavailableReason }
          : {}),
        hashValid,
        children: [],
      };

      if (!hashValid) {
        integrityIssues.push({
          evidenceId: record.id,
          issue: 'Content hash verification failed',
          severity: 'error',
        });
      }
      if (!status.sourceAvailable) {
        integrityIssues.push({
          evidenceId: record.id,
          issue: status.unavailableReason ?? 'Source unavailable',
          severity: 'warning',
        });
      }
      if (status.sourceModified) {
        integrityIssues.push({
          evidenceId: record.id,
          issue: status.unavailableReason ?? 'Source modified',
          severity: 'warning',
        });
      }

      nodeMap.set(record.id, node);
    }

    const roots: EvidenceChainNode[] = [];
    for (const [, node] of nodeMap) {
      if (node.parentEvidenceId && nodeMap.has(node.parentEvidenceId)) {
        nodeMap.get(node.parentEvidenceId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  private async invalidateChainCache(executionId: string): Promise<void> {
    try {
      await this.cacheService.delByPattern(
        `evidence:chain:${executionId}:*`,
      );
    } catch {
      this.logger.warn('Failed to invalidate chain cache');
    }
  }
}
