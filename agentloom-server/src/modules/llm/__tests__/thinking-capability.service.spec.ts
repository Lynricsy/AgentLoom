import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import type { DecryptionBoundaryService } from '../../api-key/decryption-boundary.service';
import { ModelDiscoveryService } from '../model-discovery.service';
import { ThinkingCapabilityService } from '../thinking-capability.service';
import { UNKNOWN_THINKING_CAPABILITY } from '../thinking-capability.util';

const SOL_ENTRY = {
  supports_reasoning: true,
  supports_none_reasoning_effort: false,
  supports_minimal_reasoning_effort: false,
  supports_xhigh_reasoning_effort: true,
  supports_max_reasoning_effort: true,
};

describe('ThinkingCapabilityService', () => {
  let lookupLiteLLMEntry: Mock;
  let service: ThinkingCapabilityService;

  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    lookupLiteLLMEntry = vi.fn().mockResolvedValue(null);
    service = new ThinkingCapabilityService({
      lookupLiteLLMEntry,
    } as unknown as ModelDiscoveryService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('LiteLLM 命中时以 LiteLLM 为准', async () => {
    lookupLiteLLMEntry.mockResolvedValue({
      key: 'gpt-6.1-sol',
      entry: SOL_ENTRY,
    });

    const resolution = await service.resolve({
      providerSlug: 'private_cloud',
      apiProtocol: 'openai_responses',
      modelId: 'gpt-6.1-sol',
    });

    expect(lookupLiteLLMEntry).toHaveBeenCalledWith(
      'private_cloud',
      'gpt-6.1-sol',
    );
    expect(resolution.capability).toEqual({
      status: 'supported',
      levels: ['low', 'medium', 'high', 'xhigh', 'max'],
      defaultLevel: null,
      source: 'litellm',
    });
  });

  it('LiteLLM 未收录时回退到同 id 且 api 一致的 pi 目录条目', async () => {
    // pi 目录 openai/gpt-5（openai-responses）：off 映射 null，minimal..high 可选
    const resolution = await service.resolve({
      providerSlug: 'openai',
      apiProtocol: 'openai_responses',
      modelId: 'gpt-5',
    });

    expect(resolution.capability).toEqual({
      status: 'supported',
      levels: ['minimal', 'low', 'medium', 'high'],
      defaultLevel: null,
      source: 'pi-catalog',
    });
    expect(resolution.reasoningEfforts).toEqual({
      minimal: 'minimal',
      low: 'low',
      medium: 'medium',
      high: 'high',
    });
  });

  it('pi 目录条目的 api 与配置解析出的 api 不一致时不采用', async () => {
    // openai_chat → openai-completions；目录里的 openai/gpt-5 是 openai-responses
    const resolution = await service.resolve({
      providerSlug: 'openai',
      apiProtocol: 'openai_chat',
      modelId: 'gpt-5',
    });

    expect(resolution.capability.status).not.toBe('supported');
    expect(resolution.capability).not.toMatchObject({ source: 'litellm' });
  });

  it('两个来源都不认识该模型时为 unknown', async () => {
    const resolution = await service.resolve({
      providerSlug: 'private_cloud',
      apiProtocol: 'openai_responses',
      modelId: 'agentloom-no-such-model',
    });

    expect(resolution).toEqual(UNKNOWN_THINKING_CAPABILITY);
    expect(resolution.reasoningEfforts).toBeUndefined();
  });

  it('LiteLLM 查询抛错时降级到 pi 目录，不让调用失败', async () => {
    lookupLiteLLMEntry.mockRejectedValue(new Error('boom'));

    const resolution = await service.resolve({
      providerSlug: 'openai',
      apiProtocol: 'openai_responses',
      modelId: 'gpt-5',
    });

    expect(resolution.capability).toMatchObject({ source: 'pi-catalog' });
  });

  it('LiteLLM JSON 拉取失败（离线）时经真实 ModelDiscoveryService 降级', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND')),
    );
    const offline = new ThinkingCapabilityService(
      new ModelDiscoveryService(
        {} as DecryptionBoundaryService,
        {} as ConfigService,
      ),
    );

    await expect(
      offline.resolve({
        providerSlug: 'openai',
        apiProtocol: 'openai_responses',
        modelId: 'gpt-5',
      }),
    ).resolves.toMatchObject({ capability: { source: 'pi-catalog' } });
    await expect(
      offline.resolve({
        providerSlug: 'private_cloud',
        apiProtocol: 'openai_responses',
        modelId: 'gpt-6.1-sol',
      }),
    ).resolves.toEqual(UNKNOWN_THINKING_CAPABILITY);
  });

  describe('clampThinkingLevel', () => {
    it('不受支持的强度按 pi 语义收敛并告警', async () => {
      lookupLiteLLMEntry.mockResolvedValue({
        key: 'gpt-6.1-sol',
        entry: SOL_ENTRY,
      });
      const { piModel } = await service.resolve({
        providerSlug: 'private_cloud',
        modelId: 'gpt-6.1-sol',
      });

      await expect(
        service.clampThinkingLevel(piModel, 'minimal', 'ctx'),
      ).resolves.toBe('low');
      await expect(
        service.clampThinkingLevel(piModel, 'max', 'ctx'),
      ).resolves.toBe('max');
      expect(Logger.prototype.warn).toHaveBeenCalledTimes(1);
    });

    it('不推理的模型一律收敛为 off', async () => {
      await expect(
        service.clampThinkingLevel({ reasoning: false }, 'high', 'ctx'),
      ).resolves.toBe('off');
    });
  });
});
