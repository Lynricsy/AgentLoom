import { z } from 'zod';

export const userPreferenceResponseSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  tenantId: z.uuid(),
  titleModelConfigId: z.uuid().nullable(),
  preferences: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type UserPreferenceResponseDto = z.infer<
  typeof userPreferenceResponseSchema
>;

export function toUserPreferenceResponse(row: {
  id: string;
  userId: string;
  tenantId: string;
  titleModelConfigId: string | null;
  preferences: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}): UserPreferenceResponseDto {
  return {
    id: row.id,
    userId: row.userId,
    tenantId: row.tenantId,
    titleModelConfigId: row.titleModelConfigId,
    preferences: row.preferences,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
