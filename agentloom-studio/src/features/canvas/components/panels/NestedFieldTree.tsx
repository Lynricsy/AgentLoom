import { memo, useCallback, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Collapse } from '@/shared/components/collapse/Collapse'
import { Button } from '@/shared/ui/button'
import type { NestedFieldNode } from '../../types'
import { MAX_NESTED_DEPTH } from '../../lib/nestedFieldTree'

export interface NestedFieldTreeProps {
  nodes: NestedFieldNode[]
  selectedPaths: ReadonlySet<string>
  onFieldClick: (path: string) => void
  onFieldDragStart?: (path: string) => void
  onFieldDragEnd?: () => void
  suggestedPaths?: ReadonlySet<string>
  onFieldDragOver?: (e: React.DragEvent) => void
  onFieldDrop?: (e: React.DragEvent, path: string) => void
  renderFieldSuffix?: (node: NestedFieldNode) => React.ReactNode
  disableLeafInteraction?: boolean
  forbiddenPaths?: ReadonlySet<string>
}

interface FieldRowProps {
  node: NestedFieldNode
  expandedPaths: ReadonlySet<string>
  selectedPaths: ReadonlySet<string>
  onToggle: (path: string) => void
  onFieldClick: (path: string) => void
  onFieldDragStart?: (path: string) => void
  onFieldDragEnd?: () => void
  suggestedPaths?: ReadonlySet<string>
  onFieldDragOver?: (e: React.DragEvent) => void
  onFieldDrop?: (e: React.DragEvent, path: string) => void
  renderFieldSuffix?: (node: NestedFieldNode) => React.ReactNode
  disableLeafInteraction?: boolean
  forbiddenPaths?: ReadonlySet<string>
}

const FieldRow = memo(function FieldRow({
  node,
  expandedPaths,
  selectedPaths,
  onToggle,
  onFieldClick,
  onFieldDragStart,
  onFieldDragEnd,
  suggestedPaths,
  onFieldDragOver,
  onFieldDrop,
  renderFieldSuffix,
  disableLeafInteraction,
  forbiddenPaths,
}: FieldRowProps) {
  const isExpanded = expandedPaths.has(node.path)
  const isSelected = selectedPaths.has(node.path)
  const isSuggested = suggestedPaths?.has(node.path) ?? false
  const isForbidden = forbiddenPaths?.has(node.path) ?? false
  /** 行左内边距：基础 8px + 每层 16px（depth 0 也留出与 hover 底色边缘的间距） */
  const indent = 8 + node.depth * 16
  const atDepthCap = node.depth >= MAX_NESTED_DEPTH

  const handleClick = useCallback(() => {
    if (node.isLeaf) {
      onFieldClick(node.path)
    }
  }, [node.isLeaf, node.path, onFieldClick])

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onToggle(node.path)
    },
    [node.path, onToggle],
  )

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      if (!node.isLeaf) {
        e.preventDefault()
        return
      }
      e.dataTransfer?.setData('text/plain', node.path)
      onFieldDragStart?.(node.path)
    },
    [node.isLeaf, node.path, onFieldDragStart],
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (isForbidden) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'none'
        return
      }
      onFieldDragOver?.(e)
    },
    [isForbidden, onFieldDragOver],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (isForbidden) {
        e.preventDefault()
        return
      }
      e.preventDefault()
      onFieldDrop?.(e, node.path)
    },
    [isForbidden, node.path, onFieldDrop],
  )

  const rowClassName = cn(
    'flex min-w-0 items-center gap-1.5 rounded-sm py-1.5 pr-2 font-mono text-xs text-foreground transition-colors duration-150 select-none',
    node.isLeaf && 'cursor-pointer hover:bg-muted',
    isSelected && 'bg-info/15 ring-1 ring-inset ring-info/40',
    node.isMapped && 'text-compat-l0',
    isSuggested && 'bg-compat-l1/10 outline-1 -outline-offset-1 outline-dashed outline-compat-l1/45',
    isForbidden &&
      'cursor-not-allowed opacity-45 outline-1 -outline-offset-1 outline-dashed outline-error hover:bg-error/5',
  )

  const content = (
    <>
      {!node.isLeaf && (
        <Button
          variant="ghost"
          size="icon-2xs"
          data-testid={`toggle-nested-field-${node.path}`}
          className="shrink-0"
          onClick={handleToggle}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? `收起 ${node.leafKey}` : `展开 ${node.leafKey}`}
        >
          <ChevronDown
            className={cn(
              'transition-transform duration-150',
              !isExpanded && '-rotate-90',
            )}
          />
        </Button>
      )}

      <span className="min-w-0 flex-1 truncate text-left" title={node.leafKey}>
        {node.leafKey}
        {node.required && <span className="ml-0.5 text-error">*</span>}
      </span>

      <span className="ml-auto shrink-0 text-2xs text-muted-foreground">
        {node.schema.kind}
      </span>

      {node.isMapped && (
        <span
          data-testid={`mapped-indicator-${node.path}`}
          className="size-1.5 shrink-0 rounded-full bg-success"
          role="img"
          aria-label="已映射"
        />
      )}

      {atDepthCap && !node.isLeaf && (
        <span className="shrink-0 text-muted-foreground" role="img" aria-label="已达到深度限制">…</span>
      )}
    </>
  )

  const suffix = node.isLeaf && renderFieldSuffix ? renderFieldSuffix(node) : null
  const leafButton = node.isLeaf ? (
    <Button
      variant="ghost"
      data-testid={`nested-field-${node.path}`}
      className={cn(
        rowClassName,
        'h-auto w-full min-w-0 shrink justify-start whitespace-normal font-normal disabled:pointer-events-auto disabled:opacity-100',
      )}
      style={{ paddingLeft: indent }}
      draggable={!disableLeafInteraction}
      disabled={disableLeafInteraction}
      onClick={handleClick}
      onDragStart={handleDragStart}
      onDragEnd={onFieldDragEnd}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      aria-pressed={isSelected}
      aria-disabled={isForbidden || undefined}
    >
      {content}
    </Button>
  ) : null

  return (
    <>
      {node.isLeaf ? (
        suffix ? (
          <div className="flex min-w-0 items-center gap-1">
            {leafButton}
            {suffix}
          </div>
        ) : (
          leafButton
        )
      ) : (
        <div
          data-testid={`nested-field-${node.path}`}
          className={rowClassName}
          style={{ paddingLeft: indent }}
        >
          {content}
        </div>
      )}

      {!node.isLeaf && (
        <Collapse open={isExpanded}>
          <div className="flex flex-col gap-0.5 pt-0.5">
            {node.children?.map((child) => (
              <FieldRow
                key={child.path}
                node={child}
                expandedPaths={expandedPaths}
                selectedPaths={selectedPaths}
                onToggle={onToggle}
                onFieldClick={onFieldClick}
                onFieldDragStart={onFieldDragStart}
                onFieldDragEnd={onFieldDragEnd}
                suggestedPaths={suggestedPaths}
                onFieldDragOver={handleDragOver}
                onFieldDrop={handleDrop}
                renderFieldSuffix={renderFieldSuffix}
                disableLeafInteraction={disableLeafInteraction}
                forbiddenPaths={forbiddenPaths}
              />
            ))}
          </div>
        </Collapse>
      )}
    </>
  )
})

export const NestedFieldTree = memo(function NestedFieldTree({
  nodes,
  selectedPaths,
  onFieldClick,
  onFieldDragStart,
  onFieldDragEnd,
  suggestedPaths,
  onFieldDragOver,
  onFieldDrop,
  renderFieldSuffix,
  disableLeafInteraction,
  forbiddenPaths,
}: NestedFieldTreeProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())

  const handleToggle = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  return (
    <div className="flex flex-col gap-0.5" data-testid="nested-field-tree">
      {nodes.map((node) => (
        <FieldRow
          key={node.path}
          node={node}
          expandedPaths={expandedPaths}
          selectedPaths={selectedPaths}
          onToggle={handleToggle}
          onFieldClick={onFieldClick}
          onFieldDragStart={onFieldDragStart}
          onFieldDragEnd={onFieldDragEnd}
          suggestedPaths={suggestedPaths}
          onFieldDragOver={onFieldDragOver}
          onFieldDrop={onFieldDrop}
          renderFieldSuffix={renderFieldSuffix}
          disableLeafInteraction={disableLeafInteraction}
          forbiddenPaths={forbiddenPaths}
        />
      ))}
    </div>
  )
})
