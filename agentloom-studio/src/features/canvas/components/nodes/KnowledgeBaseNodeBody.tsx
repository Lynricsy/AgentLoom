import { memo } from 'react'
import { BookOpen } from 'lucide-react'
import { isKnowledgeBaseConfigured } from '@/features/knowledge/types'

interface KnowledgeBaseNodeBodyProps {
  config: Record<string, unknown>
}

export const KnowledgeBaseNodeBody = memo(function KnowledgeBaseNodeBody({
  config,
}: KnowledgeBaseNodeBodyProps) {
  if (!isKnowledgeBaseConfigured(config)) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground/60 italic">
        <BookOpen className="h-3.5 w-3.5 shrink-0" />
        <span>未配置</span>
      </div>
    )
  }

  const name =
    typeof config.knowledgeBaseName === 'string'
      ? config.knowledgeBaseName
      : String(config.knowledgeBaseId)

  return (
    <div className="flex items-center gap-2">
      <BookOpen className="h-3.5 w-3.5 shrink-0 text-primary/80" />
      <span className="truncate text-xs font-medium text-foreground">
        {name}
      </span>
    </div>
  )
})
