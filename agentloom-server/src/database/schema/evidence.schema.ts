import { sql } from 'drizzle-orm';
import {
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { createDirectTenantPolicies } from './rls-policies';
import {
  executionSteps,
  TypeMismatchInfo,
} from './execution-steps.schema';
import { workflowExecutions } from './workflow-executions.schema';

// -- Evidence packet TypeScript interface for JSONB column --

export interface PhysicalLocation {
  documentId: string;
  fileName: string;
  page?: number;
  paragraph?: number;
  offset: number;
  length: number;
  chunkId: string;
}

export interface SemanticLocation {
  sectionTitle?: string;
  context: string;
  relevanceScore: number;
}

export interface AgentDecision {
  nodeId: string;
  agentName: string;
  autonomyMode: string;
  suggestedContent?: unknown;
  reasoning: string;
  selectedAction: string;
  alternatives?: string[];
  confidence?: number;
}

export interface ToolOutput {
  toolCallId?: string;
  toolName: string;
  toolInput: unknown;
  toolOutput: unknown;
  transitions?: Array<{
    from?: string;
    to: string;
    source: string;
    timestamp: string;
  }>;
}

export interface UserInput {
  content: unknown;
}

export interface InterventionPayload {
  action: 'approve' | 'modify' | 'reject';
  feedback?: string;
  modifiedContent?: unknown;
  requestedAt?: string;
  resolvedAt: string;
  resolvedBy: string;
  timeout?: boolean;
}

export interface NodeErrorInfo {
  errorType?: string;
  errorTitle?: string;
  errorMessage: string;
  errorDetail?: string;
  nodeId: string;
  stack?: string;
  typeMismatch?: TypeMismatchInfo;
}

export const evidenceSourceTypes = [
  'rag_retrieval',
  'agent_decision',
  'tool_output',
  'user_input',
  'intervention',
  'node_error',
] as const;

export type EvidenceSourceType = (typeof evidenceSourceTypes)[number];

interface BaseEvidencePacket {
  evidenceId: string;
  sourceType: EvidenceSourceType;
  contentHash: string;
  timestamp: string;
  parentEvidenceId?: string;
}

export interface RagRetrievalEvidencePacket extends BaseEvidencePacket {
  sourceType: 'rag_retrieval';
  physicalLocation?: PhysicalLocation;
  semanticLocation?: SemanticLocation;
  retrievedContent: string;
}

export interface AgentDecisionEvidencePacket extends BaseEvidencePacket {
  sourceType: 'agent_decision';
  agentDecision: AgentDecision;
}

export interface ToolOutputEvidencePacket extends BaseEvidencePacket {
  sourceType: 'tool_output';
  toolOutput: ToolOutput;
}

export interface UserInputEvidencePacket extends BaseEvidencePacket {
  sourceType: 'user_input';
  userInput: UserInput;
}

export interface InterventionEvidencePacket extends BaseEvidencePacket {
  sourceType: 'intervention';
  intervention: InterventionPayload;
}

export interface NodeErrorEvidencePacket extends BaseEvidencePacket {
  sourceType: 'node_error';
  nodeError: NodeErrorInfo;
}

export type EvidencePacket =
  | RagRetrievalEvidencePacket
  | AgentDecisionEvidencePacket
  | ToolOutputEvidencePacket
  | UserInputEvidencePacket
  | InterventionEvidencePacket
  | NodeErrorEvidencePacket;

export const evidenceSourceTypeEnum = pgEnum(
  'evidence_source_type',
  evidenceSourceTypes,
);

// -- Table --

export const evidenceRecords = pgTable(
  'evidence_records',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    executionId: uuid('execution_id')
      .notNull()
      .references(() => workflowExecutions.id, { onDelete: 'cascade' }),
    stepId: uuid('step_id')
      .notNull()
      .references(() => executionSteps.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull(),
    sourceType: evidenceSourceTypeEnum('source_type').notNull(),
    packet: jsonb('packet').$type<EvidencePacket>().notNull(),
    contentHash: varchar('content_hash', { length: 64 }).notNull(),
    parentEvidenceId: uuid('parent_evidence_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.parentEvidenceId],
      foreignColumns: [table.id],
      name: 'evidence_records_parent_evidence_id_fkey',
    }).onDelete('set null'),
    index('idx_evidence_execution_step').on(table.executionId, table.stepId),
    index('idx_evidence_packet_gin').using('gin', table.packet),
    index('idx_evidence_parent').on(table.parentEvidenceId),
    ...createDirectTenantPolicies('evidence_records'),
  ],
);

// -- Type exports --

export type EvidenceRecord = typeof evidenceRecords.$inferSelect;
export type NewEvidenceRecord = typeof evidenceRecords.$inferInsert;
