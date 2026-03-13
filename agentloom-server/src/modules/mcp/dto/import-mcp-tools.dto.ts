import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { testMcpConnectionSchema } from './test-mcp-connection.dto';

export const mcpImportConflictStrategySchema = z.enum(['skip', 'overwrite']);

export const mcpImportToolNamesSchema = z
  .array(z.string().min(1))
  .min(1, '至少需要选择一个工具');

export class ImportMcpToolsDto extends createZodDto(
  z.object({
    serverName: z.string().min(1, '服务器名称不能为空'),
    serverDescription: z.string().optional(),
    connection: testMcpConnectionSchema,
    toolNames: mcpImportToolNamesSchema,
    conflictStrategy: mcpImportConflictStrategySchema,
  }),
) {}

export class ReimportMcpToolsDto extends createZodDto(
  z.object({
    toolNames: mcpImportToolNamesSchema,
    conflictStrategy: mcpImportConflictStrategySchema,
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

export const importedToolStatusSchema = z.enum([
  'imported',
  'overwritten',
  'skipped',
  'failed',
]);

export const importedToolSchema = z.object({
  toolDefinitionId: z.string().uuid().optional(),
  toolName: z.string(),
  status: importedToolStatusSchema,
  title: z.string().optional(),
  description: z.string().optional(),
  portMappingMetadata: z
    .object({
      inputs: z.array(portMappingSchema),
      outputs: z.array(portMappingSchema),
    })
    .optional(),
  reasonCode: z.string().optional(),
  reasonMessage: z.string().optional(),
});

export const importMcpToolsSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  imported: z.number().int().nonnegative(),
  overwritten: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});

export const importMcpToolsResponseSchema = z.object({
  mcpServerConfigId: z.string().uuid(),
  summary: importMcpToolsSummarySchema,
  results: z.array(importedToolSchema),
});

export type ImportMcpToolsResponse = z.infer<
  typeof importMcpToolsResponseSchema
>;
export type PortMapping = z.infer<typeof portMappingSchema>;
export type ImportedToolResult = z.infer<typeof importedToolSchema>;
