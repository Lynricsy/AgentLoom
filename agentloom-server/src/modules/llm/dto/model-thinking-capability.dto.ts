import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { AgentThinkingLevelSchema } from '../../agent-definition/agent-runtime-config.interface';

const ThinkingCapabilitySourceSchema = z.enum(['litellm', 'pi-catalog']);

export const ModelThinkingCapabilitySchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('supported'),
    /** 模型可选的思考强度，按词表顺序；仅当模型可关闭思考时包含 off */
    levels: z.array(AgentThinkingLevelSchema).min(1),
    defaultLevel: AgentThinkingLevelSchema.nullable(),
    source: ThinkingCapabilitySourceSchema,
  }),
  z.object({
    status: z.literal('unsupported'),
    source: ThinkingCapabilitySourceSchema,
  }),
  z.object({ status: z.literal('unknown') }),
]);

export const ModelThinkingCapabilityResponseSchema = z.object({
  data: ModelThinkingCapabilitySchema,
});

export class ModelThinkingCapabilityResponseDto extends createZodDto(
  ModelThinkingCapabilityResponseSchema,
) {}
