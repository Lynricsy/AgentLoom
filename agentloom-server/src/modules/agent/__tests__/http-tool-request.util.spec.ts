import { afterEach, describe, expect, it, vi } from 'vitest';

import { executeHttpToolRequest } from '../http-tool-request.util';

function mockFetchResponse(body: string, contentType: string): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(body, {
        status: 404,
        headers: { 'content-type': contentType },
      }),
    ),
  );
}

describe('executeHttpToolRequest 响应体解析', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    'application/json',
    'application/json; charset=utf-8',
    'application/problem+json',
    'application/vnd.api+json; charset=utf-8',
    'Application/Problem+JSON',
  ])('%s 响应解析为对象', async (contentType) => {
    mockFetchResponse(
      JSON.stringify({ type: 'about:blank', status: 404 }),
      contentType,
    );

    const response = await executeHttpToolRequest(
      { url: 'http://example.test/nope', method: 'GET' },
      {},
    );

    expect(response.body).toEqual({ type: 'about:blank', status: 404 });
  });

  it.each(['text/plain', 'application/jsonl', 'text/html'])(
    '%s 响应保持文本',
    async (contentType) => {
      mockFetchResponse('{"a":1}', contentType);

      const response = await executeHttpToolRequest(
        { url: 'http://example.test/raw', method: 'GET' },
        {},
      );

      expect(response.body).toBe('{"a":1}');
    },
  );
});
