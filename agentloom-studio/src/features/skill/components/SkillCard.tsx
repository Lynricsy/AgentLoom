import { Zap } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { SkillListItem } from '../types';

const CATEGORY_LABELS: Record<string, string> = {
  writing: '写作',
  analysis: '分析',
  code: '代码',
  research: '研究',
  automation: '自动化',
  communication: '沟通',
  data: '数据',
  reasoning: '推理',
};

const COMPLEXITY_LABELS: Record<string, string> = {
  beginner: '入门',
  intermediate: '进阶',
  advanced: '高级',
};

interface SkillCardProps {
  skill: SkillListItem;
  onClick: (skill: SkillListItem) => void;
}

export function SkillCard({ skill, onClick }: SkillCardProps) {
  const isActive = skill.status === 'active';
  const isDeprecated = skill.status === 'deprecated';
  const complexity = skill.metadata.complexity;

  return (
    <button
      type="button"
      className={cn(
        'group relative flex w-full flex-col gap-3 rounded-lg border p-4 text-left transition-all',
        'bg-card hover:bg-card/90',
        isActive
          ? 'border-border hover:border-primary/50 hover:shadow-sm hover:shadow-primary/10'
          : 'border-border/60 opacity-70',
        isDeprecated && 'opacity-50',
      )}
      onClick={() => onClick(skill)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
              isActive ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
            )}
          >
            <Zap className="h-4 w-4" />
          </div>
          <span className="truncate text-sm font-semibold leading-snug">
            {skill.name}
          </span>
        </div>

        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none',
            isActive && 'bg-green-500/15 text-green-400',
            skill.status === 'inactive' && 'bg-muted text-muted-foreground',
            isDeprecated && 'bg-yellow-500/15 text-yellow-500',
          )}
        >
          {isActive ? '已启用' : isDeprecated ? '已弃用' : '未启用'}
        </span>
      </div>

      {skill.description ? (
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {skill.description}
        </p>
      ) : (
        <p className="text-xs italic text-muted-foreground/50">暂无描述</p>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {CATEGORY_LABELS[skill.category] ?? skill.category}
          </span>
          {complexity && (
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {COMPLEXITY_LABELS[complexity] ?? complexity}
            </span>
          )}
        </div>

        <span className="shrink-0 text-[11px] text-muted-foreground">
          {skill.usageCount.toLocaleString()} 次使用
        </span>
      </div>

      {skill.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {skill.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              {tag}
            </span>
          ))}
          {skill.tags.length > 4 && (
            <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              +{skill.tags.length - 4}
            </span>
          )}
        </div>
      )}
    </button>
  );
}
