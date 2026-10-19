import { describe, expect, it } from 'vitest';

import { WorkflowNotPublishedException } from '../../execution/execution.exceptions';
import { OptimizationAnalysisService } from '../optimization-analysis.service';
import { OptimizationWorkflowNodeNotSupportedException } from '../optimization-proposal.exceptions';
import { createQueryDb, inTenantContext } from './drizzle-chain-stub';

const TENANT_ID = '019577a0-0000-7000-8000-000000000099';
const WORKFLOW_ID = '019577a0-0000-7000-8000-0000000000aa';
const VERSION_ID = '019577a0-0000-7000-8000-0000000000bb';
const AGENT_ID = '019577a0-0000-7000-8000-0000000000cc';

const budget = (maxMessages: number) => ({
  maxTotalTokens: 500_000,
  maxMessages,
  deadlineMinutes: 60,
});

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
  budget: budget(1),
};

const publishedWorkflow = {
  id: WORKFLOW_ID,
  status: 'published',
  publishedVersionId: VERSION_ID,
};

const versionWith = (nodes: unknown[]) => [{ snapshot: { nodes } }];
const teamNode = {
  id: 'team-1',
  type: 'agent',
  position: { x: 0, y: 0 },
  data: { nodeType: 'team', config: teamConfig },
};

function teamRun(id: string, maxMessages: number) {
  return {
    id,
    status: 'failed',
    failureReason: 'budget_exhausted',
    usedInputTokens: 100,
    usedOutputTokens: 20,
    messageCount: maxMessages,
    budgetMaxTotalTokens: 500_000,
    budgetMaxMessages: maxMessages,
    config: { ...teamConfig, budget: budget(maxMessages) },
  };
}

describe('OptimizationAnalysisService.analyzeWorkflow', () => {
  it('只用与已发布配置同预算的团队运行作证据', async () => {
    const stub = createQueryDb([
      [publishedWorkflow],
      versionWith([teamNode]),
      [
        teamRun('r1', 1),
        teamRun('r2', 1),
        teamRun('r3', 1),
        // 旧预算（maxMessages=5）下的失败不计入
        teamRun('old-1', 5),
        teamRun('old-2', 5),
      ],
      [], // 无活跃提案
      [{ id: 'proposal-1' }],
    ]);
    const service = new OptimizationAnalysisService(stub.db);

    const { result } = await inTenantContext(stub.db, () =>
      service.analyzeWorkflow(TENANT_ID, WORKFLOW_ID),
    );

    expect(result).toEqual([{ id: 'proposal-1' }]);
    const [inserted] = stub.argsOf('insert', 'values') as Array<
      Record<string, any>
    >;
    expect(inserted).toMatchObject({
      tenantId: TENANT_ID,
      workflowDefinitionId: WORKFLOW_ID,
      nodeId: 'team-1',
      nodeType: 'team',
      proposalType: 'team_budget_messages',
      status: 'proposed',
      configPath: 'config.budget.maxMessages',
      currentValue: 1,
      proposedValue: 2,
      baseVersionId: VERSION_ID,
    });
    expect(inserted.evidence).toMatchObject({
      sampleCount: 3,
      matchedCount: 3,
      sampleIds: ['r1', 'r2', 'r3'],
    });
    expect(stub.remaining()).toBe(0);
  });

  it('同一节点同类型已有活跃提案时跳过', async () => {
    const stub = createQueryDb([
      [publishedWorkflow],
      versionWith([teamNode]),
      [teamRun('r1', 1), teamRun('r2', 1), teamRun('r3', 1)],
      [{ id: 'existing' }],
    ]);
    const service = new OptimizationAnalysisService(stub.db);

    const { result } = await inTenantContext(stub.db, () =>
      service.analyzeWorkflow(TENANT_ID, WORKFLOW_ID),
    );

    expect(result).toEqual([]);
    expect(stub.argsOf('insert', 'values')).toEqual([]);
  });

  it('工作流未发布时抛 WorkflowNotPublishedException，detail 说明无法分析而不是启动执行（D-160）', async () => {
    const stub = createQueryDb([
      [{ id: WORKFLOW_ID, status: 'draft', publishedVersionId: null }],
    ]);
    const service = new OptimizationAnalysisService(stub.db);

    const error = await inTenantContext(stub.db, () =>
      service.analyzeWorkflow(TENANT_ID, WORKFLOW_ID),
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(WorkflowNotPublishedException);
    const { detail } = error as WorkflowNotPublishedException;
    expect(detail).toContain('无法分析优化提案');
    expect(detail).not.toContain('启动执行');
  });

  it('发布版本中没有 team / smart-routing 节点时抛 422', async () => {
    const stub = createQueryDb([
      [publishedWorkflow],
      versionWith([
        {
          id: 'text-1',
          type: 'output',
          position: { x: 0, y: 0 },
          data: { nodeType: 'text' },
        },
      ]),
    ]);
    const service = new OptimizationAnalysisService(stub.db);

    await expect(
      inTenantContext(stub.db, () =>
        service.analyzeWorkflow(TENANT_ID, WORKFLOW_ID),
      ),
    ).rejects.toBeInstanceOf(OptimizationWorkflowNodeNotSupportedException);
  });
});
