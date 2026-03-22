import { describe, expect, it, vi } from 'vitest';

import type { DrizzleDB } from '../../../../../database/database.module';
import type { RoutingCandidate } from '../../../core/routing-candidate';
import type { RoutingContext } from '../../../core/routing-context';
import { EloRouter } from '../elo.strategy';

type MockDb = Pick<DrizzleDB, 'select'>;

function createCandidate(
  id: string,
  modelConfigId: string,
  eloRating: number,
): RoutingCandidate {
  return {
    id,
    modelConfigId,
    name: id,
    provider: 'openai',
    healthStatus: 'healthy',
    routingMeta: {
      contextWindow: 128_000,
      costs: { input: 0.01, output: 0.03 },
      qualityRank: 90,
      avgLatencyMs: 320,
      maxInputTokens: 128_000,
      eloRating,
    },
  };
}

function createContext(overrides: Partial<RoutingContext> = {}): RoutingContext {
  return {
    inputTokenCount: 1_500,
    tenantId: 'tenant-1',
    ...overrides,
  };
}

function createMockDb(routerRows: unknown[]): { db: MockDb } {
  const selectMock = vi.fn(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(routerRows),
    }),
  }));

  return {
    db: { select: selectMock } as unknown as MockDb,
  };
}

describe('EloRouter', () => {
  it('explorationRate=0 时应该始终选择 Elo 最高的模型', async () => {
    const db = createMockDb([
      { modelConfigId: 'config-a', eloRating: '1620' },
      { modelConfigId: 'config-b', eloRating: '1510' },
      { modelConfigId: 'config-c', eloRating: '1470' },
    ]);
    const router = new EloRouter(db.db, {
      kFactor: 32,
      explorationRate: 0,
    });
    const candidates = [
      createCandidate('candidate-a', 'config-a', 1620),
      createCandidate('candidate-b', 'config-b', 1510),
      createCandidate('candidate-c', 'config-c', 1470),
    ];

    const decision = await router.routeSingle(candidates, createContext());

    expect(decision.selectedModelId).toBe('candidate-a');
  });

  it('explorationRate=0.3 时应该出现可观测的探索分布', async () => {
    const db = createMockDb([
      { modelConfigId: 'config-a', eloRating: '1620' },
      { modelConfigId: 'config-b', eloRating: '1510' },
      { modelConfigId: 'config-c', eloRating: '1470' },
    ]);
    const router = new EloRouter(db.db, {
      kFactor: 32,
      explorationRate: 0.3,
    });
    const candidates = [
      createCandidate('candidate-a', 'config-a', 1620),
      createCandidate('candidate-b', 'config-b', 1510),
      createCandidate('candidate-c', 'config-c', 1470),
    ];
    const counts: Record<string, number> = {};

    for (let index = 0; index < 1000; index += 1) {
      const decision = await router.routeSingle(candidates, createContext());
      const selectedModelId = decision.selectedModelId;
      if (selectedModelId) {
        counts[selectedModelId] = (counts[selectedModelId] ?? 0) + 1;
      }
    }

    expect(counts['candidate-a']).toBeGreaterThan(720);
    expect(counts['candidate-a']).toBeLessThan(880);
    expect(counts['candidate-b']).toBeGreaterThan(50);
    expect(counts['candidate-b']).toBeLessThan(180);
    expect(counts['candidate-c']).toBeGreaterThan(50);
    expect(counts['candidate-c']).toBeLessThan(180);
  });
});
