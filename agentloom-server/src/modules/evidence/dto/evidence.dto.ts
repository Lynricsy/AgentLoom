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
  reasoning: z.string(),
  selectedAction: z.string(),
  alternatives: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const ToolOutputSchema = z.object({
  toolName: z.string(),
  toolInput: z.unknown(),
  toolOutput: z.unknown(),
});

export const EvidencePacketSchema = z.object({
  evidenceId: z.string().uuid(),
  sourceType: EvidenceSourceType,
  physicalLocation: PhysicalLocationSchema.optional(),
  semanticLocation: SemanticLocationSchema.optional(),
  agentDecision: AgentDecisionSchema.optional(),
  toolOutput: ToolOutputSchema.optional(),
  contentHash: z.string().length(64),
  timestamp: z.string().datetime(),
  parentEvidenceId: z.string().uuid().optional(),
});

export type EvidencePacketDto = z.infer<typeof EvidencePacketSchema>;

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
  packet: EvidencePacketSchema,
  parentEvidenceId: z.string().uuid().optional(),
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

export class EvidenceRecordResponseDto extends createZodDto(
  EvidenceRecordResponseSchema,
) {}
