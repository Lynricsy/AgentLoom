import { describe, it, expect, beforeEach } from 'vitest'
import { useExecutionStore } from './executionStore'
import type {
  ExecutionEvent,
  ExecutionStateSnapshot,
  ExecutionStatusChangedPayload,
  OutputChunkPayload,
  StepRetryingPayload,
  StepStatusChangedPayload,
} from '../types'

function makeEvent<T>(
  overrides: Partial<ExecutionEvent<T>> & { data: T },
): ExecutionEvent<T> {
  return {
    eventId: 1,
    event: 'execution.status.changed',
    timestamp: new Date().toISOString(),
    executionId: 'exec-1',
    tenantId: 'tenant-1',
    ...overrides,
  }
}

function makeStepStatusEvent(
  overrides: Partial<StepStatusChangedPayload> = {},
): ExecutionEvent<StepStatusChangedPayload> {
  return makeEvent({
    event: 'execution.node.status-changed',
    data: {
      stepId: 'step-1',
      nodeId: 'node-1',
      from: 'pending',
      to: 'running',
      ...overrides,
    },
  })
}

describe('executionStore', () => {
  beforeEach(() => {
    useExecutionStore.getState().actions.reset()
  })

  describe('initExecution', () => {
    it('sets executionId and resets other state', () => {
      const { actions } = useExecutionStore.getState()
      actions.initExecution('exec-42')

      const state = useExecutionStore.getState()
      expect(state.executionId).toBe('exec-42')
      expect(state.status).toBeNull()
      expect(state.nodes).toEqual({})
      expect(state.recentEvents).toEqual([])
    })
  })

  describe('updateExecutionStatus', () => {
    it('updates status, completedSteps, totalSteps', () => {
      const { actions } = useExecutionStore.getState()
      actions.updateExecutionStatus(
        makeEvent<ExecutionStatusChangedPayload>({
          eventId: 1,
          data: {
            executionId: 'exec-1',
            status: 'running',
            completedSteps: 2,
            totalSteps: 10,
          },
        }),
      )

      const state = useExecutionStore.getState()
      expect(state.status).toBe('running')
      expect(state.completedSteps).toBe(2)
      expect(state.totalSteps).toBe(10)
    })

    it('preserves completedSteps when not provided', () => {
      const { actions } = useExecutionStore.getState()
      actions.updateExecutionStatus(
        makeEvent<ExecutionStatusChangedPayload>({
          eventId: 1,
          data: { executionId: 'exec-1', status: 'running', completedSteps: 5, totalSteps: 10 },
        }),
      )
      actions.updateExecutionStatus(
        makeEvent<ExecutionStatusChangedPayload>({
          eventId: 2,
          data: { executionId: 'exec-1', status: 'completed' },
        }),
      )

      const state = useExecutionStore.getState()
      expect(state.status).toBe('completed')
      expect(state.completedSteps).toBe(5)
    })
  })

  describe('updateNodeStatus', () => {
    it('creates node on first status update', () => {
      const { actions } = useExecutionStore.getState()
      actions.updateNodeStatus(makeStepStatusEvent())

      const node = useExecutionStore.getState().nodes['node-1']
      expect(node).toBeDefined()
      expect(node.stepId).toBe('step-1')
      expect(node.nodeId).toBe('node-1')
      expect(node.status).toBe('running')
      expect(node.isStreaming).toBe(true)
    })

    it('sets isStreaming=true when running', () => {
      const { actions } = useExecutionStore.getState()
      actions.updateNodeStatus(makeStepStatusEvent({ to: 'running' }))

      expect(useExecutionStore.getState().nodes['node-1'].isStreaming).toBe(true)
    })

    it('sets isStreaming=false on terminal states', () => {
      const { actions } = useExecutionStore.getState()
      for (const terminal of ['completed', 'failed', 'skipped', 'cancelled'] as const) {
        actions.updateNodeStatus(makeStepStatusEvent({ to: 'running' }))
        actions.updateNodeStatus(makeStepStatusEvent({ from: 'running', to: terminal }))
        expect(useExecutionStore.getState().nodes['node-1'].isStreaming).toBe(false)
      }
    })

    it('preserves isStreaming for non-terminal transitions', () => {
      const { actions } = useExecutionStore.getState()
      actions.updateNodeStatus(makeStepStatusEvent({ to: 'queued' }))
      expect(useExecutionStore.getState().nodes['node-1'].isStreaming).toBe(false)
    })
  })

  describe('appendNodeOutput', () => {
    it('appends chunk to existing node', () => {
      const { actions } = useExecutionStore.getState()
      actions.updateNodeStatus(makeStepStatusEvent())

      actions.appendNodeOutput(
        makeEvent<OutputChunkPayload>({
          event: 'execution.node.output-chunk',
          eventId: 2,
          data: { stepId: 'step-1', chunk: 'hello ', index: 0 },
        }),
      )
      actions.appendNodeOutput(
        makeEvent<OutputChunkPayload>({
          event: 'execution.node.output-chunk',
          eventId: 3,
          data: { stepId: 'step-1', chunk: 'world', index: 1 },
        }),
      )

      expect(useExecutionStore.getState().nodes['node-1'].output).toBe('hello world')
    })

    it('ignores chunk for unknown stepId', () => {
      const { actions } = useExecutionStore.getState()
      actions.appendNodeOutput(
        makeEvent<OutputChunkPayload>({
          event: 'execution.node.output-chunk',
          data: { stepId: 'unknown', chunk: 'data', index: 0 },
        }),
      )

      expect(Object.keys(useExecutionStore.getState().nodes)).toHaveLength(0)
    })

    it('sets isStreaming=true on chunk append', () => {
      const { actions } = useExecutionStore.getState()
      actions.updateNodeStatus(
        makeStepStatusEvent({ to: 'completed' }),
      )
      expect(useExecutionStore.getState().nodes['node-1'].isStreaming).toBe(false)

      actions.appendNodeOutput(
        makeEvent<OutputChunkPayload>({
          event: 'execution.node.output-chunk',
          eventId: 2,
          data: { stepId: 'step-1', chunk: 'late chunk', index: 0 },
        }),
      )
      expect(useExecutionStore.getState().nodes['node-1'].isStreaming).toBe(true)
    })
  })

  describe('updateNodeRetry', () => {
    it('updates retry info on existing node', () => {
      const { actions } = useExecutionStore.getState()
      actions.updateNodeStatus(makeStepStatusEvent())

      actions.updateNodeRetry(
        makeEvent<StepRetryingPayload>({
          event: 'execution.node.retrying',
          eventId: 2,
          data: {
            stepId: 'step-1',
            attempt: 2,
            maxAttempts: 3,
            errorMessage: 'timeout',
          },
        }),
      )

      const node = useExecutionStore.getState().nodes['node-1']
      expect(node.retryAttempt).toBe(2)
      expect(node.retryMaxAttempts).toBe(3)
      expect(node.errorMessage).toBe('timeout')
    })

    it('ignores retry for unknown stepId', () => {
      const { actions } = useExecutionStore.getState()
      actions.updateNodeRetry(
        makeEvent<StepRetryingPayload>({
          event: 'execution.node.retrying',
          data: { stepId: 'unknown', attempt: 1, maxAttempts: 3 },
        }),
      )

      expect(Object.keys(useExecutionStore.getState().nodes)).toHaveLength(0)
    })
  })

  describe('applySnapshot', () => {
    it('replaces entire state from snapshot', () => {
      const { actions } = useExecutionStore.getState()
      actions.updateNodeStatus(makeStepStatusEvent())

      const snapshot: ExecutionStateSnapshot = {
        executionId: 'exec-2',
        status: 'paused',
        completedSteps: 3,
        totalSteps: 5,
        snapshotAt: new Date().toISOString(),
        steps: [
          {
            stepId: 'step-a',
            nodeId: 'node-a',
            status: 'completed',
            startedAt: '2025-01-01T00:00:00Z',
            completedAt: '2025-01-01T00:01:00Z',
          },
          {
            stepId: 'step-b',
            nodeId: 'node-b',
            status: 'running',
            startedAt: '2025-01-01T00:01:00Z',
            completedAt: null,
            errorMessage: 'partial error',
          },
        ],
      }

      actions.applySnapshot(snapshot)

      const state = useExecutionStore.getState()
      expect(state.executionId).toBe('exec-2')
      expect(state.status).toBe('paused')
      expect(state.completedSteps).toBe(3)
      expect(state.totalSteps).toBe(5)
      expect(Object.keys(state.nodes)).toHaveLength(2)
      expect(state.nodes['node-a'].status).toBe('completed')
      expect(state.nodes['node-a'].isStreaming).toBe(false)
      expect(state.nodes['node-b'].errorMessage).toBe('partial error')
    })

    it('clears previous nodes', () => {
      const { actions } = useExecutionStore.getState()
      actions.updateNodeStatus(makeStepStatusEvent())
      expect(useExecutionStore.getState().nodes['node-1']).toBeDefined()

      actions.applySnapshot({
        executionId: 'exec-3',
        status: 'running',
        completedSteps: 0,
        totalSteps: 1,
        snapshotAt: new Date().toISOString(),
        steps: [],
      })

      expect(useExecutionStore.getState().nodes['node-1']).toBeUndefined()
    })
  })

  describe('recentEvents', () => {
    it('tracks events across actions', () => {
      const { actions } = useExecutionStore.getState()
      actions.updateExecutionStatus(
        makeEvent<ExecutionStatusChangedPayload>({
          eventId: 1,
          data: { executionId: 'exec-1', status: 'running' },
        }),
      )
      actions.updateNodeStatus(makeStepStatusEvent({ to: 'running' }))

      expect(useExecutionStore.getState().recentEvents).toHaveLength(2)
    })

    it('caps at 50 events', () => {
      const { actions } = useExecutionStore.getState()
      for (let i = 0; i < 60; i++) {
        actions.updateExecutionStatus(
          makeEvent<ExecutionStatusChangedPayload>({
            eventId: i + 1,
            data: { executionId: 'exec-1', status: 'running' },
          }),
        )
      }

      const events = useExecutionStore.getState().recentEvents
      expect(events).toHaveLength(50)
      expect(events[0].eventId).toBe(11)
      expect(events[49].eventId).toBe(60)
    })
  })

  describe('reset', () => {
    it('clears all state', () => {
      const { actions } = useExecutionStore.getState()
      actions.initExecution('exec-1')
      actions.updateNodeStatus(makeStepStatusEvent())
      actions.reset()

      const state = useExecutionStore.getState()
      expect(state.executionId).toBeNull()
      expect(state.status).toBeNull()
      expect(state.nodes).toEqual({})
      expect(state.recentEvents).toEqual([])
    })
  })
})
