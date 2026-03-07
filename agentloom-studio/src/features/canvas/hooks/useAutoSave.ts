import { useEffect, useRef } from 'react'
import { useUpdateWorkflow } from '@/features/workflow'
import type { UpdateWorkflowPayload } from '@/features/workflow'
import { useCanvasStore } from '../stores/canvasStore'

const AUTOSAVE_DEBOUNCE_MS = 500

export function useAutoSave(workflowId: string) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { mutate: updateWorkflow } = useUpdateWorkflow(workflowId)
  const { markSaved, setIsSaving } = useCanvasStore((state) => state.actions)

  useEffect(() => {
    if (!workflowId) return

    const unsubscribe = useCanvasStore.subscribe(
      (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        viewport: state.viewport,
        isDirty: state.isDirty,
        version: state.version,
      }),
      (current, prev) => {
        if (!current.isDirty) return

        if (
          current.nodes === prev.nodes &&
          current.edges === prev.edges &&
          current.viewport === prev.viewport &&
          current.isDirty === prev.isDirty &&
          current.version === prev.version
        ) {
          return
        }

        if (timerRef.current) {
          clearTimeout(timerRef.current)
        }

        timerRef.current = setTimeout(() => {
          const snapshot = useCanvasStore.getState()
          setIsSaving(true)

          const payload: UpdateWorkflowPayload = {
            nodes: snapshot.nodes,
            edges: snapshot.edges,
            viewport: snapshot.viewport,
            version: snapshot.version,
          }

          updateWorkflow(payload, {
            onSuccess: (data) => {
              markSaved(data.version)
            },
            onError: () => {
              setIsSaving(false)
              console.error('[AutoSave] 保存失败，本地草稿已保留')
            },
          })
        }, AUTOSAVE_DEBOUNCE_MS)
      },
      { fireImmediately: false }
    )

    return () => {
      unsubscribe()
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [workflowId, updateWorkflow, markSaved, setIsSaving])
}
