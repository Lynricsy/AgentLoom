import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useExecution } from '../hooks/useExecutionList'
import { ReadonlyCanvas } from './ReadonlyCanvas'
import { ExecutionTimelineVertical } from './timeline'
import { useTimelineData } from '../hooks/useTimelineData'
import { ExecutionNodeDetail } from './ExecutionNodeDetail'
import { TerminalTab } from './TerminalTab'
import { usePtySessions } from '../hooks/usePtySessions'
import { sendPtyWrite } from '../api/pty'
import type { PtySessionState } from '../types/pty'
import {
  executionStatusMeta,
  formatExecutionDateTime,
  formatExecutionDuration,
  getExecutionStartedAt,
} from '../lib/presentation'
import { Button } from '@/shared/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/ui/tabs'
import { cn } from '@/shared/lib/utils'
import { EvidenceReferencePanel } from '@/features/evidence/components/EvidenceReferencePanel'
import { EvidenceGraphView } from '@/features/evidence/components/EvidenceGraphView'

interface ExecutionDebugViewProps {
  executionId: string
}

type ActiveHandle = 'left' | 'right' | null

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export const ExecutionDebugView = memo(function ExecutionDebugView({
  executionId,
}: ExecutionDebugViewProps) {
  const navigate = useNavigate()
  const { data: execution, isLoading, error } = useExecution(executionId)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'debug' | 'provenance' | 'terminals'>('debug')
  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value as 'debug' | 'provenance' | 'terminals')
  }, [])
  const { timelineData } = useTimelineData(
    executionId,
    execution?.steps ?? [],
  )
  const [leftWidth, setLeftWidth] = useState(38)
  const [rightWidth, setRightWidth] = useState(28)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const activeHandleRef = useRef<ActiveHandle>(null)

  const { data: ptySessions } = usePtySessions({ executionId })
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null)

  const terminalSessions: PtySessionState[] = useMemo(
    () =>
      (ptySessions ?? []).map((info) => ({
        info,
        outputBuffer: [],
      })),
    [ptySessions],
  )

  useEffect(() => {
    const first = terminalSessions[0]
    if (first && activeTerminalId === null) {
      setActiveTerminalId(first.info.sessionId)
    }
  }, [terminalSessions, activeTerminalId])

  const handleTerminalInput = useCallback(
    (sessionId: string, data: string) => {
      void sendPtyWrite(executionId, sessionId, data)
    },
    [executionId],
  )

  useEffect(() => {
    if (!execution) {
      return
    }

    const hasSelection = selectedNodeId
      ? execution.steps.some((step) => step.nodeId === selectedNodeId)
      : false

    if (hasSelection) {
      return
    }

    const preferredStep =
      execution.steps.find((step) => step.status === 'failed') ??
      execution.steps.find((step) => step.status === 'running') ??
      execution.steps.find((step) => step.status === 'waiting_for_intervention') ??
      execution.steps[0]

    setSelectedNodeId(preferredStep?.nodeId ?? null)
  }, [execution, selectedNodeId])

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      if (!containerRef.current || !activeHandleRef.current) {
        return
      }

      const rect = containerRef.current.getBoundingClientRect()
      const pointerPercent = ((event.clientX - rect.left) / rect.width) * 100

      if (activeHandleRef.current === 'left') {
        setLeftWidth(clamp(pointerPercent, 24, 100 - rightWidth - 22))
        return
      }

      setRightWidth(clamp(100 - pointerPercent, 24, 100 - leftWidth - 22))
    }

    function handleMouseUp() {
      activeHandleRef.current = null
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [leftWidth, rightWidth])

  const selectedStep = useMemo(
    () => execution?.steps.find((step) => step.nodeId === selectedNodeId) ?? null,
    [execution?.steps, selectedNodeId],
  )

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center" data-testid="execution-debug-loading">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          加载执行调试视图中...
        </div>
      </div>
    )
  }

  if (error || !execution) {
    return (
      <div className="flex h-full w-full items-center justify-center" data-testid="execution-debug-error">
        <div className="rounded-3xl border border-rose-500/20 bg-rose-500/10 px-6 py-5 text-center">
          <p className="text-sm font-medium text-foreground">加载执行详情失败</p>
          <p className="mt-2 text-xs text-muted-foreground">{error?.message ?? '未找到执行详情'}</p>
        </div>
      </div>
    )
  }

  const statusMeta = executionStatusMeta[execution.status]
  const centerWidth = 100 - leftWidth - rightWidth
  const startedAt = getExecutionStartedAt(execution)

  return (
    <div className="flex h-full w-full flex-col bg-background" data-testid="execution-debug-view">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (execution.workflowDefinitionId) {
                void navigate({
                  to: '/workflows/$workflowId',
                  params: { workflowId: execution.workflowDefinitionId },
                })
                return
              }

              void navigate({ to: '/' })
            }}
            data-testid="execution-debug-back"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回工作流
          </Button>

          <div>
            <p className="text-sm font-semibold text-foreground">执行调试视图</p>
            <p className="text-xs text-muted-foreground">Run #{execution.id.slice(0, 8)} · {formatExecutionDateTime(startedAt)}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium',
              statusMeta.badgeClassName,
            )}
          >
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                statusMeta.pulseClassName,
                execution.status === 'running' && 'animate-pulse',
              )}
            />
            {statusMeta.label}
          </span>
          <span className="text-xs text-muted-foreground">
            耗时 {formatExecutionDuration(execution.startedAt, execution.completedAt)}
          </span>
        </div>
      </header>

      <Tabs defaultValue="debug" value={activeTab} onValueChange={handleTabChange} className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border/40 px-5 py-2">
          <TabsList>
            <TabsTrigger value="debug" data-testid="execution-debug-tab-debug">调试面板</TabsTrigger>
            <TabsTrigger value="provenance" data-testid="execution-debug-tab-provenance">溯源图</TabsTrigger>
            <TabsTrigger value="terminals" data-testid="execution-debug-tab-terminals">
              终端
              {terminalSessions.length > 0 && (
                <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                  {terminalSessions.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="debug" className="flex-1 overflow-hidden p-4">
          <div ref={containerRef} className="hidden h-full min-h-0 lg:flex" data-testid="execution-debug-desktop-layout">
            <div style={{ width: `${leftWidth}%` }} className="min-w-0" data-testid="execution-debug-left-panel">
              <ReadonlyCanvas
                graph={execution.workflowVersion.graph}
                steps={execution.steps}
                selectedNodeId={selectedNodeId}
                onSelectNode={setSelectedNodeId}
              />
            </div>

            <button
              type="button"
              aria-label="调整画布与时间线宽度"
              className="mx-3 w-1 cursor-col-resize rounded-full bg-border/80 transition hover:bg-primary/60"
              onMouseDown={() => {
                activeHandleRef.current = 'left'
              }}
              data-testid="execution-debug-handle-left"
            />

            <div style={{ width: `${centerWidth}%` }} className="min-w-0" data-testid="execution-debug-center-panel">
              <ExecutionTimelineVertical
                timelineData={timelineData}
                selectedNodeId={selectedNodeId}
                onSelectNode={setSelectedNodeId}
                executionId={executionId}
                executionStartedAt={execution.startedAt ?? null}
                executionCompletedAt={execution.completedAt ?? null}
              />
            </div>

            <button
              type="button"
              aria-label="调整时间线与详情宽度"
              className="mx-3 w-1 cursor-col-resize rounded-full bg-border/80 transition hover:bg-primary/60"
              onMouseDown={() => {
                activeHandleRef.current = 'right'
              }}
              data-testid="execution-debug-handle-right"
            />

            <div style={{ width: `${rightWidth}%` }} className="min-w-0" data-testid="execution-debug-right-panel">
              <ExecutionNodeDetail step={selectedStep} />
            </div>
          </div>

          <div className="flex h-full min-h-0 flex-col gap-4 lg:hidden" data-testid="execution-debug-mobile-layout">
            <ReadonlyCanvas
              graph={execution.workflowVersion.graph}
              steps={execution.steps}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
            />
            <ExecutionTimelineVertical
              timelineData={timelineData}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
              executionId={executionId}
              executionStartedAt={execution.startedAt ?? null}
              executionCompletedAt={execution.completedAt ?? null}
            />
            <ExecutionNodeDetail step={selectedStep} />
          </div>
        </TabsContent>

        <TabsContent value="provenance" className="flex-1 overflow-hidden p-4" data-testid="execution-debug-provenance-tab">
          <EvidenceGraphView executionId={executionId} />
        </TabsContent>

        <TabsContent value="terminals" className="flex-1 overflow-hidden p-4" data-testid="execution-debug-terminals-tab">
          <TerminalTab
            executionId={executionId}
            sessions={terminalSessions}
            activeSessionId={activeTerminalId}
            onSelectSession={setActiveTerminalId}
            onInput={handleTerminalInput}
          />
        </TabsContent>
      </Tabs>

      <EvidenceReferencePanel />
    </div>
  )
})
