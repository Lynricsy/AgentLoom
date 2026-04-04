import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const resourceSourceResourceTypeValues = [
  'workflow_definition',
  'agent_definition',
  'knowledge_base',
  'memory_instance',
  'mcp_server_config',
  'skill',
] as const;

export const ConvertResourceSourceParamsSchema = z.object({
  resourceType: z.enum(resourceSourceResourceTypeValues),
  resourceId: z.uuid(),
});

export class ConvertResourceSourceParamsDto extends createZodDto(
  ConvertResourceSourceParamsSchema,
) {}
