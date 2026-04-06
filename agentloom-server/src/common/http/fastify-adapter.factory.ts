import { FastifyAdapter } from '@nestjs/platform-fastify';
import { MAX_CONVERSATION_TRANSPORT_PAYLOAD_BYTES } from '../../modules/agent-conversation/conversation-attachment';

export function createAppFastifyAdapter(): FastifyAdapter {
  return new FastifyAdapter({
    logger: true,
    // 对话附件会以内联 base64 + JSON 发送，transport ceiling 必须高于原始 10MB 合同。
    bodyLimit: MAX_CONVERSATION_TRANSPORT_PAYLOAD_BYTES,
  });
}
