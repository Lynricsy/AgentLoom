import { memo } from 'react'
import { Layers, Zap } from 'lucide-react'
import type { TemplateListItem } from '../types'

const CATEGORY_LABELS: Record<string, string> = {
  analysis: '分析',
  content: '内容',
  development: '开发',
  automation: '自动化',
  reporting: '报告',
}

const COMPLEXITY_LABELS: Record<string, string> = {
  beginner: '入门',
  intermediate: '中级',
  advanced: '高级',
}

const COMPLEXITY_COLORS: Record<string, string> = {
  beginner: 'bg-green-500/10 text-green-600',
  intermediate: 'bg-amber-500/10 text-amber-600',
  advanced: 'bg-red-500/10 text-red-600',
}

interface TemplateCardProps {
  template: TemplateListItem
  onClick: (template: TemplateListItem) => void
}

export const TemplateCard = memo(function TemplateCard({
  template,
  onClick,
}: TemplateCardProps) {
  const complexity = template.metadata?.complexity ?? 'beginner'
  const nodeCount = template.metadata?.nodeCount ?? 0

  return (
    <button
      type="button"
      className="flex w-full flex-col items-start gap-3 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:bg-muted/50 focus:outline-none focus:ring-1 focus:ring-primary"
      onClick={() => onClick(template)}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <h3 className="line-clamp-1 text-sm font-medium text-foreground">
          {template.name}
        </h3>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {CATEGORY_LABELS[template.category] ?? template.category}
        </span>
      </div>

      {template.description && (
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {template.description}
        </p>
      )}

      <div className="flex w-full items-center gap-3 text-xs text-muted-foreground">
        {complexity && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${COMPLEXITY_COLORS[complexity] ?? ''}`}
          >
            <Zap className="h-3 w-3" />
            {COMPLEXITY_LABELS[complexity] ?? complexity}
          </span>
        )}
        {nodeCount > 0 && (
          <span className="inline-flex items-center gap-1">
            <Layers className="h-3 w-3" />
            {nodeCount} 节点
          </span>
        )}
      </div>
    </button>
  )
})
