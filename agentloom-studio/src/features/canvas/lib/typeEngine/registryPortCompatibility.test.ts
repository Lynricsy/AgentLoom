import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { getNodeTypeConfig, type NodeType, type PortDefinition } from '../../types/nodeTypeRegistry'
import type { TypeEngineBindings, TypeEngineCompatibilityResult } from './contracts'
import { evaluateCompatibilityFallback } from './fallback'
import { loadTypeEngineBindings } from './runtime.worker'
import { serializePortDefinition } from './serialize'

/**
 * 用内置节点注册表的真实端口定义，同时跑提交在仓库里的 WASM 产物与 JS fallback，
 * 断言两条求值路径对同一条边给出相同结论。
 */

const WASM_PATH = join(
  import.meta.dirname,
  '../../../../../../agentloom-type-engine/pkg/agentloom_type_engine_bg.wasm',
)

function findPort(nodeType: NodeType, direction: 'input' | 'output', portId: string): PortDefinition {
  const config = getNodeTypeConfig(nodeType)
  const ports = direction === 'input' ? config.inputPorts : config.outputPorts
  const port = ports.find((candidate) => candidate.id === portId)
  if (!port) {
    throw new Error(`${nodeType} 没有 ${direction} 端口 ${portId}`)
  }
  return port
}

let wasm: TypeEngineBindings

beforeAll(async () => {
  const bytes = readFileSync(WASM_PATH)
  wasm = await loadTypeEngineBindings({
    fetchImpl: async () => ({
      arrayBuffer: async () =>
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    }),
    webAssemblyImpl: {
      instantiate: (source, imports) => WebAssembly.instantiate(source, imports),
    },
    diagnostics: { warn: () => undefined },
  })
})

function evaluateBoth(source: PortDefinition, target: PortDefinition): TypeEngineCompatibilityResult {
  const wasmResult = wasm.checkCompatibility(
    serializePortDefinition(source),
    serializePortDefinition(target),
  )
  const fallbackResult = evaluateCompatibilityFallback(source, target)

  expect(fallbackResult.level).toBe(wasmResult.level)
  expect(fallbackResult.reason).toBe(wasmResult.reason)
  expect(fallbackResult.transformFn).toBe(wasmResult.transformFn)
  return wasmResult
}

describe('内置节点端口兼容性（WASM 与 fallback 一致）', () => {
  it('Agent「回复」→ Text Output「文本」：标签不同的同类型 text 端口可直连', () => {
    const result = evaluateBoth(
      findPort('agent', 'output', 'agent-out'),
      findPort('text-output', 'input', 'content-in'),
    )

    expect(result.level).toBe('EXACT')
  })

  it('Text「文本」→ Agent「系统提示词」可直连', () => {
    const result = evaluateBoth(
      findPort('text', 'output', 'text-out'),
      findPort('agent', 'input', 'system-prompt-in'),
    )

    expect(result.level).toBe('EXACT')
  })

  it('真正不兼容的端口仍被拒绝：Agent「回复」(text) → Agent「沙箱」(sandbox)', () => {
    const result = evaluateBoth(
      findPort('agent', 'output', 'agent-out'),
      findPort('agent', 'input', 'sandbox-in'),
    )

    expect(result.level).toBe('INCOMPATIBLE')
    expect(result.reason).toBe('type_mismatch_no_transform')
  })

  it('Knowledge Base「知识库」(knowledge) → Agent「上下文」(json) 仍不兼容', () => {
    const result = evaluateBoth(
      findPort('knowledge-base', 'output', 'knowledge-out'),
      findPort('agent', 'input', 'context-in'),
    )

    expect(result.level).toBe('INCOMPATIBLE')
  })
})
