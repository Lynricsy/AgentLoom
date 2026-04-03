import { describe, expect, it } from 'vitest';

import { ListWorkspacesQuerySchema } from './list-workspaces-query.dto';

describe('ListWorkspacesQuerySchema', () => {
  it('应将 includeAutoArchived=false 字符串解析为 false', () => {
    const result = ListWorkspacesQuerySchema.parse({
      includeAutoArchived: 'false',
    });

    expect(result.includeAutoArchived).toBe(false);
  });

  it('应将 include_auto_archived=true 字符串解析为 true', () => {
    const result = ListWorkspacesQuerySchema.parse({
      include_auto_archived: 'true',
    });

    expect(result.includeAutoArchived).toBe(true);
  });
});
