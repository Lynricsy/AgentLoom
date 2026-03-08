import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const stdioTransportSchema = z.object({
  transportType: z.literal('stdio'),
  command: z.string().min(1, 'command 不能为空'),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

const sseTransportSchema = z.object({
  transportType: z.literal('sse'),
  url: z.url({ error: 'url 格式不正确' }),
  headers: z.record(z.string(), z.string()).optional(),
});

const streamableHttpTransportSchema = z.object({
  transportType: z.literal('streamable_http'),
  url: z.url({ error: 'url 格式不正确' }),
  headers: z.record(z.string(), z.string()).optional(),
});

export const testMcpConnectionSchema = z.discriminatedUnion('transportType', [
  stdioTransportSchema,
  sseTransportSchema,
  streamableHttpTransportSchema,
]);

export class TestMcpConnectionDto extends createZodDto(
  z.object({
    connection: testMcpConnectionSchema,
  }),
) {}

export const testMcpConnectionResponseSchema = z.object({
  success: z.boolean(),
  serverInfo: z
    .object({
      name: z.string(),
      version: z.string(),
      protocolVersion: z.string().optional(),
    })
    .optional(),
});

export type TestMcpConnectionResponse = z.infer<
  typeof testMcpConnectionResponseSchema
>;
