import { beforeEach, describe, expect, it } from 'vitest';

import {
  TEMPLATE_SEEDS,
  seedTemplates,
} from './template-seeds';
import { workflowTemplates, type NewWorkflowTemplate } from '../schema';

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
