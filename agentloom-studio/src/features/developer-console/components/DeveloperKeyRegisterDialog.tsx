import { useState, type FormEvent } from 'react'
import { Copy, ShieldCheck } from 'lucide-react'

import { Badge } from '@/shared/ui/badge'
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
import { Textarea } from '@/shared/ui/textarea'
import { useToast } from '@/shared/ui/toast'

import { useRegisterDeveloperKey } from '../api/developer-key.queries'
import {
  PEM_PUBLIC_KEY_BEGIN,
  resolveDeveloperConsoleErrorMessage,
  validatePublicKeyPem,
} from '../lib/developerKey'
import type { DeveloperKey } from '../types'

const PEM_PLACEHOLDER = `${PEM_PUBLIC_KEY_BEGIN}\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A...\n-----END PUBLIC KEY-----`

interface DeveloperKeyRegisterDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DeveloperKeyRegisterDialog({
  open,
  onOpenChange,
}: DeveloperKeyRegisterDialogProps) {
  const { notify } = useToast()
  const registerMutation = useRegisterDeveloperKey()

  const [publicKey, setPublicKey] = useState('')
  const [label, setLabel] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [registeredKey, setRegisteredKey] = useState<DeveloperKey | null>(null)

  function handleOpenChange(next: boolean) {
    if (!next) {
      setPublicKey('')
      setLabel('')
      setFormError(null)
      setRegisteredKey(null)
      registerMutation.reset()
    }

    onOpenChange(next)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const validationError = validatePublicKeyPem(publicKey)
    if (validationError) {
      setFormError(validationError)
      return
    }

    setFormError(null)
    const trimmedLabel = label.trim()

    registerMutation.mutate(
      {
        publicKey: publicKey.trim(),
        label: trimmedLabel || undefined,
      },
      {
        onSuccess: (created) => {
          setRegisteredKey(created)
          notify({
            title: '公钥已注册',
            description: '后续上传的插件包将使用该密钥验签。',
            variant: 'success',
          })
        },
        onError: async (error) => {
          notify({
            title: '注册失败',
            description: await resolveDeveloperConsoleErrorMessage(
              error,
              '公钥注册失败，请检查内容后重试。',
            ),
            variant: 'error',
          })
        },
      },
    )
  }

  async function handleCopyFingerprint(fingerprint: string) {
    if (!navigator?.clipboard?.writeText) {
      notify({
        title: '复制失败',
        description: '当前环境不支持剪贴板复制，请手动复制指纹。',
        variant: 'warning',
      })
      return
    }

    try {
      await navigator.clipboard.writeText(fingerprint)
      notify({ description: '指纹已复制到剪贴板。', variant: 'success' })
    } catch {
      notify({
        title: '复制失败',
        description: '无法写入剪贴板，请手动复制指纹。',
        variant: 'error',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="lg">
        {registeredKey ? (
          <>
            <DialogHeader>
              <DialogTitle>公钥注册成功</DialogTitle>
              <DialogDescription>
                打包插件时用对应私钥签名，平台会按下方指纹匹配校验。
              </DialogDescription>
            </DialogHeader>

            <DialogBody className="space-y-4">
              <div className="flex items-start gap-3 rounded-card border border-success/25 bg-success/10 p-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <div className="min-w-0 space-y-1">
                  <p className="text-xs font-medium text-foreground">
                    {registeredKey.label?.trim() || '未命名密钥'}
                  </p>
                  <p className="text-xs text-muted">
                    公钥已保存，可随时在列表中撤销。
                  </p>
                </div>
                <Badge variant="success" size="sm" className="ml-auto shrink-0">
                  有效
                </Badge>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-medium text-foreground">密钥指纹</p>
                <div className="flex items-start gap-2">
                  <code
                    data-testid="developer-key-fingerprint"
                    className="min-w-0 flex-1 break-all rounded-card border border-border bg-surface-elevated px-3 py-2 font-mono text-xs text-foreground"
                  >
                    {registeredKey.keyFingerprint}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label="复制指纹"
                    onClick={() => {
                      void handleCopyFingerprint(registeredKey.keyFingerprint)
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </DialogBody>

            <DialogFooter>
              <Button type="button" onClick={() => handleOpenChange(false)}>
                完成
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>注册开发者公钥</DialogTitle>
              <DialogDescription>
                粘贴 SPKI 格式的 PEM 公钥，平台用它校验你上传的 .alp 插件包签名。
              </DialogDescription>
            </DialogHeader>

            <DialogBody className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="developer-key-label"
                  className="text-xs font-medium text-foreground"
                >
                  标签（可选）
                </label>
                <Input
                  id="developer-key-label"
                  value={label}
                  maxLength={255}
                  placeholder="例如：CI 签名密钥"
                  onChange={(event) => setLabel(event.target.value)}
                />
                <p className="text-xs text-muted">
                  用于区分多台构建机或多个成员的密钥。
                </p>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="developer-key-public-key"
                  className="text-xs font-medium text-foreground"
                >
                  公钥（PEM）
                </label>
                <Textarea
                  id="developer-key-public-key"
                  value={publicKey}
                  rows={9}
                  spellCheck={false}
                  placeholder={PEM_PLACEHOLDER}
                  aria-invalid={formError ? true : undefined}
                  aria-describedby={
                    formError ? 'developer-key-public-key-error' : undefined
                  }
                  className="font-mono text-xs"
                  onChange={(event) => {
                    setPublicKey(event.target.value)
                    if (formError) {
                      setFormError(null)
                    }
                  }}
                />
                {formError ? (
                  <p
                    id="developer-key-public-key-error"
                    role="alert"
                    className="text-xs font-medium text-error"
                  >
                    {formError}
                  </p>
                ) : (
                  <p className="text-xs text-muted">
                    只接受公钥，请勿粘贴私钥内容。
                  </p>
                )}
              </div>
            </DialogBody>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => handleOpenChange(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={registerMutation.isPending}>
                {registerMutation.isPending ? '注册中…' : '注册公钥'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
