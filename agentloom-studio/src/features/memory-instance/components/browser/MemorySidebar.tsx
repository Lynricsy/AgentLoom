import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from 'react'
import { ChevronDown, FileText, Database } from 'lucide-react'
import { Collapse } from '@/shared/components/collapse/Collapse'
import { Spinner } from '@/shared/components/spinner/Spinner'
import { cn } from '@/shared/lib/utils'
import { browseMemoryNode } from '../../api/memoryInstanceApi'
import type { MemoryNode, MemoryDomain } from '../../types'

/** 树节点行的键盘操作：Enter/Space 选中，→ 展开，← 收起 */
function handleTreeKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  {
    activate,
    expanded,
    hasChildren,
    setExpanded,
  }: {
    activate: () => void
    expanded: boolean
    hasChildren: boolean
    setExpanded: (next: boolean) => void
  },
) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    activate()
  } else if (event.key === 'ArrowRight' && hasChildren && !expanded) {
    event.preventDefault()
    setExpanded(true)
  } else if (event.key === 'ArrowLeft' && expanded) {
    event.preventDefault()
    setExpanded(false)
  }
}

function TreeChevron({
  loading,
  hasChildren,
  expanded,
  onToggle,
}: {
  loading: boolean
  hasChildren: boolean
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <span
      aria-hidden
      className="grid size-5 shrink-0 place-items-center"
      onClick={(e) => {
        if (hasChildren) {
          e.stopPropagation()
          onToggle()
        }
      }}
    >
      {loading ? (
        <Spinner size="sm" className="size-3" />
      ) : hasChildren ? (
        <ChevronDown
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:text-foreground',
            !expanded && '-rotate-90',
          )}
        />
      ) : null}
    </span>
  )
}

interface TreeNodeProps {
  instanceId: string
  domain: string
  path: string
  name: string
  childrenCount?: number
  activeDomain: string
  activePath: string
  onNavigate: (path: string, domain?: string) => void
  level: number
}

function TreeNode({
  instanceId,
  domain,
  path,
  name,
  childrenCount,
  activeDomain,
  activePath,
  onNavigate,
  level,
}: TreeNodeProps) {
  const isAncestor = activeDomain === domain && activePath.startsWith(path + '/')
  const isActive = activeDomain === domain && activePath === path

  const [expanded, setExpanded] = useState(isAncestor || isActive)
  const [children, setChildren] = useState<MemoryNode[]>([])
  const [loading, setLoading] = useState(false)
  const [fetched, setFetched] = useState(false)

  const prevActivePath = useRef(activePath)
  const prevActiveDomain = useRef(activeDomain)

  const hasChildren = fetched ? children.length > 0 : (childrenCount === undefined || childrenCount > 0)

  const fetchChildren = useCallback(async () => {
    setLoading(true)
    try {
      const res = await browseMemoryNode(instanceId, { domain, path, navOnly: true })
      setChildren(res.children)
      setFetched(true)
    } catch {
      // 静默失败
    } finally {
      setLoading(false)
    }
  }, [instanceId, domain, path])

  useEffect(() => {
    if (expanded && !fetched && hasChildren) {
      fetchChildren()
    }
  }, [expanded, fetched, hasChildren, fetchChildren])

  useEffect(() => {
    const pathChanged =
      activePath !== prevActivePath.current || activeDomain !== prevActiveDomain.current
    if (pathChanged && (isAncestor || isActive) && !expanded) {
      setExpanded(true)
    }
    prevActivePath.current = activePath
    prevActiveDomain.current = activeDomain
  }, [activePath, activeDomain, isAncestor, isActive, expanded])

  const activate = () => {
    if (isActive) {
      if (hasChildren) setExpanded(!expanded)
    } else {
      onNavigate(path, domain)
      if (!expanded && hasChildren) setExpanded(true)
    }
  }

  return (
    <div role="none">
      <div
        role="treeitem"
        tabIndex={0}
        aria-selected={isActive}
        aria-expanded={hasChildren ? expanded : undefined}
        className={cn(
          'group flex cursor-pointer items-center gap-1.5 rounded-lg py-1.5 pr-2 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30',
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={(e) => {
          e.stopPropagation()
          activate()
        }}
        onKeyDown={(e) =>
          handleTreeKeyDown(e, { activate, expanded, hasChildren, setExpanded })
        }
      >
        <TreeChevron
          loading={loading}
          hasChildren={hasChildren}
          expanded={expanded}
          onToggle={() => setExpanded(!expanded)}
        />
        <FileText
          className={cn(
            'size-3.5 shrink-0',
            isActive ? 'text-primary' : 'text-subtle-foreground group-hover:text-muted-foreground',
          )}
        />
        <span className="min-w-0 flex-1 truncate text-sm" title={name}>
          {name}
        </span>
      </div>

      <Collapse open={expanded && children.length > 0}>
        <div role="group">
          {children.map((child) => (
            <TreeNode
              key={child.path}
              instanceId={instanceId}
              domain={domain}
              path={child.path}
              name={child.name}
              childrenCount={child.approxChildrenCount}
              activeDomain={activeDomain}
              activePath={activePath}
              onNavigate={onNavigate}
              level={level + 1}
            />
          ))}
        </div>
      </Collapse>
    </div>
  )
}

interface DomainNodeProps {
  instanceId: string
  domain: string
  rootCount?: number
  activeDomain: string
  activePath: string
  onNavigate: (path: string, domain?: string) => void
}

function DomainNode({
  instanceId,
  domain,
  rootCount,
  activeDomain,
  activePath,
  onNavigate,
}: DomainNodeProps) {
  const [expanded, setExpanded] = useState(activeDomain === domain)
  const [children, setChildren] = useState<MemoryNode[]>([])
  const [loading, setLoading] = useState(false)
  const [fetched, setFetched] = useState(false)

  const prevActiveDomain = useRef(activeDomain)
  const prevActivePath = useRef(activePath)

  const hasChildren = fetched ? children.length > 0 : (rootCount === undefined || rootCount > 0)

  const fetchChildren = useCallback(async () => {
    setLoading(true)
    try {
      const res = await browseMemoryNode(instanceId, { domain, path: '', navOnly: true })
      setChildren(res.children)
      setFetched(true)
    } catch {
      // 静默失败
    } finally {
      setLoading(false)
    }
  }, [instanceId, domain])

  useEffect(() => {
    if (expanded && !fetched && hasChildren) {
      fetchChildren()
    }
  }, [expanded, fetched, hasChildren, fetchChildren])

  useEffect(() => {
    const changed =
      activeDomain !== prevActiveDomain.current || activePath !== prevActivePath.current
    if (changed && activeDomain === domain && !expanded) {
      setExpanded(true)
    }
    prevActiveDomain.current = activeDomain
    prevActivePath.current = activePath
  }, [activeDomain, activePath, domain, expanded])

  const isActive = activeDomain === domain && activePath === ''

  const activate = () => {
    if (isActive) {
      if (hasChildren) setExpanded(!expanded)
    } else {
      onNavigate('', domain)
      if (!expanded && hasChildren) setExpanded(true)
    }
  }

  return (
    <div role="none" className="mb-2">
      <div
        role="treeitem"
        tabIndex={0}
        aria-selected={isActive}
        aria-expanded={hasChildren ? expanded : undefined}
        className={cn(
          'group flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-2 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30',
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
        onClick={(e) => {
          e.stopPropagation()
          activate()
        }}
        onKeyDown={(e) =>
          handleTreeKeyDown(e, { activate, expanded, hasChildren, setExpanded })
        }
      >
        <TreeChevron
          loading={loading}
          hasChildren={hasChildren}
          expanded={expanded}
          onToggle={() => setExpanded(!expanded)}
        />
        <Database
          className={cn('ml-0.5 size-4 shrink-0', isActive ? 'text-primary' : 'text-subtle-foreground')}
        />
        <span className="ml-1 min-w-0 flex-1 truncate font-medium">
          {domain.charAt(0).toUpperCase() + domain.slice(1)} Memory
        </span>
        {rootCount !== undefined && (
          <span className="shrink-0 rounded-xs bg-muted px-1.5 py-0.5 text-2xs tabular-nums text-muted-foreground">
            {rootCount}
          </span>
        )}
      </div>

      <Collapse open={expanded && children.length > 0}>
        <div role="group" className="mt-1">
          {children.map((child) => (
            <TreeNode
              key={child.path}
              instanceId={instanceId}
              domain={domain}
              path={child.path}
              name={child.name}
              childrenCount={child.approxChildrenCount}
              activeDomain={activeDomain}
              activePath={activePath}
              onNavigate={onNavigate}
              level={1}
            />
          ))}
        </div>
      </Collapse>
    </div>
  )
}

interface MemorySidebarProps {
  instanceId: string
  domains: MemoryDomain[]
  activeDomain: string
  activePath: string
  onNavigate: (path: string, domain?: string) => void
}

export function MemorySidebar({
  instanceId,
  domains,
  activeDomain,
  activePath,
  onNavigate,
}: MemorySidebarProps) {
  return (
    <div className="flex-1 overflow-y-auto p-3">
      <div className="mb-4">
        <h3
          id="memory-sidebar-domains"
          className="mb-2 px-3 text-xs font-medium tracking-wide text-muted-foreground"
        >
          Domains
        </h3>
        <div role="tree" aria-labelledby="memory-sidebar-domains">
          {domains.map((d) => (
            <DomainNode
              key={d.domain}
              instanceId={instanceId}
              domain={d.domain}
              rootCount={d.rootCount}
              activeDomain={activeDomain}
              activePath={activePath}
              onNavigate={onNavigate}
            />
          ))}
          {domains.length === 0 && (
            <DomainNode
              instanceId={instanceId}
              domain="core"
              activeDomain={activeDomain}
              activePath={activePath}
              onNavigate={onNavigate}
            />
          )}
        </div>
      </div>
    </div>
  )
}
