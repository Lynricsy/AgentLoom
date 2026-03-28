import { createRoute } from '@tanstack/react-router'
import { Link } from '@tanstack/react-router'
import { ReactFlowProvider } from '@xyflow/react'
import { ChevronRight, Save } from 'lucide-react'
import { useCallback } from 'react'
import { HTTPError } from 'ky'
import { rootRoute } from '../__root'
import { AgentCanvas, useAgentCanvasStore } from '@/features/agent-canvas'
import {
  useAgentCanvasSaveStatus,
  useAgentCanvasActions,
} from '@/features/agent-canvas'
import { Button } from '@/shared/ui/button'
import { useToast } from '@/shared/ui/toast'
import type { ApiError } from '@/shared/types/api'

type ApiProblemDetails = ApiError & {
  errors?: Array<{ field?: string; message?: string }>;
};

async function resolveSaveErrorMessage(error: unknown): Promise<string> {
  const fallback = 'Agent 画布保存失败，请稍后重试。';
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

function AgentBreadcrumb() {
  const agentName = useAgentCanvasStore((s) => s.agentName)
  const { isDirty, isSaving } = useAgentCanvasSaveStatus()
  const { saveCanvas } = useAgentCanvasActions()
  const { notify } = useToast()

  const handleSave = useCallback(() => {
    void saveCanvas().catch(async (error) => {
      notify({
        title: '保存失败',
        description: await resolveSaveErrorMessage(error),
        variant: 'error',
      });
    });
  }, [notify, saveCanvas]);

  return (
    <nav className="absolute top-3 left-3 z-20 flex items-center gap-2 rounded-md bg-background/80 px-3 py-1.5 text-xs backdrop-blur">
      <Link
        to="/agents"
        className="text-muted-foreground transition-colors hover:text-foreground"
      >
        智能体
      </Link>
      <ChevronRight className="h-3 w-3 text-muted-foreground/60" />
      <span className="max-w-[200px] truncate font-medium text-foreground">
        {agentName || '加载中…'}
      </span>
      {isDirty && (
        <span className="text-amber-400 text-[10px]">未保存</span>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="ml-1 h-6 gap-1 px-2 text-xs"
        onClick={handleSave}
        disabled={isSaving || !isDirty}
      >
        <Save className="h-3 w-3" />
        {isSaving ? '保存中…' : '保存'}
      </Button>
    </nav>
  )
}

function AgentCanvasPage() {
  const { agentId } = agentDetailRoute.useParams()

  return (
    <ReactFlowProvider>
      <div className="relative h-full w-full">
        <AgentBreadcrumb />
        <AgentCanvas agentId={agentId} />
      </div>
    </ReactFlowProvider>
  )
}

export const agentDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/agents/$agentId',
  component: AgentCanvasPage,
})
