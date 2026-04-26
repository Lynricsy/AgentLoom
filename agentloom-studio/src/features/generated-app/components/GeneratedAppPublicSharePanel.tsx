import { useCallback } from 'react'
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Share2,
  ShieldAlert,
} from 'lucide-react'

import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { useToast } from '@/shared/ui/toast'
import {
  useDisableGeneratedAppPublicShare,
  useEnableGeneratedAppPublicShare,
  useRegenerateGeneratedAppPublicShare,
} from '../api'
import {
  getGeneratedAppPublicShareUnavailableReason,
  isGeneratedAppPublicShareEligible,
} from '../lib/generatedAppDisplay'
import type { GeneratedApp } from '../types'

interface GeneratedAppPublicSharePanelProps {
  app: GeneratedApp
  className?: string
}

export function GeneratedAppPublicSharePanel({
  app,
  className,
}: GeneratedAppPublicSharePanelProps) {
  const { notify } = useToast()
  const enableShareMutation = useEnableGeneratedAppPublicShare(app.id)
  const regenerateShareMutation = useRegenerateGeneratedAppPublicShare(app.id)
  const disableShareMutation = useDisableGeneratedAppPublicShare(app.id)

  const canCreatePublicShare = isGeneratedAppPublicShareEligible(app.readiness)
  const isMutating =
    enableShareMutation.isPending ||
    regenerateShareMutation.isPending ||
    disableShareMutation.isPending

  const handleEnableShare = useCallback(async () => {
    try {
      await enableShareMutation.mutateAsync()
      notify({
        title: '公开分享已启用',
        description: '生成应用已通过发布门禁，可分发给终端用户。',
        variant: 'success',
      })
    } catch (error) {
      notify({
        title: '公开分享启用失败',
        description:
          error instanceof Error ? error.message : app.readiness.summary,
        variant: 'error',
      })
    }
  }, [app.readiness.summary, enableShareMutation, notify])

  const handleRegenerateShare = useCallback(async () => {
    try {
      await regenerateShareMutation.mutateAsync()
      notify({
        title: '公开链接已重新生成',
        description: '旧链接会立即失效，请使用新的公开链接。',
        variant: 'success',
      })
    } catch (error) {
      notify({
        title: '重新生成失败',
        description:
          error instanceof Error ? error.message : app.readiness.summary,
        variant: 'error',
      })
    }
  }, [app.readiness.summary, notify, regenerateShareMutation])

  const handleDisableShare = useCallback(async () => {
    try {
      await disableShareMutation.mutateAsync()
      notify({
        title: '公开分享已关闭',
        description: '旧公开链接会立即失效。',
        variant: 'success',
      })
    } catch (error) {
      notify({
        title: '关闭公开分享失败',
        description: error instanceof Error ? error.message : '请稍后重试。',
        variant: 'error',
      })
    }
  }, [disableShareMutation, notify])

  const handleCopyPublicUrl = useCallback(async () => {
    if (!app.publicShareUrl) return

    try {
      await navigator.clipboard.writeText(app.publicShareUrl)
      notify({ description: '公开链接已复制到剪贴板', variant: 'success' })
    } catch {
      notify({ description: '复制失败，请手动复制链接。', variant: 'error' })
    }
  }, [app.publicShareUrl, notify])

  if (!canCreatePublicShare) {
    return (
      <div
        className={cn('space-y-2 border-l border-border pl-3', className)}
        data-testid="generated-app-public-share-panel"
      >
        <p className="break-words text-xs text-muted-foreground">
          {app.readiness.summary}
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled
          className="w-full justify-center whitespace-normal text-center sm:w-auto"
          title={getGeneratedAppPublicShareUnavailableReason(app.readiness)}
        >
          <ShieldAlert className="mr-2 h-3.5 w-3.5" />
          公开分享不可用
        </Button>
      </div>
    )
  }

  if (app.publicShareEnabled) {
    return (
      <div
        className={cn(
          'space-y-3 border-l border-emerald-500/40 pl-3',
          className,
        )}
        data-testid="generated-app-public-share-panel"
      >
        <div className="flex flex-wrap items-center gap-2 text-xs text-emerald-200">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>公开分享已启用</span>
          <span className="text-muted-foreground">
            浏览 {app.publicViewCount} 次
          </span>
        </div>

        {app.publicShareUrl ? (
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {app.publicShareUrl}
            </span>
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={handleCopyPublicUrl}
              aria-label={`复制 ${app.appName} 公开链接`}
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <a
              href={app.publicShareUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={`打开 ${app.appName} 公开链接`}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        ) : (
          <p className="break-words text-xs text-muted-foreground">
            公开链接尚未返回，请重新生成后再复制。
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleRegenerateShare}
            disabled={isMutating}
          >
            {regenerateShareMutation.isPending ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
            )}
            重新生成
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleDisableShare}
            disabled={isMutating}
          >
            {disableShareMutation.isPending ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : null}
            关闭分享
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn('space-y-2 border-l border-primary/40 pl-3', className)}
      data-testid="generated-app-public-share-panel"
    >
      <p className="break-words text-xs text-muted-foreground">
        {app.readiness.summary}
      </p>
      <Button
        size="sm"
        onClick={handleEnableShare}
        disabled={isMutating}
        data-testid={`generated-app-enable-share-${app.id}`}
      >
        {enableShareMutation.isPending ? (
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Share2 className="mr-2 h-3.5 w-3.5" />
        )}
        启用公开分享
      </Button>
    </div>
  )
}
