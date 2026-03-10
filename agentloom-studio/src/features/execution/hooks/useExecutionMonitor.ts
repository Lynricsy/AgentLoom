import { useCallback } from 'react'
import { useExecutionActions, useExecutionStore } from '../stores/executionStore'
import {
  useExecutionSocket,
  type ConnectionStatus,
} from './useExecutionSocket'

export interface UseExecutionMonitorOptions {
  tenantId: string | undefined
  executionId: string | undefined
  authToken?: string
}

export interface UseExecutionMonitorResult {
  connectionStatus: ConnectionStatus
  lastEventId: number
  error: string | null
}

export function useExecutionMonitor(
  options: UseExecutionMonitorOptions,
): UseExecutionMonitorResult {
  const { tenantId, executionId, authToken } = options
  const {
    updateExecutionStatus,
    updateNodeStatus,
    appendNodeOutput,
    updateNodeRetry,
    applySnapshot,
    setNodeIntervention,
    clearNodeIntervention,
    updateToolCall,
    setToolPermissionRequired,
    resolveToolPermissionEvent,
    addAgentEvent,
  } = useExecutionActions()

  const onError = useCallback(
    (err: { message: string }) => {
      console.error(`[ExecutionMonitor] ${err.message}`)
    },
    [],
  )

  return useExecutionSocket({
    tenantId,
    executionId,
    authToken,
    onExecutionStatusChanged: updateExecutionStatus,
    onStepStatusChanged: updateNodeStatus,
    onOutputChunk: appendNodeOutput,
    onStepRetrying: updateNodeRetry,
    onSnapshot: applySnapshot,
    onInterventionRequired: setNodeIntervention,
    onInterventionResolved: clearNodeIntervention,
    onToolCallStatusChanged: updateToolCall,
    onToolPermissionRequired: setToolPermissionRequired,
    onToolPermissionResolved: resolveToolPermissionEvent,
    onStepAgentEvent: (event) => {
      const node = Object.values(useExecutionStore.getState().nodes).find(
        (currentNode) => currentNode.stepId === event.data.stepId,
      )
      if (!node) {
        return
      }

      addAgentEvent(node.nodeId, event.data.event)
    },
    onError,
  })
}
