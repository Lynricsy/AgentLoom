import { useCallback, useEffect, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useWorkflow } from '@/features/workflow'
import { VersionHistoryPanel } from '@/features/workflow/components/VersionHistoryPanel'
import { NodePalette } from './NodePalette'
import { WorkflowCanvas } from './WorkflowCanvas'
import { WorkflowStatusBar } from './status/WorkflowStatusBar'
import { FieldMappingPanel } from './panels/FieldMappingPanel'
import { VersionToolbar } from './toolbar/VersionToolbar'
import { useAutoSave } from '../hooks/useAutoSave'
import {
  useCanvasActions,
  useCanvasStore,
  useMappingPanelEdgeId,
} from '../stores/canvasStore'

export function WorkflowCanvasPage() {
  const { workflowId } = useParams({ from: '/workflows/$workflowId' })
  const currentWorkflowId = useCanvasStore((state) => state.workflowId)
  const { applyServerSnapshot, reset, closeFieldMapping, updateFieldMapping } = useCanvasActions()
  const mappingPanelEdgeId = useMappingPanelEdgeId()

  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false)
  const handleOpenVersionHistory = useCallback(() => setIsVersionHistoryOpen(true), [])
  const handleCloseVersionHistory = useCallback(() => setIsVersionHistoryOpen(false), [])

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
        <WorkflowStatusBar />

        {workflow && (
          <VersionToolbar
            workflowId={workflowId}
            workflowStatus={workflow.status}
            onOpenVersionHistory={handleOpenVersionHistory}
          />
        )}
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

      {workflow && (
        <VersionHistoryPanel
          open={isVersionHistoryOpen}
          workflowId={workflowId}
          workflowStatus={workflow.status}
          onClose={handleCloseVersionHistory}
        />
      )}
    </div>
  )
}
