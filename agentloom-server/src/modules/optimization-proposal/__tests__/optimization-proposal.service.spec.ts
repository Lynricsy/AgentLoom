import type { Queue } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';

import type {
  OptimizationProposal,
  WorkflowVersionSnapshot,
} from '../../../database/schema';
import type { AuditLogService } from '../../evidence/audit-log.service';
import type { WorkflowVersionService } from '../../workflow-definition/workflow-version.service';
import type { OptimizationAnalysisService } from '../optimization-analysis.service';
import {
  OptimizationEvaluationNoCasesException,
  OptimizationProposalInvalidPatchException,
  OptimizationProposalNotImprovedException,
  OptimizationProposalStaleException,
} from '../optimization-proposal.exceptions';
import { OptimizationProposalService } from '../optimization-proposal.service';
import { createQueryDb, inTenantContext } from './drizzle-chain-stub';

const TENANT_ID = '019577a0-0000-7000-8000-000000000099';
const USER_ID = '019577a0-0000-7000-8000-000000000098';
const PROPOSAL_ID = '019577a0-0000-7000-8000-0000000000a1';
const WORKFLOW_ID = '019577a0-0000-7000-8000-0000000000aa';
const BASE_ID = '019577a0-0000-7000-8000-0000000000bb';
const CANDIDATE_ID = '019577a0-0000-7000-8000-0000000000cc';
const EVALUATION_ID = '019577a0-0000-7000-8000-0000000000dd';
const AGENT_ID = '019577a0-0000-7000-8000-0000000000ee';

const teamConfig = {
  objective: '修复问题',
  members: [
    {
      role: 'lead',
      agentDefinitionId: AGENT_ID,
      isLead: true,
      canMessage: ['worker'],
    },
    { role: 'worker', agentDefinitionId: AGENT_ID, canMessage: ['lead'] },
  ],
  budget: { maxTotalTokens: 500_000, maxMessages: 1, deadlineMinutes: 10 },
};

const baseSnapshot: WorkflowVersionSnapshot = {
  nodes: [
    {
      id: 'team-1',
      type: 'agent',
      position: { x: 0, y: 0 },
      data: { label: '团队', nodeType: 'team', config: teamConfig },
    },
  ],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  metadata: { nodeCount: 1, edgeCount: 0, createdFromVersion: 3 },
} as unknown as WorkflowVersionSnapshot;

function makeProposal(
  overrides: Partial<OptimizationProposal> = {},
): OptimizationProposal {
  const now = new Date('2026-02-01T00:00:00Z');
  return {
    id: PROPOSAL_ID,
    tenantId: TENANT_ID,
    workflowDefinitionId: WORKFLOW_ID,
    nodeId: 'team-1',
    nodeType: 'team',
    proposalType: 'team_budget_messages',
    status: 'proposed',
    configPath: 'config.budget.maxMessages',
    currentValue: 1,
    proposedValue: 2,
    rationale: '消息数不足',
    evidence: {
      analyzerVersion: 1,
      windowDays: 28,
      windowStart: now.toISOString(),
      windowEnd: now.toISOString(),
      sampleCount: 3,
      matchedCount: 3,
      matchedRate: 1,
      sampleIds: [],
    },
    baseVersionId: BASE_ID,
    candidateVersionId: null,
    publishedVersionId: null,
    currentEvaluationId: null,
    verdict: null,
    publishReport: null,
    evaluatedAt: null,
    publishedAt: null,
    publishedByUserId: null,
    rolledBackAt: null,
    rolledBackByUserId: null,
    dismissedAt: null,
    dismissedByUserId: null,
    supersededAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const workflowRow = (publishedVersionId: string) => ({
  id: WORKFLOW_ID,
  name: '登录修复',
  status: 'published',
  publishedVersionId,
  nodes: baseSnapshot.nodes,
  version: 4,
});

function createService(results: unknown[]) {
  const stub = createQueryDb(results);
  const workflowVersionService = {
    createVersionFromSnapshot: vi.fn().mockResolvedValue({ id: CANDIDATE_ID }),
    publish: vi.fn(),
    updateDefinition: vi.fn(),
  };
  const queue = { add: vi.fn() };
  const service = new OptimizationProposalService(
    stub.db,
    workflowVersionService as unknown as WorkflowVersionService,
    { record: vi.fn() } as unknown as AuditLogService,
    {} as OptimizationAnalysisService,
    queue as unknown as Queue,
  );
  return { service, stub, workflowVersionService, queue };
}

describe('OptimizationProposalService', () => {
  it('评测结论为 neutral 时拒绝发布（422）且不触发版本发布', async () => {
    const { service, stub, workflowVersionService } = createService([
      [
        {
          status: 'evaluated',
          baseVersionId: BASE_ID,
          publishedVersionId: BASE_ID,
        },
      ],
      [
        makeProposal({
          status: 'evaluated',
          verdict: 'neutral',
          currentEvaluationId: EVALUATION_ID,
          candidateVersionId: CANDIDATE_ID,
        }),
      ],
      [{ status: 'completed', summary: { verdict: 'neutral' } }],
    ]);

    await expect(
      inTenantContext(stub.db, () =>
        service.publish(TENANT_ID, PROPOSAL_ID, USER_ID, {}),
      ),
    ).rejects.toBeInstanceOf(OptimizationProposalNotImprovedException);
    expect(workflowVersionService.publish).not.toHaveBeenCalled();
  });

  it('基线版本已不是发布版本时在独立事务置 superseded 并抛 409', async () => {
    const { service, stub } = createService([
      [
        {
          status: 'proposed',
          baseVersionId: BASE_ID,
          publishedVersionId: CANDIDATE_ID,
        },
      ],
      [], // superseded 更新
    ]);

    await expect(
      inTenantContext(stub.db, () =>
        service.startEvaluation(TENANT_ID, PROPOSAL_ID, USER_ID, {}),
      ),
    ).rejects.toBeInstanceOf(OptimizationProposalStaleException);
    expect(stub.argsOf('update', 'set')).toEqual([
      expect.objectContaining({
        status: 'superseded',
        supersededAt: expect.any(Date),
      }),
    ]);
    expect(stub.calls.some((call) => call.method === 'for')).toBe(false);
  });

  it('回滚时发布版本已不是候选版本：409 且不发布、不改状态', async () => {
    const { service, stub, workflowVersionService } = createService([
      [makeProposal({ status: 'published', candidateVersionId: CANDIDATE_ID })],
      [workflowRow(BASE_ID)],
    ]);

    await expect(
      inTenantContext(stub.db, () =>
        service.rollback(TENANT_ID, PROPOSAL_ID, USER_ID),
      ),
    ).rejects.toBeInstanceOf(OptimizationProposalStaleException);
    expect(workflowVersionService.publish).not.toHaveBeenCalled();
    expect(stub.argsOf('update', 'set')).toEqual([]);
  });

  it('没有已结束的真实执行可回放时评测返回 422，不建评测、不入队', async () => {
    const { service, stub, queue } = createService([
      [
        {
          status: 'proposed',
          baseVersionId: BASE_ID,
          publishedVersionId: BASE_ID,
        },
      ],
      [makeProposal()],
      [workflowRow(BASE_ID)],
      [{ snapshot: baseSnapshot }],
      [], // 用例
    ]);

    await expect(
      inTenantContext(stub.db, () =>
        service.startEvaluation(TENANT_ID, PROPOSAL_ID, USER_ID, {
          caseCount: 3,
        }),
      ),
    ).rejects.toBeInstanceOf(OptimizationEvaluationNoCasesException);
    expect(stub.argsOf('insert', 'values')).toEqual([]);
    expect(queue.add).not.toHaveBeenCalled();
  });

  describe('buildCandidateSnapshot', () => {
    it('只改补丁路径，其余配置与基线快照保持不变且不修改基线', () => {
      const { service } = createService([]);
      const snapshot = service.buildCandidateSnapshot(
        makeProposal(),
        baseSnapshot,
      );
      const data = snapshot.nodes[0].data as Record<string, any>;

      expect(data.config.budget).toEqual({
        maxTotalTokens: 500_000,
        maxMessages: 2,
        deadlineMinutes: 10,
      });
      expect(data.config.members).toEqual(teamConfig.members);
      expect(data.label).toBe('团队');
      expect(snapshot.metadata.releaseNotes).toBe('消息数不足');
      expect(
        (baseSnapshot.nodes[0].data as Record<string, any>).config.budget
          .maxMessages,
      ).toBe(1);
    });

    it('补丁后团队配置违反契约时抛 422', () => {
      const { service } = createService([]);
      expect(() =>
        service.buildCandidateSnapshot(
          makeProposal({ proposedValue: 5000 }),
          baseSnapshot,
        ),
      ).toThrow(OptimizationProposalInvalidPatchException);
    });
  });
});
