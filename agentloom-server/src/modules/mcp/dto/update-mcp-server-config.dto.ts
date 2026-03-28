import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const stdioConnectionSchema = z.object({
  transportType: z.literal('stdio'),
  command: z.string().min(1, 'command 不能为空'),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

const sseConnectionSchema = z.object({
  transportType: z.literal('sse'),
  url: z.url({ error: 'url 格式不正确' }),
  headers: z.record(z.string(), z.string()).optional(),
});

const streamableHttpConnectionSchema = z.object({
  transportType: z.literal('streamable_http'),
  url: z.url({ error: 'url 格式不正确' }),
  headers: z.record(z.string(), z.string()).optional(),
});

export const UpdateMcpServerConfigSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  connection: z
    .discriminatedUnion('transportType', [
      stdioConnectionSchema,
      sseConnectionSchema,
      streamableHttpConnectionSchema,
    ])
    .optional(),
});

export class UpdateMcpServerConfigDto extends createZodDto(
  UpdateMcpServerConfigSchema,
) {}

export type UpdateMcpServerConfigType = z.infer<
  typeof UpdateMcpServerConfigSchema
>;
