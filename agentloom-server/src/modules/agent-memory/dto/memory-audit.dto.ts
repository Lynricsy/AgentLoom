import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// 响应契约独立建模，避免复用带 default/transform 的请求 schema 后让 Swagger 错报 wire 形状。
export const MemoryAuditOperationSwaggerSchema = z.enum([
  'create',
  'update',
  'delete',
  'rollback',
]);

export const MemoryAuditEntrySwaggerSchema = z.object({
  id: z.string().uuid(),
  instanceId: z.string().uuid(),
  nodeId: z.string().uuid(),
  nodeName: z.string(),
  versionId: z.string().uuid(),
  operationType: MemoryAuditOperationSwaggerSchema,
  actor: z.string(),
  actorId: z.string(),
  timestamp: z.string(),
  changeSummary: z.string(),
  previousValue: z.string().nullable(),
  currentValue: z.string().nullable(),
  reviewStatus: z.enum(['pending', 'approved', 'rejected']),
  metadata: z.record(z.string(), z.unknown()),
});

export const MemoryAuditListResponseSwaggerSchema = z.object({
  data: z.array(MemoryAuditEntrySwaggerSchema),
  meta: z.object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    total: z.number().int().min(0),
    totalPages: z.number().int().min(0),
  }),
});

export class MemoryAuditListResponseSwaggerDto extends createZodDto(
  MemoryAuditListResponseSwaggerSchema,
) {}

export type MemoryAuditEntryDto = z.infer<
  typeof MemoryAuditEntrySwaggerSchema
>;

export interface MemoryAuditQueryRow {
  id: string;
  instanceId: string;
  nodeId: string;
  nodeName: string;
  version: number;
  content: string;
  reviewStatus: 'pending' | 'approved' | 'rejected';
  patchSummary: string | null;
  createdBy: string | null;
  createdAt: Date;
  actor: string | null;
  previousValue: string | null;
}

export function serializeMemoryAuditEntry(
  row: MemoryAuditQueryRow,
): MemoryAuditEntryDto {
  const operationType =
    row.patchSummary?.startsWith('rollback:') === true
      ? 'rollback'
      : row.version === 1
        ? 'create'
        : 'update';

  return {
    id: row.id,
    instanceId: row.instanceId,
    nodeId: row.nodeId,
    nodeName: row.nodeName,
    versionId: row.id,
    operationType,
    // memory_versions.created_by 保存认证用户 ID；无法关联资料时仍展示该真实标识。
    actor: row.actor ?? row.createdBy ?? 'system',
    actorId: row.createdBy ?? 'system',
    timestamp: row.createdAt.toISOString(),
    changeSummary: row.patchSummary ?? '',
    previousValue: row.previousValue,
    currentValue: row.content,
    reviewStatus: row.reviewStatus,
    metadata: {},
  };
}

// --------------- Audit / Review ---------------

export const ListAuditLogQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    page_size: z.coerce.number().int().min(1).max(100).optional(),
  })
  .transform((v) => ({
    page: v.page,
    pageSize: v.pageSize ?? v.page_size ?? 20,
  }));

export class ListAuditLogQueryDto extends createZodDto(
  ListAuditLogQuerySchema,
) {}

export const ReviewVersionSchema = z.object({
  action: z.enum(['approve', 'reject']),
});

export class ReviewVersionDto extends createZodDto(ReviewVersionSchema) {}

export const ListPendingReviewsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    page_size: z.coerce.number().int().min(1).max(100).optional(),
  })
  .transform((v) => ({
    page: v.page,
    pageSize: v.pageSize ?? v.page_size ?? 20,
  }));

export class ListPendingReviewsQueryDto extends createZodDto(
  ListPendingReviewsQuerySchema,
) {}
