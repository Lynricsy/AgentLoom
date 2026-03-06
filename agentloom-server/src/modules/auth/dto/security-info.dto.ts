import { z } from 'zod';

export const MfaFactorSchema = z.object({
  id: z.string(),
  factorType: z.literal('totp'),
  friendlyName: z.string().optional(),
  status: z.enum(['verified', 'unverified']),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type MfaFactor = z.infer<typeof MfaFactorSchema>;

export const SecurityInfoSchema = z.object({
  mfaEnabled: z.boolean(),
  factors: z.array(MfaFactorSchema),
});

export type SecurityInfo = z.infer<typeof SecurityInfoSchema>;
