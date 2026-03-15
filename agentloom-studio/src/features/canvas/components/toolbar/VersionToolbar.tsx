import { memo, useCallback, useState } from 'react'
import { Save, History, Upload, Archive, Play, Loader2, Clock3, ShieldAlert, SlidersHorizontal, Store, Download, FolderInput } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import type { WorkflowStatus } from '@/features/workflow'
import { CreateVersionDialog } from '@/features/workflow/components/CreateVersionDialog'
import { ArchiveDialog } from '@/features/workflow/components/ArchiveDialog'

interface VersionToolbarProps {
  workflowId: string
  workflowStatus: WorkflowStatus
  onOpenVersionHistory: () => void
  onOpenPublish: (versionId?: string) => void
  onToggleInterventionPolicies?: () => void
  onToggleInputSchema?: () => void
  onToggleTriggers?: () => void
  onPublishToMarketplace?: () => void
  onRun?: () => void
  onExport?: () => void
  onImport?: () => void
  isInterventionPoliciesOpen?: boolean
  isInputSchemaOpen?: boolean
  isTriggersOpen?: boolean
  isRunning?: boolean
  isExporting?: boolean
  hasNodes?: boolean
}

const statusConfig: Record<WorkflowStatus, { label: string; className: string }> = {
  draft: {
    label: '草稿',
    className: 'border-sky-200 bg-sky-50 text-sky-700',
  },
  published: {
    label: '已发布',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  archived: {
    label: '已归档',
    className: 'border-gray-200 bg-gray-100 text-gray-500',
  },
}

export const VersionToolbar = memo(function VersionToolbar({
  workflowId,
  workflowStatus,
  onOpenVersionHistory,
  onOpenPublish,
  onToggleInterventionPolicies,
  onToggleInputSchema,
  onToggleTriggers,
  onPublishToMarketplace,
  onRun,
  onExport,
  onImport,
  isInterventionPoliciesOpen = false,
  isInputSchemaOpen = false,
  isTriggersOpen = false,
  isRunning = false,
  isExporting = false,
  hasNodes = false,
}: VersionToolbarProps) {
  const [createOpen, setCreateOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)

  const isArchived = workflowStatus === 'archived'
  const isPublished = workflowStatus === 'published'
  const canPublish = workflowStatus === 'draft'
  const canArchive = !isArchived

  const handleOpenCreate = useCallback(() => setCreateOpen(true), [])
  const handleOpenArchive = useCallback(() => setArchiveOpen(true), [])

  const config = statusConfig[workflowStatus]

  return (
    <>
      <div
        className="absolute right-3 top-3 z-30 flex items-center gap-1.5"
        data-testid="version-toolbar"
      >
        <span
          className={cn(
            'rounded-full border px-2.5 py-0.5 text-xs font-medium',
            config.className,
          )}
          data-testid="workflow-status-badge"
        >
          {config.label}
        </span>

        <div className="mx-1 h-4 w-px bg-border" />

        {!isArchived && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-muted"
            onClick={handleOpenCreate}
            data-testid="btn-create-version"
          >
            <Save className="h-3.5 w-3.5" />
            保存版本
          </button>
        )}

        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-muted"
          onClick={onOpenVersionHistory}
          data-testid="btn-version-history"
        >
          <History className="h-3.5 w-3.5" />
          版本历史
        </button>

        {onToggleInterventionPolicies && (
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium shadow-sm transition-colors',
              isInterventionPoliciesOpen
                ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/15'
                : 'border-border bg-surface text-foreground hover:bg-muted',
            )}
            onClick={onToggleInterventionPolicies}
            data-testid="btn-intervention-policies"
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            {isInterventionPoliciesOpen ? '隐藏介入策略' : '介入策略'}
          </button>
        )}

        {onToggleInputSchema && (
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium shadow-sm transition-colors',
              isInputSchemaOpen
                ? 'border-sky-400/30 bg-sky-500/10 text-sky-100 hover:bg-sky-500/15'
                : 'border-border bg-surface text-foreground hover:bg-muted',
            )}
            onClick={onToggleInputSchema}
            data-testid="btn-input-schema"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {isInputSchemaOpen ? '隐藏输入参数' : '输入参数'}
          </button>
        )}

        {onToggleTriggers && (
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium shadow-sm transition-colors',
              isTriggersOpen
                ? 'border-violet-400/30 bg-violet-500/10 text-violet-100 hover:bg-violet-500/15'
                : 'border-border bg-surface text-foreground hover:bg-muted',
            )}
            onClick={onToggleTriggers}
            data-testid="btn-triggers"
          >
            <Clock3 className="h-3.5 w-3.5" />
            {isTriggersOpen ? '隐藏触发器' : '触发器'}
          </button>
        )}

        {canPublish && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700"
            onClick={() => onOpenPublish()}
            data-testid="btn-publish"
          >
            <Upload className="h-3.5 w-3.5" />
            发布
          </button>
        )}

        {isPublished && onPublishToMarketplace && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-amber-700"
            onClick={onPublishToMarketplace}
            data-testid="btn-publish-to-marketplace"
          >
            <Store className="h-3.5 w-3.5" />
            发布到市场
          </button>
        )}

        {hasNodes && onExport && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-muted disabled:opacity-50"
            onClick={onExport}
            disabled={isExporting}
            data-testid="btn-export-workflow"
          >
            {isExporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            导出
          </button>
        )}

        {onImport && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-muted"
            onClick={onImport}
            data-testid="btn-import-workflow"
          >
            <FolderInput className="h-3.5 w-3.5" />
            导入
          </button>
        )}

        {!isArchived && onRun && (
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium shadow-sm',
              isRunning
                ? 'border border-amber-300 bg-amber-50 text-amber-700'
                : 'bg-sky-600 text-white hover:bg-sky-700',
            )}
            onClick={onRun}
            disabled={isRunning}
            data-testid="btn-run-workflow"
          >
            {isRunning ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                执行中
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" />
                运行
              </>
            )}
          </button>
        )}

        {canArchive && (
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium shadow-sm',
              isPublished
                ? 'border-amber-300 text-amber-700 hover:bg-amber-50'
                : 'border-border text-muted-foreground hover:bg-muted',
            )}
            onClick={handleOpenArchive}
            data-testid="btn-archive"
          >
            <Archive className="h-3.5 w-3.5" />
            归档
          </button>
        )}
      </div>

      <CreateVersionDialog
        open={createOpen}
        workflowId={workflowId}
        onOpenChange={setCreateOpen}
      />
      <ArchiveDialog
        open={archiveOpen}
        workflowId={workflowId}
        onOpenChange={setArchiveOpen}
      />
    </>
  )
})
