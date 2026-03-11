import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// -- Source type enum --

export const EvidenceSourceType = z.enum([
  'rag_retrieval',
  'agent_decision',
  'tool_output',
  'user_input',
  'intervention',
  'node_error',
]);

export type EvidenceSourceType = z.infer<typeof EvidenceSourceType>;

// -- Nested packet schemas --

export const PhysicalLocationSchema = z.object({
  documentId: z.string(),
  knowledgeBaseId: z.string().optional(),
  fileName: z.string(),
  page: z.number().int().optional(),
  paragraph: z.number().int().optional(),
  offset: z.number().int(),
  length: z.number().int(),
  chunkId: z.string(),
  chunkContent: z.string().optional(),
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

export const TypeMismatchInfoSchema = z.object({
  sourcePortId: z.string(),
  targetPortId: z.string(),
  sourceType: z.string(),
  targetType: z.string(),
  sourceNodeId: z.string(),
  targetNodeId: z.string(),
  edgeId: z.string().optional(),
});

export const NodeErrorInfoSchema = z.object({
  errorType: z.string().optional(),
  errorTitle: z.string().optional(),
  errorMessage: z.string(),
  errorDetail: z.string().optional(),
  nodeId: z.string(),
  stack: z.string().optional(),
  typeMismatch: TypeMismatchInfoSchema.optional(),
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
  z.object({
    sourceType: z.literal('node_error'),
    nodeError: NodeErrorInfoSchema,
    parentEvidenceId: z.string().uuid().optional(),
  }),
]);

export const EvidencePacketSchema = z
  .discriminatedUnion('sourceType', [
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
    z.object({
      sourceType: z.literal('node_error'),
      nodeError: NodeErrorInfoSchema,
    }),
  ])
  .and(StoredPacketMetadataSchema);

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
  sourceType: EvidenceSourceType.optional(),
  nodeId: z.string().min(1).optional(),
  includeChunkContent: z
    .preprocess((v) => v === 'true' || v === true, z.boolean())
    .optional()
    .default(false),
});

export class QueryEvidenceDto extends createZodDto(QueryEvidenceSchema) {}

// -- Create DTO --

export const CreateEvidenceRecordSchema = z
  .object({
    stepId: z.string().uuid(),
    sourceType: EvidenceSourceType,
    packet: EvidencePacketInputSchema,
    parentEvidenceId: z.string().uuid().optional(),
  })
  .superRefine((value, ctx) => {
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
  currentHash: z.string().length(64),
});

export class EvidenceRecordResponseDto extends createZodDto(
  EvidenceRecordResponseSchema,
) {}

export class VerifyEvidenceResponseDto extends createZodDto(
  VerifyEvidenceResponseSchema,
) {}

// -- Chain schemas (Story 6-2) --

export const EvidencePacketSummarySchema = z.object({
  title: z.string(),
  excerpt: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export type EvidencePacketSummary = z.infer<typeof EvidencePacketSummarySchema>;

export const IntegrityIssueSchema = z.object({
  evidenceId: z.string().uuid(),
  issueType: z.enum(['source_unavailable', 'source_modified', 'hash_mismatch']),
  description: z.string(),
});

export type IntegrityIssue = z.infer<typeof IntegrityIssueSchema>;

export const ChainIntegrityStatusSchema = z.object({
  chainCompleteness: z.number().min(0).max(1),
  totalNodes: z.number().int().min(0),
  nodesWithPhysicalLocation: z.number().int().min(0),
  completenessLabel: z.string(),
  integrityIssues: z.array(IntegrityIssueSchema),
});

export type ChainIntegrityStatus = z.infer<typeof ChainIntegrityStatusSchema>;

export interface EvidenceChainNode {
  evidenceId: string;
  executionId: string;
  stepId: string;
  sourceType: EvidenceSourceType;
  packetSummary: EvidencePacketSummary;
  contentHash: string;
  parentEvidenceId: string | null;
  createdAt: string;
  depth: number;
  sourceUnavailable?: boolean;
  sourceModified?: boolean;
  unavailableReason?: string;
  originalSnapshot?: string;
  hashValid: boolean;
  children: EvidenceChainNode[];
}

const BaseChainNodeSchema = z.object({
  evidenceId: z.string().uuid(),
  executionId: z.string().uuid(),
  stepId: z.string().uuid(),
  sourceType: EvidenceSourceType,
  packetSummary: EvidencePacketSummarySchema,
  contentHash: z.string().length(64),
  parentEvidenceId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  depth: z.number().int().min(0),
  sourceUnavailable: z.boolean().optional(),
  sourceModified: z.boolean().optional(),
  unavailableReason: z.string().optional(),
  originalSnapshot: z.string().optional(),
  hashValid: z.boolean(),
});

export const EvidenceChainNodeSchema: z.ZodType<EvidenceChainNode> =
  BaseChainNodeSchema.extend({
    children: z.lazy(() => z.array(EvidenceChainNodeSchema)),
  });

export const EvidenceChainResponseSchema = z.object({
  roots: z.array(EvidenceChainNodeSchema),
  chainCompleteness: z.number().min(0).max(1),
  totalNodes: z.number().int().min(0),
  integrityStatus: ChainIntegrityStatusSchema,
  cachedAt: z.string().datetime().optional(),
});

export type EvidenceChainResponse = z.infer<typeof EvidenceChainResponseSchema>;

export const QueryEvidenceChainSchema = z.object({
  nodeId: z.string().min(1).optional(),
});

export class QueryEvidenceChainDto extends createZodDto(
  QueryEvidenceChainSchema,
) {}
