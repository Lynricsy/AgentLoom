import type { StatusTone } from '@/shared/ui/status-badge';
import type { ResourceSourceKind } from '@/shared/lib/resourceSource';

export const MEMORY_INSTANCE_STATUSES = [
  'active',
  'archived',
  'error',
] as const;

export type MemoryInstanceStatus = (typeof MEMORY_INSTANCE_STATUSES)[number];

/** 状态 → 文案 + StatusTone，由 <StatusBadge> 统一渲染 */
export const MEMORY_STATUS_META: Record<
  MemoryInstanceStatus,
  { label: string; tone: StatusTone }
> = {
  active: { label: '运行中', tone: 'success' },
  archived: { label: '已归档', tone: 'neutral' },
  error: { label: '异常', tone: 'error' },
};

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
  sourceKind?: ResourceSourceKind;
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
  sourceKind?: ResourceSourceKind;
}
