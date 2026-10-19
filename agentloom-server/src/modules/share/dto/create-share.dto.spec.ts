import { describe, expect, it } from 'vitest';

import { CreateAgentShareSchema } from './create-agent-share.dto';
import { CreateShareSchema } from './create-share.dto';

const ID = '01a15400-65d7-7252-86ee-3b411e23ebc2';

describe('分享 expires_at', () => {
  it.each([
    '2026-10-19T12:20:00.123Z',
    '2026-10-19T12:20:00.123+00:00',
    '2026-10-19T20:20:00+08:00',
  ])('接受带时区偏移或 Z 的 ISO 时间 %s', (expiresAt) => {
    expect(
      CreateAgentShareSchema.safeParse({
        agent_definition_id: ID,
        expires_at: expiresAt,
      }).success,
    ).toBe(true);
    expect(
      CreateShareSchema.safeParse({
        workflow_definition_id: ID,
        expires_at: expiresAt,
      }).success,
    ).toBe(true);
  });

  it('仍拒绝非 ISO 时间', () => {
    expect(
      CreateAgentShareSchema.safeParse({
        agent_definition_id: ID,
        expires_at: '2026/10/19 12:20',
      }).success,
    ).toBe(false);
  });
});
