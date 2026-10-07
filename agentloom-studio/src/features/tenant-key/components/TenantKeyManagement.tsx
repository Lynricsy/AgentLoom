import { useState } from 'react'
import {
  AlertTriangle,
  Key,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'

import { PageContainer } from '@/shared/components'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'

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

function sortKeysByStatus<
  T extends { status: string; updatedAt: string; createdAt: string },
>(keys: T[]): T[] {
  const rank: Record<string, number> = {
    active: 0,
    rotating: 1,
    revoked: 2,
  }

  return [...keys].sort((left, right) => {
    const rankDiff = (rank[left.status] ?? 99) - (rank[right.status] ?? 99)
    if (rankDiff !== 0) return rankDiff

    const updatedDiff =
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    if (!Number.isNaN(updatedDiff) && updatedDiff !== 0) return updatedDiff

    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  })
}

export function TenantKeyManagement() {
  const keysQuery = useTenantKeys()
  const revokeMutation = useRevokeTenantKey()

  const [generateOpen, setGenerateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [rotateOpen, setRotateOpen] = useState(false)
  const [revokeConfirmOpen, setRevokeConfirmOpen] = useState(false)

  const keys = keysQuery.data
  const sortedKeys = Array.isArray(keys) ? sortKeysByStatus(keys) : []
  const activeKey =
    sortedKeys.find((k) => k.status === 'active') ??
    sortedKeys.find((k) => k.status === 'rotating')
  const hasKey = !!activeKey
  const historicalKeys = activeKey
    ? sortedKeys.filter((key) => key.id !== activeKey.id)
    : sortedKeys

  function handleRevoke() {
    if (!activeKey) return
    revokeMutation.mutate(activeKey.id, {
      onSuccess: () => setRevokeConfirmOpen(false),
    })
  }

  if (keysQuery.isLoading) {
    return (
      <PageContainer width="narrow">
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 size-5 animate-spin" />
          加载加密密钥信息…
        </div>
      </PageContainer>
    )
  }

  if (keysQuery.error) {
    return (
      <PageContainer width="narrow">
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <AlertTriangle className="size-6 text-error" />
          <p className="text-sm text-error">加载密钥信息失败</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => keysQuery.refetch()}
          >
            重试
          </Button>
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer width="narrow">
      <div>
        <h2 className="text-base font-semibold text-foreground">端到端加密</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          管理租户级 RSA-4096
          加密密钥。私钥不会上传到服务器，但浏览器扩展、同源脚本或本机受损时可能读取本地密钥材料，请务必保留离线备份。
        </p>
      </div>

      {hasKey ? (
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                  <Key className="size-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    当前加密密钥
                  </p>
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
          </Card>

          <div className="flex flex-wrap gap-2">
            {activeKey.status === 'active' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRotateOpen(true)}
                >
                  <RefreshCw />
                  轮换密钥
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="hover:bg-error/10 hover:text-error"
                  onClick={() => setRevokeConfirmOpen(true)}
                >
                  <Trash2 />
                  撤销密钥
                </Button>
              </>
            )}
          </div>
        </div>
      ) : (
        <EmptyState
          icon={Key}
          title="尚未配置加密密钥"
          description="生成或导入 RSA-4096 密钥对以启用端到端加密"
          action={
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setGenerateOpen(true)}>
                <Plus />
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
          }
        />
      )}

      {historicalKeys.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-medium text-foreground">历史密钥</h3>
          <div className="space-y-2">
            {historicalKeys.map((key) => (
              <Card
                key={key.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {key.keyFingerprint}
                  </p>
                  <p className="mt-0.5 text-2xs text-subtle-foreground">
                    {key.status === 'rotating'
                      ? `轮换于 ${formatDate(key.rotatedAt)}`
                      : `撤销于 ${formatDate(key.revokedAt)}`}
                  </p>
                </div>
                <KeyStatusBadge status={key.status} />
              </Card>
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

      <Dialog open={revokeConfirmOpen} onOpenChange={setRevokeConfirmOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>确认撤销密钥</DialogTitle>
            <DialogDescription>
              撤销后将无法使用此密钥加密新数据。已加密的数据仍需此密钥的私钥才能解密。此操作不可撤销。
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-3">
            <div className="rounded-lg border border-warning/20 bg-warning/5 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                <p className="text-xs text-warning">
                  请确保您已备份私钥。撤销后，如果您丢失私钥，将无法解密已加密的证据数据。
                </p>
              </div>
            </div>

            {revokeMutation.error && (
              <p className="text-xs text-error">
                撤销失败：
                {revokeMutation.error instanceof Error
                  ? revokeMutation.error.message
                  : '请稍后重试'}
              </p>
            )}
          </DialogBody>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">
                取消
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleRevoke}
              disabled={revokeMutation.isPending}
            >
              {revokeMutation.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Trash2 />
              )}
              确认撤销
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  )
}
