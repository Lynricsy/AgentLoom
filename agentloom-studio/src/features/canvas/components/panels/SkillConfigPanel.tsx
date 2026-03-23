import { memo, useCallback, type ChangeEvent } from 'react'
import { BookOpenText } from 'lucide-react'

interface SkillConfigPanelProps {
  config: Record<string, unknown>
  onApply: (patch: Record<string, unknown>) => void
}

interface SkillConfig {
  skillId: string
  skillName: string
  skillDescription: string
}

function parseSkillConfig(config: Record<string, unknown>): SkillConfig {
  return {
    skillId: typeof config.skillId === 'string' ? config.skillId : '',
    skillName: typeof config.skillName === 'string' ? config.skillName : '',
    skillDescription:
      typeof config.skillDescription === 'string' ? config.skillDescription : '',
  }
}

export const SkillConfigPanel = memo(function SkillConfigPanel({
  config,
  onApply,
}: SkillConfigPanelProps) {
  const skill = parseSkillConfig(config)

  const applyField = useCallback(
    (field: keyof SkillConfig, value: string) => {
      const next = { ...parseSkillConfig(config), [field]: value }
      onApply({ config: next })
    },
    [config, onApply],
  )

  const handleSkillId = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      applyField('skillId', e.target.value)
    },
    [applyField],
  )

  const handleSkillName = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      applyField('skillName', e.target.value)
    },
    [applyField],
  )

  const handleSkillDescription = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      applyField('skillDescription', e.target.value)
    },
    [applyField],
  )

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex items-center gap-2">
        <BookOpenText className="h-4 w-4 text-type-skill" />
        <span className="rounded-full bg-type-skill/10 px-2 py-0.5 text-xs font-medium text-type-skill">
          Skill
        </span>
      </div>

      <div>
        <label
          htmlFor="skill-id"
          className="mb-2 block text-xs font-medium text-foreground"
        >
          技能 ID <span className="text-destructive">*</span>
        </label>
        <input
          id="skill-id"
          type="text"
          value={skill.skillId}
          onChange={handleSkillId}
          placeholder="skill-unique-id"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label
          htmlFor="skill-name"
          className="mb-2 block text-xs font-medium text-foreground"
        >
          技能名称
        </label>
        <input
          id="skill-name"
          type="text"
          value={skill.skillName}
          onChange={handleSkillName}
          placeholder="例如：代码审查专家"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label
          htmlFor="skill-description"
          className="mb-2 block text-xs font-medium text-foreground"
        >
          技能描述
        </label>
        <textarea
          id="skill-description"
          value={skill.skillDescription}
          onChange={handleSkillDescription}
          placeholder="描述该技能的用途和增强效果..."
          rows={3}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-xs">
        <p className="font-medium text-foreground">当前配置</p>
        {skill.skillId ? (
          <div className="space-y-1 text-muted-foreground">
            <p>ID: {skill.skillId}</p>
            {skill.skillName && <p>名称: {skill.skillName}</p>}
            {skill.skillDescription && (
              <p className="line-clamp-2">描述: {skill.skillDescription}</p>
            )}
          </div>
        ) : (
          <p className="text-muted">未配置技能 ID</p>
        )}
      </div>
    </div>
  )
})
