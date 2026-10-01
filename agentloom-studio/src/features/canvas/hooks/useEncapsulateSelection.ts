import { useCallback, useState } from 'react'
import { useCreateBlock } from '@/features/block-library'
import { useToast } from '@/shared/ui/toast'
import type { BlockCreateDialogProps } from '../components/BlockCreateDialog'
import {
  analyzeEncapsulation,
  buildBlockDefinition,
  replaceNodesWithBlock,
  resolveEncapsulationSelection,
  type EncapsulationAnalysis,
} from '../lib/encapsulation'
import { useCanvasActions, useCanvasStore } from '../stores/canvasStore'

type ConfirmData = Parameters<BlockCreateDialogProps['onConfirm']>[0]

/**
 * 「封装为可复用块」流程：
 * 1. 分析当前选区（容器连同子节点），派生块的输入/输出端口；
 * 2. 打开 BlockCreateDialog 填写名称、分类、端口名称；
 * 3. 确认后 POST /reusable-blocks 保存到 My Blocks，成功后在画布上用块节点替换选区。
 */
export function useEncapsulateSelection() {
  const { applyEncapsulation } = useCanvasActions()
  const createBlock = useCreateBlock()
  const { notify } = useToast()
  const [analysis, setAnalysis] = useState<EncapsulationAnalysis | null>(null)

  const openEncapsulation = useCallback(() => {
    const { nodes, edges, selectedNodeIds, selectedNodeId } = useCanvasStore.getState()
    const selection =
      selectedNodeIds.size > 0
        ? selectedNodeIds
        : new Set(selectedNodeId ? [selectedNodeId] : [])
    const resolved = resolveEncapsulationSelection(selection, nodes)

    if ('error' in resolved) {
      notify({ variant: 'error', description: resolved.error })
      return
    }

    setAnalysis(analyzeEncapsulation(resolved.nodeIds, nodes, edges))
  }, [notify])

  const onOpenChange = useCallback((open: boolean) => {
    if (!open) setAnalysis(null)
  }, [])

  const onConfirm = useCallback(
    (data: ConfirmData) => {
      if (!analysis) return
      const confirmed: EncapsulationAnalysis = {
        ...analysis,
        inputPorts: data.inputPorts,
        outputPorts: data.outputPorts,
      }
      const definition = buildBlockDefinition(confirmed)

      createBlock.mutate(
        {
          name: data.name,
          ...(data.description ? { description: data.description } : {}),
          category: data.category,
          tags: data.tags,
          definition,
          metadata: { nodeCount: definition.nodes.length, version: 1 },
        },
        {
          onSuccess: (block) => {
            const { nodes, edges } = useCanvasStore.getState()
            applyEncapsulation(
              replaceNodesWithBlock(confirmed, block.id, block.name, nodes, edges),
            )
            notify({
              variant: 'success',
              description: `已封装为可复用块「${block.name}」，并保存到 My Blocks。`,
            })
          },
          onError: (error) => {
            notify({
              variant: 'error',
              description:
                error instanceof Error ? `封装失败：${error.message}` : '封装失败，请稍后重试。',
            })
          },
        },
      )
    },
    [analysis, applyEncapsulation, createBlock, notify],
  )

  return { analysis, openEncapsulation, onOpenChange, onConfirm }
}
