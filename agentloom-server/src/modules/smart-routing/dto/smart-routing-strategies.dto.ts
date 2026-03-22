import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const RouterCategorySchema = z.enum(['simple', 'ml', 'rag', 'plugin']);

export const JsonSchemaObjectSchema = z.object({}).catchall(z.unknown());

export const SmartRoutingStrategySchema = z.object({
  name: z.string().min(1),
  category: RouterCategorySchema,
  requiresEmbedding: z.boolean(),
  configSchema: JsonSchemaObjectSchema,
});

export const SmartRoutingStrategiesResponseSchema = z.object({
  data: z.array(SmartRoutingStrategySchema),
});

export class SmartRoutingStrategiesResponseDto extends createZodDto(
  SmartRoutingStrategiesResponseSchema,
) {}

export const SmartRoutingStrategyConfigSchemaResponseSchema = z.object({
  data: z.object({
    name: z.string().min(1),
    configSchema: JsonSchemaObjectSchema,
  }),
});

export class SmartRoutingStrategyConfigSchemaResponseDto extends createZodDto(
  SmartRoutingStrategyConfigSchemaResponseSchema,
) {}

export type SmartRoutingStrategyDto = z.infer<typeof SmartRoutingStrategySchema>;
export type SmartRoutingStrategiesResponseDtoType = z.infer<
  typeof SmartRoutingStrategiesResponseSchema
>;
export type SmartRoutingStrategyConfigSchemaResponseDtoType = z.infer<
  typeof SmartRoutingStrategyConfigSchemaResponseSchema
>;
