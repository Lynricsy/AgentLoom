import { describe, expect, it } from 'vitest';

import { GeneratedAppPublicShareNotReadyException } from '../generated-app.exceptions';
import { createPublicRuntimeServiceForTest } from './generated-app-test-support';

// 复用本模块统一工厂，确保 focused 测试仍满足公开运行时的真实依赖契约。
const service = createPublicRuntimeServiceForTest();

describe('GeneratedAppPublicRuntimeService public boundaries', () => {
  it('publish_candidate 且允许分享时应通过公开分享校验', () => {
    expect(() =>
      service.assertCanEnablePublicShare({
        id: 'app-1',
        readiness: {
          state: 'publish_candidate',
          canCreatePublicShare: true,
          blockingIssueCount: 0,
          warningCount: 0,
          summary: 'ready',
          blockers: [],
          warnings: [],
        },
      }),
    ).not.toThrow();
  });

  it('未达到 publish_candidate 时应拒绝公开分享', () => {
    expect(() =>
      service.assertCanEnablePublicShare({
        id: 'app-1',
        readiness: {
          state: 'preview',
          canCreatePublicShare: false,
          blockingIssueCount: 1,
          warningCount: 0,
          summary: 'blocked',
          blockers: [],
          warnings: [],
        },
      }),
    ).toThrow(GeneratedAppPublicShareNotReadyException);
  });

  it('token-like 匿名会话值应替换为随机 UUID', () => {
    const normalized = service.normalizeAnonymousSessionId('a'.repeat(64));

    expect(normalized).not.toBe('a'.repeat(64));
    expect(normalized).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('普通匿名会话值应只 trim 不改写', () => {
    expect(service.normalizeAnonymousSessionId('  visitor-123  ')).toBe(
      'visitor-123',
    );
  });
});
