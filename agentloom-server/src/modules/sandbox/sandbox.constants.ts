import type { SandboxConfig } from '../../database/schema';

export const SANDBOX_LIFECYCLE_QUEUE = 'sandbox-lifecycle';

export type SandboxLifecycleJobType = 'create' | 'destroy' | 'timeout_check';

export interface SandboxLifecycleJobData {
  sessionId: string;
  executionId: string;
  tenantId: string;
  jobType: SandboxLifecycleJobType;
  config?: SandboxConfig;
  containerId?: string;
}
