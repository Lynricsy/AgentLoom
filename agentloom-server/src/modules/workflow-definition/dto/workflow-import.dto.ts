import { z } from 'zod';

import { WORKFLOW_EXPORT_VERSION } from './workflow-export.dto';

const passthroughObjectSchema = z.record(z.string(), z.unknown());

export const ImportWorkflowSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  file_content: z.object({
    schema_version: z.literal(WORKFLOW_EXPORT_VERSION),
    exported_at: z.string(),
    workflow: z.object({
      name: z.string(),
      description: z.string().nullable(),
      definition: z.object({
        nodes: z.array(passthroughObjectSchema),
        edges: z.array(passthroughObjectSchema),
        viewport: passthroughObjectSchema,
      }),
      input_schema: z.unknown().nullable(),
    }),
  }),
});

export type ImportWorkflowDto = z.infer<typeof ImportWorkflowSchema>;
