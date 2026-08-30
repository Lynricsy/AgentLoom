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
  }
}

/**
 * wasm-bindgen 为「JS 侧函数」生成的 import 名形如
 * `__wbg_<逻辑名>_<16位内容哈希>`，哈希每次升级 wasm-bindgen 都会变。
 * 这里只对带 `__wbg_` 前缀的名字剥前缀与哈希后按逻辑名注册 handler，
 * 使本文件不必跟着 wasm-bindgen 版本逐个改名。
 *
 * 不带该前缀的 import（`__wbindgen_init_externref_table`、
 * `__wbindgen_cast_<id>`）用**原名**注册：其后缀是 wasm-bindgen 的稳定
 * cast 序号而非内容哈希，剥掉会把不同 cast 混为一个。
 */
const WASM_IMPORT_HASH_SUFFIX = /_[0-9a-f]{16}$/u

function createWasmImports(wasmRef: { current: TypeEngineWasmExports | null }): WebAssembly.Imports {
  const handlers: Record<string, (...args: never[]) => unknown> = {
    Error(pointer: number, length: number) {
      const wasm = wasmRef.current
      if (!wasm) {
        return new Error('TypeEngine WASM exports are not ready.')
      }

      const bytes = new Uint8Array(wasm.memory.buffer)
      const message = new TextDecoder('utf-8').decode(bytes.subarray(pointer, pointer + length))
      return new Error(message)
    },
    __wbindgen_boolean_get(value: unknown) {
      return typeof value === 'boolean' ? (value ? 1 : 0) : 0xffffff
    },
    __wbindgen_is_null(value: unknown) {
      return value === null
    },
    __wbindgen_is_object(value: unknown) {
      return typeof value === 'object' && value !== null
    },
    __wbindgen_is_undefined(value: unknown) {
      return value === undefined
    },
    __wbindgen_number_get(pointer: number, value: unknown) {
      const wasm = wasmRef.current
      if (!wasm) {
        return
      }

      const view = new DataView(wasm.memory.buffer)
      const numberValue = typeof value === 'number' ? value : undefined
      view.setFloat64(pointer + 8, numberValue ?? 0, true)
      view.setInt32(pointer, numberValue == null ? 0 : 1, true)
    },
    __wbindgen_string_get(pointer: number, value: unknown) {
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
    __wbindgen_throw(pointer: number, length: number) {
      const wasm = wasmRef.current
      if (!wasm) {
        throw new Error('TypeEngine WASM exports are not ready.')
      }

      const bytes = new Uint8Array(wasm.memory.buffer)
      const message = new TextDecoder('utf-8').decode(bytes.subarray(pointer, pointer + length))
      throw new Error(message)
    },
    parse(pointer: number, length: number) {
      const wasm = wasmRef.current
      if (!wasm) {
        throw new Error('TypeEngine WASM exports are not ready.')
      }

      const text = new TextDecoder('utf-8').decode(
        new Uint8Array(wasm.memory.buffer).subarray(pointer, pointer + length),
      )
      return JSON.parse(text)
    },
    set(target: object, property: PropertyKey, value: unknown) {
      return Reflect.set(target, property, value)
    },
    stringify(value: unknown) {
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

  // WebAssembly 实例化时按名取 import；用 Proxy 把带哈希的实际名归一化到
  // handlers 的逻辑名。命中不到时抛出可读错误，而不是让 WebAssembly
  // 报「function import requires a callable」这种无法定位的信息。
  const proxied = new Proxy(handlers, {
    has: () => true,
    get(target, property) {
      if (typeof property !== 'string') {
        return undefined
      }

      const normalized = property.startsWith('__wbg_')
        ? property.slice('__wbg_'.length).replace(WASM_IMPORT_HASH_SUFFIX, '')
        : property
      const handler = target[normalized]
      if (!handler) {
        throw new Error(
          `TypeEngine WASM 请求了未实现的 import「${property}」（归一化为「${normalized}」）。` +
            'wasm-bindgen 的 import 集合可能已变化，请同步 runtime.worker.ts 的 handlers。',
        )
      }

      return handler
    },
  })

  return {
    './agentloom_type_engine_bg.js': proxied as unknown as WebAssembly.ModuleImports,
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
  let loadStrategy: TypeEngineWasmLoadStrategy

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
