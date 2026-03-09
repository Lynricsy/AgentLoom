import { create } from 'zustand'
import { devtools, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { useShallow } from 'zustand/react/shallow'

import type {
  ExecutionEvent,
  ExecutionStateSnapshot,
  ExecutionStatus,
  ExecutionStatusChangedPayload,
  OutputChunkPayload,
  StepRetryingPayload,
  StepStatus,
  StepStatusChangedPayload,
} from '../types'

export interface NodeExecutionState {
  stepId: string
  nodeId: string
  status: StepStatus
  output: string
  errorMessage?: string
  isStreaming: boolean
  retryAttempt?: number
  retryMaxAttempts?: number
  startedAt?: string | null
  completedAt?: string | null
}

export interface ExecutionStoreState {
  executionId: string | null
  status: ExecutionStatus | null
  completedSteps: number
  totalSteps: number
  /** nodeId → 节点运行状态 */
  nodes: Record<string, NodeExecutionState>
  /** 保留最新 50 条用于调试 */
  recentEvents: ExecutionEvent[]
}

export interface ExecutionStoreActions {
  actions: {
    updateExecutionStatus: (
      event: ExecutionEvent<ExecutionStatusChangedPayload>,
    ) => void
    updateNodeStatus: (
      event: ExecutionEvent<StepStatusChangedPayload>,
    ) => void
    appendNodeOutput: (event: ExecutionEvent<OutputChunkPayload>) => void
    updateNodeRetry: (event: ExecutionEvent<StepRetryingPayload>) => void
    applySnapshot: (snapshot: ExecutionStateSnapshot) => void
    initExecution: (executionId: string) => void
    reset: () => void
  }
}

const MAX_RECENT_EVENTS = 50

function createInitialState(): ExecutionStoreState {
  return {
    executionId: null,
    status: null,
    completedSteps: 0,
    totalSteps: 0,
    nodes: {},
    recentEvents: [],
  }
}

function pushEvent(state: ExecutionStoreState, event: ExecutionEvent): void {
  state.recentEvents.push(event)
  if (state.recentEvents.length > MAX_RECENT_EVENTS) {
    state.recentEvents = state.recentEvents.slice(-MAX_RECENT_EVENTS)
  }
}

function ensureNode(
  state: ExecutionStoreState,
  nodeId: string,
  stepId: string,
): NodeExecutionState {
  if (!state.nodes[nodeId]) {
    state.nodes[nodeId] = {
      stepId,
      nodeId,
      status: 'pending',
      output: '',
      isStreaming: false,
    }
  }
  return state.nodes[nodeId]
}

export const useExecutionStore = create<
  ExecutionStoreState & ExecutionStoreActions
>()(
  devtools(
    subscribeWithSelector(
      immer((set) => ({
        ...createInitialState(),

        actions: {
          updateExecutionStatus: (
            event: ExecutionEvent<ExecutionStatusChangedPayload>,
          ) => {
            set((state) => {
              state.status = event.data.status
              if (event.data.completedSteps != null) {
                state.completedSteps = event.data.completedSteps
              }
              if (event.data.totalSteps != null) {
                state.totalSteps = event.data.totalSteps
              }
              pushEvent(state, event)
            })
          },

          updateNodeStatus: (
            event: ExecutionEvent<StepStatusChangedPayload>,
          ) => {
            set((state) => {
              const node = ensureNode(
                state,
                event.data.nodeId,
                event.data.stepId,
              )
              node.status = event.data.to

              // 流式状态：running 时开启，终态时关闭
              if (event.data.to === 'running') {
                node.isStreaming = true
              } else if (
                event.data.to === 'completed' ||
                event.data.to === 'failed' ||
                event.data.to === 'skipped' ||
                event.data.to === 'cancelled'
              ) {
                node.isStreaming = false
              }

              pushEvent(state, event)
            })
          },

          appendNodeOutput: (event: ExecutionEvent<OutputChunkPayload>) => {
            set((state) => {
              // output chunk 只有 stepId，需要在 nodes 中查找对应 nodeId
              const existingNode = Object.values(state.nodes).find(
                (n) => n.stepId === event.data.stepId,
              )
              if (existingNode) {
                existingNode.output += event.data.chunk
                existingNode.isStreaming = true
              }
              pushEvent(state, event)
            })
          },

          updateNodeRetry: (event: ExecutionEvent<StepRetryingPayload>) => {
            set((state) => {
              const existingNode = Object.values(state.nodes).find(
                (n) => n.stepId === event.data.stepId,
              )
              if (existingNode) {
                existingNode.retryAttempt = event.data.attempt
                existingNode.retryMaxAttempts = event.data.maxAttempts
                if (event.data.errorMessage) {
                  existingNode.errorMessage = event.data.errorMessage
                }
              }
              pushEvent(state, event)
            })
          },

          applySnapshot: (snapshot: ExecutionStateSnapshot) => {
            set((state) => {
              state.executionId = snapshot.executionId
              state.status = snapshot.status
              state.completedSteps = snapshot.completedSteps
              state.totalSteps = snapshot.totalSteps

              state.nodes = {}
              for (const step of snapshot.steps) {
                state.nodes[step.nodeId] = {
                  stepId: step.stepId,
                  nodeId: step.nodeId,
                  status: step.status,
                  output: '',
                  isStreaming: false,
                  errorMessage: step.errorMessage,
                  startedAt: step.startedAt,
                  completedAt: step.completedAt,
                }
              }
            })
          },

          initExecution: (executionId: string) => {
            set((state) => {
              Object.assign(state, createInitialState())
              state.executionId = executionId
            })
          },

          reset: () => {
            set((state) => {
              Object.assign(state, createInitialState())
            })
          },
        },
      })),
    ),
    { name: 'ExecutionStore' },
  ),
)

export const useExecutionId = () =>
  useExecutionStore((s) => s.executionId)

export const useExecutionStatus = () =>
  useExecutionStore((s) => s.status)

export const useExecutionProgress = () =>
  useExecutionStore(
    useShallow((s) => ({
      completedSteps: s.completedSteps,
      totalSteps: s.totalSteps,
    })),
  )

export const useNodeExecutionState = (nodeId: string) =>
  useExecutionStore((s) => s.nodes[nodeId] ?? null)

export const useAllNodeStates = () =>
  useExecutionStore(useShallow((s) => s.nodes))

export const useRecentEvents = () =>
  useExecutionStore((s) => s.recentEvents)

export const useExecutionActions = () =>
  useExecutionStore((s) => s.actions)

export const useIsExecutionActive = () =>
  useExecutionStore(
    (s) => s.status === 'running' || s.status === 'paused',
  )
