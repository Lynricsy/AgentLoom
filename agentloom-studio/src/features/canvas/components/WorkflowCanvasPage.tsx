import { useCallback, useEffect, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useExecutionId } from '@/features/execution/stores/executionStore'
import { useExecutionMonitor } from '@/features/execution/hooks/useExecutionMonitor'
import { useWorkflow } from '@/features/workflow'
import { PublishSheet } from '@/features/workflow/components/PublishSheet'
import { VersionHistoryPanel } from '@/features/workflow/components/VersionHistoryPanel'
import { NodePalette } from './NodePalette'
import { WorkflowCanvas } from './WorkflowCanvas'
import { WorkflowStatusBar } from './status/WorkflowStatusBar'
import { FieldMappingPanel } from './panels/FieldMappingPanel'
import { NodeConfigPanel } from './panels/NodeConfigPanel'
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
  const currentCanvasVersion = useCanvasStore((state) => state.version)
  const { applyServerSnapshot, reset, closeFieldMapping, updateFieldMapping } = useCanvasActions()
  const mappingPanelEdgeId = useMappingPanelEdgeId()
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId)

  const { data: workflow, isLoading, error } = useWorkflow(workflowId)
  const isWorkflowArchived = workflow?.status === 'archived'

  const activeExecutionId = useExecutionId() ?? undefined
  useExecutionMonitor({ executionId: activeExecutionId, tenantId: workflow?.tenantId })

  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false)
  const [isPublishSheetOpen, setIsPublishSheetOpen] = useState(false)
  const [publishVersionId, setPublishVersionId] = useState<string | null>(null)
  const handleOpenVersionHistory = useCallback(() => setIsVersionHistoryOpen(true), [])
  const handleCloseVersionHistory = useCallback(() => setIsVersionHistoryOpen(false), [])
  const handleOpenPublishSheet = useCallback((versionId?: string) => {
    setPublishVersionId(versionId ?? null)
    setIsPublishSheetOpen(true)
  }, [])
  const handlePublishSheetOpenChange = useCallback((open: boolean) => {
    setIsPublishSheetOpen(open)
    if (!open) {
      setPublishVersionId(null)
    }
  }, [])

  const mappingPanelEdge = useCanvasStore((s) =>
    mappingPanelEdgeId ? s.edges.find((e) => e.id === mappingPanelEdgeId) ?? null : null
  )
  const mappingSourceNode = useCanvasStore((s) =>
    mappingPanelEdge ? s.nodes.find((n) => n.id === mappingPanelEdge.source) ?? null : null
  )
  const mappingTargetNode = useCanvasStore((s) =>
    mappingPanelEdge ? s.nodes.find((n) => n.id === mappingPanelEdge.target) ?? null : null
  )

  useAutoSave(workflowId, workflow?.status)

  useEffect(() => {
    if (!workflow) {
      return
    }

    const shouldApplySnapshot =
      workflow.id !== currentWorkflowId || workflow.version !== currentCanvasVersion

    if (!shouldApplySnapshot) {
      return
    }

    applyServerSnapshot({
      nodes: workflow.nodes ?? [],
      edges: workflow.edges ?? [],
      viewport: workflow.viewport ?? undefined,
      workflowId: workflow.id,
      version: workflow.version,
    })
  }, [workflow, currentWorkflowId, currentCanvasVersion, applyServerSnapshot])

  useEffect(() => {
    return () => {
      reset()
    }
  }, [reset])

  useEffect(() => {
    if (isWorkflowArchived) {
      closeFieldMapping()
    }
  }, [closeFieldMapping, isWorkflowArchived])

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
      {!isWorkflowArchived && <NodePalette />}

      <div className="relative flex-1">
        {workflow && (
          <WorkflowCanvas
            className="h-full w-full"
            workflowStatus={workflow.status}
          />
        )}
        <WorkflowStatusBar />

        {workflow && (
          <VersionToolbar
            workflowId={workflowId}
            workflowStatus={workflow.status}
            onOpenVersionHistory={handleOpenVersionHistory}
            onOpenPublish={handleOpenPublishSheet}
          />
        )}
      </div>

      {!isWorkflowArchived && selectedNodeId && !mappingPanelEdgeId && (
        <NodeConfigPanel />
      )}

      {!isWorkflowArchived && mappingPanelEdgeId && mappingPanelEdge && (
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
          onPublish={handleOpenPublishSheet}
        />
      )}

      {workflow && (
        <PublishSheet
          open={isPublishSheetOpen}
          workflowId={workflowId}
          initialVersionId={publishVersionId}
          onOpenChange={handlePublishSheetOpenChange}
        />
      )}
    </div>
  )
}
