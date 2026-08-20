import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft, MessageSquare, TriangleAlert, Workflow } from 'lucide-react'
import { motion } from 'motion/react'
import { useLiveExecutionDetail } from '../hooks/useLiveExecutionDetail'
import { ReadonlyCanvas } from './ReadonlyCanvas'
import { ExecutionTimelineVertical } from './timeline'
import { useTimelineData } from '../hooks/useTimelineData'
import { ExecutionNodeDetail } from './ExecutionNodeDetail'
import { ExecutionStatusBadge } from './StatusBadge'
import { TerminalTab } from './TerminalTab'
import { ExecutionTelemetryPanel } from './ExecutionTelemetryPanel'
import { usePtySessions } from '../hooks/usePtySessions'
import { sendPtyWrite } from '../api/pty'
import type { PtySessionState } from '../types/pty'
import {
  formatExecutionDateTime,
  formatExecutionDuration,
  getExecutionStartedAt,
} from '../lib/presentation'
import { Button } from '@/shared/ui/button'
import { Badge } from '@/shared/ui/badge'
import { Skeleton } from '@/shared/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/ui/tabs'
import { useToast } from '@/shared/ui/toast'
import { PageHeader } from '@/shared/components/page-header/PageHeader'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { fadeIn } from '@/shared/lib/motion'
import { EvidenceReferencePanel } from '@/features/evidence'
import { EvidenceGraphView } from '@/features/evidence'

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
  const { notify } = useToast()
  const { data: execution, isLoading, error } = useLiveExecutionDetail(executionId)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<
    'debug' | 'provenance' | 'telemetry' | 'terminals'
  >('debug')
  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value as 'debug' | 'provenance' | 'telemetry' | 'terminals')
  }, [])
  const { timelineData } = useTimelineData(
    executionId,
    execution?.steps ?? [],
  )
  const [leftWidth, setLeftWidth] = useState(38)
  const [rightWidth, setRightWidth] = useState(28)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const activeHandleRef = useRef<ActiveHandle>(null)
  const notifiedErrorRef = useRef<string | null>(null)

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

  // 错误态 toast：同一条错误只提示一次，恢复后重置
  useEffect(() => {
    if (!error) {
      notifiedErrorRef.current = null
      return
    }

    const message = error.message || '未找到执行详情'
    if (notifiedErrorRef.current === message) {
      return
    }

    notifiedErrorRef.current = message
    notify({
      variant: 'error',
      title: '加载执行详情失败',
      description: message,
    })
  }, [error, notify])

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
  const isAgentStep = selectedStep?.nodeType?.includes('agent') ?? false

  const goBackToWorkflow = useCallback(() => {
    if (execution?.workflowDefinitionId) {
      void navigate({
        to: '/workflows/$workflowId',
        params: { workflowId: execution.workflowDefinitionId },
      })
      return
    }

    void navigate({ to: '/' })
  }, [execution?.workflowDefinitionId, navigate])

  if (isLoading) {
    return (
      <div
        className="flex h-full w-full flex-col gap-4 bg-background p-5"
        data-testid="execution-debug-loading"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-card" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-40 rounded-full" />
              <Skeleton className="h-3 w-56 rounded-full" />
            </div>
          </div>
          <Skeleton className="h-8 w-32 rounded-full" />
        </div>

        <Skeleton className="h-9 w-64 rounded-card" />

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[38fr_34fr_28fr]">
          <Skeleton className="h-full min-h-[240px] rounded-panel" />
          <Skeleton className="hidden h-full min-h-[240px] rounded-panel lg:block" />
          <Skeleton className="hidden h-full min-h-[240px] rounded-panel lg:block" />
        </div>
      </div>
    )
  }

  if (error || !execution) {
    return (
      <div
        className="flex h-full w-full items-center justify-center bg-background p-6"
        data-testid="execution-debug-error"
      >
        <EmptyState
          icon={TriangleAlert}
          tone="var(--color-error)"
          title="加载执行详情失败"
          description={error?.message ?? '未找到执行详情'}
          action={
            <Button variant="outline" size="sm" onClick={goBackToWorkflow}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              返回工作流
            </Button>
          }
        />
      </div>
    )
  }

  const centerWidth = 100 - leftWidth - rightWidth
  const startedAt = getExecutionStartedAt(execution)

  const agentViewerButton = isAgentStep ? (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        navigate({
          to: '/executions/$executionId/steps/$stepId/agent',
          params: {
            executionId,
            stepId: selectedStep!.id,
          },
        })
      }}
    >
      <MessageSquare className="mr-2 size-4" />
      打开 Agent 运行视图
    </Button>
  ) : null

  return (
    <div className="flex h-full w-full flex-col bg-background" data-testid="execution-debug-view">
      <div className="border-b border-border px-5 py-4">
        <PageHeader
          icon={Workflow}
          title="执行调试"
          description={`Run #${execution.id.slice(0, 8)} · ${formatExecutionDateTime(startedAt)}`}
          actions={
            <>
              <ExecutionStatusBadge status={execution.status} />
              <Badge variant="outline">
                耗时 {formatExecutionDuration(execution.startedAt, execution.completedAt)}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={goBackToWorkflow}
                data-testid="execution-debug-back"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                返回工作流
              </Button>
            </>
          }
        />
      </div>

      <Tabs defaultValue="debug" value={activeTab} onValueChange={handleTabChange} className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-3 overflow-x-auto border-b border-border px-5 py-2">
          <TabsList>
            <TabsTrigger value="debug" data-testid="execution-debug-tab-debug">调试面板</TabsTrigger>
            <TabsTrigger value="provenance" data-testid="execution-debug-tab-provenance">溯源图</TabsTrigger>
            <TabsTrigger value="telemetry" data-testid="execution-debug-tab-telemetry">遥测</TabsTrigger>
            <TabsTrigger value="terminals" data-testid="execution-debug-tab-terminals">
              终端
              {terminalSessions.length > 0 && (
                <Badge size="sm" className="ml-1.5">
                  {terminalSessions.length}
                </Badge>
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
              className="mx-3 w-1 shrink-0 cursor-col-resize rounded-full bg-border transition-colors hover:bg-primary"
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
              className="mx-3 w-1 shrink-0 cursor-col-resize rounded-full bg-border transition-colors hover:bg-primary"
              onMouseDown={() => {
                activeHandleRef.current = 'right'
              }}
              data-testid="execution-debug-handle-right"
            />

            <div style={{ width: `${rightWidth}%` }} className="flex min-w-0 flex-col gap-3" data-testid="execution-debug-right-panel">
              {agentViewerButton ? (
                <div className="flex justify-end">{agentViewerButton}</div>
              ) : null}
              <div className="min-h-0 flex-1">
                <ExecutionNodeDetail step={selectedStep} />
              </div>
            </div>
          </div>

          <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto lg:hidden" data-testid="execution-debug-mobile-layout">
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
            {agentViewerButton}
            <ExecutionNodeDetail step={selectedStep} />
          </div>
        </TabsContent>

        <TabsContent value="provenance" className="flex-1 overflow-hidden p-4" data-testid="execution-debug-provenance-tab">
          <motion.div className="h-full" {...fadeIn}>
            <EvidenceGraphView executionId={executionId} />
          </motion.div>
        </TabsContent>

        <TabsContent value="telemetry" className="flex-1 overflow-y-auto p-4" data-testid="execution-debug-telemetry-tab">
          <motion.div {...fadeIn}>
            <ExecutionTelemetryPanel executionId={executionId} />
          </motion.div>
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
