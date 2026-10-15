import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  DECISION_KINDS,
  DECISION_MODES,
  DECISION_PROVIDER_NAMES,
  DECISION_SUBJECT_TYPES,
} from '../decision.types';

const PageLimitSchema = z.coerce.number().int().min(1).max(100).optional();

export const ListDecisionRecordsQuerySchema = z
  .object({
    kind: z.enum(DECISION_KINDS).optional(),
    subjectType: z.enum(DECISION_SUBJECT_TYPES).optional(),
    subjectId: z.string().uuid().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: PageLimitSchema,
    pageSize: PageLimitSchema,
  })
  .transform((value) => ({
    kind: value.kind,
    subjectType: value.subjectType,
    subjectId: value.subjectId,
    page: value.page,
    limit: value.limit ?? value.pageSize ?? 20,
  }));

export class ListDecisionRecordsQueryDto extends createZodDto(
  ListDecisionRecordsQuerySchema,
) {}

export const DecisionOutcomeResponseSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('noul'), value: z.number() }),
  z.object({
    type: z.literal('choice'),
    choice: z.string(),
    probabilities: z.record(z.string(), z.number()),
    confidence: z.number(),
  }),
]);

export const DecisionRecordResponseSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(DECISION_KINDS),
  subjectType: z.enum(DECISION_SUBJECT_TYPES),
  subjectId: z.string().uuid(),
  provider: z.enum(DECISION_PROVIDER_NAMES),
  model: z.string().nullable(),
  mode: z.enum(DECISION_MODES),
  definitionVersion: z.number().int(),
  outcome: DecisionOutcomeResponseSchema.nullable(),
  /** choice 决策的模型置信度；noul 与规则结果为 null */
  confidence: z.number().nullable(),
  latencyMs: z.number().int(),
  inputTokens: z.number().int().nullable(),
  outputTokens: z.number().int().nullable(),
  /** 影子调用失败原因（截断 500 字符） */
  error: z.string().nullable(),
  createdAt: z.string(),
});

export const DecisionRecordListResponseSchema = z.object({
  data: z.array(DecisionRecordResponseSchema),
  meta: z.object({
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    limit: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    totalPages: z.number().int().min(0),
  }),
});

export class DecisionRecordListResponseDto extends createZodDto(
  DecisionRecordListResponseSchema,
) {}

export type DecisionRecordResponse = z.infer<
  typeof DecisionRecordResponseSchema
>;
export type DecisionRecordListResponse = z.infer<
  typeof DecisionRecordListResponseSchema
>;
