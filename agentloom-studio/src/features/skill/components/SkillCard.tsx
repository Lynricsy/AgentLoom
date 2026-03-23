import { Zap, Shield } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { Skill } from '../types';

interface SkillCardProps {
  skill: Skill;
  onClick: (skill: Skill) => void;
}

export function SkillCard({ skill, onClick }: SkillCardProps) {
  const isActive = skill.status === 'active';
  const isArchived = skill.status === 'archived';

  return (
    <button
      type="button"
      className={cn(
        'group relative flex w-full flex-col gap-3 rounded-lg border p-4 text-left transition-all cursor-pointer',
        'bg-card hover:bg-card/90',
        isActive
          ? 'border-border hover:border-primary/50 hover:shadow-sm hover:shadow-primary/10'
          : 'border-border/60 opacity-70',
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
          <div className="min-w-0">
            <span className="truncate text-sm font-semibold leading-snug block">
              {skill.name}
            </span>
            {skill.slug && (
              <span className="text-[11px] text-muted-foreground/70 truncate block">
                {skill.slug}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {skill.isBuiltin && (
            <span className="flex items-center gap-0.5 rounded-full bg-purple-500/15 px-2 py-0.5 text-[11px] font-medium leading-none text-purple-400">
              <Shield className="h-3 w-3" />
              内置
            </span>
          )}
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px] font-medium leading-none',
              isActive && 'bg-green-500/15 text-green-400',
              isArchived && 'bg-yellow-500/15 text-yellow-500',
            )}
          >
            {isActive ? '活跃' : '已归档'}
          </span>
        </div>
      </div>

      {skill.description ? (
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {skill.description}
        </p>
      ) : (
        <p className="text-xs italic text-muted-foreground/50">暂无描述</p>
      )}

      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>{skill.fileCount} 个文件</span>
        <span>v{skill.version}</span>
      </div>
    </button>
  );
}
