import { memo, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, ShieldCheck, TriangleAlert, X } from 'lucide-react'

import { Collapse } from '@/shared/components/collapse/Collapse'
import { DUR, EASE, fadeIn } from '@/shared/lib/motion'
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

  // 非模态抽屉：关闭即卸载（不再常驻 translate-x-full，避免阴影外漏与关闭态仍可聚焦）
  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.aside
          key="evidence-reference-panel"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ duration: DUR.slow, ease: EASE }}
          className={cn(
            'fixed right-0 top-0 z-50 flex h-full w-full flex-col border-l border-border bg-surface shadow-lg sm:w-[400px]',
            className,
          )}
          aria-label="证据引用面板"
          data-testid="evidence-reference-panel"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <ShieldCheck className="size-4 shrink-0 text-primary" />
              <span className="truncate text-sm font-semibold text-foreground">
                {nodeName ? `${nodeName} · 证据引用` : '证据引用'}
              </span>
              {chain && (
                <Badge variant="secondary" size="sm" className="shrink-0 tabular-nums">
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
              <X />
            </Button>
          </div>

          <Collapse open={integrityIssues.length > 0}>
            <div className="flex items-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2">
              <AlertTriangle className="size-3.5 shrink-0 text-warning" />
              <span className="text-xs text-warning">
                {integrityIssues.length} 个完整性问题
              </span>
            </div>
          </Collapse>

          <AnimatePresence mode="wait" initial={false}>
            {docViewer ? (
              <motion.div key="doc" {...fadeIn} className="flex min-h-0 flex-1 flex-col">
                <DocumentViewer className="flex-1" />
              </motion.div>
            ) : (
              <motion.div key="list" {...fadeIn} className="flex min-h-0 flex-1 flex-col">
                <div className="flex-1 overflow-y-auto px-4 py-3">
                  {isLoading && (
                    <div className="space-y-2" data-testid="evidence-chain-loading">
                      {Array.from({ length: 3 }, (_, index) => (
                        <Skeleton key={index} className="h-24 w-full rounded-lg" />
                      ))}
                    </div>
                  )}

                  {error && (
                    <EmptyState
                      variant="plain"
                      icon={TriangleAlert}
                      tone="var(--color-error)"
                      title="加载证据链失败"
                      description={error.message}
                    />
                  )}

                  {!isLoading && !error && allNodes.length === 0 && (
                    <EmptyState
                      variant="plain"
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

                        // 缩进作用于卡片外边距，高亮只由卡片自身表达（不再外层双环）
                        return (
                          <div
                            key={node.evidenceId}
                            ref={node.evidenceId === selectedId ? selectedRef : undefined}
                            style={{ marginLeft: `${Math.min(node.depth * 12, 48)}px` }}
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
                  <div className="border-t border-border px-4 py-2 text-2xs text-muted-foreground tabular-nums">
                    链完整度：{chain.chainCompleteness ?? '未知'} · 共 {chain.totalNodes} 个节点
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  )
})
