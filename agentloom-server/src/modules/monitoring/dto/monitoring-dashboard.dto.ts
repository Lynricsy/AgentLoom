import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { MonitoringWindowSchema } from './query-monitoring-dashboard.dto';

export const MonitoringScopeSchema = z.literal('organization');

export const MonitoringMetricSourceSchema = z.enum([
  'execution-records',
  'workflow-executions',
  'resource-governance',
  'notifications',
  'audit-logs',
  'execution-queue',
  'derived',
]);

export const MonitoringMetricSourcesSchema = z.object({
  execution: z.array(MonitoringMetricSourceSchema),
  governance: z.array(MonitoringMetricSourceSchema),
  alerts: z.array(MonitoringMetricSourceSchema),
  queueDepth: z.array(MonitoringMetricSourceSchema),
});

export const MonitoringDashboardSummarySchema = z.object({
  scope: MonitoringScopeSchema,
  window: MonitoringWindowSchema,
  lastUpdatedAt: z.string().datetime(),
  executionCount: z.number().int().min(0),
  successRate: z.number().min(0).max(100),
  failureRate: z.number().min(0).max(100),
  averageDurationMs: z.number().nullable(),
  queueDepth: z.number().int().min(0),
  governanceBlocks: z.number().int().min(0),
  activeAlerts: z.number().int().min(0),
  metricSources: MonitoringMetricSourcesSchema,
});

export const MonitoringTrendPointSchema = z.object({
  bucketStart: z.string().datetime(),
  bucketLabel: z.string(),
  executionCount: z.number().int().min(0),
  successRate: z.number().min(0).max(100),
  failureRate: z.number().min(0).max(100),
  averageDurationMs: z.number().nullable(),
  queueDepth: z.number().int().min(0).nullable(),
  governanceBlocks: z.number().int().min(0),
  activeAlerts: z.number().int().min(0),
});

export const MonitoringLinkTargetSchema = z.union([
  z.object({
    type: z.literal('resource-governance'),
    href: z.literal('/settings/resource-quotas'),
  }),
  z.object({
    type: z.literal('execution'),
    href: z.string().regex(/^\/executions\/.+$/),
  }),
]);

export const MonitoringAlertSummarySchema = z.object({
  id: z.string(),
  severity: z.enum(['info', 'warning', 'critical']),
  category: z.enum([
    'error-rate',
    'queue-depth',
    'governance-block',
    'anomalous-execution',
  ]),
  title: z.string(),
  reason: z.string(),
  detectedAt: z.string().datetime(),
  affectedSummary: z.string(),
  source: MonitoringMetricSourceSchema,
  linkTarget: MonitoringLinkTargetSchema.optional(),
});

export const MonitoringHotspotSchema = z.object({
  id: z.string(),
  kind: z.enum(['workflow', 'execution']),
  label: z.string(),
  impactSummary: z.string(),
  executionCount: z.number().int().min(0),
  failureRate: z.number().nullable(),
  queueDepth: z.number().nullable(),
  status: z.enum([
    'healthy',
    'running',
    'failed',
    'paused',
    'governance-paused',
    'blocked',
  ]),
  lastSeenAt: z.string().datetime(),
  linkTarget: MonitoringLinkTargetSchema.optional(),
});

export const MonitoringRiskSummarySchema = z.object({
  level: z.enum(['stable', 'warning', 'critical']),
  title: z.string(),
  summary: z.string(),
  explanation: z.string(),
  governancePauseActive: z.boolean(),
  lastEvaluatedAt: z.string().datetime(),
  primaryLinkTarget: MonitoringLinkTargetSchema.optional(),
});

export const MonitoringDashboardSchema = z.object({
  summary: MonitoringDashboardSummarySchema,
  trend: z.array(MonitoringTrendPointSchema),
  alerts: z.array(MonitoringAlertSummarySchema),
  hotspots: z.array(MonitoringHotspotSchema),
  riskSummary: MonitoringRiskSummarySchema,
});

export const MonitoringDashboardEnvelopeSchema = z.object({
  data: MonitoringDashboardSchema,
});

export class MonitoringDashboardEnvelopeDto extends createZodDto(
  MonitoringDashboardEnvelopeSchema,
) {}

export type MonitoringMetricSource = z.infer<typeof MonitoringMetricSourceSchema>;
export type MonitoringDashboardDto = z.infer<typeof MonitoringDashboardSchema>;
export type MonitoringAlertSummaryDto = z.infer<
  typeof MonitoringAlertSummarySchema
>;
export type MonitoringHotspotDto = z.infer<typeof MonitoringHotspotSchema>;
export type MonitoringLinkTargetDto = z.infer<typeof MonitoringLinkTargetSchema>;
export type MonitoringRiskSummaryDto = z.infer<
  typeof MonitoringRiskSummarySchema
>;
