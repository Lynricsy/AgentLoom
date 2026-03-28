import { describe, expect, it } from 'vitest';

import { UpdateAgentDefinitionDto } from './update-agent-definition.dto';

describe('UpdateAgentDefinitionDto', () => {
  it('应接受 description 为 null', () => {
    const result = UpdateAgentDefinitionDto.schema.safeParse({
      version: 1,
      description: null,
    });

    expect(result.success).toBe(true);
  });
});
