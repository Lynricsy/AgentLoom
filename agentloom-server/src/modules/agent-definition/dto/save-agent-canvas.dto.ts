import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const ReactFlowNodeSchema = z.record(z.string(), z.unknown());
const ReactFlowEdgeSchema = z.record(z.string(), z.unknown());
const ReactFlowViewportSchema = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number(),
});

export const SaveAgentCanvasSchema = z.object({
  canvasNodes: z
    .array(ReactFlowNodeSchema)
    .min(0, { message: 'canvasNodes 必须为数组' }),

  canvasEdges: z
    .array(ReactFlowEdgeSchema)
    .min(0, { message: 'canvasEdges 必须为数组' }),

  canvasViewport: ReactFlowViewportSchema.optional(),

  globalSandboxConfig: z.record(z.string(), z.unknown()).optional(),

  inputSchema: z.record(z.string(), z.unknown()).optional(),

  runtimeConfig: z.record(z.string(), z.unknown()).optional(),
});

export class SaveAgentCanvasDto extends createZodDto(SaveAgentCanvasSchema) {}
