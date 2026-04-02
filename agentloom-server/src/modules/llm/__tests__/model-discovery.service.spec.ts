import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ModelDiscoveryService } from '../model-discovery.service';

describe('ModelDiscoveryService', () => {
  let service: ModelDiscoveryService;

  beforeEach(() => {
    service = new ModelDiscoveryService(
      {
        decryptApiKeyById: vi.fn(),
      } as never,
      {
        get: vi.fn(),
      } as never,
    );
  });

  it('lookupModelMetadata 应解析缓存价格与基于 token 阈值的阶梯定价', async () => {
    vi.spyOn(
      service as unknown as { getLiteLLMData: () => Promise<unknown> },
      'getLiteLLMData',
    ).mockResolvedValue({
      'claude-sonnet-4-20250514': {
        input_cost_per_token: 3e-6,
        output_cost_per_token: 1.5e-5,
        cache_read_input_token_cost: 3e-7,
        cache_creation_input_token_cost: 3.75e-6,
        input_cost_per_token_above_200k_tokens: 6e-6,
        output_cost_per_token_above_200k_tokens: 2.25e-5,
        cache_read_input_token_cost_above_200k_tokens: 6e-7,
        cache_creation_input_token_cost_above_200k_tokens: 7.5e-6,
        max_input_tokens: 1_000_000,
        max_output_tokens: 64_000,
        supports_vision: true,
        supports_function_calling: true,
        supports_response_schema: true,
      },
    });

    const result = await service.lookupModelMetadata(
      'anthropic',
      'claude-sonnet-4-20250514',
    );

    expect(result).toEqual({
      modelId: 'claude-sonnet-4-20250514',
      contextWindow: 1_000_000,
      maxOutputTokens: 64_000,
      pricing: {
        inputPer1MTokens: 3,
        outputPer1MTokens: 15,
        cachedReadPer1MTokens: 0.3,
        cachedWritePer1MTokens: 3.75,
        tiers: [
          {
            aboveTokens: 200_000,
            inputPer1MTokens: 6,
            outputPer1MTokens: 22.5,
            cachedReadPer1MTokens: 0.6,
            cachedWritePer1MTokens: 7.5,
          },
        ],
      },
      capabilities: {
        vision: true,
        functionCalling: true,
        reasoning: false,
        structuredOutput: true,
      },
    });
  });

  it('lookupModelMetadata 应忽略非 token 阈值的价格字段', async () => {
    vi.spyOn(
      service as unknown as { getLiteLLMData: () => Promise<unknown> },
      'getLiteLLMData',
    ).mockResolvedValue({
      'gpt-4o': {
        input_cost_per_token: 2.5e-6,
        output_cost_per_token: 1e-5,
        cache_read_input_token_cost: 1.25e-6,
        input_cost_per_token_priority: 4.25e-6,
        output_cost_per_token_batches: 5e-6,
        cache_creation_input_token_cost_above_1hr: 6e-6,
        max_input_tokens: 128_000,
        max_output_tokens: 16_384,
      },
    });

    const result = await service.lookupModelMetadata('openai', 'gpt-4o');

    expect(result?.pricing).toEqual({
      inputPer1MTokens: 2.5,
      outputPer1MTokens: 10,
      cachedReadPer1MTokens: 1.25,
    });
  });
});
