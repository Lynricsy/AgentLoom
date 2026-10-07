import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Check, Copy, ShieldAlert } from 'lucide-react'

import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { useToast } from '@/shared/ui/toast'

import { useCreateAgentApiKey } from '../api/agentApiKeyQueries'
import { copyText } from '../lib/clipboard'
import { resolveProblemDetail } from '../lib/problemDetail'
import type { CreateAgentApiKeyInput, CreatedAgentApiKey } from '../types'

interface AgentApiKeyCreateDialogProps {
  agentId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface FormState {
  name: string
  rateLimitPerMinute: string
  maxConcurrentRuns: string
  expiresAt: string
}

type FormErrors = Partial<Record<keyof FormState, string>>

/** 与服务端 `CreateAgentApiKeySchema` 的取值范围保持一致 */
const NAME_MAX_LENGTH = 255
const RATE_LIMIT_RANGE = { min: 1, max: 6000 } as const
const CONCURRENCY_RANGE = { min: 1, max: 50 } as const
const DEFAULT_MAX_CONCURRENT_RUNS = 5

const EMPTY_FORM: FormState = {
  name: '',
  rateLimitPerMinute: '',
  maxConcurrentRuns: String(DEFAULT_MAX_CONCURRENT_RUNS),
  expiresAt: '',
}

function parseIntegerInRange(
  value: string,
  range: { min: number; max: number },
): number | null {
  const parsed = Number(value.trim())

  return Number.isInteger(parsed) && parsed >= range.min && parsed <= range.max
    ? parsed
    : null
}

/** 校验表单并产出请求体；有错误时返回 errors */
function buildInput(
  form: FormState,
  now: number,
): { input: CreateAgentApiKeyInput } | { errors: FormErrors } {
  const errors: FormErrors = {}
  const name = form.name.trim()

  if (!name) {
    errors.name = '请填写 Key 名称'
  }

  let rateLimitPerMinute: number | undefined

  if (form.rateLimitPerMinute.trim()) {
    const parsed = parseIntegerInRange(form.rateLimitPerMinute, RATE_LIMIT_RANGE)

    if (parsed === null) {
      errors.rateLimitPerMinute = `请输入 ${RATE_LIMIT_RANGE.min} 到 ${RATE_LIMIT_RANGE.max} 之间的整数`
    } else {
      rateLimitPerMinute = parsed
    }
  }

  const maxConcurrentRuns = parseIntegerInRange(
    form.maxConcurrentRuns,
    CONCURRENCY_RANGE,
  )

  if (maxConcurrentRuns === null) {
    errors.maxConcurrentRuns = `请输入 ${CONCURRENCY_RANGE.min} 到 ${CONCURRENCY_RANGE.max} 之间的整数`
  }

  let expiresAt: string | undefined

  if (form.expiresAt.trim()) {
    // `datetime-local` 是本地时间，转成带时区的 ISO 字符串提交
    const parsed = new Date(form.expiresAt)

    if (Number.isNaN(parsed.getTime())) {
      errors.expiresAt = '请填写有效的日期时间'
    } else if (parsed.getTime() <= now) {
      errors.expiresAt = '过期时间必须晚于当前时间'
    } else {
      expiresAt = parsed.toISOString()
    }
  }

  if (Object.keys(errors).length > 0 || maxConcurrentRuns === null) {
    return { errors }
  }

  return {
    input: { name, rateLimitPerMinute, maxConcurrentRuns, expiresAt },
  }
}

interface FieldProps {
  id: string
  label: string
  optional?: boolean
  error?: string
  hint: ReactNode
  children: ReactNode
}

function Field({ id, label, optional = false, error, hint, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium text-foreground">
        {label}
        {optional ? (
          <span className="ml-1 font-normal text-muted-foreground">（可选）</span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p id={`${id}-message`} className="text-xs font-medium text-error">
          {error}
        </p>
      ) : (
        <p id={`${id}-message`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  )
}

export function AgentApiKeyCreateDialog({
  agentId,
  open,
  onOpenChange,
}: AgentApiKeyCreateDialogProps) {
  const { notify } = useToast()
  const createMutation = useCreateAgentApiKey(agentId)

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors] = useState<FormErrors>({})
  const [created, setCreated] = useState<CreatedAgentApiKey | null>(null)
  const [copied, setCopied] = useState(false)
  const keyRef = useRef<HTMLElement>(null)

  function handleOpenChange(next: boolean) {
    if (!next) {
      // 关闭即销毁明文 key：这是它在前端存在的唯一生命周期
      setForm(EMPTY_FORM)
      setErrors({})
      setCreated(null)
      setCopied(false)
    }

    onOpenChange(next)
  }

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => {
      if (!current[field]) {
        return current
      }

      const next = { ...current }
      delete next[field]
      return next
    })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const result = buildInput(form, Date.now())

    if ('errors' in result) {
      setErrors(result.errors)
      return
    }

    setErrors({})

    try {
      const apiKey = await createMutation.mutateAsync(result.input)

      setCreated(apiKey)
      notify({
        variant: 'success',
        title: 'API Key 已创建',
        description: `「${apiKey.name}」已生成，请立即复制保存。`,
      })
    } catch (error) {
      notify({
        variant: 'error',
        title: '创建失败',
        description: resolveProblemDetail(error, '创建 API Key 时发生未知错误。'),
      })
    }
  }

  async function handleCopy() {
    if (!created) {
      return
    }

    const outcome = await copyText(created.key, keyRef.current)

    if (outcome === 'copied') {
      setCopied(true)
      notify({ variant: 'success', description: 'API Key 已复制到剪贴板。' })
      return
    }

    notify({
      variant: 'warning',
      title: '无法自动复制',
      description:
        outcome === 'selected'
          ? '当前浏览器不允许自动复制，已为你选中 Key，请按 Ctrl / Cmd + C 手动复制。'
          : '当前浏览器不允许自动复制，请手动选中下方 Key 后复制。',
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="md" data-testid="agent-api-key-create-dialog">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>保存你的 API Key</DialogTitle>
              <DialogDescription>
                这是明文 Key 唯一一次出现的机会，关闭后不会再次显示。
              </DialogDescription>
            </DialogHeader>

            <DialogBody className="space-y-4">
              <div
                className="flex gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5"
                role="alert"
              >
                <ShieldAlert
                  className="mt-0.5 h-4 w-4 shrink-0 text-warning"
                  aria-hidden
                />
                <p className="text-xs leading-relaxed text-warning">
                  请立即复制并存入调用方的密钥管理器。不要把 Key 写进前端代码或公开仓库，遗失只能吊销后重新创建。
                </p>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-medium text-muted-foreground">{created.name}</span>
                <div className="flex items-start gap-2">
                  <code
                    ref={keyRef}
                    data-testid="agent-api-key-plaintext"
                    className="min-w-0 flex-1 break-all rounded-lg border border-border bg-muted px-3 py-2 font-mono text-xs leading-relaxed text-foreground"
                  >
                    {created.key}
                  </code>
                  <Button
                    variant="secondary"
                    size="icon"
                    aria-label="复制 API Key"
                    onClick={handleCopy}
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-success" aria-hidden />
                    ) : (
                      <Copy className="h-4 w-4" aria-hidden />
                    )}
                  </Button>
                </div>
              </div>
            </DialogBody>

            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>我已保存</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <DialogHeader>
              <DialogTitle>创建 API Key</DialogTitle>
              <DialogDescription>
                Key 只能调用当前 Agent 的已发布版本。请为每个接入方单独创建，便于限流与吊销。
              </DialogDescription>
            </DialogHeader>

            <DialogBody className="space-y-4">
              <Field
                id="agent-api-key-name"
                label="名称"
                error={errors.name}
                hint="便于日后在列表中辨认接入方。"
              >
                <Input
                  id="agent-api-key-name"
                  value={form.name}
                  maxLength={NAME_MAX_LENGTH}
                  placeholder="例如：CRM 客服机器人"
                  aria-invalid={errors.name ? true : undefined}
                  aria-describedby="agent-api-key-name-message"
                  onChange={(event) => updateField('name', event.target.value)}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="agent-api-key-rate-limit"
                  label="每分钟请求上限"
                  optional
                  error={errors.rateLimitPerMinute}
                  hint="留空则沿用组织的 API 速率限制。"
                >
                  <Input
                    id="agent-api-key-rate-limit"
                    type="number"
                    inputMode="numeric"
                    min={RATE_LIMIT_RANGE.min}
                    max={RATE_LIMIT_RANGE.max}
                    step={1}
                    value={form.rateLimitPerMinute}
                    placeholder="例如：60"
                    aria-invalid={errors.rateLimitPerMinute ? true : undefined}
                    aria-describedby="agent-api-key-rate-limit-message"
                    onChange={(event) =>
                      updateField('rateLimitPerMinute', event.target.value)
                    }
                  />
                </Field>

                <Field
                  id="agent-api-key-max-concurrent-runs"
                  label="最大并发 run 数"
                  error={errors.maxConcurrentRuns}
                  hint="同时排队或运行中的 run 超出后返回 429。"
                >
                  <Input
                    id="agent-api-key-max-concurrent-runs"
                    type="number"
                    inputMode="numeric"
                    min={CONCURRENCY_RANGE.min}
                    max={CONCURRENCY_RANGE.max}
                    step={1}
                    value={form.maxConcurrentRuns}
                    aria-invalid={errors.maxConcurrentRuns ? true : undefined}
                    aria-describedby="agent-api-key-max-concurrent-runs-message"
                    onChange={(event) =>
                      updateField('maxConcurrentRuns', event.target.value)
                    }
                  />
                </Field>
              </div>

              <Field
                id="agent-api-key-expires-at"
                label="过期时间"
                optional
                error={errors.expiresAt}
                hint="留空表示长期有效，直至被吊销。"
              >
                <Input
                  id="agent-api-key-expires-at"
                  type="datetime-local"
                  value={form.expiresAt}
                  aria-invalid={errors.expiresAt ? true : undefined}
                  aria-describedby="agent-api-key-expires-at-message"
                  onChange={(event) => updateField('expiresAt', event.target.value)}
                />
              </Field>
            </DialogBody>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? '创建中…' : '创建 Key'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
