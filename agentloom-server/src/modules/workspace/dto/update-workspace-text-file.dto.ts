import { z } from 'zod';

export const UpdateWorkspaceTextFileSchema = z.object({
  content: z.string(),
});

export type UpdateWorkspaceTextFileDto = z.infer<
  typeof UpdateWorkspaceTextFileSchema
>;
