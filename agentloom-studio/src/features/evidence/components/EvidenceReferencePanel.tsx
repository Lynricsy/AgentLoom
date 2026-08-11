import { memo, useEffect, useRef } from 'react'
import { AlertTriangle, ShieldCheck, TriangleAlert, X } from 'lucide-react'

import { cn } from '@/shared/lib/utils'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'

import { useEvidenceChain } from '../api/evidenceQueries'
import type { EvidenceChainNode } from '../types'
import {
  useEvidenceUiActions,
  useEvidenceUiDocumentViewer,
  useEvidenceUiExecutionId,
  useEvidenceUiHighlightState,
  useEvidenceUiIsOpen,
  useEvidenceUiNodeId,
  useEvidenceUiNodeName,
  useEvidenceUiSelectedId,
} from '../stores/evidenceUiStore'
import { DocumentViewer } from './DocumentViewer'
import { EvidenceCard } from './EvidenceCard'

interface EvidenceReferencePanelProps {
  className?: string
}

function flattenNodes(nodes: EvidenceChainNode[]): EvidenceChainNode[] {
  const result: EvidenceChainNode[] = []

  for (const node of nodes) {
    result.push(node)
    if (node.children?.length) {
      result.push(...flattenNodes(node.children))
    }
  }

  return result
}

export const EvidenceReferencePanel = memo(function EvidenceReferencePanel({
  className,
}: EvidenceReferencePanelProps) {
  const isOpen = useEvidenceUiIsOpen()
  const executionId = useEvidenceUiExecutionId()
  const nodeId = useEvidenceUiNodeId()
  const nodeName = useEvidenceUiNodeName()
  const selectedId = useEvidenceUiSelectedId()
  const { highlightedEvidenceId, highlightUntil } = useEvidenceUiHighlightState()
  const docViewer = useEvidenceUiDocumentViewer()
  const { closePanel, selectEvidence, clearHighlight } = useEvidenceUiActions()
  const selectedRef = useRef<HTMLDivElement | null>(null)

  const { data: chainResponse, isLoading, error } = useEvidenceChain(
    executionId ?? '',
    nodeId ?? undefined,
  )
  const chain = chainResponse?.data
  const allNodes = chain?.roots ? flattenNodes(chain.roots) : []
  const integrityIssues = chain?.integrityStatus?.integrityIssues ?? []
  const hasSelectedNode = !!selectedId && allNodes.some((node) => node.evidenceId === selectedId)

  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closePanel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, closePanel])

  useEffect(() => {
    if (!selectedId || !hasSelectedNode || docViewer) return

    const frame = window.requestAnimationFrame(() => {
      selectedRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [docViewer, hasSelectedNode, selectedId])

  useEffect(() => {
    if (!highlightUntil) return

    const remainingMs = highlightUntil - Date.now()
    if (remainingMs <= 0) {
      clearHighlight()
      return
    }

    const timer = window.setTimeout(() => clearHighlight(), remainingMs)
    return () => window.clearTimeout(timer)
  }, [highlightUntil, clearHighlight])

  return (
    <aside
      className={cn(
        'fixed right-0 top-0 z-50 flex h-full w-full flex-col border-l border-border bg-surface shadow-panel transition-transform duration-300 ease-out sm:w-[400px]',
        isOpen ? 'translate-x-0' : 'translate-x-full',
        className,
      )}
      aria-label="证据引用面板"
      data-testid="evidence-reference-panel"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate text-sm font-semibold text-foreground">
            {nodeName ? `${nodeName} · 证据引用` : '证据引用'}
          </span>
          {chain && (
            <Badge variant="secondary" size="sm">
              {chain.totalNodes} 条
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={closePanel}
          aria-label="关闭证据引用面板"
          data-testid="evidence-panel-close"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {integrityIssues.length > 0 && (
        <div className="flex items-center gap-2 border-b border-warning/25 bg-warning/10 px-4 py-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
          <span className="text-xs text-warning">
            {integrityIssues.length} 个完整性问题
          </span>
        </div>
      )}

      {docViewer ? (
        <DocumentViewer className="flex-1" />
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {isLoading && (
              <div className="space-y-2" data-testid="evidence-chain-loading">
                {Array.from({ length: 3 }, (_, index) => (
                  <Skeleton key={index} className="h-24 w-full rounded-card" />
                ))}
              </div>
            )}

            {error && (
              <EmptyState
                className="border-0 px-0 py-8"
                icon={TriangleAlert}
                tone="var(--color-error)"
                title="加载证据链失败"
                description={error.message}
              />
            )}

            {!isLoading && !error && allNodes.length === 0 && (
              <EmptyState
                className="border-0 px-0 py-8"
                icon={ShieldCheck}
                title="暂无证据记录"
                description="节点执行产生检索、决策或工具输出后，证据链会出现在这里。"
              />
            )}

            {allNodes.length > 0 && (
              <div className="space-y-2">
                {allNodes.map((node) => {
                  const isHighlighted =
                    node.evidenceId === highlightedEvidenceId &&
                    !!highlightUntil &&
                    highlightUntil > Date.now()

                  return (
                    <div
                      key={node.evidenceId}
                      ref={node.evidenceId === selectedId ? selectedRef : undefined}
                      style={{ paddingLeft: `${Math.min(node.depth * 12, 48)}px` }}
                      className={cn(
                        'transition-colors duration-500',
                        node.evidenceId === selectedId && 'rounded-xl bg-primary/5',
                        isHighlighted && 'rounded-xl ring-2 ring-primary/60',
                      )}
                    >
                      <EvidenceCard
                        node={node}
                        isSelected={node.evidenceId === selectedId}
                        isHighlighted={isHighlighted}
                        onSelect={selectEvidence}
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {chain && (
            <div className="border-t border-border px-4 py-2 text-[11px] text-muted">
              链完整度：{chain.chainCompleteness ?? '未知'} · 共 {chain.totalNodes} 个节点
            </div>
          )}
        </>
      )}
    </aside>
  )
})
