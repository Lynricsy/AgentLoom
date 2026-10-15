import { z } from 'zod';

/**
 * 受控团队运行时（workflow `team` 节点）的跨端契约：
 * 节点配置、预设模板与运行/成员/消息的状态枚举。
 */

/** 单个团队的成员上限。 */
export const TEAM_MAX_MEMBERS = 6;

/** 角色名：小写字母开头，2–32 位小写字母、数字、`_`、`-`。 */
export const TEAM_ROLE_PATTERN = /^[a-z][a-z0-9_-]{1,31}$/;

/** `canMessage` 中表示「可发给全部其他成员」的通配符。 */
export const TEAM_BROADCAST_TARGET = '*';

export const TEAM_RUN_STATUSES = [
  'running',
  'completed',
  'failed',
  'cancelled',
] as const;

export const TEAM_MEMBER_STATUSES = [
  'idle',
  'running',
  'ended',
  'failed',
] as const;

export const TEAM_MESSAGE_KINDS = [
  'observation',
  'request',
  'reply',
  'artifact',
  'system',
] as const;

export const TEAM_MESSAGE_DELIVERY_STATUSES = [
  'pending',
  'delivered',
  'consumed',
  'suppressed',
  'expired',
] as const;

export const TEAM_FAILURE_REASONS = [
  'budget_exhausted',
  'deadline_exceeded',
  'no_result',
  'member_failed',
  'schema_invalid',
  'cancelled',
] as const;

export const TeamRunStatusSchema = z.enum(TEAM_RUN_STATUSES);
export const TeamMemberStatusSchema = z.enum(TEAM_MEMBER_STATUSES);
export const TeamMessageKindSchema = z.enum(TEAM_MESSAGE_KINDS);
export const TeamMessageDeliveryStatusSchema = z.enum(
  TEAM_MESSAGE_DELIVERY_STATUSES,
);
export const TeamFailureReasonSchema = z.enum(TEAM_FAILURE_REASONS);

export const TeamMemberConfigSchema = z.object({
  role: z.string().regex(TEAM_ROLE_PATTERN),
  agentDefinitionId: z.string().uuid(),
  agentVersionId: z.string().uuid().nullable().default(null),
  isLead: z.boolean().default(false),
  instructions: z.string().max(4000).default(''),
  canMessage: z.array(z.string()).default([]),
});

export const TeamBudgetSchema = z.object({
  maxTotalTokens: z.number().int().positive().default(500_000),
  maxMessages: z.number().int().positive().max(1000).default(200),
  deadlineMinutes: z.number().int().positive().max(1440).default(60),
});

export const TeamNodeConfigSchema = z
  .object({
    objective: z.string().max(8000).default(''),
    members: z.array(TeamMemberConfigSchema).min(2).max(TEAM_MAX_MEMBERS),
    budget: TeamBudgetSchema.default(() => TeamBudgetSchema.parse({})),
    outputSchema: z.record(z.string(), z.unknown()).nullable().default(null),
  })
  .superRefine((config, ctx) => {
    const leadCount = config.members.filter((member) => member.isLead).length;
    if (leadCount !== 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['members'],
        message: `团队必须恰好有一个负责人（isLead），当前为 ${leadCount} 个`,
      });
    }

    const roles = new Set<string>();
    config.members.forEach((member, index) => {
      if (roles.has(member.role)) {
        ctx.addIssue({
          code: 'custom',
          path: ['members', index, 'role'],
          message: `角色名 ${member.role} 重复`,
        });
      }
      roles.add(member.role);
    });

    config.members.forEach((member, index) => {
      member.canMessage.forEach((target, targetIndex) => {
        const path = ['members', index, 'canMessage', targetIndex];
        if (target === member.role) {
          ctx.addIssue({
            code: 'custom',
            path,
            message: `角色 ${member.role} 不能把自己列为通信对象`,
          });
        } else if (target !== TEAM_BROADCAST_TARGET && !roles.has(target)) {
          ctx.addIssue({
            code: 'custom',
            path,
            message: `通信对象 ${target} 不是团队中的角色`,
          });
        }
      });
    });
  });

/**
 * 三角色模板（定位 / 实现 / 验证）。`agentDefinitionId` 由用户在面板中选择。
 */
export const TEAM_PRESET_TRIAGE = [
  {
    role: 'locator',
    isLead: false,
    canMessage: ['implementer', 'verifier'],
    instructions:
      '只读定位：阅读代码与资料，找出与任务相关的事实与位置，把发现发给 implementer 与 verifier，不要修改代码。',
  },
  {
    role: 'implementer',
    isLead: true,
    canMessage: ['*'],
    instructions:
      '整合负责人：根据定位与验证反馈完成实现，产出补丁与说明，最后调用 team_submit_result 提交结果。',
  },
  {
    role: 'verifier',
    isLead: false,
    canMessage: ['implementer'],
    instructions:
      '验证者：根据任务契约构造并执行测试，把失败证据（命令、输出摘要、位置）发给 implementer。',
  },
] as const;

export type TeamMemberConfig = z.infer<typeof TeamMemberConfigSchema>;
export type TeamBudget = z.infer<typeof TeamBudgetSchema>;
export type TeamNodeConfig = z.infer<typeof TeamNodeConfigSchema>;
export type TeamRunStatus = (typeof TEAM_RUN_STATUSES)[number];
export type TeamMemberStatus = (typeof TEAM_MEMBER_STATUSES)[number];
export type TeamMessageKind = (typeof TEAM_MESSAGE_KINDS)[number];
export type TeamMessageDeliveryStatus =
  (typeof TEAM_MESSAGE_DELIVERY_STATUSES)[number];
export type TeamFailureReason = (typeof TEAM_FAILURE_REASONS)[number];
