import { z } from 'zod';

export const MfaFactorSchema = z.object({
  id: z.string(),
  factor_type: z.literal('totp'),
  friendly_name: z.string().optional(),
  status: z.enum(['verified', 'unverified']),
  created_at: z.string(),
  updated_at: z.string(),
});

export type MfaFactor = z.infer<typeof MfaFactorSchema>;

export const SecurityInfoSchema = z.object({
  mfa: z.object({
    enabled: z.boolean(),
    factors: z.array(MfaFactorSchema),
  }),
  sessions: z.object({
    active_count: z.number().int().nonnegative(),
  }),
  providers: z.array(z.string()),
});

export type SecurityInfo = z.infer<typeof SecurityInfoSchema>;
