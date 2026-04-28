import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import type {
  GeneratedApp,
  GeneratedAppGenerationRun,
  GeneratedAppGateRun,
  GeneratedAppGateRunFailure,
  GeneratedAppGateResult,
  GeneratedAppPreview,
  GeneratedAppReadiness,
  GeneratedAppRepairAttempt,
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

export const GeneratedAppGenerationRunStatusSchema = z.enum([
  'queued',
  'running',
  'repairing',
  'passed',
  'failed',
  'cancelled',
]);

export const GeneratedAppGenerationRunTriggerSchema = z.enum([
  'initial',
  'manual',
  'retry',
  'system',
]);

export const GeneratedAppRepairAttemptStatusSchema = z.enum([
  'planned',
  'running',
  'completed',
  'failed',
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
  input: z.unknown().optional().default({}),
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
  details: z.unknown().optional(),
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
  generationRunId: z.string().uuid().nullable().optional(),
  repairAttemptId: z.string().uuid().nullable().optional(),
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
  generationRunId: z.string().uuid().optional(),
  repairAttemptId: z.string().uuid().optional(),
});

export class QueryGeneratedAppGateRunsDto extends createZodDto(
  QueryGeneratedAppGateRunsSchema,
) {}

export type QueryGeneratedAppGateRunsDtoType = z.infer<
  typeof QueryGeneratedAppGateRunsSchema
>;

export const CreateGeneratedAppGenerationRunSchema = z.object({
  runNumber: z.number().int().min(1).max(1000).default(1),
  status: GeneratedAppGenerationRunStatusSchema.default('running'),
  triggerSource: GeneratedAppGenerationRunTriggerSchema.default('manual'),
  maxRepairAttempts: z.number().int().min(0).max(20).default(3),
  maxRuntimeSeconds: z.number().int().min(1).max(86400).default(1800),
  summary: z.string().trim().min(1, '生成运行摘要不能为空').max(4000),
  failureReason: z.string().trim().min(1).max(4000).nullable().optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().nullable().optional(),
});

export class CreateGeneratedAppGenerationRunDto extends createZodDto(
  CreateGeneratedAppGenerationRunSchema,
) {}

export type CreateGeneratedAppGenerationRunDtoType = z.infer<
  typeof CreateGeneratedAppGenerationRunSchema
>;

export const StartGeneratedAppGenerationRunSchema = z.preprocess(
  (value) => value ?? {},
  z.object({
    triggerSource: GeneratedAppGenerationRunTriggerSchema.default('manual'),
    maxRepairAttempts: z.number().int().min(0).max(20).default(3),
    maxRuntimeSeconds: z.number().int().min(1).max(86400).default(1800),
  }),
);

export class StartGeneratedAppGenerationRunDto extends createZodDto(
  StartGeneratedAppGenerationRunSchema,
) {}

export type StartGeneratedAppGenerationRunDtoType = z.infer<
  typeof StartGeneratedAppGenerationRunSchema
>;

export const UpdateGeneratedAppGenerationRunSchema = z.object({
  status: GeneratedAppGenerationRunStatusSchema.optional(),
  summary: z.string().trim().min(1).max(4000).optional(),
  failureReason: z.string().trim().min(1).max(4000).nullable().optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().nullable().optional(),
});

export class UpdateGeneratedAppGenerationRunDto extends createZodDto(
  UpdateGeneratedAppGenerationRunSchema,
) {}

export type UpdateGeneratedAppGenerationRunDtoType = z.infer<
  typeof UpdateGeneratedAppGenerationRunSchema
>;

export const QueryGeneratedAppGenerationRunsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: GeneratedAppGenerationRunStatusSchema.optional(),
});

export class QueryGeneratedAppGenerationRunsDto extends createZodDto(
  QueryGeneratedAppGenerationRunsSchema,
) {}

export type QueryGeneratedAppGenerationRunsDtoType = z.infer<
  typeof QueryGeneratedAppGenerationRunsSchema
>;

export const CreateGeneratedAppRepairAttemptSchema = z.object({
  attemptNumber: z.number().int().min(1).max(100).default(1),
  targetGateId: GeneratedAppCanonicalGateIdSchema,
  status: GeneratedAppRepairAttemptStatusSchema.default('running'),
  failureSummary: z.string().trim().min(1, '修复目标不能为空').max(4000),
  changeSummary: z.string().trim().min(1).max(4000).nullable().optional(),
  verificationSummary: z.string().trim().min(1).max(4000).nullable().optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().nullable().optional(),
});

export class CreateGeneratedAppRepairAttemptDto extends createZodDto(
  CreateGeneratedAppRepairAttemptSchema,
) {}

export type CreateGeneratedAppRepairAttemptDtoType = z.infer<
  typeof CreateGeneratedAppRepairAttemptSchema
>;

export const UpdateGeneratedAppRepairAttemptSchema = z.object({
  status: GeneratedAppRepairAttemptStatusSchema.optional(),
  failureSummary: z.string().trim().min(1).max(4000).optional(),
  changeSummary: z.string().trim().min(1).max(4000).nullable().optional(),
  verificationSummary: z.string().trim().min(1).max(4000).nullable().optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().nullable().optional(),
});

export class UpdateGeneratedAppRepairAttemptDto extends createZodDto(
  UpdateGeneratedAppRepairAttemptSchema,
) {}

export type UpdateGeneratedAppRepairAttemptDtoType = z.infer<
  typeof UpdateGeneratedAppRepairAttemptSchema
>;

export const QueryGeneratedAppRepairAttemptsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: GeneratedAppRepairAttemptStatusSchema.optional(),
  targetGateId: GeneratedAppCanonicalGateIdSchema.optional(),
});

export class QueryGeneratedAppRepairAttemptsDto extends createZodDto(
  QueryGeneratedAppRepairAttemptsSchema,
) {}

export type QueryGeneratedAppRepairAttemptsDtoType = z.infer<
  typeof QueryGeneratedAppRepairAttemptsSchema
>;

export interface GeneratedAppResponseDto {
  id: string;
  tenantId: string;
  prompt: string;
  appName: string;
  description: string;
  status: GeneratedApp['status'];
  appSpec: GeneratedAppSpec;
  generationPlan: GeneratedApp['generationPlan'];
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
  generationRunId: string | null;
  repairAttemptId: string | null;
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

export interface GeneratedAppGenerationRunResponseDto {
  id: string;
  tenantId: string;
  appId: string;
  runNumber: number;
  status: GeneratedAppGenerationRun['status'];
  triggerSource: GeneratedAppGenerationRun['triggerSource'];
  maxRepairAttempts: number;
  maxRuntimeSeconds: number;
  summary: string;
  failureReason: string | null;
  startedAt: Date;
  completedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StartGeneratedAppGenerationRunResponseDto {
  generationRun: GeneratedAppGenerationRunResponseDto;
  gateRuns: GeneratedAppGateRunResponseDto[];
  app: GeneratedAppResponseDto;
}

export interface GeneratedAppRepairAttemptResponseDto {
  id: string;
  tenantId: string;
  appId: string;
  generationRunId: string;
  attemptNumber: number;
  targetGateId: string;
  status: GeneratedAppRepairAttempt['status'];
  failureSummary: string;
  changeSummary: string | null;
  verificationSummary: string | null;
  startedAt: Date;
  completedAt: Date | null;
  createdBy: string | null;
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
  runtimeForm: PublicGeneratedAppRuntimeFormDto;
  createdAt: Date;
}

export type PublicGeneratedAppRuntimeFieldType =
  | 'text'
  | 'textarea'
  | 'single_select'
  | 'multi_select'
  | 'number'
  | 'range';

export interface PublicGeneratedAppRuntimeFormOptionDto {
  value: string;
  label: string;
}

export interface PublicGeneratedAppRuntimeFieldDto {
  id: string;
  label: string;
  type: PublicGeneratedAppRuntimeFieldType;
  required: boolean;
  placeholder: string;
  helpText: string;
  options: PublicGeneratedAppRuntimeFormOptionDto[];
  min?: number;
  max?: number;
  step?: number;
}

export interface PublicGeneratedAppRuntimeFormSectionDto {
  id: string;
  title: string;
  description: string;
  fieldIds: string[];
}

export interface PublicGeneratedAppRuntimeResultViewDto {
  title: string;
  description: string;
  emptyState: string;
  successTitle: string;
  nextStepHint: string;
}

export interface PublicGeneratedAppRuntimeFormDto {
  formId: string;
  title: string;
  description: string;
  submitLabel: string;
  sections: PublicGeneratedAppRuntimeFormSectionDto[];
  fields: PublicGeneratedAppRuntimeFieldDto[];
  resultView: PublicGeneratedAppRuntimeResultViewDto;
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
