import { describe, expect, it } from 'vitest';

import { LookupModelMetadataQuerySchema } from '../dto/lookup-model-metadata-query.dto';
import { TestProviderConnectionSchema } from '../dto/test-provider-connection.dto';

describe('TestProviderConnectionSchema', () => {
  it('不带请求体时视为空对象', () => {
    expect(TestProviderConnectionSchema.parse(undefined)).toEqual({});
  });

  it('仍校验 timeoutMs 范围', () => {
    expect(
      TestProviderConnectionSchema.safeParse({ timeoutMs: 10 }).success,
    ).toBe(false);
    expect(TestProviderConnectionSchema.parse({ timeoutMs: 30_000 })).toEqual({
      timeoutMs: 30_000,
    });
  });
});

describe('LookupModelMetadataQuerySchema', () => {
  it.each([
    [{}],
    [{ providerSlug: 'openai' }],
    [{ modelId: 'gpt-4o' }],
    [{ providerSlug: ' ', modelId: 'gpt-4o' }],
  ])('缺少或为空的参数 %o 被拒绝', (query) => {
    expect(LookupModelMetadataQuerySchema.safeParse(query).success).toBe(false);
  });

  it('两个参数齐全时通过', () => {
    expect(
      LookupModelMetadataQuerySchema.parse({
        providerSlug: 'openai',
        modelId: 'gpt-4o',
      }),
    ).toEqual({ providerSlug: 'openai', modelId: 'gpt-4o' });
  });
});
