/// <reference lib="webworker" />

import type {
  SerializedPortDefinition,
  TypeEngineBindings,
  TypeEngineCompatibilityResult,
  TypeEngineWorkerError,
  TypeEngineWorkerRequest,
  TypeEngineWorkerResponse,
  TypeEngineWasmLoadStrategy,
} from './contracts'
import type { TypeSchema } from '../../types/typeSchema'

const TYPE_ENGINE_WASM_URL = new URL(
  '../../../../../../agentloom-type-engine/pkg/agentloom_type_engine_bg.wasm',
  import.meta.url,
)

interface TypeEngineWasmExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory
  __wbindgen_start: () => void
  __wbindgen_externrefs: WebAssembly.Table
  __externref_table_alloc: () => number
  __externref_table_dealloc: (index: number) => void
  __wbindgen_exn_store: (index: number) => void
  __wbindgen_malloc: (length: number, align: number) => number
  __wbindgen_realloc: (
    pointer: number,
    oldLength: number,
    nextLength: number,
    align: number,
  ) => number
  checkCompatibility: (
    source: SerializedPortDefinition,
    target: SerializedPortDefinition,
  ) => [number, number, number]
  checkSchemaCompatibility: (source: TypeSchema, target: TypeSchema) => [number, number, number]
  validateSchema: (schema: TypeSchema | string) => [number, number, number]
}

interface FetchResponseLike {
  arrayBuffer: () => Promise<ArrayBuffer>
  clone?: () => FetchResponseLike
}

interface WebAssemblyLike {
  instantiateStreaming?: (
    source: Promise<Response> | Response,
    importObject: WebAssembly.Imports,
  ) => Promise<WebAssembly.WebAssemblyInstantiatedSource>
  instantiate: (
    source: BufferSource,
    importObject?: WebAssembly.Imports,
  ) => Promise<WebAssembly.WebAssemblyInstantiatedSource>
}

interface TypeEngineDiagnostics {
  warn: (message: string, details?: Record<string, unknown>) => void
}

interface WorkerScopeLike {
  postMessage: (message: TypeEngineWorkerResponse) => void
  onmessage: ((event: MessageEvent<TypeEngineWorkerRequest>) => void) | null
}

const defaultDiagnostics: TypeEngineDiagnostics = {
  warn(message, details) {
    console.warn(message, details)
  },
}

function isErrorRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeWorkerError(error: unknown): TypeEngineWorkerError {
  if (isErrorRecord(error)) {
    const code = typeof error.code === 'string' ? error.code : 'TYPE_ENGINE_WORKER_ERROR'
    const message = typeof error.message === 'string' ? error.message : 'TypeEngine worker request failed.'
    const detailsValue = error.context
    const details = isErrorRecord(detailsValue) ? detailsValue : undefined
    return { code, message, details }
  }

  if (error instanceof Error) {
    return {
      code: 'TYPE_ENGINE_WORKER_ERROR',
      message: error.message,
    }
  }

  return {
    code: 'TYPE_ENGINE_WORKER_ERROR',
    message: String(error),
  }
}

export function createTypeEngineBindings(
  wasmExports: TypeEngineWasmExports,
  loadStrategy: TypeEngineWasmLoadStrategy,
): TypeEngineBindings {
  function takeFromExternrefTable(index: number): unknown {
    const value = wasmExports.__wbindgen_externrefs.get(index)
    wasmExports.__externref_table_dealloc(index)
    return value
  }

  function call<T>(invoker: () => [number, number, number]): T {
    const [resultIndex, errorIndex, hasError] = invoker()
    if (hasError) {
      throw takeFromExternrefTable(errorIndex)
    }

    return takeFromExternrefTable(resultIndex) as T
  }

  return {
    loadStrategy,
    checkCompatibility(source, target) {
      return call<TypeEngineCompatibilityResult>(() => wasmExports.checkCompatibility(source, target))
    },
    checkSchemaCompatibility(source, target) {
      return call<TypeEngineCompatibilityResult>(() => wasmExports.checkSchemaCompatibility(source, target))
    },
    validateSchema(schema) {
      return call<unknown>(() => wasmExports.validateSchema(schema))
    },
  }
}

function createWasmImports(wasmRef: { current: TypeEngineWasmExports | null }): WebAssembly.Imports {
  const imports = {
    __wbg_Error_83742b46f01ce22d(pointer: number, length: number) {
      const wasm = wasmRef.current
      if (!wasm) {
        return new Error('TypeEngine WASM exports are not ready.')
      }

      const bytes = new Uint8Array(wasm.memory.buffer)
      const message = new TextDecoder('utf-8').decode(bytes.subarray(pointer, pointer + length))
      return new Error(message)
    },
    __wbg___wbindgen_boolean_get_c0f3f60bac5a78d1(value: unknown) {
      return typeof value === 'boolean' ? (value ? 1 : 0) : 0xffffff
    },
    __wbg___wbindgen_is_null_0b605fc6b167c56f(value: unknown) {
      return value === null
    },
    __wbg___wbindgen_is_object_781bc9f159099513(value: unknown) {
      return typeof value === 'object' && value !== null
    },
    __wbg___wbindgen_is_undefined_52709e72fb9f179c(value: unknown) {
      return value === undefined
    },
    __wbg___wbindgen_number_get_34bb9d9dcfa21373(pointer: number, value: unknown) {
      const wasm = wasmRef.current
      if (!wasm) {
        return
      }

      const view = new DataView(wasm.memory.buffer)
      const numberValue = typeof value === 'number' ? value : undefined
      view.setFloat64(pointer + 8, numberValue ?? 0, true)
      view.setInt32(pointer, numberValue == null ? 0 : 1, true)
    },
    __wbg___wbindgen_string_get_395e606bd0ee4427(pointer: number, value: unknown) {
      const wasm = wasmRef.current
      if (!wasm) {
        return
      }

      const stringValue = typeof value === 'string' ? value : undefined
      const view = new DataView(wasm.memory.buffer)
      if (stringValue == null) {
        view.setInt32(pointer + 4, 0, true)
        view.setInt32(pointer, 0, true)
        return
      }

      const encoded = new TextEncoder().encode(stringValue)
      const stringPointer = wasm.__wbindgen_malloc(encoded.length, 1) >>> 0
      new Uint8Array(wasm.memory.buffer).subarray(stringPointer, stringPointer + encoded.length).set(encoded)
      view.setInt32(pointer + 4, encoded.length, true)
      view.setInt32(pointer, stringPointer, true)
    },
    __wbg___wbindgen_throw_6ddd609b62940d55(pointer: number, length: number) {
      const wasm = wasmRef.current
      if (!wasm) {
        throw new Error('TypeEngine WASM exports are not ready.')
      }

      const bytes = new Uint8Array(wasm.memory.buffer)
      const message = new TextDecoder('utf-8').decode(bytes.subarray(pointer, pointer + length))
      throw new Error(message)
    },
    __wbg_parse_e9eddd2a82c706eb(pointer: number, length: number) {
      const wasm = wasmRef.current
      if (!wasm) {
        throw new Error('TypeEngine WASM exports are not ready.')
      }

      const text = new TextDecoder('utf-8').decode(
        new Uint8Array(wasm.memory.buffer).subarray(pointer, pointer + length),
      )
      return JSON.parse(text)
    },
    __wbg_set_7eaa4f96924fd6b3(target: object, property: PropertyKey, value: unknown) {
      return Reflect.set(target, property, value)
    },
    __wbg_stringify_5ae93966a84901ac(value: unknown) {
      return JSON.stringify(value)
    },
    __wbindgen_cast_0000000000000001(pointer: number, length: number) {
      const wasm = wasmRef.current
      if (!wasm) {
        return ''
      }

      const bytes = new Uint8Array(wasm.memory.buffer)
      return new TextDecoder('utf-8').decode(bytes.subarray(pointer, pointer + length))
    },
    __wbindgen_init_externref_table() {
      const wasm = wasmRef.current
      if (!wasm) {
        return
      }

      const table = wasm.__wbindgen_externrefs
      const offset = table.grow(4)
      table.set(0, undefined)
      table.set(offset, undefined)
      table.set(offset + 1, null)
      table.set(offset + 2, true)
      table.set(offset + 3, false)
    },
  }

  return {
    './agentloom_type_engine_bg.js': imports,
  }
}

export async function loadTypeEngineBindings(options?: {
  wasmUrl?: URL
  fetchImpl?: (input: string | URL) => Promise<FetchResponseLike>
  webAssemblyImpl?: WebAssemblyLike
  diagnostics?: TypeEngineDiagnostics
}): Promise<TypeEngineBindings> {
  const wasmUrl = options?.wasmUrl ?? TYPE_ENGINE_WASM_URL
  const fetchImpl = options?.fetchImpl ?? ((input) => fetch(input.toString()) as Promise<FetchResponseLike>)
  const webAssemblyImpl = options?.webAssemblyImpl ?? WebAssembly
  const diagnostics = options?.diagnostics ?? defaultDiagnostics
  const wasmRef: { current: TypeEngineWasmExports | null } = { current: null }
  const imports = createWasmImports(wasmRef)
  const response = await fetchImpl(wasmUrl)
  const fallbackResponse = typeof response.clone === 'function' ? response.clone() : null

  let instantiated: WebAssembly.WebAssemblyInstantiatedSource
  let loadStrategy: TypeEngineWasmLoadStrategy = 'arrayBuffer'

  try {
    if (!webAssemblyImpl.instantiateStreaming) {
      throw new Error('instantiateStreaming unavailable')
    }

    instantiated = await webAssemblyImpl.instantiateStreaming(
      response as unknown as Response,
      imports,
    )
    loadStrategy = 'streaming'
  } catch (error) {
    diagnostics.warn('TypeEngine worker falling back to arrayBuffer loader.', {
      wasmUrl: wasmUrl.toString(),
      error: normalizeWorkerError(error),
    })

    const bytesResponse = fallbackResponse ?? (await fetchImpl(wasmUrl))
    const buffer = await bytesResponse.arrayBuffer()
    instantiated = await webAssemblyImpl.instantiate(buffer, imports)
    loadStrategy = 'arrayBuffer'
  }

  wasmRef.current = instantiated.instance.exports as TypeEngineWasmExports
  wasmRef.current.__wbindgen_start()
  return createTypeEngineBindings(wasmRef.current, loadStrategy)
}

export function createWorkerMessageHandler(options?: {
  loadBindings?: () => Promise<TypeEngineBindings>
  postMessage?: (message: TypeEngineWorkerResponse) => void
}) {
  const postMessage = options?.postMessage
  let bindingsPromise: Promise<TypeEngineBindings> | null = null

  const loadBindings = async (): Promise<TypeEngineBindings> => {
    if (!bindingsPromise) {
      bindingsPromise = (options?.loadBindings ?? (() => loadTypeEngineBindings()))()
    }

    return bindingsPromise
  }

  return async (event: MessageEvent<TypeEngineWorkerRequest>) => {
    const request = event.data

    try {
      const bindings = await loadBindings()

      if (request.kind === 'init') {
        postMessage?.({
          kind: 'init',
          requestId: request.requestId,
          ok: true,
          payload: {
            loadStrategy: bindings.loadStrategy,
          },
        })
        return
      }

      postMessage?.({
        kind: 'checkCompatibility',
        requestId: request.requestId,
        ok: true,
        payload: bindings.checkCompatibility(request.source, request.target),
      })
    } catch (error) {
      postMessage?.({
        kind: request.kind,
        requestId: request.requestId,
        ok: false,
        error: normalizeWorkerError(error),
      })
    }
  }
}

export function registerTypeEngineWorker(workerScope: WorkerScopeLike): WorkerScopeLike {
  const handler = createWorkerMessageHandler({
    postMessage(message) {
      workerScope.postMessage(message)
    },
  })

  workerScope.onmessage = handler
  return workerScope
}

if (typeof document === 'undefined' && 'postMessage' in globalThis) {
  registerTypeEngineWorker(globalThis as unknown as WorkerScopeLike)
}

export { TYPE_ENGINE_WASM_URL }
