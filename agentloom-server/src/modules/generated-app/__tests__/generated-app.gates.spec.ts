import { describe, expect, it } from 'vitest';

import type { GeneratedAppGateResult } from '../../../database/schema';
import {
  createInitialGeneratedAppGateResults,
  evaluateGeneratedAppReadiness,
  normalizeGeneratedAppGateResults,
} from '../generated-app.gates';

const NOW = '2026-04-25T00:00:00.000Z';

function markCanonicalGatesPassed(): GeneratedAppGateResult[] {
  return createInitialGeneratedAppGateResults(NOW).map((gate) => ({
    ...gate,
    status: 'passed',
    summary: `${gate.name} 已通过`,
  }));
}

describe('generated-app gates', () => {
  it('pending blocker 应保持 preview 且禁止创建公开链接', () => {
    const gateResults = createInitialGeneratedAppGateResults(NOW);

    const readiness = evaluateGeneratedAppReadiness(gateResults);

    expect(readiness.state).toBe('preview');
    expect(readiness.canCreatePublicShare).toBe(false);
    expect(readiness.blockingIssueCount).toBeGreaterThan(0);
  });

  it('failed blocker 应进入 blocked 且禁止创建公开链接', () => {
    const gateResults = createInitialGeneratedAppGateResults(NOW).map((gate) =>
      gate.gateId === 'gate-2'
        ? {
            ...gate,
            status: 'failed' as const,
            summary: '静态合约检查失败',
          }
        : gate,
    );

    const readiness = evaluateGeneratedAppReadiness(gateResults);

    expect(readiness.state).toBe('blocked');
    expect(readiness.canCreatePublicShare).toBe(false);
    expect(readiness.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          gateId: 'gate-2',
          status: 'failed',
        }),
      ]),
    );
  });

  it('blocking 全 passed 但存在非阻断 warning 时只能进入 trial', () => {
    const gateResults = normalizeGeneratedAppGateResults(
      [
        ...markCanonicalGatesPassed(),
        {
          gateId: 'ux-warning',
          order: 100,
          name: '体验风险提示',
          blocking: false,
          status: 'warning',
          summary: '移动端仍需补充一次手动响应式检查',
          evidence: [],
          updatedAt: NOW,
        },
      ],
      NOW,
    );

    const readiness = evaluateGeneratedAppReadiness(gateResults);

    expect(readiness.state).toBe('trial');
    expect(readiness.canCreatePublicShare).toBe(false);
    expect(readiness.warningCount).toBe(1);
  });

  it('blocking 全 passed 且无 warning 时成为 publish_candidate', () => {
    const gateResults = markCanonicalGatesPassed();

    const readiness = evaluateGeneratedAppReadiness(gateResults);

    expect(readiness.state).toBe('publish_candidate');
    expect(readiness.canCreatePublicShare).toBe(true);
    expect(readiness.blockingIssueCount).toBe(0);
    expect(readiness.warningCount).toBe(0);
  });
});
