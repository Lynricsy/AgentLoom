import type { AgentConversation } from '../../../database/schema/agent-conversations.schema';

export interface ConversationResponseDto {
  id: string;
  agentDefinitionId: string;
  title: string | null;
  status: string;
  metadata: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export function serializeConversation(
  row: AgentConversation,
): ConversationResponseDto {
  return {
    id: row.id,
    agentDefinitionId: row.agentDefinitionId,
    title: row.title ?? null,
    status: row.status,
    metadata: row.metadata ?? {},
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
