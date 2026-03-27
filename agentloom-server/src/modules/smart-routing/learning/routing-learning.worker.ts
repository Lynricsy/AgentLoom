import type { QdrantClient } from '@qdrant/js-client-rest';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Job } from 'bullmq';

import { runInTenantTransaction } from '../../../common/interceptors/tenant-transaction.context';
import type { DrizzleDB } from '../../../database/database.module';
import { routerModels } from '../../../database/schema/router-models.schema';
import { routingDecisions } from '../../../database/schema/routing-decisions.schema';
import { EmbeddingIntegrationService } from '../embedding/embedding.service';
import {
  eloExpectedScore,
  eloUpdateRating,
} from '../strategies/ml/ml-math.utils';
import { MlpTrainerService } from './mlp-trainer.service';
import {
  DEFAULT_ROUTING_LEARNING_CONFIG,
  ROUTING_LEARNING_CONFIG_TOKEN,
  ROUTING_LEARNING_JOB_NAME,
  ROUTING_LEARNING_QUEUE,
  ROUTING_MEMORY_COLLECTION,
  type RoutingLearningConfig,
  type RoutingLearningJob,
} from './routing-learning.types';

type RoutingLearningDb = Pick<DrizzleDB, 'select' | 'update'>;
type RoutingMemoryClient = Pick<QdrantClient, 'upsert'>;
type EmbeddingServiceLike = Pick<
  EmbeddingIntegrationService,
  'generateEmbedding'
>;

interface RoutingDecisionRow {
  modelsEvaluated: Array<{ modelId: string }>;
  selectedModelId: string | null;
}

function readNumber(value: string | number, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampUnitInterval(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeQualityScore(
  value: number | undefined,
  fallback: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return clampUnitInterval(value > 1 ? value / 100 : value);
}

function calculatePerformanceScore(job: RoutingLearningJob): number {
  if (!job.actualPerformance.success) {
    return 0;
  }

  const qualityScore = normalizeQualityScore(
    job.actualPerformance.qualityScore,
    1,
  );
  const latencyScore =
    1 / (1 + Math.max(0, job.actualPerformance.latencyMs) / 2_000);
  const tokenEfficiency =
    1 / (1 + Math.max(0, job.actualPerformance.tokenCount) / 4_000);

  return clampUnitInterval(
    qualityScore * 0.6 + latencyScore * 0.25 + tokenEfficiency * 0.15,
  );
}

@Processor(ROUTING_LEARNING_QUEUE, { concurrency: 10 })
export class RoutingLearningWorker extends WorkerHost {
  private readonly logger = new Logger(RoutingLearningWorker.name);
  private readonly config: RoutingLearningConfig;

  constructor(
    private readonly db: RoutingLearningDb,
    private readonly embeddingService: EmbeddingServiceLike,
    private readonly qdrantClient: RoutingMemoryClient,
    private readonly mlpTrainerService: MlpTrainerService,
    config?: RoutingLearningConfig,
  ) {
    super();
    this.config = config ?? DEFAULT_ROUTING_LEARNING_CONFIG;
  }

  async process(job: Job<RoutingLearningJob>): Promise<void> {
    if (job.name !== ROUTING_LEARNING_JOB_NAME) {
      return;
    }

    await runInTenantTransaction(
      this.db as DrizzleDB,
      job.data.tenantId,
      async () => {
        const performanceScore = calculatePerformanceScore(job.data);
        const [routingDecision] = await this.db
          .select({
            modelsEvaluated: routingDecisions.modelsEvaluated,
            selectedModelId: routingDecisions.selectedModelId,
          })
          .from(routingDecisions)
          .where(
            and(
              eq(routingDecisions.id, job.data.routingDecisionId),
              eq(routingDecisions.executionStepId, job.data.executionStepId),
              eq(routingDecisions.tenantId, job.data.tenantId),
            ),
          );

        const queryEmbedding = await this.embeddingService.generateEmbedding(
          job.data.queryText,
          job.data.tenantId,
        );

        if (queryEmbedding) {
          await this.upsertRoutingMemory(
            job.data,
            queryEmbedding,
            performanceScore,
          );
        } else {
          this.logger.warn(
            `Routing learning skipped Qdrant upsert because embedding is unavailable: ${job.data.routingDecisionId}`,
          );
        }

        await this.updateEloRating(job.data, routingDecision, performanceScore);

        if (this.config.mlpEnabled && queryEmbedding && routingDecision) {
          const candidateModelIds = routingDecision.modelsEvaluated.map(
            (model) => model.modelId,
          );

          await this.mlpTrainerService.recordSample({
            tenantId: job.data.tenantId,
            taskCategory: job.data.taskCategory ?? 'general',
            selectedModelId:
              routingDecision.selectedModelId ?? job.data.selectedModelId,
            candidateModelIds,
            queryEmbedding,
            performanceScore,
          });
        }
      },
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<RoutingLearningJob> | undefined, error: Error): void {
    this.logger.error(
      `Routing learning failed: ${JSON.stringify({
        jobId: job?.id ?? null,
        routingDecisionId: job?.data?.routingDecisionId ?? null,
        executionStepId: job?.data?.executionStepId ?? null,
        tenantId: job?.data?.tenantId ?? null,
        attempt: job?.attemptsMade ?? null,
        error: error.message,
      })}`,
    );
  }

  private async upsertRoutingMemory(
    job: RoutingLearningJob,
    queryEmbedding: number[],
    performanceScore: number,
  ): Promise<void> {
    try {
      await this.qdrantClient.upsert(ROUTING_MEMORY_COLLECTION, {
        wait: false,
        points: [
          {
            id: job.routingDecisionId,
            vector: queryEmbedding,
            payload: {
              tenant_id: job.tenantId,
              model_id: job.selectedModelId,
              task_category: job.taskCategory ?? 'general',
              performance_score: performanceScore,
              token_count: job.actualPerformance.tokenCount,
              latency_ms: job.actualPerformance.latencyMs,
              created_at: new Date().toISOString(),
            },
          },
        ],
      });
    } catch (error: unknown) {
      this.logger.error(
        `Routing learning Qdrant upsert failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async updateEloRating(
    job: RoutingLearningJob,
    routingDecision: RoutingDecisionRow | undefined,
    performanceScore: number,
  ): Promise<void> {
    const candidateModelIds = Array.from(
      new Set([
        job.selectedModelId,
        ...(routingDecision?.modelsEvaluated.map((model) => model.modelId) ??
          []),
      ]),
    );

    for (let attempt = 0; attempt < this.config.occMaxRetries; attempt += 1) {
      const routerRows = await this.db
        .select({
          id: routerModels.id,
          modelId: routerModels.modelId,
          eloRating: routerModels.eloRating,
          totalMatches: routerModels.totalMatches,
          occVersion: routerModels.occVersion,
        })
        .from(routerModels)
        .where(
          and(
            eq(routerModels.tenantId, job.tenantId),
            inArray(routerModels.modelId, candidateModelIds),
          ),
        );

      const selectedRow = routerRows.find(
        (row) => row.modelId === job.selectedModelId,
      );
      if (!selectedRow) {
        this.logger.warn(
          `Routing learning skipped Elo update because router model is missing: ${job.selectedModelId}`,
        );
        return;
      }

      const selectedRating = readNumber(selectedRow.eloRating, 1500);
      const opponentRows = routerRows.filter(
        (row) => row.modelId !== job.selectedModelId,
      );
      const expectedScore =
        opponentRows.length === 0
          ? eloExpectedScore(selectedRating, 1500)
          : opponentRows.reduce(
              (sum, row) =>
                sum +
                eloExpectedScore(
                  selectedRating,
                  readNumber(row.eloRating, 1500),
                ),
              0,
            ) / opponentRows.length;
      const nextRating = eloUpdateRating(
        selectedRating,
        expectedScore,
        performanceScore,
        this.config.eloKFactor,
      );

      const updatedRows = await this.db
        .update(routerModels)
        .set({
          eloRating: nextRating.toFixed(4),
          totalMatches: sql`${routerModels.totalMatches} + 1`,
          occVersion: sql`${routerModels.occVersion} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(routerModels.id, selectedRow.id),
            eq(routerModels.tenantId, job.tenantId),
            eq(routerModels.occVersion, selectedRow.occVersion),
          ),
        )
        .returning({ id: routerModels.id });

      if (updatedRows.length > 0) {
        return;
      }
    }

    this.logger.warn(
      `Routing learning Elo OCC retries exhausted: ${job.routingDecisionId}`,
    );
  }
}
