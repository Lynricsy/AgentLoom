export type EvidenceSourceType =
  | 'rag_retrieval'
  | 'agent_decision'
  | 'tool_output'
  | 'user_input'
  | 'intervention';

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
  sourceType: EvidenceSourceType;
  physicalLocation?: PhysicalLocation;
  semanticLocation?: SemanticLocation;
  agentDecision?: AgentDecision;
  toolOutput?: ToolOutput;
  contentHash: string;
  timestamp: string;
  parentEvidenceId?: string;
}

export interface EvidenceRecord {
  id: string;
  executionId: string;
  stepId: string;
  tenantId: string;
  sourceType: EvidenceSourceType;
  packet: EvidencePacket;
  contentHash: string;
  parentEvidenceId?: string | null;
  createdAt: string;
}

export interface EvidenceVerifyResult {
  evidenceId: string;
  valid: boolean;
}

export interface EvidenceQueryParams {
  page?: number;
  limit?: number;
  stepId?: string;
}
