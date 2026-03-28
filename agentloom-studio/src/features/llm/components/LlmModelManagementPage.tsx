import { useState, useCallback, useMemo } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  Play,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  Zap,
} from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Skeleton } from '@/shared/ui/skeleton'
import { useToast } from '@/shared/ui/toast'
import {
  getProviderInfo,
  LLM_PROVIDERS,
  type AuthMethod,
  type LlmModelInfo,
  type LlmProvider,
} from '../types'
import {
  useDeleteLlmModel,
  useLlmModels,
  useTestPrivateCloudConnection,
} from '../hooks/useLlmModels'
import { ProviderIcon } from './ProviderIcon'
import { LlmModelConfigDialog } from './LlmModelConfigDialog'

interface ProviderGroup {
  provider: LlmProvider
  providerName: string
  models: LlmModelInfo[]
}

function groupModelsByProvider(models: LlmModelInfo[]): ProviderGroup[] {
  const groupMap = new Map<LlmProvider, LlmModelInfo[]>()

  for (const model of models) {
    const existing = groupMap.get(model.provider) ?? []
    existing.push(model)
    groupMap.set(model.provider, existing)
  }

  // 按 LLM_PROVIDERS 定义的顺序排列
  const providerOrder = LLM_PROVIDERS.map((p) => p.id)
  const groups: ProviderGroup[] = []

  for (const providerId of providerOrder) {
    const items = groupMap.get(providerId)
    if (items && items.length > 0) {
      const info = getProviderInfo(providerId)
      groups.push({
        provider: providerId,
        providerName: info?.name ?? providerId,
        models: items,
      })
    }
  }

  return groups
}

function ModelCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-surface-elevated p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32 rounded" />
          <Skeleton className="h-3 w-48 rounded" />
        </div>
        <Skeleton className="h-8 w-20 rounded" />
      </div>
      <div className="mt-3 flex gap-3">
        <Skeleton className="h-3 w-24 rounded" />
        <Skeleton className="h-3 w-20 rounded" />
      </div>
    </div>
  )
}

export function LlmModelManagementPage() {
  const { notify } = useToast()
  const { data: models, isLoading, isError, refetch } = useLlmModels()
  const deleteMutation = useDeleteLlmModel()
  const testConnectionMutation = useTestPrivateCloudConnection()

  const [search, setSearch] = useState('')
  const [collapsedProviders, setCollapsedProviders] = useState<Set<LlmProvider>>(new Set())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogKey, setDialogKey] = useState(0)
  const [editingModel, setEditingModel] = useState<LlmModelInfo | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<LlmModelInfo | null>(null)

  // 客户端搜索过滤
  const filteredModels = useMemo(() => {
    if (!models) return []
    if (!search.trim()) return models

    const query = search.trim().toLowerCase()
    return models.filter(
      (m) =>
        m.name.toLowerCase().includes(query) ||
        m.modelName.toLowerCase().includes(query),
    )
  }, [models, search])

  // 按 provider 分组
  const providerGroups = useMemo(
    () => groupModelsByProvider(filteredModels),
    [filteredModels],
  )

  const toggleProvider = useCallback((provider: LlmProvider) => {
    setCollapsedProviders((prev) => {
      const next = new Set(prev)
      if (next.has(provider)) {
        next.delete(provider)
      } else {
        next.add(provider)
      }
      return next
    })
  }, [])

  const handleCreate = useCallback(() => {
    setEditingModel(null)
    setDialogKey((k) => k + 1)
    setDialogOpen(true)
  }, [])

  const handleEdit = useCallback((model: LlmModelInfo) => {
    setEditingModel(model)
    setDialogKey((k) => k + 1)
    setDialogOpen(true)
  }, [])

  const handleDialogClose = useCallback((open: boolean) => {
    if (!open) {
      setDialogOpen(false)
      setEditingModel(null)
    }
  }, [])

  const handleTestConnection = useCallback(
    async (model: LlmModelInfo) => {
      if (!model.endpointUrl) {
        notify({
          title: '无法测试',
          description: '该配置缺少端点 URL。',
          variant: 'error',
        })
        return
      }

      try {
        const result = await testConnectionMutation.mutateAsync({
          endpointUrl: model.endpointUrl,
          authMethod: (model.authMethod as AuthMethod) || 'none',
          apiKeyId: model.apiKeyId ?? undefined,
          timeoutMs: model.timeoutMs ?? undefined,
        })

        if (result.success) {
          notify({
            title: '连接测试成功',
            description: `延迟 ${result.latencyMs}ms${result.serverInfo?.version ? ` - 版本 ${result.serverInfo.version}` : ''}`,
            variant: 'success',
          })
        } else {
          notify({
            title: '连接测试失败',
            description: '无法连接到私有云端点。',
            variant: 'error',
          })
        }
      } catch (err) {
        notify({
          title: '连接测试失败',
          description: err instanceof Error ? err.message : '请稍后重试。',
          variant: 'error',
        })
      }
    },
    [testConnectionMutation, notify],
  )

  const handleConfirmDelete = useCallback(() => {
    if (!confirmDelete) return

    deleteMutation.mutate(confirmDelete.id, {
      onSuccess: () => {
        notify({
          title: '已删除',
          description: `已删除模型配置「${confirmDelete.name}」。`,
          variant: 'success',
        })
        setConfirmDelete(null)
      },
      onError: (err) => {
        notify({
          title: '删除失败',
          description: err instanceof Error ? err.message : '请稍后重试。',
          variant: 'error',
        })
      },
    })
  }, [confirmDelete, deleteMutation, notify])

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">LLM Models</h1>
          <p className="text-sm text-muted-foreground">
            管理 AI 模型配置和提供商
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-1.5 h-4 w-4" />
          添加模型配置
        </Button>
      </div>

      {/* 搜索栏 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索配置名称或模型名称..."
          className="pl-9"
        />
      </div>

      {/* 内容区域 */}
      {isLoading ? (
        <div className="space-y-6">
          {[1, 2].map((i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-5 w-40 rounded" />
              <div className="grid gap-3 xl:grid-cols-2">
                <ModelCardSkeleton />
                <ModelCardSkeleton />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20 text-center">
          <Zap className="h-12 w-12 text-muted-foreground" />
          <p className="text-sm font-medium">模型配置加载失败</p>
          <p className="text-sm text-muted-foreground">请稍后重试</p>
          <Button variant="outline" onClick={() => void refetch()}>
            重新加载
          </Button>
        </div>
      ) : providerGroups.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20">
          <Sparkles className="h-12 w-12 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">
            {search.trim() ? '没有匹配的模型配置' : '暂无模型配置'}
          </p>
          <p className="text-sm text-muted-foreground">
            {search.trim()
              ? '尝试调整搜索关键词'
              : '点击上方「添加模型配置」按钮开始配置你的第一个 LLM 模型'}
          </p>
          {!search.trim() && (
            <Button variant="outline" onClick={handleCreate}>
              <Plus className="mr-1.5 h-4 w-4" />
              添加模型配置
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4 overflow-y-auto">
          {providerGroups.map((group) => {
            const isCollapsed = collapsedProviders.has(group.provider)

            return (
              <section key={group.provider}>
                {/* Provider 分组标题 */}
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-muted/30"
                  onClick={() => toggleProvider(group.provider)}
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                  <ProviderIcon provider={group.provider} size={16} className="text-primary" />
                  <span className="text-sm font-semibold text-foreground">
                    {group.providerName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({group.models.length} 个配置)
                  </span>
                </button>

                {/* 模型卡片列表 */}
                {!isCollapsed && (
                  <div className="mt-2 grid gap-3 xl:grid-cols-2">
                    {group.models.map((model) => (
                      <article
                        key={model.id}
                        className="rounded-xl border border-border bg-surface-elevated p-4 shadow-sm transition-colors hover:border-border/80"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="truncate text-sm font-semibold text-foreground">
                                {model.name}
                              </h3>
                              {model.isDefault && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-400">
                                  <Star className="h-3 w-3" />
                                  默认
                                </span>
                              )}
                            </div>
                            <p className="mt-1 truncate text-xs text-muted-foreground">
                              {model.modelName}
                            </p>
                          </div>
                        </div>

                        {/* 参数摘要 */}
                        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span>temp: {model.parameters.temperature.toFixed(1)}</span>
                          {typeof model.parameters.maxTokens === 'number' && (
                            <span>maxTokens: {model.parameters.maxTokens}</span>
                          )}
                          <span>topP: {model.parameters.topP.toFixed(2)}</span>
                        </div>

                        {/* 操作按钮 */}
                        <div className="mt-3 flex items-center justify-end gap-2">
                          {model.provider === 'private_cloud' && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={testConnectionMutation.isPending}
                              onClick={() => void handleTestConnection(model)}
                            >
                              <Play className="mr-1 h-3.5 w-3.5" />
                              Test
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(model)}
                          >
                            <Pencil className="mr-1 h-3.5 w-3.5" />
                            编辑
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-400 hover:bg-red-500/10 hover:text-red-400"
                            onClick={() => setConfirmDelete(model)}
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" />
                            删除
                          </Button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      {/* 创建/编辑对话框 */}
      <LlmModelConfigDialog
        key={dialogKey}
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        editingModel={editingModel}
      />

      {/* 删除确认对话框 */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setConfirmDelete(null)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setConfirmDelete(null)
            }}
            role="button"
            tabIndex={-1}
            aria-label="关闭对话框"
          />
          <div className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-2xl">
            <h3 className="text-base font-semibold">确认删除</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              确定要删除模型配置「{confirmDelete.name}」吗？已使用该配置的节点将不再引用此配置，此操作不可撤销。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmDelete(null)}
              >
                取消
              </Button>
              <Button
                size="sm"
                className="bg-red-600 text-white hover:bg-red-700"
                disabled={deleteMutation.isPending}
                onClick={handleConfirmDelete}
              >
                {deleteMutation.isPending && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                删除
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
