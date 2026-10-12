import { describe, expect, it } from 'vitest';
import type { Api, Model } from '@earendil-works/pi-ai';

import {
  deriveLiteLLMThinkingCapability,
  derivePiCatalogThinkingCapability,
  type ThinkingCapabilityResolution,
} from '../thinking-capability.util';

// 条目取自 LiteLLM model_prices_and_context_window.json（仅保留推理相关字段）
const LITELLM_ENTRIES = {
  'claude-sonnet-5-5': {
    supports_adaptive_thinking: true,
    supports_reasoning: true,
    supports_xhigh_reasoning_effort: true,
    supports_max_reasoning_effort: true,
    thinking_always_on: true,
  },
  'gpt-6.1-sol': {
    supports_max_reasoning_effort: true,
    supports_minimal_reasoning_effort: false,
    supports_none_reasoning_effort: false,
    supports_reasoning: true,
    supports_xhigh_reasoning_effort: true,
  },
  'gpt-5.5-pro': {
    supports_reasoning: true,
    supports_none_reasoning_effort: false,
    supports_xhigh_reasoning_effort: true,
    supports_minimal_reasoning_effort: false,
    supports_low_reasoning_effort: false,
  },
  'azure_ai/gpt-5.4': {
    supports_reasoning: true,
    supports_none_reasoning_effort: true,
    default_reasoning_effort: 'none',
    supports_xhigh_reasoning_effort: true,
    supports_minimal_reasoning_effort: true,
  },
  'moonshot/kimi-k3': {
    reasoning_effort_levels: ['low', 'high', 'max'],
    supports_reasoning: true,
  },
  'gpt-4o': {
    supports_function_calling: true,
    supports_vision: true,
  },
} satisfies Record<string, Record<string, unknown>>;

describe('deriveLiteLLMThinkingCapability', () => {
  it.each<[keyof typeof LITELLM_ENTRIES, ThinkingCapabilityResolution]>([
    [
      'claude-sonnet-5-5',
      {
        capability: {
          status: 'supported',
          levels: ['low', 'medium', 'high', 'xhigh', 'max'],
          defaultLevel: null,
          source: 'litellm',
        },
        piModel: {
          reasoning: true,
          thinkingLevelMap: {
            off: null,
            minimal: null,
            xhigh: 'xhigh',
            max: 'max',
          },
        },
        reasoningEfforts: {
          low: 'low',
          medium: 'medium',
          high: 'high',
          xhigh: 'xhigh',
          max: 'max',
        },
      },
    ],
    [
      'gpt-6.1-sol',
      {
        capability: {
          status: 'supported',
          levels: ['low', 'medium', 'high', 'xhigh', 'max'],
          defaultLevel: null,
          source: 'litellm',
        },
        piModel: {
          reasoning: true,
          thinkingLevelMap: {
            off: null,
            minimal: null,
            xhigh: 'xhigh',
            max: 'max',
          },
        },
        reasoningEfforts: {
          low: 'low',
          medium: 'medium',
          high: 'high',
          xhigh: 'xhigh',
          max: 'max',
        },
      },
    ],
    [
      'gpt-5.5-pro',
      {
        capability: {
          status: 'supported',
          levels: ['medium', 'high', 'xhigh'],
          defaultLevel: null,
          source: 'litellm',
        },
        piModel: {
          reasoning: true,
          thinkingLevelMap: {
            off: null,
            minimal: null,
            low: null,
            xhigh: 'xhigh',
            max: null,
          },
        },
        reasoningEfforts: { medium: 'medium', high: 'high', xhigh: 'xhigh' },
      },
    ],
    [
      'azure_ai/gpt-5.4',
      {
        capability: {
          status: 'supported',
          levels: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'],
          defaultLevel: 'off',
          source: 'litellm',
        },
        piModel: {
          reasoning: true,
          thinkingLevelMap: { off: 'none', xhigh: 'xhigh', max: null },
        },
        reasoningEfforts: {
          off: 'none',
          minimal: 'minimal',
          low: 'low',
          medium: 'medium',
          high: 'high',
          xhigh: 'xhigh',
        },
      },
    ],
    [
      'moonshot/kimi-k3',
      {
        capability: {
          status: 'supported',
          levels: ['low', 'high', 'max'],
          defaultLevel: null,
          source: 'litellm',
        },
        piModel: {
          reasoning: true,
          thinkingLevelMap: {
            off: null,
            minimal: null,
            medium: null,
            xhigh: null,
            max: 'max',
          },
        },
        reasoningEfforts: { low: 'low', high: 'high', max: 'max' },
      },
    ],
    [
      'gpt-4o',
      {
        capability: { status: 'unsupported', source: 'litellm' },
        piModel: { reasoning: false },
        reasoningEfforts: false,
      },
    ],
  ])('%s', (key, expected) => {
    expect(deriveLiteLLMThinkingCapability(LITELLM_ENTRIES[key])).toEqual(
      expected,
    );
  });

  it('off 受支持但未声明显式 none 时：pi map 留空 off，dsh 用 null（不下发）', () => {
    const resolution = deriveLiteLLMThinkingCapability({
      supports_reasoning: true,
    });

    expect(resolution.capability).toMatchObject({
      levels: ['off', 'low', 'medium', 'high'],
    });
    expect(resolution.piModel.thinkingLevelMap).not.toHaveProperty('off');
    expect(resolution.reasoningEfforts).toEqual({
      off: null,
      low: 'low',
      medium: 'medium',
      high: 'high',
    });
  });

  it('显式列表中的 none 映射为 off，且 wire 拼写为 none', () => {
    const resolution = deriveLiteLLMThinkingCapability({
      supports_reasoning: true,
      reasoning_effort_levels: ['none', 'low', 'high'],
      default_reasoning_effort: 'high',
    });

    expect(resolution.capability).toEqual({
      status: 'supported',
      levels: ['off', 'low', 'high'],
      defaultLevel: 'high',
      source: 'litellm',
    });
    expect(resolution.reasoningEfforts).toEqual({
      off: 'none',
      low: 'low',
      high: 'high',
    });
  });

  it('不在 levels 内的 default_reasoning_effort 不作为 defaultLevel', () => {
    const resolution = deriveLiteLLMThinkingCapability({
      ...LITELLM_ENTRIES['gpt-6.1-sol'],
      default_reasoning_effort: 'none',
    });

    expect(resolution.capability).toMatchObject({ defaultLevel: null });
  });

  it('只支持 off 时 dsh reasoningEfforts 为 false（dsh 要求至少一个非 off 强度）', () => {
    const resolution = deriveLiteLLMThinkingCapability({
      supports_reasoning: true,
      reasoning_effort_levels: ['none'],
    });

    expect(resolution.capability).toMatchObject({
      status: 'supported',
      levels: ['off'],
    });
    expect(resolution.reasoningEfforts).toBe(false);
  });

  it('显式列表不含任何词表强度时视为不推理', () => {
    expect(
      deriveLiteLLMThinkingCapability({
        supports_reasoning: true,
        reasoning_effort_levels: ['turbo'],
      }),
    ).toEqual({
      capability: { status: 'unsupported', source: 'litellm' },
      piModel: { reasoning: false },
      reasoningEfforts: false,
    });
  });
});

describe('derivePiCatalogThinkingCapability', () => {
  async function derive(model: Partial<Model<Api>>) {
    const { getSupportedThinkingLevels } =
      await import('@earendil-works/pi-ai');
    return derivePiCatalogThinkingCapability(
      model as Model<Api>,
      getSupportedThinkingLevels,
    );
  }

  it('沿用目录 map：off 的字符串值作为 wire 拼写，null 强度不支持', async () => {
    const resolution = await derive({
      reasoning: true,
      thinkingLevelMap: {
        off: 'none',
        minimal: null,
        low: 'low',
        medium: 'medium',
        high: 'high',
        xhigh: 'xhigh',
        max: null,
      },
    });

    expect(resolution).toEqual({
      capability: {
        status: 'supported',
        levels: ['off', 'low', 'medium', 'high', 'xhigh'],
        defaultLevel: null,
        source: 'pi-catalog',
      },
      piModel: {
        reasoning: true,
        thinkingLevelMap: {
          off: 'none',
          minimal: null,
          xhigh: 'xhigh',
          max: null,
        },
      },
      reasoningEfforts: {
        off: 'none',
        low: 'low',
        medium: 'medium',
        high: 'high',
        xhigh: 'xhigh',
      },
    });
  });

  it('目录 map 的 off 为 null（省略推理参数）时 off 不可选', async () => {
    const resolution = await derive({
      reasoning: true,
      thinkingLevelMap: { off: null, minimal: 'low' },
    });

    expect(resolution.capability).toMatchObject({
      levels: ['minimal', 'low', 'medium', 'high'],
    });
    // pi map 保留目录拼写；dsh 按契约使用强度名
    expect(resolution.piModel.thinkingLevelMap).toMatchObject({
      off: null,
      minimal: 'low',
    });
    expect(resolution.reasoningEfforts).toEqual({
      minimal: 'minimal',
      low: 'low',
      medium: 'medium',
      high: 'high',
    });
  });

  it('reasoning: false 为 unsupported', async () => {
    expect(await derive({ reasoning: false })).toEqual({
      capability: { status: 'unsupported', source: 'pi-catalog' },
      piModel: { reasoning: false },
      reasoningEfforts: false,
    });
  });
});
