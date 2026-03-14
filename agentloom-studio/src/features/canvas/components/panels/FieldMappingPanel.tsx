import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type {
  CandidateFieldMapping,
  CanvasEdge,
  CanvasNode,
  FieldMapping,
  MappingSuggestion,
  NestedFieldNode,
  TypeCoercionConfig,
} from '../../types'
import type { PortDataType } from '../../types/typeSchema'
import { NestedFieldTree } from './NestedFieldTree'
import { CoercionConfigPopover } from './CoercionConfigPopover'
import { MappingSuggestionCard } from './MappingSuggestionCard'
import { buildNestedFieldTree, collectLeafPaths } from '../../lib/nestedFieldTree'
import {
  generateSuggestions,
  getApplicableSuggestions,
  normalizedLevenshteinSimilarity,
} from '../../lib/fieldSuggestionEngine'
import type { SuggestionField } from '../../lib/fieldSuggestionEngine'
import { useCanvasStore } from '../../stores/canvasStore'

export interface FieldMappingPanelProps {
  open: boolean
  edgeId: string | null
  edge: CanvasEdge | null
  sourceNode: CanvasNode | null
  targetNode: CanvasNode | null
  onClose: () => void
  onChange: (edgeId: string, mappings: FieldMapping[]) => void
}

/** C4 候选映射按 target 去重: autoRecommended 优先, 再按 confidence 排序 */
function selectBestCandidatesByTarget(
  candidates: CandidateFieldMapping[],
): CandidateFieldMapping[] {
  const bestByTarget = new Map<string, CandidateFieldMapping>()

  for (const candidate of candidates) {
    const current = bestByTarget.get(candidate.targetPath)
    if (!current) {
      bestByTarget.set(candidate.targetPath, candidate)
      continue
    }

    const shouldReplace =
      candidate.autoRecommended !== current.autoRecommended
        ? candidate.autoRecommended
        : candidate.confidence > current.confidence

    if (shouldReplace) {
      bestByTarget.set(candidate.targetPath, candidate)
    }
  }

  return [...bestByTarget.values()].sort((left, right) => {
    if (left.autoRecommended !== right.autoRecommended) {
      return Number(right.autoRecommended) - Number(left.autoRecommended)
    }

    if (left.confidence !== right.confidence) {
      return right.confidence - left.confidence
    }

    return left.targetPath.localeCompare(right.targetPath)
  })
}

function collectLeafNodes(nodes: NestedFieldNode[]): NestedFieldNode[] {
  const result: NestedFieldNode[] = []
  for (const node of nodes) {
    if (node.isLeaf) {
      result.push(node)
    } else if (node.children) {
      result.push(...collectLeafNodes(node.children))
    }
  }
  return result
}

function buildLeafNodeMap(nodes: NestedFieldNode[]): Map<string, NestedFieldNode> {
  const map = new Map<string, NestedFieldNode>()
  for (const leaf of collectLeafNodes(nodes)) {
    map.set(leaf.path, leaf)
  }
  return map
}

const BATCH_NAME_MATCH_THRESHOLD = 0.3

const EMPTY_SET: ReadonlySet<string> = new Set<string>()

export const FieldMappingPanel = memo(function FieldMappingPanel({
  open,
  edgeId,
  edge,
  sourceNode,
  targetNode,
  onClose,
  onChange,
}: FieldMappingPanelProps) {
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set())
  const [dragSource, setDragSource] = useState<string | null>(null)
  const ctrlPressedRef = useRef(false)
  const batchDragSourcesRef = useRef<Set<string>>(new Set())

  const saveMappingSnapshot = useCanvasStore((s) => s.saveMappingSnapshot)
  const undoFieldMapping = useCanvasStore((s) => s.undoFieldMapping)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') ctrlPressedRef.current = true
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') ctrlPressedRef.current = false
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  const edgeData = edge?.data
  const isReadonly = edgeData?.visualLevel === 'L0'
  const mappings = useMemo(() => edgeData?.fieldMapping ?? [], [edgeData?.fieldMapping])
  const candidates = useMemo<CandidateFieldMapping[]>(
    () => edgeData?.candidateMappings ?? [],
    [edgeData?.candidateMappings],
  )

  const mappedTargets = useMemo(
    () => new Set(mappings.map((m) => m.targetField)),
    [mappings],
  )
  const mappedSources = useMemo(
    () => new Set(mappings.map((m) => m.sourceField)),
    [mappings],
  )

  const sourceTree = useMemo(
    () => (sourceNode ? buildNestedFieldTree(sourceNode.data.outputPorts, mappedSources) : []),
    [sourceNode, mappedSources],
  )
  const targetTree = useMemo(
    () => (targetNode ? buildNestedFieldTree(targetNode.data.inputPorts, mappedTargets) : []),
    [targetNode, mappedTargets],
  )

  const sourceLeafCount = useMemo(() => collectLeafPaths(sourceTree).length, [sourceTree])
  const targetLeafCount = useMemo(() => collectLeafPaths(targetTree).length, [targetTree])

  const sourceLeafMap = useMemo(() => buildLeafNodeMap(sourceTree), [sourceTree])
  const targetLeafMap = useMemo(() => buildLeafNodeMap(targetTree), [targetTree])

  const visibleCandidates = useMemo(
    () =>
      selectBestCandidatesByTarget(candidates).filter(
        (candidate) => !mappedTargets.has(candidate.targetPath),
      ),
    [candidates, mappedTargets],
  )

  const targetToSource = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of mappings) {
      map.set(m.targetField, m.sourceField)
    }
    return map
  }, [mappings])

  const requiredUnmappedCount = useMemo(
    () =>
      (edgeData?.missingFields ?? []).filter(
        (field) => field.required && !mappedTargets.has(field.path),
      ).length,
    [edgeData?.missingFields, mappedTargets],
  )

  const suggestedTargetFields = useMemo(
    () =>
      new Set(
        visibleCandidates
          .filter((candidate) => candidate.autoRecommended)
          .map((candidate) => candidate.targetPath),
      ),
    [visibleCandidates],
  )

  const suggestedSourceFields = useMemo(
    () =>
      new Set(
        visibleCandidates
          .filter((candidate) => candidate.autoRecommended)
          .map((candidate) => candidate.sourcePath),
      ),
    [visibleCandidates],
  )

  const suggestions = useMemo(() => {
    if (isReadonly) return []
    const srcFields: SuggestionField[] = [...sourceLeafMap.values()].map((n) => ({
      path: n.path,
      schema: n.schema,
      required: n.required,
    }))
    const unmappedTargetFields: SuggestionField[] = [...targetLeafMap.values()]
      .filter((n) => !mappedTargets.has(n.path))
      .map((n) => ({ path: n.path, schema: n.schema, required: n.required }))
    if (srcFields.length === 0 || unmappedTargetFields.length === 0) return []
    return generateSuggestions(srcFields, unmappedTargetFields)
  }, [isReadonly, sourceLeafMap, targetLeafMap, mappedTargets])

  const applicableSuggestions = useMemo(
    () => getApplicableSuggestions(suggestions),
    [suggestions],
  )

  const bestSuggestionsByTarget = useMemo(() => {
    const map = new Map<string, MappingSuggestion>()
    for (const s of suggestions) {
      const existing = map.get(s.targetField)
      if (!existing || s.score > existing.score) {
        map.set(s.targetField, s)
      }
    }
    return map
  }, [suggestions])

  const createMapping = useCallback(
    (sourceField: string, targetField: string, coercionConfig?: TypeCoercionConfig) => {
      if (!edgeId) return
      const existing = mappings.filter((m) => m.targetField !== targetField)
      const newMapping: FieldMapping = {
        sourceField,
        targetField,
        compatLevel: 'L1',
        autoRecommended: false,
        ...(coercionConfig ? { coercionConfig } : {}),
      }
      onChange(edgeId, [...existing, newMapping])
    },
    [edgeId, mappings, onChange],
  )

  const handleSourceClick = useCallback(
    (path: string) => {
      if (isReadonly) return
      setSelectedSources((prev) => {
        if (ctrlPressedRef.current) {
          // Ctrl/Cmd: 切换多选
          const next = new Set(prev)
          if (next.has(path)) {
            next.delete(path)
          } else {
            next.add(path)
          }
          return next
        }
        // 非 Ctrl: 切换单选
        if (prev.has(path) && prev.size === 1) {
          return new Set()
        }
        return new Set([path])
      })
    },
    [isReadonly],
  )

  const handleTargetClick = useCallback(
    (path: string) => {
      if (isReadonly || selectedSources.size === 0) return
      const firstSource = selectedSources.values().next().value as string | undefined
      if (firstSource) {
        createMapping(firstSource, path)
      }
      setSelectedSources(new Set())
    },
    [isReadonly, selectedSources, createMapping],
  )

  const handleDragStart = useCallback(
    (path: string) => {
      if (isReadonly) return
      // 若拖拽的字段属于多选组，批量拖拽所有选中源
      if (selectedSources.has(path) && selectedSources.size > 1) {
        batchDragSourcesRef.current = new Set(selectedSources)
      } else {
        batchDragSourcesRef.current = new Set([path])
      }
      setDragSource(path)
    },
    [isReadonly, selectedSources],
  )

  const handleDragEnd = useCallback(() => {
    setDragSource(null)
    batchDragSourcesRef.current = new Set()
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'link'
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent, targetPath: string) => {
      e.preventDefault()
      const batchSources = batchDragSourcesRef.current

      if (batchSources.size > 1) {
        // 批量拖放：按名称相似度匹配
        const allTargetLeafPaths = collectLeafPaths(targetTree)
        const unmappedTargets = allTargetLeafPaths.filter((p) => !mappedTargets.has(p))

        let newMappings = [...mappings]
        const claimed = new Set<string>()

        for (const sourcePath of batchSources) {
          const sourceLeafKey = sourcePath.split('.').at(-1) ?? sourcePath
          let bestMatch: string | null = null
          let bestScore = BATCH_NAME_MATCH_THRESHOLD

          for (const tp of unmappedTargets) {
            if (claimed.has(tp)) continue
            const targetLeafKey = tp.split('.').at(-1) ?? tp
            const score = normalizedLevenshteinSimilarity(sourceLeafKey, targetLeafKey)
            if (score > bestScore) {
              bestScore = score
              bestMatch = tp
            }
          }

          if (bestMatch) {
            newMappings = newMappings.filter((m) => m.targetField !== bestMatch)
            newMappings.push({
              sourceField: sourcePath,
              targetField: bestMatch,
              compatLevel: 'L1',
              autoRecommended: false,
            })
            claimed.add(bestMatch)
          }
        }

        if (edgeId) {
          saveMappingSnapshot(edgeId)
          onChange(edgeId, newMappings)
        }
      } else {
        // 单个拖放
        const sourcePath = e.dataTransfer.getData('text/plain')
        if (sourcePath) {
          createMapping(sourcePath, targetPath)
        }
      }

      setDragSource(null)
      batchDragSourcesRef.current = new Set()
    },
    [mappings, edgeId, onChange, createMapping, targetTree, mappedTargets, saveMappingSnapshot],
  )

  const handleRemoveMapping = useCallback(
    (targetField: string) => {
      if (isReadonly || !edgeId) return
      onChange(
        edgeId,
        mappings.filter((m) => m.targetField !== targetField),
      )
    },
    [isReadonly, edgeId, mappings, onChange],
  )

  const handleCoercionChange = useCallback(
    (targetField: string, coercionConfig: TypeCoercionConfig | undefined) => {
      if (isReadonly || !edgeId) return
      const updated = mappings.map((m) =>
        m.targetField === targetField ? { ...m, coercionConfig } : m,
      )
      onChange(edgeId, updated)
    },
    [isReadonly, edgeId, mappings, onChange],
  )

  const handleApplySuggestion = useCallback(
    (suggestion: MappingSuggestion) => {
      if (!edgeId) return
      saveMappingSnapshot(edgeId)
      const existing = mappings.filter((m) => m.targetField !== suggestion.targetField)
      const newMapping: FieldMapping = {
        sourceField: suggestion.sourceField,
        targetField: suggestion.targetField,
        compatLevel: 'L1',
        autoRecommended: false,
        confidence: suggestion.score,
        ...(suggestion.suggestedCoercion ? { coercionConfig: suggestion.suggestedCoercion } : {}),
      }
      onChange(edgeId, [...existing, newMapping])
    },
    [edgeId, mappings, onChange, saveMappingSnapshot],
  )

  const handleApplyAllSuggestions = useCallback(() => {
    if (!edgeId || applicableSuggestions.length === 0) return
    saveMappingSnapshot(edgeId)

    // 跳过手动映射的 target
    const manualMappedTargets = new Set(
      mappings.filter((m) => !m.autoRecommended).map((m) => m.targetField),
    )

    // 每个 target 取最佳推荐
    const bestByTarget = new Map<string, MappingSuggestion>()
    for (const s of applicableSuggestions) {
      if (manualMappedTargets.has(s.targetField)) continue
      const existing = bestByTarget.get(s.targetField)
      if (!existing || s.score > existing.score) {
        bestByTarget.set(s.targetField, s)
      }
    }

    let newMappings = [...mappings]
    for (const [, suggestion] of bestByTarget) {
      newMappings = newMappings.filter((m) => m.targetField !== suggestion.targetField)
      newMappings.push({
        sourceField: suggestion.sourceField,
        targetField: suggestion.targetField,
        compatLevel: 'L1',
        autoRecommended: false,
        confidence: suggestion.score,
        ...(suggestion.suggestedCoercion
          ? { coercionConfig: suggestion.suggestedCoercion }
          : {}),
      })
    }

    onChange(edgeId, newMappings)
  }, [edgeId, applicableSuggestions, mappings, onChange, saveMappingSnapshot])

  const handleUndo = useCallback(() => {
    if (!edgeId) return
    undoFieldMapping(edgeId)
  }, [edgeId, undoFieldMapping])

  const acceptCandidate = useCallback(
    (candidate: CandidateFieldMapping) => {
      if (isReadonly || !edgeId) return
      const existing = mappings.filter((m) => m.targetField !== candidate.targetPath)
      const newMapping: FieldMapping = {
        sourceField: candidate.sourcePath,
        targetField: candidate.targetPath,
        compatLevel: 'L1',
        autoRecommended: true,
        confidence: candidate.confidence,
      }
      onChange(edgeId, [...existing, newMapping])
    },
    [isReadonly, edgeId, mappings, onChange],
  )

  const acceptAllCandidates = useCallback(() => {
    if (isReadonly || !edgeId || visibleCandidates.length === 0) return
    const newMappings = visibleCandidates.map(
      (c): FieldMapping => ({
        sourceField: c.sourcePath,
        targetField: c.targetPath,
        compatLevel: 'L1',
        autoRecommended: true,
        confidence: c.confidence,
      }),
    )
    onChange(edgeId, [...mappings, ...newMappings])
  }, [isReadonly, edgeId, visibleCandidates, mappings, onChange])

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

  const targetDisabled = selectedSources.size === 0 && !dragSource

  return (
    <aside
      className={`mapping-panel${open ? ' mapping-panel--open' : ''}`}
      data-testid="field-mapping-panel"
      aria-label="字段映射面板"
      aria-hidden={!open}
    >
      <div className="mapping-panel__header">
        <h3 className="mapping-panel__title">字段映射</h3>
        <button
          type="button"
          className="mapping-panel__close"
          data-testid="mapping-panel-close"
          aria-label="关闭映射面板"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>

      <div className="mapping-panel__summary" data-testid="mapping-required-summary">
        {isReadonly ? (
          <span>完全匹配，无需映射</span>
        ) : requiredUnmappedCount > 0 ? (
          <span className="mapping-panel__summary-item--warning">
            {requiredUnmappedCount} 个必填字段未映射
          </span>
        ) : (
          <span>所有必填字段已映射</span>
        )}
      </div>

      {/* C4 候选映射 */}
      {!isReadonly && visibleCandidates.length > 0 && (
        <div className="mapping-panel__candidates" data-testid="mapping-candidates-section">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-xs text-muted">
              {visibleCandidates.length} 个推荐映射
            </span>
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              data-testid="accept-all-candidates"
              onClick={acceptAllCandidates}
            >
              全部接受
            </button>
          </div>
          {visibleCandidates.map((c) => (
            <div
              key={`candidate-${c.targetPath}`}
              className="mapping-line mapping-line--auto"
              data-testid={`candidate-${c.targetPath}`}
            >
              <span className="truncate">{c.sourcePath}</span>
              <span className="shrink-0 text-muted">→</span>
              <span className="truncate">{c.targetPath}</span>
              <button
                type="button"
                className="shrink-0 rounded px-1.5 py-0.5 text-xs text-primary hover:bg-primary/10"
                data-testid={`accept-candidate-${c.targetPath}`}
                onClick={() => acceptCandidate(c)}
              >
                接受
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 智能推荐 */}
      {!isReadonly && bestSuggestionsByTarget.size > 0 && (
        <div className="mapping-panel__suggestions" data-testid="mapping-suggestions-section">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-xs text-muted">
              {bestSuggestionsByTarget.size} 个智能推荐
            </span>
            {applicableSuggestions.length > 0 && (
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                data-testid="apply-all-suggestions"
                onClick={handleApplyAllSuggestions}
              >
                应用全部推荐
              </button>
            )}
          </div>
          {[...bestSuggestionsByTarget.values()].map((s) => (
            <MappingSuggestionCard
              key={`suggestion-${s.targetField}`}
              suggestion={s}
              onApply={handleApplySuggestion}
            />
          ))}
        </div>
      )}

      {!isReadonly && (
        <div className="mapping-panel__body">
          <div className="flex gap-2">
            {/* 源字段树 */}
            <div className="flex-1 min-w-0">
              <div
                className="mapping-panel__section-title"
                data-testid="mapping-source-summary"
              >
                源: {sourceNode?.data.label ?? '—'} ({sourceLeafCount})
              </div>
              <NestedFieldTree
                nodes={sourceTree}
                selectedPaths={selectedSources}
                onFieldClick={handleSourceClick}
                onFieldDragStart={handleDragStart}
                onFieldDragEnd={handleDragEnd}
                suggestedPaths={suggestedSourceFields}
              />
            </div>

            {/* 目标字段树 */}
            <div className="flex-1 min-w-0">
              <div
                className="mapping-panel__section-title"
                data-testid="mapping-target-summary"
              >
                目标: {targetNode?.data.label ?? '—'} ({targetLeafCount})
              </div>
              <NestedFieldTree
                nodes={targetTree}
                selectedPaths={EMPTY_SET}
                onFieldClick={handleTargetClick}
                onFieldDragOver={handleDragOver}
                onFieldDrop={handleDrop}
                suggestedPaths={suggestedTargetFields}
                renderFieldSuffix={renderTargetSuffix}
                disableLeafInteraction={targetDisabled}
              />
            </div>
          </div>

          {/* 映射连线 (含类型强制转换) */}
          {mappings.length > 0 && (
            <div className="mt-3 space-y-1">
              {mappings.map((m) => {
                const srcNode = sourceLeafMap.get(m.sourceField)
                const tgtNode = targetLeafMap.get(m.targetField)
                const srcKind = srcNode?.schema.kind as PortDataType | undefined
                const tgtKind = tgtNode?.schema.kind as PortDataType | undefined
                return (
                  <div
                    key={`${m.sourceField}->${m.targetField}`}
                    className={`mapping-line${m.autoRecommended ? ' mapping-line--auto' : ''}`}
                  >
                    <span className="truncate">{m.sourceField}</span>
                    <span className="shrink-0 text-muted">→</span>
                    <span className="truncate">{m.targetField}</span>
                    {srcKind && tgtKind && srcKind !== tgtKind && (
                      <CoercionConfigPopover
                        sourceType={srcKind}
                        targetType={tgtKind}
                        value={m.coercionConfig}
                        onChange={(config) => handleCoercionChange(m.targetField, config)}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* 撤销按钮 */}
          <button
            type="button"
            className="mt-2 text-xs text-muted hover:text-primary"
            data-testid="mapping-undo"
            onClick={handleUndo}
          >
            撤销
          </button>
        </div>
      )}
    </aside>
  )
})
