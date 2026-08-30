import { describe, expect, it, vi } from 'vitest'
import type {
  SerializedPortDefinition,
  TypeEngineBindings,
  TypeEngineCompatibilityResult,
  TypeEngineWorkerRequest,
  TypeEngineWorkerResponse,
} from './contracts'
import {
  createTypeEngineBindings,
  createWorkerMessageHandler,
  loadTypeEngineBindings,
} from './runtime.worker'

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

function createWorkerMessage(data: TypeEngineWorkerRequest): MessageEvent<TypeEngineWorkerRequest> {
  return new MessageEvent('message', { data })
}

class MockExternRefTable {
  private readonly values = new Map<number, unknown>()
  private nextIndex = 8

  grow(by: number): number {
    const offset = this.nextIndex
    this.nextIndex += by
    return offset
  }

  set(index: number, value: unknown) {
    this.values.set(index, value)
  }

  get(index: number): unknown {
    return this.values.get(index)
  }

  store(value: unknown): number {
    const index = this.nextIndex
    this.nextIndex += 1
    this.values.set(index, value)
    return index
  }

  delete(index: number) {
    this.values.delete(index)
  }
}

function createMockWasmExports() {
  const table = new MockExternRefTable()
  const exports = {
    memory: new WebAssembly.Memory({ initial: 1 }),
    __wbindgen_start: vi.fn(),
    __wbindgen_externrefs: table as unknown as WebAssembly.Table,
    __externref_table_alloc: vi.fn(() => table.store(undefined)),
    __externref_table_dealloc: vi.fn((index: number) => {
      table.delete(index)
    }),
    __wbindgen_exn_store: vi.fn(),
    __wbindgen_malloc: vi.fn(() => 0),
    __wbindgen_realloc: vi.fn(() => 0),
    checkCompatibility: vi.fn((source: SerializedPortDefinition, target: SerializedPortDefinition) => {
      return [
        table.store({
          level: source.dataType === target.dataType ? 'EXACT' : 'TRANSFORM',
          reason: source.dataType === target.dataType ? null : 'text_to_json_parse',
          missingFields: [],
          candidateMappings: [],
          conflictPath: null,
          transformFn: source.dataType === target.dataType ? null : 'parse_json',
          metadata: {},
        }),
        0,
        0,
      ] as [number, number, number]
    }),
  }

  return exports
}

describe('runtime.worker', () => {
  it('routes init and compatibility requests through the worker message handler', async () => {
    const responses: TypeEngineWorkerResponse[] = []
    const partialResult: TypeEngineCompatibilityResult = {
      level: 'PARTIAL',
      reason: 'partial_field_match',
      missingFields: [],
      candidateMappings: [],
      conflictPath: null,
      transformFn: null,
      metadata: {},
    }
    const bindings: TypeEngineBindings = {
      loadStrategy: 'streaming',
      checkCompatibility: vi.fn(() => partialResult),
    }

    const handler = createWorkerMessageHandler({
      loadBindings: async () => bindings,
      postMessage(message) {
        responses.push(message)
      },
    })

    await handler(createWorkerMessage({ kind: 'init', requestId: 'init-1' }))
    await handler(createWorkerMessage({
      kind: 'checkCompatibility',
      requestId: 'compat-1',
      source: createPort('source', 'json'),
      target: createPort('target', 'json'),
    }))

    expect(responses).toEqual([
      {
        kind: 'init',
        requestId: 'init-1',
        ok: true,
        payload: { loadStrategy: 'streaming' },
      },
      {
        kind: 'checkCompatibility',
        requestId: 'compat-1',
        ok: true,
        payload: partialResult,
      },
    ])
  })

  it('returns structured worker errors when the bindings throw', async () => {
    const responses: TypeEngineWorkerResponse[] = []
    const handler = createWorkerMessageHandler({
      loadBindings: async () => ({
        loadStrategy: 'streaming',
        checkCompatibility() {
          throw {
            code: 'WASM_EXECUTION_FAILED',
            message: 'boom',
            context: { stage: 'checkCompatibility' },
          }
        },
      }),
      postMessage(message) {
        responses.push(message)
      },
    })

    await handler(createWorkerMessage({
      kind: 'checkCompatibility',
      requestId: 'compat-2',
      source: createPort('source', 'text'),
      target: createPort('target', 'json'),
    }))

    expect(responses[0]).toEqual({
      kind: 'checkCompatibility',
      requestId: 'compat-2',
      ok: false,
      error: {
        code: 'WASM_EXECUTION_FAILED',
        message: 'boom',
        details: { stage: 'checkCompatibility' },
      },
    })
  })

  it('falls back from instantiateStreaming to arrayBuffer loading', async () => {
    const wasmExports = createMockWasmExports()
    const arrayBufferResponse = {
      arrayBuffer: vi.fn(async () => new ArrayBuffer(8)),
    }
    const fetchResponse = {
      arrayBuffer: vi.fn(async () => new ArrayBuffer(8)),
      clone: vi.fn(() => arrayBufferResponse),
    }
    const fetchImpl = vi.fn(async () => fetchResponse)
    const diagnostics = {
      warn: vi.fn(),
    }

    const bindings = await loadTypeEngineBindings({
      wasmUrl: new URL('https://example.com/type-engine.wasm'),
      fetchImpl,
      diagnostics,
      webAssemblyImpl: {
        instantiateStreaming: vi.fn(async () => {
          throw new Error('unsupported MIME type')
        }),
        instantiate: vi.fn(async () => ({
          instance: {
            exports: wasmExports,
          } as unknown as WebAssembly.Instance,
          module: {} as WebAssembly.Module,
        })),
      },
    })

    expect(bindings.loadStrategy).toBe('arrayBuffer')
    expect(diagnostics.warn).toHaveBeenCalledOnce()
    expect(fetchImpl).toHaveBeenCalledOnce()

    const result = bindings.checkCompatibility(
      createPort('source', 'text'),
      createPort('target', 'json'),
    )
    expect(result).toMatchObject({
      level: 'TRANSFORM',
      reason: 'text_to_json_parse',
      transformFn: 'parse_json',
    })
    expect(wasmExports.__wbindgen_start).toHaveBeenCalledOnce()
  })

  it('按逻辑名解析带哈希的 wasm-bindgen import，并对未知 import 抛出可定位错误', async () => {
    const wasmExports = createMockWasmExports()
    let capturedImports: WebAssembly.Imports | undefined

    await loadTypeEngineBindings({
      wasmUrl: new URL('https://example.com/type-engine.wasm'),
      fetchImpl: vi.fn(async () => ({
        arrayBuffer: vi.fn(async () => new ArrayBuffer(8)),
      })),
      webAssemblyImpl: {
        instantiateStreaming: vi.fn(async (_source, importObject) => {
          capturedImports = importObject
          return {
            instance: { exports: wasmExports } as unknown as WebAssembly.Instance,
            module: {} as WebAssembly.Module,
          }
        }),
        instantiate: vi.fn(),
      },
    })

    const glue = capturedImports?.['./agentloom_type_engine_bg.js'] as Record<
      string,
      unknown
    >
    expect(glue).toBeDefined()

    // wasm-bindgen 每次升版都会换掉这些 16 位内容哈希；下面用两组不同哈希
    // 断言解析只依赖逻辑名，不依赖具体哈希。
    expect(typeof glue.__wbg_parse_1cc93481b0865939).toBe('function')
    expect(typeof glue.__wbg_parse_e9eddd2a82c706eb).toBe('function')
    expect(typeof glue.__wbg___wbindgen_boolean_get_c9c83ebd41b34df3).toBe('function')
    expect(typeof glue.__wbg___wbindgen_boolean_get_c0f3f60bac5a78d1).toBe('function')

    // 不带 __wbg_ 前缀的 import 必须按原名命中（后缀是稳定 cast 序号，不能剥）。
    expect(typeof glue.__wbindgen_cast_0000000000000001).toBe('function')
    expect(typeof glue.__wbindgen_init_externref_table).toBe('function')

    expect(() => glue.__wbg_totallyNewBinding_0123456789abcdef).toThrow(
      /未实现的 import/u,
    )
  })

  it('wraps raw wasm exports into browser-safe bindings', () => {
    const bindings = createTypeEngineBindings(createMockWasmExports() as never, 'streaming')

    expect(
      bindings.checkCompatibility(createPort('source', 'text'), createPort('target', 'text')),
    ).toMatchObject({
      level: 'EXACT',
      reason: null,
    })
  })
})
