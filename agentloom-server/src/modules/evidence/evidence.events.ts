import type {
  CreateEvidenceRecordDto,
  EvidenceInterventionPacketInputDto,
} from './dto/evidence.dto';

export const EvidenceEventName = {
  CREATE: 'evidence.create',
  BATCH_CREATE: 'evidence.batch-create',
  RAG_RETRIEVED: 'knowledge.rag.retrieved',
} as const;

export interface EvidenceCreatePayload {
  tenantId: string;
  executionId: string;
  dto: CreateEvidenceRecordDto;
}

export interface EvidenceBatchCreatePayload {
  tenantId: string;
  executionId: string;
  dtos: CreateEvidenceRecordDto[];
}

export interface RagEvidenceResultPayload {
  chunkId: string;
  score: number;
  content: string;
  location: Record<string, unknown> | null;
  documentId: string;
  knowledgeBaseId: string;
  chunkIndex: number;
}

export interface RagEvidenceRetrievedPayload {
  tenantId: string;
  executionId: string;
  stepId: string;
  parentEvidenceId?: string;
  results: RagEvidenceResultPayload[];
}

export interface InterventionEvidencePayload {
  tenantId: string;
  executionId: string;
  stepId: string;
  parentEvidenceId?: string;
  packet: EvidenceInterventionPacketInputDto;
}

export interface NodeErrorEvidencePayload {
  tenantId: string;
  executionId: string;
  stepId: string;
  nodeId: string;
  errorMessage: string;
  errorType?: string;
  errorTitle?: string;
  errorDetail?: string;
  stack?: string;
  typeMismatch?: {
    sourcePortId?: string;
    targetPortId?: string;
    sourceType: string;
    targetType: string;
    sourceNodeId: string;
    targetNodeId: string;
    edgeId?: string;
  };
}
