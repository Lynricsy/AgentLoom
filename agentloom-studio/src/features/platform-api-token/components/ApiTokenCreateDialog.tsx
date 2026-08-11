import { useRef, useState, type FormEvent } from 'react'
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

import { useCreatePlatformApiToken } from '../api/platformApiTokenQueries'
import type { CreatedPlatformApiToken } from '../types'

interface ApiTokenCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface FormState {
  name: string
  scopes: string
  expiresAt: string
}

const EMPTY_FORM: FormState = { name: '', scopes: '', expiresAt: '' }

const NAME_MAX_LENGTH = 255
const SCOPES_MAX_LENGTH = 1024

/** `datetime-local` 的本地时间字符串转 ISO；非法输入返回 undefined */
function toIsoDateTime(value: string): string | undefined {
  if (!value.trim()) {
    return undefined
  }

  const parsed = new Date(value)

  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
}

/** `navigator.clipboard` 不可用时选中文本，让用户手动 Ctrl/Cmd + C */
function selectElementText(element: HTMLElement | null): boolean {
  const selection = globalThis.getSelection?.()

  if (!element || !selection || typeof document.createRange !== 'function') {
    return false
  }

  const range = document.createRange()
  range.selectNodeContents(element)
  selection.removeAllRanges()
  selection.addRange(range)

  return true
}

export function ApiTokenCreateDialog({
  open,
  onOpenChange,
}: ApiTokenCreateDialogProps) {
  const { notify } = useToast()
  const createMutation = useCreatePlatformApiToken()

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [nameError, setNameError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatedPlatformApiToken | null>(null)
  const [copied, setCopied] = useState(false)
  const tokenRef = useRef<HTMLElement>(null)

  function handleOpenChange(next: boolean) {
    if (!next) {
      // 关闭即销毁明文 token：这是它在前端存在的唯一生命周期
      setForm(EMPTY_FORM)
      setNameError(null)
      setCreated(null)
      setCopied(false)
    }

    onOpenChange(next)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const name = form.name.trim()

    if (!name) {
      setNameError('请填写 Token 名称')
      return
    }

    setNameError(null)

    const scopes = form.scopes.trim()

    try {
      const token = await createMutation.mutateAsync({
        name,
        scopes: scopes || undefined,
        expiresAt: toIsoDateTime(form.expiresAt),
      })

      setCreated(token)
      notify({
        variant: 'success',
        title: 'Token 已创建',
        description: `「${token.name}」已生成，请立即复制保存。`,
      })
    } catch (error) {
      notify({
        variant: 'error',
        title: '创建失败',
        description:
          error instanceof Error ? error.message : '创建 API Token 时发生未知错误。',
      })
    }
  }

  async function handleCopy() {
    if (!created) {
      return
    }

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('clipboard unavailable')
      }

      await navigator.clipboard.writeText(created.token)
      setCopied(true)
      notify({ variant: 'success', description: 'Token 已复制到剪贴板。' })
    } catch {
      const selected = selectElementText(tokenRef.current)
      notify({
        variant: 'warning',
        title: '无法自动复制',
        description: selected
          ? '当前浏览器不允许自动复制，已为你选中 Token，请按 Ctrl / Cmd + C 手动复制。'
          : '当前浏览器不允许自动复制，请手动选中下方 Token 后复制。',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="md" data-testid="api-token-create-dialog">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>保存你的 API Token</DialogTitle>
              <DialogDescription>
                这是明文 Token 唯一一次出现的机会，关闭后不会再次显示。
              </DialogDescription>
            </DialogHeader>

            <DialogBody className="space-y-4">
              <div
                className="flex gap-2 rounded-card border border-warning/30 bg-warning/10 px-3 py-2.5"
                role="alert"
              >
                <ShieldAlert
                  className="mt-0.5 h-4 w-4 shrink-0 text-warning"
                  aria-hidden
                />
                <p className="text-xs leading-relaxed text-warning">
                  请立即复制并存入密钥管理器。关闭后不会再次显示，遗失只能撤销后重新创建。
                </p>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-medium text-muted">
                  {created.name}
                </span>
                <div className="flex items-start gap-2">
                  <code
                    ref={tokenRef}
                    data-testid="api-token-plaintext"
                    className="min-w-0 flex-1 break-all rounded-card border border-border bg-surface-elevated px-3 py-2 font-mono text-xs leading-relaxed text-foreground"
                  >
                    {created.token}
                  </code>
                  <Button
                    variant="secondary"
                    size="icon"
                    aria-label="复制 Token"
                    onClick={handleCopy}
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-success" />
                    ) : (
                      <Copy className="h-4 w-4" />
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
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>创建 API Token</DialogTitle>
              <DialogDescription>
                用于以你的身份调用 AgentLoom 开放接口，请按最小权限原则限定作用域与有效期。
              </DialogDescription>
            </DialogHeader>

            <DialogBody className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="api-token-name"
                  className="text-xs font-medium text-foreground"
                >
                  名称
                </label>
                <Input
                  id="api-token-name"
                  value={form.name}
                  maxLength={NAME_MAX_LENGTH}
                  placeholder="例如：CI 部署流水线"
                  aria-invalid={nameError ? true : undefined}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, name: event.target.value }))
                    if (nameError) {
                      setNameError(null)
                    }
                  }}
                />
                {nameError ? (
                  <p className="text-xs font-medium text-error">{nameError}</p>
                ) : (
                  <p className="text-xs text-muted">便于日后在列表中辨认用途。</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="api-token-scopes"
                  className="text-xs font-medium text-foreground"
                >
                  作用域
                  <span className="ml-1 font-normal text-muted">（可选）</span>
                </label>
                <Input
                  id="api-token-scopes"
                  value={form.scopes}
                  maxLength={SCOPES_MAX_LENGTH}
                  placeholder="workflow:read,execution:write"
                  onChange={(event) =>
                    setForm((current) => ({ ...current, scopes: event.target.value }))
                  }
                />
                <p className="text-xs text-muted">
                  以英文逗号分隔；留空表示继承你当前账号的全部权限。
                </p>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="api-token-expires-at"
                  className="text-xs font-medium text-foreground"
                >
                  过期时间
                  <span className="ml-1 font-normal text-muted">（可选）</span>
                </label>
                <Input
                  id="api-token-expires-at"
                  type="datetime-local"
                  value={form.expiresAt}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      expiresAt: event.target.value,
                    }))
                  }
                />
                <p className="text-xs text-muted">留空表示长期有效，直至被撤销。</p>
              </div>
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
                {createMutation.isPending ? '创建中…' : '创建 Token'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
