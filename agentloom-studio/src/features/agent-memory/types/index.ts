/**
 * Memory Instance 类型定义
 */

/** Memory Instance 状态 */
export const MEMORY_INSTANCE_STATUSES = [
  'active',
  'archived',
  'error',
] as const;

export type MemoryInstanceStatus = (typeof MEMORY_INSTANCE_STATUSES)[number];

/** 状态标签映射 */
export function getMemoryStatusLabel(status: MemoryInstanceStatus): string {
  const labels: Record<MemoryInstanceStatus, string> = {
    active: '运行中',
    archived: '已归档',
    error: '异常',
  };
  return labels[status] ?? status;
}

/** 状态徽章变体映射 */
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

/** Memory Instance 基础接口 */
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
  createdAt: string;
  updatedAt: string;
}

/** Memory Instance 统计信息 */
export interface MemoryInstanceStats {
  nodeCount: number;
  edgeCount: number;
}

/** Memory Instance 详情（含统计） */
export interface MemoryInstanceDetail extends MemoryInstance {
  stats: MemoryInstanceStats;
}

/** 创建 Memory Instance 输入 */
export interface CreateMemoryInstanceInput {
  name: string;
  description?: string;
}

/** 更新 Memory Instance 输入 */
export interface UpdateMemoryInstanceInput {
  name?: string;
  description?: string;
  validDomains?: string[];
  coreMemoryUris?: string[];
  systemPromptOverride?: string | null;
}

/** Memory Instance 列表查询参数 */
export interface MemoryInstanceListParams {
  page?: number;
  pageSize?: number;
  search?: string;
}
