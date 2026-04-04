import type { SandboxConfig } from '../../database/schema';
import type { PiConfigInput } from './pi-config-generator.service';

export const SANDBOX_LIFECYCLE_QUEUE = 'sandbox-lifecycle';

export type SandboxLifecycleJobType =
  | 'create'
  | 'start'
  | 'stop'
  | 'destroy'
  | 'timeout_check'
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
  containerId?: string;
  persistencePath?: string;
  piConfigInput?: PiConfigInput;
}
