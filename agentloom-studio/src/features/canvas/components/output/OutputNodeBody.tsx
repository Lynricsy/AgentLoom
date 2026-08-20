import { memo, useMemo, useState, type MouseEvent, type PointerEvent } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ChevronRight, X, type LucideIcon } from 'lucide-react'
import { useNodeExecutionState } from '@/features/execution'
import { cn } from '@/shared/lib/utils'
import { usePreviewMode } from '../PreviewModeContext'
import {
  buildOutputPreviewText,
  type OutputContentFormat,
} from '../../lib/outputContent'
import { OutputContentRenderer } from './OutputContentRenderer'

interface OutputNodeBodyProps {
  nodeId: string
  format: OutputContentFormat
  icon: LucideIcon
  title: string
  detailDescription: string
  previewMaxChars?: number
}

function stopNodeEvent(
  event: MouseEvent<HTMLButtonElement> | PointerEvent<HTMLButtonElement>,
) {
  event.stopPropagation()
}

export const OutputNodeBody = memo(function OutputNodeBody({
  nodeId,
  format,
  icon: Icon,
  title,
  detailDescription,
  previewMaxChars = 320,
}: OutputNodeBodyProps) {
  const previewMode = usePreviewMode()
  const liveNodeState = useNodeExecutionState(nodeId)
  // 预览复用编辑器卡片：同 id 的编辑器执行输出不能漏进预览
  const nodeState = previewMode ? null : liveNodeState
  const [open, setOpen] = useState(false)
  const output = nodeState?.output ?? null
  const isStreaming = nodeState?.isStreaming ?? false

  const previewText = useMemo(
    () =>
      buildOutputPreviewText({
        format,
        output,
        isStreaming,
        maxChars: previewMaxChars,
      }),
    [format, isStreaming, output, previewMaxChars],
  )

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className={cn(
            'nodrag nopan nowheel group flex w-full flex-col gap-2 rounded-xl border border-border/60 bg-muted/20 px-2.5 py-2 text-left transition-colors',
            'hover:border-primary/40 hover:bg-primary/5',
          )}
          onClick={stopNodeEvent}
          onPointerDown={stopNodeEvent}
          aria-label={`查看${title}详情`}
          data-testid="output-node-body-trigger"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Icon className="h-3.5 w-3.5 shrink-0 text-foreground" />
              <span className="truncate text-[11px] font-medium text-foreground">
                {title}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {isStreaming ? (
                <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  流式中
                </span>
              ) : null}
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition group-hover:text-primary" />
            </div>
          </div>

          {previewText ? (
            <pre className="max-h-[7.5rem] overflow-hidden whitespace-pre-wrap break-words rounded-lg border border-border/60 bg-background/40 px-2.5 py-2 font-mono text-[11px] leading-5 text-foreground">
              {previewText}
            </pre>
          ) : (
            <div className="rounded-lg border border-dashed border-border/60 bg-background/30 px-2.5 py-2 text-[11px] italic text-muted-foreground/80">
              暂无输出，运行后可在这里查看详情
            </div>
          )}

          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{format === 'json' ? '结构化 JSON 详情' : 'Markdown 详情'}</span>
            <span className="transition group-hover:text-primary">点击查看</span>
          </div>
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            'fixed inset-0 z-50 flex flex-col bg-background',
            'data-[state=closed]:animate-out data-[state=open]:animate-in',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-[min(88vh,760px)] sm:w-[min(960px,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:border sm:border-border/70 sm:bg-background/95 sm:shadow-2xl',
          )}
          data-testid="node-output-detail-dialog"
        >
          <header className="flex items-start justify-between gap-4 border-b border-border/70 px-4 py-4 sm:px-6">
            <div className="min-w-0">
              <Dialog.Title className="flex items-center gap-2 text-base font-semibold text-foreground">
                <Icon className="h-4 w-4 shrink-0" />
                <span>{title}详情</span>
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm leading-6 text-muted-foreground">
                {detailDescription}
              </Dialog.Description>
            </div>

            <div className="flex items-center gap-2">
              {isStreaming ? (
                <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                  流式输出中
                </span>
              ) : null}
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-full border border-border/70 p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  aria-label="关闭输出详情"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
            <OutputContentRenderer
              format={format}
              output={output}
              isStreaming={isStreaming}
              placeholder="当前还没有可查看的输出。"
              dataTestId="node-output-detail-content"
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
})
