import { memo, useCallback, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'

import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/shared/ui/tooltip'

import type { EvidenceRecord, EvidenceSourceType } from '../types'
import { fetchEvidenceById } from '../api/evidenceApi'
import { useEvidenceUiActions } from '../stores/evidenceUiStore'

interface InlineEvidenceRefProps {
  evidenceId: string
  index: number
  executionId: string
  nodeId?: string
  nodeName?: string
  className?: string
}

const sourceTypeLabels: Record<EvidenceSourceType, string> = {
  rag_retrieval: 'RAG 检索',
  agent_decision: 'Agent 决策',
  tool_output: '工具输出',
  user_input: '用户输入',
  intervention: '人工干预',
  node_error: '节点错误',
}

export const InlineEvidenceRef = memo(function InlineEvidenceRef({
  evidenceId,
  index,
  executionId,
  nodeId,
  nodeName,
  className,
}: InlineEvidenceRefProps) {
  const { openPanel } = useEvidenceUiActions()

  const [preview, setPreview] = useState<EvidenceRecord | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)

  const ensurePreview = useCallback(async () => {
    if (preview || previewError || isLoadingPreview) {
      return
    }

    setIsLoadingPreview(true)
    try {
      const response = await fetchEvidenceById(executionId, evidenceId)
      setPreview(response.data)
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      setPreviewError(message)
    } finally {
      setIsLoadingPreview(false)
    }
  }, [evidenceId, executionId, isLoadingPreview, preview, previewError])

  const previewSummary = useMemo(() => {
    if (!preview) {
      return null
    }

    const label = sourceTypeLabels[preview.packet.sourceType]
    if (preview.packet.sourceType === 'rag_retrieval') {
      const fileName = preview.packet.physicalLocation.fileName
      const relevance = Math.round(preview.packet.semanticLocation.relevanceScore * 100)
      return {
        label,
        detail: `${fileName} · 相关度 ${relevance}%`,
      }
    }

    return {
      label,
      detail: new Date(preview.createdAt).toLocaleString('zh-CN'),
    }
  }, [preview])

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip
        onOpenChange={(open) => {
          if (open) {
            void ensurePreview()
          }
        }}
      >
        <TooltipTrigger asChild>
          <Button
            variant="link"
            size="xs"
            className={cn(
              'inline-flex h-auto p-0 text-info hover:text-info/80 hover:no-underline',
              className,
            )}
            onClick={(e) => {
              e.stopPropagation()
              openPanel(executionId, nodeId, nodeName, evidenceId)
            }}
            title={`证据引用 #${index}`}
            data-testid={`inline-evidence-ref-${evidenceId}`}
          >
            <sup className="text-2xs font-semibold">[{index}]</sup>
          </Button>
        </TooltipTrigger>

        <TooltipContent
          side="top"
          align="center"
          className="w-[260px] max-w-none rounded-lg p-3 text-foreground"
        >
          <div className="space-y-1">
            <div className="text-xs font-semibold">证据引用 #{index}</div>

            {isLoadingPreview ? (
              <div className="flex items-center gap-1 text-2xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                <span>加载预览中…</span>
              </div>
            ) : previewSummary ? (
              <>
                <div className="text-2xs text-muted-foreground">
                  {previewSummary.label}
                </div>
                <div className="truncate text-2xs text-foreground/85">
                  {previewSummary.detail}
                </div>
              </>
            ) : previewError ? (
              <div className="text-2xs text-muted-foreground">
                预览不可用（{previewError}）
              </div>
            ) : (
              <div className="text-2xs text-muted-foreground">
                悬停可加载来源预览
              </div>
            )}

            <div className="pt-1 text-2xs text-muted-foreground">
              点击打开证据面板并高亮 2 秒
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
})
