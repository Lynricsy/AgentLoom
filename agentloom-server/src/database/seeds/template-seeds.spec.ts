import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { TEMPLATE_SEEDS, seedTemplates } from './template-seeds';
import { workflowTemplates, type NewWorkflowTemplate } from '../schema';

const STUDIO_PUBLIC_DIR = join(
  __dirname,
  '../../../../agentloom-studio/public',
);

function nodeTypeOf(node: { data: Record<string, unknown> }): unknown {
  return node.data.nodeType;
}

describe('template seeds', () => {
  const seededRecords = new Map<string, NewWorkflowTemplate>();
  const originalFirstTemplate = structuredClone(TEMPLATE_SEEDS[0]);

  const db = {
    insert(table: typeof workflowTemplates) {
      expect(table).toBe(workflowTemplates);

      return {
        values(seed: NewWorkflowTemplate) {
          return {
            async onConflictDoUpdate() {
              seededRecords.set(seed.slug, structuredClone(seed));
            },
          };
        },
      };
    },
  };

  beforeEach(() => {
    seededRecords.clear();
    TEMPLATE_SEEDS[0] = structuredClone(originalFirstTemplate);
  });

  it('should define nodes, edges, and viewport for every template seed', () => {
    expect(TEMPLATE_SEEDS).toHaveLength(5);

    for (const seed of TEMPLATE_SEEDS) {
      expect(seed.definition.nodes).toBeInstanceOf(Array);
      expect(seed.definition.edges).toBeInstanceOf(Array);
      expect(seed.definition.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    }
  });

  it.each(TEMPLATE_SEEDS.map((seed) => [seed.slug, seed] as const))(
    '%s 是可直接运行的图：表单经触发器进入，每个 Agent 有角色与输入，结果落到输出节点',
    (_slug, seed) => {
      const { nodes, edges } = seed.definition;
      const nodeIds = new Set(nodes.map((node) => node.id));

      expect(
        nodes.filter((node) => nodeTypeOf(node) === 'manual-trigger'),
      ).toHaveLength(1);
      for (const edge of edges) {
        expect(nodeIds.has(edge.source) && nodeIds.has(edge.target)).toBe(true);
        expect(edge.sourceHandle).toBeTruthy();
        expect(edge.targetHandle).toBeTruthy();
      }

      for (const agent of nodes.filter(
        (node) => nodeTypeOf(node) === 'agent',
      )) {
        const incoming = edges.filter((edge) => edge.target === agent.id);
        expect(incoming.map((edge) => edge.targetHandle)).toEqual(
          expect.arrayContaining(['system-prompt-in', 'text-in']),
        );
        // 模板 Agent 不带绑定，由实例化时为租户生成
        expect(agent.data.config).toEqual({});
      }

      // 从触发器出发能走到某个输出节点
      const reachable = new Set([
        nodes.find((node) => nodeTypeOf(node) === 'manual-trigger')!.id,
      ]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const edge of edges) {
          if (reachable.has(edge.source) && !reachable.has(edge.target)) {
            reachable.add(edge.target);
            grew = true;
          }
        }
      }
      const outputs = nodes.filter((node) =>
        ['text-output', 'json-output'].includes(String(nodeTypeOf(node))),
      );
      expect(outputs.some((node) => reachable.has(node.id))).toBe(true);

      expect(seed.thumbnailUrl).toMatch(/^\/covers\/templates\/.+\.svg$/);
      expect(existsSync(join(STUDIO_PUBLIC_DIR, seed.thumbnailUrl!))).toBe(
        true,
      );
    },
  );

  it('should upsert template seeds idempotently', async () => {
    await seedTemplates(db as never);

    expect(seededRecords).toHaveProperty('size', TEMPLATE_SEEDS.length);
    expect(seededRecords.get('daily-competitor-analysis')?.name).toBe(
      '每日竞品分析',
    );

    TEMPLATE_SEEDS[0] = {
      ...TEMPLATE_SEEDS[0],
      name: '每日竞品分析（更新版）',
      definition: {
        ...TEMPLATE_SEEDS[0].definition,
        viewport: { x: 120, y: 80, zoom: 0.9 },
      },
      metadata: {
        ...TEMPLATE_SEEDS[0].metadata,
        version: '1.1.0',
      },
    };

    await seedTemplates(db as never);

    expect(seededRecords.size).toBe(TEMPLATE_SEEDS.length);
    expect(seededRecords.get('daily-competitor-analysis')).toEqual(
      expect.objectContaining({
        name: '每日竞品分析（更新版）',
        metadata: expect.objectContaining({ version: '1.1.0' }),
        definition: expect.objectContaining({
          viewport: { x: 120, y: 80, zoom: 0.9 },
        }),
      }),
    );
  });
});
