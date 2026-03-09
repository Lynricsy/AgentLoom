import { describe, it, expect, beforeEach } from 'vitest'
import { useExecutionStore, type NodeExecutionState } from './executionStore'
import type {
  ExecutionEvent,
  ExecutionStateSnapshot,
  ExecutionStatusChangedPayload,
  InterventionRequiredPayload,
  InterventionResolvedPayload,
  OutputChunkPayload,
  StepRetryingPayload,
  StepStatusChangedPayload,
} from '../types'

/** 从 store 获取节点状态，不存在则抛出（仅测试用） */
function getNode(nodeId: string): NodeExecutionState {
  const node = useExecutionStore.getState().nodes[nodeId]
  if (!node) throw new Error(`Node ${nodeId} not found in store`)
  return node
}

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

      const node = getNode('node-1')
      expect(node.stepId).toBe('step-1')
      expect(node.nodeId).toBe('node-1')
      expect(node.status).toBe('running')
      expect(node.isStreaming).toBe(true)
    })

    it('sets isStreaming=true when running', () => {
      const { actions } = useExecutionStore.getState()
      actions.updateNodeStatus(makeStepStatusEvent({ to: 'running' }))

      expect(getNode('node-1').isStreaming).toBe(true)
    })

    it('sets isStreaming=false on terminal states', () => {
      const { actions } = useExecutionStore.getState()
      for (const terminal of ['completed', 'failed', 'skipped', 'cancelled'] as const) {
        actions.updateNodeStatus(makeStepStatusEvent({ to: 'running' }))
        actions.updateNodeStatus(makeStepStatusEvent({ from: 'running', to: terminal }))
        expect(getNode('node-1').isStreaming).toBe(false)
      }
    })

    it('preserves isStreaming for non-terminal transitions', () => {
      const { actions } = useExecutionStore.getState()
      actions.updateNodeStatus(makeStepStatusEvent({ to: 'queued' }))
      expect(getNode('node-1').isStreaming).toBe(false)
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

      expect(getNode('node-1').output).toBe('hello world')
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
      expect(getNode('node-1').isStreaming).toBe(false)

      actions.appendNodeOutput(
        makeEvent<OutputChunkPayload>({
          event: 'execution.node.output-chunk',
          eventId: 2,
          data: { stepId: 'step-1', chunk: 'late chunk', index: 0 },
        }),
      )
      expect(getNode('node-1').isStreaming).toBe(true)
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

      const node = getNode('node-1')
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
      expect(getNode('node-a').status).toBe('completed')
      expect(getNode('node-a').isStreaming).toBe(false)
      expect(getNode('node-b').errorMessage).toBe('partial error')
    })

    it('restores output from step.result.output string', () => {
      const { actions } = useExecutionStore.getState()
      const snapshot: ExecutionStateSnapshot = {
        executionId: 'exec-snap',
        status: 'completed',
        completedSteps: 1,
        totalSteps: 1,
        snapshotAt: new Date().toISOString(),
        steps: [
          {
            stepId: 'step-r1',
            nodeId: 'node-r1',
            status: 'completed',
            startedAt: '2025-01-01T00:00:00Z',
            completedAt: '2025-01-01T00:01:00Z',
            result: { output: 'Agent response text', tokens: 100 },
          },
        ],
      }

      actions.applySnapshot(snapshot)

      expect(getNode('node-r1').output).toBe('Agent response text')
    })

    it('restores output as JSON.stringify when result has no output key', () => {
      const { actions } = useExecutionStore.getState()
      const resultObj = { answer: 42, model: 'gpt-4' }
      const snapshot: ExecutionStateSnapshot = {
        executionId: 'exec-snap2',
        status: 'completed',
        completedSteps: 1,
        totalSteps: 1,
        snapshotAt: new Date().toISOString(),
        steps: [
          {
            stepId: 'step-r2',
            nodeId: 'node-r2',
            status: 'completed',
            startedAt: '2025-01-01T00:00:00Z',
            completedAt: '2025-01-01T00:01:00Z',
            result: resultObj,
          },
        ],
      }

      actions.applySnapshot(snapshot)

      expect(getNode('node-r2').output).toBe(JSON.stringify(resultObj))
    })

    it('sets output to empty string when result is null', () => {
      const { actions } = useExecutionStore.getState()
      const snapshot: ExecutionStateSnapshot = {
        executionId: 'exec-snap3',
        status: 'running',
        completedSteps: 0,
        totalSteps: 1,
        snapshotAt: new Date().toISOString(),
        steps: [
          {
            stepId: 'step-r3',
            nodeId: 'node-r3',
            status: 'pending',
            startedAt: null,
            completedAt: null,
            result: null,
          },
        ],
      }

      actions.applySnapshot(snapshot)

      expect(getNode('node-r3').output).toBe('')
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
      expect(events[0]!.eventId).toBe(11)
      expect(events[49]!.eventId).toBe(60)
    })
  })

  describe('setNodeIntervention', () => {
    it('sets intervention data from event payload', () => {
      const { actions } = useExecutionStore.getState()
      actions.updateNodeStatus(makeStepStatusEvent({ to: 'waiting_intervention' }))

      actions.setNodeIntervention(
        makeEvent<InterventionRequiredPayload>({
          event: 'execution.node.intervention-required',
          eventId: 2,
          data: {
            stepId: 'step-1',
            nodeId: 'node-1',
            decision: {
              suggestedContent: 'AI 建议内容',
              confidence: 0.92,
              rationale: '基于分析结果',
            },
            partialContent: '部分输出',
          },
        }),
      )

      const node = getNode('node-1')
      expect(node.intervention).toEqual({
        decision: {
          suggestedContent: 'AI 建议内容',
          confidence: 0.92,
          rationale: '基于分析结果',
        },
        partialContent: '部分输出',
      })
    })

    it('creates node if not already present', () => {
      const { actions } = useExecutionStore.getState()
      actions.setNodeIntervention(
        makeEvent<InterventionRequiredPayload>({
          event: 'execution.node.intervention-required',
          eventId: 1,
          data: {
            stepId: 'step-new',
            nodeId: 'node-new',
          },
        }),
      )

      const node = getNode('node-new')
      expect(node.stepId).toBe('step-new')
      expect(node.intervention).toEqual({})
    })
  })

  describe('clearNodeIntervention', () => {
    it('clears intervention from node', () => {
      const { actions } = useExecutionStore.getState()
      actions.updateNodeStatus(makeStepStatusEvent({ to: 'waiting_intervention' }))
      actions.setNodeIntervention(
        makeEvent<InterventionRequiredPayload>({
          event: 'execution.node.intervention-required',
          eventId: 2,
          data: {
            stepId: 'step-1',
            nodeId: 'node-1',
            decision: { suggestedContent: 'test' },
          },
        }),
      )
      expect(getNode('node-1').intervention).toBeDefined()

      actions.clearNodeIntervention(
        makeEvent<InterventionResolvedPayload>({
          event: 'execution.node.intervention-resolved',
          eventId: 3,
          data: {
            stepId: 'step-1',
            nodeId: 'node-1',
            action: 'approve',
          },
        }),
      )

      expect(getNode('node-1').intervention).toBeUndefined()
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
