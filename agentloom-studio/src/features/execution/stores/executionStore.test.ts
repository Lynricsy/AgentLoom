import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useExecutionStore, type NodeExecutionState } from './executionStore'
import { resolveIntervention, resolveToolPermission } from '../api/executionApi'
import type {
  AgentEvent,
  ExecutionEvent,
  ExecutionStateSnapshot,
  ExecutionStatusChangedPayload,
  InterventionRequiredPayload,
  InterventionResolvedPayload,
  OutputChunkPayload,
  StepRetryingPayload,
  StepStatusChangedPayload,
  ToolCallStatusPayload,
  ToolPermissionRequiredPayload,
  ToolPermissionResolvedPayload,
} from '../types'

vi.mock('../api/executionApi', () => ({
  resolveIntervention: vi.fn(),
  resolveToolPermission: vi.fn(),
}))

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

    it('restores output from step.result.content string', () => {
      const { actions } = useExecutionStore.getState()
      const snapshot: ExecutionStateSnapshot = {
        executionId: 'exec-snap-content',
        status: 'completed',
        completedSteps: 1,
        totalSteps: 1,
        snapshotAt: new Date().toISOString(),
        steps: [
          {
            stepId: 'step-content',
            nodeId: 'node-content',
            status: 'completed',
            startedAt: '2025-01-01T00:00:00Z',
            completedAt: '2025-01-01T00:01:00Z',
            result: { content: '服务端真实输出', stopReason: 'end_turn' },
          },
        ],
      }

      actions.applySnapshot(snapshot)

      expect(getNode('node-content').output).toBe('服务端真实输出')
    })

    it('restores structured output from step.result.content as formatted JSON', () => {
      const { actions } = useExecutionStore.getState()
      const content = { summary: '结构化输出', score: 0.98 }
      const snapshot: ExecutionStateSnapshot = {
        executionId: 'exec-snap-content-object',
        status: 'completed',
        completedSteps: 1,
        totalSteps: 1,
        snapshotAt: new Date().toISOString(),
        steps: [
          {
            stepId: 'step-content-object',
            nodeId: 'node-content-object',
            status: 'completed',
            startedAt: '2025-01-01T00:00:00Z',
            completedAt: '2025-01-01T00:01:00Z',
            result: { content },
          },
        ],
      }

      actions.applySnapshot(snapshot)

      expect(getNode('node-content-object').output).toBe(
        JSON.stringify(content, null, 2),
      )
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

    it('restores intervention data from waiting_intervention checkpointData', () => {
      const { actions } = useExecutionStore.getState()
      const snapshot: ExecutionStateSnapshot = {
        executionId: 'exec-intervention',
        status: 'paused',
        completedSteps: 0,
        totalSteps: 1,
        snapshotAt: new Date().toISOString(),
        steps: [
          {
            stepId: 'step-i1',
            nodeId: 'node-i1',
            status: 'waiting_intervention',
            startedAt: '2025-01-01T00:00:00Z',
            completedAt: null,
            checkpointData: {
              partialContent: '待人工确认的内容',
              interventionRequestedAt: '2025-01-01T00:00:30Z',
              interventionNodeName: '人工审核节点',
              decision: {
                suggestedContent: '建议版本',
                confidence: 0.9,
                rationale: '风险较高，需要确认',
              },
            },
          },
        ],
      }

      actions.applySnapshot(snapshot)

      expect(getNode('node-i1').intervention).toEqual({
        nodeName: '人工审核节点',
        requestedAt: '2025-01-01T00:00:30Z',
        partialContent: '待人工确认的内容',
        decision: {
          suggestedContent: '建议版本',
          confidence: 0.9,
          rationale: '风险较高，需要确认',
        },
      })
    })

    it('restores structured suggestedContent from waiting_intervention checkpointData', () => {
      const { actions } = useExecutionStore.getState()
      const suggestedContent = { summary: '结构化建议', channels: ['email'] }
      const snapshot: ExecutionStateSnapshot = {
        executionId: 'exec-intervention-structured',
        status: 'paused',
        completedSteps: 0,
        totalSteps: 1,
        snapshotAt: new Date().toISOString(),
        steps: [
          {
            stepId: 'step-i2',
            nodeId: 'node-i2',
            status: 'waiting_intervention',
            startedAt: '2025-01-01T00:00:00Z',
            completedAt: null,
            checkpointData: {
              interventionRequestedAt: '2025-01-01T00:00:30Z',
              interventionNodeName: '结构化审核节点',
              decision: {
                suggestedContent,
                confidence: 0.88,
              },
            },
          },
        ],
      }

      actions.applySnapshot(snapshot)

      expect(getNode('node-i2').intervention).toEqual({
        nodeName: '结构化审核节点',
        requestedAt: '2025-01-01T00:00:30Z',
        decision: {
          suggestedContent,
          confidence: 0.88,
        },
      })
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
            nodeName: '人工审核节点',
            decision: {
              suggestedContent: 'AI 建议内容',
              confidence: 0.92,
              rationale: '基于分析结果',
            },
            partialContent: '部分输出',
            requestedAt: '2025-01-01T00:00:30Z',
          },
        }),
      )

      const node = getNode('node-1')
      expect(node.intervention).toEqual({
        nodeName: '人工审核节点',
        requestedAt: '2025-01-01T00:00:30Z',
        decision: {
          suggestedContent: 'AI 建议内容',
          confidence: 0.92,
          rationale: '基于分析结果',
        },
        partialContent: '部分输出',
        submitting: false,
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
            nodeName: 'node-new',
            requestedAt: '2025-01-01T00:00:30Z',
          },
        }),
      )

      const node = getNode('node-new')
      expect(node.stepId).toBe('step-new')
      expect(node.intervention).toEqual({
        nodeName: 'node-new',
        requestedAt: '2025-01-01T00:00:30Z',
        submitting: false,
      })
    })
  })

  describe('submitIntervention', () => {
    it('calls API and manages submitting state', async () => {
      let resolveRequest: (() => void) | undefined
      const pendingRequest = new Promise<void>((resolve) => {
        resolveRequest = resolve
      })
      vi.mocked(resolveIntervention).mockReturnValueOnce(
        pendingRequest.then(() => ({
          data: {
            executionId: 'exec-1',
            stepId: 'step-1',
            status: 'intervention_accepted',
          },
        })),
      )

      const { actions } = useExecutionStore.getState()
      actions.updateNodeStatus(makeStepStatusEvent({ to: 'waiting_intervention' }))
      actions.setNodeIntervention(
        makeEvent<InterventionRequiredPayload>({
          event: 'execution.node.intervention-required',
          eventId: 2,
          data: {
            stepId: 'step-1',
            nodeId: 'node-1',
            nodeName: '人工审核节点',
            requestedAt: '2025-01-01T00:00:30Z',
          },
        }),
      )

      const request = actions.submitIntervention('exec-1', 'step-1', {
        action: 'approve',
      })

      expect(getNode('node-1').intervention?.submitting).toBe(true)

      resolveRequest?.()
      await request

      expect(resolveIntervention).toHaveBeenCalledWith('exec-1', 'step-1', {
        action: 'approve',
      })
      expect(getNode('node-1').intervention?.submitting).toBe(false)
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
            nodeName: '人工审核节点',
            decision: { suggestedContent: 'test' },
            requestedAt: '2025-01-01T00:00:30Z',
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
            resolvedBy: 'user-1',
            resolvedAt: '2025-01-01T00:01:00Z',
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

  describe('updateToolCall', () => {
    it('creates new tool call entry from ToolCallStatusPayload', () => {
      const { actions } = useExecutionStore.getState()
      actions.updateToolCall(
        makeEvent<ToolCallStatusPayload>({
          event: 'execution.node.agent-event',
          eventId: 1,
          data: {
            stepId: 'step-1',
            nodeId: 'node-1',
            toolCallId: 'tc-1',
            tool: 'search',
            status: 'pending',
            args: { q: 'test' },
          },
        }),
      )

      const node = getNode('node-1')
      expect(node.toolCalls['tc-1']).toEqual({
        id: 'tc-1',
        tool: 'search',
        status: 'pending',
        args: { q: 'test' },
        result: undefined,
        error: undefined,
        permissionRequest: undefined,
      })
    })

    it('updates existing tool call status preserving args/result/error', () => {
      const { actions } = useExecutionStore.getState()
      actions.updateToolCall(
        makeEvent<ToolCallStatusPayload>({
          event: 'execution.node.agent-event',
          eventId: 1,
          data: {
            stepId: 'step-1',
            nodeId: 'node-1',
            toolCallId: 'tc-1',
            tool: 'search',
            status: 'pending',
            args: { q: 'test' },
          },
        }),
      )

      actions.updateToolCall(
        makeEvent<ToolCallStatusPayload>({
          event: 'execution.node.agent-event',
          eventId: 2,
          data: {
            stepId: 'step-1',
            nodeId: 'node-1',
            toolCallId: 'tc-1',
            tool: 'search',
            status: 'in_progress',
          },
        }),
      )

      const tc = getNode('node-1').toolCalls['tc-1']
      expect(tc?.status).toBe('in_progress')
      expect(tc?.args).toEqual({ q: 'test' })
    })

    it('updates tool call with result on completed', () => {
      const { actions } = useExecutionStore.getState()
      actions.updateToolCall(
        makeEvent<ToolCallStatusPayload>({
          event: 'execution.node.agent-event',
          eventId: 1,
          data: {
            stepId: 'step-1',
            nodeId: 'node-1',
            toolCallId: 'tc-1',
            tool: 'search',
            status: 'pending',
            args: { q: 'test' },
          },
        }),
      )

      actions.updateToolCall(
        makeEvent<ToolCallStatusPayload>({
          event: 'execution.node.agent-event',
          eventId: 2,
          data: {
            stepId: 'step-1',
            nodeId: 'node-1',
            toolCallId: 'tc-1',
            tool: 'search',
            status: 'completed',
            result: { items: [1, 2, 3] },
          },
        }),
      )

      const tc = getNode('node-1').toolCalls['tc-1']
      expect(tc?.status).toBe('completed')
      expect(tc?.result).toEqual({ items: [1, 2, 3] })
      expect(tc?.args).toEqual({ q: 'test' })
    })

    it('updates tool call with error on failed', () => {
      const { actions } = useExecutionStore.getState()
      actions.updateToolCall(
        makeEvent<ToolCallStatusPayload>({
          event: 'execution.node.agent-event',
          eventId: 1,
          data: {
            stepId: 'step-1',
            nodeId: 'node-1',
            toolCallId: 'tc-1',
            tool: 'search',
            status: 'pending',
            args: { q: 'test' },
          },
        }),
      )

      actions.updateToolCall(
        makeEvent<ToolCallStatusPayload>({
          event: 'execution.node.agent-event',
          eventId: 2,
          data: {
            stepId: 'step-1',
            nodeId: 'node-1',
            toolCallId: 'tc-1',
            tool: 'search',
            status: 'failed',
            error: 'API timeout',
          },
        }),
      )

      const tc = getNode('node-1').toolCalls['tc-1']
      expect(tc?.status).toBe('failed')
      expect(tc?.error).toBe('API timeout')
      expect(tc?.args).toEqual({ q: 'test' })
    })
  })

  describe('setToolPermissionRequired', () => {
    it('creates tool call with awaiting_permission status from ToolPermissionRequiredPayload', () => {
      const { actions } = useExecutionStore.getState()
      actions.setToolPermissionRequired(
        makeEvent<ToolPermissionRequiredPayload>({
          event: 'execution.node.agent-event',
          eventId: 1,
          data: {
            stepId: 'step-1',
            nodeId: 'node-1',
            toolCallId: 'tc-1',
            tool: 'search',
            args: { q: 'test' },
            requestedAt: '2025-01-01T00:00:00Z',
          },
        }),
      )

      const tc = getNode('node-1').toolCalls['tc-1']
      expect(tc).toBeDefined()
      expect(tc?.status).toBe('awaiting_permission')
      expect(tc?.tool).toBe('search')
      expect(tc?.args).toEqual({ q: 'test' })
    })

    it('sets permissionRequest on tool call', () => {
      const { actions } = useExecutionStore.getState()
      const permissionRequest = {
        description: '需要访问文件系统',
        resourcePaths: ['/data/files'],
      }
      actions.setToolPermissionRequired(
        makeEvent<ToolPermissionRequiredPayload>({
          event: 'execution.node.agent-event',
          eventId: 1,
          data: {
            stepId: 'step-1',
            nodeId: 'node-1',
            toolCallId: 'tc-1',
            tool: 'file-read',
            args: { path: '/data/files' },
            permissionRequest,
            requestedAt: '2025-01-01T00:00:00Z',
          },
        }),
      )

      const tc = getNode('node-1').toolCalls['tc-1']
      expect(tc?.permissionRequest).toEqual(permissionRequest)
    })
  })

  describe('resolveToolPermissionEvent', () => {
    function setupAwaitingPermission() {
      const { actions } = useExecutionStore.getState()
      actions.setToolPermissionRequired(
        makeEvent<ToolPermissionRequiredPayload>({
          event: 'execution.node.agent-event',
          eventId: 1,
          data: {
            stepId: 'step-1',
            nodeId: 'node-1',
            toolCallId: 'tc-1',
            tool: 'search',
            args: { q: 'test' },
            requestedAt: '2025-01-01T00:00:00Z',
          },
        }),
      )
      return actions
    }

    it('approve: changes status from awaiting_permission to in_progress', () => {
      const actions = setupAwaitingPermission()
      expect(getNode('node-1').toolCalls['tc-1']?.status).toBe('awaiting_permission')

      actions.resolveToolPermissionEvent(
        makeEvent<ToolPermissionResolvedPayload>({
          event: 'execution.node.agent-event',
          eventId: 2,
          data: {
            stepId: 'step-1',
            nodeId: 'node-1',
            toolCallId: 'tc-1',
            action: 'approve',
          },
        }),
      )

      expect(getNode('node-1').toolCalls['tc-1']?.status).toBe('in_progress')
    })

    it('deny: changes status from awaiting_permission to denied', () => {
      const actions = setupAwaitingPermission()
      expect(getNode('node-1').toolCalls['tc-1']?.status).toBe('awaiting_permission')

      actions.resolveToolPermissionEvent(
        makeEvent<ToolPermissionResolvedPayload>({
          event: 'execution.node.agent-event',
          eventId: 2,
          data: {
            stepId: 'step-1',
            nodeId: 'node-1',
            toolCallId: 'tc-1',
            action: 'deny',
          },
        }),
      )

      expect(getNode('node-1').toolCalls['tc-1']?.status).toBe('denied')
    })
  })

  describe('addAgentEvent', () => {
    it('adds agent event to node agentEvents array', () => {
      const { actions } = useExecutionStore.getState()
      actions.updateNodeStatus(makeStepStatusEvent())

      const agentEvent: AgentEvent = {
        type: 'plan',
        title: '执行搜索任务',
        content: '执行搜索任务',
      }
      actions.addAgentEvent('node-1', agentEvent)

      const node = getNode('node-1')
      expect(node.agentEvents).toHaveLength(1)
      expect(node.agentEvents[0]).toEqual(agentEvent)
    })

    it('does not add event if node does not exist', () => {
      const { actions } = useExecutionStore.getState()
      const agentEvent: AgentEvent = {
        type: 'plan',
        title: '执行搜索任务',
        content: '执行搜索任务',
      }
      actions.addAgentEvent('non-existent', agentEvent)

      expect(useExecutionStore.getState().nodes['non-existent']).toBeUndefined()
    })
  })

  describe('clearToolCalls', () => {
    it('clears all tool calls for a node', () => {
      const { actions } = useExecutionStore.getState()
      actions.updateToolCall(
        makeEvent<ToolCallStatusPayload>({
          event: 'execution.node.agent-event',
          eventId: 1,
          data: {
            stepId: 'step-1',
            nodeId: 'node-1',
            toolCallId: 'tc-1',
            tool: 'search',
            status: 'completed',
            args: { q: 'test' },
          },
        }),
      )
      actions.updateToolCall(
        makeEvent<ToolCallStatusPayload>({
          event: 'execution.node.agent-event',
          eventId: 2,
          data: {
            stepId: 'step-1',
            nodeId: 'node-1',
            toolCallId: 'tc-2',
            tool: 'fetch',
            status: 'pending',
          },
        }),
      )

      expect(Object.keys(getNode('node-1').toolCalls)).toHaveLength(2)

      actions.clearToolCalls('node-1')

      expect(getNode('node-1').toolCalls).toEqual({})
    })

    it('does not affect other node data', () => {
      const { actions } = useExecutionStore.getState()
      actions.updateNodeStatus(makeStepStatusEvent())
      actions.appendNodeOutput(
        makeEvent({
          event: 'execution.node.output-chunk',
          eventId: 2,
          data: { stepId: 'step-1', chunk: 'output text', index: 0 },
        }),
      )
      actions.updateToolCall(
        makeEvent<ToolCallStatusPayload>({
          event: 'execution.node.agent-event',
          eventId: 3,
          data: {
            stepId: 'step-1',
            nodeId: 'node-1',
            toolCallId: 'tc-1',
            tool: 'search',
            status: 'completed',
          },
        }),
      )

      actions.clearToolCalls('node-1')

      const node = getNode('node-1')
      expect(node.toolCalls).toEqual({})
      expect(node.output).toBe('output text')
      expect(node.status).toBe('running')
    })
  })

  describe('submitToolPermission', () => {
    it('calls resolveToolPermission API', async () => {
      vi.mocked(resolveToolPermission).mockResolvedValueOnce(undefined)

      const { actions } = useExecutionStore.getState()
      await actions.submitToolPermission('exec-1', 'step-1', 'tc-1', 'approve')

      expect(resolveToolPermission).toHaveBeenCalledWith(
        'exec-1',
        'step-1',
        'tc-1',
        { action: 'approve' },
      )
    })

    it('calls resolveToolPermission API with deny action', async () => {
      vi.mocked(resolveToolPermission).mockResolvedValueOnce(undefined)

      const { actions } = useExecutionStore.getState()
      await actions.submitToolPermission('exec-1', 'step-1', 'tc-1', 'deny')

      expect(resolveToolPermission).toHaveBeenCalledWith(
        'exec-1',
        'step-1',
        'tc-1',
        { action: 'deny' },
      )
    })
  })

  describe('applySnapshot with toolCalls', () => {
    it('restores toolCalls from checkpoint data containing toolCalls array', () => {
      const { actions } = useExecutionStore.getState()
      const snapshot: ExecutionStateSnapshot = {
        executionId: 'exec-tc',
        status: 'paused',
        completedSteps: 0,
        totalSteps: 1,
        snapshotAt: new Date().toISOString(),
        steps: [
          {
            stepId: 'step-tc1',
            nodeId: 'node-tc1',
            status: 'running',
            startedAt: '2025-01-01T00:00:00Z',
            completedAt: null,
            checkpointData: {
              toolCalls: [
                {
                  id: 'tc-snap-1',
                  tool: 'search',
                  status: 'completed',
                  args: { q: 'snapshot test' },
                  result: { items: [1] },
                },
                {
                  id: 'tc-snap-2',
                  tool: 'fetch',
                  status: 'awaiting_permission',
                  args: { url: 'https://example.com' },
                  permissionRequest: {
                    description: '需要网络访问权限',
                    resourcePaths: ['https://example.com'],
                  },
                },
              ],
            },
          },
        ],
      }

      actions.applySnapshot(snapshot)

      const node = getNode('node-tc1')
      expect(Object.keys(node.toolCalls)).toHaveLength(2)

      expect(node.toolCalls['tc-snap-1']).toEqual({
        id: 'tc-snap-1',
        tool: 'search',
        status: 'completed',
        args: { q: 'snapshot test' },
        result: { items: [1] },
      })

      expect(node.toolCalls['tc-snap-2']).toEqual({
        id: 'tc-snap-2',
        tool: 'fetch',
        status: 'awaiting_permission',
        args: { url: 'https://example.com' },
        permissionRequest: {
          description: '需要网络访问权限',
          resourcePaths: ['https://example.com'],
        },
      })
    })
  })
})
