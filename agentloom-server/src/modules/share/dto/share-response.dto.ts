import type {
  ReactFlowEdge,
  ReactFlowNode,
  ReactFlowViewport,
  WorkflowShare,
} from '../../../database/schema';

export interface ShareResponse {
  id: string;
  workflowDefinitionId: string;
  shareType: WorkflowShare['shareType'];
  shareToken: string;
  expiresAt: Date | null;
  isRevoked: boolean;
  viewCount: number;
  copyCount: number;
  createdAt: Date;
  shareUrl: string;
}

export interface ShareDetailResponse extends ShareResponse {
  workflowName: string;
  workflowDescription: string | null;
}

export interface PublicShareResponse {
  workflowName: string;
  workflowDescription: string | null;
  shareType: WorkflowShare['shareType'];
  definition: {
    nodes: ReactFlowNode[];
    edges: ReactFlowEdge[];
    viewport: ReactFlowViewport;
  };
  createdAt: Date;
  expiresAt: Date | null;
}
