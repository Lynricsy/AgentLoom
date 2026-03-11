import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { testMcpConnectionSchema } from './test-mcp-connection.dto';

export class ImportMcpToolsDto extends createZodDto(
  z.object({
    serverName: z.string().min(1, '服务器名称不能为空'),
    serverDescription: z.string().optional(),
    connection: testMcpConnectionSchema,
    toolNames: z.array(z.string().min(1)).min(1, '至少需要选择一个工具'),
  }),
) {}

export const portMappingSchema = z.object({
  name: z.string(),
  dataType: z.enum([
    'model',
    'text',
    'json',
    'image',
    'audio',
    'tool',
    'sandbox',
    'knowledge',
  ]),
  description: z.string().optional(),
  required: z.boolean().optional(),
});

export const importedToolSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  portMappingMetadata: z
    .object({
      inputs: z.array(portMappingSchema),
      outputs: z.array(portMappingSchema),
    })
    .optional(),
});

export const importMcpToolsResponseSchema = z.object({
  mcpServerConfigId: z.string().uuid(),
  imported: z.array(importedToolSchema),
});

export type ImportMcpToolsResponse = z.infer<
  typeof importMcpToolsResponseSchema
>;
export type PortMapping = z.infer<typeof portMappingSchema>;
