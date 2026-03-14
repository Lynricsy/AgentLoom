import { memo, useCallback, useState } from 'react'
import { ChevronRight } from 'lucide-react'
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
  const indent = node.depth * 16
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

  const baseClassName = `mapping-field${isSelected ? ' mapping-field--selected' : ''}${node.isMapped ? ' mapping-field--mapped' : ''}${isSuggested ? ' mapping-field--suggested' : ''}${isForbidden ? ' mapping-field--forbidden' : ''}${node.isLeaf ? '' : ' mapping-field--group'}`

  const content = (
    <>
      {!node.isLeaf && (
        <button
          type="button"
          data-testid={`toggle-nested-field-${node.path}`}
          className="nested-field-chevron"
          onClick={handleToggle}
          aria-label={isExpanded ? `Collapse ${node.leafKey}` : `Expand ${node.leafKey}`}
        >
          <ChevronRight
            size={14}
            className={isExpanded ? 'rotate-90' : ''}
            style={{ transition: 'transform 150ms' }}
          />
        </button>
      )}

      <span className="nested-field-label">
        {node.leafKey}
        {node.required && <span className="text-red-400 ml-0.5">*</span>}
      </span>

      <span className="nested-field-type">{node.schema.kind}</span>

      {node.isMapped && (
        <span
          data-testid={`mapped-indicator-${node.path}`}
          className="nested-field-mapped-dot"
          role="img"
          aria-label="Mapped"
        />
      )}

      {atDepthCap && !node.isLeaf && (
        <span className="nested-field-depth-cap" role="img" aria-label="Depth limit reached">…</span>
      )}
    </>
  )

  const suffix = node.isLeaf && renderFieldSuffix ? renderFieldSuffix(node) : null
  const leafButton = node.isLeaf ? (
    <button
      type="button"
      data-testid={`nested-field-${node.path}`}
      className={baseClassName}
      style={{ paddingLeft: `${indent}px` }}
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
    </button>
  ) : null

  return (
    <>
      {node.isLeaf ? (
        suffix ? (
          <div className="flex items-center gap-1">
            {leafButton}
            {suffix}
          </div>
        ) : (
          leafButton
        )
      ) : (
        <div
          data-testid={`nested-field-${node.path}`}
          className={baseClassName}
          style={{ paddingLeft: `${indent}px` }}
        >
          {content}
        </div>
      )}

      {isExpanded && node.children?.map((child) => (
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
    <div className="nested-field-tree" data-testid="nested-field-tree">
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
