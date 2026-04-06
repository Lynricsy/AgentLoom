import { describe, expect, it, vi } from 'vitest';

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
  it('应把 bodyLimit 提升到覆盖附件 transport 负载上限', () => {
    createAppFastifyAdapter();

    expect(mockFastifyAdapter).toHaveBeenCalledWith({
      logger: true,
      bodyLimit: MAX_CONVERSATION_TRANSPORT_PAYLOAD_BYTES,
    });
  });
});
