import { memo, useEffect, useRef } from 'react'
import { AlertTriangle, Loader2, ShieldCheck, X } from 'lucide-react'

import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'

import { useEvidenceChain } from '../api/evidenceQueries'
import type { EvidenceChainNode } from '../types'
import {
  useEvidenceUiActions,
  useEvidenceUiDocumentViewer,
  useEvidenceUiExecutionId,
  useEvidenceUiIsOpen,
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
  const selectedId = useEvidenceUiSelectedId()
  const docViewer = useEvidenceUiDocumentViewer()
  const { closePanel, selectEvidence } = useEvidenceUiActions()
  const selectedRef = useRef<HTMLDivElement | null>(null)

  const { data: chainResponse, isLoading, error } = useEvidenceChain(
    executionId ?? '',
    undefined,
  )

  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closePanel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, closePanel])

  useEffect(() => {
    if (selectedId && selectedRef.current) {
      selectedRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [selectedId])

  const chain = chainResponse?.data
  const allNodes = chain?.roots ? flattenNodes(chain.roots) : []
  const integrityIssues = chain?.integrityStatus?.integrityIssues ?? []

  return (
    <aside
      className={cn(
        'fixed right-0 top-0 z-50 flex h-full w-full flex-col border-l border-border/60 bg-background/95 shadow-2xl backdrop-blur-md transition-transform duration-300 ease-out sm:w-[400px]',
        isOpen ? 'translate-x-0' : 'translate-x-full',
        className,
      )}
      aria-label="证据引用面板"
      data-testid="evidence-reference-panel"
    >
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">证据引用</span>
          {chain && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {chain.totalNodes} 条
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={closePanel}
          data-testid="evidence-panel-close"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {integrityIssues.length > 0 && (
        <div className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/5 px-4 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-xs text-amber-600">
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
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-center">
                <p className="text-xs text-rose-500">加载证据链失败</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{error.message}</p>
              </div>
            )}

            {!isLoading && !error && allNodes.length === 0 && (
              <div className="py-12 text-center text-xs text-muted-foreground">
                暂无证据记录
              </div>
            )}

            {allNodes.length > 0 && (
              <div className="space-y-2">
                {allNodes.map((node) => (
                  <div
                    key={node.evidenceId}
                    ref={node.evidenceId === selectedId ? selectedRef : undefined}
                    style={{ paddingLeft: `${Math.min(node.depth * 12, 48)}px` }}
                    className={cn(
                      'transition-colors duration-500',
                      node.evidenceId === selectedId && 'rounded-xl bg-primary/5',
                    )}
                  >
                    <EvidenceCard
                      node={node}
                      isSelected={node.evidenceId === selectedId}
                      onSelect={selectEvidence}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {chain && (
            <div className="border-t border-border/60 px-4 py-2 text-[11px] text-muted-foreground">
              链完整度：{chain.chainCompleteness ?? '未知'} · 共 {chain.totalNodes} 个节点
            </div>
          )}
        </>
      )}
    </aside>
  )
})
