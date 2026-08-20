import { memo, useCallback } from 'react'
import { X } from 'lucide-react'
import { FieldMappingBatchPreview } from './FieldMappingBatchPreview'
import { FieldMappingCandidates } from './FieldMappingCandidates'
import { FieldMappingList } from './FieldMappingList'
import { FieldMappingPendingCoercion } from './FieldMappingPendingCoercion'
import { FieldMappingSuggestions } from './FieldMappingSuggestions'
import { FieldMappingSummary } from './FieldMappingSummary'
import { FieldMappingTreePane } from './FieldMappingTreePane'
import { useFieldMappingDerivedState } from '../../hooks/useFieldMappingDerivedState'
import { useFieldMappingInteractions } from '../../hooks/useFieldMappingInteractions'
import type {
  CanvasEdge,
  CanvasNode,
  FieldMapping,
  NestedFieldNode,
} from '../../types'

export interface FieldMappingPanelProps {
  open: boolean
  edgeId: string | null
  edge: CanvasEdge | null
  sourceNode: CanvasNode | null
  targetNode: CanvasNode | null
  onClose: () => void
  onChange: (edgeId: string, mappings: FieldMapping[]) => void
}

export const FieldMappingPanel = memo(function FieldMappingPanel({
  open,
  edgeId,
  edge,
  sourceNode,
  targetNode,
  onClose,
  onChange,
}: FieldMappingPanelProps) {
  const {
    isReadonly,
    mappings,
    mappedTargets,
    sourceTree,
    targetTree,
    sourceLeafCount,
    targetLeafCount,
    sourceLeafMap,
    targetLeafMap,
    visibleCandidates,
    targetToSource,
    requiredUnmappedCount,
    suggestedSourceFields,
    suggestedTargetFields,
    applicableSuggestions,
    bestSuggestionsByTarget,
    getLeafSchema,
    getLeafKind,
    checkCompat,
  } = useFieldMappingDerivedState({ edge, sourceNode, targetNode })

  const interactions = useFieldMappingInteractions({
    edgeId,
    isReadonly,
    mappings,
    targetTree,
    mappedTargets,
    targetLeafMap,
    visibleCandidates,
    applicableSuggestions,
    getLeafSchema,
    getLeafKind,
    checkCompat,
    onChange,
  })

  const { handleRemoveMapping } = interactions

  const renderTargetSuffix = useCallback(
    (node: NestedFieldNode) => {
      const sourceForThis = targetToSource.get(node.path)
      if (!sourceForThis || isReadonly) return null
      return (
        <button
          type="button"
          className="shrink-0 rounded p-0.5 text-muted hover:text-error"
          aria-label={`删除 ${node.leafKey} 映射`}
          onClick={() => handleRemoveMapping(node.path)}
        >
          <X size={12} />
        </button>
      )
    },
    [targetToSource, isReadonly, handleRemoveMapping],
  )

  return (
    <aside
      className={`mapping-panel${open ? ' mapping-panel--open' : ''}`}
      data-testid="field-mapping-panel"
      aria-label="字段映射面板"
      aria-hidden={!open}
    >
      <FieldMappingSummary
        isReadonly={isReadonly}
        requiredUnmappedCount={requiredUnmappedCount}
        onClose={onClose}
      />

      {!isReadonly && visibleCandidates.length > 0 && (
        <FieldMappingCandidates
          candidates={visibleCandidates}
          onAccept={interactions.acceptCandidate}
          onAcceptAll={interactions.acceptAllCandidates}
        />
      )}

      {!isReadonly && bestSuggestionsByTarget.size > 0 && (
        <FieldMappingSuggestions
          suggestionsByTarget={bestSuggestionsByTarget}
          hasApplicableSuggestions={applicableSuggestions.length > 0}
          applyAllConfirmData={interactions.applyAllConfirmData}
          onApplySuggestion={interactions.handleApplySuggestion}
          onApplyAll={interactions.handleApplyAllSuggestions}
          onConfirmApplyAll={interactions.confirmApplyAll}
          onCancelApplyAll={interactions.cancelApplyAll}
        />
      )}

      {interactions.batchPreview &&
        (interactions.batchPreview.items.length > 0 ||
          interactions.batchPreview.unmatchedSources.length > 0) && (
          <FieldMappingBatchPreview
            preview={interactions.batchPreview}
            onConfirm={interactions.handleBatchPreviewConfirm}
            onCancel={interactions.handleBatchPreviewCancel}
          />
        )}

      {interactions.pendingCoercion && (
        <FieldMappingPendingCoercion
          pending={interactions.pendingCoercion}
          onConfirm={interactions.handlePendingCoercionConfirm}
          onCancel={interactions.handlePendingCoercionCancel}
        />
      )}

      {!isReadonly && (
        <div className="mapping-panel__body">
          <FieldMappingTreePane
            sourceLabel={sourceNode?.data.label ?? '—'}
            targetLabel={targetNode?.data.label ?? '—'}
            sourceTree={sourceTree}
            targetTree={targetTree}
            sourceLeafCount={sourceLeafCount}
            targetLeafCount={targetLeafCount}
            selectedSources={interactions.selectedSources}
            suggestedSourceFields={suggestedSourceFields}
            suggestedTargetFields={suggestedTargetFields}
            forbiddenPaths={interactions.forbiddenPaths}
            targetDisabled={interactions.targetDisabled}
            onSourceClick={interactions.handleSourceClick}
            onTargetClick={interactions.handleTargetClick}
            onDragStart={interactions.handleDragStart}
            onDragEnd={interactions.handleDragEnd}
            onDragOver={interactions.handleDragOver}
            onDrop={interactions.handleDrop}
            renderTargetSuffix={renderTargetSuffix}
          />

          {mappings.length > 0 && (
            <FieldMappingList
              mappings={mappings}
              sourceLeafMap={sourceLeafMap}
              targetLeafMap={targetLeafMap}
              onCoercionChange={interactions.handleCoercionChange}
            />
          )}

          <button
            type="button"
            className="mt-2 text-xs text-muted hover:text-primary"
            data-testid="mapping-undo"
            onClick={interactions.handleUndo}
          >
            撤销
          </button>
        </div>
      )}
    </aside>
  )
})
