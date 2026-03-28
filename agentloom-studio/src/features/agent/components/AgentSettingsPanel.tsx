import { memo, useCallback, useEffect, useState } from 'react'
import {
  Archive,
  Bot,
  Clock,
  History,
  Loader2,
  Save,
  Settings2,
  Shield,
  Tag,
  Upload,
  X,
} from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { useToast } from '@/shared/ui/toast'
import { formatRelativeTime } from '@/features/canvas/lib/formatRelativeTime'
import { useAgent, useAgentVersions } from '../api/agentQueries'
import { useUpdateAgent, useCreateAgentVersion, usePublishAgent } from '../api/agentMutations'
import type { AgentDefinition, AgentStatus, AgentVersion, AgentGlobalSandboxConfig } from '../types'

const SETTINGS_TABS = ['basic', 'versions', 'sandbox'] as const
type SettingsTab = (typeof SETTINGS_TABS)[number]

function isSettingsTab(value: string): value is SettingsTab {
  return SETTINGS_TABS.some((tab) => tab === value)
}

interface AgentSettingsPanelProps {
  agentId: string
  open: boolean
  onClose: () => void
}

function StatusBadge({ status }: { status: AgentStatus }) {
  const classes =
    status === 'published'
      ? 'bg-emerald-500/10 text-emerald-500'
      : status === 'archived'
        ? 'bg-gray-500/10 text-gray-400'
        : 'bg-amber-500/10 text-amber-500'

  const label =
    status === 'published' ? '已发布' : status === 'archived' ? '已归档' : '草稿'

  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', classes)}>
      {label}
    </span>
  )
}

interface BasicInfoTabProps {
  agent: AgentDefinition
  onSave: (data: { name: string; description: string }) => void
  isSaving: boolean
}

function BasicInfoTab({ agent, onSave, isSaving }: BasicInfoTabProps) {
  const [name, setName] = useState(agent.name)
  const [description, setDescription] = useState(agent.description ?? '')

  useEffect(() => {
    setName(agent.name)
    setDescription(agent.description ?? '')
  }, [agent.name, agent.description])

  const isDirty = name !== agent.name || description !== (agent.description ?? '')

  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="agent-name" className="text-xs font-medium text-muted-foreground">
          名称
        </label>
        <Input
          id="agent-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Agent 名称"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="agent-description" className="text-xs font-medium text-muted-foreground">
          描述
        </label>
        <textarea
          id="agent-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="描述这个 Agent 的功能..."
          rows={3}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">状态</span>
        <StatusBadge status={agent.status} />
      </div>

      <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">创建时间</span>
          <span>{formatRelativeTime(new Date(agent.createdAt))}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">更新时间</span>
          <span>{formatRelativeTime(new Date(agent.updatedAt))}</span>
        </div>
      </div>

      {isDirty && (
        <Button
          size="sm"
          onClick={() => onSave({ name, description })}
          disabled={isSaving || !name.trim()}
        >
          {isSaving ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="mr-1.5 h-3.5 w-3.5" />
          )}
          保存
        </Button>
      )}
    </div>
  )
}

interface VersionItemProps {
  version: AgentVersion
  onPublish?: (versionId: string) => void
}

const VersionItem = memo(function VersionItem({ version, onPublish }: VersionItemProps) {
  const isPublished = !!version.publishedAt
  const isArchived = !!version.archivedAt
  const changelog = version.snapshot?.metadata?.changelog?.trim() ?? ''

  return (
    <div className="group border-b border-border p-4 transition-colors hover:bg-muted/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            v{version.versionNumber}
          </span>
          {version.label && (
            <span className="flex items-center gap-1 text-sm text-foreground">
              <Tag className="h-3 w-3" />
              {version.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isPublished && (
            <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600">
              已发布
            </span>
          )}
          {isArchived && (
            <span className="inline-flex items-center rounded-full bg-gray-500/10 px-2 py-0.5 text-xs font-medium text-gray-500">
              <Archive className="mr-1 h-3 w-3" />
              已归档
            </span>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatRelativeTime(new Date(version.createdAt))}
          </span>
          {version.snapshot?.metadata && (
            <div className="text-xs text-muted-foreground">
              {version.snapshot.metadata.nodeCount} 个节点 · {version.snapshot.metadata.edgeCount} 条连线
            </div>
          )}
          {changelog && (
            <p className="rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-xs leading-5 text-foreground/80">
              {changelog}
            </p>
          )}
        </div>

        {!isPublished && !isArchived && onPublish && (
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-primary hover:bg-primary/10"
              onClick={() => onPublish(version.id)}
            >
              <Upload className="h-3 w-3" />
              发布
            </button>
          </div>
        )}
      </div>
    </div>
  )
})

interface VersionsTabProps {
  agentId: string
  agentStatus: AgentStatus
  onCreateVersion: (label: string) => void
  onPublish: (versionId: string) => void
  isCreatingVersion: boolean
}

function VersionsTab({
  agentId,
  agentStatus,
  onCreateVersion,
  onPublish,
  isCreatingVersion,
}: VersionsTabProps) {
  const [versionLabel, setVersionLabel] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useAgentVersions(agentId, { page, pageSize: 20 })

  const versions = data?.data ?? []
  const meta = data?.meta
  const hasMore = meta ? meta.page < meta.totalPages : false

  const handleCreate = useCallback(() => {
    onCreateVersion(versionLabel)
    setVersionLabel('')
  }, [versionLabel, onCreateVersion])

  return (
    <div className="flex flex-col">
      {agentStatus !== 'archived' && (
        <div className="border-b border-border p-4">
          <p className="mb-3 text-xs text-muted-foreground">
            创建当前画布的版本快照
          </p>
          <div className="flex gap-2">
            <Input
              value={versionLabel}
              onChange={(e) => setVersionLabel(e.target.value)}
              placeholder="版本标签（可选）"
              className="flex-1"
            />
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={isCreatingVersion}
            >
              {isCreatingVersion ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Tag className="mr-1.5 h-3.5 w-3.5" />
              )}
              保存版本
            </Button>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : versions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
            <History className="h-8 w-8 opacity-40" />
            <p className="text-sm">暂无版本快照</p>
          </div>
        ) : (
          <>
            {versions.map((version) => (
              <VersionItem
                key={version.id}
                version={version}
                onPublish={agentStatus !== 'archived' ? onPublish : undefined}
              />
            ))}
            {hasMore && (
              <div className="flex items-center justify-center py-3">
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => setPage((p) => p + 1)}
                >
                  加载更多
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

interface SandboxSummaryTabProps {
  sandboxConfig: AgentGlobalSandboxConfig | null
}

function SandboxSummaryTab({ sandboxConfig }: SandboxSummaryTabProps) {
  if (!sandboxConfig || !sandboxConfig.enabled) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-8 text-muted-foreground">
        <Shield className="h-8 w-8 opacity-40" />
        <p className="text-sm">沙箱未启用</p>
        <p className="text-xs">可以在 Agent 画布的节点配置中启用沙箱环境</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="rounded-lg border border-border/70 bg-muted/30 p-4">
        <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          全局沙箱配置
        </h4>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">CPU 限制</span>
            <span className="font-medium text-foreground">
              {sandboxConfig.cpuLimit ?? '默认'}%
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">内存限制</span>
            <span className="font-medium text-foreground">
              {sandboxConfig.memoryLimitMb ?? '默认'} MB
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">超时时间</span>
            <span className="font-medium text-foreground">
              {sandboxConfig.timeoutSeconds ?? '默认'}s
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">环境变量</span>
            <span className="font-medium text-foreground">
              {sandboxConfig.allowedEnvKeys?.length ?? 0} 个
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export function AgentSettingsPanel({ agentId, open, onClose }: AgentSettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('basic')
  const { notify } = useToast()

  const { data: agent } = useAgent(agentId)
  const updateMutation = useUpdateAgent(agentId)
  const createVersionMutation = useCreateAgentVersion(agentId)
  const publishMutation = usePublishAgent(agentId)

  const handleSaveBasicInfo = useCallback(
    async (data: { name: string; description: string }) => {
      if (!agent) return

      const trimmedName = data.name.trim()
      const trimmedDescription = data.description.trim()

      try {
        await updateMutation.mutateAsync({
          version: agent.version,
          name: trimmedName,
          description: trimmedDescription || null,
        })
        notify({ title: '保存成功', description: 'Agent 信息已更新', variant: 'success' })
      } catch {
        notify({ title: '保存失败', description: '请稍后重试', variant: 'error' })
      }
    },
    [agent, updateMutation, notify],
  )

  const handleCreateVersion = useCallback(
    async (label: string) => {
      try {
        await createVersionMutation.mutateAsync({ label: label || undefined })
        notify({ title: '版本已保存', description: '版本快照已创建', variant: 'success' })
      } catch {
        notify({ title: '保存版本失败', description: '请稍后重试', variant: 'error' })
      }
    },
    [createVersionMutation, notify],
  )

  const handlePublish = useCallback(
    async (versionId: string) => {
      try {
        await publishMutation.mutateAsync({ versionId })
        notify({ title: '发布成功', description: 'Agent 已发布', variant: 'success' })
      } catch {
        notify({ title: '发布失败', description: '请稍后重试', variant: 'error' })
      }
    },
    [publishMutation, notify],
  )

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 flex h-full w-[400px] flex-col border-r border-border bg-background shadow-xl transition-transform duration-300',
        open ? 'translate-x-0' : '-translate-x-full',
      )}
      aria-label="Agent 设置"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">Agent 设置</h2>
        </div>
        <button
          type="button"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onClose}
          aria-label="关闭设置"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {agent && (
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Bot className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{agent.name}</p>
            <p className="text-xs text-muted-foreground">v{agent.version}</p>
          </div>
          <StatusBadge status={agent.status} />
        </div>
      )}

      <Tabs
        value={activeTab}
        defaultValue="basic"
        onValueChange={(value) => {
          if (isSettingsTab(value)) {
            setActiveTab(value)
          }
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="px-4 pt-3">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="basic">
              <span className="inline-flex items-center gap-1.5">
                <Bot className="h-3.5 w-3.5" />
                基本信息
              </span>
            </TabsTrigger>
            <TabsTrigger value="versions">
              <span className="inline-flex items-center gap-1.5">
                <History className="h-3.5 w-3.5" />
                版本
              </span>
            </TabsTrigger>
            <TabsTrigger value="sandbox">
              <span className="inline-flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" />
                沙箱
              </span>
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className={cn(activeTab !== 'basic' && 'hidden')}>
            {agent && (
              <BasicInfoTab
                agent={agent}
                onSave={handleSaveBasicInfo}
                isSaving={updateMutation.isPending}
              />
            )}
          </div>

          <div className={cn(activeTab !== 'versions' && 'hidden')}>
            {agent && (
              <VersionsTab
                agentId={agentId}
                agentStatus={agent.status}
                onCreateVersion={handleCreateVersion}
                onPublish={handlePublish}
                isCreatingVersion={createVersionMutation.isPending}
              />
            )}
          </div>

          <div className={cn(activeTab !== 'sandbox' && 'hidden')}>
            {agent && <SandboxSummaryTab sandboxConfig={agent.sandboxConfig} />}
          </div>
        </div>
      </Tabs>
    </aside>
  )
}
