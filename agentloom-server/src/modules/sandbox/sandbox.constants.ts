import type { SandboxConfig } from '../../database/schema';

export const SANDBOX_LIFECYCLE_QUEUE = 'sandbox-lifecycle';

export type SandboxLifecycleJobType = 'create' | 'destroy' | 'timeout_check';

export interface SandboxLifecycleBinding {
  executionId?: string;
  agentConversationId?: string;
}

export interface SandboxLifecycleJobData extends SandboxLifecycleBinding {
  sessionId: string;
  tenantId: string;
  jobType: SandboxLifecycleJobType;
  config?: SandboxConfig;
  containerId?: string;
  persistencePath?: string;
}
