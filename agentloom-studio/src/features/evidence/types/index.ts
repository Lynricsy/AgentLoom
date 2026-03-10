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
  suggestedContent?: unknown;
  reasoning: string;
  selectedAction: string;
  alternatives?: string[];
  confidence?: number;
}

export interface ToolOutputTransition {
  from?:
    | 'pending'
    | 'awaiting_permission'
    | 'denied'
    | 'in_progress'
    | 'completed'
    | 'failed';
  to:
    | 'pending'
    | 'awaiting_permission'
    | 'denied'
    | 'in_progress'
    | 'completed'
    | 'failed';
  source: 'runtime' | 'worker' | 'user';
  timestamp: string;
}

export interface ToolOutput {
  toolCallId?: string;
  toolName: string;
  toolInput: unknown;
  toolOutput: unknown;
  transitions?: ToolOutputTransition[];
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

interface BaseEvidencePacket {
  evidenceId: string;
  sourceType: EvidenceSourceType;
  contentHash: string;
  timestamp: string;
  parentEvidenceId?: string;
}

export interface RagRetrievalEvidencePacket extends BaseEvidencePacket {
  sourceType: 'rag_retrieval';
  physicalLocation: PhysicalLocation;
  semanticLocation: SemanticLocation;
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

export type EvidencePacket =
  | RagRetrievalEvidencePacket
  | AgentDecisionEvidencePacket
  | ToolOutputEvidencePacket
  | UserInputEvidencePacket
  | InterventionEvidencePacket;

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
  integrityWarning: boolean;
}

export interface EvidenceQueryParams {
  page?: number;
  limit?: number;
  stepId?: string;
  sourceType?: EvidenceSourceType;
  nodeId?: string;
  includeChunkContent?: boolean;
}

export interface IntegrityIssue {
  evidenceId: string;
  issueType: 'source_unavailable' | 'source_modified' | 'hash_mismatch';
  description: string;
}

export interface EvidencePacketSummary {
  title: string;
  excerpt?: string;
  metadata?: Record<string, string>;
}

export interface ChainIntegrityStatus {
  chainCompleteness: number;
  totalNodes: number;
  nodesWithPhysicalLocation: number;
  completenessLabel: string;
  integrityIssues: IntegrityIssue[];
}

export interface EvidenceChainNode {
  evidenceId: string;
  executionId: string;
  stepId: string;
  sourceType: EvidenceSourceType;
  packetSummary: EvidencePacketSummary;
  contentHash: string;
  parentEvidenceId?: string | null;
  createdAt: string;
  depth: number;
  hashValid: boolean;
  sourceUnavailable?: boolean;
  sourceModified?: boolean;
  unavailableReason?: string;
  originalSnapshot?: string;
  children: EvidenceChainNode[];
}

export interface EvidenceChainResponse {
  roots: EvidenceChainNode[];
  chainCompleteness: number;
  totalNodes: number;
  integrityStatus: ChainIntegrityStatus;
  cachedAt?: string;
}
