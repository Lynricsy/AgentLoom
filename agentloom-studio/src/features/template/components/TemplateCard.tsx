import { memo } from 'react'
import { Layers, LayoutTemplate, Zap } from 'lucide-react'
import { Badge, type BadgeProps } from '@/shared/ui/badge'
import { Card } from '@/shared/ui/card'
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

const COMPLEXITY_VARIANTS: Record<string, NonNullable<BadgeProps['variant']>> = {
  beginner: 'success',
  intermediate: 'warning',
  advanced: 'error',
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
      className="group h-full w-full rounded-card text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      onClick={() => onClick(template)}
    >
      <Card interactive className="flex h-full flex-col overflow-hidden">
        {/* 缩略图：无图时用品牌色渐变占位，保持栅格节奏 */}
        <div
          className="relative aspect-[16/9] w-full overflow-hidden border-b border-border"
          style={{
            background:
              'linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 20%, var(--color-surface)), color-mix(in srgb, var(--color-primary) 5%, var(--color-surface)))',
          }}
        >
          {template.thumbnailUrl ? (
            <img
              src={template.thumbnailUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <LayoutTemplate
              aria-hidden
              className="absolute bottom-3 right-3 h-9 w-9"
              style={{
                color: 'color-mix(in srgb, var(--color-primary) 50%, transparent)',
              }}
            />
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2.5 p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
              {template.name}
            </h3>
            <Badge variant="secondary" className="shrink-0">
              {CATEGORY_LABELS[template.category] ?? template.category}
            </Badge>
          </div>

          {template.description && (
            <p className="line-clamp-2 text-xs leading-relaxed text-muted">
              {template.description}
            </p>
          )}

          <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-3">
            {complexity && (
              <Badge variant={COMPLEXITY_VARIANTS[complexity] ?? 'secondary'}>
                <Zap className="h-3 w-3" />
                {COMPLEXITY_LABELS[complexity] ?? complexity}
              </Badge>
            )}
            {nodeCount > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-muted">
                <Layers className="h-3 w-3" />
                {nodeCount} 节点
              </span>
            )}
          </div>
        </div>
      </Card>
    </button>
  )
})
