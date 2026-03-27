import { z } from 'zod';

const VALID_ROLES = [
  'owner',
  'admin',
  'creator',
  'operator',
  'viewer',
] as const;
const VALID_TIMEOUT_ACTIONS = ['approve', 'reject', 'escalate'] as const;
const VALID_NOTIFY_CHANNELS = ['in_app', 'email', 'push'] as const;

export const UpdateInterventionPolicySchema = z
  .object({
    allowedRoles: z
      .array(z.enum(VALID_ROLES))
      .min(1, '至少需要一个允许的角色')
      .optional(),
    timeoutSeconds: z
      .number()
      .int()
      .min(300, '超时时间至少 5 分钟 (300 秒)')
      .max(604800, '超时时间最多 7 天 (604800 秒)')
      .optional(),
    timeoutAction: z.enum(VALID_TIMEOUT_ACTIONS).optional(),
    escalateToRole: z.enum(VALID_ROLES).nullish(),
    notifyChannels: z
      .array(z.enum(VALID_NOTIFY_CHANNELS))
      .min(1, '至少需要一个通知渠道')
      .optional(),
    isActive: z.boolean().optional(),
    version: z.number().int().min(1),
  })
  .strict()
  .refine(
    (data) => {
      if (data.timeoutAction === 'escalate') {
        return !!data.escalateToRole;
      }
      return true;
    },
    {
      message: '当超时动作为 escalate 时，必须指定 escalate_to_role',
      path: ['escalateToRole'],
    },
  );

export type UpdateInterventionPolicyDto = z.infer<
  typeof UpdateInterventionPolicySchema
>;
