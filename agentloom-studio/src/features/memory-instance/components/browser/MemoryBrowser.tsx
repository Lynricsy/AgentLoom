import { useState, useCallback, useRef, useEffect } from 'react'
import { useParams, useNavigate, useSearch } from '@tanstack/react-router'
import {
  Cpu,
  Hash,
  Edit3,
  Save,
  X,
  Folder,
  AlertTriangle,
  Link2,
  Star,
  Search,
  History,
  ArrowLeft,
  Loader2,
} from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { useMemoryBrowse, useMemoryDomains, useMemorySearch } from '../../api/memoryInstanceQueries'
import { useCreateNodeVersion } from '../../api/memoryInstanceMutations'
import { useMemoryInstanceDetail } from '../../api/memoryInstanceQueries'
import { useToast } from '@/shared/ui/toast'
import { MemorySidebar } from './MemorySidebar'
import { MemoryBreadcrumb } from './MemoryBreadcrumb'
import { NodeGridCard } from './NodeGridCard'
import { PriorityBadge } from './PriorityBadge'
import { KeywordManager } from './KeywordManager'
import { GlossaryHighlighter } from './GlossaryHighlighter'
import { VersionHistoryDialog } from './VersionHistoryDialog'
import type { MemoryNode } from '../../types'

export function MemoryBrowser() {
  const { instanceId } = useParams({ strict: false }) as { instanceId: string }
  const searchParams = useSearch({ strict: false }) as Record<string, string>
  const navigate = useNavigate()

  const domain = (searchParams.domain as string) || 'core'
  const path = (searchParams.path as string) || ''

  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [editDisclosure, setEditDisclosure] = useState('')
  const [editPriority, setEditPriority] = useState(0)

  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [versionDialogOpen, setVersionDialogOpen] = useState(false)

  const currentRouteRef = useRef({ domain, path })
  useEffect(() => {
    currentRouteRef.current = { domain, path }
  }, [domain, path])

  const { notify } = useToast()
  const { data: instance } = useMemoryInstanceDetail(instanceId)
  const { data: domains = [] } = useMemoryDomains(instanceId)
  const {
    data: browseData,
    isLoading,
    error,
  } = useMemoryBrowse(instanceId, domain, path)
  const { data: searchResults = [] } = useMemorySearch(instanceId, searchQuery, {
    enabled: showSearch && searchQuery.length >= 2,
  })
  const createVersionMutation = useCreateNodeVersion(instanceId)

  const node = browseData?.node ?? null
  const children = browseData?.children ?? []
  const breadcrumbs = browseData?.breadcrumbs ?? []
  const isRoot = !path

  // 导航时重置编辑状态
  useEffect(() => {
    setEditing(false)
    if (node) {
      setEditContent(node.content ?? '')
      setEditDisclosure(node.disclosure ?? '')
      setEditPriority(node.priority ?? 0)
    }
  }, [domain, path, node])

  const navigateTo = useCallback(
    (newPath: string, newDomain?: string) => {
      const params: Record<string, string> = {
        domain: newDomain ?? domain,
      }
      if (newPath) params.path = newPath
      navigate({
        to: '/resources/memory-instances/$instanceId/browse',
        params: { instanceId },
        search: params,
      })
      setShowSearch(false)
    },
    [domain, instanceId, navigate],
  )

  const startEditing = () => {
    setEditContent(node?.content ?? '')
    setEditDisclosure(node?.disclosure ?? '')
    setEditPriority(node?.priority ?? 0)
    setEditing(true)
  }

  const cancelEditing = () => {
    setEditing(false)
    setEditContent(node?.content ?? '')
    setEditDisclosure(node?.disclosure ?? '')
    setEditPriority(node?.priority ?? 0)
  }

  const handleSave = () => {
    if (!node) return

    const payload: Record<string, unknown> = { mode: 'patch' }
    if (editContent !== (node.content ?? '')) payload.content = editContent
    if (editPriority !== (node.priority ?? 0)) payload.priority = editPriority
    if (editDisclosure !== (node.disclosure ?? '')) payload.disclosure = editDisclosure

    if (Object.keys(payload).length === 1) {
      setEditing(false)
      return
    }

    createVersionMutation.mutate(
      { nodeId: node.id, payload },
      {
        onSuccess: () => {
          setEditing(false)
          notify({ title: '已保存', description: '节点内容已更新。', variant: 'success' })
        },
        onError: (err) => {
          notify({
            title: '保存失败',
            description: err instanceof Error ? err.message : '请稍后重试。',
            variant: 'error',
          })
        },
      },
    )
  }

  return (
    <div className="flex h-full overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <div className="flex w-64 shrink-0 flex-col border-r border-border bg-surface/80">
        <div className="border-b border-border p-5">
          <div className="mb-1 flex items-center gap-2 text-primary">
            <Cpu size={18} />
            <h1 className="text-sm font-bold tracking-tight text-foreground">
              {instance?.name ?? 'Memory Browser'}
            </h1>
          </div>
          <button
            type="button"
            onClick={() =>
              navigate({ to: '/resources/memory-instances' })
            }
            className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft size={10} />
            返回列表
          </button>
        </div>

        <MemorySidebar
          instanceId={instanceId}
          domains={domains}
          activeDomain={domain}
          activePath={path}
          onNavigate={navigateTo}
        />

        <div className="mt-auto border-t border-border p-4">
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Hash size={12} />
              <span>当前路径</span>
            </div>
            <code className="block break-all font-mono text-[10px] leading-tight text-primary/80">
              {domain}://{path || 'root'}
            </code>
          </div>
        </div>
      </div>

      {/* Main Area */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-6 backdrop-blur-md">
          <MemoryBreadcrumb items={breadcrumbs} onNavigate={navigateTo} />
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setShowSearch(!showSearch)}
            aria-label={showSearch ? '关闭搜索' : '打开搜索'}
            title={showSearch ? '关闭搜索' : '打开搜索'}
            className={cn(
              'rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
              showSearch && 'bg-muted text-foreground',
            )}
          >
            <Search size={16} />
          </button>
        </div>

        {/* Search bar */}
        {showSearch && (
          <div className="border-b border-border bg-surface/50 px-6 py-3">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索记忆节点..."
              className="max-w-md"
              autoFocus
            />
            {searchQuery.length >= 2 && searchResults.length > 0 && (
              <div className="mt-2 max-h-60 space-y-1 overflow-y-auto">
                {searchResults.map((result: MemoryNode) => (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => navigateTo(result.path, result.domain)}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                  >
                    <code className="text-xs text-primary/70">
                      {result.domain}://{result.path}
                    </code>
                    <span className="flex-1 truncate text-foreground">{result.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
              <span className="text-xs uppercase tracking-widest">加载中...</span>
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-red-500">
              <p className="text-lg">加载失败</p>
              <p className="text-sm opacity-60">
                {error instanceof Error ? error.message : '未知错误'}
              </p>
              <Button variant="outline" onClick={() => navigateTo('')}>
                返回根目录
              </Button>
            </div>
          ) : (
            <div className="mx-auto max-w-7xl space-y-8">
              {/* Node content */}
              {node && (!isRoot || !node.isVirtual || editing) && (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <h1 className="text-2xl font-bold tracking-tight text-foreground">
                          {node.name || path.split('/').pop()}
                        </h1>
                        <PriorityBadge priority={node.priority} size="lg" />
                      </div>

                      {node.disclosure && !editing && (
                        <div className="inline-flex max-w-full items-center gap-2 rounded-lg border border-amber-900/30 bg-amber-950/20 px-3 py-1.5 text-xs text-amber-500/80">
                          <AlertTriangle size={14} className="shrink-0" />
                          <span className="mr-1 font-medium">Disclosure:</span>
                          <span className="truncate italic">{node.disclosure}</span>
                        </div>
                      )}

                      {node.aliases && node.aliases.length > 0 && !editing && (
                        <div className="flex items-start gap-2 text-xs text-muted-foreground">
                          <Link2 size={13} className="mt-0.5 shrink-0 text-muted-foreground/60" />
                          <div className="flex flex-wrap gap-1.5">
                            <span className="font-medium text-muted-foreground/60">
                              Also reachable via:
                            </span>
                            {node.aliases.map((alias) => (
                              <code
                                key={alias}
                                className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-primary/70"
                              >
                                {alias}
                              </code>
                            ))}
                          </div>
                        </div>
                      )}

                      {!editing && !node.isVirtual && (
                        <KeywordManager
                          keywords={node.glossaryKeywords ?? []}
                          instanceId={instanceId}
                          nodeId={node.id}
                        />
                      )}
                    </div>

                    <div className="flex shrink-0 gap-2">
                      {node.id && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setVersionDialogOpen(true)}
                          className="gap-1"
                        >
                          <History size={14} />
                          版本
                        </Button>
                      )}
                      {editing ? (
                        <>
                          <button
                            type="button"
                            onClick={cancelEditing}
                            aria-label="取消编辑"
                            title="取消编辑"
                            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted"
                          >
                            <X size={18} />
                          </button>
                          <Button
                            onClick={handleSave}
                            disabled={createVersionMutation.isPending}
                            className="gap-1.5"
                          >
                            {createVersionMutation.isPending ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <Save size={16} />
                            )}
                            保存
                          </Button>
                        </>
                      ) : (
                        <Button variant="outline" onClick={startEditing} className="gap-1.5">
                          <Edit3 size={16} />
                          编辑
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Edit metadata */}
                  {editing && (
                    <div className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-card p-4 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <Star size={12} />
                          Priority
                          <span className="font-normal text-muted-foreground/60">
                            (lower = higher priority)
                          </span>
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={editPriority}
                          onChange={(e) => setEditPriority(parseInt(e.target.value) || 0)}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-foreground transition-colors focus:border-primary/50 focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <AlertTriangle size={12} />
                          Disclosure
                          <span className="font-normal text-muted-foreground/60">
                            (when to recall)
                          </span>
                        </label>
                        <input
                          type="text"
                          value={editDisclosure}
                          onChange={(e) => setEditDisclosure(e.target.value)}
                          placeholder="e.g. When I need to remember..."
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors focus:border-primary/50 focus:outline-none"
                        />
                      </div>
                    </div>
                  )}

                  {/* Content area */}
                  <div
                    className={cn(
                      'relative overflow-hidden rounded-xl border transition-all duration-300',
                      editing
                        ? 'border-primary/50 bg-card shadow-[0_0_30px_rgba(var(--color-primary)/0.1)]'
                        : 'border-border bg-card/50',
                    )}
                  >
                    {editing ? (
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="h-96 w-full resize-y bg-transparent p-6 font-mono text-sm leading-relaxed text-foreground focus:outline-none"
                        spellCheck={false}
                      />
                    ) : (
                      <div className="prose prose-invert prose-sm max-w-none p-6 md:p-8">
                        <GlossaryHighlighter
                          content={node.content ?? ''}
                          glossary={node.glossaryMatches ?? []}
                          currentNodeUuid={node.nodeUuid}
                          onNavigate={navigateTo}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Children grid */}
              {children.length > 0 && (
                <div className="space-y-4 pt-4">
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <h2 className="text-xs font-bold uppercase tracking-widest">
                      {isRoot ? '记忆节点' : '子节点'}
                    </h2>
                    <div className="h-px flex-1 bg-border" />
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                      {children.length}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {children.map((child) => (
                      <NodeGridCard
                        key={`${child.domain || domain}:${child.path}`}
                        node={child}
                        currentDomain={domain}
                        onClick={() => navigateTo(child.path, child.domain)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!isLoading && !children.length && !node && (
                <div className="flex flex-col items-center justify-center gap-4 py-20 text-muted-foreground">
                  <Folder size={48} className="opacity-20" />
                  <p className="text-sm">暂无节点</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Version History Dialog */}
      {node && (
        <VersionHistoryDialog
          open={versionDialogOpen}
          onOpenChange={setVersionDialogOpen}
          instanceId={instanceId}
          nodeId={node.id}
          nodeName={node.name || path.split('/').pop() || ''}
        />
      )}
    </div>
  )
}
