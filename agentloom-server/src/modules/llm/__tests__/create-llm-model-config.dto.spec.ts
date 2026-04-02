import { describe, expect, it } from 'vitest';

import { CreateLlmModelConfigDto } from '../dto/create-llm-model-config.dto';

describe('CreateLlmModelConfigDto', () => {
  it('应接受最小必填字段', () => {
    const result = CreateLlmModelConfigDto.schema.safeParse({
      name: 'OpenAI 默认配置',
      providerId: 'a0000000-0000-4000-8000-000000000001',
      modelId: 'gpt-4o-mini',
    });

    expect(result.success).toBe(true);
  });
});
