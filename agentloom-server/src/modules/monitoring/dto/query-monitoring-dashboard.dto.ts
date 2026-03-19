import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const MonitoringWindowSchema = z.enum(['15m', '1h', '24h']);

export const QueryMonitoringDashboardSchema = z.object({
  window: MonitoringWindowSchema.default('1h'),
});

export class QueryMonitoringDashboardDto extends createZodDto(
  QueryMonitoringDashboardSchema,
) {}

export type QueryMonitoringDashboardInput = z.infer<
  typeof QueryMonitoringDashboardSchema
>;

export type MonitoringWindow = z.infer<typeof MonitoringWindowSchema>;
