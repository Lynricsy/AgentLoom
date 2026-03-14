import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useParams } from '@tanstack/react-router'
import { useAuthToken } from '@/features/execution/hooks/useAuthToken'
import { CelebrationEffect } from '@/features/execution/components/CelebrationEffect'
import { useExecutionMonitor } from '@/features/execution/hooks/useExecutionMonitor'
import { useStartExecution } from '@/features/execution/hooks/useStartExecution'
import { ExecutionHistoryPanel } from '@/features/execution/components/ExecutionHistoryPanel'
import { TriggerTab } from '@/features/trigger'
import {
  useExecutionId,
  useIsExecutionActive,
  useExecutionStatus,
} from '@/features/execution/stores/executionStore'
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
  const isExecutionActive = useIsExecutionActive()
  const executionStatus = useExecutionStatus()
  const authToken = useAuthToken()
  const { startExecution, isStarting } = useStartExecution()
  useExecutionMonitor({ executionId: activeExecutionId, tenantId: workflow?.tenantId, authToken })

  const handleRunWorkflow = useCallback(async () => {
    if (!workflowId || isStarting || isExecutionActive) return
    try {
      await startExecution(workflowId)
    } catch {
      // mutation error 已通过 useStartExecution 暴露
    }
  }, [workflowId, isStarting, isExecutionActive, startExecution])

  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false)
  const [isExecutionHistoryOpen, setIsExecutionHistoryOpen] = useState(false)
  const [isTriggerPanelOpen, setIsTriggerPanelOpen] = useState(false)
  const [isPublishSheetOpen, setIsPublishSheetOpen] = useState(false)
  const [publishVersionId, setPublishVersionId] = useState<string | null>(null)
  const handleOpenVersionHistory = useCallback(() => setIsVersionHistoryOpen(true), [])
  const handleCloseVersionHistory = useCallback(() => setIsVersionHistoryOpen(false), [])
  const handleToggleExecutionHistory = useCallback(() => {
    setIsExecutionHistoryOpen((current) => !current)
  }, [])
  const handleToggleTriggerPanel = useCallback(() => {
    setIsTriggerPanelOpen((current) => !current)
  }, [])
  const handleCloseTriggerPanel = useCallback(() => {
    setIsTriggerPanelOpen(false)
  }, [])
  const handleCloseExecutionHistory = useCallback(() => {
    setIsExecutionHistoryOpen(false)
  }, [])
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
        {workflow ? (
          <CelebrationEffect
            workflowId={workflow.id}
            executionId={activeExecutionId}
            executionStatus={executionStatus}
          />
        ) : null}

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
            onToggleTriggers={handleToggleTriggerPanel}
            onRun={handleRunWorkflow}
            isTriggersOpen={isTriggerPanelOpen}
            isRunning={isStarting || isExecutionActive}
          />
        )}

        {workflow && (
          <div className="pointer-events-none absolute left-4 top-4 z-20 flex max-w-[min(420px,calc(100%-2rem))] flex-col gap-3">
            <button
              type="button"
              className="pointer-events-auto inline-flex w-fit items-center gap-2 rounded-full border border-border/70 bg-background/85 px-3 py-2 text-xs font-medium text-foreground shadow-lg backdrop-blur-md transition hover:border-primary/40 hover:text-primary"
              onClick={handleToggleExecutionHistory}
              data-testid="toggle-execution-history"
            >
              {isExecutionHistoryOpen ? '隐藏执行记录' : '查看执行记录'}
            </button>

            {isExecutionHistoryOpen ? (
              <div className="pointer-events-auto h-[min(68vh,640px)] w-[min(420px,calc(100vw-3rem))]">
                <ExecutionHistoryPanel
                  key={workflow.id}
                  workflowDefinitionId={workflow.id}
                  onClose={handleCloseExecutionHistory}
                />
              </div>
            ) : null}

            {isTriggerPanelOpen ? (
              <div className="pointer-events-auto w-[min(480px,calc(100vw-3rem))]">
                <div className="mb-2 flex justify-end">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/85 px-3 py-2 text-xs font-medium text-foreground shadow-lg backdrop-blur-md transition hover:border-primary/40 hover:text-primary"
                    onClick={handleCloseTriggerPanel}
                    data-testid="close-trigger-panel"
                  >
                    <X className="h-3.5 w-3.5" />
                    收起触发器
                  </button>
                </div>

                <div className="h-[min(76vh,720px)]">
                  <TriggerTab
                    workflowId={workflow.id}
                    isPublished={workflow.status === 'published'}
                  />
                </div>
              </div>
            ) : null}
          </div>
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
