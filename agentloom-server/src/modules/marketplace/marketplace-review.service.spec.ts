import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import * as crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DRIZZLE } from '../../database/database.module';
import {
  MARKETPLACE_REVIEW_LIMITS,
  type MarketplaceReviewResult,
} from '../../database/schema/marketplace-listings.schema';
import type { WorkflowVersionSnapshot } from '../../database/schema/workflow-versions.schema';
import { MarketplaceReviewService } from './marketplace-review.service';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000002';
const ORG_ID = '00000000-0000-0000-0000-000000000003';
const LISTING_ID = '00000000-0000-0000-0000-000000000004';
const VERSION_ID = '00000000-0000-0000-0000-000000000005';
const WORKFLOW_ID = '00000000-0000-0000-0000-000000000006';
const EXECUTION_ID = '00000000-0000-0000-0000-000000000007';
const NOW = new Date('2025-01-01T00:00:00.000Z');

type WorkflowNode = WorkflowVersionSnapshot['nodes'][number];

function createMetadata(
  overrides: Partial<{
    title: string;
    summary: string;
    tags: string[];
  }> = {},
) {
  return {
    title: `组织 ${ORG_ID.slice(-4)} 的智能分析工作流`,
    summary:
      `这是给租户 ${TENANT_ID.slice(-4)} 使用的 Marketplace 工作流摘要，` +
      `用于覆盖评审服务的成功与失败分支，长度满足最小要求。`,
    tags: ['analysis', `org-${ORG_ID.slice(-4)}`, USER_ID.slice(-4)],
    ...overrides,
  };
}

function createNode(overrides: Partial<WorkflowNode> = {}): WorkflowNode {
  return {
    id: 'node-1',
    type: 'agent',
    position: { x: 0, y: 0 },
    data: {
      systemPrompt: '你是一个测试代理',
      llmModelId: 'llm-model-1',
      workflowId: WORKFLOW_ID,
    },
    ...overrides,
  };
}

function createWorkflowSnapshot(
  overrides: Partial<WorkflowVersionSnapshot> = {},
): WorkflowVersionSnapshot {
  return {
    nodes: [createNode()],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    metadata: {
      nodeCount: 1,
      edgeCount: 0,
      createdFromVersion: 1,
    },
    ...overrides,
  };
}

function createVersionRecord(
  overrides: Partial<{
    id: string;
    publishedAt: Date | null;
    archivedAt: Date | null;
    workflowStatus: 'draft' | 'published' | 'archived';
    publishedVersionId: string | null;
  }> = {},
) {
  return {
    id: VERSION_ID,
    publishedAt: NOW,
    archivedAt: null,
    workflowStatus: 'published' as const,
    publishedVersionId: VERSION_ID,
    ...overrides,
  };
}

function createExecutionRecord(
  overrides: Partial<{ id: string; completedAt: Date }> = {},
) {
  return {
    id: EXECUTION_ID,
    completedAt: NOW,
    ...overrides,
  };
}

function createSelectChain(result: unknown) {
  const where = vi.fn().mockResolvedValue(result);
  const innerJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ where, innerJoin });
  return { from, where, innerJoin };
}

function createExecutionSelectChain(
  executions: Array<{ id: string; completedAt: Date }>,
) {
  const limit = vi.fn().mockImplementation(async (count: number) => {
    const lookbackDate = new Date(NOW);
    lookbackDate.setDate(
      lookbackDate.getDate() -
        MARKETPLACE_REVIEW_LIMITS.successfulExecutionLookbackDays,
    );

    return executions
      .filter((execution) => execution.completedAt >= lookbackDate)
      .sort((left, right) => right.completedAt.getTime() - left.completedAt.getTime())
      .slice(0, count);
  });
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  return { from, where, orderBy, limit };
}

function getCheck(result: MarketplaceReviewResult, code: string) {
  const check = result.checks.find((item) => item.code === code);

  if (!check) {
    throw new Error(`未找到检查项: ${code}`);
  }

  return check;
}

describe('MarketplaceReviewService', () => {
  let service: MarketplaceReviewService;
  let db: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});

    db = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      execute: vi.fn().mockResolvedValue(undefined),
      transaction: vi.fn(async (callback: (tx: typeof db) => unknown) =>
        callback(db),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketplaceReviewService,
        { provide: DRIZZLE, useValue: db },
      ],
    }).compile();

    service = module.get(MarketplaceReviewService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('全部检查通过时应返回 passed 并记录最近成功执行', async () => {
    const selectVersion = createSelectChain([createVersionRecord()]);
    const selectCanvas = createSelectChain([
      { snapshot: createWorkflowSnapshot() },
    ]);
    const selectExecution = createExecutionSelectChain([createExecutionRecord()]);

    db.select
      .mockReturnValueOnce(selectVersion)
      .mockReturnValueOnce(selectCanvas)
      .mockReturnValueOnce(selectExecution);

    const result = await service.review(TENANT_ID, VERSION_ID, createMetadata());

    expect(result.outcome).toBe('passed');
    expect(result.reviewedAt).toBe(NOW.toISOString());
    expect(result.recentSuccessfulExecutionId).toBe(EXECUTION_ID);
    expect(result.recentSuccessfulExecutionAt).toBe(NOW.toISOString());
    expect(result.checks).toHaveLength(8);
    expect(result.checks.every((check) => check.status === 'passed')).toBe(true);
    expect(selectExecution.limit).toHaveBeenCalledWith(1);
  });

  it('工作流版本不存在时应失败并短路画布与执行检查', async () => {
    db.select.mockReturnValueOnce(createSelectChain([]));

    const result = await service.review(TENANT_ID, VERSION_ID, createMetadata());

    expect(result.outcome).toBe('failed');
    expect(getCheck(result, 'WORKFLOW_VERSION_NOT_PUBLISHED').status).toBe(
      'failed',
    );
    expect(getCheck(result, 'WORKFLOW_VERSION_ARCHIVED').status).toBe('passed');
    expect(getCheck(result, 'WORKFLOW_EMPTY_NODE_DETECTED')).toMatchObject({
      status: 'failed',
      message: '无法检查画布结构：工作流版本未发布',
    });
    expect(getCheck(result, 'RECENT_SUCCESSFUL_EXECUTION_MISSING')).toMatchObject({
      status: 'failed',
      message: '无法检查执行记录：工作流版本未发布',
    });
    expect(result.recentSuccessfulExecutionId).toBeUndefined();
    expect(result.recentSuccessfulExecutionAt).toBeUndefined();
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it('工作流版本已归档时应失败并短路画布与执行检查', async () => {
    db.select.mockReturnValueOnce(
      createSelectChain([
        createVersionRecord({ archivedAt: new Date('2025-01-02T00:00:00.000Z') }),
      ]),
    );

    const result = await service.review(TENANT_ID, VERSION_ID, createMetadata());

    expect(result.outcome).toBe('failed');
    expect(getCheck(result, 'WORKFLOW_VERSION_NOT_PUBLISHED').status).toBe(
      'passed',
    );
    expect(getCheck(result, 'WORKFLOW_VERSION_ARCHIVED').status).toBe('failed');
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it('工作流定义不是 published 时应视为未发布并短路画布与执行检查', async () => {
    db.select.mockReturnValueOnce(
      createSelectChain([
        createVersionRecord({
          workflowStatus: 'draft',
          publishedVersionId: null,
        }),
      ]),
    );

    const result = await service.review(TENANT_ID, VERSION_ID, createMetadata());

    expect(result.outcome).toBe('failed');
    expect(getCheck(result, 'WORKFLOW_VERSION_NOT_PUBLISHED').status).toBe(
      'failed',
    );
    expect(getCheck(result, 'WORKFLOW_VERSION_ARCHIVED').status).toBe('passed');
    expect(getCheck(result, 'WORKFLOW_EMPTY_NODE_DETECTED')).toMatchObject({
      status: 'failed',
      message: '无法检查画布结构：工作流版本未发布',
    });
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it('不是当前 publishedVersionId 的版本时应视为未发布', async () => {
    db.select.mockReturnValueOnce(
      createSelectChain([
        createVersionRecord({
          publishedVersionId: crypto.randomUUID(),
        }),
      ]),
    );

    const result = await service.review(TENANT_ID, VERSION_ID, createMetadata());

    expect(result.outcome).toBe('failed');
    expect(getCheck(result, 'WORKFLOW_VERSION_NOT_PUBLISHED')).toMatchObject({
      status: 'failed',
      fixHint: '请先发布工作流版本',
    });
    expect(getCheck(result, 'WORKFLOW_VERSION_ARCHIVED').status).toBe('passed');
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it('画布没有节点时应返回空节点失败', async () => {
    db.select
      .mockReturnValueOnce(createSelectChain([createVersionRecord()]))
      .mockReturnValueOnce(
        createSelectChain([
          {
            snapshot: createWorkflowSnapshot({ nodes: [], metadata: { nodeCount: 0, edgeCount: 0, createdFromVersion: 1 } }),
          },
        ]),
      )
      .mockReturnValueOnce(createExecutionSelectChain([createExecutionRecord()]));

    const result = await service.review(TENANT_ID, VERSION_ID, createMetadata());

    expect(result.outcome).toBe('failed');
    expect(getCheck(result, 'WORKFLOW_EMPTY_NODE_DETECTED')).toMatchObject({
      status: 'failed',
      fixHint: '至少添加一个 Agent 节点',
    });
    expect(getCheck(result, 'WORKFLOW_CRITICAL_CONFIG_INCOMPLETE').status).toBe(
      'passed',
    );
  });

  it('Agent 节点缺少 systemPrompt 时应返回关键配置失败', async () => {
    db.select
      .mockReturnValueOnce(createSelectChain([createVersionRecord()]))
      .mockReturnValueOnce(
        createSelectChain([
          {
            snapshot: createWorkflowSnapshot({
              nodes: [
                createNode({
                  data: { llmModelId: 'llm-model-1', workflowId: WORKFLOW_ID },
                }),
              ],
            }),
          },
        ]),
      )
      .mockReturnValueOnce(createExecutionSelectChain([createExecutionRecord()]));

    const result = await service.review(TENANT_ID, VERSION_ID, createMetadata());

    expect(result.outcome).toBe('failed');
    expect(getCheck(result, 'WORKFLOW_CRITICAL_CONFIG_INCOMPLETE')).toMatchObject({
      status: 'failed',
      nodeId: 'node-1',
      missingFields: ['systemPrompt'],
    });
  });

  it('Agent 节点缺少 snake_case 的 llm_model_id 时也应失败', async () => {
    db.select
      .mockReturnValueOnce(createSelectChain([createVersionRecord()]))
      .mockReturnValueOnce(
        createSelectChain([
          {
            snapshot: createWorkflowSnapshot({
              nodes: [
                createNode({
                  data: {
                    system_prompt: '你是一个测试代理',
                    workflowId: WORKFLOW_ID,
                  },
                }),
              ],
            }),
          },
        ]),
      )
      .mockReturnValueOnce(createExecutionSelectChain([createExecutionRecord()]));

    const result = await service.review(TENANT_ID, VERSION_ID, createMetadata());

    expect(result.outcome).toBe('failed');
    expect(getCheck(result, 'WORKFLOW_CRITICAL_CONFIG_INCOMPLETE')).toMatchObject({
      status: 'failed',
      missingFields: ['llmModelId'],
    });
  });

  it('应支持 camelCase 的 Agent 配置字段', async () => {
    db.select
      .mockReturnValueOnce(createSelectChain([createVersionRecord()]))
      .mockReturnValueOnce(
        createSelectChain([
          {
            snapshot: createWorkflowSnapshot({
              nodes: [
                createNode({
                  data: {
                    systemPrompt: '你是一个 camelCase 测试代理',
                    llmModelId: 'llm-model-camel',
                    workflowId: WORKFLOW_ID,
                  },
                }),
              ],
            }),
          },
        ]),
      )
      .mockReturnValueOnce(createExecutionSelectChain([createExecutionRecord()]));

    const result = await service.review(TENANT_ID, VERSION_ID, createMetadata());

    expect(result.outcome).toBe('passed');
    expect(getCheck(result, 'WORKFLOW_CRITICAL_CONFIG_INCOMPLETE').status).toBe(
      'passed',
    );
  });

  it('应支持 snake_case 的 Agent 配置字段', async () => {
    db.select
      .mockReturnValueOnce(createSelectChain([createVersionRecord()]))
      .mockReturnValueOnce(
        createSelectChain([
          {
            snapshot: createWorkflowSnapshot({
              nodes: [
                createNode({
                  data: {
                    system_prompt: '你是一个 snake_case 测试代理',
                    llm_model_id: 'llm-model-snake',
                    workflowId: WORKFLOW_ID,
                  },
                }),
              ],
            }),
          },
        ]),
      )
      .mockReturnValueOnce(createExecutionSelectChain([createExecutionRecord()]));

    const result = await service.review(TENANT_ID, VERSION_ID, createMetadata());

    expect(result.outcome).toBe('passed');
    expect(getCheck(result, 'WORKFLOW_CRITICAL_CONFIG_INCOMPLETE').status).toBe(
      'passed',
    );
  });

  it('非 Agent 节点不需要 systemPrompt 和 llmModelId', async () => {
    db.select
      .mockReturnValueOnce(createSelectChain([createVersionRecord()]))
      .mockReturnValueOnce(
        createSelectChain([
          {
            snapshot: createWorkflowSnapshot({
              nodes: [
                createNode({
                  type: 'trigger',
                  data: { source: 'manual', listingId: LISTING_ID },
                }),
              ],
            }),
          },
        ]),
      )
      .mockReturnValueOnce(createExecutionSelectChain([createExecutionRecord()]));

    const result = await service.review(TENANT_ID, VERSION_ID, createMetadata());

    expect(result.outcome).toBe('passed');
    expect(getCheck(result, 'WORKFLOW_CRITICAL_CONFIG_INCOMPLETE').status).toBe(
      'passed',
    );
  });

  it('没有完成执行记录时应返回近期成功执行缺失', async () => {
    db.select
      .mockReturnValueOnce(createSelectChain([createVersionRecord()]))
      .mockReturnValueOnce(
        createSelectChain([{ snapshot: createWorkflowSnapshot() }]),
      )
      .mockReturnValueOnce(createExecutionSelectChain([]));

    const result = await service.review(TENANT_ID, VERSION_ID, createMetadata());

    expect(result.outcome).toBe('failed');
    expect(getCheck(result, 'RECENT_SUCCESSFUL_EXECUTION_MISSING')).toMatchObject({
      status: 'failed',
      fixHint: '请先成功运行一次工作流',
    });
  });

  it('只有超过 30 天的成功执行记录时也应失败', async () => {
    const expiredExecution = createExecutionRecord({
      id: LISTING_ID,
      completedAt: new Date('2024-11-30T00:00:00.000Z'),
    });

    db.select
      .mockReturnValueOnce(createSelectChain([createVersionRecord()]))
      .mockReturnValueOnce(
        createSelectChain([{ snapshot: createWorkflowSnapshot() }]),
      )
      .mockReturnValueOnce(createExecutionSelectChain([expiredExecution]));

    const result = await service.review(TENANT_ID, VERSION_ID, createMetadata());

    expect(result.outcome).toBe('failed');
    expect(getCheck(result, 'RECENT_SUCCESSFUL_EXECUTION_MISSING').status).toBe(
      'failed',
    );
    expect(result.recentSuccessfulExecutionId).toBeUndefined();
    expect(result.recentSuccessfulExecutionAt).toBeUndefined();
  });

  it.each([
    ['过短', '短'],
    ['过长', '标'.repeat(MARKETPLACE_REVIEW_LIMITS.titleMaxLength + 1)],
  ])('标题%s时应返回 TITLE_INVALID', async (_label, title) => {
    db.select
      .mockReturnValueOnce(createSelectChain([createVersionRecord()]))
      .mockReturnValueOnce(
        createSelectChain([{ snapshot: createWorkflowSnapshot() }]),
      )
      .mockReturnValueOnce(createExecutionSelectChain([createExecutionRecord()]));

    const result = await service.review(
      TENANT_ID,
      VERSION_ID,
      createMetadata({ title }),
    );

    expect(result.outcome).toBe('failed');
    expect(getCheck(result, 'TITLE_INVALID')).toMatchObject({
      status: 'failed',
      field: 'title',
    });
  });

  it.each([
    ['过短', '过短摘要'],
    ['过长', '要'.repeat(MARKETPLACE_REVIEW_LIMITS.summaryMaxLength + 1)],
  ])('摘要%s时应返回 SUMMARY_INVALID', async (_label, summary) => {
    db.select
      .mockReturnValueOnce(createSelectChain([createVersionRecord()]))
      .mockReturnValueOnce(
        createSelectChain([{ snapshot: createWorkflowSnapshot() }]),
      )
      .mockReturnValueOnce(createExecutionSelectChain([createExecutionRecord()]));

    const result = await service.review(
      TENANT_ID,
      VERSION_ID,
      createMetadata({ summary }),
    );

    expect(result.outcome).toBe('failed');
    expect(getCheck(result, 'SUMMARY_INVALID')).toMatchObject({
      status: 'failed',
      field: 'summary',
    });
  });

  it.each([
    ['没有标签', []],
    [
      '标签过多',
      Array.from(
        { length: MARKETPLACE_REVIEW_LIMITS.maxTags + 1 },
        (_value, index) => `tag-${index}`,
      ),
    ],
    ['标签过长', ['analysis', '超'.repeat(MARKETPLACE_REVIEW_LIMITS.tagMaxLength + 1)]],
  ])('标签%s时应返回 TAGS_INVALID', async (_label, tags) => {
    db.select
      .mockReturnValueOnce(createSelectChain([createVersionRecord()]))
      .mockReturnValueOnce(
        createSelectChain([{ snapshot: createWorkflowSnapshot() }]),
      )
      .mockReturnValueOnce(createExecutionSelectChain([createExecutionRecord()]));

    const result = await service.review(
      TENANT_ID,
      VERSION_ID,
      createMetadata({ tags }),
    );

    expect(result.outcome).toBe('failed');
    expect(getCheck(result, 'TAGS_INVALID')).toMatchObject({
      status: 'failed',
      field: 'tags',
    });
  });
});
