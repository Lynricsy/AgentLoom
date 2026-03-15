import { z } from 'zod';

export const WORKFLOW_EXPORT_VERSION = 'agentloom-workflow-v1';

export const WorkflowExportSchema = z.object({
  schema_version: z.literal(WORKFLOW_EXPORT_VERSION),
  exported_at: z.iso.datetime(),
  workflow: z.object({
    name: z.string(),
    description: z.string().nullable(),
    definition: z.object({
      nodes: z.array(z.any()),
      edges: z.array(z.any()),
      viewport: z.any(),
    }),
    input_schema: z.any().nullable(),
  }),
});

export type WorkflowExportDto = z.infer<typeof WorkflowExportSchema>;
