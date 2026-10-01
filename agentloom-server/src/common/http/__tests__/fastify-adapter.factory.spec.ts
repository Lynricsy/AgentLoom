import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockFastifyAdapter } = vi.hoisted(() => ({
  mockFastifyAdapter: vi.fn(function MockFastifyAdapter(options: unknown) {
    return { options };
  }),
}));

vi.mock('@nestjs/platform-fastify', () => ({
  FastifyAdapter: mockFastifyAdapter,
}));

import { MAX_CONVERSATION_TRANSPORT_PAYLOAD_BYTES } from '../../../modules/agent-conversation/conversation-attachment';
import { createAppFastifyAdapter } from '../fastify-adapter.factory';

describe('createAppFastifyAdapter', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    mockFastifyAdapter.mockClear();
  });

  it('应把 bodyLimit 提升到覆盖附件 transport 负载上限', () => {
    createAppFastifyAdapter();

    expect(mockFastifyAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        logger: true,
        bodyLimit: MAX_CONVERSATION_TRANSPORT_PAYLOAD_BYTES,
      }),
    );
  });

  it('未配置 APP_TRUST_PROXY_HOPS 时不信任任何 X-Forwarded-For', () => {
    vi.stubEnv('APP_TRUST_PROXY_HOPS', undefined);
    createAppFastifyAdapter();

    expect(mockFastifyAdapter).toHaveBeenCalledWith(
      expect.objectContaining({ trustProxy: 0 }),
    );
  });

  it('按 APP_TRUST_PROXY_HOPS 设置可信代理跳数，非法值直接启动失败', () => {
    vi.stubEnv('APP_TRUST_PROXY_HOPS', '2');
    createAppFastifyAdapter();
    expect(mockFastifyAdapter).toHaveBeenCalledWith(
      expect.objectContaining({ trustProxy: 2 }),
    );

    vi.stubEnv('APP_TRUST_PROXY_HOPS', '-1');
    expect(() => createAppFastifyAdapter()).toThrow();
  });
});
