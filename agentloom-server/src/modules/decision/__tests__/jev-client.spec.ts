import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { JevClient, JevHttpError } from '../providers/jev-client';

function createClient(env: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    APP_TYPESAFE_API_KEY: 'ts-key',
    APP_TYPESAFE_BASE_URL: 'https://jev.test/',
    APP_TYPESAFE_MODEL: 'jev-1.13.0',
    ...env,
  };
  return new JevClient({
    get: (key: string) => values[key],
  } as unknown as ConfigService);
}

const REQUEST = {
  state: { message: 'hello' },
  questions: {
    answer: {
      type: 'noul' as const,
      instructions: 'Is it relevant?',
      criteria: { true: 'yes', false: 'no' },
    },
  },
};

const OK_BODY = {
  model: 'jev-1.13.0',
  answers: { answer: { type: 'noul', noul: 0.82 } },
  usage: { input_tokens: 120, output_tokens: 3 },
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('JevClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('按钉版模型 POST /v1/systemone 并解析回答', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, OK_BODY));
    vi.stubGlobal('fetch', fetchMock);

    const response = await createClient().evaluate(
      REQUEST,
      new AbortController().signal,
    );

    expect(response).toEqual(OK_BODY);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://jev.test/v1/systemone');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer ts-key',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body as string)).toEqual({
      state: REQUEST.state,
      model: 'jev-1.13.0',
      questions: REQUEST.questions,
    });
  });

  it('429 时退避后重试一次', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, { error: 'rate limited' }))
      .mockResolvedValueOnce(jsonResponse(200, OK_BODY));
    vi.stubGlobal('fetch', fetchMock);

    const response = await createClient().evaluate(
      REQUEST,
      new AbortController().signal,
    );

    expect(response.answers.answer).toEqual({ type: 'noul', noul: 0.82 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('重试后仍 529 抛 JevHttpError', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(529, { error: 'overloaded' }))
      .mockResolvedValueOnce(jsonResponse(529, { error: 'overloaded' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createClient().evaluate(REQUEST, new AbortController().signal),
    ).rejects.toMatchObject({ name: 'JevHttpError', status: 529 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('其他非 2xx 不重试，抛带响应片段的 JevHttpError', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(422, { error: 'bad criteria' }));
    vi.stubGlobal('fetch', fetchMock);

    const error = await createClient()
      .evaluate(REQUEST, new AbortController().signal)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(JevHttpError);
    expect(error).toMatchObject({ status: 422 });
    expect((error as JevHttpError).bodySnippet).toContain('bad criteria');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('响应不符合 schema 时抛错', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { model: 'jev-1.13.0' })),
    );

    await expect(
      createClient().evaluate(REQUEST, new AbortController().signal),
    ).rejects.toThrow();
  });

  it('未配置 API Key 时 disabled 且不发请求', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const client = createClient({ APP_TYPESAFE_API_KEY: undefined });

    expect(client.enabled).toBe(false);
    await expect(
      client.evaluate(REQUEST, new AbortController().signal),
    ).rejects.toThrow('APP_TYPESAFE_API_KEY');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
