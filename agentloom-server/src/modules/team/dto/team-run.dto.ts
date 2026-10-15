import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  TeamFailureReasonSchema,
  TeamMemberStatusSchema,
  TeamMessageDeliveryStatusSchema,
  TeamMessageKindSchema,
  TeamRunStatusSchema,
} from '@agentloom/contracts';

export const ListTeamRunsQuerySchema = z.object({
  executionId: z.string().uuid(),
});

export const ListTeamMessagesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export class ListTeamRunsQueryDto extends createZodDto(
  ListTeamRunsQuerySchema,
) {}

export class ListTeamMessagesQueryDto extends createZodDto(
  ListTeamMessagesQuerySchema,
) {}

const TeamUsageSchema = z.object({
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  costUsd: z.number(),
});

export const TeamRunSummarySchema = z.object({
  id: z.string().uuid(),
  executionId: z.string().uuid(),
  stepId: z.string().uuid(),
  nodeId: z.string(),
  status: TeamRunStatusSchema,
  failureReason: TeamFailureReasonSchema.nullable(),
  usage: TeamUsageSchema,
  messageCount: z.number().int(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const TeamRunMemberSchema = z.object({
  id: z.string().uuid(),
  role: z.string(),
  isLead: z.boolean(),
  agentDefinitionId: z.string().uuid(),
  agentName: z.string().nullable(),
  conversationId: z.string().uuid(),
  status: TeamMemberStatusSchema,
  turnCount: z.number().int(),
  usage: TeamUsageSchema,
});

export const TeamRunDetailSchema = z.object({
  id: z.string().uuid(),
  executionId: z.string().uuid(),
  stepId: z.string().uuid(),
  nodeId: z.string(),
  status: TeamRunStatusSchema,
  taskText: z.string(),
  budget: z.object({
    maxTotalTokens: z.number().int(),
    maxMessages: z.number().int(),
    deadlineAt: z.string(),
    usedTokens: z.number().int(),
    messageCount: z.number().int(),
  }),
  usage: TeamUsageSchema,
  members: z.array(TeamRunMemberSchema),
  result: z.record(z.string(), z.unknown()).nullable(),
  failureReason: TeamFailureReasonSchema.nullable(),
  failureDetail: z.string().nullable(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
});

export const TeamMessageItemSchema = z.object({
  id: z.string().uuid(),
  /** null 表示系统消息 */
  fromRole: z.string().nullable(),
  toRole: z.string(),
  kind: TeamMessageKindSchema,
  content: z.string(),
  refs: z.array(z.string()),
  deliveryStatus: TeamMessageDeliveryStatusSchema,
  decisionRecordId: z.string().uuid().nullable(),
  createdAt: z.string(),
  deliveredAt: z.string().nullable(),
  consumedAt: z.string().nullable(),
});

export const TeamRunListResponseSchema = z.object({
  data: z.array(TeamRunSummarySchema),
});

export const TeamRunDetailResponseSchema = z.object({
  data: TeamRunDetailSchema,
});

export const TeamMessageListResponseSchema = z.object({
  data: z.array(TeamMessageItemSchema),
  meta: z.object({
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    limit: z.number().int().min(1),
    totalPages: z.number().int().min(0),
  }),
});

export class TeamRunListResponseDto extends createZodDto(
  TeamRunListResponseSchema,
) {}

export class TeamRunDetailResponseDto extends createZodDto(
  TeamRunDetailResponseSchema,
) {}

export class TeamMessageListResponseDto extends createZodDto(
  TeamMessageListResponseSchema,
) {}

export type TeamRunSummary = z.infer<typeof TeamRunSummarySchema>;
export type TeamRunDetail = z.infer<typeof TeamRunDetailSchema>;
export type TeamMessageItem = z.infer<typeof TeamMessageItemSchema>;
export type TeamRunListResponse = z.infer<typeof TeamRunListResponseSchema>;
export type TeamRunDetailResponse = z.infer<typeof TeamRunDetailResponseSchema>;
export type TeamMessageListResponse = z.infer<
  typeof TeamMessageListResponseSchema
>;
