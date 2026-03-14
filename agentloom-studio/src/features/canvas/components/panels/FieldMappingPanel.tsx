import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowRightLeft, Check, X } from 'lucide-react'
import type {
  BatchPreviewItem,
  CandidateFieldMapping,
  CanvasEdge,
  CanvasNode,
  CompatibilityLabel,
  FieldMapping,
  MappingSuggestion,
  NestedFieldNode,
  TypeCoercionConfig,
} from '../../types'
import type { PortDataType, TypeSchema } from '../../types/typeSchema'
import { NestedFieldTree } from './NestedFieldTree'
import { CoercionConfigPopover } from './CoercionConfigPopover'
import { MappingSuggestionCard } from './MappingSuggestionCard'
import { buildNestedFieldTree, collectLeafPaths } from '../../lib/nestedFieldTree'
import {
  generateSuggestions,
  getApplicableSuggestions,
  getCompatibilityLabel,
  getSuggestedCoercionConfig,
} from '../../lib/fieldSuggestionEngine'
import type { SuggestionField } from '../../lib/fieldSuggestionEngine'
import { getStrategyLabel } from '../../lib/coercionStrategies'
import { useCanvasStore } from '../../stores/canvasStore'
import { useToast } from '@/shared/ui/toast'

export interface FieldMappingPanelProps {
  open: boolean
  edgeId: string | null
  edge: CanvasEdge | null
  sourceNode: CanvasNode | null
  targetNode: CanvasNode | null
  onClose: () => void
  onChange: (edgeId: string, mappings: FieldMapping[]) => void
}

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

interface PendingCoercion {
  sourceField: string
  targetField: string
  sourceType: PortDataType
  targetType: PortDataType
  initialConfig?: TypeCoercionConfig
}

interface BatchPreviewState {
  items: BatchPreviewItem[]
  unmatchedSources: string[]
}

const EMPTY_SET: ReadonlySet<string> = new Set<string>()

const COMPAT_LABEL_TEXT: Record<CompatibilityLabel, string> = {
  exact: '完全兼容',
  coercible: '可转换',
  incompatible: '不兼容',
}

function getLeafKey(path: string): string {
  return path.split('.').at(-1) ?? path
}

function normalizeFieldName(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

function createBatchPreviewItem(
  sourceField: string,
  targetField: string,
  matchType: BatchPreviewItem['matchType'],
  getLeafSchema: (path: string, side: 'source' | 'target') => TypeSchema | undefined,
): BatchPreviewItem {
  const sourceSchema = getLeafSchema(sourceField, 'source')
  const targetSchema = getLeafSchema(targetField, 'target')

  return {
    sourceField,
    targetField,
    matchType,
    compatibilityLabel:
      sourceSchema && targetSchema
        ? getCompatibilityLabel(sourceSchema, targetSchema)
        : 'exact',
  }
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
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set())
  const [dragSource, setDragSource] = useState<string | null>(null)
  const ctrlPressedRef = useRef(false)
  const batchDragSourcesRef = useRef<Set<string>>(new Set())

  const [pendingCoercion, setPendingCoercion] = useState<PendingCoercion | null>(null)
  const [applyAllConfirmPending, setApplyAllConfirmPending] = useState(false)
  const [batchPreview, setBatchPreview] = useState<BatchPreviewState | null>(null)

  const saveMappingSnapshot = useCanvasStore((s) => s.actions.saveMappingSnapshot)
  const undoFieldMapping = useCanvasStore((s) => s.actions.undoFieldMapping)
  const { notify } = useToast()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') ctrlPressedRef.current = true

      if (
        edgeId &&
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey &&
        e.key.toLowerCase() === 'z'
      ) {
        e.preventDefault()
        undoFieldMapping(edgeId)
      }
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
  }, [edgeId, undoFieldMapping])

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

  const getLeafSchema = useCallback(
    (path: string, side: 'source' | 'target'): TypeSchema | undefined => {
      const leafMap = side === 'source' ? sourceLeafMap : targetLeafMap
      return leafMap.get(path)?.schema
    },
    [sourceLeafMap, targetLeafMap],
  )

  const getLeafKind = useCallback(
    (path: string, side: 'source' | 'target'): PortDataType | undefined => {
      const schema = getLeafSchema(path, side)
      return schema?.kind as PortDataType | undefined
    },
    [getLeafSchema],
  )

  const checkCompat = useCallback(
    (sourceField: string, targetField: string): CompatibilityLabel => {
      const sourceSchema = getLeafSchema(sourceField, 'source')
      const targetSchema = getLeafSchema(targetField, 'target')
      if (!sourceSchema || !targetSchema) return 'exact'
      return getCompatibilityLabel(sourceSchema, targetSchema)
    },
    [getLeafSchema],
  )

  const forbiddenPaths = useMemo<ReadonlySet<string>>(() => {
    const activeSource =
      dragSource ??
      (selectedSources.size === 1 ? (selectedSources.values().next().value as string | undefined) : undefined)
    if (!activeSource) return EMPTY_SET

    const forbidden = new Set<string>()
    for (const path of targetLeafMap.keys()) {
      if (checkCompat(activeSource, path) === 'incompatible') {
        forbidden.add(path)
      }
    }
    return forbidden
  }, [dragSource, selectedSources, targetLeafMap, checkCompat])

  const writeMapping = useCallback(
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

  const attemptMapping = useCallback(
    (sourceField: string, targetField: string) => {
      if (!edgeId) return 'incompatible' as CompatibilityLabel

      const sourceSchema = getLeafSchema(sourceField, 'source')
      const targetSchema = getLeafSchema(targetField, 'target')
      const compat = checkCompat(sourceField, targetField)

      if (compat === 'incompatible') {
        notify({
          variant: 'error',
          description: '字段类型不兼容，且没有可用转换策略',
        })
        return compat
      }

      saveMappingSnapshot(edgeId)

      if (compat === 'coercible') {
        const srcKind = getLeafKind(sourceField, 'source')!
        const tgtKind = getLeafKind(targetField, 'target')!
        setPendingCoercion({
          sourceField,
          targetField,
          sourceType: srcKind,
          targetType: tgtKind,
          initialConfig:
            sourceSchema && targetSchema
              ? getSuggestedCoercionConfig(sourceSchema, targetSchema)
              : undefined,
        })
        return compat
      }

      writeMapping(sourceField, targetField)
      return compat
    },
    [
      edgeId,
      getLeafSchema,
      checkCompat,
      notify,
      saveMappingSnapshot,
      getLeafKind,
      writeMapping,
    ],
  )

  const handlePendingCoercionConfirm = useCallback(
    (config: TypeCoercionConfig) => {
      if (!pendingCoercion) return
      writeMapping(pendingCoercion.sourceField, pendingCoercion.targetField, config)
      setPendingCoercion(null)
    },
    [pendingCoercion, writeMapping],
  )

  const handlePendingCoercionCancel = useCallback(() => {
    if (!edgeId) return
    undoFieldMapping(edgeId)
    setPendingCoercion(null)
  }, [edgeId, undoFieldMapping])

  const buildBatchPreview = useCallback(
    (sourcePaths: Set<string>, anchorTargetPath: string): BatchPreviewState | null => {
      const allTargetLeafPaths = collectLeafPaths(targetTree)
      const unmappedTargets = allTargetLeafPaths.filter((path) => !mappedTargets.has(path))
      if (unmappedTargets.length === 0) return null

      const anchorIndex = unmappedTargets.indexOf(anchorTargetPath)
      const orderedTargets =
        anchorIndex >= 0
          ? [
              ...unmappedTargets.slice(anchorIndex),
              ...unmappedTargets.slice(0, anchorIndex),
            ]
          : unmappedTargets

      const remainingSources = [...sourcePaths]
      const remainingTargets = [...orderedTargets]
      const previewItems: BatchPreviewItem[] = []

      const claimTarget = (
        sourcePath: string,
        matcher: (targetPath: string) => boolean,
        matchType: BatchPreviewItem['matchType'],
      ) => {
        const sourceIndex = remainingSources.indexOf(sourcePath)
        if (sourceIndex === -1) return false

        const targetIndex = remainingTargets.findIndex(matcher)
        if (targetIndex === -1) return false

        const [claimedSource] = remainingSources.splice(sourceIndex, 1)
        const [claimedTarget] = remainingTargets.splice(targetIndex, 1)
        if (!claimedSource || !claimedTarget) return false

        previewItems.push(
          createBatchPreviewItem(claimedSource, claimedTarget, matchType, getLeafSchema),
        )
        return true
      }

      for (const sourcePath of [...remainingSources]) {
        const sourceLeafKey = getLeafKey(sourcePath)
        claimTarget(
          sourcePath,
          (targetPath) => getLeafKey(targetPath) === sourceLeafKey,
          'exact-name',
        )
      }

      for (const sourcePath of [...remainingSources]) {
        const normalizedSourceLeaf = normalizeFieldName(getLeafKey(sourcePath))
        claimTarget(
          sourcePath,
          (targetPath) => normalizeFieldName(getLeafKey(targetPath)) === normalizedSourceLeaf,
          'normalized-name',
        )
      }

      const orderMatches = Math.min(remainingSources.length, remainingTargets.length)
      for (let index = 0; index < orderMatches; index++) {
        const sourcePath = remainingSources[index]
        const targetPath = remainingTargets[index]
        if (!sourcePath || !targetPath) continue

        previewItems.push(
          createBatchPreviewItem(sourcePath, targetPath, 'order', getLeafSchema),
        )
      }

      return {
        items: previewItems,
        unmatchedSources: remainingSources.slice(orderMatches),
      }
    },
    [targetTree, mappedTargets, getLeafSchema],
  )

  const handleSourceClick = useCallback(
    (path: string) => {
      if (isReadonly) return
      setSelectedSources((prev) => {
        if (ctrlPressedRef.current) {
          const next = new Set(prev)
          if (next.has(path)) {
            next.delete(path)
          } else {
            next.add(path)
          }
          return next
        }
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

      if (selectedSources.size > 1) {
        const previewState = buildBatchPreview(selectedSources, path)
        if (previewState) {
          setBatchPreview(previewState)
          setSelectedSources(new Set())
        }
        return
      }

      const firstSource = selectedSources.values().next().value as string | undefined
      if (firstSource) {
        const compat = attemptMapping(firstSource, path)
        if (compat !== 'incompatible') {
          setSelectedSources(new Set())
        }
      }
    },
    [isReadonly, selectedSources, buildBatchPreview, attemptMapping],
  )

  const handleDragStart = useCallback(
    (path: string) => {
      if (isReadonly) return
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
        const previewState = buildBatchPreview(batchSources, targetPath)
        if (previewState && (previewState.items.length > 0 || previewState.unmatchedSources.length > 0)) {
          setBatchPreview(previewState)
        }
      } else {
        const sourcePath = e.dataTransfer.getData('text/plain')
        if (sourcePath) {
          attemptMapping(sourcePath, targetPath)
        }
      }

      setDragSource(null)
      batchDragSourcesRef.current = new Set()
    },
    [buildBatchPreview, attemptMapping],
  )

  const handleBatchPreviewConfirm = useCallback(() => {
    if (!edgeId || !batchPreview) return
    saveMappingSnapshot(edgeId)

    const compatible = batchPreview.items.filter((item) => item.compatibilityLabel !== 'incompatible')
    let newMappings = [...mappings]

    for (const item of compatible) {
      newMappings = newMappings.filter((m) => m.targetField !== item.targetField)
      const sourceSchema = getLeafSchema(item.sourceField, 'source')
      const targetSchema = getLeafSchema(item.targetField, 'target')
      const coercionConfig =
        item.compatibilityLabel === 'coercible' && sourceSchema && targetSchema
          ? getSuggestedCoercionConfig(sourceSchema, targetSchema)
          : undefined

      newMappings.push({
        sourceField: item.sourceField,
        targetField: item.targetField,
        compatLevel: 'L1',
        autoRecommended: false,
        ...(coercionConfig ? { coercionConfig } : {}),
      })
    }

    onChange(edgeId, newMappings)
    const skippedCount = batchPreview.items.length - compatible.length
    notify({
      variant: 'success',
      description: `${compatible.length} 个映射已创建${skippedCount > 0 ? `，${skippedCount} 个不兼容已跳过` : ''}${batchPreview.unmatchedSources.length > 0 ? `，${batchPreview.unmatchedSources.length} 个未匹配` : ''}，Ctrl+Z 撤销`,
    })
    setBatchPreview(null)
  }, [edgeId, batchPreview, mappings, onChange, saveMappingSnapshot, notify, getLeafSchema])

  const handleBatchPreviewCancel = useCallback(() => {
    setBatchPreview(null)
  }, [])

  const handleRemoveMapping = useCallback(
    (targetField: string) => {
      if (isReadonly || !edgeId) return
      saveMappingSnapshot(edgeId)
      onChange(
        edgeId,
        mappings.filter((m) => m.targetField !== targetField),
      )
    },
    [isReadonly, edgeId, mappings, onChange, saveMappingSnapshot],
  )

  const handleCoercionChange = useCallback(
    (targetField: string, coercionConfig: TypeCoercionConfig | undefined) => {
      if (isReadonly || !edgeId) return
      saveMappingSnapshot(edgeId)
      const updated = mappings.map((m) =>
        m.targetField === targetField ? { ...m, coercionConfig } : m,
      )
      onChange(edgeId, updated)
    },
    [isReadonly, edgeId, mappings, onChange, saveMappingSnapshot],
  )

  const handleApplySuggestion = useCallback(
    (suggestion: MappingSuggestion) => {
      if (!edgeId) return
      if (suggestion.compatibilityLabel === 'incompatible') {
        notify({
          variant: 'error',
          description: '该推荐的字段类型不兼容，无法直接应用',
        })
        return
      }

      saveMappingSnapshot(edgeId)

      if (suggestion.compatibilityLabel === 'coercible') {
        const srcKind = getLeafKind(suggestion.sourceField, 'source')
        const tgtKind = getLeafKind(suggestion.targetField, 'target')
        if (srcKind && tgtKind) {
          setPendingCoercion({
            sourceField: suggestion.sourceField,
            targetField: suggestion.targetField,
            sourceType: srcKind,
            targetType: tgtKind,
            initialConfig: suggestion.suggestedCoercion,
          })
          return
        }
      }
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
    [edgeId, mappings, onChange, saveMappingSnapshot, getLeafKind, notify],
  )

  const handleApplyAllSuggestions = useCallback(() => {
    if (!edgeId || applicableSuggestions.length === 0) return
    setApplyAllConfirmPending(true)
  }, [edgeId, applicableSuggestions.length])

  const applyAllConfirmData = useMemo(() => {
    if (!applyAllConfirmPending) return null
    const manualMappedTargets = new Set(
      mappings.filter((m) => !m.autoRecommended).map((m) => m.targetField),
    )
    const bestByTarget = new Map<string, MappingSuggestion>()
    for (const s of applicableSuggestions) {
      if (manualMappedTargets.has(s.targetField)) continue
      const existing = bestByTarget.get(s.targetField)
      if (!existing || s.score > existing.score) {
        bestByTarget.set(s.targetField, s)
      }
    }
    const suggestionsToReview = [...bestByTarget.values()]
    const toApply = suggestionsToReview.filter(
      (suggestion) => suggestion.compatibilityLabel !== 'incompatible',
    )
    const coercibleCount = toApply.filter((s) => s.compatibilityLabel === 'coercible').length
    return {
      toApply,
      coercibleCount,
      skippedManualCount: manualMappedTargets.size,
      skippedIncompatibleCount: suggestionsToReview.length - toApply.length,
    }
  }, [applyAllConfirmPending, applicableSuggestions, mappings])

  const confirmApplyAll = useCallback(() => {
    if (!edgeId || !applyAllConfirmData) return
    saveMappingSnapshot(edgeId)

    let newMappings = [...mappings]
    for (const suggestion of applyAllConfirmData.toApply) {
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
    notify({
      variant: 'success',
      description: `${applyAllConfirmData.toApply.length} 个推荐已应用，Ctrl+Z 撤销`,
    })
    setApplyAllConfirmPending(false)
  }, [edgeId, applyAllConfirmData, mappings, onChange, saveMappingSnapshot, notify])

  const cancelApplyAll = useCallback(() => {
    setApplyAllConfirmPending(false)
  }, [])

  const handleUndo = useCallback(() => {
    if (!edgeId) return
    undoFieldMapping(edgeId)
  }, [edgeId, undoFieldMapping])

  const acceptCandidate = useCallback(
    (candidate: CandidateFieldMapping) => {
      if (isReadonly || !edgeId) return
      saveMappingSnapshot(edgeId)
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
    [isReadonly, edgeId, mappings, onChange, saveMappingSnapshot],
  )

  const acceptAllCandidates = useCallback(() => {
    if (isReadonly || !edgeId || visibleCandidates.length === 0) return
    saveMappingSnapshot(edgeId)
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
  }, [isReadonly, edgeId, visibleCandidates, mappings, onChange, saveMappingSnapshot])

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

          {applyAllConfirmPending && applyAllConfirmData && (
            <div className="apply-all-confirm" data-testid="apply-all-confirm">
              <div className="apply-all-confirm__summary">
                 将应用 {applyAllConfirmData.toApply.length} 个推荐
                 {applyAllConfirmData.coercibleCount > 0 && (
                   <span className="apply-all-confirm__coercible">
                     （{applyAllConfirmData.coercibleCount} 个需要类型转换）
                   </span>
                 )}
                 {applyAllConfirmData.skippedIncompatibleCount > 0 && (
                   <span className="apply-all-confirm__coercible">
                     （{applyAllConfirmData.skippedIncompatibleCount} 个不兼容已跳过）
                   </span>
                 )}
               </div>
              <div className="apply-all-confirm__actions">
                <button
                  type="button"
                  data-testid="apply-all-confirm-btn"
                  className="apply-all-confirm__btn--confirm"
                  onClick={confirmApplyAll}
                >
                  <Check size={12} />
                  确认
                </button>
                <button
                  type="button"
                  data-testid="apply-all-cancel-btn"
                  className="apply-all-confirm__btn--cancel"
                  onClick={cancelApplyAll}
                >
                  <X size={12} />
                  取消
                </button>
              </div>
            </div>
          )}

          {[...bestSuggestionsByTarget.values()].map((s) => (
            <MappingSuggestionCard
              key={`suggestion-${s.targetField}`}
              suggestion={s}
              onApply={handleApplySuggestion}
            />
          ))}
        </div>
      )}

      {batchPreview && (batchPreview.items.length > 0 || batchPreview.unmatchedSources.length > 0) && (
        <div className="batch-preview" data-testid="batch-preview">
          <div className="batch-preview__header">
            批量映射预览 ({batchPreview.items.length} 对)
          </div>
              <div className="batch-preview__list">
            {batchPreview.items.map((item) => (
              <div
                key={`${item.sourceField}->${item.targetField}`}
                className={`batch-preview__item batch-preview__item--${item.compatibilityLabel}`}
                data-testid={`batch-preview-item-${item.targetField}`}
              >
                <span className="truncate">{item.sourceField}</span>
                <span className="shrink-0 text-muted">→</span>
                <span className="truncate">{item.targetField}</span>
                <span className={`batch-preview__match-type batch-preview__match-type--${item.matchType}`}>
                  {item.matchType === 'exact-name' ? '精确' : item.matchType === 'normalized-name' ? '相似' : '序号'}
                </span>
                <span className={`batch-preview__compat batch-preview__compat--${item.compatibilityLabel}`}>
                  {COMPAT_LABEL_TEXT[item.compatibilityLabel]}
                </span>
              </div>
            ))}

              {batchPreview.unmatchedSources.length > 0 && (
               <div
                 className="batch-preview__unmatched flex flex-col gap-1 rounded border border-dashed border-warning/30 bg-warning/5 px-2 py-1.5 text-[11px] text-foreground"
                 data-testid="batch-preview-unmatched"
               >
                 <span className="batch-preview__unmatched-title text-[10px] font-semibold text-warning">
                   未匹配来源
                 </span>
                 <span>{batchPreview.unmatchedSources.join('、')}</span>
               </div>
             )}
          </div>
          <div className="batch-preview__actions">
            <button
              type="button"
              data-testid="batch-preview-confirm"
              className="batch-preview__btn--confirm"
              onClick={handleBatchPreviewConfirm}
            >
              <Check size={12} />
              确认映射
            </button>
            <button
              type="button"
              data-testid="batch-preview-cancel"
              className="batch-preview__btn--cancel"
              onClick={handleBatchPreviewCancel}
            >
              <X size={12} />
              取消
            </button>
          </div>
        </div>
      )}

      {pendingCoercion && (
        <div className="mapping-pending-coercion" data-testid="pending-coercion">
          <div className="mapping-pending-coercion__info">
            <AlertTriangle size={14} className="text-warning" />
            <span>
              {pendingCoercion.sourceField} → {pendingCoercion.targetField}
            </span>
            <span className="text-xs text-muted">
              ({pendingCoercion.sourceType} → {pendingCoercion.targetType})
            </span>
          </div>
          <CoercionConfigPopover
            sourceType={pendingCoercion.sourceType}
            targetType={pendingCoercion.targetType}
            value={pendingCoercion.initialConfig}
            mode="confirm"
            defaultOpen
            onConfirm={handlePendingCoercionConfirm}
            onCancel={handlePendingCoercionCancel}
          />
        </div>
      )}

      {!isReadonly && (
        <div className="mapping-panel__body">
          <div className="flex gap-2">
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
                forbiddenPaths={forbiddenPaths}
              />
            </div>
          </div>

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
                      <>
                        <span
                          className="mapping-line__coercion ml-auto inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning"
                          data-testid={`mapping-line-coercion-${m.targetField}`}
                        >
                          <ArrowRightLeft size={12} />
                          <span>
                            {m.coercionConfig
                              ? getStrategyLabel(m.coercionConfig.strategy)
                              : '待配置转换'}
                          </span>
                        </span>

                        <CoercionConfigPopover
                          sourceType={srcKind}
                          targetType={tgtKind}
                          value={m.coercionConfig}
                          onChange={(config) => handleCoercionChange(m.targetField, config)}
                        />
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}

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
