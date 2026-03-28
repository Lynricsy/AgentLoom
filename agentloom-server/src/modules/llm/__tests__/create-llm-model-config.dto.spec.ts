import { describe, expect, it } from 'vitest';

import { CreateLlmModelConfigDto } from '../dto/create-llm-model-config.dto';

describe('CreateLlmModelConfigDto', () => {
  it('应接受 apiKeyId 为 null', () => {
    const result = CreateLlmModelConfigDto.schema.safeParse({
      name: 'OpenAI 默认配置',
      provider: 'openai',
      modelName: 'gpt-4o-mini',
      apiKeyId: null,
    });

    expect(result.success).toBe(true);
  });
});
