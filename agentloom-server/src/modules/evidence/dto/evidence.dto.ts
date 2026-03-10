import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// -- Source type enum --

export const EvidenceSourceType = z.enum([
  'rag_retrieval',
  'agent_decision',
  'tool_output',
  'user_input',
  'intervention',
]);

export type EvidenceSourceType = z.infer<typeof EvidenceSourceType>;

// -- Nested packet schemas --

export const PhysicalLocationSchema = z.object({
  documentId: z.string(),
  fileName: z.string(),
  page: z.number().int().optional(),
  paragraph: z.number().int().optional(),
  offset: z.number().int(),
  length: z.number().int(),
  chunkId: z.string(),
});

export const SemanticLocationSchema = z.object({
  sectionTitle: z.string().optional(),
  context: z.string().max(500),
  relevanceScore: z.number().min(0).max(1),
});

export const AgentDecisionSchema = z.object({
  nodeId: z.string(),
  agentName: z.string(),
  autonomyMode: z.string(),
  suggestedContent: z.unknown().optional(),
  reasoning: z.string(),
  selectedAction: z.string(),
  alternatives: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const ToolOutputSchema = z.object({
  toolCallId: z.string().uuid().optional(),
  toolName: z.string(),
  toolInput: z.unknown(),
  toolOutput: z.unknown(),
  transitions: z
    .array(
      z.object({
        from: z
          .enum([
            'pending',
            'awaiting_permission',
            'denied',
            'in_progress',
            'completed',
            'failed',
          ])
          .optional(),
        to: z.enum([
          'pending',
          'awaiting_permission',
          'denied',
          'in_progress',
          'completed',
          'failed',
        ]),
        source: z.enum(['runtime', 'worker', 'user']),
        timestamp: z.string().datetime(),
      }),
    )
    .optional(),
});

export const UserInputSchema = z.object({
  content: z.unknown(),
});

export const InterventionSchema = z.object({
  action: z.enum(['approve', 'modify', 'reject']),
  feedback: z.string().optional(),
  modifiedContent: z.unknown().optional(),
  requestedAt: z.string().datetime().optional(),
  resolvedAt: z.string().datetime(),
  resolvedBy: z.string(),
  timeout: z.boolean().optional(),
});

const StoredPacketMetadataSchema = z.object({
  evidenceId: z.string().uuid(),
  contentHash: z.string().length(64),
  timestamp: z.string().datetime(),
  parentEvidenceId: z.string().uuid().optional(),
});

export const EvidencePacketInputSchema = z.discriminatedUnion('sourceType', [
  z.object({
    sourceType: z.literal('rag_retrieval'),
    physicalLocation: PhysicalLocationSchema,
    semanticLocation: SemanticLocationSchema,
    retrievedContent: z.string().min(1),
    parentEvidenceId: z.string().uuid().optional(),
  }),
  z.object({
    sourceType: z.literal('agent_decision'),
    agentDecision: AgentDecisionSchema,
    parentEvidenceId: z.string().uuid().optional(),
  }),
  z.object({
    sourceType: z.literal('tool_output'),
    toolOutput: ToolOutputSchema,
    parentEvidenceId: z.string().uuid().optional(),
  }),
  z.object({
    sourceType: z.literal('user_input'),
    userInput: UserInputSchema,
    parentEvidenceId: z.string().uuid().optional(),
  }),
  z.object({
    sourceType: z.literal('intervention'),
    intervention: InterventionSchema,
    parentEvidenceId: z.string().uuid().optional(),
  }),
]);

export const EvidencePacketSchema = z.discriminatedUnion('sourceType', [
  z.object({
    sourceType: z.literal('rag_retrieval'),
    physicalLocation: PhysicalLocationSchema,
    semanticLocation: SemanticLocationSchema,
    retrievedContent: z.string().min(1),
  }),
  z.object({
    sourceType: z.literal('agent_decision'),
    agentDecision: AgentDecisionSchema,
  }),
  z.object({
    sourceType: z.literal('tool_output'),
    toolOutput: ToolOutputSchema,
  }),
  z.object({
    sourceType: z.literal('user_input'),
    userInput: UserInputSchema,
  }),
  z.object({
    sourceType: z.literal('intervention'),
    intervention: InterventionSchema,
  }),
]).and(StoredPacketMetadataSchema);

export type EvidencePacketInputDto = z.infer<typeof EvidencePacketInputSchema>;
export type EvidencePacketDto = z.infer<typeof EvidencePacketSchema>;
export type EvidenceInterventionPacketInputDto = Extract<
  EvidencePacketInputDto,
  { sourceType: 'intervention' }
>;

// -- Query DTO --

export const QueryEvidenceSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  stepId: z.string().uuid().optional(),
});

export class QueryEvidenceDto extends createZodDto(QueryEvidenceSchema) {}

// -- Create DTO --

export const CreateEvidenceRecordSchema = z.object({
  stepId: z.string().uuid(),
  sourceType: EvidenceSourceType,
  packet: EvidencePacketInputSchema,
  parentEvidenceId: z.string().uuid().optional(),
}).superRefine((value, ctx) => {
  if (value.sourceType !== value.packet.sourceType) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['packet', 'sourceType'],
      message: 'packet.sourceType must match sourceType',
    });
  }
});

export class CreateEvidenceRecordDto extends createZodDto(
  CreateEvidenceRecordSchema,
) {}

// -- Response DTO --

export const EvidenceRecordResponseSchema = z.object({
  id: z.string().uuid(),
  executionId: z.string().uuid(),
  stepId: z.string().uuid(),
  tenantId: z.string().uuid(),
  sourceType: EvidenceSourceType,
  packet: EvidencePacketSchema,
  contentHash: z.string().length(64),
  parentEvidenceId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
});

export const VerifyEvidenceResponseSchema = z.object({
  evidenceId: z.string().uuid(),
  valid: z.boolean(),
  integrityWarning: z.boolean(),
});

export class EvidenceRecordResponseDto extends createZodDto(
  EvidenceRecordResponseSchema,
) {}

export class VerifyEvidenceResponseDto extends createZodDto(
  VerifyEvidenceResponseSchema,
) {}
