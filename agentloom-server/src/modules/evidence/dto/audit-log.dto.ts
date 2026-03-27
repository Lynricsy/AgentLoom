import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { auditActorTypes } from '../../../database/schema/audit-logs.schema';

const PageSizeSchema = z.coerce.number().int().min(1).max(100).optional();
const NonEmptyStringSchema = z.string().trim().min(1).optional();
const AuditActorTypeSchema = z.enum(auditActorTypes).optional();
const IsoDateCoerceSchema = z
  .string()
  .datetime({ offset: true, message: 'Invalid ISO datetime' })
  .pipe(z.coerce.date())
  .optional();

export const ListAuditLogsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: PageSizeSchema,
    page_size: PageSizeSchema,
    from: IsoDateCoerceSchema,
    to: IsoDateCoerceSchema,
    eventType: NonEmptyStringSchema,
    event_type: NonEmptyStringSchema,
    resourceType: NonEmptyStringSchema,
    resource_type: NonEmptyStringSchema,
    resourceId: NonEmptyStringSchema,
    resource_id: NonEmptyStringSchema,
    executionId: z.uuid().optional(),
    execution_id: z.uuid().optional(),
    actorType: AuditActorTypeSchema,
    actor_type: AuditActorTypeSchema,
    actorId: z.uuid().optional(),
    actor_id: z.uuid().optional(),
  })
  .transform((value) => ({
    page: value.page,
    pageSize: value.pageSize ?? value.page_size ?? 20,
    ...(value.from ? { from: value.from } : {}),
    ...(value.to ? { to: value.to } : {}),
    ...((value.eventType ?? value.event_type)
      ? { eventType: value.eventType ?? value.event_type }
      : {}),
    ...((value.resourceType ?? value.resource_type)
      ? { resourceType: value.resourceType ?? value.resource_type }
      : {}),
    ...((value.resourceId ?? value.resource_id)
      ? { resourceId: value.resourceId ?? value.resource_id }
      : {}),
    ...((value.executionId ?? value.execution_id)
      ? { executionId: value.executionId ?? value.execution_id }
      : {}),
    ...((value.actorType ?? value.actor_type)
      ? { actorType: value.actorType ?? value.actor_type }
      : {}),
    ...((value.actorId ?? value.actor_id)
      ? { actorId: value.actorId ?? value.actor_id }
      : {}),
  }));

export type ListAuditLogsQuery = z.infer<typeof ListAuditLogsQuerySchema>;

export class ListAuditLogsQueryDto extends createZodDto(
  ListAuditLogsQuerySchema,
) {}
