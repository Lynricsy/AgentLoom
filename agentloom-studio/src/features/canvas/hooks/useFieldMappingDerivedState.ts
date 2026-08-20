import { useCallback, useMemo } from 'react'
import {
  buildLeafNodeMap,
  buildNestedFieldTree,
  collectLeafPaths,
} from '../lib/nestedFieldTree'
import {
  generateSuggestions,
  getApplicableSuggestions,
  getCompatibilityLabel,
} from '../lib/fieldSuggestionEngine'
import type { SuggestionField } from '../lib/fieldSuggestionEngine'
import type { LeafSchemaResolver } from '../lib/fieldMappingBatch'
import type {
  CandidateFieldMapping,
  CanvasEdge,
  CanvasNode,
  CompatibilityLabel,
  FieldMapping,
  MappingSuggestion,
  NestedFieldNode,
} from '../types'
import type { PortDataType } from '../types/typeSchema'

/** 同一 target 只保留最优候选：优先 autoRecommended，其次 confidence */
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

export interface UseFieldMappingDerivedStateOptions {
  edge: CanvasEdge | null
  sourceNode: CanvasNode | null
  targetNode: CanvasNode | null
}

export interface FieldMappingDerivedState {
  isReadonly: boolean
  mappings: FieldMapping[]
  mappedTargets: ReadonlySet<string>
  sourceTree: NestedFieldNode[]
  targetTree: NestedFieldNode[]
  sourceLeafCount: number
  targetLeafCount: number
  sourceLeafMap: Map<string, NestedFieldNode>
  targetLeafMap: Map<string, NestedFieldNode>
  visibleCandidates: CandidateFieldMapping[]
  targetToSource: Map<string, string>
  requiredUnmappedCount: number
  suggestedSourceFields: ReadonlySet<string>
  suggestedTargetFields: ReadonlySet<string>
  applicableSuggestions: MappingSuggestion[]
  bestSuggestionsByTarget: Map<string, MappingSuggestion>
  getLeafSchema: LeafSchemaResolver
  getLeafKind: (
    path: string,
    side: 'source' | 'target',
  ) => PortDataType | undefined
  checkCompat: (sourceField: string, targetField: string) => CompatibilityLabel
}

/**
 * 字段映射面板的派生数据：源 / 目标字段树、已映射索引、候选与智能推荐。
 * 摘要与「必填未映射」统计直接消费 canonical `edge.data`，不从 schema 重新推导差异。
 */
export function useFieldMappingDerivedState({
  edge,
  sourceNode,
  targetNode,
}: UseFieldMappingDerivedStateOptions): FieldMappingDerivedState {
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

  const getLeafSchema = useCallback<LeafSchemaResolver>(
    (path, side) => {
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

  return {
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
  }
}
