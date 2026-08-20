import { collectLeafPaths } from './nestedFieldTree'
import { getCompatibilityLabel } from './fieldSuggestionEngine'
import type { BatchPreviewItem, NestedFieldNode } from '../types'
import type { TypeSchema } from '../types/typeSchema'

export type LeafSchemaResolver = (
  path: string,
  side: 'source' | 'target',
) => TypeSchema | undefined

export interface BatchPreviewState {
  items: BatchPreviewItem[]
  unmatchedSources: string[]
}

function getLeafKey(path: string): string {
  return path.split('.').at(-1) ?? path
}

/** 批量匹配用的宽松名称：去掉大小写、分隔符与全角差异 */
function normalizeFieldName(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

function createBatchPreviewItem(
  sourceField: string,
  targetField: string,
  matchType: BatchPreviewItem['matchType'],
  getLeafSchema: LeafSchemaResolver,
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

/**
 * 批量拖拽 / 多选映射的预览。
 * 匹配顺序：精确 leaf 名称 → 归一化名称 → 剩余按顺序兜底；目标从锚点开始环形排列。
 */
export function buildFieldMappingBatchPreview(
  sourcePaths: ReadonlySet<string>,
  anchorTargetPath: string,
  targetTree: NestedFieldNode[],
  mappedTargets: ReadonlySet<string>,
  getLeafSchema: LeafSchemaResolver,
): BatchPreviewState | null {
  const allTargetLeafPaths = collectLeafPaths(targetTree)
  const unmappedTargets = allTargetLeafPaths.filter(
    (path) => !mappedTargets.has(path),
  )
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
}
