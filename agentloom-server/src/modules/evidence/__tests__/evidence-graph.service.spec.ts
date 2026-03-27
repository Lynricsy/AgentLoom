import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { RedisCacheService } from '../../../common/redis/redis-cache.service';
import { DRIZZLE } from '../../../database/database.module';
import { EvidenceGraphService } from '../evidence-graph.service';

// ─── Mocks ───────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  tenantDb: {
    select: vi.fn(),
  },
  getTenantDb: vi.fn(),
  cacheService: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    delByPattern: vi.fn(),
  },
}));

vi.mock('../../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: mocks.getTenantDb,
}));

// ─── Constants ───────────────────────────────────────────
const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const EXECUTION_ID = '00000000-0000-4000-8000-000000000002';
const STEP_ID_A = '00000000-0000-4000-8000-000000000010';
const STEP_ID_B = '00000000-0000-4000-8000-000000000011';
const STEP_ID_C = '00000000-0000-4000-8000-000000000012';
const NODE_ID_A = 'node-writer';
const NODE_ID_B = 'node-reviewer';
const NODE_ID_C = 'node-publisher';
const EVIDENCE_1 = '00000000-0000-7000-8000-000000000101';
const EVIDENCE_2 = '00000000-0000-7000-8000-000000000102';
const EVIDENCE_3 = '00000000-0000-7000-8000-000000000103';
const EVIDENCE_4 = '00000000-0000-7000-8000-000000000104';
const EVIDENCE_5 = '00000000-0000-7000-8000-000000000105';

const T0 = new Date('2026-03-10T10:00:00.000Z');
const T1 = new Date('2026-03-10T10:01:00.000Z');
const T2 = new Date('2026-03-10T10:02:00.000Z');
const T3 = new Date('2026-03-10T10:03:00.000Z');
const T4 = new Date('2026-03-10T10:04:00.000Z');

// ─── Helpers ─────────────────────────────────────────────
function createSelectChain<T>(terminal: 'where' | 'orderBy', result: T) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
  };

  chain.from.mockReturnValue(chain);

  if (terminal === 'where') {
    chain.where.mockResolvedValue(result);
  } else {
    chain.where.mockReturnValue(chain);
  }

  if (terminal === 'orderBy') {
    chain.orderBy.mockResolvedValue(result);
  } else {
    chain.orderBy.mockReturnValue(chain);
  }

  return chain;
}

interface StepRow {
  id: string;
  nodeId: string;
  nodeData: Record<string, unknown> | null;
  status: string;
}

interface EvidenceRow {
  id: string;
  stepId: string;
  sourceType: string;
  parentEvidenceId: string | null;
  createdAt: Date;
}

function makeStep(
  id: string,
  nodeId: string,
  label: string,
  type = 'agent',
  status = 'completed',
): StepRow {
  return { id, nodeId, nodeData: { label, type }, status };
}

function makeEvidence(
  id: string,
  stepId: string,
  sourceType: string,
  createdAt: Date,
  parentEvidenceId: string | null = null,
): EvidenceRow {
  return { id, stepId, sourceType, parentEvidenceId, createdAt };
}

function setupQueries(steps: StepRow[], evidences: EvidenceRow[]) {
  const stepsChain = createSelectChain('where', steps);
  const evidencesChain = createSelectChain('orderBy', evidences);
  mocks.tenantDb.select
    .mockReturnValueOnce(stepsChain)
    .mockReturnValueOnce(evidencesChain);
}

// ─── Tests ───────────────────────────────────────────────
describe('EvidenceGraphService', () => {
  let service: EvidenceGraphService;

  beforeEach(async () => {
    mocks.tenantDb.select.mockReset();
    mocks.getTenantDb.mockReset();
    mocks.cacheService.get.mockReset();
    mocks.cacheService.set.mockReset();
    mocks.cacheService.del.mockReset();
    mocks.cacheService.delByPattern.mockReset();

    mocks.getTenantDb.mockReturnValue(mocks.tenantDb);
    mocks.cacheService.get.mockResolvedValue(null);
    mocks.cacheService.set.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EvidenceGraphService,
        { provide: DRIZZLE, useValue: {} },
        { provide: RedisCacheService, useValue: mocks.cacheService },
      ],
    }).compile();

    service = module.get(EvidenceGraphService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('empty execution', () => {
    it('should return empty graph when no evidence records exist', async () => {
      setupQueries([makeStep(STEP_ID_A, NODE_ID_A, 'Writer')], []);

      const { response, cached } = await service.buildGraph(
        TENANT_ID,
        EXECUTION_ID,
      );

      expect(cached).toBe(false);
      expect(response).toEqual({
        nodes: [],
        edges: [],
        timeline: [],
      });
      // 空结果不应缓存
      expect(mocks.cacheService.set).not.toHaveBeenCalled();
    });

    it('should return empty graph when no steps exist', async () => {
      setupQueries([], []);

      const { response } = await service.buildGraph(TENANT_ID, EXECUTION_ID);

      expect(response.nodes).toEqual([]);
      expect(response.edges).toEqual([]);
      expect(response.timeline).toEqual([]);
    });
  });

  describe('single node', () => {
    it('should aggregate all evidence for a single node without edges', async () => {
      const steps = [makeStep(STEP_ID_A, NODE_ID_A, 'Writer Agent')];
      const evidences = [
        makeEvidence(EVIDENCE_1, STEP_ID_A, 'agent_decision', T0),
        makeEvidence(EVIDENCE_2, STEP_ID_A, 'tool_output', T1, EVIDENCE_1),
        makeEvidence(EVIDENCE_3, STEP_ID_A, 'rag_retrieval', T2, EVIDENCE_2),
      ];
      setupQueries(steps, evidences);

      const { response } = await service.buildGraph(TENANT_ID, EXECUTION_ID);

      expect(response.nodes).toHaveLength(1);
      expect(response.nodes[0]).toEqual({
        id: NODE_ID_A,
        nodeId: NODE_ID_A,
        nodeName: 'Writer Agent',
        nodeType: 'agent',
        executionStatus: 'completed',
        evidenceCount: 3,
        firstEvidenceAt: T0.toISOString(),
        lastEvidenceAt: T2.toISOString(),
      });
      // 同一节点内的 parent→child 不产生跨节点边
      expect(response.edges).toEqual([]);
      // Timeline 应有 1 个 node 入口
      expect(response.timeline).toHaveLength(1);
      expect(response.timeline[0]).toEqual({
        timestamp: T0.toISOString(),
        type: 'node',
        targetId: NODE_ID_A,
        label: 'Writer Agent 开始执行',
      });
    });
  });

  describe('serial chain (A→B→C)', () => {
    it('should derive cross-node edges from parent evidence links', async () => {
      const steps = [
        makeStep(STEP_ID_A, NODE_ID_A, 'Writer'),
        makeStep(STEP_ID_B, NODE_ID_B, 'Reviewer'),
        makeStep(STEP_ID_C, NODE_ID_C, 'Publisher'),
      ];
      const evidences = [
        makeEvidence(EVIDENCE_1, STEP_ID_A, 'agent_decision', T0),
        makeEvidence(EVIDENCE_2, STEP_ID_B, 'rag_retrieval', T1, EVIDENCE_1),
        makeEvidence(EVIDENCE_3, STEP_ID_C, 'tool_output', T2, EVIDENCE_2),
      ];
      setupQueries(steps, evidences);

      const { response } = await service.buildGraph(TENANT_ID, EXECUTION_ID);

      expect(response.nodes).toHaveLength(3);
      expect(response.nodes.map((n) => n.nodeId)).toEqual(
        expect.arrayContaining([NODE_ID_A, NODE_ID_B, NODE_ID_C]),
      );

      expect(response.edges).toHaveLength(2);
      const edgeAB = response.edges.find(
        (e) => e.sourceNodeId === NODE_ID_A && e.targetNodeId === NODE_ID_B,
      );
      const edgeBC = response.edges.find(
        (e) => e.sourceNodeId === NODE_ID_B && e.targetNodeId === NODE_ID_C,
      );
      expect(edgeAB).toBeDefined();
      expect(edgeAB?.evidenceLinks).toBe(1);
      expect(edgeBC).toBeDefined();
      expect(edgeBC?.evidenceLinks).toBe(1);
    });

    it('should accumulate multiple evidence links on a single edge', async () => {
      const steps = [
        makeStep(STEP_ID_A, NODE_ID_A, 'Writer'),
        makeStep(STEP_ID_B, NODE_ID_B, 'Reviewer'),
      ];
      const evidences = [
        makeEvidence(EVIDENCE_1, STEP_ID_A, 'agent_decision', T0),
        makeEvidence(EVIDENCE_2, STEP_ID_A, 'tool_output', T1),
        makeEvidence(EVIDENCE_3, STEP_ID_B, 'rag_retrieval', T2, EVIDENCE_1),
        makeEvidence(EVIDENCE_4, STEP_ID_B, 'agent_decision', T3, EVIDENCE_2),
      ];
      setupQueries(steps, evidences);

      const { response } = await service.buildGraph(TENANT_ID, EXECUTION_ID);

      expect(response.edges).toHaveLength(1);
      expect(response.edges[0].evidenceLinks).toBe(2);
      expect(response.edges[0].dataTypeSummary).toContain('rag_retrieval');
      expect(response.edges[0].dataTypeSummary).toContain('agent_decision');
    });
  });

  describe('parallel nodes', () => {
    it('should create separate nodes without edges for independent parallel execution', async () => {
      const steps = [
        makeStep(STEP_ID_A, NODE_ID_A, 'Writer'),
        makeStep(STEP_ID_B, NODE_ID_B, 'Reviewer'),
      ];
      // 两个独立节点，evidence 无 parent 链接
      const evidences = [
        makeEvidence(EVIDENCE_1, STEP_ID_A, 'agent_decision', T0),
        makeEvidence(EVIDENCE_2, STEP_ID_B, 'tool_output', T1),
      ];
      setupQueries(steps, evidences);

      const { response } = await service.buildGraph(TENANT_ID, EXECUTION_ID);

      expect(response.nodes).toHaveLength(2);
      expect(response.edges).toEqual([]);
    });
  });

  describe('timeline generation', () => {
    it('should generate node entry on first evidence and edge entry on first cross-node link', async () => {
      const steps = [
        makeStep(STEP_ID_A, NODE_ID_A, 'Writer'),
        makeStep(STEP_ID_B, NODE_ID_B, 'Reviewer'),
      ];
      const evidences = [
        makeEvidence(EVIDENCE_1, STEP_ID_A, 'agent_decision', T0),
        makeEvidence(EVIDENCE_2, STEP_ID_A, 'tool_output', T1),
        makeEvidence(EVIDENCE_3, STEP_ID_B, 'rag_retrieval', T2, EVIDENCE_1),
        makeEvidence(EVIDENCE_4, STEP_ID_B, 'agent_decision', T3, EVIDENCE_2),
      ];
      setupQueries(steps, evidences);

      const { response } = await service.buildGraph(TENANT_ID, EXECUTION_ID);

      expect(response.timeline).toHaveLength(3);
      // Node A first
      expect(response.timeline[0]).toEqual({
        timestamp: T0.toISOString(),
        type: 'node',
        targetId: NODE_ID_A,
        label: 'Writer 开始执行',
      });
      // Node B first appearance
      expect(response.timeline[1]).toEqual({
        timestamp: T2.toISOString(),
        type: 'node',
        targetId: NODE_ID_B,
        label: 'Reviewer 开始执行',
      });
      // Edge A→B first appearance
      expect(response.timeline[2]).toEqual({
        timestamp: T2.toISOString(),
        type: 'edge',
        targetId: `${NODE_ID_A}->${NODE_ID_B}`,
        label: 'Writer → Reviewer',
      });
    });

    it('should not duplicate timeline entries for repeated evidence', async () => {
      const steps = [
        makeStep(STEP_ID_A, NODE_ID_A, 'Writer'),
        makeStep(STEP_ID_B, NODE_ID_B, 'Reviewer'),
      ];
      const evidences = [
        makeEvidence(EVIDENCE_1, STEP_ID_A, 'agent_decision', T0),
        makeEvidence(EVIDENCE_2, STEP_ID_B, 'rag_retrieval', T1, EVIDENCE_1),
        // 第二次跨节点链接不应重复 timeline entry
        makeEvidence(EVIDENCE_3, STEP_ID_B, 'tool_output', T2, EVIDENCE_1),
      ];
      setupQueries(steps, evidences);

      const { response } = await service.buildGraph(TENANT_ID, EXECUTION_ID);

      const nodeEntries = response.timeline.filter((t) => t.type === 'node');
      const edgeEntries = response.timeline.filter((t) => t.type === 'edge');
      expect(nodeEntries).toHaveLength(2);
      expect(edgeEntries).toHaveLength(1);
    });
  });

  describe('node metadata', () => {
    it('should use nodeId as fallback when nodeData.label is missing', async () => {
      const steps: StepRow[] = [
        { id: STEP_ID_A, nodeId: NODE_ID_A, nodeData: null, status: 'running' },
      ];
      const evidences = [
        makeEvidence(EVIDENCE_1, STEP_ID_A, 'agent_decision', T0),
      ];
      setupQueries(steps, evidences);

      const { response } = await service.buildGraph(TENANT_ID, EXECUTION_ID);

      expect(response.nodes[0].nodeName).toBe(NODE_ID_A);
      expect(response.nodes[0].nodeType).toBe('unknown');
      expect(response.nodes[0].executionStatus).toBe('running');
    });

    it('should skip evidence whose stepId is not found in steps', async () => {
      const steps = [makeStep(STEP_ID_A, NODE_ID_A, 'Writer')];
      const evidences = [
        makeEvidence(EVIDENCE_1, STEP_ID_A, 'agent_decision', T0),
        makeEvidence(EVIDENCE_2, 'unknown-step-id', 'tool_output', T1),
      ];
      setupQueries(steps, evidences);

      const { response } = await service.buildGraph(TENANT_ID, EXECUTION_ID);

      expect(response.nodes).toHaveLength(1);
      expect(response.nodes[0].evidenceCount).toBe(1);
    });
  });

  describe('cache behavior', () => {
    it('should return cached response on cache hit', async () => {
      const cachedResponse = {
        nodes: [
          {
            id: NODE_ID_A,
            nodeId: NODE_ID_A,
            nodeName: 'Writer',
            nodeType: 'agent',
            executionStatus: 'completed',
            evidenceCount: 1,
            firstEvidenceAt: T0.toISOString(),
            lastEvidenceAt: T0.toISOString(),
          },
        ],
        edges: [],
        timeline: [],
      };
      mocks.cacheService.get.mockResolvedValue(JSON.stringify(cachedResponse));

      const { response, cached } = await service.buildGraph(
        TENANT_ID,
        EXECUTION_ID,
      );

      expect(cached).toBe(true);
      expect(response).toEqual(cachedResponse);
      expect(mocks.tenantDb.select).not.toHaveBeenCalled();
    });

    it('should compute and cache on cache miss', async () => {
      const steps = [makeStep(STEP_ID_A, NODE_ID_A, 'Writer')];
      const evidences = [
        makeEvidence(EVIDENCE_1, STEP_ID_A, 'agent_decision', T0),
      ];
      setupQueries(steps, evidences);

      await service.buildGraph(TENANT_ID, EXECUTION_ID);

      expect(mocks.cacheService.set).toHaveBeenCalledWith(
        `evidence:graph:${EXECUTION_ID}`,
        expect.any(String),
        300,
      );
    });

    it('should degrade gracefully when cache read fails', async () => {
      mocks.cacheService.get.mockRejectedValue(new Error('Redis down'));
      const steps = [makeStep(STEP_ID_A, NODE_ID_A, 'Writer')];
      const evidences = [
        makeEvidence(EVIDENCE_1, STEP_ID_A, 'agent_decision', T0),
      ];
      setupQueries(steps, evidences);

      const { response, cached } = await service.buildGraph(
        TENANT_ID,
        EXECUTION_ID,
      );

      expect(cached).toBe(false);
      expect(response.nodes).toHaveLength(1);
    });

    it('should degrade gracefully when cache write fails', async () => {
      mocks.cacheService.set.mockRejectedValue(new Error('Redis down'));
      const steps = [makeStep(STEP_ID_A, NODE_ID_A, 'Writer')];
      const evidences = [
        makeEvidence(EVIDENCE_1, STEP_ID_A, 'agent_decision', T0),
      ];
      setupQueries(steps, evidences);

      const { response } = await service.buildGraph(TENANT_ID, EXECUTION_ID);

      // 即使缓存写入失败，也应正常返回结果
      expect(response.nodes).toHaveLength(1);
    });

    it('should use correct cache key format', async () => {
      setupQueries([makeStep(STEP_ID_A, NODE_ID_A, 'Writer')], []);

      await service.buildGraph(TENANT_ID, EXECUTION_ID);

      expect(mocks.cacheService.get).toHaveBeenCalledWith(
        `evidence:graph:${EXECUTION_ID}`,
      );
    });
  });

  describe('complex graph topology', () => {
    it('should handle diamond pattern (A→B, A→C, B→D, C→D)', async () => {
      const STEP_ID_D = '00000000-0000-4000-8000-000000000013';
      const NODE_ID_D = 'node-output';

      const steps = [
        makeStep(STEP_ID_A, NODE_ID_A, 'Input'),
        makeStep(STEP_ID_B, NODE_ID_B, 'Branch-1'),
        makeStep(STEP_ID_C, NODE_ID_C, 'Branch-2'),
        makeStep(STEP_ID_D, NODE_ID_D, 'Output'),
      ];
      const evidences = [
        makeEvidence(EVIDENCE_1, STEP_ID_A, 'agent_decision', T0),
        makeEvidence(EVIDENCE_2, STEP_ID_B, 'agent_decision', T1, EVIDENCE_1),
        makeEvidence(EVIDENCE_3, STEP_ID_C, 'tool_output', T2, EVIDENCE_1),
        makeEvidence(EVIDENCE_4, STEP_ID_D, 'rag_retrieval', T3, EVIDENCE_2),
        makeEvidence(EVIDENCE_5, STEP_ID_D, 'agent_decision', T4, EVIDENCE_3),
      ];
      setupQueries(steps, evidences);

      const { response } = await service.buildGraph(TENANT_ID, EXECUTION_ID);

      expect(response.nodes).toHaveLength(4);
      expect(response.edges).toHaveLength(4);

      const edgeIds = response.edges.map(
        (e) => `${e.sourceNodeId}->${e.targetNodeId}`,
      );
      expect(edgeIds).toContain(`${NODE_ID_A}->${NODE_ID_B}`);
      expect(edgeIds).toContain(`${NODE_ID_A}->${NODE_ID_C}`);
      expect(edgeIds).toContain(`${NODE_ID_B}->${NODE_ID_D}`);
      expect(edgeIds).toContain(`${NODE_ID_C}->${NODE_ID_D}`);
    });

    it('should correctly compute evidenceCount per node with multiple evidence', async () => {
      const steps = [
        makeStep(STEP_ID_A, NODE_ID_A, 'Writer'),
        makeStep(STEP_ID_B, NODE_ID_B, 'Reviewer'),
      ];
      const evidences = [
        makeEvidence(EVIDENCE_1, STEP_ID_A, 'agent_decision', T0),
        makeEvidence(EVIDENCE_2, STEP_ID_A, 'tool_output', T1),
        makeEvidence(EVIDENCE_3, STEP_ID_A, 'rag_retrieval', T2),
        makeEvidence(EVIDENCE_4, STEP_ID_B, 'agent_decision', T3),
      ];
      setupQueries(steps, evidences);

      const { response } = await service.buildGraph(TENANT_ID, EXECUTION_ID);

      const nodeA = response.nodes.find((n) => n.nodeId === NODE_ID_A);
      const nodeB = response.nodes.find((n) => n.nodeId === NODE_ID_B);
      expect(nodeA?.evidenceCount).toBe(3);
      expect(nodeB?.evidenceCount).toBe(1);
    });
  });
});
