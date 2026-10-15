import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import {
  TEAM_PRESET_TRIAGE,
  TeamMemberConfigSchema,
  TeamNodeConfigSchema,
} from './team';

const AGENT_ID = '0195c3a1-4b7d-7e22-8a15-6c3b9f2e4d88';

function presetMembers(): z.input<typeof TeamMemberConfigSchema>[] {
  return TEAM_PRESET_TRIAGE.map((member) => ({
    ...member,
    canMessage: [...member.canMessage],
    agentDefinitionId: AGENT_ID,
  }));
}

function issueMessages(input: unknown): string[] {
  const result = TeamNodeConfigSchema.safeParse(input);
  expect(result.success).toBe(false);
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.message);
}

describe('TeamNodeConfigSchema', () => {
  it('三角色预设补上 agentDefinitionId 后通过校验并填充默认值', () => {
    const config = TeamNodeConfigSchema.parse({ members: presetMembers() });

    expect(config.members).toHaveLength(3);
    expect(config.members.filter((member) => member.isLead)).toHaveLength(1);
    expect(config.members[0]?.agentVersionId).toBeNull();
    expect(config.budget).toEqual({
      maxTotalTokens: 500_000,
      maxMessages: 200,
      deadlineMinutes: 60,
    });
    expect(config.objective).toBe('');
    expect(config.outputSchema).toBeNull();
  });

  it('两个负责人时失败', () => {
    const members = presetMembers().map((member) => ({
      ...member,
      isLead: member.role !== 'verifier',
    }));

    expect(issueMessages({ members }).join('\n')).toContain('恰好有一个负责人');
  });

  it('没有负责人时失败', () => {
    const members = presetMembers().map((member) => ({
      ...member,
      isLead: false,
    }));

    expect(issueMessages({ members }).join('\n')).toContain('恰好有一个负责人');
  });

  it('canMessage 指向不存在的角色时失败', () => {
    const members = presetMembers();
    members[0] = { ...members[0]!, canMessage: ['reviewer'] };

    expect(issueMessages({ members }).join('\n')).toContain(
      '通信对象 reviewer 不是团队中的角色',
    );
  });

  it('canMessage 包含自己时失败', () => {
    const members = presetMembers();
    members[2] = { ...members[2]!, canMessage: ['verifier'] };

    expect(issueMessages({ members }).join('\n')).toContain(
      '不能把自己列为通信对象',
    );
  });

  it('角色名重复时失败', () => {
    const members = presetMembers();
    members[2] = { ...members[2]!, role: 'locator', canMessage: [] };

    expect(issueMessages({ members }).join('\n')).toContain(
      '角色名 locator 重复',
    );
  });

  it('角色名不符合格式时失败', () => {
    const members = presetMembers();
    members[0] = { ...members[0]!, role: 'Locator' };

    expect(TeamNodeConfigSchema.safeParse({ members }).success).toBe(false);
  });
});
