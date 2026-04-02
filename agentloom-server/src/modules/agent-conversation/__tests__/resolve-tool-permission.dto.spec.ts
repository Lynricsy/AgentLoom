import { describe, expect, it } from 'vitest';

import { resolveConversationToolPermissionSchema } from '../dto/resolve-tool-permission.dto';

describe('resolveConversationToolPermissionSchema', () => {
  it('应兼容 snake_case 的 remember_scope', () => {
    expect(
      resolveConversationToolPermissionSchema.parse({
        action: 'approve',
        remember_scope: 'conversation_category',
      }),
    ).toEqual({
      action: 'approve',
      rememberScope: 'conversation_category',
    });
  });

  it('应兼容 camelCase 的 rememberScope', () => {
    expect(
      resolveConversationToolPermissionSchema.parse({
        action: 'deny',
        rememberScope: 'none',
      }),
    ).toEqual({
      action: 'deny',
      rememberScope: 'none',
    });
  });
});
