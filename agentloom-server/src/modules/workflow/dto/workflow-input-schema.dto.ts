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
  collectionHint: z.string().optional(),
});

export const collectionModeSchema = z.enum(['form', 'conversation', 'hybrid']);

export const conversationPlanSchema = z.object({
  systemPrompt: z.string().min(1),
  maxTurns: z.number().int().positive(),
});

export const workflowInputSchemaSchema = z
  .object({
    version: z.number().int().positive().default(1),
    collectionMode: collectionModeSchema.default('form'),
    fields: z.array(inputFieldDefinitionSchema).default([]),
    conversationPlan: conversationPlanSchema.optional(),
  })
  .superRefine((schema, ctx) => {
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

/**
 * 写入（PATCH / 导入）时的一致性校验。读取已存储 schema 仍用宽松的
 * `workflowInputSchemaSchema`，避免历史数据在运行/读取时直接报错。
 */
function refineWorkflowInputSchemaForWrite(
  schema: WorkflowInputSchema,
  ctx: z.RefinementCtx,
): void {
  if (
    (schema.collectionMode === 'conversation' ||
      schema.collectionMode === 'hybrid') &&
    !schema.conversationPlan
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['conversationPlan'],
      message: '对话/混合收集模式必须配置 conversationPlan',
    });
  }

  const seenIds = new Set<string>();
  schema.fields.forEach((field, index) => {
    if (seenIds.has(field.id)) {
      ctx.addIssue({
        code: 'custom',
        path: ['fields', index, 'id'],
        message: `字段 ID「${field.id}」重复`,
      });
    }
    seenIds.add(field.id);

    if (
      (field.type === 'single_select' || field.type === 'multi_select') &&
      (!field.options || field.options.length === 0)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['fields', index, 'options'],
        message: '选择类字段必须提供至少一个选项',
      });
    }

    const validation = field.validation;
    if (
      validation?.minLength !== undefined &&
      validation.maxLength !== undefined &&
      validation.minLength > validation.maxLength
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['fields', index, 'validation', 'minLength'],
        message: 'minLength 不能大于 maxLength',
      });
    }
    if (
      validation?.min !== undefined &&
      validation.max !== undefined &&
      validation.min > validation.max
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['fields', index, 'validation', 'min'],
        message: 'min 不能大于 max',
      });
    }
  });
}

export const workflowInputSchemaWriteSchema =
  workflowInputSchemaSchema.superRefine(refineWorkflowInputSchemaForWrite);

export type WorkflowInputSchema = z.infer<typeof workflowInputSchemaSchema>;
export type InputFieldDefinition = z.infer<typeof inputFieldDefinitionSchema>;
export type InputFieldVisibility = z.infer<typeof inputFieldVisibilitySchema>;
export type CollectionMode = z.infer<typeof collectionModeSchema>;
export type ConversationPlan = z.infer<typeof conversationPlanSchema>;
