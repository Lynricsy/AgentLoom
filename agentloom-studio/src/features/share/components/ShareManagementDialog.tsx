import { memo, useCallback, useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  Copy,
  Eye,
  Link2,
  Loader2,
  Plus,
  Share2,
  Trash2,
  X,
} from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { useToast } from '@/shared/ui/toast'
import { useShareList } from '../api/shareQueries'
import { useCreateShare, useRevokeShare } from '../api/shareMutations'
import type { ShareRecord } from '../types'

interface ShareManagementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workflowId: string
}

type ShareTypeOption = 'read_only' | 'copyable'
type ShareStatus = 'active' | 'expired' | 'revoked'
type ShareExpiryPreset = 'never' | '1d' | '7d' | '30d'

const shareTypeLabels: Record<ShareTypeOption, string> = {
  read_only: '仅查看',
  copyable: '可复制',
}

const shareTypeBadgeStyles: Record<ShareTypeOption, string> = {
  read_only: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
  copyable: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
}

const shareStatusLabels: Record<ShareStatus, string> = {
  active: '生效中',
  expired: '已过期',
  revoked: '已撤销',
}

const shareStatusBadgeStyles: Record<ShareStatus, string> = {
  active: 'border-green-500/30 bg-green-500/10 text-green-400',
  expired: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  revoked: 'border-rose-500/30 bg-rose-500/10 text-rose-400',
}

const shareExpiryPresetLabels: Record<ShareExpiryPreset, string> = {
  never: '永不过期',
  '1d': '1天',
  '7d': '7天',
  '30d': '30天',
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt) < new Date()
}

function getShareStatus(share: ShareRecord): ShareStatus {
  if (share.isRevoked) return 'revoked'
  if (isExpired(share.expiresAt)) return 'expired'
  return 'active'
}

function resolveShareExpiryPreset(preset: ShareExpiryPreset): string | undefined {
  if (preset === 'never') {
    return undefined
  }

  const durationDays: Record<Exclude<ShareExpiryPreset, 'never'>, number> = {
    '1d': 1,
    '7d': 7,
    '30d': 30,
  }

  return new Date(Date.now() + durationDays[preset] * 24 * 60 * 60 * 1000).toISOString()
}

function truncateUrl(url: string, maxLen = 45): string {
  if (url.length <= maxLen) return url
  return url.slice(0, maxLen) + '...'
}

const ShareItem = memo(function ShareItem({
  share,
  onRevoke,
  isRevoking,
}: {
  share: ShareRecord
  onRevoke: (shareId: string) => void
  isRevoking: boolean
}) {
  const { notify } = useToast()
  const [confirmRevoke, setConfirmRevoke] = useState(false)

  const status = getShareStatus(share)

  const handleCopyUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(share.shareUrl)
      notify({ description: '链接已复制到剪贴板', variant: 'success' })
    } catch {
      notify({ description: '复制失败', variant: 'error' })
    }
  }, [share.shareUrl, notify])

  const handleRevoke = useCallback(() => {
    if (!confirmRevoke) {
      setConfirmRevoke(true)
      return
    }
    onRevoke(share.id)
    setConfirmRevoke(false)
  }, [confirmRevoke, share.id, onRevoke])

  const handleCancelRevoke = useCallback(() => {
    setConfirmRevoke(false)
  }, [])

  return (
    <div
      className="rounded-md border border-border bg-background/50 p-3"
      data-testid="share-item"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium',
                shareTypeBadgeStyles[share.shareType],
              )}
            >
              {shareTypeLabels[share.shareType]}
            </span>
            <span
              className={cn(
                'inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium',
                shareStatusBadgeStyles[status],
              )}
              data-testid={`share-status-${status}`}
            >
              {shareStatusLabels[status]}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <Link2 className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="truncate text-xs text-muted-foreground" title={share.shareUrl}>
              {truncateUrl(share.shareUrl)}
            </span>
            <button
              type="button"
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={handleCopyUrl}
              aria-label="复制链接"
              data-testid="btn-copy-share-url"
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Eye className="h-3 w-3" />
              {share.viewCount}
            </span>
            <span className="inline-flex items-center gap-1">
              <Copy className="h-3 w-3" />
              {share.copyCount}
            </span>
            {share.expiresAt && status !== 'revoked' && (
              <span>过期: {formatDate(share.expiresAt)}</span>
            )}
            <span>创建: {formatDate(share.createdAt)}</span>
          </div>
        </div>

        <div className="shrink-0">
          {share.isRevoked ? null : confirmRevoke ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="rounded px-2 py-1 text-[11px] font-medium text-red-400 hover:bg-red-500/10"
                onClick={handleRevoke}
                disabled={isRevoking}
                data-testid="btn-confirm-revoke"
              >
                {isRevoking ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  '确认'
                )}
              </button>
              <button
                type="button"
                className="rounded px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted"
                onClick={handleCancelRevoke}
                data-testid="btn-cancel-revoke"
              >
                取消
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
              onClick={handleRevoke}
              aria-label="撤销分享"
              data-testid="btn-revoke-share"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
})

export const ShareManagementDialog = memo(function ShareManagementDialog({
  open,
  onOpenChange,
  workflowId,
}: ShareManagementDialogProps) {
  const { notify } = useToast()
  const { data: shareList, isLoading } = useShareList(workflowId)
  const createShareMutation = useCreateShare()
  const revokeShareMutation = useRevokeShare(workflowId)

  const [shareType, setShareType] = useState<ShareTypeOption>('read_only')
  const [expiryPreset, setExpiryPreset] = useState<ShareExpiryPreset>('never')

  useEffect(() => {
    if (open) {
      setShareType('read_only')
      setExpiryPreset('never')
      createShareMutation.reset()
    }
  }, [open, createShareMutation])

  const handleCreate = useCallback(async () => {
    try {
      const expiresAt = resolveShareExpiryPreset(expiryPreset)
      const result = await createShareMutation.mutateAsync({
        workflowDefinitionId: workflowId,
        shareType,
        ...(expiresAt ? { expiresAt } : {}),
      })
      notify({ description: '分享链接已创建', variant: 'success' })
      try {
        await navigator.clipboard.writeText(result.shareUrl)
        notify({ description: '链接已自动复制到剪贴板', variant: 'success' })
      } catch {
        // noop
      }
      setExpiryPreset('never')
    } catch {
      notify({ description: '创建分享链接失败', variant: 'error' })
    }
  }, [workflowId, shareType, expiryPreset, createShareMutation, notify])

  const handleRevoke = useCallback(
    async (shareId: string) => {
      try {
        await revokeShareMutation.mutateAsync(shareId)
        notify({ description: '分享链接已撤销', variant: 'success' })
      } catch {
        notify({ description: '撤销失败', variant: 'error' })
      }
    },
    [revokeShareMutation, notify],
  )

  const shares = shareList?.data ?? []
  const isCreating = createShareMutation.isPending

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2',
            'rounded-lg border border-border bg-surface shadow-xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'max-h-[85vh] overflow-y-auto',
          )}
          data-testid="share-management-dialog"
        >
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div className="flex items-center gap-2">
              <Share2 className="h-5 w-5 text-sky-500" />
              <div>
                <Dialog.Title className="text-base font-medium">分享管理</Dialog.Title>
                <Dialog.Description className="mt-0.5 text-xs text-muted-foreground">
                  管理工作流的分享链接
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="space-y-4 px-6 py-4">
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-foreground">现有分享链接</h3>

              {isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : shares.length === 0 ? (
                <div className="rounded-md border border-dashed border-border py-6 text-center">
                  <Link2 className="mx-auto h-8 w-8 text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">暂无分享链接</p>
                </div>
              ) : (
                <div className="space-y-2" data-testid="share-list">
                  {shares.map((share) => (
                    <ShareItem
                      key={share.id}
                      share={share}
                      onRevoke={handleRevoke}
                      isRevoking={revokeShareMutation.isPending}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3 border-t border-border pt-4">
              <h3 className="text-sm font-medium text-foreground">创建新分享</h3>

              <div className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  分享类型
                </span>
                <div className="flex gap-2" role="radiogroup" aria-label="分享类型">
                  {(['read_only', 'copyable'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      className={cn(
                        'flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors',
                        shareType === type
                          ? type === 'read_only'
                            ? 'border-sky-500/50 bg-sky-500/10 text-sky-400'
                            : 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted',
                      )}
                      onClick={() => setShareType(type)}
                      data-testid={`share-type-${type}`}
                    >
                      {shareTypeLabels[type]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">有效期</span>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="分享有效期">
                  {(['never', '1d', '7d', '30d'] as const).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={cn(
                        'rounded-md border px-3 py-2 text-xs font-medium transition-colors',
                        expiryPreset === preset
                          ? 'border-sky-500/50 bg-sky-500/10 text-sky-400'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted',
                      )}
                      onClick={() => setExpiryPreset(preset)}
                      data-testid={`share-expiry-${preset}`}
                    >
                      {shareExpiryPresetLabels[preset]}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                className={cn(
                  'inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium shadow-sm',
                  isCreating
                    ? 'cursor-not-allowed bg-muted text-muted-foreground'
                    : 'bg-sky-600 text-white hover:bg-sky-700',
                )}
                disabled={isCreating}
                onClick={handleCreate}
                data-testid="btn-create-share"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    创建中...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    创建分享链接
                  </>
                )}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
})

export default ShareManagementDialog
