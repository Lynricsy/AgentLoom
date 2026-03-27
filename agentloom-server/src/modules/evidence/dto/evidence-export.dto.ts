import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const EvidenceExportFilterInputSchema = z
  .object({
    workflowId: z.string().uuid().optional(),
    workflow_id: z.string().uuid().optional(),
    executionId: z.string().uuid().optional(),
    execution_id: z.string().uuid().optional(),
    executionIds: z.array(z.string().uuid()).optional(),
    execution_ids: z.array(z.string().uuid()).optional(),
    resourceType: z.string().min(1).optional(),
    resource_type: z.string().min(1).optional(),
    resourceId: z.string().min(1).optional(),
    resource_id: z.string().min(1).optional(),
    eventType: z.string().min(1).optional(),
    event_type: z.string().min(1).optional(),
    actorType: z.enum(['user', 'system', 'service']).optional(),
    actor_type: z.enum(['user', 'system', 'service']).optional(),
    actorId: z.string().uuid().optional(),
    actor_id: z.string().uuid().optional(),
    includeAuditMetadata: z.boolean().optional(),
    include_audit_metadata: z.boolean().optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  })
  .transform((value) => {
    const executionIds =
      value.executionIds ??
      value.execution_ids ??
      (value.executionId
        ? [value.executionId]
        : value.execution_id
          ? [value.execution_id]
          : undefined);

    return {
      workflowId: value.workflowId ?? value.workflow_id,
      executionIds,
      resourceType: value.resourceType ?? value.resource_type,
      resourceId: value.resourceId ?? value.resource_id,
      eventType: value.eventType ?? value.event_type,
      actorType: value.actorType ?? value.actor_type,
      actorId: value.actorId ?? value.actor_id,
      includeAuditMetadata:
        value.includeAuditMetadata ?? value.include_audit_metadata,
      from: value.from,
      to: value.to,
    };
  });

export const CreateEvidenceExportJobSchema =
  EvidenceExportFilterInputSchema.transform((filters) => ({ filters }));

export type EvidenceExportFiltersDto = z.infer<
  typeof EvidenceExportFilterInputSchema
>;
export type CreateEvidenceExportJobDto = z.infer<
  typeof CreateEvidenceExportJobSchema
>;

export class CreateEvidenceExportJobBodyDto extends createZodDto(
  CreateEvidenceExportJobSchema,
) {}
