import { useEffect } from 'react'
import { useParams } from '@tanstack/react-router'
import { useWorkflow } from '@/features/workflow'
import { NodePalette } from './NodePalette'
import { WorkflowCanvas } from './WorkflowCanvas'
import { FieldMappingPanel } from './panels/FieldMappingPanel'
import { useAutoSave } from '../hooks/useAutoSave'
import {
  useCanvasActions,
  useCanvasSaveStatus,
  useCanvasStore,
  useMappingPanelEdgeId,
} from '../stores/canvasStore'

export function WorkflowCanvasPage() {
  const { workflowId } = useParams({ from: '/workflows/$workflowId' })
  const currentWorkflowId = useCanvasStore((state) => state.workflowId)
  const { applyServerSnapshot, reset, closeFieldMapping, updateFieldMapping } = useCanvasActions()
  const { isDirty, isSaving, lastSavedAt } = useCanvasSaveStatus()
  const mappingPanelEdgeId = useMappingPanelEdgeId()

  const mappingPanelEdge = useCanvasStore((s) =>
    mappingPanelEdgeId ? s.edges.find((e) => e.id === mappingPanelEdgeId) ?? null : null
  )
  const mappingSourceNode = useCanvasStore((s) =>
    mappingPanelEdge ? s.nodes.find((n) => n.id === mappingPanelEdge.source) ?? null : null
  )
  const mappingTargetNode = useCanvasStore((s) =>
    mappingPanelEdge ? s.nodes.find((n) => n.id === mappingPanelEdge.target) ?? null : null
  )

  const { data: workflow, isLoading, error } = useWorkflow(workflowId)

  useAutoSave(workflowId)

  useEffect(() => {
    if (!workflow || workflow.id === currentWorkflowId) {
      return
    }

    applyServerSnapshot({
      nodes: workflow.nodes ?? [],
      edges: workflow.edges ?? [],
      viewport: workflow.viewport ?? undefined,
      workflowId: workflow.id,
      version: workflow.version,
    })
  }, [workflow, currentWorkflowId, applyServerSnapshot])

  useEffect(() => {
    return () => {
      reset()
    }
  }, [reset])

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted">加载工作流中...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-error">加载失败: {error.message}</p>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full">
      <NodePalette />

      <div className="relative flex-1">
        <WorkflowCanvas className="h-full w-full" />

        <div className="absolute bottom-3 right-3 flex items-center gap-2 rounded-md bg-surface/80 px-3 py-1.5 text-xs text-muted backdrop-blur-sm">
          {isSaving && <span className="animate-pulse">保存中...</span>}
          {!isSaving && isDirty && <span>● 未保存</span>}
          {!isSaving && !isDirty && lastSavedAt && (
            <span>✓ 已保存 {lastSavedAt.toLocaleTimeString('zh-CN')}</span>
          )}
        </div>
      </div>

      {mappingPanelEdgeId && mappingPanelEdge && (
        <FieldMappingPanel
          open={!!mappingPanelEdgeId}
          edgeId={mappingPanelEdgeId}
          edge={mappingPanelEdge}
          sourceNode={mappingSourceNode}
          targetNode={mappingTargetNode}
          onClose={closeFieldMapping}
          onChange={updateFieldMapping}
        />
      )}
    </div>
  )
}
