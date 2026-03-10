import { useCallback } from 'react'
import { useExecutionActions } from '../stores/executionStore'
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
    onError,
  })
}
