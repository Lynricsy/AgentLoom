import type { SandboxConfig } from '../../database/schema';

export const SANDBOX_LIFECYCLE_QUEUE = 'sandbox-lifecycle';

export type SandboxLifecycleJobType =
  | 'create'
  | 'start'
  | 'stop'
  | 'destroy'
  | 'timeout_check'
  | 'workspace_lease_renew'
  | 'conversation_idle_end_check';

export interface SandboxLifecycleBinding {
  executionId?: string;
  agentConversationId?: string;
  sandboxNodeId?: string;
}

export interface SandboxLifecycleJobData extends SandboxLifecycleBinding {
  sessionId: string;
  tenantId: string;
  jobType: SandboxLifecycleJobType;
  config?: SandboxConfig;
  runtimeHandle?: string;
  persistencePath?: string;
}
