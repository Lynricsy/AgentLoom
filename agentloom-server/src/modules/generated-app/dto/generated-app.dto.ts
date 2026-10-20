import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import type {
  GeneratedApp,
  GeneratedAppGenerationRun,
  GeneratedAppRepairPlan,
  GeneratedAppGateRun,
  GeneratedAppGateRunFailure,
  GeneratedAppGateResult,
  GeneratedAppPreview,
  GeneratedAppReadiness,
  GeneratedAppRepairAttempt,
  GeneratedAppReverificationPlan,
  GeneratedAppSubmission,
} from '../../../database/schema';
import type { GeneratedAppSpecV2 } from '../types/app-spec-v2.schema';
import type {
  GeneratedAppRuntimeResult,
  PublicGeneratedAppRuntimeFormV2,
} from '../types/generation-v2.ports';
import type { GeneratedAppBrowserViewportId } from '../types/browser-acceptance-job.schema';
import type { GeneratedAppGateExecutionLevel } from '../types/generation-plan-v2.types';

export const GeneratedAppStatusSchema = z.enum([
  'app_spec_generating',
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

export const GeneratedAppRuntimeBindingReadinessStateSchema = z.enum([
  /** 还没有 v2 AppSpec，或 Agent 绑定的包装工作流尚未创建 */
  'runtime_not_bound',
  'workflow_not_found',
  'workflow_not_published',
  /** 绑定的工作流已重新发布：应用仍执行固定版本，重新生成才会采用新版本 */
  'workflow_version_drift',
  'workflow_published',
]);

export type GeneratedAppRuntimeBindingReadinessState = z.infer<
  typeof GeneratedAppRuntimeBindingReadinessStateSchema
>;

/** 创建时可指定的绑定目标：必须是本租户已发布的工作流或 Agent */
export const GeneratedAppBindingTargetSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('workflow'),
    workflowDefinitionId: z.string().uuid(),
  }),
  z.object({
    kind: z.literal('agent'),
    agentDefinitionId: z.string().uuid(),
  }),
]);

export const CreateGeneratedAppSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, '需求描述不能为空')
    .max(4000, '需求描述不能超过 4000 个字符'),
  /** 生成 AppSpec 用的本租户 chat 模型；省略时用租户默认 chat 模型 */
  modelConfigId: z.string().uuid().optional(),
  /** 省略时由模型在本租户已发布的工作流与 Agent 中选择 */
  bindingTarget: GeneratedAppBindingTargetSchema.optional(),
});

export class CreateGeneratedAppDto extends createZodDto(
  CreateGeneratedAppSchema,
) {}

export type CreateGeneratedAppDtoType = z.infer<
  typeof CreateGeneratedAppSchema
>;
// 仅开放展示信息，避免普通 PATCH 绕过 Gate 流程改写生成规格、状态或公开分享凭据。
export const UpdateGeneratedAppSchema = z
  .object({
    appName: z
      .string()
      .trim()
      .min(1, '应用名称不能为空')
      .max(255, '应用名称不能超过 255 个字符')
      .optional(),
    description: z
      .string()
      .trim()
      .min(1, '应用描述不能为空')
      .max(4000, '应用描述不能超过 4000 个字符')
      .optional(),
  })
  .strict()
  .refine(
    (value) => value.appName !== undefined || value.description !== undefined,
    { message: '至少需要提供一个可更新字段' },
  );

export class UpdateGeneratedAppDto extends createZodDto(
  UpdateGeneratedAppSchema,
) {}

export type UpdateGeneratedAppDtoType = z.infer<
  typeof UpdateGeneratedAppSchema
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
const NullableJsonObjectSchema = JsonObjectSchema.nullable().optional();

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
  /** 默认只看终端用户提交；gate-acceptance 是 Gate 5 浏览器验收产生的提交 */
  origin: z.enum(['public', 'gate-acceptance']).default('public'),
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
    /** true 时 Gate 0 丢弃已存 AppSpec 并重新生成（triggerSource 为 retry 时同样重新生成）；省略视为 false */
    regenerateAppSpec: z.boolean().optional(),
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
  repairPlan: NullableJsonObjectSchema,
  reverificationPlan: NullableJsonObjectSchema,
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
  repairPlan: NullableJsonObjectSchema,
  reverificationPlan: NullableJsonObjectSchema,
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
  /** Gate 0 生成的 AppSpec v2；生成运行产出规格前为 null */
  appSpec: GeneratedAppSpecV2 | null;
  generationModelConfigId: string | null;
  bindingTarget: GeneratedApp['bindingTarget'];
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

/** 创建响应：应用本体 + 自动排队的 initial 生成运行 id（ADR-0007 §5） */
export interface CreateGeneratedAppResponseDto extends GeneratedAppResponseDto {
  generationRunId: string;
}

export interface GeneratedAppRuntimeBindingReadinessResponseDto {
  state: GeneratedAppRuntimeBindingReadinessState;
  workflowDefinitionId: string | null;
  workflowStatus: string | null;
  publishedVersionId: string | null;
  /** 公开提交实际执行的固定版本（工作流绑定取 AppSpec，Agent 绑定取与 AppSpec 一致的包装工作流版本） */
  pinnedVersionId: string | null;
  canStartWorkflowExecution: boolean;
  summary: string;
  notice: string;
  updatedAt: Date;
}

/**
 * 交付物种类：Gate 3 工作区文件（按 `buildUnitPlan.workspace.files[].kind`）与
 * Gate 5 每个场景 × 视口的截图、trace。两者都存在对象存储的应用前缀下（D-176）；
 * 截图与 trace 由创建者经预签名链接查看（D-146）。
 */
export type GeneratedAppArtifactKind =
  | 'workspace_source_file'
  | 'workspace_test_file'
  | 'workspace_report'
  | 'workspace_manifest'
  | 'browser_screenshot'
  | 'browser_trace';

export interface GeneratedAppArtifactSummaryDto {
  artifactId: string;
  label: string;
  kind: GeneratedAppArtifactKind;
  /** 工作区文件为相对工作区前缀的路径；浏览器产物为对象存储 key */
  path: string;
  materialized: boolean;
  sizeBytes: number | null;
  contentType: string;
  /** 可经 `GET /generated-apps/:appId/artifacts/:artifactId` 内联读取（仅限不超过上限的工作区文本文件） */
  readable: boolean;
  /** 浏览器产物的预签名下载链接（短时有效）；工作区文件与对象存储不可用时为 null */
  downloadUrl: string | null;
  /** 浏览器产物对应的验收场景与视口；工作区文件为 null */
  scenarioId: string | null;
  viewportId: GeneratedAppBrowserViewportId | null;
  updatedAt: Date | null;
}

export interface GeneratedAppArtifactManifestResponseDto {
  /** 最近一次 Gate 3 物化的工作区；尚未物化时为 null */
  workspace: {
    /** 工作区在对象存储中的前缀（`tenants/<t>/generated-apps/<a>/runs/<r>/gate-3`） */
    relativePath: string;
    executionLevel: GeneratedAppGateExecutionLevel;
    materialized: boolean;
  } | null;
  /** 产出这些交付物的生成运行；还没有 v2 生成计划时为 null */
  generationRunId: string | null;
  artifacts: GeneratedAppArtifactSummaryDto[];
  updatedAt: Date;
}

export interface GeneratedAppArtifactContentResponseDto {
  artifact: GeneratedAppArtifactSummaryDto;
  content: string;
  truncated: boolean;
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
  repairPlan: GeneratedAppRepairPlan | null;
  reverificationPlan: GeneratedAppReverificationPlan | null;
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
    GeneratedAppSpecV2,
    'version' | 'appName' | 'summary' | 'userGoal' | 'actors' | 'pages'
  >;
  runtimeSurface: {
    kind: 'generated-app';
    previewUrl: string | null;
  };
  /** 按 AppSpec v2 生成的表单与结果视图；字段 id 即提交 JSON 的键 */
  runtimeForm: PublicGeneratedAppRuntimeFormV2;
  createdAt: Date;
}

export interface GeneratedAppSubmissionResponseDto {
  id: string;
  tenantId: string;
  appId: string;
  appSpecVersion: number;
  /** gate-acceptance 提交没有公开分享令牌，为 null */
  publicShareToken: string | null;
  origin: GeneratedAppSubmission['origin'];
  /** gate-acceptance 提交所属的生成运行；public 提交为 null */
  generationRunId: string | null;
  anonymousSessionId: string;
  status: GeneratedAppSubmission['status'];
  input: Record<string, unknown>;
  /** v2 为公开结果（status / sections / publicError）；v1 历史提交保留原形状 */
  result: Record<string, unknown> | null;
  /** v2 为执行引用（executionId、固定的工作流与版本、未启动原因），只对创建者可见 */
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
  /** 执行结束后按结果视图填充分区；执行中为 status=running、sections 为空 */
  result: GeneratedAppRuntimeResult | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeleteGeneratedAppSubmissionsResponseDto {
  deletedCount: number;
}
