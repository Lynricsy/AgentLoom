import { useCallback, useEffect, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useAuthToken } from '@/features/execution/hooks/useAuthToken'
import { CelebrationEffect } from '@/features/execution/components/CelebrationEffect'
import { useExecutionMonitor } from '@/features/execution/hooks/useExecutionMonitor'
import { useStartExecution } from '@/features/execution/hooks/useStartExecution'
import { ExecutionHistoryPanel } from '@/features/execution/components/ExecutionHistoryPanel'
import {
  canManageInterventionPolicies,
  getInterventionPolicyRoleFromToken,
} from '@/features/intervention-policy'
import {
  useExecutionId,
  useIsExecutionActive,
  useExecutionStatus,
} from '@/features/execution/stores/executionStore'
import { useWorkflow } from '@/features/workflow'
import { useExportWorkflow } from '@/features/workflow/api/workflowMutations'
import { downloadWorkflowExport } from '@/features/workflow/lib/workflowExportImport'
import { PublishSheet } from '@/features/workflow/components/PublishSheet'
import { VersionHistoryPanel } from '@/features/workflow/components/VersionHistoryPanel'
import { WorkflowImportDialog } from '@/features/workflow/components/WorkflowImportDialog'
import { ExecutionLaunchDialog } from '@/features/workflow-input-schema/components/ExecutionLaunchDialog'
import { MarketplacePublishDialog } from '@/features/marketplace'
import { ShareManagementDialog } from '@/features/share/components/ShareManagementDialog'
import { NodePalette } from './NodePalette'
import { WorkflowCanvas } from './WorkflowCanvas'
import { WorkflowStatusBar } from './status/WorkflowStatusBar'
import { FieldMappingPanel } from './panels/FieldMappingPanel'
import { NodeConfigPanel } from './panels/NodeConfigPanel'
import {
  WorkflowSettingsPanel,
  type WorkflowSettingsTab,
} from './panels/WorkflowSettingsPanel'
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
  const currentUserRole = getInterventionPolicyRoleFromToken(authToken)
  const canManageWorkflowSettings = canManageInterventionPolicies(currentUserRole)
  const isInterventionPolicyReadOnly = !canManageWorkflowSettings
  const isInputSchemaReadOnly = !canManageWorkflowSettings
  const { startExecution, isStarting } = useStartExecution()
  useExecutionMonitor({ executionId: activeExecutionId, tenantId: workflow?.tenantId, authToken })
  const canPublishToMarketplace =
    !!workflow &&
    workflow.status === 'published' &&
    workflow.publishedVersionId !== null &&
    canManageWorkflowSettings

  const handleRunWorkflow = useCallback(() => {
    if (!workflowId || isStarting || isExecutionActive) return
    setIsExecutionLaunchDialogOpen(true)
  }, [workflowId, isStarting, isExecutionActive])

  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false)
  const [isExecutionHistoryOpen, setIsExecutionHistoryOpen] = useState(false)
  const [isExecutionLaunchDialogOpen, setIsExecutionLaunchDialogOpen] = useState(false)
  const [activeSettingsTab, setActiveSettingsTab] = useState<WorkflowSettingsTab | null>(null)
  const [isPublishSheetOpen, setIsPublishSheetOpen] = useState(false)
  const [publishVersionId, setPublishVersionId] = useState<string | null>(null)
  const [isMarketplacePublishOpen, setIsMarketplacePublishOpen] = useState(false)
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false)

  const exportMutation = useExportWorkflow()
  const handleOpenVersionHistory = useCallback(() => setIsVersionHistoryOpen(true), [])
  const handleCloseVersionHistory = useCallback(() => setIsVersionHistoryOpen(false), [])
  const handleToggleExecutionHistory = useCallback(() => {
    setIsExecutionHistoryOpen((current) => !current)
  }, [])
  const handleToggleWorkflowSettingsTab = useCallback((tab: WorkflowSettingsTab) => {
    setActiveSettingsTab((current) => (current === tab ? null : tab))
  }, [])
  const handleToggleInterventionPolicyPanel = useCallback(() => {
    handleToggleWorkflowSettingsTab('intervention-policies')
  }, [handleToggleWorkflowSettingsTab])
  const handleToggleInputSchemaPanel = useCallback(() => {
    handleToggleWorkflowSettingsTab('input-schema')
  }, [handleToggleWorkflowSettingsTab])
  const handleToggleTriggerPanel = useCallback(() => {
    handleToggleWorkflowSettingsTab('triggers')
  }, [handleToggleWorkflowSettingsTab])
  const handleCloseWorkflowSettingsPanel = useCallback(() => {
    setActiveSettingsTab(null)
  }, [])
  const handleWorkflowSettingsTabChange = useCallback((tab: WorkflowSettingsTab) => {
    setActiveSettingsTab(tab)
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
  const handleOpenMarketplacePublish = useCallback(() => setIsMarketplacePublishOpen(true), [])

  const handleExportWorkflow = useCallback(() => {
    if (!workflow) return
    exportMutation.mutate(workflowId, {
      onSuccess: (data) => {
        downloadWorkflowExport(data, workflow.name)
      },
    })
  }, [workflow, workflowId, exportMutation])

  const handleOpenImportDialog = useCallback(() => setIsImportDialogOpen(true), [])
  const handleOpenShareDialog = useCallback(() => setIsShareDialogOpen(true), [])

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

  useEffect(() => {
    if (!canPublishToMarketplace) {
      setIsMarketplacePublishOpen(false)
    }
  }, [canPublishToMarketplace])

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
            onToggleInterventionPolicies={handleToggleInterventionPolicyPanel}
            onToggleInputSchema={handleToggleInputSchemaPanel}
            onToggleTriggers={handleToggleTriggerPanel}
            onPublishToMarketplace={canPublishToMarketplace ? handleOpenMarketplacePublish : undefined}
            onRun={workflow.status === 'published' ? handleRunWorkflow : undefined}
            onExport={handleExportWorkflow}
            onImport={handleOpenImportDialog}
            onShare={workflow.status === 'published' ? handleOpenShareDialog : undefined}
            isInterventionPoliciesOpen={activeSettingsTab === 'intervention-policies'}
            isInputSchemaOpen={activeSettingsTab === 'input-schema'}
            isTriggersOpen={activeSettingsTab === 'triggers'}
            isRunning={isStarting || isExecutionActive}
            isExporting={exportMutation.isPending}
            hasNodes={(workflow.nodes ?? []).length > 0}
          />
        )}

        {workflow ? (
          <ExecutionLaunchDialog
            open={isExecutionLaunchDialogOpen}
            workflowId={workflow.id}
            workflowName={workflow.name}
            workflowStatus={workflow.status}
            draftInputSchema={workflow.inputSchema}
            isStarting={isStarting}
            onStartExecution={startExecution}
            onOpenChange={setIsExecutionLaunchDialogOpen}
          />
        ) : null}

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

            {activeSettingsTab ? (
              <div className="pointer-events-auto w-[min(480px,calc(100vw-3rem))]">
                <WorkflowSettingsPanel
                  activeTab={activeSettingsTab}
                  onTabChange={handleWorkflowSettingsTabChange}
                  onClose={handleCloseWorkflowSettingsPanel}
                  workflowId={workflow.id}
                  workflowName={workflow.name}
                  workflowVersion={workflow.version}
                  nodes={workflow.nodes ?? []}
                  inputSchema={workflow.inputSchema}
                  isInputSchemaReadOnly={isInputSchemaReadOnly}
                  isPublished={workflow.status === 'published'}
                  isInterventionPolicyReadOnly={isInterventionPolicyReadOnly}
                />
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

      {workflow && canPublishToMarketplace && (
        <MarketplacePublishDialog
          open={isMarketplacePublishOpen}
          onOpenChange={setIsMarketplacePublishOpen}
          workflowId={workflow.id}
        />
      )}

      <WorkflowImportDialog
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
      />

      {workflow && (
        <ShareManagementDialog
          open={isShareDialogOpen}
          onOpenChange={setIsShareDialogOpen}
          workflowId={workflow.id}
        />
      )}
    </div>
  )
}
