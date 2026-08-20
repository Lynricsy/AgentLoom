import { z } from 'zod';

/**
 * 工作流画布图结构。
 *
 * 字段集抄录 server 的 canonical 定义
 * (`agentloom-server/src/database/schema/workflow-definitions.schema.ts` 的
 * `ReactFlowNode` / `ReactFlowEdge` / `ReactFlowViewport`)，不新增字段。
 * 唯一放宽处：`data` 声明为可选，以接受历史画布数据中缺失该键的节点；
 * server 当前写入路径始终填充 `data`。
 */

const JsonRecordSchema = z.record(z.string(), z.unknown());

export const WorkflowGraphPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const HandlePositionSchema = z.enum(['top', 'right', 'bottom', 'left']);

export const WorkflowGraphNodeSchema = z.object({
  id: z.string(),
  type: z.string().optional(),
  position: WorkflowGraphPositionSchema,
  data: JsonRecordSchema.optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  selected: z.boolean().optional(),
  dragging: z.boolean().optional(),
  parentId: z.string().optional(),
  expandParent: z.boolean().optional(),
  extent: z
    .union([
      z.literal('parent'),
      z.tuple([WorkflowGraphPositionSchema, WorkflowGraphPositionSchema]),
    ])
    .optional(),
  sourcePosition: HandlePositionSchema.optional(),
  targetPosition: HandlePositionSchema.optional(),
  hidden: z.boolean().optional(),
  zIndex: z.number().optional(),
  className: z.string().optional(),
  style: JsonRecordSchema.optional(),
});

export const WorkflowGraphEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
  type: z.string().optional(),
  animated: z.boolean().optional(),
  data: JsonRecordSchema.optional(),
  selected: z.boolean().optional(),
  hidden: z.boolean().optional(),
  label: z.string().optional(),
  labelStyle: JsonRecordSchema.optional(),
  labelBgStyle: JsonRecordSchema.optional(),
  style: JsonRecordSchema.optional(),
  className: z.string().optional(),
  zIndex: z.number().optional(),
  markerStart: z.union([z.string(), JsonRecordSchema]).optional(),
  markerEnd: z.union([z.string(), JsonRecordSchema]).optional(),
});

export const WorkflowGraphViewportSchema = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number(),
});

/** viewport 列本身可为空（`workflow_definitions.viewport` 无 notNull）。 */
export const NullableWorkflowGraphViewportSchema =
  WorkflowGraphViewportSchema.nullable();

export const WorkflowGraphSchema = z.object({
  nodes: z.array(WorkflowGraphNodeSchema),
  edges: z.array(WorkflowGraphEdgeSchema),
  viewport: NullableWorkflowGraphViewportSchema.optional(),
});

export type WorkflowGraphPosition = z.infer<typeof WorkflowGraphPositionSchema>;
export type WorkflowGraphNode = z.infer<typeof WorkflowGraphNodeSchema>;
export type WorkflowGraphEdge = z.infer<typeof WorkflowGraphEdgeSchema>;
export type WorkflowGraphViewport = z.infer<typeof WorkflowGraphViewportSchema>;
export type WorkflowGraph = z.infer<typeof WorkflowGraphSchema>;
