import { memo, useCallback, useEffect, useState } from 'react'
import { Copy, Eye, Link2, Loader2, Plus, Share2, Trash2 } from 'lucide-react'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { cn } from '@/shared/lib/utils'
import { Badge, type BadgeProps } from '@/shared/ui/badge'
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
import { useToast } from '@/shared/ui/toast'
import { useShareList } from '../api/shareQueries'
import { useCreateShare, useRevokeShare } from '../api/shareMutations'
import type { ShareRecord, ShareResourceType } from '../types'

interface ShareManagementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  resourceId?: string
  workflowId?: string
  resourceType?: ShareResourceType
}

type ShareTypeOption = 'read_only' | 'copyable'
type ShareStatus = 'active' | 'expired' | 'revoked'
type ShareExpiryPreset = 'never' | '1d' | '7d' | '30d'

type BadgeVariant = NonNullable<BadgeProps['variant']>

const shareTypeLabels: Record<ShareTypeOption, string> = {
  read_only: '仅查看',
  copyable: '可复制',
}

const shareTypeBadgeVariants: Record<ShareTypeOption, BadgeVariant> = {
  read_only: 'info',
  copyable: 'success',
}

const shareStatusLabels: Record<ShareStatus, string> = {
  active: '生效中',
  expired: '已过期',
  revoked: '已撤销',
}

const shareStatusBadgeVariants: Record<ShareStatus, BadgeVariant> = {
  active: 'success',
  expired: 'warning',
  revoked: 'error',
}

const shareExpiryPresetLabels: Record<ShareExpiryPreset, string> = {
  never: '永不过期',
  '1d': '1天',
  '7d': '7天',
  '30d': '30天',
}

/** 选项按钮：选中态用品牌色描边，未选中态与表单控件同层次 */
const OPTION_BASE_CLASS =
  'rounded-md border px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
const OPTION_SELECTED_CLASS = 'border-primary/50 bg-primary/10 text-primary'
const OPTION_IDLE_CLASS =
  'border-border bg-surface text-muted hover:border-border-hover hover:bg-surface-elevated'

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

function getShareStatus(share: ShareRecord): ShareStatus {
  if (share.isRevoked) return 'revoked'
  if (share.expiresAt && new Date(share.expiresAt) < new Date()) return 'expired'
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
      className="rounded-card border border-border bg-surface-elevated p-3"
      data-testid="share-item"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <Badge size="sm" variant={shareTypeBadgeVariants[share.shareType]}>
              {shareTypeLabels[share.shareType]}
            </Badge>
            <Badge
              size="sm"
              variant={shareStatusBadgeVariants[status]}
              data-testid={`share-status-${status}`}
            >
              {shareStatusLabels[status]}
            </Badge>
          </div>

          <div className="flex items-center gap-1.5">
            <Link2 className="h-3 w-3 shrink-0 text-muted" />
            <span className="truncate text-xs text-muted" title={share.shareUrl}>
              {truncateUrl(share.shareUrl)}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              className="h-6 w-6 text-muted hover:text-foreground"
              onClick={handleCopyUrl}
              aria-label="复制链接"
              data-testid="btn-copy-share-url"
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
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
              <Button
                variant="destructive"
                size="sm"
                onClick={handleRevoke}
                disabled={isRevoking}
                data-testid="btn-confirm-revoke"
              >
                {isRevoking ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  '确认'
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancelRevoke}
                data-testid="btn-cancel-revoke"
              >
                取消
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted hover:text-error"
              onClick={handleRevoke}
              aria-label="撤销分享"
              data-testid="btn-revoke-share"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
})

export const ShareManagementDialog = memo(function ShareManagementDialog({
  open,
  onOpenChange,
  resourceId,
  workflowId,
  resourceType = 'workflow',
}: ShareManagementDialogProps) {
  const { notify } = useToast()
  const resolvedResourceId = resourceId ?? workflowId ?? ''
  const { data: shareList, isLoading } = useShareList({
    resourceType,
    resourceId: resolvedResourceId,
  })
  const createShareMutation = useCreateShare()
  const revokeShareMutation = useRevokeShare(resourceType, resolvedResourceId)
  const resetCreateShareMutation = createShareMutation.reset

  const [shareType, setShareType] = useState<ShareTypeOption>('read_only')
  const [expiryPreset, setExpiryPreset] = useState<ShareExpiryPreset>('never')

  useEffect(() => {
    if (open) {
      setShareType('read_only')
      setExpiryPreset('never')
      resetCreateShareMutation()
    }
  }, [open, resetCreateShareMutation])

  const resourceLabel = resourceType === 'agent' ? 'Agent' : '工作流'

  const handleCreate = useCallback(async () => {
    try {
      const expiresAt = resolveShareExpiryPreset(expiryPreset)
      const result = await createShareMutation.mutateAsync({
        ...(resourceType === 'agent'
          ? { agentDefinitionId: resolvedResourceId }
          : { workflowDefinitionId: resolvedResourceId }),
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
    } catch (error) {
      notify({
        description: error instanceof Error ? error.message : '创建分享链接失败',
        variant: 'error',
      })
    }
  }, [resolvedResourceId, resourceType, shareType, expiryPreset, createShareMutation, notify])

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" data-testid="share-management-dialog">
        <DialogHeader className="flex-row items-center gap-2.5">
          <span
            aria-hidden
            className="grid h-9 w-9 shrink-0 place-items-center rounded-card"
            style={{
              backgroundColor:
                'color-mix(in srgb, var(--color-primary) 12%, transparent)',
              color: 'var(--color-primary)',
            }}
          >
            <Share2 className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <DialogTitle>分享管理</DialogTitle>
            <DialogDescription>管理{resourceLabel}的分享链接</DialogDescription>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-5">
          <section className="space-y-2">
            <h3 className="text-sm font-medium text-foreground">现有分享链接</h3>

            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted" />
              </div>
            ) : shares.length === 0 ? (
              <EmptyState
                className="px-4 py-8"
                icon={Link2}
                title="暂无分享链接"
                description={`创建一条链接，把这个${resourceLabel}分享给团队外的人。`}
              />
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
          </section>

          <section className="space-y-3 border-t border-border pt-4">
            <h3 className="text-sm font-medium text-foreground">创建新分享</h3>

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted">分享类型</span>
              <div className="flex gap-2" role="radiogroup" aria-label="分享类型">
                {(['read_only', 'copyable'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    role="radio"
                    aria-checked={shareType === type}
                    className={cn(
                      'flex-1',
                      OPTION_BASE_CLASS,
                      shareType === type ? OPTION_SELECTED_CLASS : OPTION_IDLE_CLASS,
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
              <span className="text-xs font-medium text-muted">有效期</span>
              <div
                className="grid grid-cols-2 gap-2"
                role="radiogroup"
                aria-label="分享有效期"
              >
                {(['never', '1d', '7d', '30d'] as const).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    role="radio"
                    aria-checked={expiryPreset === preset}
                    className={cn(
                      OPTION_BASE_CLASS,
                      expiryPreset === preset
                        ? OPTION_SELECTED_CLASS
                        : OPTION_IDLE_CLASS,
                    )}
                    onClick={() => setExpiryPreset(preset)}
                    data-testid={`share-expiry-${preset}`}
                  >
                    {shareExpiryPresetLabels[preset]}
                  </button>
                ))}
              </div>
            </div>
          </section>
        </DialogBody>

        <DialogFooter>
          <Button
            className="w-full sm:w-auto"
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
                创建{resourceLabel}分享链接
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})

export default ShareManagementDialog
