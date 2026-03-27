import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { PROVIDER_HEALTH_STATUS_STATES } from '../../../database/schema/provider-health-status.schema';

export const ProviderHealthStatusSchema = z.object({
  providerName: z.string().min(1),
  modelId: z.string().nullable(),
  status: z.enum(PROVIDER_HEALTH_STATUS_STATES),
  failureCount: z.number().int().min(0),
  lastFailureAt: z.string().datetime().nullable(),
});

export const ProviderHealthStatusesResponseSchema = z.object({
  data: z.array(ProviderHealthStatusSchema),
});

export class ProviderHealthStatusesResponseDto extends createZodDto(
  ProviderHealthStatusesResponseSchema,
) {}

export type ProviderHealthStatusDto = z.infer<
  typeof ProviderHealthStatusSchema
>;
export type ProviderHealthStatusesResponseDtoType = z.infer<
  typeof ProviderHealthStatusesResponseSchema
>;
