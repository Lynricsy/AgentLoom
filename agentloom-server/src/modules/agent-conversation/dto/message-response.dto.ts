import type { AgentMessage } from '../../../database/schema/agent-conversations.schema';

export interface MessageResponseDto {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  toolCalls: Record<string, unknown>[] | null;
  toolResults: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export function serializeMessage(row: AgentMessage): MessageResponseDto {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    content: row.content,
    toolCalls: (row.toolCalls as Record<string, unknown>[] | null) ?? null,
    toolResults: (row.toolResults as Record<string, unknown> | null) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.createdAt.toISOString(),
  };
}
