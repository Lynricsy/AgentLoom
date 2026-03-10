import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { createDirectTenantPolicies } from './rls-policies';
import { executionSteps } from './execution-steps.schema';
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
  reasoning: string;
  selectedAction: string;
  alternatives?: string[];
  confidence?: number;
}

export interface ToolOutput {
  toolName: string;
  toolInput: unknown;
  toolOutput: unknown;
}

export interface EvidencePacket {
  evidenceId: string;
  sourceType: string;
  physicalLocation?: PhysicalLocation;
  semanticLocation?: SemanticLocation;
  agentDecision?: AgentDecision;
  toolOutput?: ToolOutput;
  contentHash: string;
  timestamp: string;
  parentEvidenceId?: string;
}

// -- Enum --

export const evidenceSourceTypeEnum = pgEnum('evidence_source_type', [
  'rag_retrieval',
  'agent_decision',
  'tool_output',
  'user_input',
  'intervention',
]);

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
    index('idx_evidence_execution_step').on(table.executionId, table.stepId),
    index('idx_evidence_packet_gin').using('gin', table.packet),
    index('idx_evidence_parent').on(table.parentEvidenceId),
    ...createDirectTenantPolicies('evidence_records'),
  ],
);

// -- Type exports --

export type EvidenceRecord = typeof evidenceRecords.$inferSelect;
export type NewEvidenceRecord = typeof evidenceRecords.$inferInsert;
