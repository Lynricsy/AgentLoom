import { memo, useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { z } from 'zod'
import { Plus, Trash2, Users } from 'lucide-react'
import {
  TEAM_BROADCAST_TARGET,
  TEAM_MAX_MEMBERS,
  TEAM_PRESET_TRIAGE,
  TeamNodeConfigSchema,
} from '@agentloom/contracts'
import { useAgentList } from '@/features/agent'
import { Alert } from '@/shared/ui/alert'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { Checkbox } from '@/shared/ui/checkbox'
import { Input } from '@/shared/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { Textarea } from '@/shared/ui/textarea'
import { FormField } from '@/shared/components/form-field/FormField'

const OutputSchemaObjectSchema = z.record(z.string(), z.unknown())

/**
 * 读取 `node.data.config` 的宽松草稿 schema：编辑中的半成品（未选 Agent、空角色名）
 * 也要能回显，因此逐字段 `catch` 兜底；是否可运行由契约 `TeamNodeConfigSchema` 判定。
 */
const TeamMemberDraftSchema = z.object({
  role: z.string().catch(''),
  agentDefinitionId: z.string().catch(''),
  agentVersionId: z.string().nullable().catch(null),
  isLead: z.boolean().catch(false),
  instructions: z.string().catch(''),
  canMessage: z.array(z.string()).catch([]),
})

const TeamBudgetDraftSchema = z.object({
  maxTotalTokens: z.number().optional().catch(undefined),
  maxMessages: z.number().optional().catch(undefined),
  deadlineMinutes: z.number().optional().catch(undefined),
})

const TeamConfigDraftSchema = z.object({
  objective: z.string().catch(''),
  members: z
    .array(
      TeamMemberDraftSchema.catch({
        role: '',
        agentDefinitionId: '',
        agentVersionId: null,
        isLead: false,
        instructions: '',
        canMessage: [],
      }),
    )
    .catch([]),
  budget: TeamBudgetDraftSchema.catch({}),
  outputSchema: OutputSchemaObjectSchema.nullable().catch(null),
})

export type TeamMemberDraft = z.infer<typeof TeamMemberDraftSchema>
export type TeamBudgetDraft = z.infer<typeof TeamBudgetDraftSchema>
/** 存于 `node.data.config` 的团队配置草稿 */
export type TeamConfigDraft = z.infer<typeof TeamConfigDraftSchema>

/** 契约校验问题中本面板用到的字段 */
interface TeamConfigIssue {
  code: string
  path: readonly PropertyKey[]
  message: string
}

type BudgetKey = keyof TeamBudgetDraft

const BUDGET_FIELDS: ReadonlyArray<{ key: BudgetKey; label: string; placeholder: string }> = [
  { key: 'maxTotalTokens', label: 'Token 上限', placeholder: '500000' },
  { key: 'maxMessages', label: '消息数上限', placeholder: '200' },
  { key: 'deadlineMinutes', label: '截止时间（分钟）', placeholder: '60' },
]

/** 生成不与现有角色重复的默认角色名 */
function nextRoleName(members: TeamMemberDraft[]): string {
  const roles = new Set(members.map((member) => member.role))
  let index = members.length + 1
  while (roles.has(`member${index}`)) index += 1
  return `member${index}`
}

/** 把契约校验问题翻译成面向用户的中文提示 */
function describeIssue(issue: TeamConfigIssue, members: TeamMemberDraft[]): string {
  const [head, index, field] = issue.path
  if (head === 'members' && typeof index === 'number') {
    const prefix = `成员 ${index + 1}（${members[index]?.role || '未命名'}）`
    if (issue.code === 'custom') return `${prefix}：${issue.message}`
    switch (field) {
      case 'role':
        return `${prefix}：角色名需以小写字母开头，由 2–32 位小写字母、数字、_ 或 - 组成`
      case 'agentDefinitionId':
        return `${prefix}：请选择已发布的 Agent`
      case 'agentVersionId':
        return `${prefix}：版本无效`
      case 'instructions':
        return `${prefix}：指令不能超过 4000 字`
      case 'canMessage':
        return `${prefix}：通信对象无效`
      default:
        return `${prefix}：${issue.message}`
    }
  }
  if (head === 'members') {
    if (issue.code === 'too_small') return '团队至少需要 2 名成员'
    if (issue.code === 'too_big') return `团队最多 ${TEAM_MAX_MEMBERS} 名成员`
    return issue.message
  }
  if (head === 'budget') {
    const label = BUDGET_FIELDS.find((item) => item.key === index)?.label ?? '预算'
    return issue.code === 'too_big' ? `${label}超出上限` : `${label}需为正整数`
  }
  if (head === 'objective') return '团队目标不能超过 8000 字'
  if (head === 'outputSchema') return '输出 Schema 必须是 JSON 对象'
  return `${issue.path.join('.')}：${issue.message}`
}

interface TeamConfigPanelProps {
  config: Record<string, unknown>
  onApply: (config: TeamConfigDraft) => void
  onValidationChange?: (hasErrors: boolean) => void
}

export const TeamConfigPanel = memo(function TeamConfigPanel({
  config,
  onApply,
  onValidationChange,
}: TeamConfigPanelProps) {
  const draft = useMemo(() => TeamConfigDraftSchema.parse(config), [config])
  const { data: agentList, isLoading: loadingAgents } = useAgentList({
    status: 'published',
    pageSize: 100,
  })
  const agents = useMemo(() => agentList?.data ?? [], [agentList])

  // 输出 Schema 文本在 JSON 合法前不落库，因此单独保留输入原文
  const [schemaText, setSchemaText] = useState(() =>
    draft.outputSchema ? JSON.stringify(draft.outputSchema, null, 2) : '',
  )
  const [schemaError, setSchemaError] = useState<string | null>(null)

  const issues = useMemo(() => {
    const result = TeamNodeConfigSchema.safeParse(draft)
    if (result.success) return []
    return [...new Set(result.error.issues.map((issue) => describeIssue(issue, draft.members)))]
  }, [draft])

  const hasErrors = issues.length > 0 || schemaError !== null

  useEffect(() => {
    onValidationChange?.(hasErrors)
  }, [hasErrors, onValidationChange])

  const apply = useCallback(
    (patch: Partial<TeamConfigDraft>) => {
      onApply({ ...draft, ...patch })
    },
    [draft, onApply],
  )

  const updateMember = useCallback(
    (index: number, patch: Partial<TeamMemberDraft>) => {
      apply({
        members: draft.members.map((member, i) => (i === index ? { ...member, ...patch } : member)),
      })
    },
    [apply, draft.members],
  )

  const handleRoleChange = useCallback(
    (index: number, nextRole: string) => {
      const previousRole = draft.members[index]?.role ?? ''
      // 改名时同步其他成员通信对象中对旧角色名的引用
      apply({
        members: draft.members.map((member, i) => {
          if (i === index) return { ...member, role: nextRole }
          if (!previousRole) return member
          return {
            ...member,
            canMessage: member.canMessage.map((target) => (target === previousRole ? nextRole : target)),
          }
        }),
      })
    },
    [apply, draft.members],
  )

  const handleAddMember = useCallback(() => {
    apply({
      members: [
        ...draft.members,
        {
          role: nextRoleName(draft.members),
          agentDefinitionId: '',
          agentVersionId: null,
          isLead: !draft.members.some((member) => member.isLead),
          instructions: '',
          canMessage: [],
        },
      ],
    })
  }, [apply, draft.members])

  const handleRemoveMember = useCallback(
    (index: number) => {
      const removedRole = draft.members[index]?.role
      apply({
        members: draft.members
          .filter((_, i) => i !== index)
          .map((member) => ({
            ...member,
            canMessage: member.canMessage.filter((target) => target !== removedRole),
          })),
      })
    },
    [apply, draft.members],
  )

  const handleLeadChange = useCallback(
    (value: string) => {
      const leadIndex = Number(value)
      apply({
        members: draft.members.map((member, i) => ({ ...member, isLead: i === leadIndex })),
      })
    },
    [apply, draft.members],
  )

  const handleToggleTarget = useCallback(
    (index: number, target: string, checked: boolean) => {
      const member = draft.members[index]
      if (!member) return
      if (target === TEAM_BROADCAST_TARGET) {
        updateMember(index, { canMessage: checked ? [TEAM_BROADCAST_TARGET] : [] })
        return
      }
      const next = checked
        ? [...member.canMessage.filter((item) => item !== target), target]
        : member.canMessage.filter((item) => item !== target)
      updateMember(index, { canMessage: next })
    },
    [draft.members, updateMember],
  )

  const handleApplyPreset = useCallback(() => {
    apply({
      members: TEAM_PRESET_TRIAGE.map((preset) => ({
        role: preset.role,
        agentDefinitionId: '',
        agentVersionId: null,
        isLead: preset.isLead,
        instructions: preset.instructions,
        canMessage: [...preset.canMessage],
      })),
    })
  }, [apply])

  const handleBudgetChange = useCallback(
    (key: BudgetKey, raw: string) => {
      const budget = { ...draft.budget }
      const trimmed = raw.trim()
      if (trimmed === '') {
        delete budget[key]
      } else {
        budget[key] = Number(trimmed)
      }
      apply({ budget })
    },
    [apply, draft.budget],
  )

  const handleSchemaChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const text = event.target.value
      setSchemaText(text)
      if (text.trim() === '') {
        setSchemaError(null)
        apply({ outputSchema: null })
        return
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch (error) {
        setSchemaError(`JSON 解析失败：${error instanceof Error ? error.message : String(error)}`)
        return
      }
      const schemaObject = OutputSchemaObjectSchema.safeParse(parsed)
      if (!schemaObject.success) {
        setSchemaError('输出 Schema 必须是 JSON 对象')
        return
      }
      setSchemaError(null)
      apply({ outputSchema: schemaObject.data })
    },
    [apply],
  )

  const leadIndexes = draft.members.flatMap((member, index) => (member.isLead ? [index] : []))
  const leadValue = leadIndexes.length === 1 ? String(leadIndexes[0]) : ''

  return (
    <div className="space-y-4 px-4 py-4" data-testid="team-config-panel">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="size-4 shrink-0 text-[var(--color-node-agent)]" />
          <Badge tone="var(--color-node-agent)">Agent 团队</Badge>
        </div>
        <Button variant="outline" size="xs" onClick={handleApplyPreset}>
          应用三角色模板
        </Button>
      </div>

      <FormField label="团队目标" htmlFor="team-objective" hint="提供给全部成员的总体目标，可留空">
        <Textarea
          id="team-objective"
          value={draft.objective}
          onChange={(event) => apply({ objective: event.target.value })}
          placeholder="例如：定位并修复登录接口的超时问题"
        />
      </FormField>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-foreground">
            成员（{draft.members.length}/{TEAM_MAX_MEMBERS}）
          </span>
          <Button
            variant="ghost"
            size="xs"
            onClick={handleAddMember}
            disabled={draft.members.length >= TEAM_MAX_MEMBERS}
          >
            <Plus />
            添加成员
          </Button>
        </div>

        {draft.members.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted p-3 text-xs text-muted-foreground">
            暂无成员：添加成员或应用三角色模板
          </div>
        ) : null}

        {draft.members.map((member, index) => {
          const agentListed = agents.some((agent) => agent.id === member.agentDefinitionId)
          const broadcast = member.canMessage.includes(TEAM_BROADCAST_TARGET)
          const otherRoles = draft.members
            .filter((other, i) => i !== index && other.role)
            .map((other) => other.role)
          return (
            <Card key={index} className="space-y-3 p-3" data-testid={`team-member-${index}`}>
              <div className="flex items-center gap-2">
                <Input
                  aria-label={`成员 ${index + 1} 角色名`}
                  value={member.role}
                  onChange={(event) => handleRoleChange(index, event.target.value)}
                  placeholder="角色名，如 locator"
                  className="h-8"
                />
                {member.isLead ? <Badge variant="default" size="sm">负责人</Badge> : null}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`删除成员 ${index + 1}`}
                  className="hover:bg-error/10 hover:text-error"
                  onClick={() => handleRemoveMember(index)}
                >
                  <Trash2 />
                </Button>
              </div>

              <Select
                value={member.agentDefinitionId}
                onValueChange={(agentDefinitionId) =>
                  updateMember(index, { agentDefinitionId, agentVersionId: null })
                }
                disabled={loadingAgents}
              >
                <SelectTrigger aria-label={`成员 ${index + 1} Agent`}>
                  <SelectValue placeholder={loadingAgents ? '加载中…' : '选择已发布的 Agent'} />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {member.agentDefinitionId && !loadingAgents && !agentListed ? (
                <p className="text-xs text-warning">所选 Agent 不在已发布列表中，请重新选择</p>
              ) : null}

              {/* 成员对话总是运行 Agent 当前已发布版本，故不提供版本选择 */}
              <p className="text-xs text-muted-foreground">运行时使用该 Agent 当前已发布版本</p>

              <div className="space-y-1.5">
                <span className="text-xs text-muted-foreground">可发送消息给</span>
                <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs text-foreground">
                    <Checkbox
                      size="sm"
                      checked={broadcast}
                      onCheckedChange={(checked) =>
                        handleToggleTarget(index, TEAM_BROADCAST_TARGET, checked === true)
                      }
                      aria-label={`成员 ${index + 1} 可发给全部`}
                    />
                    全部
                  </label>
                  {otherRoles.map((role) => (
                    <label key={role} className="flex items-center gap-1.5 text-xs text-foreground">
                      <Checkbox
                        size="sm"
                        checked={broadcast || member.canMessage.includes(role)}
                        disabled={broadcast}
                        onCheckedChange={(checked) => handleToggleTarget(index, role, checked === true)}
                        aria-label={`成员 ${index + 1} 可发给 ${role}`}
                      />
                      {role}
                    </label>
                  ))}
                </div>
              </div>

              <Textarea
                aria-label={`成员 ${index + 1} 指令`}
                value={member.instructions}
                onChange={(event) => updateMember(index, { instructions: event.target.value })}
                placeholder="该角色的职责与工作方式"
              />
            </Card>
          )
        })}
      </div>

      <FormField label="负责人" hint="只有负责人可以提交团队结果">
        <Select value={leadValue} onValueChange={handleLeadChange} disabled={draft.members.length === 0}>
          <SelectTrigger aria-label="选择负责人">
            <SelectValue placeholder="选择负责人" />
          </SelectTrigger>
          <SelectContent>
            {draft.members.map((member, index) => (
              <SelectItem key={index} value={String(index)}>
                {member.role || `成员 ${index + 1}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <div className="grid grid-cols-3 gap-2">
        {BUDGET_FIELDS.map(({ key, label, placeholder }) => (
          <FormField key={key} label={label} htmlFor={`team-budget-${key}`}>
            <Input
              id={`team-budget-${key}`}
              type="number"
              min={1}
              step={1}
              value={draft.budget[key] ?? ''}
              placeholder={placeholder}
              onChange={(event) => handleBudgetChange(key, event.target.value)}
            />
          </FormField>
        ))}
      </div>

      <FormField
        label="输出 Schema（可选）"
        htmlFor="team-output-schema"
        hint="JSON Schema 对象；配置后负责人提交的产物需通过校验"
        error={schemaError}
      >
        <Textarea
          id="team-output-schema"
          rows={5}
          value={schemaText}
          onChange={handleSchemaChange}
          aria-invalid={schemaError !== null}
          className="font-mono text-xs"
          placeholder='{"type": "object", "properties": {}}'
        />
      </FormField>

      {issues.length > 0 ? (
        <Alert variant="error" title="团队配置未通过校验" data-testid="team-config-errors">
          <ul className="list-disc space-y-0.5 pl-4 text-xs">
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </Alert>
      ) : null}
    </div>
  )
})
