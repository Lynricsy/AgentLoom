export interface SandboxSessionConfig {
  name?: string;
  cpu: number;
  memory: number;
  disk: number;
  timeout: number;
  timeoutSeconds?: number;
  conversationIdleAutoEndMinutes?: number;
  lifecycleMode?: "session" | "persistent";
  restoreWorkspaceId?: string;
}

export interface SandboxSession {
  id: string;
  executionId: string | null;
  agentConversationId: string | null;
  sandboxNodeId: string | null;
  status: "creating" | "ready" | "busy" | "stopping" | "stopped" | "failed";
  config: SandboxSessionConfig;
  bindingType?: "conversation" | "execution" | "resource";
  workspacePath: string | null;
  startedAt: string | null;
  stoppedAt: string | null;
  createdAt: string;
}

export type SandboxStatus = SandboxSession["status"];

export interface SandboxStats {
  cpuPercent: number;
  memoryUsageMb: number;
  memoryLimitMb: number;
  diskUsage?: number;
  diskTotal?: number;
}

export interface SandboxProcess {
  pid: number;
  cpuPercent: number;
  memoryPercent: number;
  state: string;
  elapsed: string;
  executable: string;
  command: string;
}

export interface SandboxListParams {
  page?: number;
  pageSize?: number;
  status?: SandboxStatus | "";
  lifecycleMode?: "session" | "persistent" | "";
  bindingType?: "conversation" | "execution" | "resource" | "";
  search?: string;
}

export interface SandboxListResponse {
  data: SandboxSession[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface CreateSandboxPayload {
  name: string;
  cpu: number;
  memory: number;
  disk: number;
  conversationIdleAutoEndMinutes: number;
}
