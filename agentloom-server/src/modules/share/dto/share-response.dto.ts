import type {
  ReactFlowEdge,
  ReactFlowNode,
  ReactFlowViewport,
  WorkflowShare,
} from '../../../database/schema';

export interface ShareAuthorResponse {
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
}

interface BaseShareResponse {
  resourceType: 'workflow' | 'agent';
  resourceId: string;
  title: string;
  description: string | null;
  createdBy: string;
}

export interface ShareResponse extends BaseShareResponse {
  id: string;
  workflowDefinitionId?: string;
  agentDefinitionId?: string;
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

interface BasePublicShareResponse {
  token: string;
  resourceType: 'workflow' | 'agent';
  title: string;
  description: string | null;
  shareType: WorkflowShare['shareType'];
  author: ShareAuthorResponse;
  definition: {
    nodes: ReactFlowNode[];
    edges: ReactFlowEdge[];
    viewport: ReactFlowViewport;
  };
  nodeCount: number;
  edgeCount: number;
  createdAt: Date;
  expiresAt: Date | null;
}

export interface PublicWorkflowShareResponse extends BasePublicShareResponse {
  resourceType: 'workflow';
  workflowDefinitionId: string;
  workflowName: string;
  workflowDescription: string | null;
}

export interface PublicAgentShareResponse extends BasePublicShareResponse {
  resourceType: 'agent';
  agentDefinitionId: string;
  agentName: string;
  agentDescription: string | null;
  runtimeMode: 'sandbox' | 'no_sandbox';
  inputSchema: Record<string, unknown> | null;
  sandboxLifecycle: 'session' | 'persistent' | null;
}

export type PublicShareResponse =
  | PublicWorkflowShareResponse
  | PublicAgentShareResponse;
