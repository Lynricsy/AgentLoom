import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import type { DrizzleDB } from '../../../database/database.module';
import * as schema from '../../../database/schema';
import {
  collectWorkflowBindingIssues,
  GeneratedAppBindingResolverService,
} from '../generated-app-binding-resolver.service';
import type {
  GeneratedAppBinding,
  GeneratedAppField,
} from '../types/app-spec-v2.schema';
import {
  QA_AGENT_ID,
  QA_AGENT_VERSION_ID,
  QA_TENANT_ID,
  QA_WORKFLOW_ID,
  QA_WORKFLOW_VERSION_ID,
  qaAppSpecV2,
  qaWorkflowCandidate,
} from './app-spec-v2.fixtures';

type WorkflowBinding = Extract<GeneratedAppBinding, { kind: 'workflow' }>;

const dialect = new PgDialect();

interface QueryChain {
  from: Mock;
  where: Mock;
  orderBy: Mock;
  limit: Mock;
  then: (
    resolve: (rows: unknown[]) => unknown,
    reject: (error: unknown) => unknown,
  ) => Promise<unknown>;
}

/** 按 from(table) 返回预置行；记录每张表的 where 条件 */
function createTenantDb(rowsByTable: Map<unknown, unknown[]>) {
  const chains: Array<{ table: unknown; chain: QueryChain }> = [];
  const select = vi.fn(() => {
    let rows: unknown[] = [];
    const chain: QueryChain = {
      from: vi.fn((table: unknown) => {
        rows = rowsByTable.get(table) ?? [];
        chains.push({ table, chain });
        return chain;
      }),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      limit: vi.fn(() => Promise.resolve(rows)),
      then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
    };
    return chain;
  });
  const tx = { execute: vi.fn(), select };
  const db = {
    transaction: async <T>(operation: (client: unknown) => Promise<T>) =>
      operation(tx),
  } as unknown as DrizzleDB;
  const whereSqlFor = (table: unknown): string[] =>
    chains
      .filter((entry) => entry.table === table)
      .map(
        (entry) =>
          dialect.sqlToQuery(entry.chain.where.mock.calls[0]?.[0] as SQL).sql,
      );
  return { db, select, whereSqlFor };
}

function qaWorkflowBinding(): WorkflowBinding {
  const binding = qaAppSpecV2().binding;
  if (binding.kind !== 'workflow') throw new Error('workflow binding');
  return binding;
}

const QA_SNAPSHOT: schema.WorkflowVersionSnapshot = {
  nodes: [
    { id: 'trigger', position: { x: 0, y: 0 }, data: { nodeType: 'manual-trigger' } },
    {
      id: 'out-answer',
      position: { x: 0, y: 0 },
      data: { nodeType: 'text-output', label: '答案' },
    },
    {
      id: 'out-structured',
      position: { x: 0, y: 0 },
      data: { nodeType: 'json-output', label: '结构化答案' },
    },
    // 循环体内的输出节点每轮一个结果，不能对应结果分区
    {
      id: 'loop-output',
      parentId: 'loop-1',
      position: { x: 0, y: 0 },
      data: { nodeType: 'text-output', label: '循环输出' },
    },
  ],
  edges: [],
  viewport: null,
  inputSchema: qaWorkflowCandidate().inputSchema,
  metadata: { nodeCount: 4, edgeCount: 0, createdFromVersion: 1 },
};

describe('collectWorkflowBindingIssues：映射与固定版本快照的兼容性', () => {
  const textField = (overrides: Partial<GeneratedAppField> = {}) =>
    ({
      id: 'question',
      label: '问题',
      type: 'textarea',
      required: true,
      helpText: '',
      placeholder: '',
      maxLength: 2000,
      ...overrides,
    }) as GeneratedAppField;

  it('问答规格与问答工作流兼容', () => {
    const spec = qaAppSpecV2();
    expect(
      collectWorkflowBindingIssues(
        qaWorkflowBinding(),
        spec.inputForm.fields,
        qaWorkflowCandidate(),
      ),
    ).toEqual([]);
  });

  it('选项不是工作流选项的子集、可选字段映射必填输入、长度与范围比工作流宽时逐条报告', () => {
    const candidate = qaWorkflowCandidate({
      inputSchema: {
        version: 3,
        collectionMode: 'form',
        fields: [
          { id: 'question', type: 'text', label: '问题', required: true, validation: { maxLength: 500 } },
          { id: 'tone', type: 'single_select', label: '语气', required: false, options: ['正式', '轻松'] },
          { id: 'topK', type: 'number', label: '条数', required: false, validation: { min: 1, max: 10 } },
        ],
      },
    });
    const fields = [
      textField({ required: false }),
      {
        id: 'tone',
        label: '语气',
        type: 'single_select',
        required: false,
        helpText: '',
        placeholder: '',
        options: [
          { value: '正式', label: '正式' },
          { value: '幽默', label: '幽默' },
        ],
      },
      {
        id: 'topK',
        label: '条数',
        type: 'number',
        required: false,
        helpText: '',
        placeholder: '',
        min: 0,
      },
    ] as GeneratedAppField[];
    const binding: WorkflowBinding = {
      ...qaWorkflowBinding(),
      inputMapping: [
        { fieldId: 'question', workflowInputFieldId: 'question' },
        { fieldId: 'tone', workflowInputFieldId: 'tone' },
        { fieldId: 'topK', workflowInputFieldId: 'topK' },
      ],
    };

    const messages = collectWorkflowBindingIssues(binding, fields, candidate).map(
      (issue) => issue.message,
    );

    expect(messages).toEqual([
      '表单字段 question 的 maxLength 2000 超过工作流输入 question 的 maxLength 500',
      '表单字段 tone 的选项 幽默 不在工作流输入 tone 的选项中（可用：正式、轻松）',
      '表单字段 topK 的 min 必须不小于工作流输入 topK 的 min 1',
      '表单字段 topK 的 max 必须不大于工作流输入 topK 的 max 10',
      '工作流必填输入 question 映射的表单字段 question 不是必填，留空提交会被工作流拒绝',
    ]);
  });

  it('输出映射指向快照中不存在的节点或对 text-output 取 path 时报告', () => {
    const binding: WorkflowBinding = {
      ...qaWorkflowBinding(),
      outputMapping: [
        { sectionId: 'answer', nodeId: 'out-answer', path: 'answer' },
        { sectionId: 'citations', nodeId: 'out-missing' },
      ],
    };

    expect(
      collectWorkflowBindingIssues(
        binding,
        qaAppSpecV2().inputForm.fields,
        qaWorkflowCandidate(),
      ),
    ).toEqual([
      {
        path: ['binding', 'outputMapping', 0, 'path'],
        message: '输出节点 out-answer 是 text-output，不能用 path 取键',
      },
      {
        path: ['binding', 'outputMapping', 1, 'nodeId'],
        message:
          '工作流固定版本中没有输出节点 out-missing（可用：out-answer、out-structured）',
      },
    ]);
  });

  it('工作流没有声明输入契约时映射键自由（写入顶层 inputParams），只检查输出', () => {
    const binding: WorkflowBinding = {
      ...qaWorkflowBinding(),
      inputMapping: [{ fieldId: 'question', workflowInputFieldId: 'q' }],
    };

    expect(
      collectWorkflowBindingIssues(
        binding,
        qaAppSpecV2().inputForm.fields,
        qaWorkflowCandidate({ inputSchema: null }),
      ),
    ).toEqual([]);
  });
});

describe('GeneratedAppBindingResolverService', () => {
  let rowsByTable: Map<unknown, unknown[]>;

  beforeEach(() => {
    rowsByTable = new Map();
  });

  function createResolver() {
    const tenantDb = createTenantDb(rowsByTable);
    return {
      resolver: new GeneratedAppBindingResolverService(tenantDb.db),
      ...tenantDb,
    };
  }

  it('候选：已发布工作流（排除生成应用自建的工作流）与 Agent 按更新时间合并，工作流带快照的输入契约与顶层输出节点', async () => {
    rowsByTable.set(schema.workflowDefinitions, [
      {
        id: QA_WORKFLOW_ID,
        name: '文档问答',
        description: null,
        publishedVersionId: QA_WORKFLOW_VERSION_ID,
        updatedAt: new Date('2026-10-20T10:00:00Z'),
      },
    ]);
    rowsByTable.set(schema.workflowVersions, [
      {
        id: QA_WORKFLOW_VERSION_ID,
        workflowDefinitionId: QA_WORKFLOW_ID,
        snapshot: QA_SNAPSHOT,
      },
    ]);
    rowsByTable.set(schema.agentDefinitions, [
      {
        id: QA_AGENT_ID,
        name: '文档问答 Agent',
        description: '回答问题',
        publishedVersionId: QA_AGENT_VERSION_ID,
        updatedAt: new Date('2026-10-20T11:00:00Z'),
      },
    ]);
    const { resolver, whereSqlFor } = createResolver();

    const candidates = await resolver.listCandidates(QA_TENANT_ID, null);

    expect(candidates).toEqual([
      {
        kind: 'agent',
        agentDefinitionId: QA_AGENT_ID,
        agentVersionId: QA_AGENT_VERSION_ID,
        name: '文档问答 Agent',
        description: '回答问题',
      },
      {
        kind: 'workflow',
        workflowDefinitionId: QA_WORKFLOW_ID,
        workflowVersionId: QA_WORKFLOW_VERSION_ID,
        name: '文档问答',
        description: null,
        inputSchema: qaWorkflowCandidate().inputSchema,
        outputNodes: [
          { nodeId: 'out-answer', nodeType: 'text-output', label: '答案' },
          { nodeId: 'out-structured', nodeType: 'json-output', label: '结构化答案' },
        ],
      },
    ]);
    const [workflowWhere] = whereSqlFor(schema.workflowDefinitions);
    expect(workflowWhere).toContain('"workflow_definitions"."tenant_id" = $1');
    expect(workflowWhere).toContain('"workflow_definitions"."status" = $2');
    expect(workflowWhere).toContain(
      `"workflow_definitions"."metadata"->>'generatedAppId' IS NULL`,
    );
  });

  it('指定 Agent 目标时只查询该 Agent，不查工作流', async () => {
    rowsByTable.set(schema.agentDefinitions, []);
    const { resolver, select, whereSqlFor } = createResolver();

    const candidates = await resolver.listCandidates(QA_TENANT_ID, {
      kind: 'agent',
      agentDefinitionId: QA_AGENT_ID,
    });

    expect(candidates).toEqual([]);
    expect(select).toHaveBeenCalledTimes(1);
    expect(whereSqlFor(schema.agentDefinitions)[0]).toContain(
      '"agent_definitions"."id" = $3',
    );
  });

  it('解析工作流绑定：目标不存在、未发布、固定版本已归档时返回问题', async () => {
    const spec = qaAppSpecV2();

    rowsByTable.set(schema.workflowDefinitions, []);
    let result = await createResolver().resolver.resolve(QA_TENANT_ID, spec);
    expect(result).toEqual({
      ok: false,
      issues: [
        {
          path: ['binding', 'workflowDefinitionId'],
          message: `绑定的工作流 ${QA_WORKFLOW_ID} 不存在或不属于当前租户`,
        },
      ],
    });

    rowsByTable.set(schema.workflowDefinitions, [
      {
        id: QA_WORKFLOW_ID,
        name: '文档问答',
        description: null,
        status: 'archived',
        publishedVersionId: QA_WORKFLOW_VERSION_ID,
      },
    ]);
    result = await createResolver().resolver.resolve(QA_TENANT_ID, spec);
    expect(result.ok === false && result.issues[0]?.message).toBe(
      '绑定的工作流「文档问答」当前不是已发布状态（archived）',
    );

    rowsByTable.set(schema.workflowDefinitions, [
      {
        id: QA_WORKFLOW_ID,
        name: '文档问答',
        description: null,
        status: 'published',
        publishedVersionId: QA_WORKFLOW_VERSION_ID,
      },
    ]);
    rowsByTable.set(schema.workflowVersions, [
      {
        id: QA_WORKFLOW_VERSION_ID,
        workflowDefinitionId: QA_WORKFLOW_ID,
        snapshot: QA_SNAPSHOT,
        archivedAt: new Date(),
      },
    ]);
    result = await createResolver().resolver.resolve(QA_TENANT_ID, spec);
    expect(result.ok === false && result.issues[0]?.path).toEqual([
      'binding',
      'workflowVersionId',
    ]);
  });

  it('解析工作流绑定：固定版本可用且映射兼容时返回快照构成的候选（源工作流重新发布不影响）', async () => {
    rowsByTable.set(schema.workflowDefinitions, [
      {
        id: QA_WORKFLOW_ID,
        name: '文档问答',
        description: null,
        status: 'published',
        // 已发布版本前进了一版，固定版本仍可用
        publishedVersionId: '01a15536-d0cb-72a0-b687-72b9d721f199',
      },
    ]);
    rowsByTable.set(schema.workflowVersions, [
      {
        id: QA_WORKFLOW_VERSION_ID,
        workflowDefinitionId: QA_WORKFLOW_ID,
        snapshot: QA_SNAPSHOT,
        archivedAt: null,
      },
    ]);
    const { resolver } = createResolver();

    const result = await resolver.resolve(QA_TENANT_ID, qaAppSpecV2());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.resolved.kind).toBe('workflow');
    expect(result.resolved.candidate).toMatchObject({
      workflowVersionId: QA_WORKFLOW_VERSION_ID,
      outputNodes: [
        { nodeId: 'out-answer' },
        { nodeId: 'out-structured' },
      ],
    });
  });

  it('解析 Agent 绑定：固定版本存在时通过，不存在时返回问题', async () => {
    const spec = {
      inputForm: qaAppSpecV2().inputForm,
      binding: {
        kind: 'agent' as const,
        agentDefinitionId: QA_AGENT_ID,
        agentVersionId: QA_AGENT_VERSION_ID,
        replySectionId: 'answer',
      },
    };
    rowsByTable.set(schema.agentDefinitions, [
      {
        id: QA_AGENT_ID,
        name: '文档问答 Agent',
        description: null,
        status: 'published',
        publishedVersionId: QA_AGENT_VERSION_ID,
      },
    ]);
    rowsByTable.set(schema.agentVersions, [
      { id: QA_AGENT_VERSION_ID, archivedAt: null },
    ]);

    const passed = await createResolver().resolver.resolve(QA_TENANT_ID, spec);
    expect(passed).toMatchObject({
      ok: true,
      resolved: {
        kind: 'agent',
        candidate: { agentVersionId: QA_AGENT_VERSION_ID, name: '文档问答 Agent' },
      },
    });

    rowsByTable.set(schema.agentVersions, []);
    const failed = await createResolver().resolver.resolve(QA_TENANT_ID, spec);
    expect(failed.ok === false && failed.issues[0]?.path).toEqual([
      'binding',
      'agentVersionId',
    ]);
  });
});
