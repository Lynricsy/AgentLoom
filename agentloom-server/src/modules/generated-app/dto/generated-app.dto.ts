import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import type {
  GeneratedApp,
  GeneratedAppGateRun,
  GeneratedAppGateRunFailure,
  GeneratedAppGateResult,
  GeneratedAppPreview,
  GeneratedAppReadiness,
  GeneratedAppSpec,
  GeneratedAppSubmission,
} from '../../../database/schema';

export const GeneratedAppStatusSchema = z.enum([
  'app_spec_ready',
  'preview_ready',
  'trial_ready',
  'publish_candidate',
  'published',
  'failed',
]);

export const GeneratedAppSubmissionStatusSchema = z.enum([
  'received',
  'running',
  'completed',
  'failed',
]);

export const GeneratedAppCanonicalGateIdSchema = z.enum([
  'gate-0',
  'gate-1',
  'gate-2',
  'gate-3',
  'gate-4',
  'gate-5',
  'gate-6',
  'gate-7',
]);

export const GeneratedAppGateRunStatusSchema = z.enum([
  'running',
  'passed',
  'failed',
  'warning',
  'skipped',
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

const JsonObjectSchema = z.record(z.string(), z.unknown());

export const CreateGeneratedAppSubmissionSchema = z.object({
  anonymousSessionId: z
    .string()
    .trim()
    .min(1, '匿名会话 ID 不能为空')
    .max(128, '匿名会话 ID 不能超过 128 个字符')
    .optional(),
  input: JsonObjectSchema.optional().default({}),
  clientContext: JsonObjectSchema.optional(),
});

export class CreateGeneratedAppSubmissionDto extends createZodDto(
  CreateGeneratedAppSubmissionSchema,
) {}

export type CreateGeneratedAppSubmissionDtoType = z.infer<
  typeof CreateGeneratedAppSubmissionSchema
>;

export const QueryGeneratedAppSubmissionsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: GeneratedAppSubmissionStatusSchema.optional(),
});

export class QueryGeneratedAppSubmissionsDto extends createZodDto(
  QueryGeneratedAppSubmissionsSchema,
) {}

export type QueryGeneratedAppSubmissionsDtoType = z.infer<
  typeof QueryGeneratedAppSubmissionsSchema
>;

export const DeleteGeneratedAppSubmissionsSchema = z.object({
  ids: z
    .array(z.string().uuid('提交记录 ID 必须是合法 UUID'))
    .min(1, '至少需要选择一条提交记录')
    .max(100, '单次最多批量删除 100 条提交记录'),
});

export class DeleteGeneratedAppSubmissionsDto extends createZodDto(
  DeleteGeneratedAppSubmissionsSchema,
) {}

export type DeleteGeneratedAppSubmissionsDtoType = z.infer<
  typeof DeleteGeneratedAppSubmissionsSchema
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

export const GeneratedAppGateRunFailureSchema = z.object({
  code: z.string().trim().min(1).max(128).optional(),
  message: z.string().trim().min(1, '失败原因不能为空').max(4000),
  details: z.unknown().optional(),
});

export const CreateGeneratedAppGateRunSchema = z.object({
  gateId: GeneratedAppCanonicalGateIdSchema,
  attemptNumber: z.number().int().min(1).max(100).default(1),
  status: GeneratedAppGateRunStatusSchema,
  summary: z.string().trim().min(1, '门禁运行摘要不能为空').max(4000),
  evidence: z.array(GeneratedAppGateEvidenceSchema).max(64).default([]),
  failure: GeneratedAppGateRunFailureSchema.nullable().optional(),
  repairInstructions: z.string().trim().min(1).max(4000).nullable().optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().nullable().optional(),
});

export class CreateGeneratedAppGateRunDto extends createZodDto(
  CreateGeneratedAppGateRunSchema,
) {}

export type CreateGeneratedAppGateRunDtoType = z.infer<
  typeof CreateGeneratedAppGateRunSchema
>;

export const QueryGeneratedAppGateRunsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  gateId: GeneratedAppCanonicalGateIdSchema.optional(),
  status: GeneratedAppGateRunStatusSchema.optional(),
});

export class QueryGeneratedAppGateRunsDto extends createZodDto(
  QueryGeneratedAppGateRunsSchema,
) {}

export type QueryGeneratedAppGateRunsDtoType = z.infer<
  typeof QueryGeneratedAppGateRunsSchema
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

export interface GeneratedAppGateRunResponseDto {
  id: string;
  tenantId: string;
  appId: string;
  gateId: string;
  gateOrder: number;
  gateName: string;
  blocking: boolean;
  attemptNumber: number;
  status: GeneratedAppGateRun['status'];
  summary: string;
  evidence: GeneratedAppGateResult['evidence'];
  failure: GeneratedAppGateRunFailure | null;
  repairInstructions: string | null;
  startedAt: Date;
  completedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RecordGeneratedAppGateRunResponseDto {
  gateRun: GeneratedAppGateRunResponseDto;
  app: GeneratedAppResponseDto;
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

export interface GeneratedAppSubmissionResponseDto {
  id: string;
  tenantId: string;
  appId: string;
  appSpecVersion: number;
  publicShareToken: string;
  anonymousSessionId: string;
  status: GeneratedAppSubmission['status'];
  input: Record<string, unknown>;
  result: Record<string, unknown> | null;
  report: Record<string, unknown> | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface PublicGeneratedAppSubmissionResponseDto {
  id: string;
  appId: string;
  appSpecVersion: number;
  status: GeneratedAppSubmission['status'];
  anonymousSessionId: string;
  input: Record<string, unknown>;
  result: Record<string, unknown> | null;
  report: Record<string, unknown> | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeleteGeneratedAppSubmissionsResponseDto {
  deletedCount: number;
}
