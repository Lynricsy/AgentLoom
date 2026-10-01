import { FastifyAdapter } from '@nestjs/platform-fastify';
import { envSchema } from '../../config/env.schema';
import { MAX_CONVERSATION_TRANSPORT_PAYLOAD_BYTES } from '../../modules/agent-conversation/conversation-attachment';

export function createAppFastifyAdapter(): FastifyAdapter {
  // Fastify 实例先于 ConfigModule 创建，这里直接按同一份 env schema 解析该变量。
  const trustProxyHops = envSchema.shape.APP_TRUST_PROXY_HOPS.parse(
    process.env.APP_TRUST_PROXY_HOPS,
  );

  return new FastifyAdapter({
    logger: true,
    // 对话附件会以内联 base64 + JSON 发送，transport ceiling 必须高于原始 10MB 合同。
    bodyLimit: MAX_CONVERSATION_TRANSPORT_PAYLOAD_BYTES,
    // 跳数语义：从直连对端往回信任 N 跳，request.ip 取 X-Forwarded-For 中第 N 个
    // 由可信代理追加的地址；客户端自填的前缀条目永远不会被采用。
    trustProxy: trustProxyHops,
  });
}
