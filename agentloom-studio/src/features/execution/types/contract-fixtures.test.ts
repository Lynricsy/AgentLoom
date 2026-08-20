import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import {
  EXECUTION_EVENT_NAMES,
  ExecutionStateSnapshotSchema,
  parseExecutionEvent,
  type ExecutionStatusChangedPayload as ContractExecutionStatusChangedPayload,
  type OutputChunkPayload as ContractOutputChunkPayload,
  type StepRetryingPayload as ContractStepRetryingPayload,
  type StepSnapshot as ContractStepSnapshot,
  type StepStatusChangedPayload as ContractStepStatusChangedPayload,
} from '@agentloom/contracts'
import { beforeEach, describe, expect, it } from 'vitest'

import { useExecutionStore } from '../stores/executionStore'
import {
  ExecutionEventName,
  type ExecutionEvent,
  type ExecutionEventNameValue,
  type ExecutionStateSnapshot,
  type ExecutionStatusChangedPayload,
  type OutputChunkPayload,
  type StepRetryingPayload,
  type StepStatusChangedPayload,
} from './execution-event.types'

/**
 * 跨端契约测试：Studio 侧消费与 server / mobile 完全相同的
 * `agentloom-contracts/fixtures/` 输入。
 *
 * 这里同时守两件事：
 * 1. 编译期 —— Studio 手写的事件类型必须能接受契约层类型（下方 satisfies 断言）；
 *    Studio 一旦偷偷收窄或改名字段，这个文件直接 typecheck 失败。
 * 2. 运行期 —— fixture 经契约 schema 解析后，能被真实 executionStore 的
 *    事件入口消费并产生正确状态。
 */

const require_ = createRequire(import.meta.url)

function readFixture<T>(relativePath: string): T {
  const resolved = require_.resolve(`@agentloom/contracts/${relativePath}`)
  return JSON.parse(readFileSync(resolved, 'utf8')) as T
}

// ── 编译期漂移闸门 ────────────────────────────────────────────────
// 契约层类型必须能赋给 Studio 的对应类型；不兼容处会在此处报 TS 错误。
// Studio 侧把 status / from / to 收窄成了字面量联合，而契约层是 string，
// 因此这里按「结构相同、状态字段放宽为 string」的口径比对结构字段集。
type AssertAssignable<TTarget, TSource extends TTarget> = TSource

export type ContractCompatibilityProof = {
  status: AssertAssignable<
    Omit<ExecutionStatusChangedPayload, 'status'> & { status: string },
    ContractExecutionStatusChangedPayload
  >
  step: AssertAssignable<
    Omit<StepStatusChangedPayload, 'from' | 'to'> & {
      from: string
      to: string
    },
    ContractStepStatusChangedPayload
  >
  retry: AssertAssignable<StepRetryingPayload, ContractStepRetryingPayload>
  outputChunk: AssertAssignable<
    OutputChunkPayload,
    ContractOutputChunkPayload
  >
  stepSnapshot: AssertAssignable<
    Omit<ExecutionStateSnapshot['steps'][number], 'status'> & {
      status: string
    },
    ContractStepSnapshot
  >
}

describe('Studio 执行事件契约 fixture', () => {
  beforeEach(() => {
    useExecutionStore.getState().actions.reset()
  })

  it('Studio 事件名常量表与契约层取值集合完全一致', () => {
    expect(Object.values(ExecutionEventName).sort()).toEqual(
      [...EXECUTION_EVENT_NAMES].sort(),
    )
  })

  it('事件信封 fixture 通过契约解析，并能作为 Studio 事件类型消费', () => {
    const parsed = parseExecutionEvent(
      readFixture('fixtures/execution-event-envelope.json'),
    )

    expect(parsed.event).toBe(ExecutionEventName.EXECUTION_STATUS_CHANGED)
    expect(parsed.eventId).toBe(7)
    expect(parsed.tenantId).toBe('0195c3a1-4b7d-7e22-8a15-6c3b9f2e4d88')

    // 解析结果直接喂给真实 store 入口 —— 类型与运行时同时验证
    const event = parsed as unknown as ExecutionEvent<ExecutionStatusChangedPayload>
    useExecutionStore.getState().actions.updateExecutionStatus(event)

    const state = useExecutionStore.getState()
    expect(state.status).toBe('running')
    expect(state.completedSteps).toBe(2)
    expect(state.totalSteps).toBe(5)
    expect(state.recentEvents.at(-1)?.eventId).toBe(7)
  })

  it('回放快照 fixture 通过契约解析，并能初始化 Studio store', () => {
    const snapshot = ExecutionStateSnapshotSchema.parse(
      readFixture('fixtures/execution-state-snapshot.json'),
    )

    useExecutionStore
      .getState()
      .actions.initFromSnapshot(
        snapshot as unknown as ExecutionStateSnapshot,
      )

    const state = useExecutionStore.getState()
    expect(state.status).toBe('running')
    expect(state.totalSteps).toBe(3)
    expect(Object.keys(state.nodes)).toHaveLength(3)

    const failed = Object.values(state.nodes).find(
      (node) => node.status === 'failed',
    )
    expect(failed?.errorMessage).toBe('端口类型不兼容')
    expect(failed?.errorDetail?.typeMismatch?.sourceType).toBe('text')
  })

  it('节点状态载荷 fixture 能驱动 Studio 的节点状态更新', () => {
    const payload = readFixture<Record<string, unknown>>(
      'fixtures/execution-events/node-status-changed.json',
    )
    const envelope = parseExecutionEvent({
      eventId: 2,
      event: ExecutionEventName.STEP_STATUS_CHANGED,
      timestamp: '2026-03-24T09:15:42.318Z',
      executionId: '0195c3a1-8f2e-7c41-9b3d-2e6f4a7c9d01',
      tenantId: '0195c3a1-4b7d-7e22-8a15-6c3b9f2e4d88',
      data: payload,
    })

    useExecutionStore
      .getState()
      .actions.updateNodeStatus(
        envelope as unknown as ExecutionEvent<StepStatusChangedPayload>,
      )

    const node = useExecutionStore.getState().nodes['agent-main']
    expect(node?.status).toBe('running')
    expect(node?.stepId).toBe('0195c3a1-9a01-7f10-b2c4-118d5e7a3b22')
  })

  it('输出分片载荷 fixture 能驱动 Studio 的输出追加', () => {
    const statusPayload = readFixture<Record<string, unknown>>(
      'fixtures/execution-events/node-status-changed.json',
    )
    useExecutionStore.getState().actions.updateNodeStatus(
      parseExecutionEvent({
        eventId: 1,
        event: ExecutionEventName.STEP_STATUS_CHANGED,
        timestamp: '2026-03-24T09:15:42.318Z',
        executionId: '0195c3a1-8f2e-7c41-9b3d-2e6f4a7c9d01',
        tenantId: '0195c3a1-4b7d-7e22-8a15-6c3b9f2e4d88',
        data: statusPayload,
      }) as unknown as ExecutionEvent<StepStatusChangedPayload>,
    )

    const chunkPayload = readFixture<Record<string, unknown>>(
      'fixtures/execution-events/node-output-chunk.json',
    )
    useExecutionStore.getState().actions.appendNodeOutput(
      parseExecutionEvent({
        eventId: 5,
        event: ExecutionEventName.OUTPUT_CHUNK,
        timestamp: '2026-03-24T09:15:42.318Z',
        executionId: '0195c3a1-8f2e-7c41-9b3d-2e6f4a7c9d01',
        tenantId: '0195c3a1-4b7d-7e22-8a15-6c3b9f2e4d88',
        data: chunkPayload,
      }) as unknown as ExecutionEvent<OutputChunkPayload>,
    )

    expect(useExecutionStore.getState().nodes['agent-main']?.output).toContain(
      '第一段输出',
    )
  })

  it('每个事件名都有一个 payload fixture 且通过契约校验', () => {
    const files: Record<ExecutionEventNameValue, string> = {
      [ExecutionEventName.EXECUTION_STATUS_CHANGED]:
        'execution-status-changed.json',
      [ExecutionEventName.STEP_STATUS_CHANGED]: 'node-status-changed.json',
      [ExecutionEventName.STEP_AGENT_EVENT]: 'node-agent-event.json',
      [ExecutionEventName.STEP_RETRYING]: 'node-retrying.json',
      [ExecutionEventName.OUTPUT_CHUNK]: 'node-output-chunk.json',
      [ExecutionEventName.NODE_INTERVENTION_REQUIRED]:
        'node-intervention-required.json',
      [ExecutionEventName.NODE_INTERVENTION_RESOLVED]:
        'node-intervention-resolved.json',
      [ExecutionEventName.NODE_TOOL_CALL_STATUS]: 'node-tool-call-status.json',
      [ExecutionEventName.NODE_TOOL_PERMISSION_REQUIRED]:
        'node-tool-permission-required.json',
      [ExecutionEventName.NODE_TOOL_PERMISSION_RESOLVED]:
        'node-tool-permission-resolved.json',
    }

    for (const [eventName, file] of Object.entries(files)) {
      const payload = readFixture<Record<string, unknown>>(
        `fixtures/execution-events/${file}`,
      )

      expect(() =>
        parseExecutionEvent({
          eventId: 1,
          event: eventName,
          timestamp: '2026-03-24T09:15:42.318Z',
          executionId: '0195c3a1-8f2e-7c41-9b3d-2e6f4a7c9d01',
          tenantId: '0195c3a1-4b7d-7e22-8a15-6c3b9f2e4d88',
          data: payload,
        }),
      ).not.toThrow()
    }
  })
})
