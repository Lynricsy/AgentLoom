import { memo, useCallback, type ChangeEvent } from 'react'
import { BookOpen, Loader2 } from 'lucide-react'
import {
  buildKnowledgeBaseNodeConfig,
  getKnowledgeBaseStatusLabel,
  isKnowledgeBaseConfigured,
} from '@/features/knowledge/types'
import { useKnowledgeBases } from '@/features/knowledge/hooks/useKnowledgeBases'

interface KnowledgeBaseConfigPanelProps {
  config: Record<string, unknown>
  onApply: (patch: Record<string, unknown>) => void
}

export const KnowledgeBaseConfigPanel = memo(
  function KnowledgeBaseConfigPanel({
    config,
    onApply,
  }: KnowledgeBaseConfigPanelProps) {
    const { data, isLoading } = useKnowledgeBases({ page: 1, pageSize: 100 })
    const knowledgeBases = data?.data ?? []

    const currentId = isKnowledgeBaseConfigured(config)
      ? config.knowledgeBaseId
      : ''

    const handleSelect = useCallback(
      (e: ChangeEvent<HTMLSelectElement>) => {
        const selectedId = e.target.value
        if (!selectedId) {
          onApply({
            config: {},
            label: '知识库',
          })
          return
        }

        const selectedKb = knowledgeBases.find((kb) => kb.id === selectedId)

        if (!selectedKb) {
          return
        }

        onApply({
          config: buildKnowledgeBaseNodeConfig(selectedKb),
          label: selectedKb.name,
        })
      },
      [knowledgeBases, onApply],
    )

    const selectedKnowledgeBase = knowledgeBases.find((kb) => kb.id === currentId)

    return (
      <div className="space-y-4 px-4 py-4">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-type-knowledge" />
          <span className="rounded-full bg-type-knowledge/10 px-2 py-0.5 text-xs font-medium text-type-knowledge">
            知识库
          </span>
        </div>

        <div>
          <label
            htmlFor="kb-select"
            className="mb-2 block text-xs font-medium text-foreground"
          >
            选择知识库
          </label>
          {isLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>加载中...</span>
            </div>
          ) : (
            <select
              id="kb-select"
              value={currentId}
              onChange={handleSelect}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">请选择知识库</option>
                {knowledgeBases.map((kb) => (
                  <option key={kb.id} value={kb.id}>
                    {kb.name} · {kb.documentCount} 文档
                  </option>
                ))}
              </select>
            )}
        </div>

        {selectedKnowledgeBase && (
          <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-xs">
            <p className="font-medium text-foreground">
              {selectedKnowledgeBase.name}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
              <span>{selectedKnowledgeBase.documentCount} 个文档</span>
              <span>·</span>
              <span>{selectedKnowledgeBase.chunkCount} 个分块</span>
              <span>·</span>
              <span>{getKnowledgeBaseStatusLabel(selectedKnowledgeBase.status)}</span>
            </div>
            <p className="break-all text-muted">ID: {currentId}</p>
          </div>
        )}
      </div>
    )
  },
)
