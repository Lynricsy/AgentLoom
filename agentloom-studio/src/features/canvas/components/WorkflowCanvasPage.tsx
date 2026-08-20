import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { useAuthToken } from "@/features/execution";
import { CelebrationEffect } from "@/features/execution";
import { useExecutionMonitor } from "@/features/execution";
import { useStartExecution } from "@/features/execution";
import { ExecutionHistoryPanel } from "@/features/execution";
import {
  canManageInterventionPolicies,
  getInterventionPolicyRoleFromToken,
} from "@/features/intervention-policy";
import {
  useExecutionId,
  useIsExecutionActive,
  useExecutionStatus,
} from "@/features/execution";
import { useWorkflow } from "@/features/workflow";
import { useExportWorkflow } from "@/features/workflow";
import { downloadWorkflowExport } from "@/features/workflow";
import { PublishSheet } from "@/features/workflow";
import { VersionHistoryPanel } from "@/features/workflow";
import { WorkflowImportDialog } from "@/features/workflow";
import { ExecutionLaunchDialog } from "@/features/workflow-input-schema";
import { MarketplacePublishDialog } from "@/features/marketplace";
import { ShareManagementDialog } from "@/features/share";
import { NodePalette } from "./NodePalette";
import { ReadOnlyCanvasBanner } from "./readonly/ReadOnlyCanvasBanner";
import { ReadOnlyNodeSheet } from "./readonly/ReadOnlyNodeSheet";
import { ReadOnlyWorkflowToolbar } from "./readonly/ReadOnlyWorkflowToolbar";
import { WorkflowCanvas } from "./WorkflowCanvas";
import { WorkflowStatusBar } from "./status/WorkflowStatusBar";
import { FieldMappingPanel } from "./panels/FieldMappingPanel";
import { NodeConfigPanel } from "./panels/NodeConfigPanel";
import {
  WorkflowSettingsPanel,
  type WorkflowSettingsTab,
} from "./panels/WorkflowSettingsPanel";
import { VersionToolbar } from "./toolbar/VersionToolbar";
import { useAutoSave } from "../hooks/useAutoSave";
import {
  useCanvasActions,
  useCanvasStore,
  useMappingPanelEdgeId,
} from "../stores/canvasStore";
import { LG_QUERY, useMediaQuery } from "@/shared/hooks/use-media-query";
import { useToast } from "@/shared/ui/toast";

function buildVersionHistoryRestoreKey(workflowId: string): string {
  return `agentloom:workflow:${workflowId}:restore-version-history`;
}

function writeVersionHistoryRestoreFlag(
  workflowId: string,
  shouldRestore: boolean,
) {
  try {
    const key = buildVersionHistoryRestoreKey(workflowId);
    if (shouldRestore) {
      globalThis.sessionStorage?.setItem(key, "1");
    } else {
      globalThis.sessionStorage?.removeItem(key);
    }
  } catch {
    // 忽略浏览器存储不可用的环境，保留内存态兜底
  }
}

function readVersionHistoryRestoreFlag(workflowId: string): boolean {
  try {
    return (
      globalThis.sessionStorage?.getItem(
        buildVersionHistoryRestoreKey(workflowId),
      ) === "1"
    );
  } catch {
    return false;
  }
}

export function WorkflowCanvasPage() {
  const { workflowId } = useParams({ from: "/workflows/$workflowId" });
  const currentWorkflowId = useCanvasStore((state) => state.workflowId);
  const currentCanvasVersion = useCanvasStore((state) => state.version);
  const isCanvasDirty = useCanvasStore((state) => state.isDirty);
  const {
    applyServerSnapshot,
    reset,
    closeFieldMapping,
    updateFieldMapping,
    selectNode,
  } = useCanvasActions();
  const { notify } = useToast();
  const mappingPanelEdgeId = useMappingPanelEdgeId();
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId);
  const selectedNode = useCanvasStore((s) =>
    s.selectedNodeId
      ? (s.nodes.find((n) => n.id === s.selectedNodeId) ?? null)
      : null,
  );
  const isDesktopViewport = useMediaQuery(LG_QUERY);
  /** 小屏（<lg）只读浏览：隐藏所有编辑入口，节点详情改走底部弹层 */
  const isMobileReadOnly = !isDesktopViewport;
  const skippedSnapshotRef = useRef<string | null>(null);
  const reopenVersionHistoryAfterPublishRef = useRef(false);

  const { data: workflow, isLoading, error } = useWorkflow(workflowId);
  const isWorkflowArchived = workflow?.status === "archived";

  const activeExecutionId = useExecutionId() ?? undefined;
  const isExecutionActive = useIsExecutionActive();
  const executionStatus = useExecutionStatus();
  const authToken = useAuthToken();
  const currentUserRole = getInterventionPolicyRoleFromToken(authToken);
  const canManageWorkflowSettings =
    canManageInterventionPolicies(currentUserRole);
  const isInterventionPolicyReadOnly = !canManageWorkflowSettings;
  const isInputSchemaReadOnly = !canManageWorkflowSettings;
  const { startExecution, isStarting } = useStartExecution();
  useExecutionMonitor({
    executionId: activeExecutionId,
    tenantId: workflow?.tenantId,
    authToken,
  });
  const canPublishToMarketplace =
    !!workflow &&
    workflow.status === "published" &&
    workflow.publishedVersionId !== null &&
    canManageWorkflowSettings;

  const handleRunWorkflow = useCallback(() => {
    if (!workflowId || isStarting || isExecutionActive) return;
    setIsExecutionLaunchDialogOpen(true);
  }, [workflowId, isStarting, isExecutionActive]);

  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
  const [isExecutionHistoryOpen, setIsExecutionHistoryOpen] = useState(false);
  const [isExecutionLaunchDialogOpen, setIsExecutionLaunchDialogOpen] =
    useState(false);
  const [activeSettingsTab, setActiveSettingsTab] =
    useState<WorkflowSettingsTab | null>(null);
  const [isPublishSheetOpen, setIsPublishSheetOpen] = useState(false);
  const [publishVersionId, setPublishVersionId] = useState<string | null>(null);
  const [isMarketplacePublishOpen, setIsMarketplacePublishOpen] =
    useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);

  const exportMutation = useExportWorkflow();
  const handleOpenVersionHistory = useCallback(
    () => setIsVersionHistoryOpen(true),
    [],
  );
  const handleCloseVersionHistory = useCallback(
    () => setIsVersionHistoryOpen(false),
    [],
  );
  const handleToggleExecutionHistory = useCallback(() => {
    setIsExecutionHistoryOpen((current) => !current);
  }, []);
  const handleToggleWorkflowSettingsTab = useCallback(
    (tab: WorkflowSettingsTab) => {
      setActiveSettingsTab((current) => (current === tab ? null : tab));
    },
    [],
  );
  const handleToggleInterventionPolicyPanel = useCallback(() => {
    handleToggleWorkflowSettingsTab("intervention-policies");
  }, [handleToggleWorkflowSettingsTab]);
  const handleToggleInputSchemaPanel = useCallback(() => {
    handleToggleWorkflowSettingsTab("input-schema");
  }, [handleToggleWorkflowSettingsTab]);
  const handleToggleTriggerPanel = useCallback(() => {
    handleToggleWorkflowSettingsTab("triggers");
  }, [handleToggleWorkflowSettingsTab]);
  const handleCloseWorkflowSettingsPanel = useCallback(() => {
    setActiveSettingsTab(null);
  }, []);
  const handleWorkflowSettingsTabChange = useCallback(
    (tab: WorkflowSettingsTab) => {
      setActiveSettingsTab(tab);
    },
    [],
  );
  const handleCloseExecutionHistory = useCallback(() => {
    setIsExecutionHistoryOpen(false);
  }, []);
  const handleOpenPublishSheet = useCallback(
    (versionId?: string) => {
      reopenVersionHistoryAfterPublishRef.current = isVersionHistoryOpen;
      writeVersionHistoryRestoreFlag(workflowId, isVersionHistoryOpen);
      setPublishVersionId(versionId ?? null);
      setIsPublishSheetOpen(true);
    },
    [isVersionHistoryOpen, workflowId],
  );
  const handlePublishSheetOpenChange = useCallback(
    (open: boolean) => {
      setIsPublishSheetOpen(open);
      if (!open) {
        const shouldRestore =
          reopenVersionHistoryAfterPublishRef.current ||
          readVersionHistoryRestoreFlag(workflowId);
        setPublishVersionId(null);
        if (shouldRestore) {
          setIsVersionHistoryOpen(true);
        }
        reopenVersionHistoryAfterPublishRef.current = false;
        writeVersionHistoryRestoreFlag(workflowId, false);
      }
    },
    [workflowId],
  );
  const handleOpenMarketplacePublish = useCallback(
    () => setIsMarketplacePublishOpen(true),
    [],
  );

  const handleExportWorkflow = useCallback(() => {
    if (!workflow) return;
    exportMutation.mutate(workflowId, {
      onSuccess: (data) => {
        downloadWorkflowExport(data, workflow.slug);
      },
    });
  }, [workflow, workflowId, exportMutation]);

  const handleOpenImportDialog = useCallback(
    () => setIsImportDialogOpen(true),
    [],
  );
  const handleOpenShareDialog = useCallback(
    () => setIsShareDialogOpen(true),
    [],
  );

  /** 底部弹层关闭即取消节点选中，保持与桌面端「关闭配置面板」同一语义 */
  const handleReadOnlyNodeSheetOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        selectNode(null);
      }
    },
    [selectNode],
  );

  const mappingPanelEdge = useCanvasStore((s) =>
    mappingPanelEdgeId
      ? (s.edges.find((e) => e.id === mappingPanelEdgeId) ?? null)
      : null,
  );
  const mappingSourceNode = useCanvasStore((s) =>
    mappingPanelEdge
      ? (s.nodes.find((n) => n.id === mappingPanelEdge.source) ?? null)
      : null,
  );
  const mappingTargetNode = useCanvasStore((s) =>
    mappingPanelEdge
      ? (s.nodes.find((n) => n.id === mappingPanelEdge.target) ?? null)
      : null,
  );

  useAutoSave(workflowId, workflow?.status);

  useEffect(() => {
    if (!workflow) {
      return;
    }

    const shouldApplySnapshot =
      workflow.id !== currentWorkflowId ||
      workflow.version !== currentCanvasVersion;

    if (!shouldApplySnapshot) {
      skippedSnapshotRef.current = null;
      return;
    }

    const nextSnapshotKey = `${workflow.id}:${workflow.version}`;
    const isSameWorkflowVersionRefresh = workflow.id === currentWorkflowId;

    if (isSameWorkflowVersionRefresh && isCanvasDirty) {
      if (skippedSnapshotRef.current !== nextSnapshotKey) {
        skippedSnapshotRef.current = nextSnapshotKey;
        notify({
          title: "已保留本地未保存修改",
          description:
            "服务端工作流已更新，但当前画布已有新的未保存编辑，本次不会自动覆盖本地状态。",
          variant: "warning",
        });
      }
      return;
    }

    skippedSnapshotRef.current = null;

    applyServerSnapshot({
      nodes: workflow.nodes,
      edges: workflow.edges,
      viewport: workflow.viewport ?? undefined,
      workflowId: workflow.id,
      version: workflow.version,
      inputSchema: workflow.inputSchema,
    });
  }, [
    workflow,
    currentWorkflowId,
    currentCanvasVersion,
    applyServerSnapshot,
    isCanvasDirty,
    notify,
  ]);

  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  useEffect(() => {
    if (isWorkflowArchived) {
      closeFieldMapping();
    }
  }, [closeFieldMapping, isWorkflowArchived]);

  useEffect(() => {
    if (!canPublishToMarketplace) {
      setIsMarketplacePublishOpen(false);
    }
  }, [canPublishToMarketplace]);

  useEffect(() => {
    if (isPublishSheetOpen) {
      return;
    }

    if (readVersionHistoryRestoreFlag(workflowId)) {
      setIsVersionHistoryOpen(true);
      writeVersionHistoryRestoreFlag(workflowId, false);
    }
  }, [isPublishSheetOpen, workflowId]);

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted">加载工作流中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-error">加载失败: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full">
      {!isWorkflowArchived && !isMobileReadOnly && <NodePalette />}

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

        {workflow ? (
          <ExecutionLaunchDialog
            open={isExecutionLaunchDialogOpen}
            workflowId={workflow.id}
            workflowName={workflow.name}
            workflowStatus={workflow.status}
            draftInputSchema={workflow.inputSchema}
            preferDraftSchema
            isStarting={isStarting}
            onStartExecution={startExecution}
            onOpenChange={setIsExecutionLaunchDialogOpen}
          />
        ) : null}

        {workflow && (
          <div
            className="pointer-events-none absolute inset-x-4 top-4 z-30 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between"
            data-testid="workflow-top-overlay"
          >
            {isMobileReadOnly && (
              <ReadOnlyCanvasBanner message="当前为只读浏览，请在桌面端编辑工作流" />
            )}

            <div className="order-1 flex justify-end xl:order-2">
              <div
                className="pointer-events-auto w-full xl:w-auto"
                data-testid="workflow-toolbar-shell"
              >
                {isMobileReadOnly ? (
                  <ReadOnlyWorkflowToolbar
                    workflowStatus={workflow.status}
                    onOpenVersionHistory={handleOpenVersionHistory}
                    onExport={handleExportWorkflow}
                    isExporting={exportMutation.isPending}
                    hasNodes={workflow.nodes.length > 0}
                  />
                ) : (
                  <VersionToolbar
                    workflowId={workflowId}
                    workflowStatus={workflow.status}
                    onOpenVersionHistory={handleOpenVersionHistory}
                    onOpenPublish={handleOpenPublishSheet}
                    onToggleInterventionPolicies={
                      handleToggleInterventionPolicyPanel
                    }
                    onToggleInputSchema={handleToggleInputSchemaPanel}
                    onToggleTriggers={handleToggleTriggerPanel}
                    onPublishToMarketplace={
                      canPublishToMarketplace
                        ? handleOpenMarketplacePublish
                        : undefined
                    }
                    onRun={
                      workflow.status === "published"
                        ? handleRunWorkflow
                        : undefined
                    }
                    onExport={handleExportWorkflow}
                    onImport={handleOpenImportDialog}
                    onShare={
                      workflow.status === "published"
                        ? handleOpenShareDialog
                        : undefined
                    }
                    isInterventionPoliciesOpen={
                      activeSettingsTab === "intervention-policies"
                    }
                    isInputSchemaOpen={activeSettingsTab === "input-schema"}
                    isTriggersOpen={activeSettingsTab === "triggers"}
                    isRunning={isStarting || isExecutionActive}
                    isExporting={exportMutation.isPending}
                    hasNodes={workflow.nodes.length > 0}
                  />
                )}
              </div>
            </div>

            <div
              className="order-2 flex max-w-[min(420px,calc(100%-2rem))] flex-col gap-3 xl:order-1"
              data-testid="workflow-side-overlay"
            >
              <button
                type="button"
                className="pointer-events-auto inline-flex w-fit items-center gap-2 rounded-full border border-border/70 bg-background/85 px-3 py-2 text-xs font-medium text-foreground shadow-lg backdrop-blur-md transition hover:border-primary/40 hover:text-primary"
                onClick={handleToggleExecutionHistory}
                data-testid="toggle-execution-history"
              >
                {isExecutionHistoryOpen ? "隐藏执行记录" : "查看执行记录"}
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
                    nodes={workflow.nodes}
                    inputSchema={workflow.inputSchema}
                    isInputSchemaReadOnly={isInputSchemaReadOnly}
                    isPublished={workflow.status === "published"}
                    isInterventionPolicyReadOnly={isInterventionPolicyReadOnly}
                  />
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {!isWorkflowArchived &&
        !isMobileReadOnly &&
        selectedNodeId &&
        !mappingPanelEdgeId && <NodeConfigPanel />}

      {isMobileReadOnly && (
        <ReadOnlyNodeSheet
          node={selectedNode}
          open={!!selectedNode}
          onOpenChange={handleReadOnlyNodeSheetOpenChange}
          showOutput
        />
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
          resourceType="workflow"
          resourceId={workflow.id}
        />
      )}
    </div>
  );
}
