import { describe, expect, it } from 'vitest';

import { CreateWorkspaceSchema } from '../dto/create-workspace.dto';

describe('CreateWorkspaceSchema', () => {
  it('应接受 description 为 null', () => {
    const result = CreateWorkspaceSchema.safeParse({
      name: '新工作区',
      description: null,
    });

    expect(result.success).toBe(true);
  });
});
