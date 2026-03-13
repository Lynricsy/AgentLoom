import type {
  SerializedPortDefinition,
  TypeEngineCompatibilityResult,
  TypeEngineRuntimeState,
  TypeEngineWorkerError,
  TypeEngineWorkerRequest,
  TypeEngineWorkerResponse,
} from './contracts'

const DEFAULT_REQUEST_TIMEOUT_MS = 4000

interface TypeEngineRuntimeOptions {
  createWorker?: () => Worker
  requestTimeoutMs?: number
}

type RuntimeWorkerRequest =
  | {
      kind: 'init'
    }
  | {
      kind: 'checkCompatibility'
      source: SerializedPortDefinition
      target: SerializedPortDefinition
    }

interface PendingRequest {
  kind: TypeEngineWorkerRequest['kind']
  resolve: (value: unknown) => void
  reject: (error: TypeEngineRuntimeError) => void
  timeoutId: ReturnType<typeof setTimeout>
}

function createDefaultWorker(): Worker {
  return new Worker(new URL('./runtime.worker.ts', import.meta.url), {
    type: 'module',
  })
}

function toWorkerError(error: unknown): TypeEngineWorkerError {
  if (typeof error === 'object' && error !== null) {
    const code = 'code' in error && typeof error.code === 'string'
      ? error.code
      : 'TYPE_ENGINE_RUNTIME_ERROR'
    const message = 'message' in error && typeof error.message === 'string'
      ? error.message
      : 'TypeEngine runtime request failed.'
    const details = 'details' in error && typeof error.details === 'object' && error.details !== null
      ? (error.details as Record<string, unknown>)
      : undefined

    return { code, message, details }
  }

  return {
    code: 'TYPE_ENGINE_RUNTIME_ERROR',
    message: String(error),
  }
}

export class TypeEngineRuntimeError extends Error {
  readonly code: string
  readonly details?: Record<string, unknown>

  constructor(payload: TypeEngineWorkerError) {
    super(payload.message)
    this.name = 'TypeEngineRuntimeError'
    this.code = payload.code
    this.details = payload.details
  }
}

export class TypeEngineRuntime {
  private readonly createWorker: () => Worker
  private readonly requestTimeoutMs: number
  private readonly cache = new Map<string, TypeEngineCompatibilityResult>()
  private readonly pendingRequests = new Map<string, PendingRequest>()
  private readonly inFlightCompatibility = new Map<string, Promise<TypeEngineCompatibilityResult>>()
  private worker: Worker | null = null
  private sequence = 0
  private readyPromise: Promise<void> | null = null
  private state: TypeEngineRuntimeState = {
    wasmReady: false,
    workerBusy: false,
    lastError: null,
  }

  constructor(options?: TypeEngineRuntimeOptions) {
    this.createWorker = options?.createWorker ?? createDefaultWorker
    this.requestTimeoutMs = options?.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
  }

  getState(): TypeEngineRuntimeState {
    return { ...this.state }
  }

  getCachedResult(cacheKey: string): TypeEngineCompatibilityResult | null {
    return this.cache.get(cacheKey) ?? null
  }

  clearCache() {
    this.cache.clear()
  }

  async ensureReady(): Promise<void> {
    if (this.state.wasmReady) {
      return
    }

    if (this.readyPromise) {
      return this.readyPromise
    }

    this.readyPromise = this.sendRequest({ kind: 'init' }).then(() => {
      this.state = {
        ...this.state,
        wasmReady: true,
        lastError: null,
      }
    }).catch((error) => {
      this.handleFatalError(error)
      throw error
    }).finally(() => {
      this.readyPromise = null
    })

    return this.readyPromise
  }

  async checkCompatibility(
    cacheKey: string,
    source: SerializedPortDefinition,
    target: SerializedPortDefinition,
  ): Promise<TypeEngineCompatibilityResult> {
    const cachedResult = this.cache.get(cacheKey)
    if (cachedResult) {
      return cachedResult
    }

    const pending = this.inFlightCompatibility.get(cacheKey)
    if (pending) {
      return pending
    }

    const task = this.ensureReady()
      .then(() =>
        this.sendRequest<TypeEngineCompatibilityResult>({
          kind: 'checkCompatibility',
          source,
          target,
        }),
      )
      .then((result) => {
        this.cache.set(cacheKey, result)
        this.state = {
          ...this.state,
          lastError: null,
        }
        return result
      })
      .catch((error) => {
        this.state = {
          ...this.state,
          lastError: toWorkerError(error),
        }
        throw error
      })
      .finally(() => {
        this.inFlightCompatibility.delete(cacheKey)
      })

    this.inFlightCompatibility.set(cacheKey, task)
    return task
  }

  private getOrCreateWorker(): Worker {
    if (this.worker) {
      return this.worker
    }

    const worker = this.createWorker()
    worker.onmessage = (event: MessageEvent<TypeEngineWorkerResponse>) => {
      this.handleWorkerMessage(event.data)
    }
    worker.onerror = (event: ErrorEvent) => {
      this.handleFatalError(
        new TypeEngineRuntimeError({
          code: 'WORKER_ERROR',
          message: event.message || 'TypeEngine worker crashed.',
        }),
      )
    }
    this.worker = worker
    return worker
  }

  private sendRequest<TResult>(
    request: RuntimeWorkerRequest,
  ): Promise<TResult> {
    const worker = this.getOrCreateWorker()
    const requestId = `${request.kind}-${++this.sequence}`

    return new Promise<TResult>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const timeoutError = new TypeEngineRuntimeError({
          code: 'REQUEST_TIMEOUT',
          message: `TypeEngine ${request.kind} request timed out.`,
        })
        this.handleFatalError(timeoutError)
      }, this.requestTimeoutMs)

      this.pendingRequests.set(requestId, {
        kind: request.kind,
        resolve(value) {
          resolve(value as TResult)
        },
        reject,
        timeoutId,
      })
      this.updateWorkerBusyState()

      worker.postMessage({
        ...request,
        requestId,
      })
    })
  }

  private handleWorkerMessage(message: TypeEngineWorkerResponse) {
    const pending = this.pendingRequests.get(message.requestId)
    if (!pending) {
      return
    }

    clearTimeout(pending.timeoutId)
    this.pendingRequests.delete(message.requestId)
    this.updateWorkerBusyState()

    if (!message.ok) {
      const error = new TypeEngineRuntimeError(message.error)
      if (message.kind === 'init') {
        this.handleFatalError(error)
      }
      pending.reject(error)
      return
    }

    if (message.kind === 'init') {
      this.state = {
        ...this.state,
        wasmReady: true,
        lastError: null,
      }
    }

    pending.resolve(message.payload)
  }

  private updateWorkerBusyState() {
    this.state = {
      ...this.state,
      workerBusy: this.pendingRequests.size > 0,
    }
  }

  private rejectAllPending(error: TypeEngineRuntimeError) {
    for (const [requestId, pending] of this.pendingRequests) {
      clearTimeout(pending.timeoutId)
      pending.reject(error)
      this.pendingRequests.delete(requestId)
    }

    this.updateWorkerBusyState()
  }

  private handleFatalError(error: TypeEngineRuntimeError) {
    this.state = {
      wasmReady: false,
      workerBusy: false,
      lastError: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    }
    this.readyPromise = null
    this.clearCache()
    this.inFlightCompatibility.clear()
    this.rejectAllPending(error)

    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
  }
}

let typeEngineRuntimeSingleton: TypeEngineRuntime | null = null

export function getTypeEngineRuntime(): TypeEngineRuntime {
  typeEngineRuntimeSingleton ??= new TypeEngineRuntime()
  return typeEngineRuntimeSingleton
}

export function setTypeEngineRuntimeForTesting(runtime: TypeEngineRuntime | null) {
  typeEngineRuntimeSingleton = runtime
}
