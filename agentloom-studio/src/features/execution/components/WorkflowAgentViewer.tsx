import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bot,
  FileCode2,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { ExecutionAgentMessageList } from "./ExecutionAgentMessageList";
import { ExecutionStatusBadge, StepStatusBadge } from "./StatusBadge";
import { useLiveExecutionDetail } from "../hooks/useLiveExecutionDetail";
import { useNodeExecutionState } from "../stores/executionStore";
import { buildWorkflowAgentViewerState } from "../lib/workflowAgentViewer";
import {
  formatExecutionDateTime,
  formatExecutionDuration,
} from "../lib/presentation";
import {
  getExecutionStepWorkspaceFile,
  getExecutionStepWorkspaceTree,
  type ExecutionWorkspaceFileContent,
  type ExecutionWorkspaceFileNode,
} from "../api/executionApi";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Skeleton } from "@/shared/ui/skeleton";
import { PageHeader } from "@/shared/components/page-header/PageHeader";
import { EmptyState } from "@/shared/components/empty-state/EmptyState";
import { Spinner } from "@/shared/components/spinner/Spinner";
import { cn } from "@/shared/lib/utils";
import {
  SandboxComputerPanel,
  WorkspaceFileTree,
  type FileTreeNode,
} from "@/features/agent-conversation";

interface WorkflowAgentViewerProps {
  executionId: string;
  stepId: string;
}

const MIN_LEFT_WIDTH = 360;
const MIN_RIGHT_WIDTH = 300;
const DEFAULT_LEFT_RATIO = 0.58;

function hasPath(
  nodes: ExecutionWorkspaceFileNode[],
  path: string | null,
): boolean {
  if (!path) {
    return false;
  }

  for (const node of nodes) {
    if (node.path === path) {
      return true;
    }

    if (node.children && hasPath(node.children, path)) {
      return true;
    }
  }

  return false;
}

interface WorkspaceFilePreviewPanelProps {
  selectedPath: string | null;
  selectedFile: ExecutionWorkspaceFileContent | null;
  isLoading: boolean;
  error: string | null;
}

const WorkspaceFilePreviewPanel = memo(function WorkspaceFilePreviewPanel({
  selectedPath,
  selectedFile,
  isLoading,
  error,
}: WorkspaceFilePreviewPanelProps) {
  const fileName = selectedPath?.split("/").pop() ?? selectedPath;

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border bg-surface-elevated px-3 py-2">
        <FileCode2 className="size-4 shrink-0 text-info" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {fileName || "文件预览"}
          </p>
          <p className="truncate text-[11px] text-muted">
            {selectedPath || "选择文件后显示当前内容"}
          </p>
        </div>
        {selectedFile && (
          <span className="shrink-0 text-[10px] text-muted">
            {selectedFile.size} bytes
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {!selectedPath ? (
          <EmptyState
            className="h-full border-0 px-4 py-0"
            icon={FileCode2}
            title="尚未选择文件"
            description="选择左侧文件后，这里会显示该步骤工作区中的最新内容。"
          />
        ) : isLoading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted">
            <Spinner className="size-4" />
            <span>正在加载文件内容…</span>
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted">
            <p>{error}</p>
          </div>
        ) : selectedFile ? (
          <div className="h-full overflow-auto bg-background p-3">
            <pre
              data-testid="workflow-agent-file-preview"
              className="whitespace-pre-wrap break-all font-mono text-xs leading-relaxed text-foreground"
            >
              {selectedFile.content}
            </pre>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted">
            <p>当前文件暂时不可读取。</p>
          </div>
        )}
      </div>
    </Card>
  );
});

export const WorkflowAgentViewer = memo(function WorkflowAgentViewer({
  executionId,
  stepId,
}: WorkflowAgentViewerProps) {
  const navigate = useNavigate();
  const {
    data: execution,
    isLoading,
    error,
    monitor,
  } = useLiveExecutionDetail(executionId);
  const step = execution?.steps.find((entry) => entry.id === stepId) ?? null;
  const hasStep = step !== null;
  const isAgentStep = step?.nodeType?.includes("agent") ?? false;
  const liveNodeState = useNodeExecutionState(step?.nodeId ?? "");
  const viewerState = useMemo(
    () => (step ? buildWorkflowAgentViewerState(step, liveNodeState) : null),
    [liveNodeState, step],
  );
  const [tree, setTree] = useState<FileTreeNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] =
    useState<ExecutionWorkspaceFileContent | null>(null);
  const [selectedFileLoading, setSelectedFileLoading] = useState(false);
  const [selectedFileError, setSelectedFileError] = useState<string | null>(
    null,
  );
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const resizingRef = useRef(false);
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT_RATIO * 100);
  const previousFileChangeCountRef = useRef(0);
  const latestFileRequestRef = useRef(0);

  const refreshWorkspaceTree = useCallback(async () => {
    if (!hasStep || !isAgentStep) {
      return [] satisfies FileTreeNode[];
    }

    setTreeLoading(true);
    try {
      const nextTree = await getExecutionStepWorkspaceTree(executionId, stepId);
      setTree(nextTree);
      setWorkspaceError(null);
      setSelectedPath((current) =>
        hasPath(nextTree, current) ? current : null,
      );
      return nextTree;
    } catch (workspaceLoadError) {
      setTree([]);
      const message =
        workspaceLoadError instanceof Error
          ? workspaceLoadError.message
          : "工作区暂不可用";
      setWorkspaceError(message);
      return [] satisfies FileTreeNode[];
    } finally {
      setTreeLoading(false);
    }
  }, [executionId, hasStep, isAgentStep, stepId]);

  const loadSelectedFile = useCallback(
    async (path: string | null) => {
      latestFileRequestRef.current += 1;
      const requestId = latestFileRequestRef.current;

      if (!path || !hasStep || !isAgentStep) {
        setSelectedFile(null);
        setSelectedFileError(null);
        setSelectedFileLoading(false);
        return;
      }

      setSelectedFileLoading(true);
      setSelectedFileError(null);
      setSelectedFile(null);

      try {
        const file = await getExecutionStepWorkspaceFile(
          executionId,
          stepId,
          path,
        );
        if (latestFileRequestRef.current !== requestId) {
          return;
        }

        setSelectedFile(file);
      } catch (workspaceFileError) {
        if (latestFileRequestRef.current !== requestId) {
          return;
        }

        setSelectedFile(null);
        setSelectedFileError(
          workspaceFileError instanceof Error
            ? workspaceFileError.message
            : "文件内容暂不可用",
        );
      } finally {
        if (latestFileRequestRef.current === requestId) {
          setSelectedFileLoading(false);
        }
      }
    },
    [executionId, hasStep, isAgentStep, stepId],
  );

  const refreshWorkspace = useCallback(async () => {
    const nextTree = await refreshWorkspaceTree();
    if (selectedPath && hasPath(nextTree, selectedPath)) {
      await loadSelectedFile(selectedPath);
      return;
    }

    setSelectedFile(null);
    setSelectedFileError(null);
  }, [loadSelectedFile, refreshWorkspaceTree, selectedPath]);

  useEffect(() => {
    void refreshWorkspaceTree();
  }, [refreshWorkspaceTree]);

  useEffect(() => {
    void loadSelectedFile(selectedPath);
  }, [loadSelectedFile, selectedPath]);

  useEffect(() => {
    const count = viewerState?.fileChanges.length ?? 0;
    if (count > previousFileChangeCountRef.current) {
      void refreshWorkspace();
    }
    previousFileChangeCountRef.current = count;
  }, [refreshWorkspace, viewerState?.fileChanges.length]);

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      if (!containerRef.current || !resizingRef.current) {
        return;
      }

      const rect = containerRef.current.getBoundingClientRect();
      const pointerPercent = ((event.clientX - rect.left) / rect.width) * 100;
      const maxLeft = ((rect.width - MIN_RIGHT_WIDTH) / rect.width) * 100;
      const minLeft = (MIN_LEFT_WIDTH / rect.width) * 100;
      setLeftWidth(Math.min(Math.max(pointerPercent, minLeft), maxLeft));
    }

    function handleMouseUp() {
      resizingRef.current = false;
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  if (isLoading) {
    return (
      <div
        className="flex h-full flex-col gap-4 p-5"
        data-testid="workflow-agent-viewer-loading"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-card" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-44 rounded-full" />
              <Skeleton className="h-3 w-56 rounded-full" />
            </div>
          </div>
          <Skeleton className="h-8 w-40 rounded-full" />
        </div>
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[58fr_42fr]">
          <Skeleton className="h-full min-h-[240px] rounded-panel" />
          <Skeleton className="hidden h-full min-h-[240px] rounded-panel lg:block" />
        </div>
      </div>
    );
  }

  if (error || !execution || !step || !isAgentStep || !viewerState) {
    return (
      <div
        className="flex h-full items-center justify-center p-6"
        data-testid="workflow-agent-viewer-error"
      >
        <EmptyState
          icon={TriangleAlert}
          tone="var(--color-error)"
          title="未找到可查看的 workflow agent 运行视图。"
          description={
            error instanceof Error
              ? error.message
              : "该步骤可能不是 agent 节点，或执行详情尚未加载完成。"
          }
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                navigate({
                  to: "/executions/$executionId",
                  params: { executionId },
                });
              }}
            >
              <ArrowLeft className="mr-2 size-4" />
              返回执行调试页
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <PageHeader
          icon={Bot}
          tone="var(--color-node-agent)"
          title={step.nodeName || "Agent 节点运行"}
          description={`Step #${step.id.slice(0, 8)} · ${formatExecutionDateTime(step.startedAt)}`}
          actions={
            <>
              <ExecutionStatusBadge status={execution.status} prefix="执行" />
              <StepStatusBadge status={step.status} prefix="节点" />
              <Badge variant="outline">Socket {monitor.connectionStatus}</Badge>
              <Badge variant="outline">
                耗时 {formatExecutionDuration(step.startedAt, step.completedAt)}
              </Badge>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  navigate({
                    to: "/executions/$executionId",
                    params: { executionId },
                  });
                }}
              >
                <ArrowLeft className="mr-2 size-4" />
                返回执行调试页
              </Button>
            </>
          }
        />
      </div>

      <div ref={containerRef} className="hidden min-h-0 flex-1 lg:flex">
        <div
          className="min-w-0 overflow-hidden"
          style={{ width: `${leftWidth}%`, minWidth: MIN_LEFT_WIDTH }}
        >
          <ExecutionAgentMessageList
            messages={viewerState.messages}
            subAgentStreams={viewerState.subAgentStreams}
            isExecuting={step.status === "running"}
          />
        </div>

        <button
          type="button"
          aria-label="调整消息流与上下文宽度"
          className="mx-3 w-1 shrink-0 cursor-col-resize rounded-full bg-border transition-colors hover:bg-primary"
          onMouseDown={() => {
            resizingRef.current = true;
          }}
        />

        <div
          className="flex min-w-0 flex-1 flex-col overflow-hidden"
          style={{ minWidth: MIN_RIGHT_WIDTH }}
        >
          <div className="min-h-0 flex-[3] overflow-hidden">
            <SandboxComputerPanel
              agentName={step.nodeName || "Workflow Agent"}
              terminalEntries={viewerState.terminalEntries}
              fileChanges={viewerState.fileChanges}
              sandboxStatus={viewerState.sandboxStatus}
              isExecuting={step.status === "running"}
              activeToolCall={viewerState.activeToolCall}
            />
          </div>

          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-xs uppercase tracking-[0.18em] text-muted">
              Workspace
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                void refreshWorkspace();
              }}
              disabled={treeLoading}
            >
              <RefreshCw
                className={cn("mr-2 size-3.5", treeLoading && "animate-spin")}
              />
              刷新
            </Button>
          </div>

          <div className="min-h-0 flex-[2] overflow-hidden px-3 pb-3 pt-2">
            <div className="flex h-full min-h-0 flex-col gap-3 xl:flex-row">
              <div className="min-h-0 flex-1 overflow-hidden">
                <WorkspaceFileTree
                  tree={tree}
                  selectedPath={selectedPath}
                  onSelectFile={setSelectedPath}
                />
                {workspaceError && (
                  <p className="mt-2 text-xs text-muted">
                    {workspaceError}
                  </p>
                )}
              </div>
              <div className="min-h-0 flex-[1.1] overflow-hidden">
                <WorkspaceFilePreviewPanel
                  selectedPath={selectedPath}
                  selectedFile={selectedFile}
                  isLoading={selectedFileLoading}
                  error={selectedFileError}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 lg:hidden">
        <ExecutionAgentMessageList
          messages={viewerState.messages}
          subAgentStreams={viewerState.subAgentStreams}
          isExecuting={step.status === "running"}
        />
        <SandboxComputerPanel
          agentName={step.nodeName || "Workflow Agent"}
          terminalEntries={viewerState.terminalEntries}
          fileChanges={viewerState.fileChanges}
          sandboxStatus={viewerState.sandboxStatus}
          isExecuting={step.status === "running"}
          activeToolCall={viewerState.activeToolCall}
        />
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-[0.18em] text-muted">
              Workspace
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                void refreshWorkspaceTree();
              }}
              disabled={treeLoading}
            >
              <RefreshCw
                className={cn("mr-2 size-3.5", treeLoading && "animate-spin")}
              />
              刷新
            </Button>
          </div>
          <WorkspaceFileTree
            tree={tree}
            selectedPath={selectedPath}
            onSelectFile={setSelectedPath}
          />
          <WorkspaceFilePreviewPanel
            selectedPath={selectedPath}
            selectedFile={selectedFile}
            isLoading={selectedFileLoading}
            error={selectedFileError}
          />
          {workspaceError && (
            <p className="text-xs text-muted">{workspaceError}</p>
          )}
        </div>
      </div>
    </div>
  );
});
