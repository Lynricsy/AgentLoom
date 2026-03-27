import { z } from 'zod';

// -- Agent Graph Node --

export const AgentGraphNodeSchema = z.object({
  id: z.string(),
  nodeId: z.string(),
  nodeName: z.string(),
  nodeType: z.string(),
  executionStatus: z.string(),
  evidenceCount: z.number().int().nonnegative(),
  firstEvidenceAt: z.string().nullable(),
  lastEvidenceAt: z.string().nullable(),
});

export type AgentGraphNode = z.infer<typeof AgentGraphNodeSchema>;

// -- Agent Graph Edge --

export const AgentGraphEdgeSchema = z.object({
  id: z.string(),
  sourceNodeId: z.string(),
  targetNodeId: z.string(),
  evidenceLinks: z.number().int().nonnegative(),
  dataTypeSummary: z.string(),
});

export type AgentGraphEdge = z.infer<typeof AgentGraphEdgeSchema>;

// -- Graph Timeline Entry --

export const GraphTimelineEntrySchema = z.object({
  timestamp: z.string(),
  type: z.enum(['node', 'edge']),
  targetId: z.string(),
  label: z.string(),
});

export type GraphTimelineEntry = z.infer<typeof GraphTimelineEntrySchema>;

// -- Evidence Graph Response --

export const EvidenceGraphResponseSchema = z.object({
  nodes: z.array(AgentGraphNodeSchema),
  edges: z.array(AgentGraphEdgeSchema),
  timeline: z.array(GraphTimelineEntrySchema),
});

export type EvidenceGraphResponse = z.infer<typeof EvidenceGraphResponseSchema>;
