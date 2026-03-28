import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronRight, FileText, Database } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { browseMemoryNode } from '../../api/memoryInstanceApi'
import type { MemoryNode, MemoryDomain } from '../../types'

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

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isActive) {
      if (hasChildren) setExpanded(!expanded)
    } else {
      onNavigate(path, domain)
      if (!expanded && hasChildren) setExpanded(true)
    }
  }

  return (
    <div>
      <div
        className={cn(
          'group flex cursor-pointer items-center gap-1.5 rounded-lg py-1.5 pr-2 text-sm transition-all',
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleClick}
      >
        <div
          className="flex h-5 w-5 shrink-0 items-center justify-center"
          onClick={(e) => {
            if (hasChildren) {
              e.stopPropagation()
              setExpanded(!expanded)
            }
          }}
        >
          {loading ? (
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          ) : hasChildren ? (
            <ChevronRight
              size={14}
              className={cn(
                'text-muted-foreground transition-transform group-hover:text-foreground',
                expanded && 'rotate-90',
              )}
            />
          ) : null}
        </div>
        <FileText
          size={14}
          className={cn(
            'shrink-0',
            isActive ? 'text-primary' : 'text-muted-foreground/50 group-hover:text-muted-foreground',
          )}
        />
        <span className="flex-1 truncate text-[13px]">{name}</span>
      </div>

      {expanded && children.length > 0 && (
        <div>
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
      )}
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

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isActive) {
      if (hasChildren) setExpanded(!expanded)
    } else {
      onNavigate('', domain)
      if (!expanded && hasChildren) setExpanded(true)
    }
  }

  return (
    <div className="mb-2">
      <div
        className={cn(
          'group flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-2 text-sm transition-all',
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
        onClick={handleClick}
      >
        <div
          className="flex h-5 w-5 shrink-0 items-center justify-center"
          onClick={(e) => {
            if (hasChildren) {
              e.stopPropagation()
              setExpanded(!expanded)
            }
          }}
        >
          {loading ? (
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          ) : hasChildren ? (
            <ChevronRight
              size={16}
              className={cn(
                'text-muted-foreground transition-transform group-hover:text-foreground',
                expanded && 'rotate-90',
              )}
            />
          ) : null}
        </div>
        <Database
          size={16}
          className={cn('ml-0.5 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground/60')}
        />
        <span className="ml-1 flex-1 truncate font-medium">
          {domain.charAt(0).toUpperCase() + domain.slice(1)} Memory
        </span>
        {rootCount !== undefined && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {rootCount}
          </span>
        )}
      </div>

      {expanded && children.length > 0 && (
        <div className="mt-1">
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
      )}
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
    <div className="p-3 flex-1 overflow-y-auto">
      <div className="mb-4">
        <h3 className="mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
          Domains
        </h3>
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
  )
}
