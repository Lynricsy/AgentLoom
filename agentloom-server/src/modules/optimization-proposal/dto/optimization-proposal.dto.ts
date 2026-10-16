import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { OPTIMIZATION_EVAL_MAX_CASES } from '../optimization-proposal.constants';
import {
  OPTIMIZATION_EVALUATION_ARMS,
  OPTIMIZATION_EVALUATION_RUN_STATUSES,
  OPTIMIZATION_EVALUATION_STATUSES,
  OPTIMIZATION_EVALUATION_VERDICTS,
  OPTIMIZATION_PROPOSAL_NODE_TYPES,
  OPTIMIZATION_PROPOSAL_STATUSES,
  OPTIMIZATION_PROPOSAL_TYPES,
} from '../optimization-proposal.types';

// ─── 请求 ─────────────────────────────────────────────────────────

export const ListProposalsQuerySchema = z.object({
  workflowDefinitionId: z.uuid().optional(),
  status: z.enum(OPTIMIZATION_PROPOSAL_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export class ListProposalsQueryDto extends createZodDto(
  ListProposalsQuerySchema,
) {}

export const AnalyzeWorkflowSchema = z.object({
  workflowDefinitionId: z.uuid(),
});
export class AnalyzeWorkflowDto extends createZodDto(AnalyzeWorkflowSchema) {}

export const StartEvaluationSchema = z.object({
  caseCount: z
    .number()
    .int()
    .min(1)
    .max(OPTIMIZATION_EVAL_MAX_CASES)
    .optional(),
});
export class StartEvaluationDto extends createZodDto(StartEvaluationSchema) {}

export const PublishProposalSchema = z.object({
  label: z.string().max(255).optional(),
  releaseNotes: z.string().max(1000).optional(),
});
export class PublishProposalDto extends createZodDto(PublishProposalSchema) {}

// ─── 响应 ─────────────────────────────────────────────────────────

const ProposalEvidenceSchema = z.object({
  analyzerVersion: z.number().int(),
  windowDays: z.number().int(),
  windowStart: z.string(),
  windowEnd: z.string(),
  sampleCount: z.number().int(),
  matchedCount: z.number().int(),
  matchedRate: z.number(),
  sampleIds: z.array(z.string()),
  modelName: z.string().optional(),
});

export const ProposalSummarySchema = z.object({
  id: z.uuid(),
  workflowDefinitionId: z.uuid(),
  workflowName: z.string(),
  nodeId: z.string(),
  nodeType: z.enum(OPTIMIZATION_PROPOSAL_NODE_TYPES),
  proposalType: z.enum(OPTIMIZATION_PROPOSAL_TYPES),
  status: z.enum(OPTIMIZATION_PROPOSAL_STATUSES),
  configPath: z.string(),
  currentValue: z.unknown(),
  proposedValue: z.unknown(),
  rationale: z.string(),
  evidence: ProposalEvidenceSchema,
  baseVersionId: z.uuid(),
  candidateVersionId: z.uuid().nullable(),
  publishedVersionId: z.uuid().nullable(),
  verdict: z.enum(OPTIMIZATION_EVALUATION_VERDICTS).nullable(),
  currentEvaluationId: z.uuid().nullable(),
  evaluatedAt: z.iso.datetime().nullable(),
  publishedAt: z.iso.datetime().nullable(),
  rolledBackAt: z.iso.datetime().nullable(),
  dismissedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

const EvaluationRunTeamMetricsSchema = z.object({
  status: z.string(),
  failureReason: z.string().nullable(),
  usedTokens: z.number(),
  messageCount: z.number().int(),
});

const EvaluationRunMetricsSchema = z.object({
  passed: z.boolean(),
  executionStatus: z.string(),
  durationMs: z.number().nullable(),
  costUsd: z.number().nullable(),
  totalTokens: z.number().nullable(),
  team: EvaluationRunTeamMetricsSchema.nullable(),
  error: z.string().nullable(),
});

export const EvaluationRunSchema = z.object({
  id: z.uuid(),
  arm: z.enum(OPTIMIZATION_EVALUATION_ARMS),
  caseIndex: z.number().int(),
  executionId: z.uuid().nullable(),
  status: z.enum(OPTIMIZATION_EVALUATION_RUN_STATUSES),
  metrics: EvaluationRunMetricsSchema.nullable(),
  completedAt: z.iso.datetime().nullable(),
});

export const EvaluationArmSummarySchema = z.object({
  cases: z.number().int(),
  passed: z.number().int(),
  passRate: z.number(),
  meanCostUsd: z.number().nullable(),
  meanDurationMs: z.number().nullable(),
  teamFailureReasons: z.record(z.string(), z.number().int()),
});

export const EvaluationSummarySchema = z.object({
  baseline: EvaluationArmSummarySchema,
  candidate: EvaluationArmSummarySchema,
  passRateDelta: z.number(),
  costDeltaRatio: z.number().nullable(),
  verdict: z.enum(OPTIMIZATION_EVALUATION_VERDICTS),
});

export const EvaluationSchema = z.object({
  id: z.uuid(),
  proposalId: z.uuid(),
  status: z.enum(OPTIMIZATION_EVALUATION_STATUSES),
  baseVersionId: z.uuid(),
  candidateVersionId: z.uuid(),
  caseCount: z.number().int(),
  cases: z.array(
    z.object({ index: z.number().int(), sourceExecutionId: z.uuid() }),
  ),
  summary: EvaluationSummarySchema.nullable(),
  failureReason: z.string().nullable(),
  deadlineAt: z.iso.datetime(),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
  runs: z.array(EvaluationRunSchema),
});

export const ProposalDetailSchema = ProposalSummarySchema.extend({
  latestEvaluation: EvaluationSchema.nullable(),
  publishReport: z
    .object({ draftSynced: z.boolean(), note: z.string().nullable() })
    .nullable(),
});

export const ProposalListResponseSchema = z.object({
  data: z.array(ProposalSummarySchema),
  meta: z.object({
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    limit: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    totalPages: z.number().int().min(0),
  }),
});
export class ProposalListResponseDto extends createZodDto(
  ProposalListResponseSchema,
) {}

export const ProposalDetailResponseSchema = z.object({
  data: ProposalDetailSchema,
});
export class ProposalDetailResponseDto extends createZodDto(
  ProposalDetailResponseSchema,
) {}

export const AnalyzeResponseSchema = z.object({
  data: z.array(ProposalSummarySchema),
});
export class AnalyzeResponseDto extends createZodDto(AnalyzeResponseSchema) {}

export type ListProposalsQuery = z.infer<typeof ListProposalsQuerySchema>;
export type ProposalSummary = z.infer<typeof ProposalSummarySchema>;
export type ProposalDetail = z.infer<typeof ProposalDetailSchema>;
export type EvaluationResponse = z.infer<typeof EvaluationSchema>;
export type ProposalListResponse = z.infer<typeof ProposalListResponseSchema>;
export type ProposalDetailResponse = z.infer<
  typeof ProposalDetailResponseSchema
>;
export type AnalyzeResponse = z.infer<typeof AnalyzeResponseSchema>;
