import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyRequest, RawServerDefault } from 'fastify';

/**
 * A2A JSON-RPC 端点的请求体不是合法 JSON 时的占位 body。
 *
 * JSON-RPC 要求以 `-32700 Parse error` 应答，而解析器默认抛出的 400 会被全局过滤器
 * 写成 problem+json。该路径改为放行此标记，由 A2aController 回 JSON-RPC 错误。
 */
export const INVALID_JSON_BODY: unique symbol = Symbol('invalid-json-body');

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

  const a2aRpcPath = new RegExp(
    `^/${globalPrefix.replace(/^\/+|\/+$/g, '')}/a2a/agents/[^/?#]+/rpc(?:[?#]|$)`,
  );
  const parseJson = fastify.getDefaultJsonParser('error', 'error');
  const parseJsonBody = (
    request: FastifyRequest,
    body: Buffer,
    done: (error: Error | null, value?: unknown) => void,
  ) =>
    parseJson(request, body.toString('utf8'), (error, value) => {
      if (error && a2aRpcPath.test(request.url)) {
        done(null, INVALID_JSON_BODY);
        return;
      }
      done(error, value);
    });

  // 替换 Nest 默认的 JSON 解析器（同样保留 rawBody），只为 A2A RPC 路径改写解析失败
  fastify.removeContentTypeParser('application/json');
  app.useBodyParser<RawServerDefault>(
    'application/json',
    { bodyLimit },
    parseJsonBody,
  );
  // A2A 客户端可能以 `application/a2a+json` 提交 JSON-RPC 请求体，按 JSON 解析
  app.useBodyParser<RawServerDefault>(
    'application/a2a+json',
    { bodyLimit },
    parseJsonBody,
  );
}
