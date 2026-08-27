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
  evidenceRecords,
  executionSteps,
  knowledgeNodes,
  organizations,
  type NewEvidenceRecord,
} from '../../database/schema';
import {
  ExecutionEventName,
  type InterventionResolvedPayload,
  type StepAgentEventPayload,
  type StepStatusChangedPayload,
  type ToolCallStatusPayload,
} from '../execution/types/execution-event.types';

import type {
  CreateEvidenceRecordDto,
  EvidenceChainNode,
  EvidenceChainResponse,
  EvidenceEncryptionMetadataDto,
  EvidencePacketDto,
  EvidencePacketInputDto,
  EvidencePacketSummary,
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
  LlmEncryptionService,
  type EncryptedPayload,
} from '../llm/llm-encryption.service';
import {
  EvidenceNotFoundException,
  InvalidEvidencePacketException,
} from './evidence.exceptions';

type EvidenceRecordRow = typeof evidenceRecords.$inferSelect;
type EvidenceRecord = Omit<
  EvidenceRecordRow,
  'packet' | 'encryptionMetadata'
> & {
  packet: EvidencePacketDto;
  encryptionMetadata: EvidenceEncryptionMetadataDto | null;
};
type RagEvidenceRecord = EvidenceRecord & {
  packet: Extract<EvidencePacketDto, { sourceType: 'rag_retrieval' }>;
};
type ExecutionStepRecord = typeof executionSteps.$inferSelect;
type PlainEncryptableEvidencePacket =
  | (Extract<EvidencePacketInputDto, { sourceType: 'agent_decision' }> & {
      evidenceId: string;
      contentHash: string;
      timestamp: string;
    })
  | (Extract<EvidencePacketInputDto, { sourceType: 'tool_output' }> & {
      evidenceId: string;
      contentHash: string;
      timestamp: string;
    });

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
type StepFailedEvidencePayload = StepStatusChangedPayload &
  AutomaticEventContext;

interface PreparedEvidenceInsert {
  evidenceId: string;
  insertValue: NewEvidenceRecord;
  packet: EvidencePacketDto;
}

interface EncryptedPacketDraft {
  sourceType: 'agent_decision' | 'tool_output';
  encryptedPacket: EncryptedPayload;
  summary: EvidencePacketSummary;
  parentEvidenceId?: string;
}

interface FlatChainRecord {
  id: string;
  executionId: string;
  stepId: string;
  tenantId: string;
  sourceType: string;
  packet: EvidencePacketDto;
  contentHash: string;
  currentHash: string;
  hashValid: boolean;
  parentEvidenceId: string | null;
  isEncrypted: boolean;
  encryptionMetadata: EvidenceEncryptionMetadataDto | null;
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
  private static readonly ENCRYPTABLE_SOURCE_TYPES: EvidenceSourceType[] = [
    'agent_decision',
    'tool_output',
  ];

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly cacheService: RedisCacheService,
    private readonly llmEncryptionService: LlmEncryptionService,
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

    const normalizedData = data.map(
      (record) => this.projectEvidenceRecord(record).record,
    );
    const enrichedData = includeChunkContent
      ? await this.enrichWithChunkContent(tenantDb, normalizedData)
      : normalizedData;

    return {
      data: enrichedData,
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
      (record): record is RagEvidenceRecord =>
        record.packet.sourceType === 'rag_retrieval',
    );
    if (ragRecords.length === 0) return records;

    const chunkIds = ragRecords
      .map((r) => {
        return r.packet.physicalLocation?.chunkId;
      })
      .filter((id): id is string => !!id);

    if (chunkIds.length === 0) return records;

    const uniqueChunkIds = [...new Set(chunkIds)];
    const chunks = await tenantDb
      .select({ id: knowledgeNodes.id, content: knowledgeNodes.content })
      .from(knowledgeNodes)
      .where(inArray(knowledgeNodes.id, uniqueChunkIds));

    const chunkMap = new Map(chunks.map((c) => [c.id, c.content]));

    return records.map((record) => {
      if (record.packet.sourceType !== 'rag_retrieval') return record;

      const physicalLocation = record.packet.physicalLocation;
      const chunkId = physicalLocation?.chunkId;
      const chunkContent = chunkId ? chunkMap.get(chunkId) : undefined;
      if (!chunkId || chunkContent === undefined) return record;

      return {
        ...record,
        packet: {
          ...record.packet,
          physicalLocation: {
            ...physicalLocation,
            chunkContent,
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
    const record = await this.findByIdRecord(tenantId, executionId, evidenceId);

    return this.projectEvidenceRecord(record).record;
  }

  private async findByIdRecord(
    tenantId: string,
    executionId: string,
    evidenceId: string,
  ): Promise<EvidenceRecordRow> {
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
    const record = await this.findByIdRecord(tenantId, executionId, evidenceId);
    const projection = this.projectEvidenceRecord(record);

    return {
      evidenceId,
      valid: projection.hashValid,
      integrityWarning: !projection.hashValid,
      currentHash: projection.currentHash,
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

  @OnEvent(ExecutionEventName.STEP_STATUS_CHANGED)
  async handleStepFailed(payload: StepFailedEvidencePayload): Promise<void> {
    if (payload.to !== 'failed' || !payload.errorDetail) {
      return;
    }

    await runInTenantTransaction(
      this.db,
      payload.tenantId,
      async (tenantDb) => {
        const step = await this.findExecutionStep(tenantDb, payload.stepId);
        if (!step || step.executionId !== payload.executionId) {
          this.logger.warn(
            `Skip node error evidence creation because step ${payload.stepId} is unavailable for execution ${payload.executionId}`,
          );
          return;
        }

        const parentEvidenceId = await this.findLatestEvidenceIdForStep(
          tenantDb,
          payload.executionId,
          payload.stepId,
        );

        const errorDetail = payload.errorDetail!;
        const completeTypeMismatch =
          errorDetail.typeMismatch?.sourcePortId &&
          errorDetail.typeMismatch.targetPortId
            ? {
                sourcePortId: errorDetail.typeMismatch.sourcePortId,
                targetPortId: errorDetail.typeMismatch.targetPortId,
                sourceType: errorDetail.typeMismatch.sourceType,
                targetType: errorDetail.typeMismatch.targetType,
                sourceNodeId: errorDetail.typeMismatch.sourceNodeId,
                targetNodeId: errorDetail.typeMismatch.targetNodeId,
                ...(errorDetail.typeMismatch.edgeId
                  ? { edgeId: errorDetail.typeMismatch.edgeId }
                  : {}),
              }
            : undefined;
        const dto: CreateEvidenceRecordDto = {
          stepId: payload.stepId,
          sourceType: 'node_error',
          ...(parentEvidenceId ? { parentEvidenceId } : {}),
          packet: {
            sourceType: 'node_error',
            ...(parentEvidenceId ? { parentEvidenceId } : {}),
            nodeError: {
              nodeId: payload.nodeId,
              errorMessage: errorDetail.message,
              ...(errorDetail.type ? { errorType: errorDetail.type } : {}),
              ...(errorDetail.title ? { errorTitle: errorDetail.title } : {}),
              ...(errorDetail.detail
                ? { errorDetail: errorDetail.detail }
                : {}),
              ...(errorDetail.stack ? { stack: errorDetail.stack } : {}),
              ...(completeTypeMismatch
                ? { typeMismatch: completeTypeMismatch }
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
    const storedPacket = this.buildStoredPacket(
      packetWithoutMetadata,
      evidenceId,
      timestamp,
    );

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
        contentHash: storedPacket.contentHash,
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

    await this.maybeEncryptEvidenceRecords(prepared);

    const records = await tenantDb
      .insert(evidenceRecords)
      .values(prepared.map((entry) => entry.insertValue))
      .returning();

    const executionId = prepared[0]?.insertValue.executionId;
    if (executionId) {
      void this.invalidateChainCache(executionId);
    }

    return records.map((record) => this.projectEvidenceRecord(record).record);
  }

  private async maybeEncryptEvidenceRecords(
    prepared: PreparedEvidenceInsert[],
  ): Promise<void> {
    const encryptable = prepared.filter((p) =>
      EvidenceService.ENCRYPTABLE_SOURCE_TYPES.includes(
        p.insertValue.sourceType,
      ),
    );

    if (encryptable.length === 0) return;

    const tenantId = encryptable[0].insertValue.tenantId;
    let orgId: string | null = null;

    try {
      orgId = await this.resolveOrgId(tenantId);
    } catch {
      return;
    }

    if (!orgId) return;

    let enabled: boolean;
    try {
      enabled = await this.llmEncryptionService.isE2EEEnabled(tenantId, orgId);
    } catch {
      return;
    }

    if (!enabled) return;

    for (const entry of encryptable) {
      if (!this.isPlainEncryptablePacket(entry.packet)) {
        continue;
      }

      const packet: PlainEncryptableEvidencePacket = entry.packet;

      try {
        const plaintextHash = packet.contentHash;
        const contentToEncrypt = JSON.stringify(packet);
        const encrypted = await this.llmEncryptionService.encryptForTenant(
          tenantId,
          orgId,
          contentToEncrypt,
        );

        const encryptedPacket = this.buildStoredPacket(
          {
            sourceType: packet.sourceType,
            encryptedPacket: encrypted,
            summary: this.buildEncryptedPacketSummary(packet),
            ...(packet.parentEvidenceId
              ? { parentEvidenceId: packet.parentEvidenceId }
              : {}),
          },
          packet.evidenceId,
          packet.timestamp,
        );

        entry.packet = encryptedPacket;
        entry.insertValue.packet = encryptedPacket;
        entry.insertValue.contentHash = encryptedPacket.contentHash;
        entry.insertValue.isEncrypted = true;
        entry.insertValue.encryptionMetadata = {
          isEncrypted: true,
          algorithm: encrypted.algorithm,
          keyFingerprint: encrypted.keyFingerprint,
          encryptedAt: new Date().toISOString(),
          plaintextHash,
          contractVersion: 2,
        };

        this.logger.debug(
          `E2EE: 已加密证据记录 ${entry.evidenceId} (sourceType: ${entry.insertValue.sourceType})`,
        );
      } catch (encryptionError) {
        this.logger.warn(
          `E2EE: 证据加密失败，保留明文: ${encryptionError instanceof Error ? encryptionError.message : String(encryptionError)}`,
          { evidenceId: entry.evidenceId },
        );
      }
    }
  }

  private async resolveOrgId(tenantId: string): Promise<string | null> {
    const result = await getTenantDb(this.db)
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.tenantId, tenantId))
      .limit(1);
    return result[0]?.id ?? null;
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

  private buildStoredPacket(
    packetWithoutMetadata: EvidencePacketInputDto | EncryptedPacketDraft,
    evidenceId: string,
    timestamp: string,
  ): EvidencePacketDto {
    const contentHash = this.computeContentHash(packetWithoutMetadata);

    return this.validateStoredPacket({
      ...packetWithoutMetadata,
      evidenceId,
      contentHash,
      timestamp,
    });
  }

  private computeContentHash(
    packet: EvidencePacketInputDto | EvidencePacketDto | EncryptedPacketDraft,
  ): string {
    const hashSource = this.extractHashSource(packet);
    const normalized = this.normalizeForHash(hashSource);
    const serialized = JSON.stringify(normalized);

    return createHash('sha256').update(serialized).digest('hex');
  }

  private extractHashSource(
    packet: EvidencePacketInputDto | EvidencePacketDto | EncryptedPacketDraft,
  ): Record<string, unknown> {
    if ('encryptedPacket' in packet) {
      return {
        sourceType: packet.sourceType,
        encryptedPacket: packet.encryptedPacket,
        summary: packet.summary,
      };
    }

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
      case 'node_error':
        return {
          sourceType: packet.sourceType,
          nodeError: packet.nodeError,
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

    const { roots, integrityIssues } = this.flatToTree(
      flatRecords,
      sourceStatusMap,
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

    // 注意：chain CTE 的两个分支必须投影出外层 SELECT 用到的**全部**列。
    // is_encrypted / encryption_metadata 曾只出现在外层 SELECT 与 GROUP BY 里，
    // 而 CTE 没有带出来，导致 Postgres 直接报 column does not exist——
    // 证据溯源链端点与证据导出 worker 因此双双 500。
    const result = await tenantDb.execute(sql`
      WITH RECURSIVE chain AS (
        SELECT er.id,
               er.execution_id,
               er.step_id,
               er.tenant_id,
               er.source_type,
               er.packet,
               er.content_hash,
               er.is_encrypted,
               er.encryption_metadata,
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
               parent.is_encrypted,
               parent.encryption_metadata,
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
             is_encrypted,
             encryption_metadata,
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
               is_encrypted,
               encryption_metadata,
               parent_evidence_id,
               created_at
      ORDER BY created_at ASC, id ASC
    `);

    const rows = (result as { rows?: unknown[] }).rows ?? result;
    return (rows as Record<string, unknown>[]).map<FlatChainRecord>((row) => {
      const rawRecord: EvidenceRecord = {
        id: String(row.id),
        executionId: String(row.execution_id),
        stepId: String(row.step_id),
        tenantId: String(row.tenant_id),
        sourceType: row.source_type as EvidenceRecord['sourceType'],
        packet: row.packet as EvidenceRecord['packet'],
        contentHash: String(row.content_hash),
        parentEvidenceId:
          row.parent_evidence_id == null
            ? null
            : this.serializePreview(row.parent_evidence_id),
        isEncrypted: Boolean(row.is_encrypted),
        encryptionMetadata:
          row.encryption_metadata == null
            ? null
            : (row.encryption_metadata as EvidenceRecord['encryptionMetadata']),
        createdAt:
          row.created_at instanceof Date
            ? row.created_at
            : new Date(String(row.created_at)),
      };
      const projection = this.projectEvidenceRecord(rawRecord);

      return {
        id: projection.record.id,
        executionId: projection.record.executionId,
        stepId: projection.record.stepId,
        tenantId: projection.record.tenantId,
        sourceType: projection.record.sourceType,
        packet: projection.record.packet,
        contentHash: projection.record.contentHash,
        currentHash: projection.currentHash,
        hashValid: projection.hashValid,
        parentEvidenceId: projection.record.parentEvidenceId,
        isEncrypted: projection.record.isEncrypted,
        encryptionMetadata: projection.record.encryptionMetadata,
        createdAt: projection.record.createdAt,
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
      .select({ id: knowledgeNodes.id, content: knowledgeNodes.content })
      .from(knowledgeNodes)
      .where(inArray(knowledgeNodes.id, chunkIds));

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
  ): { roots: EvidenceChainNode[]; integrityIssues: IntegrityIssue[] } {
    const nodeMap = new Map<string, EvidenceChainNode>();
    const integrityIssues: IntegrityIssue[] = [];

    for (const record of records) {
      const status = sourceStatus.get(record.id) ?? {
        sourceUnavailable: false,
        sourceModified: false,
      };
      const hashValid = record.hashValid;

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
        ...(record.isEncrypted ? { isEncrypted: true } : {}),
        ...(record.encryptionMetadata
          ? { encryptionMetadata: record.encryptionMetadata }
          : {}),
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
    if ('encryptedPacket' in packet) {
      return packet.summary;
    }

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
      case 'node_error':
        return {
          title: `节点错误${packet.nodeError.errorType ? ` · ${packet.nodeError.errorType}` : ''}`,
          excerpt: this.truncatePreview(
            packet.nodeError.errorTitle ?? packet.nodeError.errorMessage,
          ),
          metadata: {
            nodeId: packet.nodeError.nodeId,
            ...(packet.nodeError.errorType
              ? { errorType: packet.nodeError.errorType }
              : {}),
            ...(packet.nodeError.typeMismatch
              ? {
                  sourceType: packet.nodeError.typeMismatch.sourceType,
                  targetType: packet.nodeError.typeMismatch.targetType,
                }
              : {}),
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

  private projectEvidenceRecord(record: EvidenceRecordRow): {
    record: EvidenceRecord;
    currentHash: string;
    hashValid: boolean;
  } {
    const packet = this.normalizeStoredPacket(record);
    const currentHash = this.computeContentHash(packet);
    const hashValid = this.matchesRecordHash(record, currentHash);
    const encryptionMetadata = this.normalizeEncryptionMetadata(record, packet);

    return {
      record: {
        ...record,
        packet,
        encryptionMetadata,
      },
      currentHash,
      hashValid,
    };
  }

  private normalizeStoredPacket(record: EvidenceRecordRow): EvidencePacketDto {
    const packet = this.validateStoredPacket(record.packet);
    if (!record.isEncrypted || 'encryptedPacket' in packet) {
      return packet;
    }

    const legacyPayload =
      this.readLegacyEncryptedPayload(record.encryptionMetadata) ??
      this.buildSyntheticEncryptedPayload(record.encryptionMetadata);

    if (
      packet.sourceType !== 'agent_decision' &&
      packet.sourceType !== 'tool_output'
    ) {
      return packet;
    }

    return this.validateStoredPacket({
      sourceType: packet.sourceType,
      encryptedPacket: legacyPayload,
      summary: this.buildEncryptedPacketSummary(packet),
      evidenceId: packet.evidenceId,
      contentHash: record.contentHash,
      timestamp: packet.timestamp,
      ...(packet.parentEvidenceId
        ? { parentEvidenceId: packet.parentEvidenceId }
        : {}),
    });
  }

  private normalizeEncryptionMetadata(
    record: EvidenceRecordRow,
    packet: EvidencePacketDto,
  ): EvidenceEncryptionMetadataDto | null {
    if (!record.isEncrypted && !record.encryptionMetadata) {
      return null;
    }

    const metadata = record.encryptionMetadata;
    const payload =
      'encryptedPacket' in packet ? packet.encryptedPacket : undefined;

    return {
      isEncrypted: record.isEncrypted,
      ...(typeof metadata?.keyFingerprint === 'string' ||
      payload?.keyFingerprint
        ? {
            keyFingerprint:
              (typeof metadata?.keyFingerprint === 'string'
                ? metadata.keyFingerprint
                : undefined) ?? payload?.keyFingerprint,
          }
        : {}),
      ...(typeof metadata?.algorithm === 'string' || payload?.algorithm
        ? {
            algorithm:
              (typeof metadata?.algorithm === 'string'
                ? metadata.algorithm
                : undefined) ?? payload?.algorithm,
          }
        : {}),
      ...(typeof metadata?.encryptedAt === 'string'
        ? { encryptedAt: metadata.encryptedAt }
        : {}),
      ...(typeof metadata?.plaintextHash === 'string'
        ? { plaintextHash: metadata.plaintextHash }
        : {}),
      ...(typeof metadata?.contractVersion === 'number'
        ? { contractVersion: metadata.contractVersion }
        : {}),
    };
  }

  private matchesRecordHash(
    record: EvidenceRecordRow,
    currentHash: string,
  ): boolean {
    if (this.compareHashes(record.contentHash, currentHash)) {
      return true;
    }

    const legacyPayload = this.readLegacyEncryptedPayload(
      record.encryptionMetadata,
    );
    if (!record.isEncrypted || !legacyPayload) {
      return false;
    }

    const legacyHash = createHash('sha256')
      .update(legacyPayload.ciphertext)
      .digest('hex');

    return this.compareHashes(record.contentHash, legacyHash);
  }

  private readLegacyEncryptedPayload(
    metadata: EvidenceRecordRow['encryptionMetadata'],
  ): EncryptedPayload | undefined {
    if (!metadata || typeof metadata !== 'object') {
      return undefined;
    }

    const value = metadata.encryptedPayload;
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    return this.validateEncryptedPayload(value);
  }

  private buildSyntheticEncryptedPayload(
    metadata: EvidenceRecordRow['encryptionMetadata'],
  ): EncryptedPayload {
    const raw = metadata;

    return {
      ciphertext: '',
      encryptedSessionKey: '',
      iv: '',
      authTag: '',
      aad: '',
      keyFingerprint:
        typeof raw?.keyFingerprint === 'string' ? raw.keyFingerprint : '',
      algorithm:
        typeof raw?.algorithm === 'string'
          ? raw.algorithm
          : 'RSA-OAEP-4096+AES-256-GCM',
    };
  }

  private validateEncryptedPayload(value: unknown): EncryptedPayload {
    if (!value || typeof value !== 'object') {
      return this.buildSyntheticEncryptedPayload(null);
    }

    const payload = value as unknown as Record<string, unknown>;
    return {
      ciphertext:
        typeof payload.ciphertext === 'string' ? payload.ciphertext : '',
      encryptedSessionKey:
        typeof payload.encryptedSessionKey === 'string'
          ? payload.encryptedSessionKey
          : '',
      iv: typeof payload.iv === 'string' ? payload.iv : '',
      authTag: typeof payload.authTag === 'string' ? payload.authTag : '',
      aad: typeof payload.aad === 'string' ? payload.aad : '',
      keyFingerprint:
        typeof payload.keyFingerprint === 'string'
          ? payload.keyFingerprint
          : '',
      algorithm:
        typeof payload.algorithm === 'string'
          ? payload.algorithm
          : 'RSA-OAEP-4096+AES-256-GCM',
    };
  }

  private buildEncryptedPacketSummary(
    packet: PlainEncryptableEvidencePacket,
  ): EvidencePacketSummary {
    if (packet.sourceType === 'agent_decision') {
      return {
        title: `Agent 决策 · ${packet.agentDecision.agentName}`,
        metadata: {
          nodeId: packet.agentDecision.nodeId,
          selectedAction: packet.agentDecision.selectedAction,
          autonomyMode: packet.agentDecision.autonomyMode,
          ...(packet.agentDecision.confidence !== undefined
            ? { confidence: packet.agentDecision.confidence.toFixed(2) }
            : {}),
        },
      };
    }

    const lastTransition = packet.toolOutput.transitions?.at(-1);
    return {
      title: `工具输出 · ${packet.toolOutput.toolName}`,
      metadata: {
        ...(packet.toolOutput.toolCallId
          ? { toolCallId: packet.toolOutput.toolCallId }
          : {}),
        ...(lastTransition ? { status: lastTransition.to } : {}),
      },
    };
  }

  private isPlainEncryptablePacket(
    packet: EvidencePacketDto,
  ): packet is PlainEncryptableEvidencePacket {
    return (
      (packet.sourceType === 'agent_decision' && 'agentDecision' in packet) ||
      (packet.sourceType === 'tool_output' && 'toolOutput' in packet)
    );
  }
}
