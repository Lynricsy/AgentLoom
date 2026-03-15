import { describe, expect, it } from 'vitest';

import { WORKFLOW_EXPORT_VERSION } from '../dto/workflow-export.dto';
import {
  MAX_IMPORT_FILE_SIZE,
  validateImportFile,
} from './validate-import.utils';

type LooseImportEnvelope = {
  schema_version: string;
  exported_at: string;
  workflow: {
    name: string;
    description: string | null;
    definition: {
      nodes: Array<Record<string, unknown>>;
      edges: Array<Record<string, unknown>>;
      viewport: Record<string, unknown>;
    };
    input_schema: unknown | null;
  };
};

function createValidEnvelope(): LooseImportEnvelope {
  return {
    schema_version: WORKFLOW_EXPORT_VERSION,
    exported_at: '2025-01-01T00:00:00.000Z',
    workflow: {
      name: '导入测试工作流',
      description: '用于 validateImportFile 单测',
      definition: {
        nodes: [
          {
            id: 'node-1',
            type: 'input',
            position: { x: 10, y: 20 },
            data: { label: '输入节点' },
          },
          {
            id: 'node-2',
            type: 'agent',
            position: { x: 30, y: 40 },
            data: { label: '处理节点' },
          },
        ],
        edges: [
          {
            id: 'edge-1',
            source: 'node-1',
            target: 'node-2',
            sourceHandle: 'out',
            targetHandle: 'in',
          },
        ],
        viewport: {
          x: 0,
          y: 0,
          zoom: 1,
        },
      },
      input_schema: null,
    },
  };
}

describe('validateImportFile', () => {
  it('应解析有效 envelope，并规范化节点、边与 input_schema', () => {
    const envelope = createValidEnvelope();
    envelope.workflow.definition.nodes[1] = {
      id: 'node-2',
      type: 'agent',
      position: { x: 30, y: 40 },
    };
    envelope.workflow.definition.edges[0] = {
      source: 'node-1',
      target: 'node-2',
      sourceHandle: 123,
      targetHandle: null,
    };
    envelope.workflow.input_schema = {
      version: 2,
      collectionMode: 'hybrid',
      conversationPlan: {
        systemPrompt: '请逐步收集参数',
        maxTurns: 3,
      },
      fields: [
        {
          id: 'region',
          type: 'single_select',
          label: '地区',
          options: ['cn', 'us'],
        },
        {
          id: 'keyword',
          type: 'text',
          label: '关键词',
          visibility: {
            fieldId: 'region',
            equals: 'cn',
          },
        },
      ],
    };

    const result = validateImportFile(envelope);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.workflow).toEqual({
      name: '导入测试工作流',
      description: '用于 validateImportFile 单测',
      definition: {
        nodes: [
          {
            id: 'node-1',
            type: 'input',
            position: { x: 10, y: 20 },
            data: { label: '输入节点' },
          },
          {
            id: 'node-2',
            type: 'agent',
            position: { x: 30, y: 40 },
            data: {},
          },
        ],
        edges: [
          {
            source: 'node-1',
            target: 'node-2',
            id: 'imported-edge-1',
            sourceHandle: 123,
            targetHandle: null,
          },
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
      inputSchema: {
        version: 2,
        collectionMode: 'hybrid',
        conversationPlan: {
          systemPrompt: '请逐步收集参数',
          maxTurns: 3,
        },
        fields: [
          {
            id: 'region',
            type: 'single_select',
            label: '地区',
            options: ['cn', 'us'],
            required: false,
          },
          {
            id: 'keyword',
            type: 'text',
            label: '关键词',
            visibility: {
              fieldId: 'region',
              equals: 'cn',
            },
            required: false,
          },
        ],
      },
      nodeCount: 2,
      edgeCount: 1,
    });
  });

  it('schema_version 非法时应返回 schema 错误', () => {
    const result = validateImportFile({
      ...createValidEnvelope(),
      schema_version: 'agentloom-workflow-v2',
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      `schema_version: Invalid input: expected "${WORKFLOW_EXPORT_VERSION}"`,
    );
  });

  it('传入字符串时应返回 expected object 错误，而不是尝试 JSON.parse', () => {
    const result = validateImportFile('{"invalid": true');

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('expected object');
  });

  it('内容超过 10MB 时应返回大小限制错误', () => {
    const envelope = createValidEnvelope();
    envelope.workflow.definition.nodes[0] = {
      ...envelope.workflow.definition.nodes[0],
      data: {
        payload: 'x'.repeat(MAX_IMPORT_FILE_SIZE),
      },
    };

    const result = validateImportFile(envelope);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(['Import file exceeds maximum size of 10MB']);
  });

  it('节点缺少 id/type/position 或 position 非法时应返回对应错误', () => {
    const envelope = createValidEnvelope();
    envelope.workflow.definition.nodes = [
      {
        type: 'agent',
        position: { x: 10, y: 20 },
      },
      {
        id: 'node-without-type',
        position: { x: 10, y: 20 },
      },
      {
        id: 'node-without-position',
        type: 'agent',
      },
      {
        id: 'node-invalid-position',
        type: 'agent',
        position: { x: Number.NaN, y: 20 },
      },
    ];
    envelope.workflow.definition.edges = [];

    const result = validateImportFile(envelope);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'Node missing id',
        'Node node-without-type missing type',
        'Node node-without-position missing position',
        'Node node-invalid-position has invalid position',
      ]),
    );
  });

  it('重复节点 id 时应返回 Duplicate node id 错误', () => {
    const envelope = createValidEnvelope();
    envelope.workflow.definition.nodes[1] = {
      id: 'node-1',
      type: 'agent',
      position: { x: 30, y: 40 },
      data: {},
    };

    const result = validateImportFile(envelope);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Duplicate node id: node-1');
  });

  it('边缺少 source/target 时应返回结构错误，且不会要求 id 必填', () => {
    const envelope = createValidEnvelope();
    envelope.workflow.definition.edges = [
      {
        target: 'node-2',
      },
      {
        source: 'node-1',
      },
    ];

    const result = validateImportFile(envelope);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'Edge unknown references invalid source: undefined',
        'Edge unknown references invalid target: undefined',
      ]),
    );
  });

  it('边引用不存在的节点时应返回引用完整性错误', () => {
    const envelope = createValidEnvelope();
    envelope.workflow.definition.edges = [
      {
        id: 'edge-invalid',
        source: 'missing-source',
        target: 'missing-target',
      },
    ];

    const result = validateImportFile(envelope);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'Edge edge-invalid references invalid source: missing-source',
        'Edge edge-invalid references invalid target: missing-target',
      ]),
    );
  });

  it('viewport 非法时应返回 Workflow missing valid viewport', () => {
    const envelope = createValidEnvelope();
    envelope.workflow.definition.viewport = {
      x: 0,
      y: 'invalid',
      zoom: 1,
    } as never;

    const result = validateImportFile(envelope);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Workflow missing valid viewport');
  });

  it('input_schema 非法时应返回 workflow.input_schema 路径错误', () => {
    const envelope = createValidEnvelope();
    envelope.workflow.input_schema = {
      collectionMode: 'form',
      fields: [
        {
          id: 'region',
          type: 'single_select',
          label: '地区',
          options: ['cn', 'us'],
        },
        {
          id: 'keyword',
          type: 'text',
          label: '关键词',
          visibility: {
            fieldId: 'missing-field',
            equals: 'cn',
          },
        },
      ],
    };

    const result = validateImportFile(envelope);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      'workflow.input_schema.fields.1.visibility.fieldId: 可见性规则必须引用已存在的字段 ID',
    ]);
  });

  it('应导出 10MB 的 MAX_IMPORT_FILE_SIZE 常量', () => {
    expect(MAX_IMPORT_FILE_SIZE).toBe(10 * 1024 * 1024);
  });
});
