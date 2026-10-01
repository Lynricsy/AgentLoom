import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { BookOpenText, Search, Check } from 'lucide-react'
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
        <div className="rounded-md border border-neutral-700 bg-neutral-800/50 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 min-w-0">
              <BookOpenText className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-200 truncate">
                  {skill.skillName || skill.skillId}
                </p>
                {skill.skillDescription && (
                  <p className="mt-1 text-xs text-neutral-400 line-clamp-3">
                    {skill.skillDescription}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={handleClear}
              className="shrink-0 text-xs text-neutral-500 hover:text-neutral-300 cursor-pointer"
            >
              清除
            </button>
          </div>
          {isSelectedSkillUnavailable && (
            <p role="alert" className="mt-2 text-xs text-destructive">
              该 Skill 已删除或停用，运行时会被跳过，请重新选择
            </p>
          )}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索 Skill..."
          className="w-full rounded-md border border-neutral-700 bg-neutral-800 py-1.5 pl-8 pr-3 text-xs text-neutral-200 placeholder:text-neutral-600 outline-none focus:border-purple-500/50"
        />
      </div>

      <div className="max-h-64 overflow-y-auto rounded-md border border-neutral-700">
        {isLoading ? (
          <div className="flex items-center justify-center py-6 text-xs text-neutral-500">
            加载中...
          </div>
        ) : skills.length === 0 ? (
          <div className="flex items-center justify-center py-6 text-xs text-neutral-500">
            {searchQuery ? '未找到匹配的 Skill' : '暂无可用 Skill'}
          </div>
        ) : (
          <ul className="divide-y divide-neutral-700/50">
            {skills.map((item) => {
              const isSelected = item.id === skill.skillId
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(item)}
                    className={`w-full cursor-pointer px-3 py-2.5 text-left transition-colors hover:bg-neutral-700/30 ${
                      isSelected ? 'bg-purple-500/10' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium text-neutral-200">
                        {item.name}
                      </span>
                      {isSelected && (
                        <Check className="h-3.5 w-3.5 shrink-0 text-purple-400" />
                      )}
                    </div>
                    {item.description && (
                      <p className="mt-0.5 text-[11px] text-neutral-500 line-clamp-2">
                        {item.description}
                      </p>
                    )}
                    {item.slug && (
                      <div className="mt-1 flex items-center gap-2">
                        <span className="rounded-full bg-neutral-700/50 px-1.5 py-0.5 text-[10px] text-neutral-400">
                          {item.slug}
                        </span>
                        {item.isBuiltin && (
                          <span className="rounded-full bg-purple-500/20 px-1.5 py-0.5 text-[10px] text-purple-400">
                            内置
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
})
