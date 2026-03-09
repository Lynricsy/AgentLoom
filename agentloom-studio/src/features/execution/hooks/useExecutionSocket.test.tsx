import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ExecutionEvent,
  ExecutionStateSnapshot,
  ExecutionStatusChangedPayload,
  OutputChunkPayload,
  StepAgentEventPayload,
  StepRetryingPayload,
  StepStatusChangedPayload,
} from '../types'
import { ExecutionEventName } from '../types'
import {
  resolveExecutionSocketUrl,
  useExecutionSocket,
} from './useExecutionSocket'

const { ioMock } = vi.hoisted(() => ({
  ioMock: vi.fn(),
}))

vi.mock('socket.io-client', () => ({
  io: ioMock,
}))

function createMockSocket() {
  const handlers: Record<string, (...args: unknown[]) => void> = {}
  const socket = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handler
      return socket
    }),
    off: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    removeAllListeners: vi.fn(),
  }

  return { socket, handlers }
}

describe('resolveExecutionSocketUrl', () => {
  it('resolves absolute API base URLs to the execution namespace', () => {
    expect(
      resolveExecutionSocketUrl(
        'https://api.example.com/api/v1',
        'https://studio.example.com',
      ),
    ).toBe('https://api.example.com/execution')
  })

  it('resolves relative API base URLs against the current origin', () => {
    expect(
      resolveExecutionSocketUrl('/api/v1', 'https://studio.example.com'),
    ).toBe('https://studio.example.com/execution')
  })

  it('handles /api suffix without version', () => {
    expect(
      resolveExecutionSocketUrl('/api', 'https://example.com'),
    ).toBe('https://example.com/execution')
  })
})

describe('useExecutionSocket', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not connect when tenantId or executionId is missing', () => {
    renderHook(() =>
      useExecutionSocket({
        tenantId: undefined,
        executionId: undefined,
      }),
    )

    expect(ioMock).not.toHaveBeenCalled()
  })

  it('returns disconnected status when params are missing', () => {
    const { result } = renderHook(() =>
      useExecutionSocket({
        tenantId: undefined,
        executionId: undefined,
      }),
    )

    expect(result.current.connectionStatus).toBe('disconnected')
    expect(result.current.lastEventId).toBe(0)
    expect(result.current.error).toBeNull()
  })

  it('connects to the execution namespace with auth token', () => {
    const { socket } = createMockSocket()
    ioMock.mockReturnValue(socket)

    renderHook(() =>
      useExecutionSocket({
        tenantId: 'tenant-1',
        executionId: 'exec-1',
        authToken: 'jwt-token-123',
      }),
    )

    expect(ioMock).toHaveBeenCalledWith(
      resolveExecutionSocketUrl('/api/v1'),
      {
        auth: { token: 'jwt-token-123' },
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 5000,
        reconnectionDelayMax: 30000,
      },
    )
  })

  it('connects without auth when no token is provided', () => {
    const { socket } = createMockSocket()
    ioMock.mockReturnValue(socket)

    renderHook(() =>
      useExecutionSocket({
        tenantId: 'tenant-1',
        executionId: 'exec-1',
      }),
    )

    expect(ioMock).toHaveBeenCalledWith(
      resolveExecutionSocketUrl('/api/v1'),
      {
        auth: undefined,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 5000,
        reconnectionDelayMax: 30000,
      },
    )
  })

  it('subscribes to room on connect and sets connected status', () => {
    const { socket, handlers } = createMockSocket()
    ioMock.mockReturnValue(socket)

    const { result } = renderHook(() =>
      useExecutionSocket({
        tenantId: 'tenant-1',
        executionId: 'exec-1',
      }),
    )

    act(() => {
      handlers.connect?.()
    })

    expect(result.current.connectionStatus).toBe('connected')
    expect(socket.emit).toHaveBeenCalledWith(
      'execution:subscribe',
      {
        tenantId: 'tenant-1',
        executionId: 'exec-1',
        lastEventId: undefined,
      },
      expect.any(Function),
    )
  })

  it('calls onError when subscribe ACK has error status', () => {
    const { socket, handlers } = createMockSocket()
    ioMock.mockReturnValue(socket)
    const onError = vi.fn()

    renderHook(() =>
      useExecutionSocket({
        tenantId: 'tenant-1',
        executionId: 'exec-1',
        onError,
      }),
    )

    act(() => {
      handlers.connect?.()
    })

    const subscribeCall = socket.emit.mock.calls.find(
      (call: unknown[]) => call[0] === 'execution:subscribe',
    )
    const ackCallback = subscribeCall?.[2] as (ack: unknown) => void

    act(() => {
      ackCallback({ status: 'error', error: 'FORBIDDEN', currentState: null })
    })

    expect(onError).toHaveBeenCalledWith({
      message: 'FORBIDDEN',
      code: 'FORBIDDEN',
    })
  })

  it('uses default message when subscribe ACK error has no error text', () => {
    const { socket, handlers } = createMockSocket()
    ioMock.mockReturnValue(socket)
    const onError = vi.fn()

    renderHook(() =>
      useExecutionSocket({
        tenantId: 'tenant-1',
        executionId: 'exec-1',
        onError,
      }),
    )

    act(() => {
      handlers.connect?.()
    })

    const subscribeCall = socket.emit.mock.calls.find(
      (call: unknown[]) => call[0] === 'execution:subscribe',
    )
    const ackCallback = subscribeCall?.[2] as (ack: unknown) => void

    act(() => {
      ackCallback({ status: 'error', currentState: null })
    })

    expect(onError).toHaveBeenCalledWith({
      message: 'Subscription failed',
      code: undefined,
    })
  })

  it('calls onSnapshot and tracks lastEventId from subscribe ACK', () => {
    const { socket, handlers } = createMockSocket()
    ioMock.mockReturnValue(socket)
    const onSnapshot = vi.fn()

    const { result } = renderHook(() =>
      useExecutionSocket({
        tenantId: 'tenant-1',
        executionId: 'exec-1',
        onSnapshot,
      }),
    )

    act(() => {
      handlers.connect?.()
    })

    const subscribeCall = socket.emit.mock.calls.find(
      (call: unknown[]) => call[0] === 'execution:subscribe',
    )
    const ackCallback = subscribeCall?.[2] as (ack: unknown) => void

    const snapshot: ExecutionStateSnapshot = {
      executionId: 'exec-1',
      status: 'running',
      completedSteps: 1,
      totalSteps: 3,
      steps: [],
      snapshotAt: '2025-01-01T00:00:00Z',
      lastEventId: 15,
    }

    act(() => {
      ackCallback({ status: 'subscribed', currentState: snapshot })
    })

    expect(onSnapshot).toHaveBeenCalledWith(snapshot)
    expect(result.current.lastEventId).toBe(15)
  })

  it('handles execution status changed events', () => {
    const { socket, handlers } = createMockSocket()
    ioMock.mockReturnValue(socket)
    const onExecutionStatusChanged = vi.fn()

    renderHook(() =>
      useExecutionSocket({
        tenantId: 'tenant-1',
        executionId: 'exec-1',
        onExecutionStatusChanged,
      }),
    )

    const event: ExecutionEvent<ExecutionStatusChangedPayload> = {
      eventId: 1,
      event: ExecutionEventName.EXECUTION_STATUS_CHANGED,
      timestamp: '2025-01-01T00:00:00Z',
      executionId: 'exec-1',
      tenantId: 'tenant-1',
      data: { executionId: 'exec-1', status: 'running' },
    }

    act(() => {
      handlers[ExecutionEventName.EXECUTION_STATUS_CHANGED]?.(event)
    })

    expect(onExecutionStatusChanged).toHaveBeenCalledWith(event)
  })

  it('handles step status changed events', () => {
    const { socket, handlers } = createMockSocket()
    ioMock.mockReturnValue(socket)
    const onStepStatusChanged = vi.fn()

    renderHook(() =>
      useExecutionSocket({
        tenantId: 'tenant-1',
        executionId: 'exec-1',
        onStepStatusChanged,
      }),
    )

    const event: ExecutionEvent<StepStatusChangedPayload> = {
      eventId: 2,
      event: ExecutionEventName.STEP_STATUS_CHANGED,
      timestamp: '2025-01-01T00:00:00Z',
      executionId: 'exec-1',
      tenantId: 'tenant-1',
      data: { stepId: 'step-1', nodeId: 'node-1', from: 'pending', to: 'running' },
    }

    act(() => {
      handlers[ExecutionEventName.STEP_STATUS_CHANGED]?.(event)
    })

    expect(onStepStatusChanged).toHaveBeenCalledWith(event)
  })

  it('handles step agent events', () => {
    const { socket, handlers } = createMockSocket()
    ioMock.mockReturnValue(socket)
    const onStepAgentEvent = vi.fn()

    renderHook(() =>
      useExecutionSocket({
        tenantId: 'tenant-1',
        executionId: 'exec-1',
        onStepAgentEvent,
      }),
    )

    const event: ExecutionEvent<StepAgentEventPayload> = {
      eventId: 3,
      event: ExecutionEventName.STEP_AGENT_EVENT,
      timestamp: '2025-01-01T00:00:00Z',
      executionId: 'exec-1',
      tenantId: 'tenant-1',
      data: { stepId: 'step-1', event: { type: 'plan', content: 'test' } },
    }

    act(() => {
      handlers[ExecutionEventName.STEP_AGENT_EVENT]?.(event)
    })

    expect(onStepAgentEvent).toHaveBeenCalledWith(event)
  })

  it('handles step retrying events', () => {
    const { socket, handlers } = createMockSocket()
    ioMock.mockReturnValue(socket)
    const onStepRetrying = vi.fn()

    renderHook(() =>
      useExecutionSocket({
        tenantId: 'tenant-1',
        executionId: 'exec-1',
        onStepRetrying,
      }),
    )

    const event: ExecutionEvent<StepRetryingPayload> = {
      eventId: 4,
      event: ExecutionEventName.STEP_RETRYING,
      timestamp: '2025-01-01T00:00:00Z',
      executionId: 'exec-1',
      tenantId: 'tenant-1',
      data: { stepId: 'step-1', attempt: 2, maxAttempts: 3 },
    }

    act(() => {
      handlers[ExecutionEventName.STEP_RETRYING]?.(event)
    })

    expect(onStepRetrying).toHaveBeenCalledWith(event)
  })

  it('handles output chunk events', () => {
    const { socket, handlers } = createMockSocket()
    ioMock.mockReturnValue(socket)
    const onOutputChunk = vi.fn()

    renderHook(() =>
      useExecutionSocket({
        tenantId: 'tenant-1',
        executionId: 'exec-1',
        onOutputChunk,
      }),
    )

    const event: ExecutionEvent<OutputChunkPayload> = {
      eventId: 5,
      event: ExecutionEventName.OUTPUT_CHUNK,
      timestamp: '2025-01-01T00:00:00Z',
      executionId: 'exec-1',
      tenantId: 'tenant-1',
      data: { stepId: 'step-1', chunk: 'Hello ', index: 0 },
    }

    act(() => {
      handlers[ExecutionEventName.OUTPUT_CHUNK]?.(event)
    })

    expect(onOutputChunk).toHaveBeenCalledWith(event)
  })

  it('tracks lastEventId monotonically', () => {
    const { socket, handlers } = createMockSocket()
    ioMock.mockReturnValue(socket)

    const { result } = renderHook(() =>
      useExecutionSocket({
        tenantId: 'tenant-1',
        executionId: 'exec-1',
      }),
    )

    act(() => {
      handlers[ExecutionEventName.STEP_STATUS_CHANGED]?.({
        eventId: 5,
        event: ExecutionEventName.STEP_STATUS_CHANGED,
        timestamp: '2025-01-01T00:00:00Z',
        executionId: 'exec-1',
        tenantId: 'tenant-1',
        data: { stepId: 's1', nodeId: 'n1', from: 'pending', to: 'running' },
      })
    })

    expect(result.current.lastEventId).toBe(5)

    act(() => {
      handlers[ExecutionEventName.STEP_STATUS_CHANGED]?.({
        eventId: 3,
        event: ExecutionEventName.STEP_STATUS_CHANGED,
        timestamp: '2025-01-01T00:00:00Z',
        executionId: 'exec-1',
        tenantId: 'tenant-1',
        data: { stepId: 's2', nodeId: 'n2', from: 'pending', to: 'running' },
      })
    })

    expect(result.current.lastEventId).toBe(5)
  })

  it('handles snapshot events and tracks lastEventId', () => {
    const { socket, handlers } = createMockSocket()
    ioMock.mockReturnValue(socket)
    const onSnapshot = vi.fn()

    const { result } = renderHook(() =>
      useExecutionSocket({
        tenantId: 'tenant-1',
        executionId: 'exec-1',
        onSnapshot,
      }),
    )

    const snapshot: ExecutionStateSnapshot = {
      executionId: 'exec-1',
      status: 'running',
      completedSteps: 2,
      totalSteps: 5,
      steps: [
        {
          stepId: 'step-1',
          nodeId: 'node-1',
          status: 'completed',
          startedAt: '2025-01-01T00:00:00Z',
          completedAt: '2025-01-01T00:00:01Z',
        },
      ],
      snapshotAt: '2025-01-01T00:00:02Z',
      lastEventId: 10,
    }

    act(() => {
      handlers['execution.state.snapshot']?.(snapshot)
    })

    expect(onSnapshot).toHaveBeenCalledWith(snapshot)
    expect(result.current.lastEventId).toBe(10)
  })

  it('handles error events', () => {
    const { socket, handlers } = createMockSocket()
    ioMock.mockReturnValue(socket)
    const onError = vi.fn()

    const { result } = renderHook(() =>
      useExecutionSocket({
        tenantId: 'tenant-1',
        executionId: 'exec-1',
        onError,
      }),
    )

    act(() => {
      handlers.error?.({ message: 'Unauthorized', code: 'AUTH_FAILED' })
    })

    expect(onError).toHaveBeenCalledWith({
      message: 'Unauthorized',
      code: 'AUTH_FAILED',
    })
    expect(result.current.error).toBe('Unauthorized')
  })

  it('handles connection errors', () => {
    const { socket, handlers } = createMockSocket()
    ioMock.mockReturnValue(socket)

    const { result } = renderHook(() =>
      useExecutionSocket({
        tenantId: 'tenant-1',
        executionId: 'exec-1',
      }),
    )

    act(() => {
      handlers.connect_error?.(new Error('Connection refused'))
    })

    expect(result.current.connectionStatus).toBe('disconnected')
    expect(result.current.error).toBe('Connection refused')
  })

  it('unsubscribes and disconnects on unmount', () => {
    const { socket, handlers } = createMockSocket()
    ioMock.mockReturnValue(socket)

    const { unmount } = renderHook(() =>
      useExecutionSocket({
        tenantId: 'tenant-1',
        executionId: 'exec-1',
      }),
    )

    act(() => {
      handlers.connect?.()
    })

    unmount()

    expect(socket.emit).toHaveBeenCalledWith('execution:unsubscribe', {
      tenantId: 'tenant-1',
      executionId: 'exec-1',
    })
    expect(socket.removeAllListeners).toHaveBeenCalled()
    expect(socket.disconnect).toHaveBeenCalled()
  })

  it('handles disconnect event', () => {
    const { socket, handlers } = createMockSocket()
    ioMock.mockReturnValue(socket)

    const { result } = renderHook(() =>
      useExecutionSocket({
        tenantId: 'tenant-1',
        executionId: 'exec-1',
      }),
    )

    act(() => {
      handlers.connect?.()
    })
    expect(result.current.connectionStatus).toBe('connected')

    act(() => {
      handlers.disconnect?.()
    })
    expect(result.current.connectionStatus).toBe('disconnected')
  })
})
