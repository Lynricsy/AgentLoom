import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import type {
  GeneratedApp,
  GeneratedAppGateResult,
  GeneratedAppPreview,
  GeneratedAppReadiness,
  GeneratedAppSpec,
} from '../../../database/schema';

export const GeneratedAppStatusSchema = z.enum([
  'app_spec_ready',
  'preview_ready',
  'trial_ready',
  'publish_candidate',
  'published',
  'failed',
]);

export const CreateGeneratedAppSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, '需求描述不能为空')
    .max(4000, '需求描述不能超过 4000 个字符'),
});

export class CreateGeneratedAppDto extends createZodDto(
  CreateGeneratedAppSchema,
) {}

export type CreateGeneratedAppDtoType = z.infer<
  typeof CreateGeneratedAppSchema
>;

export const QueryGeneratedAppsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: GeneratedAppStatusSchema.optional(),
});

export class QueryGeneratedAppsDto extends createZodDto(
  QueryGeneratedAppsSchema,
) {}

export type QueryGeneratedAppsDtoType = z.infer<
  typeof QueryGeneratedAppsSchema
>;

export const GeneratedAppGateEvidenceSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum([
    'app_spec',
    'plan',
    'static_check',
    'build',
    'test',
    'browser',
    'verifier',
    'manual',
  ]),
  url: z.string().url().nullable().default(null),
  summary: z.string().min(1),
});

export const GeneratedAppGateResultSchema = z.object({
  gateId: z.string().min(1),
  order: z.number().int().min(0).default(0),
  name: z.string().min(1),
  blocking: z.boolean().default(true),
  status: z.enum([
    'pending',
    'running',
    'passed',
    'failed',
    'warning',
    'skipped',
  ]),
  summary: z.string().min(1),
  evidence: z.array(GeneratedAppGateEvidenceSchema).default([]),
  updatedAt: z
    .string()
    .datetime()
    .default(() => new Date().toISOString()),
});

export const GeneratedAppPreviewSchema = z.object({
  previewUrl: z.string().url().nullable().default(null),
  sourceArtifactUrl: z.string().url().nullable().default(null),
  testReportUrl: z.string().url().nullable().default(null),
});

export const RecordGeneratedAppGateResultsSchema = z.object({
  gateResults: z.array(GeneratedAppGateResultSchema).min(1).max(32),
  generationPlan: z.record(z.string(), z.unknown()).nullable().optional(),
  preview: GeneratedAppPreviewSchema.optional(),
});

export class RecordGeneratedAppGateResultsDto extends createZodDto(
  RecordGeneratedAppGateResultsSchema,
) {}

export type RecordGeneratedAppGateResultsDtoType = z.infer<
  typeof RecordGeneratedAppGateResultsSchema
>;

export interface GeneratedAppResponseDto {
  id: string;
  tenantId: string;
  prompt: string;
  appName: string;
  description: string;
  status: GeneratedApp['status'];
  appSpec: GeneratedAppSpec;
  generationPlan: Record<string, unknown> | null;
  gateResults: GeneratedAppGateResult[];
  readiness: GeneratedAppReadiness;
  preview: GeneratedAppPreview;
  agentDefinitionId: string | null;
  workflowDefinitionId: string | null;
  pluginIds: string[];
  publicShareEnabled: boolean;
  publicShareToken: string | null;
  publicShareUrl: string | null;
  publicShareCreatedAt: Date | null;
  publicShareDisabledAt: Date | null;
  publicViewCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicGeneratedAppResponseDto {
  token: string;
  appId: string;
  title: string;
  description: string;
  dataUseNotice: string;
  appSpec: Pick<
    GeneratedAppSpec,
    'version' | 'appName' | 'summary' | 'userGoal' | 'actors' | 'pages'
  >;
  runtimeSurface: {
    kind: 'generated-app';
    previewUrl: string | null;
  };
  createdAt: Date;
}
