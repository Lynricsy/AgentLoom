import { z } from 'zod';

const installBindingMapSchema = z.record(z.string().min(1), z.string().uuid());

export const WorkflowInstallBindingsSchema = z
  .object({
    llmModels: installBindingMapSchema.optional(),
    llm_models: installBindingMapSchema.optional(),
    workspaces: installBindingMapSchema.optional(),
    sandboxes: installBindingMapSchema.optional(),
  })
  .transform((value) => ({
    llmModels: value.llmModels ?? value.llm_models ?? {},
    workspaces: value.workspaces ?? {},
    sandboxes: value.sandboxes ?? {},
  }));

export type WorkflowInstallBindings = z.infer<
  typeof WorkflowInstallBindingsSchema
>;
