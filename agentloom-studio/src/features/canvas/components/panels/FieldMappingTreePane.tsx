import type { ReactNode } from 'react'
import { NestedFieldTree } from './NestedFieldTree'
import type { NestedFieldNode } from '../../types'

const EMPTY_SET: ReadonlySet<string> = new Set<string>()

export interface FieldMappingTreePaneProps {
  sourceLabel: string
  targetLabel: string
  sourceTree: NestedFieldNode[]
  targetTree: NestedFieldNode[]
  sourceLeafCount: number
  targetLeafCount: number
  selectedSources: ReadonlySet<string>
  suggestedSourceFields: ReadonlySet<string>
  suggestedTargetFields: ReadonlySet<string>
  forbiddenPaths: ReadonlySet<string>
  targetDisabled: boolean
  onSourceClick: (path: string) => void
  onTargetClick: (path: string) => void
  onDragStart: (path: string) => void
  onDragEnd: () => void
  onDragOver: (event: React.DragEvent) => void
  onDrop: (event: React.DragEvent, targetPath: string) => void
  renderTargetSuffix: (node: NestedFieldNode) => ReactNode
}

/** 源 / 目标字段树双栏：左侧点选或拖拽，右侧接收并展示禁止态 */
export function FieldMappingTreePane({
  sourceLabel,
  targetLabel,
  sourceTree,
  targetTree,
  sourceLeafCount,
  targetLeafCount,
  selectedSources,
  suggestedSourceFields,
  suggestedTargetFields,
  forbiddenPaths,
  targetDisabled,
  onSourceClick,
  onTargetClick,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  renderTargetSuffix,
}: FieldMappingTreePaneProps) {
  return (
    <div className="flex gap-2">
      <div className="flex-1 min-w-0">
        <div
          className="mapping-panel__section-title"
          data-testid="mapping-source-summary"
        >
          源: {sourceLabel} ({sourceLeafCount})
        </div>
        <NestedFieldTree
          nodes={sourceTree}
          selectedPaths={selectedSources}
          onFieldClick={onSourceClick}
          onFieldDragStart={onDragStart}
          onFieldDragEnd={onDragEnd}
          suggestedPaths={suggestedSourceFields}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div
          className="mapping-panel__section-title"
          data-testid="mapping-target-summary"
        >
          目标: {targetLabel} ({targetLeafCount})
        </div>
        <NestedFieldTree
          nodes={targetTree}
          selectedPaths={EMPTY_SET}
          onFieldClick={onTargetClick}
          onFieldDragOver={onDragOver}
          onFieldDrop={onDrop}
          suggestedPaths={suggestedTargetFields}
          renderFieldSuffix={renderTargetSuffix}
          disableLeafInteraction={targetDisabled}
          forbiddenPaths={forbiddenPaths}
        />
      </div>
    </div>
  )
}
