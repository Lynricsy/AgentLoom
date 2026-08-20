import { Link, createRoute } from "@tanstack/react-router";
import { ReactFlowProvider } from "@xyflow/react";
import { ChevronRight } from "lucide-react";
import { HTTPError } from "ky";
import { useCallback, useRef, useState } from "react";

import {
  AgentCanvas,
  useAgentCanvasSaveStatus,
  useAgentCanvasStore,
} from "@/features/agent-canvas";
import { useAgentCanvasPersistence } from "@/features/agent-canvas";
import { ReadOnlyCanvasBanner } from "@/features/canvas";
import { useAgent } from "@/features/agent";
import { AgentCreateVersionDialog } from "@/features/agent";
import { AgentPublishDialog } from "@/features/agent";
import { AgentVersionHistoryPanel } from "@/features/agent";
import { AgentVersionToolbar } from "@/features/agent";
import { ShareManagementDialog } from "@/features/share";
import type { ApiError } from "@/shared/types/api";
import { LG_QUERY, useMediaQuery } from "@/shared/hooks/use-media-query";
import { useToast } from "@/shared/ui/toast";

import { rootRoute } from "../__root";

type ApiProblemDetails = ApiError & {
  errors?: Array<{ field?: string; message?: string }>;
};

async function resolveSaveErrorMessage(error: unknown): Promise<string> {
  const fallback = "Agent 画布保存失败，请稍后重试。";
  if (!(error instanceof HTTPError)) {
    return fallback;
  }

  try {
    const payload = (await error.response.clone().json()) as ApiProblemDetails;
    return payload.detail ?? payload.errors?.[0]?.message ?? fallback;
  } catch {
    return fallback;
  }
}

function AgentBreadcrumb({
  agentName,
  isDirty,
}: {
  agentName: string;
  isDirty: boolean;
}) {
  return (
    <nav className="flex items-center gap-2 rounded-md bg-background/80 px-3 py-1.5 text-xs backdrop-blur">
      <Link
        to="/agents"
        className="text-muted-foreground transition-colors hover:text-foreground"
      >
        智能体
      </Link>
      <ChevronRight className="h-3 w-3 text-muted-foreground/60" />
      <span className="max-w-[220px] truncate font-medium text-foreground">
        {agentName || "加载中…"}
      </span>
      {isDirty && <span className="text-amber-400 text-[10px]">未保存</span>}
    </nav>
  );
}

function AgentCanvasPage() {
  const { agentId } = agentDetailRoute.useParams();
  const agentName = useAgentCanvasStore((state) => state.agentName);
  const { isDirty, isSaving } = useAgentCanvasSaveStatus();
  const { data: agent } = useAgent(agentId);
  const { saveCanvas } = useAgentCanvasPersistence(agentId);
  const { notify } = useToast();
  /** 小屏（<lg）画布只读浏览，工具条同步收起写操作入口 */
  const isMobileReadOnly = !useMediaQuery(LG_QUERY);

  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isCreateVersionDialogOpen, setIsCreateVersionDialogOpen] =
    useState(false);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
  const [publishVersionId, setPublishVersionId] = useState<string | null>(null);
  const reopenVersionHistoryAfterPublishRef = useRef(false);

  const handleCanvasSaveError = useCallback(
    async (error: unknown) => {
      notify({
        title: "保存失败",
        description: await resolveSaveErrorMessage(error),
        variant: "error",
      });
    },
    [notify],
  );

  const handleSaveCanvas = useCallback(() => {
    void saveCanvas().catch(handleCanvasSaveError);
  }, [handleCanvasSaveError, saveCanvas]);

  const ensureCanvasSaved = useCallback(async (): Promise<boolean> => {
    if (!isDirty) {
      return true;
    }

    try {
      await saveCanvas();
      return true;
    } catch (error) {
      await handleCanvasSaveError(error);
      return false;
    }
  }, [handleCanvasSaveError, isDirty, saveCanvas]);

  const handleOpenPublishDialog = useCallback(
    (versionId?: string) => {
      reopenVersionHistoryAfterPublishRef.current = isVersionHistoryOpen;
      if (isVersionHistoryOpen) {
        setIsVersionHistoryOpen(false);
      }
      setPublishVersionId(versionId ?? null);
      setIsPublishDialogOpen(true);
    },
    [isVersionHistoryOpen],
  );

  const handlePublishDialogOpenChange = useCallback((open: boolean) => {
    setIsPublishDialogOpen(open);
    if (!open) {
      setPublishVersionId(null);
      if (reopenVersionHistoryAfterPublishRef.current) {
        setIsVersionHistoryOpen(true);
      }
      reopenVersionHistoryAfterPublishRef.current = false;
    }
  }, []);

  const canShare =
    agent?.status === "published" && agent.publishedVersionId !== null;

  return (
    <ReactFlowProvider>
      <div className="relative h-full w-full">
        <AgentCanvas agentId={agentId} />

        <div
          className="pointer-events-none absolute inset-x-4 top-4 z-30 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between"
          data-testid="agent-top-overlay"
        >
          {isMobileReadOnly && (
            <ReadOnlyCanvasBanner
              className="order-none xl:hidden"
              message="当前为只读浏览，请在桌面端编辑 Agent 画布"
            />
          )}

          <div className="order-1 flex max-w-[min(320px,calc(100%-2rem))] xl:order-1">
            <div className="pointer-events-auto">
              <AgentBreadcrumb agentName={agentName} isDirty={isDirty} />
            </div>
          </div>

          <div className="order-2 flex justify-end xl:order-2">
            <div
              className="pointer-events-auto w-full rounded-2xl border border-border/70 bg-background/85 p-2 shadow-lg backdrop-blur-md xl:w-auto"
              data-testid="agent-toolbar-shell"
            >
              <AgentVersionToolbar
                agentStatus={agent?.status ?? "draft"}
                isCanvasDirty={isDirty}
                isCanvasSaving={isSaving}
                onSaveCanvas={handleSaveCanvas}
                onOpenCreateVersion={() => setIsCreateVersionDialogOpen(true)}
                onOpenVersionHistory={() => setIsVersionHistoryOpen(true)}
                onOpenPublish={handleOpenPublishDialog}
                onShare={
                  canShare ? () => setIsShareDialogOpen(true) : undefined
                }
                isReadOnly={isMobileReadOnly}
              />
            </div>
          </div>
        </div>

        <AgentCreateVersionDialog
          open={isCreateVersionDialogOpen}
          agentId={agentId}
          onOpenChange={setIsCreateVersionDialogOpen}
          onBeforeCreateVersion={ensureCanvasSaved}
          isCanvasSaving={isSaving}
        />

        <AgentVersionHistoryPanel
          open={isVersionHistoryOpen}
          agentId={agentId}
          agentStatus={agent?.status ?? "draft"}
          onClose={() => setIsVersionHistoryOpen(false)}
          onPublish={handleOpenPublishDialog}
        />

        <AgentPublishDialog
          open={isPublishDialogOpen}
          agentId={agentId}
          initialVersionId={publishVersionId}
          onOpenChange={handlePublishDialogOpenChange}
          onBeforePublishCurrentVersion={ensureCanvasSaved}
          isCanvasSaving={isSaving}
        />

        <ShareManagementDialog
          open={isShareDialogOpen}
          onOpenChange={setIsShareDialogOpen}
          resourceType="agent"
          resourceId={agentId}
        />
      </div>
    </ReactFlowProvider>
  );
}

export const agentDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/agents/$agentId",
  component: AgentCanvasPage,
});
