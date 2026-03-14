import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EXPORT_SCHEMA_VERSION,
  MAX_IMPORT_SIZE,
  exportBlock,
  parseImportFile,
  validateImportFile,
  type ExportedBlock,
} from './blockExportImport';

function makeExportedBlock(): ExportedBlock {
  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: '2026-03-14T12:00:00.000Z',
    block: {
      name: '分析块',
      description: '用于测试导入',
      category: 'analysis',
      tags: ['test', 'analysis'],
      definition: {
        nodes: [
          {
            id: 'node-1',
            type: 'llm-agent',
            position: { x: 0, y: 0 },
            data: { label: '节点 1' },
          },
        ],
        edges: [],
        inputPorts: [{ id: 'input-1', label: '输入', dataType: 'text' }],
        outputPorts: [{ id: 'output-1', label: '输出', dataType: 'json' }],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
      metadata: {
        nodeCount: 1,
        version: 2,
        author: 'tester',
      },
    },
  };
}

describe('blockExportImport', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('exportBlock creates export structure with schema version', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T08:00:00.000Z'));

    const exported = exportBlock({
      id: 'block-1',
      name: '导出块',
      description: '导出描述',
      category: 'analysis',
      tags: ['export'],
      metadata: {
        nodeCount: 1,
        version: 3,
      },
      version: 3,
      isPublished: true,
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-02T00:00:00.000Z',
      definition: {
        nodes: [{ id: 'node-1', data: {}, position: { x: 0, y: 0 } }],
        edges: [],
        inputPorts: [{ id: 'input-1', label: '输入', dataType: 'text' }],
        outputPorts: [{ id: 'output-1', label: '输出', dataType: 'json' }],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
      createdBy: 'user-1',
    });

    expect(exported.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    expect(exported.exportedAt).toBe('2026-03-14T08:00:00.000Z');
    expect(exported.block).toMatchObject({
      name: '导出块',
      description: '导出描述',
      category: 'analysis',
      tags: ['export'],
    });
    expect(exported.block.metadata?.exportedAt).toBe(
      '2026-03-14T08:00:00.000Z',
    );
  });

  it('validateImportFile accepts valid export content', () => {
    const exported = makeExportedBlock();

    const result = validateImportFile(JSON.stringify(exported));

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.block).toEqual(exported);
  });

  it('validateImportFile rejects invalid schema version', () => {
    const exported = makeExportedBlock();

    const result = validateImportFile(
      JSON.stringify({
        ...exported,
        schemaVersion: 'agentloom-block-v0',
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      `schemaVersion 必须是 "${EXPORT_SCHEMA_VERSION}"。`,
    );
  });

  it('validateImportFile rejects missing block name', () => {
    const exported = makeExportedBlock();

    const result = validateImportFile(
      JSON.stringify({
        ...exported,
        block: {
          ...exported.block,
          name: '   ',
        },
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('block.name 不能为空。');
  });

  it('validateImportFile rejects empty nodes array', () => {
    const exported = makeExportedBlock();

    const result = validateImportFile(
      JSON.stringify({
        ...exported,
        block: {
          ...exported.block,
          definition: {
            ...exported.block.definition,
            nodes: [],
          },
        },
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('block.definition.nodes 必须是非空数组。');
  });

  it('validateImportFile rejects invalid port data types', () => {
    const exported = makeExportedBlock();

    const result = validateImportFile(
      JSON.stringify({
        ...exported,
        block: {
          ...exported.block,
          definition: {
            ...exported.block.definition,
            inputPorts: [
              {
                id: 'input-1',
                label: '输入',
                dataType: 'binary',
              },
            ],
          },
        },
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'block.definition.inputPorts[0].dataType 无效。',
    );
  });

  it('parseImportFile rejects oversized files', async () => {
    const file = new File(['{}'], 'oversized.agentloom-block.json', {
      type: 'application/json',
    });

    Object.defineProperty(file, 'size', {
      value: MAX_IMPORT_SIZE + 1,
    });

    await expect(parseImportFile(file)).rejects.toThrow(
      '导入文件大小不能超过 5 MB。',
    );
  });
});
