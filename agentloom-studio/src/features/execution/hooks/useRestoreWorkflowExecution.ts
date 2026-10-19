import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listExecutions } from '../api/executionApi'
import { executionKeys } from '../api/executionKeys'
import { useExecutionActions, useExecutionId } from '../stores/executionStore'
import { useExecutionSnapshotHydration } from './useLiveExecutionDetail'

/** 仍可能推进或等待人工处理的执行状态；终态执行不恢复到画布 */
const RESTORABLE_EXECUTION_STATUSES: Partial<Record<string, true>> = {
  pending: true,
  running: true,
  paused: true,
}

/**
 * 进入工作流画布时，若 executionStore 尚未跟踪任何执行（刷新页面、从执行页返回），
 * 从服务端找出该工作流最近一个未结束的执行并恢复：store 指向该执行后，REST 详情 hydrate
 * 节点状态与等待干预信息，画布上的 useExecutionMonitor 随 executionId 订阅实时事件。
 * 每次挂载只判定一次，且只依据挂载后重新拉取的列表，避免用缓存里已结束的执行。
 */
export function useRestoreWorkflowExecution(workflowId: string): void {
  const trackedExecutionId = useExecutionId()
  const { initExecution } = useExecutionActions()
  const [restoredExecutionId, setRestoredExecutionId] = useState<string>()
  const decidedRef = useRef(false)

  const { data, isFetchedAfterMount } = useQuery({
    queryKey: executionKeys.list({ workflowDefinitionId: workflowId }),
    queryFn: () => listExecutions(workflowId),
    staleTime: 0,
    enabled: !!workflowId && trackedExecutionId === null,
  })

  useEffect(() => {
    if (decidedRef.current) {
      return
    }
    if (trackedExecutionId !== null) {
      decidedRef.current = true
      return
    }
    if (!isFetchedAfterMount || !data) {
      return
    }

    decidedRef.current = true
    const activeExecution = data.data.find(
      (execution) => RESTORABLE_EXECUTION_STATUSES[execution.status] === true,
    )
    if (!activeExecution) {
      return
    }

    initExecution(activeExecution.id)
    setRestoredExecutionId(activeExecution.id)
  }, [data, initExecution, isFetchedAfterMount, trackedExecutionId])

  useExecutionSnapshotHydration(restoredExecutionId)
}
