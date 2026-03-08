import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { testMcpConnectionSchema } from './test-mcp-connection.dto';

export class DiscoverMcpToolsDto extends createZodDto(
  z.object({
    connection: testMcpConnectionSchema,
  }),
) {}

export const discoveredToolSchema = z.object({
  name: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
  annotations: z.record(z.string(), z.unknown()).optional(),
});

export const discoverMcpToolsResponseSchema = z.object({
  tools: z.array(discoveredToolSchema),
  serverInfo: z
    .object({
      name: z.string(),
      version: z.string(),
    })
    .optional(),
});

export type DiscoverMcpToolsResponse = z.infer<
  typeof discoverMcpToolsResponseSchema
>;
export type DiscoveredTool = z.infer<typeof discoveredToolSchema>;
