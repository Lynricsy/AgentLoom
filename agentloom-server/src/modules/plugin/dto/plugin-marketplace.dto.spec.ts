import { describe, expect, it } from 'vitest';
import {
  SubmitPluginListingSchema,
  UpdatePluginListingSchema,
} from './plugin-marketplace.dto';

/** 平台主键实际形态：UUIDv7（版本位为 7） */
const PLUGIN_ID_V7 = '01a03ed7-3e6b-7312-9b1c-b8a3c457e580';
const PLUGIN_ID_V4 = '11111111-1111-4111-8111-111111111111';

function listing(overrides: Record<string, unknown> = {}) {
  return {
    pluginDbId: PLUGIN_ID_V7,
    title: 'E2E 验收插件',
    summary:
      '这是一段满足最小长度要求的插件上架摘要，用于验证 DTO 的字段校验行为是否符合契约。',
    tags: ['transform'],
    pricingModel: 'free',
    ...overrides,
  };
}

describe('SubmitPluginListingSchema pluginDbId', () => {
  it('接受平台真实生成的 UUIDv7', () => {
    const result = SubmitPluginListingSchema.safeParse(listing());

    expect(result.success).toBe(true);
  });

  it('同时仍接受 UUIDv4', () => {
    const result = SubmitPluginListingSchema.safeParse(
      listing({ pluginDbId: PLUGIN_ID_V4 }),
    );

    expect(result.success).toBe(true);
  });

  it('拒绝非 UUID 字符串', () => {
    const result = SubmitPluginListingSchema.safeParse(
      listing({ pluginDbId: 'not-a-uuid' }),
    );

    expect(result.success).toBe(false);
  });

  it('per_execution 定价缺少单价时报错', () => {
    const result = SubmitPluginListingSchema.safeParse(
      listing({ pricingModel: 'per_execution' }),
    );

    expect(result.success).toBe(false);
  });
});

describe('UpdatePluginListingSchema pluginDbId', () => {
  it('部分更新同样接受 UUIDv7', () => {
    const result = UpdatePluginListingSchema.safeParse({
      pluginDbId: PLUGIN_ID_V7,
    });

    expect(result.success).toBe(true);
  });
});
