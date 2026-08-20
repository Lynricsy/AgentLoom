import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '@/shared/ui/toast'
import {
  buildFieldMappingBatchPreview,
  type BatchPreviewState,
  type LeafSchemaResolver,
} from '../lib/fieldMappingBatch'
import { getSuggestedCoercionConfig } from '../lib/fieldSuggestionEngine'
import { useCanvasStore } from '../stores/canvasStore'
import type {
  CandidateFieldMapping,
  CompatibilityLabel,
  FieldMapping,
  MappingSuggestion,
  NestedFieldNode,
  TypeCoercionConfig,
} from '../types'
import type { PortDataType } from '../types/typeSchema'

const EMPTY_SET: ReadonlySet<string> = new Set<string>()

export interface PendingCoercion {
  sourceField: string
  targetField: string
  sourceType: PortDataType
  targetType: PortDataType
  initialConfig?: TypeCoercionConfig
}

export interface ApplyAllConfirmSummary {
  toApply: MappingSuggestion[]
  coercibleCount: number
  skippedManualCount: number
  skippedIncompatibleCount: number
}

export interface UseFieldMappingInteractionsOptions {
  edgeId: string | null
  isReadonly: boolean
  mappings: FieldMapping[]
  targetTree: NestedFieldNode[]
  mappedTargets: ReadonlySet<string>
  targetLeafMap: Map<string, NestedFieldNode>
  visibleCandidates: CandidateFieldMapping[]
  applicableSuggestions: MappingSuggestion[]
  getLeafSchema: LeafSchemaResolver
  getLeafKind: (
    path: string,
    side: 'source' | 'target',
  ) => PortDataType | undefined
  checkCompat: (sourceField: string, targetField: string) => CompatibilityLabel
  onChange: (edgeId: string, mappings: FieldMapping[]) => void
}

export interface UseFieldMappingInteractionsResult {
  selectedSources: ReadonlySet<string>
  dragSource: string | null
  forbiddenPaths: ReadonlySet<string>
  targetDisabled: boolean
  pendingCoercion: PendingCoercion | null
  batchPreview: BatchPreviewState | null
  applyAllConfirmPending: boolean
  applyAllConfirmData: ApplyAllConfirmSummary | null
  handleSourceClick: (path: string) => void
  handleTargetClick: (path: string) => void
  handleDragStart: (path: string) => void
  handleDragEnd: () => void
  handleDragOver: (event: React.DragEvent) => void
  handleDrop: (event: React.DragEvent, targetPath: string) => void
  handlePendingCoercionConfirm: (config: TypeCoercionConfig) => void
  handlePendingCoercionCancel: () => void
  handleBatchPreviewConfirm: () => void
  handleBatchPreviewCancel: () => void
  handleRemoveMapping: (targetField: string) => void
  handleCoercionChange: (
    targetField: string,
    coercionConfig: TypeCoercionConfig | undefined,
  ) => void
  handleApplySuggestion: (suggestion: MappingSuggestion) => void
  handleApplyAllSuggestions: () => void
  confirmApplyAll: () => void
  cancelApplyAll: () => void
  handleUndo: () => void
  acceptCandidate: (candidate: CandidateFieldMapping) => void
  acceptAllCandidates: () => void
}

/**
 * 字段映射面板的交互：选择 / 拖拽 / 批量预览 / 类型转换确认 / 撤销。
 * 每次写映射前都先 `saveMappingSnapshot`，保证 Ctrl+Z 与取消流程可回滚。
 */
export function useFieldMappingInteractions({
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
}: UseFieldMappingInteractionsOptions): UseFieldMappingInteractionsResult {
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
    (sourcePaths: Set<string>, anchorTargetPath: string) =>
      buildFieldMappingBatchPreview(
        sourcePaths,
        anchorTargetPath,
        targetTree,
        mappedTargets,
        getLeafSchema,
      ),
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

  const applyAllConfirmData = useMemo<ApplyAllConfirmSummary | null>(() => {
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

  return {
    selectedSources,
    dragSource,
    forbiddenPaths,
    targetDisabled: selectedSources.size === 0 && !dragSource,
    pendingCoercion,
    batchPreview,
    applyAllConfirmPending,
    applyAllConfirmData,
    handleSourceClick,
    handleTargetClick,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDrop,
    handlePendingCoercionConfirm,
    handlePendingCoercionCancel,
    handleBatchPreviewConfirm,
    handleBatchPreviewCancel,
    handleRemoveMapping,
    handleCoercionChange,
    handleApplySuggestion,
    handleApplyAllSuggestions,
    confirmApplyAll,
    cancelApplyAll,
    handleUndo,
    acceptCandidate,
    acceptAllCandidates,
  }
}
