import type { EdgeTypes, NodeTypes } from '@xyflow/react'
import { CanvasNodeShell } from './CanvasNode'
import { SmartEdge } from './edges/SmartEdge'

export const WORKFLOW_NODE_TYPES: NodeTypes = {
  agent: CanvasNodeShell,
  tool: CanvasNodeShell,
  trigger: CanvasNodeShell,
  knowledge: CanvasNodeShell,
  memory: CanvasNodeShell,
  output: CanvasNodeShell,
  control: CanvasNodeShell,
  plugin: CanvasNodeShell,
}

export const WORKFLOW_EDGE_TYPES: EdgeTypes = {
  smart: SmartEdge,
}
