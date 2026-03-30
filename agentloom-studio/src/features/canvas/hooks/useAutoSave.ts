import { useEffect, useRef } from 'react'
import { useUpdateWorkflow } from '@/features/workflow'
import type { UpdateWorkflowPayload, WorkflowStatus } from '@/features/workflow'
import { useToast } from '@/shared/ui/toast'
import { useCanvasStore } from '../stores/canvasStore'

export const AUTOSAVE_DEBOUNCE_MS = 2000
const AUTOSAVE_ERROR_MESSAGE = '自动保存失败，修改已保留在本地'

export function useAutoSave(workflowId: string, workflowStatus?: WorkflowStatus) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const changeRevisionRef = useRef(0)
  const { mutate: updateWorkflow } = useUpdateWorkflow(workflowId)
  const { markSaved, setIsSaving, advanceVersion } = useCanvasStore((state) => state.actions)
  const { notify } = useToast()
  const isReadOnly = workflowStatus === 'archived'

  useEffect(() => {
    if (!workflowId || isReadOnly) {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }

      return
    }

    const unsubscribe = useCanvasStore.subscribe(
      (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        viewport: state.viewport,
        isDirty: state.isDirty,
      }),
      (current, prev) => {
        if (!current.isDirty) return

        if (
          current.nodes === prev.nodes &&
          current.edges === prev.edges &&
          current.viewport === prev.viewport &&
          current.isDirty === prev.isDirty
        ) {
          return
        }

        changeRevisionRef.current += 1
        const scheduledRevision = changeRevisionRef.current

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
              if (scheduledRevision !== changeRevisionRef.current) {
                // 保存成功但期间有新编辑，仍需同步 version 以避免后续 OCC 409 冲突
                advanceVersion(data.version)
                return
              }

              markSaved(data.version)
            },
            onError: () => {
              if (scheduledRevision !== changeRevisionRef.current) {
                return
              }

              setIsSaving(false)
              notify({
                title: '自动保存失败',
                description: AUTOSAVE_ERROR_MESSAGE,
                variant: 'error',
              })
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
    }, [workflowId, updateWorkflow, markSaved, advanceVersion, notify, setIsSaving, isReadOnly])
}
