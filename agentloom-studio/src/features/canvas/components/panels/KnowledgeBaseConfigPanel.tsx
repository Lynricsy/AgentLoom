import { memo, useCallback, type ChangeEvent } from 'react'
import { BookOpen, Loader2 } from 'lucide-react'
import { isKnowledgeBaseConfigured } from '@/features/knowledge/types'
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
    const { data: knowledgeBases = [], isLoading } = useKnowledgeBases()

    const currentId = isKnowledgeBaseConfigured(config)
      ? config.knowledgeBaseId
      : ''

    const handleSelect = useCallback(
      (e: ChangeEvent<HTMLSelectElement>) => {
        const selectedId = e.target.value
        if (!selectedId) return

        const selectedKb = knowledgeBases.find((kb) => kb.id === selectedId)

        onApply({
          config: {
            knowledgeBaseId: selectedId,
            knowledgeBaseName: selectedKb?.name,
          },
          label: selectedKb?.name ?? '知识库',
        })
      },
      [knowledgeBases, onApply],
    )

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
                  {kb.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {currentId && (
          <p className="break-all text-xs text-muted">ID: {currentId}</p>
        )}
      </div>
    )
  },
)
