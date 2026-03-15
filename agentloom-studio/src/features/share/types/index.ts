export interface ShareRecord {
  id: string;
  workflowDefinitionId: string;
  shareToken: string;
  shareType: 'read_only' | 'copyable';
  shareUrl: string;
  viewCount: number;
  copyCount: number;
  isRevoked: boolean;
  expiresAt: string | null;
  createdAt: string;
  createdBy: string;
}

export interface CreateSharePayload {
  workflowDefinitionId: string;
  shareType: 'read_only' | 'copyable';
  expiresAt?: string;
}

export interface ShareListResponse {
  data: ShareRecord[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface PublicShareData {
  token: string;
  shareType: 'read_only' | 'copyable';
  workflowName: string;
  workflowDescription: string | null;
  definition: {
    nodes: unknown[];
    edges: unknown[];
    viewport: { x: number; y: number; zoom: number };
  };
  createdAt: string;
  expiresAt: string | null;
}
