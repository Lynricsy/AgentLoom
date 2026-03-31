import { z } from 'zod';

const versionSnapshotSchema = z.object({
  nodes: z.array(z.any()),
  edges: z.array(z.any()),
  viewport: z.any().nullable(),
  metadata: z.object({
    nodeCount: z.number(),
    edgeCount: z.number(),
    createdFromVersion: z.number(),
    releaseNotes: z.string().nullable().optional(),
    releaseNumber: z.number().int().nullable().optional(),
  }),
});

export const versionResponseSchema = z.object({
  id: z.string().uuid(),
  workflowDefinitionId: z.string().uuid(),
  versionNumber: z.number().int(),
  releaseNumber: z.number().int().nullable(),
  label: z.string().nullable(),
  snapshot: versionSnapshotSchema,
  publishedAt: z.string().nullable(),
  archivedAt: z.string().nullable(),
  createdBy: z.string().uuid(),
  createdAt: z.string(),
});

export type VersionResponseDto = z.infer<typeof versionResponseSchema>;

export interface PublishWarning {
  code: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourcePort: { name: string; dataType: string };
  targetPort: { name: string; dataType: string };
  message: string;
}

export interface PublishResult {
  data: VersionResponseDto;
  warnings: PublishWarning[];
}
