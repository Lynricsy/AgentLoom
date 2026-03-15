export interface InterventionPolicyResponseDto {
  id: string;
  workflowId: string;
  nodeId: string | null;
  allowedRoles: string[];
  timeoutSeconds: number;
  timeoutAction: string;
  escalateToRole: string | null;
  notifyChannels: string[];
  isActive: boolean;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResolvedPolicyResponseDto {
  allowedRoles: string[];
  timeoutSeconds: number;
  timeoutAction: string;
  escalateToRole: string | null;
  notifyChannels: string[];
  source: 'node' | 'workflow' | 'system_default';
}
