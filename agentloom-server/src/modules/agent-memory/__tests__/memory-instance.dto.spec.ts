import { describe, expect, it } from 'vitest';

import { CreateMemoryInstanceDto } from '../dto';

describe('Memory Instance DTO', () => {
  it('CreateMemoryInstanceDto 应接受可选字符串字段为 null', () => {
    const result = CreateMemoryInstanceDto.schema.safeParse({
      name: '长期记忆实例',
      description: null,
      systemPromptOverride: null,
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      expect.unreachable('预期 create DTO 接受 null 可选字段');
    }

    expect(result.data).toMatchObject({
      name: '长期记忆实例',
      description: null,
      systemPromptOverride: null,
    });
  });
});
