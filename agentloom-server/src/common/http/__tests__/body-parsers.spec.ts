import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Controller, HttpCode, Post, Req } from '@nestjs/common';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { FastifyRequest } from 'fastify';
import { registerBodyParsers } from '../body-parsers';

@Controller('echo')
class EchoController {
  @Post()
  @HttpCode(200)
  echo(@Req() request: FastifyRequest & { rawBody?: Buffer }) {
    return {
      raw: request.rawBody?.toString('utf8') ?? null,
      body: request.body,
    };
  }
}

describe('registerBodyParsers', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [EchoController],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
      { rawBody: true },
    );
    registerBodyParsers(app, 'api/v1');
    app.setGlobalPrefix('api/v1');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  async function post(contentType: string, payload: string) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/echo',
      headers: { 'content-type': contentType },
      payload,
    });
    return { status: response.statusCode, json: response.json() };
  }

  // Webhook 签名校验依赖 rawBody：注册自定义类型后 JSON 仍必须保留原始字节
  it('application/json 解析为对象并保留 rawBody', async () => {
    const payload = '{"orderId":"A-1001", "status":"paid"}';

    await expect(post('application/json', payload)).resolves.toEqual({
      status: 200,
      json: { raw: payload, body: { orderId: 'A-1001', status: 'paid' } },
    });
  });

  it('application/x-www-form-urlencoded 可解析并保留 rawBody', async () => {
    const payload = 'payload=%7B%22a%22%3A1%7D&x=1';

    await expect(
      post('application/x-www-form-urlencoded', payload),
    ).resolves.toEqual({
      status: 200,
      json: { raw: payload, body: { payload: '{"a":1}', x: '1' } },
    });
  });

  it('text/plain 解析为字符串并保留 rawBody', async () => {
    await expect(post('text/plain', 'hello')).resolves.toEqual({
      status: 200,
      json: { raw: 'hello', body: 'hello' },
    });
  });

  it('application/a2a+json 按 JSON 解析', async () => {
    const payload = '{"jsonrpc":"2.0","id":1,"method":"message/send"}';

    await expect(post('application/a2a+json', payload)).resolves.toEqual({
      status: 200,
      json: {
        raw: payload,
        body: { jsonrpc: '2.0', id: 1, method: 'message/send' },
      },
    });
  });
});
