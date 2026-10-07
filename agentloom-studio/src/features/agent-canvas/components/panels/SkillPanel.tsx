import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { BookOpenText, Search, Check } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { useSkill, useSkills } from '@/features/skill'
import type { SkillListItem } from '@/features/skill'

interface SkillPanelProps {
  config: Record<string, unknown>
  onApply: (config: Record<string, unknown>) => void
  onValidationChange?: (hasErrors: boolean) => void
}

function parseSkillConfig(config: Record<string, unknown>) {
  return {
    skillId: typeof config.skillId === 'string' ? config.skillId : '',
    skillName: typeof config.skillName === 'string' ? config.skillName : '',
    skillDescription:
      typeof config.skillDescription === 'string'
        ? config.skillDescription
        : '',
  }
}

export const SkillPanel = memo(function SkillPanel({
  config,
  onApply,
  onValidationChange,
}: SkillPanelProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const skill = parseSkillConfig(config)
  // 运行时 resolveSkillsForAgent 会静默跳过不存在/非 active 的技能，必须在画布上暴露
  const selectedSkillQuery = useSkill(skill.skillId)
  const isSelectedSkillUnavailable =
    Boolean(skill.skillId) &&
    (selectedSkillQuery.isError ||
      (selectedSkillQuery.data != null &&
        selectedSkillQuery.data.status !== 'active'))
  const hasErrors = !skill.skillId || isSelectedSkillUnavailable

  useEffect(() => {
    onValidationChange?.(hasErrors)
  }, [hasErrors, onValidationChange])

  const { data: skillsResponse, isLoading } = useSkills({
    status: 'active',
    search: searchQuery || undefined,
    pageSize: 50,
  })

  const skills = useMemo(
    () => skillsResponse?.data ?? [],
    [skillsResponse],
  )

  const handleSelect = useCallback(
    (item: SkillListItem) => {
      onApply({
        ...config,
        skillId: item.id,
        skillName: item.name,
        skillDescription: item.description ?? '',
      })
    },
    [config, onApply],
  )

  const handleClear = useCallback(() => {
    onApply({
      ...config,
      skillId: '',
      skillName: '',
      skillDescription: '',
    })
  }, [config, onApply])

  return (
    <div className="flex flex-col gap-3">
      {skill.skillId && (
        <div className="rounded-lg border border-border bg-muted p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 min-w-0">
              <BookOpenText className="mt-0.5 size-4 shrink-0 text-[var(--color-node-skill)]" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {skill.skillName || skill.skillId}
                </p>
                {skill.skillDescription && (
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-3">
                    {skill.skillDescription}
                  </p>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="xs"
              onClick={handleClear}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              清除
            </Button>
          </div>
          {isSelectedSkillUnavailable && (
            <p role="alert" className="mt-2 text-xs text-destructive">
              该 Skill 已删除或停用，运行时会被跳过，请重新选择
            </p>
          )}
        </div>
      )}

      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle-foreground"
        />
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索 Skill..."
          aria-label="搜索 Skill"
          className="h-8 pl-8 pr-3 text-xs"
        />
      </div>

      <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
        {isLoading ? (
          <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
            加载中...
          </div>
        ) : skills.length === 0 ? (
          <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
            {searchQuery ? '未找到匹配的 Skill' : '暂无可用 Skill'}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {skills.map((item) => {
              const isSelected = item.id === skill.skillId
              return (
                <li key={item.id}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSelect(item)}
                    className={cn(
                      'h-auto w-full flex-col items-stretch gap-0 whitespace-normal rounded-none px-3 py-2.5 text-left',
                      isSelected && 'bg-primary/10 hover:bg-primary/10',
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium text-foreground">
                        {item.name}
                      </span>
                      {isSelected && <Check className="shrink-0 text-primary" />}
                    </span>
                    {item.description && (
                      <span className="mt-0.5 text-2xs text-muted-foreground line-clamp-2">
                        {item.description}
                      </span>
                    )}
                    {item.slug && (
                      <span className="mt-1 flex items-center gap-2">
                        <Badge variant="secondary" size="sm">
                          {item.slug}
                        </Badge>
                        {item.isBuiltin && (
                          <Badge tone="var(--color-node-skill)" size="sm">
                            内置
                          </Badge>
                        )}
                      </span>
                    )}
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
})
