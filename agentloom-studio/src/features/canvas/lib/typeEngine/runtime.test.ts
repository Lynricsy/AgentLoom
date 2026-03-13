import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  SerializedPortDefinition,
  TypeEngineCompatibilityResult,
  TypeEngineWorkerRequest,
  TypeEngineWorkerResponse,
} from './contracts'
import { TypeEngineRuntime, TypeEngineRuntimeError } from './runtime'

function createPort(id: string, dataType: SerializedPortDefinition['dataType']): SerializedPortDefinition {
  return {
    id,
    label: id,
    direction: 'output',
    dataType,
    required: false,
    multiple: false,
    maxConnections: null,
    schema:
      dataType === 'json'
        ? {
            kind: 'json',
            shape: 'object',
            properties: {},
          }
        : {
            kind: dataType,
          },
  }
}

function createCompatibilityResult(
  level: TypeEngineCompatibilityResult['level'],
  reason: string | null = null,
): TypeEngineCompatibilityResult {
  return {
    level,
    reason,
    missingFields: [],
    candidateMappings: [],
    conflictPath: null,
    transformFn: null,
    metadata: {},
  }
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

function createFakeWorkerHandle() {
  const postedMessages: TypeEngineWorkerRequest[] = []
  let terminated = false

  const worker: {
    onmessage: ((event: MessageEvent<TypeEngineWorkerResponse>) => void) | null
    onerror: ((event: ErrorEvent) => void) | null
    postMessage: (message: unknown) => void
    terminate: () => void
  } = {
    onmessage: null,
    onerror: null,
    postMessage(message: unknown) {
      postedMessages.push(message as TypeEngineWorkerRequest)
    },
    terminate() {
      terminated = true
    },
  }

  return {
    worker: worker as unknown as Worker,
    postedMessages,
    isTerminated: () => terminated,
    emitMessage(message: TypeEngineWorkerResponse) {
      worker.onmessage?.({ data: message } as MessageEvent<TypeEngineWorkerResponse>)
    },
    emitError(message: string) {
      worker.onerror?.({ message } as ErrorEvent)
    },
  }
}

describe('TypeEngineRuntime', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('routes overlapping worker responses by request id', async () => {
    const workerHandle = createFakeWorkerHandle()
    const runtime = new TypeEngineRuntime({
      createWorker: () => workerHandle.worker,
      requestTimeoutMs: 1000,
    })

    const readyPromise = runtime.ensureReady()

    expect(workerHandle.postedMessages[0]).toMatchObject({ kind: 'init' })

    workerHandle.emitMessage({
      kind: 'init',
      requestId: workerHandle.postedMessages[0]!.requestId,
      ok: true,
      payload: { loadStrategy: 'streaming' },
    })

    await readyPromise

    const resultA = runtime.checkCompatibility('key-a', createPort('a', 'text'), createPort('b', 'text'))
    const resultB = runtime.checkCompatibility('key-b', createPort('c', 'json'), createPort('d', 'json'))

    await flushMicrotasks()

    expect(runtime.getState().workerBusy).toBe(true)

    const compatibilityRequests = workerHandle.postedMessages.filter(
      (message) => message.kind === 'checkCompatibility',
    )
    expect(compatibilityRequests).toHaveLength(2)

    workerHandle.emitMessage({
      kind: 'checkCompatibility',
      requestId: compatibilityRequests[1]!.requestId,
      ok: true,
      payload: createCompatibilityResult('PARTIAL', 'partial_field_match'),
    })
    workerHandle.emitMessage({
      kind: 'checkCompatibility',
      requestId: compatibilityRequests[0]!.requestId,
      ok: true,
      payload: createCompatibilityResult('EXACT'),
    })

    await expect(resultB).resolves.toMatchObject({
      level: 'PARTIAL',
      reason: 'partial_field_match',
    })
    await expect(resultA).resolves.toMatchObject({ level: 'EXACT' })

    expect(runtime.getState()).toMatchObject({
      wasmReady: true,
      workerBusy: false,
      lastError: null,
    })
  })

  it('deduplicates in-flight checks and serves cache hits without extra worker traffic', async () => {
    const workerHandle = createFakeWorkerHandle()
    const runtime = new TypeEngineRuntime({
      createWorker: () => workerHandle.worker,
      requestTimeoutMs: 1000,
    })

    const readyPromise = runtime.ensureReady()

    workerHandle.emitMessage({
      kind: 'init',
      requestId: workerHandle.postedMessages[0]!.requestId,
      ok: true,
      payload: { loadStrategy: 'streaming' },
    })

    await readyPromise

    const first = runtime.checkCompatibility(
      'shared-key',
      createPort('source', 'text'),
      createPort('target', 'text'),
    )
    const second = runtime.checkCompatibility(
      'shared-key',
      createPort('source', 'text'),
      createPort('target', 'text'),
    )

    await flushMicrotasks()

    const compatibilityRequests = workerHandle.postedMessages.filter(
      (message) => message.kind === 'checkCompatibility',
    )
    expect(compatibilityRequests).toHaveLength(1)

    workerHandle.emitMessage({
      kind: 'checkCompatibility',
      requestId: compatibilityRequests[0]!.requestId,
      ok: true,
      payload: createCompatibilityResult('EXACT'),
    })

    await expect(first).resolves.toMatchObject({ level: 'EXACT' })
    await expect(second).resolves.toMatchObject({ level: 'EXACT' })

    const messageCountAfterFirstResolve = workerHandle.postedMessages.length
    const cached = await runtime.checkCompatibility(
      'shared-key',
      createPort('source', 'text'),
      createPort('target', 'text'),
    )

    expect(cached).toMatchObject({ level: 'EXACT' })
    expect(workerHandle.postedMessages).toHaveLength(messageCountAfterFirstResolve)
  })

  it('times out hung requests and resets runtime state', async () => {
    vi.useFakeTimers()
    const workerHandle = createFakeWorkerHandle()
    const runtime = new TypeEngineRuntime({
      createWorker: () => workerHandle.worker,
      requestTimeoutMs: 50,
    })

    const resultPromise = runtime.checkCompatibility(
      'timeout-key',
      createPort('source', 'text'),
      createPort('target', 'text'),
    )

    vi.advanceTimersByTime(50)

    await expect(resultPromise).rejects.toBeInstanceOf(TypeEngineRuntimeError)
    await expect(resultPromise).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' })

    expect(runtime.getState()).toMatchObject({
      wasmReady: false,
      workerBusy: false,
      lastError: {
        code: 'REQUEST_TIMEOUT',
      },
    })
    expect(workerHandle.isTerminated()).toBe(true)
  })

  it('surfaces worker crash errors through runtime state', async () => {
    const workerHandle = createFakeWorkerHandle()
    const runtime = new TypeEngineRuntime({
      createWorker: () => workerHandle.worker,
      requestTimeoutMs: 1000,
    })

    const resultPromise = runtime.checkCompatibility(
      'worker-error',
      createPort('source', 'text'),
      createPort('target', 'text'),
    )

    workerHandle.emitError('simulated worker crash')

    await expect(resultPromise).rejects.toMatchObject({
      code: 'WORKER_ERROR',
      message: 'simulated worker crash',
    })
    expect(runtime.getState()).toMatchObject({
      wasmReady: false,
      workerBusy: false,
      lastError: {
        code: 'WORKER_ERROR',
      },
    })
  })

  it('clears cache and pending dedupe state after a fatal worker error so retries use a fresh worker', async () => {
    const firstWorker = createFakeWorkerHandle()
    const secondWorker = createFakeWorkerHandle()
    const createWorker = vi
      .fn<() => Worker>()
      .mockImplementationOnce(() => firstWorker.worker)
      .mockImplementationOnce(() => secondWorker.worker)

    const runtime = new TypeEngineRuntime({
      createWorker,
      requestTimeoutMs: 1000,
    })

    const source = createPort('source', 'text')
    const target = createPort('target', 'text')

    const firstResultPromise = runtime.checkCompatibility('shared-key', source, target)

    firstWorker.emitMessage({
      kind: 'init',
      requestId: firstWorker.postedMessages[0]!.requestId,
      ok: true,
      payload: { loadStrategy: 'streaming' },
    })

    await vi.waitFor(() => {
      expect(
        firstWorker.postedMessages.some(
          (message) => message.kind === 'checkCompatibility',
        ),
      ).toBe(true)
    })

    const firstCompatibilityRequest = firstWorker.postedMessages.find(
      (message) => message.kind === 'checkCompatibility',
    )
    expect(firstCompatibilityRequest).toBeDefined()

    firstWorker.emitMessage({
      kind: 'checkCompatibility',
      requestId: firstCompatibilityRequest!.requestId,
      ok: true,
      payload: createCompatibilityResult('EXACT'),
    })

    await expect(firstResultPromise).resolves.toMatchObject({ level: 'EXACT' })
    expect(runtime.getCachedResult('shared-key')).toMatchObject({ level: 'EXACT' })

    firstWorker.emitError('simulated worker crash')

    expect(runtime.getCachedResult('shared-key')).toBeNull()
    expect(firstWorker.isTerminated()).toBe(true)

    const retriedResultPromise = runtime.checkCompatibility('shared-key', source, target)

    expect(createWorker).toHaveBeenCalledTimes(2)
    expect(secondWorker.postedMessages[0]).toMatchObject({ kind: 'init' })

    secondWorker.emitMessage({
      kind: 'init',
      requestId: secondWorker.postedMessages[0]!.requestId,
      ok: true,
      payload: { loadStrategy: 'streaming' },
    })

    await vi.waitFor(() => {
      expect(
        secondWorker.postedMessages.some(
          (message) => message.kind === 'checkCompatibility',
        ),
      ).toBe(true)
    })

    const retriedCompatibilityRequest = secondWorker.postedMessages.find(
      (message) => message.kind === 'checkCompatibility',
    )
    expect(retriedCompatibilityRequest).toBeDefined()

    secondWorker.emitMessage({
      kind: 'checkCompatibility',
      requestId: retriedCompatibilityRequest!.requestId,
      ok: true,
      payload: createCompatibilityResult('PARTIAL', 'partial_field_match'),
    })

    await expect(retriedResultPromise).resolves.toMatchObject({
      level: 'PARTIAL',
      reason: 'partial_field_match',
    })
  })
})
