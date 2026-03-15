import { useState } from 'react'
import { AlertTriangle, Key, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'

import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/utils'

import { useRevokeTenantKey } from '../api/tenantKeyMutations'
import { useTenantKeys } from '../api/tenantKeyQueries'
import { KeyGenerateDialog } from './KeyGenerateDialog'
import { KeyImportDialog } from './KeyImportDialog'
import { KeyRotateDialog } from './KeyRotateDialog'
import { KeyStatusBadge } from './KeyStatusBadge'

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function TenantKeyManagement() {
  const keysQuery = useTenantKeys()
  const revokeMutation = useRevokeTenantKey()

  const [generateOpen, setGenerateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [rotateOpen, setRotateOpen] = useState(false)
  const [revokeConfirmOpen, setRevokeConfirmOpen] = useState(false)

  const keys = keysQuery.data
  const activeKey = Array.isArray(keys)
    ? keys.find((k) => k.status === 'active' || k.status === 'rotating')
    : undefined
  const hasKey = !!activeKey

  function handleRevoke() {
    if (!activeKey) return
    revokeMutation.mutate(activeKey.id, {
      onSuccess: () => setRevokeConfirmOpen(false),
    })
  }

  if (keysQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        加载加密密钥信息…
      </div>
    )
  }

  if (keysQuery.error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
        <AlertTriangle className="h-6 w-6 text-rose-500" />
        <p className="text-sm text-rose-500">加载密钥信息失败</p>
        <Button variant="outline" size="sm" onClick={() => keysQuery.refetch()}>
          重试
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">端到端加密</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          管理租户级 RSA-4096 加密密钥。私钥仅存储在您的浏览器中，服务器无法访问。
        </p>
      </div>

      {hasKey ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-border/60 bg-card/60 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Key className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">当前加密密钥</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    RSA-4096 · AES-256-GCM
                  </p>
                </div>
              </div>
              <KeyStatusBadge status={activeKey.status} />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-muted-foreground">指纹</p>
                <p className="mt-1 truncate font-mono text-foreground">
                  {activeKey.keyFingerprint}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">激活时间</p>
                <p className="mt-1 text-foreground">
                  {formatDate(activeKey.activatedAt)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">创建时间</p>
                <p className="mt-1 text-foreground">
                  {formatDate(activeKey.createdAt)}
                </p>
              </div>
              {activeKey.rotatedAt && (
                <div>
                  <p className="text-muted-foreground">最近轮换</p>
                  <p className="mt-1 text-foreground">
                    {formatDate(activeKey.rotatedAt)}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {activeKey.status === 'active' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRotateOpen(true)}
                >
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  轮换密钥
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-rose-500 hover:text-rose-600"
                  onClick={() => setRevokeConfirmOpen(true)}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  撤销密钥
                </Button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border/60 bg-card/30 py-12">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Key className="h-7 w-7 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">尚未配置加密密钥</p>
            <p className="mt-1 text-xs text-muted-foreground">
              生成或导入 RSA-4096 密钥对以启用端到端加密
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setGenerateOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              生成密钥对
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImportOpen(true)}
            >
              导入私钥
            </Button>
          </div>
        </div>
      )}

      {Array.isArray(keys) && keys.filter((k) => k.status === 'revoked').length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-medium text-foreground">已撤销的密钥</h3>
          <div className="space-y-2">
            {keys
              .filter((k) => k.status === 'revoked')
              .map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between rounded-lg border border-border/40 bg-card/30 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {key.keyFingerprint}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      撤销于 {formatDate(key.revokedAt)}
                    </p>
                  </div>
                  <KeyStatusBadge status={key.status} />
                </div>
              ))}
          </div>
        </div>
      )}

      <KeyGenerateDialog open={generateOpen} onOpenChange={setGenerateOpen} />
      <KeyImportDialog open={importOpen} onOpenChange={setImportOpen} />

      {activeKey && (
        <KeyRotateDialog
          open={rotateOpen}
          onOpenChange={setRotateOpen}
          keyId={activeKey.id}
          currentFingerprint={activeKey.keyFingerprint}
        />
      )}

      <Dialog.Root open={revokeConfirmOpen} onOpenChange={setRevokeConfirmOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:animate-in data-[state=open]:fade-in" />
          <Dialog.Content
            className={cn(
              'fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2',
              'rounded-xl border border-border bg-surface p-6 shadow-xl',
            )}
          >
            <Dialog.Title className="text-base font-semibold text-foreground">
              确认撤销密钥
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              撤销后将无法使用此密钥加密新数据。已加密的数据仍需此密钥的私钥才能解密。此操作不可撤销。
            </Dialog.Description>

            <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <p className="text-xs text-amber-700">
                  请确保您已备份私钥。撤销后，如果您丢失私钥，将无法解密已加密的证据数据。
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button variant="outline" size="sm">
                  取消
                </Button>
              </Dialog.Close>
              <Button
                size="sm"
                className="bg-rose-600 text-white hover:bg-rose-700"
                onClick={handleRevoke}
                disabled={revokeMutation.isPending}
              >
                {revokeMutation.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                )}
                确认撤销
              </Button>
            </div>

            {revokeMutation.error && (
              <p className="mt-3 text-xs text-rose-500">
                撤销失败：
                {revokeMutation.error instanceof Error
                  ? revokeMutation.error.message
                  : '请稍后重试'}
              </p>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
