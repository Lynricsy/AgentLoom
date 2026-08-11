import type { BadgeProps } from '@/shared/ui/badge';
import type { ResourceSourceKind } from '@/shared/lib/resourceSource';

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

/** 状态 → Badge 语义色档位（design token 驱动，禁止硬编码调色板类） */
export function getMemoryStatusVariant(
  status: MemoryInstanceStatus,
): NonNullable<BadgeProps['variant']> {
  const variants: Record<
    MemoryInstanceStatus,
    NonNullable<BadgeProps['variant']>
  > = {
    active: 'success',
    archived: 'secondary',
    error: 'error',
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
