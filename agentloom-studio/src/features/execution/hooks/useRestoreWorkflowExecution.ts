import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listExecutions } from '../api/executionApi'
import { executionKeys } from '../api/executionKeys'
import { useExecutionActions, useExecutionStore } from '../stores/executionStore'
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
 * 是否已在跟踪执行在判定时读 store 当前值：从执行页返回时，画布首次渲染仍能看到执行页
 * 卸载前的 executionId，其卸载 reset 之后才轮到这里判定。
 */
export function useRestoreWorkflowExecution(workflowId: string): void {
  const { initExecution } = useExecutionActions()
  const [restoredExecutionId, setRestoredExecutionId] = useState<string>()
  const decidedRef = useRef(false)

  const { data, isFetchedAfterMount } = useQuery({
    queryKey: executionKeys.list({ workflowDefinitionId: workflowId }),
    queryFn: () => listExecutions(workflowId),
    staleTime: 0,
    enabled: !!workflowId,
  })

  useEffect(() => {
    if (decidedRef.current || !isFetchedAfterMount || !data) {
      return
    }

    decidedRef.current = true
    if (useExecutionStore.getState().executionId !== null) {
      return
    }
    const activeExecution = data.data.find(
      (execution) => RESTORABLE_EXECUTION_STATUSES[execution.status] === true,
    )
    if (!activeExecution) {
      return
    }

    initExecution(activeExecution.id)
    setRestoredExecutionId(activeExecution.id)
  }, [data, initExecution, isFetchedAfterMount])

  useExecutionSnapshotHydration(restoredExecutionId)
}
