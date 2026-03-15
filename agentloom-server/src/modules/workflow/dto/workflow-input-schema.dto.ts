import { z } from 'zod';

export const inputFieldValidationSchema = z.object({
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().positive().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
});

export const inputFieldVisibilitySchema = z.object({
  fieldId: z.string().min(1),
  equals: z.union([z.string(), z.number()]),
});

export const inputFieldDefinitionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['text', 'number', 'single_select', 'multi_select']),
  label: z.string().min(1),
  description: z.string().optional(),
  required: z.boolean().default(false),
  validation: inputFieldValidationSchema.optional(),
  options: z.array(z.string()).optional(),
  default: z.unknown().optional(),
  visibility: inputFieldVisibilitySchema.optional(),
});

export const collectionModeSchema = z.enum(['form', 'conversation', 'hybrid']);

export const workflowInputSchemaSchema = z.object({
  version: z.number().int().positive().default(1),
  collectionMode: collectionModeSchema.default('form'),
  fields: z.array(inputFieldDefinitionSchema).default([]),
}).superRefine((schema, ctx) => {
  const fieldIds = new Set(schema.fields.map((field) => field.id));

  schema.fields.forEach((field, index) => {
    const visibilityFieldId = field.visibility?.fieldId;

    if (visibilityFieldId && !fieldIds.has(visibilityFieldId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fields', index, 'visibility', 'fieldId'],
        message: '可见性规则必须引用已存在的字段 ID',
      });
    }
  });
});

export type WorkflowInputSchema = z.infer<typeof workflowInputSchemaSchema>;
export type InputFieldDefinition = z.infer<typeof inputFieldDefinitionSchema>;
export type InputFieldVisibility = z.infer<typeof inputFieldVisibilitySchema>;
export type CollectionMode = z.infer<typeof collectionModeSchema>;
