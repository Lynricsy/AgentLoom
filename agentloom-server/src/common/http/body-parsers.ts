import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { RawServerDefault } from 'fastify';

/**
 * 注册应用的请求体解析器，所有类型都保留 `request.rawBody`（需以 `rawBody: true` 创建应用）。
 *
 * 任何一次 `useBodyParser` 都会让 Nest 在 init 时跳过默认解析器注册，
 * application/json 与 urlencoded 随之不再保留 rawBody，Webhook 签名校验必然失败。
 * 因此先按 Nest 默认方式注册这两种，再追加自定义类型。
 */
export function registerBodyParsers(
  app: NestFastifyApplication,
  globalPrefix: string,
): void {
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.registerParserMiddleware(globalPrefix, true);
  const fastify = httpAdapter.getInstance();
  const { bodyLimit } = fastify.initialConfig;

  // Webhook 签名针对原始字节，text/plain 请求体同样需要 rawBody
  app.useBodyParser<RawServerDefault>(
    'text/plain',
    { bodyLimit },
    (_request, body, done) => done(null, body.toString('utf8')),
  );

  // A2A 客户端可能以 `application/a2a+json` 提交 JSON-RPC 请求体，按 JSON 解析
  const parseJson = fastify.getDefaultJsonParser('error', 'error');
  app.useBodyParser<RawServerDefault>(
    'application/a2a+json',
    { bodyLimit },
    (request, body, done) => parseJson(request, body.toString('utf8'), done),
  );
}
