import { memo, useMemo, useState, type MouseEvent, type PointerEvent } from 'react'
import { ChevronRight, type LucideIcon } from 'lucide-react'
import { useNodeExecutionState } from '@/features/execution'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog'
import { StatusBadge } from '@/shared/ui/status-badge'
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          className="nodrag nopan nowheel group h-auto w-full flex-col items-stretch gap-2 whitespace-normal rounded-lg border border-border bg-muted px-2.5 py-2 text-left hover:border-primary/40 hover:bg-primary/5 [&_svg]:size-3.5"
          onClick={stopNodeEvent}
          onPointerDown={stopNodeEvent}
          aria-label={`查看${title}详情`}
          data-testid="output-node-body-trigger"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Icon className="shrink-0 text-foreground" />
              <span className="truncate text-2xs font-medium text-foreground">
                {title}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {isStreaming ? (
                <StatusBadge tone="primary" size="sm" dot pulse>
                  流式中
                </StatusBadge>
              ) : null}
              <ChevronRight className="text-muted-foreground transition-colors duration-150 group-hover:text-primary" />
            </div>
          </div>

          {previewText ? (
            <pre className="max-h-[7.5rem] overflow-hidden whitespace-pre-wrap break-words rounded-md border border-border bg-surface px-2.5 py-2 font-mono text-2xs leading-5 text-foreground">
              {previewText}
            </pre>
          ) : (
            <div className="rounded-md border border-dashed border-border bg-surface px-2.5 py-2 text-2xs italic text-muted-foreground">
              暂无输出，运行后可在这里查看详情
            </div>
          )}

          <div className="flex items-center justify-between text-2xs text-muted-foreground">
            <span>{format === 'json' ? '结构化 JSON 详情' : 'Markdown 详情'}</span>
            <span className="transition-colors duration-150 group-hover:text-primary">点击查看</span>
          </div>
        </Button>
      </DialogTrigger>

      <DialogContent
        size="xl"
        className="sm:h-[min(88vh,760px)]"
        data-testid="node-output-detail-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="size-4 shrink-0" />
            <span>{title}详情</span>
            {isStreaming ? (
              <StatusBadge tone="primary" size="sm" dot pulse>
                流式输出中
              </StatusBadge>
            ) : null}
          </DialogTitle>
          <DialogDescription className="leading-6">
            {detailDescription}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <OutputContentRenderer
            format={format}
            output={output}
            isStreaming={isStreaming}
            placeholder="当前还没有可查看的输出。"
            dataTestId="node-output-detail-content"
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
})
