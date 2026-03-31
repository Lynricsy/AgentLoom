export const MEMORY_INSTANCE_STATUSES = [
  'active',
  'archived',
  'error',
] as const;

export type MemoryInstanceStatus = (typeof MEMORY_INSTANCE_STATUSES)[number];

export function getMemoryStatusLabel(status: MemoryInstanceStatus): string {
  const labels: Record<MemoryInstanceStatus, string> = {
    active: '运行中',
    archived: '已归档',
    error: '异常',
  };
  return labels[status] ?? status;
}

export function getMemoryStatusVariant(
  status: MemoryInstanceStatus,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  const variants: Record<
    MemoryInstanceStatus,
    'default' | 'secondary' | 'destructive' | 'outline'
  > = {
    active: 'default',
    archived: 'secondary',
    error: 'destructive',
  };
  return variants[status] ?? 'outline';
}

export interface MemoryInstance {
  id: string;
  name: string;
  description: string | null;
  tenantId: string;
  validDomains: string[] | null;
  coreMemoryUris: string[] | null;
  systemPromptOverride: string | null;
  config: Record<string, unknown> | null;
  status: MemoryInstanceStatus;
  nodeCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryInstanceStats {
  nodeCount: number;
  edgeCount: number;
}

export interface MemoryInstanceDetail extends MemoryInstance {
  stats: MemoryInstanceStats;
}

export interface CreateMemoryInstanceInput {
  name: string;
  description?: string;
}

export interface UpdateMemoryInstanceInput {
  name?: string;
  description?: string;
  validDomains?: string[];
  coreMemoryUris?: string[];
  systemPromptOverride?: string | null;
}

export interface MemoryInstanceListParams {
  page?: number;
  pageSize?: number;
  search?: string;
}
