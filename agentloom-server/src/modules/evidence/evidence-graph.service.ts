import { Inject, Injectable, Logger } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';

import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { RedisCacheService } from '../../common/redis/redis-cache.service';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { evidenceRecords, executionSteps } from '../../database/schema';

import {
  EvidenceGraphResponseSchema,
  type AgentGraphEdge,
  type AgentGraphNode,
  type EvidenceGraphResponse,
  type GraphTimelineEntry,
} from './dto/evidence-graph.dto';

interface StepInfo {
  nodeId: string;
  nodeData: Record<string, unknown> | null;
  status: string;
}

@Injectable()
export class EvidenceGraphService {
  private readonly logger = new Logger(EvidenceGraphService.name);
  private static readonly GRAPH_CACHE_TTL = 300;

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly cacheService: RedisCacheService,
  ) {}

  async buildGraph(
    tenantId: string,
    executionId: string,
  ): Promise<{ response: EvidenceGraphResponse; cached: boolean }> {
    const cacheKey = `evidence:graph:${executionId}`;

    try {
      const cached = await this.cacheService.get(cacheKey);
      if (cached) {
        const parsedCached: unknown = JSON.parse(cached);
        return {
          response: EvidenceGraphResponseSchema.parse(parsedCached),
          cached: true,
        };
      }
    } catch {
      this.logger.warn(
        'Redis cache read failed for graph, proceeding without cache',
      );
    }

    const tenantDb = getTenantDb(this.db);

    const steps = await tenantDb
      .select({
        id: executionSteps.id,
        nodeId: executionSteps.nodeId,
        nodeData: executionSteps.nodeData,
        status: executionSteps.status,
      })
      .from(executionSteps)
      .where(eq(executionSteps.executionId, executionId));

    const stepMap = new Map<string, StepInfo>();
    const nodeStepMap = new Map<string, StepInfo & { stepId: string }>();

    for (const step of steps) {
      const info: StepInfo = {
        nodeId: step.nodeId,
        nodeData: step.nodeData,
        status: step.status,
      };
      stepMap.set(step.id, info);
      nodeStepMap.set(step.nodeId, { ...info, stepId: step.id });
    }

    const evidences = await tenantDb
      .select({
        id: evidenceRecords.id,
        stepId: evidenceRecords.stepId,
        sourceType: evidenceRecords.sourceType,
        parentEvidenceId: evidenceRecords.parentEvidenceId,
        createdAt: evidenceRecords.createdAt,
      })
      .from(evidenceRecords)
      .where(eq(evidenceRecords.executionId, executionId))
      .orderBy(asc(evidenceRecords.createdAt));

    if (evidences.length === 0) {
      const emptyResponse: EvidenceGraphResponse = {
        nodes: [],
        edges: [],
        timeline: [],
      };
      return { response: emptyResponse, cached: false };
    }

    const evidenceToNodeId = new Map<string, string>();
    const nodeEvidences = new Map<
      string,
      { count: number; firstAt: Date | null; lastAt: Date | null }
    >();

    for (const evidence of evidences) {
      const stepInfo = stepMap.get(evidence.stepId);
      if (!stepInfo) continue;

      const nodeId = stepInfo.nodeId;
      evidenceToNodeId.set(evidence.id, nodeId);

      const existing = nodeEvidences.get(nodeId) ?? {
        count: 0,
        firstAt: null,
        lastAt: null,
      };
      existing.count++;

      const createdAt = evidence.createdAt;
      if (!existing.firstAt || createdAt < existing.firstAt) {
        existing.firstAt = createdAt;
      }
      if (!existing.lastAt || createdAt > existing.lastAt) {
        existing.lastAt = createdAt;
      }

      nodeEvidences.set(nodeId, existing);
    }

    const nodes: AgentGraphNode[] = [];
    for (const [nodeId, evidenceData] of nodeEvidences.entries()) {
      const stepInfo = nodeStepMap.get(nodeId);
      const nodeData = stepInfo?.nodeData;
      const nodeName = (nodeData?.label as string) ?? nodeId;
      const nodeType = (nodeData?.type as string) ?? 'unknown';

      nodes.push({
        id: nodeId,
        nodeId,
        nodeName,
        nodeType,
        executionStatus: stepInfo?.status ?? 'unknown',
        evidenceCount: evidenceData.count,
        firstEvidenceAt: evidenceData.firstAt?.toISOString() ?? null,
        lastEvidenceAt: evidenceData.lastAt?.toISOString() ?? null,
      });
    }

    const edgeMap = new Map<
      string,
      {
        sourceNodeId: string;
        targetNodeId: string;
        evidenceLinks: number;
        sourceTypes: Set<string>;
      }
    >();

    for (const evidence of evidences) {
      if (!evidence.parentEvidenceId) continue;

      const currentNodeId = evidenceToNodeId.get(evidence.id);
      const parentNodeId = evidenceToNodeId.get(evidence.parentEvidenceId);

      if (!currentNodeId || !parentNodeId || currentNodeId === parentNodeId)
        continue;

      const edgeKey = `${parentNodeId}->${currentNodeId}`;
      const existing = edgeMap.get(edgeKey) ?? {
        sourceNodeId: parentNodeId,
        targetNodeId: currentNodeId,
        evidenceLinks: 0,
        sourceTypes: new Set<string>(),
      };
      existing.evidenceLinks++;
      existing.sourceTypes.add(evidence.sourceType);
      edgeMap.set(edgeKey, existing);
    }

    const edges: AgentGraphEdge[] = [];
    for (const [edgeId, edgeData] of edgeMap.entries()) {
      edges.push({
        id: edgeId,
        sourceNodeId: edgeData.sourceNodeId,
        targetNodeId: edgeData.targetNodeId,
        evidenceLinks: edgeData.evidenceLinks,
        dataTypeSummary: [...edgeData.sourceTypes].join(' → '),
      });
    }

    const timeline = this.buildTimeline(evidences, evidenceToNodeId, nodes);

    const response: EvidenceGraphResponse = { nodes, edges, timeline };

    try {
      await this.cacheService.set(
        cacheKey,
        JSON.stringify(response),
        EvidenceGraphService.GRAPH_CACHE_TTL,
      );
    } catch {
      this.logger.warn('Redis cache write failed for graph');
    }

    return { response, cached: false };
  }

  private buildTimeline(
    evidences: Array<{
      id: string;
      stepId: string;
      sourceType: string;
      parentEvidenceId: string | null;
      createdAt: Date;
    }>,
    evidenceToNodeId: Map<string, string>,
    nodes: AgentGraphNode[],
  ): GraphTimelineEntry[] {
    const timeline: GraphTimelineEntry[] = [];
    const nodeFirstSeen = new Set<string>();
    const edgeFirstSeen = new Set<string>();

    for (const evidence of evidences) {
      const nodeId = evidenceToNodeId.get(evidence.id);
      if (!nodeId) continue;

      if (!nodeFirstSeen.has(nodeId)) {
        nodeFirstSeen.add(nodeId);
        const nodeName =
          nodes.find((n) => n.nodeId === nodeId)?.nodeName ?? nodeId;
        timeline.push({
          timestamp: evidence.createdAt.toISOString(),
          type: 'node',
          targetId: nodeId,
          label: `${nodeName} 开始执行`,
        });
      }

      if (evidence.parentEvidenceId) {
        const parentNodeId = evidenceToNodeId.get(evidence.parentEvidenceId);
        if (parentNodeId && parentNodeId !== nodeId) {
          const edgeId = `${parentNodeId}->${nodeId}`;
          if (!edgeFirstSeen.has(edgeId)) {
            edgeFirstSeen.add(edgeId);
            const sourceNode = nodes.find((n) => n.nodeId === parentNodeId);
            const targetNode = nodes.find((n) => n.nodeId === nodeId);
            timeline.push({
              timestamp: evidence.createdAt.toISOString(),
              type: 'edge',
              targetId: edgeId,
              label: `${sourceNode?.nodeName ?? parentNodeId} → ${targetNode?.nodeName ?? nodeId}`,
            });
          }
        }
      }
    }

    return timeline;
  }
}
